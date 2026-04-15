import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";

// jsdom doesn't provide ResizeObserver — stub it
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// ── Mock xterm.js ────────────────────────────────────────────────────

const mockScrollToBottom = vi.fn();
const mockDispose = vi.fn();
const mockOpen = vi.fn();
const mockWrite = vi.fn((_data: string, cb?: () => void) => {
  if (cb) cb();
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOnScroll = vi.fn((_cb: any) => ({ dispose: vi.fn() }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockOnData = vi.fn((_cb: any) => ({ dispose: vi.fn() }));
const mockLoadAddon = vi.fn();
const mockAttachCustomKeyEventHandler = vi.fn();

let terminalOptions: Record<string, unknown> = {};
const mockBuffer = {
  active: {
    viewportY: 0,
    baseY: 0,
  },
};

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation((opts: Record<string, unknown>) => {
    terminalOptions = opts;
    return {
      open: mockOpen,
      write: mockWrite,
      dispose: mockDispose,
      scrollToBottom: mockScrollToBottom,
      onScroll: mockOnScroll,
      onData: mockOnData,
      loadAddon: mockLoadAddon,
      attachCustomKeyEventHandler: mockAttachCustomKeyEventHandler,
      cols: 80,
      rows: 24,
      element: document.createElement("div"),
      buffer: mockBuffer,
    };
  }),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
  })),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

// ── Import after mocks ──────────────────────────────────────────────

import { SessionTerminal } from "./SessionTerminal";

// ── Tests ────────────────────────────────────────────────────────────

describe("SessionTerminal", () => {
  let listenCallback: ((event: { payload: { id: string; data: string } }) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    listenCallback = null;
    terminalOptions = {};
    mockAttachCustomKeyEventHandler.mockReset();
    mockBuffer.active.viewportY = 0;
    mockBuffer.active.baseY = 0;

    // Capture the listen callback for session-output events
    vi.mocked(listen).mockImplementation(
      (_eventName, cb) => {
        listenCallback = cb as typeof listenCallback;
        return Promise.resolve(() => {}) as ReturnType<typeof listen>;
      },
    );
  });

  it("renders terminal container with overflow:hidden to prevent scroll conflicts", () => {
    const { container } = render(<SessionTerminal sessionId="sess-1" />);
    const terminalDiv = container.firstElementChild as HTMLDivElement;

    expect(terminalDiv).toBeTruthy();
    expect(terminalDiv.style.overflow).toBe("hidden");
  });

  it("configures explicit scrollback buffer", () => {
    render(<SessionTerminal sessionId="sess-1" />);

    expect(terminalOptions).toHaveProperty("scrollback");
    expect(terminalOptions.scrollback).toBeGreaterThanOrEqual(1000);
  });

  it("auto-scrolls to bottom on new output when viewport is at bottom", () => {
    render(<SessionTerminal sessionId="sess-1" />);

    expect(listenCallback).toBeTruthy();

    // Simulate output arriving
    act(() => {
      listenCallback!({ payload: { id: "sess-1", data: "hello world" } });
    });

    expect(mockWrite).toHaveBeenCalledWith("hello world", expect.any(Function));
    expect(mockScrollToBottom).toHaveBeenCalled();
  });

  it("does NOT auto-scroll when user has manually scrolled up", async () => {
    vi.useFakeTimers();
    render(<SessionTerminal sessionId="sess-1" />);

    // Advance past the 150ms scroll-track activation delay
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();

    // Capture the onScroll handler (registered after the delay)
    expect(mockOnScroll).toHaveBeenCalled();
    const scrollHandler = mockOnScroll.mock.calls[0]![0] as () => void;
    expect(scrollHandler).toBeTruthy();

    // Simulate: terminal has scrollback (baseY > 0) and user scrolled up (viewportY < baseY)
    // The mock terminal's buffer is shared — mutate it directly
    mockBuffer.active.baseY = 100;
    mockBuffer.active.viewportY = 50; // user scrolled up

    // Trigger the scroll event
    act(() => {
      scrollHandler();
    });

    // Reset mock to only track subsequent calls
    mockScrollToBottom.mockClear();

    // Now simulate new output
    act(() => {
      listenCallback!({ payload: { id: "sess-1", data: "new output" } });
    });

    // Should NOT auto-scroll because user scrolled up
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it("ignores output events for different session IDs", () => {
    render(<SessionTerminal sessionId="sess-1" />);

    act(() => {
      listenCallback!({ payload: { id: "sess-OTHER", data: "not mine" } });
    });

    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("cleans up terminal and listeners on unmount", () => {
    const { unmount } = render(<SessionTerminal sessionId="sess-1" />);

    unmount();

    expect(mockDispose).toHaveBeenCalled();
  });
});
