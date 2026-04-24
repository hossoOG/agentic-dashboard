import { useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { wrapInvoke, markRender } from "../../utils/perfLogger";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { logError } from "../../utils/errorLogger";
import "@xterm/xterm/css/xterm.css";

interface SessionTerminalProps {
  sessionId: string;
}

/** Threshold (in rows) to consider the viewport "at the bottom" */
const SCROLL_BOTTOM_THRESHOLD = 1;

/**
 * Debounce helper — returns a debounced version of `fn`.
 * The returned function also exposes `.cancel()` for cleanup.
 */
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

export function SessionTerminal({ sessionId }: SessionTerminalProps) {
  const renderDone = markRender("SessionTerminal");
  useEffect(() => {
    renderDone.done();
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  /** Tracks whether the user has manually scrolled away from the bottom */
  const userScrolledUpRef = useRef(false);

  /**
   * Check if the terminal viewport is at (or near) the bottom of the scrollback buffer.
   */
  const isAtBottom = useCallback((term: Terminal): boolean => {
    const viewportRow = term.buffer.active.viewportY;
    const baseY = term.buffer.active.baseY;
    return baseY - viewportRow <= SCROLL_BOTTOM_THRESHOLD;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      scrollback: 5000,
      // Normalize bare LF (often emitted by Node child processes under PowerShell)
      // to CRLF so xterm renders lines correctly.
      convertEol: true,
      // Decouple xterm's built-in "scroll on keystroke" from our own logic:
      // we track userScrolledUpRef manually and trigger scrollToBottom in onData
      // only when the user is NOT actively reading scrollback. Leaving the default
      // (true) causes xterm to scroll on every keystroke and fights our own tracking.
      scrollOnUserInput: false,
      // Tell xterm it's attached to a ConPTY backend on Windows. This enables the
      // correct line-wrap / reflow heuristics for ConPTY output (xtermjs/xterm.js#2666).
      // buildNumber 19041 = Windows 10 20H1 baseline; >= 21376 would unlock reflow,
      // but Claude-Code's output does not rely on it and we stay conservative.
      windowsPty: { backend: "conpty", buildNumber: 19041 },
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#00ff88",
        selectionBackground: "#264f78",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    // Initial fit nur wenn Container sichtbar ist (offsetWidth/Height > 0).
    // Bei Always-Mounted-Strategie startet ein inaktives Terminal mit display:none,
    // dann liefert fit() NaN-Dimensions. ResizeObserver triggert fit() beim Unhide.
    if (containerRef.current.offsetWidth > 0 && containerRef.current.offsetHeight > 0) {
      fitAddon.fit();
    }
    terminalRef.current = term;

    // Clipboard: Ctrl+C copies selection (if any), otherwise sends SIGINT.
    // Ctrl+V is intentionally NOT handled here — xterm's native paste handler
    // fires on DOM `paste` events independently of this keydown handler.
    // Adding a custom Ctrl+V handler would cause double-paste (both paths call
    // write_session). The native handler is sufficient for paste.
    term.attachCustomKeyEventHandler((event: KeyboardEvent): boolean => {
      if (event.type !== "keydown") return true;
      if (event.ctrlKey && event.key === "c") {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch((err) =>
            logError("SessionTerminal.clipboardCopy", err),
          );
          return false; // Consumed — do NOT forward to PTY
        }
        // No selection → allow normal Ctrl+C (SIGINT) to pass through
        return true;
      }
      return true;
    });

    // Scroll tracking: delay activation so the initial fitAddon.fit() resize event
    // doesn't falsely set userScrolledUpRef=true (which would break auto-scroll).
    let scrollDisposable: { dispose: () => void } = { dispose: () => {} };
    const scrollTrackTimer = setTimeout(() => {
      // Only reset to "at bottom" if the user hasn't already scrolled up during
      // the delay window — blindly resetting would kick them back into auto-scroll.
      if (isAtBottom(term)) {
        userScrolledUpRef.current = false;
      }
      scrollDisposable = term.onScroll(() => {
        userScrolledUpRef.current = !isAtBottom(term);
      });
    }, 150);

    // Input: User types -> send to backend
    term.onData((data: string) => {
      wrapInvoke("write_session", { id: sessionId, data }).catch((err) => {
        logError("SessionTerminal.writeSession", err);
      });
      // Manual auto-scroll on user input: because we set scrollOnUserInput=false
      // above, xterm no longer jumps to the bottom on keystrokes. We replicate that
      // behaviour here, but gated on userScrolledUpRef so the user can read
      // scrollback while typing without being yanked back to the prompt.
      if (!userScrolledUpRef.current) {
        term.scrollToBottom();
      }
    });

    // Output: Backend PTY output -> xterm
    const unlistenPromise = listen<{ id: string; data: string }>(
      "session-output",
      (event) => {
        if (
          event?.payload?.id === sessionId &&
          typeof event?.payload?.data === "string"
        ) {
          term.write(event.payload.data, () => {
            // After write completes: auto-scroll to bottom unless user scrolled up
            if (!userScrolledUpRef.current) {
              term.scrollToBottom();
            }
          });
        }
      },
    );

    // Fit-Guard: Wenn Container 0x0 ist (z.B. display:none beim Initial-Mount
    // durch Always-Mounted-Strategie in SessionManagerView), skippe fit().
    // Der ResizeObserver triggert fit() automatisch sobald der Container sichtbar wird
    // und echte Dimensions bekommt.
    const runFit = () => {
      const el = containerRef.current;
      if (!term.element) return;
      if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return;
      fitAddon.fit();
      wrapInvoke("resize_session", {
        id: sessionId,
        cols: term.cols,
        rows: term.rows,
      }).catch((err) => logError("SessionTerminal.resize", err));
    };

    // Debounced fit — prevents layout thrashing during rapid resizes
    const debouncedFit = debounce(() => {
      runFit();
    }, 100);

    // Resize observer with debounced fit
    const resizeObserver = new ResizeObserver(() => {
      debouncedFit();
    });
    resizeObserver.observe(containerRef.current);

    // Report initial size (slightly delayed so the DOM has settled)
    const initialTimer = setTimeout(() => {
      document.fonts.ready.then(() => {
        runFit();
      });
    }, 50);

    return () => {
      clearTimeout(initialTimer);
      clearTimeout(scrollTrackTimer);
      debouncedFit.cancel();
      unlistenPromise
        .then((unlisten) => {
          try { unlisten(); }
          catch (e) { logError("SessionTerminal.cleanup.unlisten", e); }
        })
        .catch((e) => logError("SessionTerminal.cleanup.unlistenPromise", e));
      scrollDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
    };
  }, [sessionId, isAtBottom]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ padding: "4px", backgroundColor: "#0d1117", overflow: "hidden" }}
    />
  );
}
