import { useEffect, useRef } from "react";
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

export function SessionTerminal({ sessionId }: SessionTerminalProps) {
  const renderDone = markRender("SessionTerminal");
  useEffect(() => { renderDone.done(); });

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
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
    fitAddon.fit();
    terminalRef.current = term;

    // Input: User types -> send to backend
    term.onData((data: string) => {
      wrapInvoke("write_session", { id: sessionId, data }).catch((err) => {
        logError("SessionTerminal.writeSession", err);
      });
    });

    // Output: Backend PTY output -> xterm
    const unlistenPromise = listen<{ id: string; data: string }>(
      "session-output",
      (event) => {
        if (event?.payload?.id === sessionId && typeof event?.payload?.data === "string") {
          term.write(event.payload.data);
        }
      }
    );

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      wrapInvoke("resize_session", { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
    });
    resizeObserver.observe(containerRef.current);

    // Report initial size
    setTimeout(() => {
      fitAddon.fit();
      wrapInvoke("resize_session", { id: sessionId, cols: term.cols, rows: term.rows }).catch(() => {});
    }, 50);

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
    };
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ padding: "4px", backgroundColor: "#0d1117" }}
    />
  );
}
