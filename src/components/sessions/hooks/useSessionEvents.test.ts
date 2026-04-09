import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { useSessionEvents } from "./useSessionEvents";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockUpdateLastOutput = vi.fn();
const mockSetExitCode = vi.fn();
const mockUpdateStatus = vi.fn();

vi.mock("../../../store/sessionStore", () => ({
  useSessionStore: {
    getState: () => ({
      updateLastOutput: mockUpdateLastOutput,
      setExitCode: mockSetExitCode,
      updateStatus: mockUpdateStatus,
    }),
  },
}));

vi.mock("../../../utils/perfLogger", () => ({
  createEventTracker: () => vi.fn(),
}));

vi.mock("../../../utils/errorLogger", () => ({
  logError: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────

type ListenCallback = (event: { payload: Record<string, unknown> }) => void;

/** Capture the callback registered for a given event name */
function getListenCallback(eventName: string): ListenCallback {
  const calls = (listen as Mock).mock.calls;
  const call = calls.find(
    (c: unknown[]) => c[0] === eventName,
  );
  if (!call) throw new Error(`No listener for event "${eventName}"`);
  return call[1] as ListenCallback;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("useSessionEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("registers 3 core event listeners on mount", () => {
    renderHook(() => useSessionEvents());

    const expectedEvents = [
      "session-output",
      "session-exit",
      "session-status",
    ];

    for (const event of expectedEvents) {
      expect(listen).toHaveBeenCalledWith(event, expect.any(Function));
    }

    // Agent events should NOT be registered
    expect(listen).not.toHaveBeenCalledWith("agent-detected", expect.any(Function));
    expect(listen).not.toHaveBeenCalledWith("agent-completed", expect.any(Function));
  });

  it("calls cleanup functions on unmount", async () => {
    const mockUnlisten = vi.fn();
    (listen as Mock).mockResolvedValue(mockUnlisten);

    const { unmount } = renderHook(() => useSessionEvents());
    unmount();

    // Allow promises to resolve
    await vi.runAllTimersAsync();
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("session-output: debounces and updates lastOutput", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("session-output");

    cb({ payload: { id: "s1", data: "hello world" } });

    // Not called immediately (debounced)
    expect(mockUpdateLastOutput).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(mockUpdateLastOutput).toHaveBeenCalledWith(
      "s1",
      "hello world",
    );
  });

  it("session-output: ignores invalid payload", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("session-output");

    cb({ payload: { id: 123, data: null } as unknown as Record<string, unknown> });

    vi.advanceTimersByTime(300);
    expect(mockUpdateLastOutput).not.toHaveBeenCalled();
  });

  it("session-exit: sets exit code", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("session-exit");

    cb({ payload: { id: "s1", exit_code: 0 } });
    expect(mockSetExitCode).toHaveBeenCalledWith("s1", 0);
  });

  it("session-status: updates valid status", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("session-status");

    cb({ payload: { id: "s1", status: "running" } });
    expect(mockUpdateStatus).toHaveBeenCalledWith("s1", "running");
  });

  it("session-status: ignores invalid status", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("session-status");

    cb({ payload: { id: "s1", status: "unknown-status" } });
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });
});
