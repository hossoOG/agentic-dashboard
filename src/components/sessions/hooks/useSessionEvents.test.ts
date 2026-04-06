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
const mockAddAgent = vi.fn();
const mockUpdateAgentStatus = vi.fn();
const mockUpdateAgentDetails = vi.fn();
const mockSetTaskSummary = vi.fn();
const mockAddWorktree = vi.fn();

vi.mock("../../../store/sessionStore", () => ({
  useSessionStore: {
    getState: () => ({
      updateLastOutput: mockUpdateLastOutput,
      setExitCode: mockSetExitCode,
      updateStatus: mockUpdateStatus,
    }),
  },
}));

vi.mock("../../../store/agentStore", () => ({
  useAgentStore: {
    getState: () => ({
      addAgent: mockAddAgent,
      updateAgentStatus: mockUpdateAgentStatus,
      updateAgentDetails: mockUpdateAgentDetails,
      setTaskSummary: mockSetTaskSummary,
      addWorktree: mockAddWorktree,
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

  it("registers 8 event listeners on mount", () => {
    renderHook(() => useSessionEvents());

    const expectedEvents = [
      "session-output",
      "session-exit",
      "session-status",
      "agent-detected",
      "agent-completed",
      "agent-status-update",
      "task-summary",
      "worktree-detected",
    ];

    for (const event of expectedEvents) {
      expect(listen).toHaveBeenCalledWith(event, expect.any(Function));
    }
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

  it("agent-detected: adds agent to store", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("agent-detected");

    cb({
      payload: {
        session_id: "s1",
        agent_id: "a1",
        name: "architect",
        task: "analyze",
        task_number: 1,
        phase_number: 2,
        parent_agent_id: null,
        depth: 0,
        detected_at: 1000,
      },
    });

    expect(mockAddAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "a1",
        sessionId: "s1",
        name: "architect",
        task: "analyze",
        status: "running",
      }),
    );
  });

  it("agent-completed: updates agent status", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("agent-completed");

    cb({
      payload: {
        session_id: "s1",
        agent_id: "a1",
        status: "completed",
        completed_at: 2000,
      },
    });

    expect(mockUpdateAgentStatus).toHaveBeenCalledWith(
      "a1",
      "completed",
      2000,
    );
  });

  it("agent-status-update: updates agent details", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("agent-status-update");

    cb({
      payload: {
        session_id: "s1",
        agent_id: "a1",
        status: "running",
        duration_str: "5m 30s",
        token_count: "1200",
        blocked_by: null,
      },
    });

    expect(mockUpdateAgentDetails).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        status: "running",
        durationStr: "5m 30s",
        tokenCount: "1200",
      }),
    );
  });

  it("task-summary: updates summary counts", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("task-summary");

    cb({
      payload: { session_id: "s1", pending_count: 3, completed_count: 7 },
    });

    expect(mockSetTaskSummary).toHaveBeenCalledWith(3, 7);
  });

  it("worktree-detected: adds worktree to store", () => {
    renderHook(() => useSessionEvents());
    const cb = getListenCallback("worktree-detected");

    cb({
      payload: {
        session_id: "s1",
        path: "/tmp/worktree",
        branch: "feat/test",
        agent_id: "a1",
      },
    });

    expect(mockAddWorktree).toHaveBeenCalledWith({
      path: "/tmp/worktree",
      branch: "feat/test",
      agentId: "a1",
      sessionId: "s1",
      active: true,
    });
  });
});
