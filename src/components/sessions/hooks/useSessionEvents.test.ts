import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSessionEvents } from "./useSessionEvents";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockUpdateLastOutput = vi.fn();
const mockSetExitCode = vi.fn();
const mockUpdateStatus = vi.fn();
const mockSetClaudeSessionId = vi.fn();

// Mutable so individual tests can inject their own sessions array
let mockSessionsData: Array<{
  id: string;
  createdAt: number;
  claudeSessionId?: string;
  folder: string;
  title: string;
}> = [];

vi.mock("../../../store/sessionStore", () => ({
  useSessionStore: {
    getState: () => ({
      sessions: mockSessionsData,
      updateLastOutput: mockUpdateLastOutput,
      setExitCode: mockSetExitCode,
      updateStatus: mockUpdateStatus,
      setClaudeSessionId: mockSetClaudeSessionId,
    }),
  },
}));

const mockSetSessionTitleOverride = vi.fn();
let mockSessionTitleOverridesData: Record<string, string> = {};

vi.mock("../../../store/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      sessionTitleOverrides: mockSessionTitleOverridesData,
      setSessionTitleOverride: mockSetSessionTitleOverride,
    }),
  },
}));

vi.mock("../../../utils/perfLogger", () => ({
  createEventTracker: () => vi.fn(),
}));

vi.mock("../../../utils/errorLogger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
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
    mockSessionsData = [];
    mockSessionTitleOverridesData = {};
  });

  afterEach(() => {
    vi.useRealTimers();
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

  // ── Discovery Tests (Issue #176) ────────────────────────────────────

  describe("claudeSessionId discovery", () => {
    it("happy path: assigns claudeSessionId when timestamp matches session creation time", async () => {
      const createdAt = 100_000;
      mockSessionsData = [
        { id: "tab-1", createdAt, folder: "C:/foo", title: "My Session" },
      ];
      (invoke as Mock).mockResolvedValue([
        { session_id: "SID-NEW", started_at: new Date(createdAt).toISOString() },
      ]);

      renderHook(() => useSessionEvents());
      const cb = getListenCallback("session-status");

      cb({ payload: { id: "tab-1", status: "running" } });
      await vi.advanceTimersByTimeAsync(3_000);

      expect(mockSetClaudeSessionId).toHaveBeenCalledWith("tab-1", "SID-NEW");
      // Title override written because none existed yet
      expect(mockSetSessionTitleOverride).toHaveBeenCalledWith("SID-NEW", "My Session");
    });

    it("old entry: does not assign when only history entries from before session creation exist", async () => {
      const createdAt = 100_000;
      mockSessionsData = [
        { id: "tab-1", createdAt, folder: "C:/foo", title: "New Session" },
      ];
      // Only an old entry — started 60s before session was created, far outside 10s tolerance
      (invoke as Mock).mockResolvedValue([
        { session_id: "SID-OLD", started_at: new Date(createdAt - 60_000).toISOString() },
      ]);

      renderHook(() => useSessionEvents());
      const cb = getListenCallback("session-status");

      cb({ payload: { id: "tab-1", status: "running" } });
      await vi.advanceTimersByTimeAsync(3_000); // attempt 1 — no match

      expect(mockSetClaudeSessionId).not.toHaveBeenCalled();

      // A retry should be scheduled — advancing timer triggers attempt 2
      await vi.advanceTimersByTimeAsync(3_000);
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(mockSetClaudeSessionId).not.toHaveBeenCalled();
    });

    it("claim conflict: does not assign an ID already claimed by another tab's discovery", async () => {
      const now = 100_000;
      mockSessionsData = [
        { id: "tab-a", createdAt: now - 5_000, folder: "C:/foo", title: "Old Session" },
        { id: "tab-b", createdAt: now, folder: "C:/foo", title: "New Session" },
      ];
      // Only SID-A exists in history — within tolerance for both tabs
      (invoke as Mock).mockResolvedValue([
        { session_id: "SID-A", started_at: new Date(now - 5_000).toISOString() },
      ]);

      renderHook(() => useSessionEvents());
      const cb = getListenCallback("session-status");

      // Tab A discovers SID-A first → claimedIds.add("SID-A")
      cb({ payload: { id: "tab-a", status: "running" } });
      await vi.advanceTimersByTimeAsync(3_000);
      expect(mockSetClaudeSessionId).toHaveBeenCalledWith("tab-a", "SID-A");

      // Tab B fires — SID-A is the only entry but it's now claimed
      cb({ payload: { id: "tab-b", status: "running" } });
      await vi.advanceTimersByTimeAsync(3_000);

      // Only 1 setClaudeSessionId call total — tab-b was blocked by claim check
      expect(mockSetClaudeSessionId).toHaveBeenCalledTimes(1);
    });

    it("override existence check: does not overwrite an existing user-set title override", async () => {
      const createdAt = 100_000;
      mockSessionsData = [
        { id: "tab-1", createdAt, folder: "C:/foo", title: "Default Title" },
      ];
      // Pre-existing user override for this claudeSessionId
      mockSessionTitleOverridesData = { "SID-NEW": "Mein Custom Name" };
      (invoke as Mock).mockResolvedValue([
        { session_id: "SID-NEW", started_at: new Date(createdAt).toISOString() },
      ]);

      renderHook(() => useSessionEvents());
      const cb = getListenCallback("session-status");

      cb({ payload: { id: "tab-1", status: "running" } });
      await vi.advanceTimersByTimeAsync(3_000);

      // ID is assigned correctly
      expect(mockSetClaudeSessionId).toHaveBeenCalledWith("tab-1", "SID-NEW");
      // But override is NOT overwritten — existing user title is preserved
      expect(mockSetSessionTitleOverride).not.toHaveBeenCalled();
    });

    it("claim conflict (concurrent): both tabs fire running simultaneously, only one gets the ID", async () => {
      const now = 100_000;
      mockSessionsData = [
        { id: "tab-a", createdAt: now - 5_000, folder: "C:/foo", title: "Old Session" },
        { id: "tab-b", createdAt: now, folder: "C:/foo", title: "New Session" },
      ];
      // SID-A is the only entry — within tolerance for both tabs
      (invoke as Mock).mockResolvedValue([
        { session_id: "SID-A", started_at: new Date(now - 5_000).toISOString() },
      ]);

      renderHook(() => useSessionEvents());
      const cb = getListenCallback("session-status");

      // Both tabs fire "running" before either discovery completes (concurrent scenario)
      cb({ payload: { id: "tab-a", status: "running" } });
      cb({ payload: { id: "tab-b", status: "running" } });

      // Both discovery timers fire at t=3000ms; microtasks execute sequentially
      // tab-a's continuation runs first: claimedIds.add("SID-A"), setClaudeSessionId("tab-a")
      // tab-b's continuation runs next: claimedIds.has("SID-A") = true → no match
      await vi.advanceTimersByTimeAsync(3_000);

      // Only one assignment — whichever tab ran first gets SID-A, the other is blocked
      expect(mockSetClaudeSessionId).toHaveBeenCalledTimes(1);
    });

    it("retry: retries discovery on each failed attempt and succeeds on a later attempt", async () => {
      const createdAt = 100_000;
      mockSessionsData = [
        { id: "tab-1", createdAt, folder: "C:/foo", title: "My Session" },
      ];
      (invoke as Mock)
        .mockResolvedValueOnce([]) // attempt 1: session file not yet created
        .mockResolvedValueOnce([]) // attempt 2: still empty
        .mockResolvedValue([       // attempt 3+: file exists now
          { session_id: "SID-NEW", started_at: new Date(createdAt).toISOString() },
        ]);

      renderHook(() => useSessionEvents());
      const cb = getListenCallback("session-status");

      cb({ payload: { id: "tab-1", status: "running" } });

      await vi.advanceTimersByTimeAsync(3_000); // attempt 1
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(mockSetClaudeSessionId).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3_000); // attempt 2
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(mockSetClaudeSessionId).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3_000); // attempt 3 — success
      expect(invoke).toHaveBeenCalledTimes(3);
      expect(mockSetClaudeSessionId).toHaveBeenCalledWith("tab-1", "SID-NEW");
    });
  });
});
