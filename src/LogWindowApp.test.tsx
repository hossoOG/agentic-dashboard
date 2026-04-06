import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { useLogViewerStore } from "./store/logViewerStore";

// Capture the listener callback registered via listen()
let capturedListener: ((event: unknown) => void) | null = null;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_eventName: string, cb: (event: unknown) => void) => {
    capturedListener = cb;
    return Promise.resolve(() => {});
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve([])),
}));

vi.mock("./utils/errorLogger", () => ({
  getRecentLogs: vi.fn(() => []),
  subscribeToLogs: vi.fn(() => () => {}),
  logError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedListener = null;
  useLogViewerStore.setState({
    entries: [],
    severityFilter: new Set(["error", "warn", "info"]),
    sourceFilter: new Set(["frontend", "backend", "pipeline"]),
    searchText: "",
    liveTail: true,
  });
});

describe("LogWindowApp", () => {
  it("renders without crash", async () => {
    // Dynamic import after mocks are set up
    const { default: LogWindowApp } = await import("./LogWindowApp");
    render(<LogWindowApp />);
    // Should show loading or the log viewer
    expect(document.querySelector(".h-screen")).toBeInTheDocument();
  });

  it("handles pipeline-log events with { line, stream } payload", async () => {
    await import("./LogWindowApp");
    const { render: renderComp } = await import("@testing-library/react");
    const { default: LogWindowApp } = await import("./LogWindowApp");

    renderComp(<LogWindowApp />);

    // Wait for listen to be registered
    await vi.waitFor(() => expect(capturedListener).not.toBeNull());

    // Simulate pipeline-log event with correct payload shape
    capturedListener!({
      payload: { line: "Build completed successfully", stream: "stdout" },
    });

    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("Build completed successfully");
    expect(entries[0].severity).toBe("info");
    expect(entries[0].source).toBe("pipeline");
  });

  it("handles stderr stream as warn severity", async () => {
    const { default: LogWindowApp } = await import("./LogWindowApp");
    render(<LogWindowApp />);

    await vi.waitFor(() => expect(capturedListener).not.toBeNull());

    capturedListener!({
      payload: { line: "Warning: deprecated API", stream: "stderr" },
    });

    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].severity).toBe("warn");
  });

  it("ignores events with invalid payload", async () => {
    const { default: LogWindowApp } = await import("./LogWindowApp");
    render(<LogWindowApp />);

    await vi.waitFor(() => expect(capturedListener).not.toBeNull());

    // Missing line field
    capturedListener!({ payload: { stream: "stdout" } });

    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(0);
  });
});
