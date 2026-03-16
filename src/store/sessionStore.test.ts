import { describe, it, expect, beforeEach } from "vitest";
import {
  useSessionStore,
  selectActiveSession,
  selectSessionCounts,
  type SessionState,
  type SessionShell,
  type SessionStatus,
} from "./sessionStore";

// ============================================================================
// Helpers
// ============================================================================

function getState(): SessionState {
  return useSessionStore.getState();
}

function addTestSession(overrides?: {
  id?: string;
  title?: string;
  folder?: string;
  shell?: SessionShell;
}) {
  getState().addSession({
    id: overrides?.id ?? `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: overrides?.title ?? "Test Session",
    folder: overrides?.folder ?? "C:/projects/test",
    shell: overrides?.shell ?? "powershell",
  });
}

// ============================================================================
// Reset
// ============================================================================

beforeEach(() => {
  // Zustand does not have a reset() — manually set back to initial state
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    layoutMode: "single",
    gridSessionIds: [],
    focusedGridSessionId: null,
  });
});

// ============================================================================
// Initial State
// ============================================================================

describe("initial state", () => {
  it("starts with empty sessions array", () => {
    expect(getState().sessions).toEqual([]);
  });

  it("starts with activeSessionId null", () => {
    expect(getState().activeSessionId).toBeNull();
  });
});

// ============================================================================
// addSession
// ============================================================================

describe("addSession", () => {
  it("adds a session with correct defaults", () => {
    addTestSession({ id: "s1", title: "My Session", folder: "C:/work" });
    const sessions = getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("s1");
    expect(sessions[0].title).toBe("My Session");
    expect(sessions[0].folder).toBe("C:/work");
    expect(sessions[0].shell).toBe("powershell");
    expect(sessions[0].status).toBe("starting");
    expect(sessions[0].exitCode).toBeNull();
    expect(sessions[0].finishedAt).toBeNull();
    expect(sessions[0].lastOutputSnippet).toBe("");
  });

  it("sets new session as activeSessionId", () => {
    addTestSession({ id: "s1" });
    expect(getState().activeSessionId).toBe("s1");
  });

  it("overwrites activeSessionId when adding second session", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    expect(getState().activeSessionId).toBe("s2");
    expect(getState().sessions).toHaveLength(2);
  });

  it("enforces MAX_SESSIONS=8 limit", () => {
    for (let i = 0; i < 10; i++) {
      addTestSession({ id: `s${i}` });
    }
    expect(getState().sessions).toHaveLength(8);
  });

  it("returns original state when MAX_SESSIONS reached (no partial mutation)", () => {
    for (let i = 0; i < 8; i++) {
      addTestSession({ id: `s${i}` });
    }
    addTestSession({ id: "s-overflow" });
    const stateAfter = getState();
    // activeSessionId should remain from last successful add
    expect(stateAfter.activeSessionId).toBe("s7");
    expect(stateAfter.sessions).toHaveLength(8);
    // Should not contain overflow session
    expect(stateAfter.sessions.find((s) => s.id === "s-overflow")).toBeUndefined();
  });

  // FIX: Duplicate ID prevention — adding same ID twice is silently ignored
  it("rejects duplicate session IDs", () => {
    addTestSession({ id: "dupe" });
    addTestSession({ id: "dupe" });
    const dupes = getState().sessions.filter((s) => s.id === "dupe");
    expect(dupes).toHaveLength(1);
  });

  it("sets createdAt and lastOutputAt to approximately now", () => {
    const before = Date.now();
    addTestSession({ id: "s1" });
    const after = Date.now();
    const s = getState().sessions[0];
    expect(s.createdAt).toBeGreaterThanOrEqual(before);
    expect(s.createdAt).toBeLessThanOrEqual(after);
    expect(s.lastOutputAt).toBeGreaterThanOrEqual(before);
    expect(s.lastOutputAt).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// removeSession
// ============================================================================

describe("removeSession", () => {
  it("removes the correct session", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().removeSession("s1");
    expect(getState().sessions).toHaveLength(1);
    expect(getState().sessions[0].id).toBe("s2");
  });

  it("selects last remaining session when active session is removed", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    addTestSession({ id: "s3" });
    // s3 is active
    getState().removeSession("s3");
    // Should fallback to last remaining = s2
    expect(getState().activeSessionId).toBe("s2");
  });

  it("sets activeSessionId to null when last session is removed", () => {
    addTestSession({ id: "s1" });
    getState().removeSession("s1");
    expect(getState().activeSessionId).toBeNull();
    expect(getState().sessions).toHaveLength(0);
  });

  it("does not change activeSessionId when non-active session is removed", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    addTestSession({ id: "s3" });
    // s3 is active; remove s1
    getState().setActiveSession("s3");
    getState().removeSession("s1");
    expect(getState().activeSessionId).toBe("s3");
  });

  it("is a no-op when removing non-existent session ID", () => {
    addTestSession({ id: "s1" });
    getState().removeSession("nonexistent");
    expect(getState().sessions).toHaveLength(1);
  });

  // BUG: removeSession does NOT call close_session on the backend.
  // The PTY process keeps running even after frontend removes it.
  it("BUG: removeSession does not notify backend — PTY process leaks", () => {
    addTestSession({ id: "s1" });
    getState().removeSession("s1");
    // Session removed from frontend store, but no Tauri invoke("close_session")
    // is ever called. The Rust SessionManager still holds the PTY handle.
    expect(getState().sessions).toHaveLength(0);
    // This test documents the architectural bug — the store has no
    // side-effect to call the backend.
  });
});

// ============================================================================
// setActiveSession
// ============================================================================

describe("setActiveSession", () => {
  it("sets activeSessionId to given ID", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().setActiveSession("s1");
    expect(getState().activeSessionId).toBe("s1");
  });

  it("allows setting to null", () => {
    addTestSession({ id: "s1" });
    getState().setActiveSession(null);
    expect(getState().activeSessionId).toBeNull();
  });

  // FIX: Validation — setting activeSessionId to a non-existent session is ignored
  it("ignores setActiveSession with non-existent session ID", () => {
    getState().setActiveSession("ghost-id");
    expect(getState().activeSessionId).toBeNull();
  });
});

// ============================================================================
// updateStatus
// ============================================================================

describe("updateStatus", () => {
  it("updates session status", () => {
    addTestSession({ id: "s1" });
    getState().updateStatus("s1", "running");
    expect(getState().sessions[0].status).toBe("running");
  });

  it("sets finishedAt when transitioning to 'done'", () => {
    addTestSession({ id: "s1" });
    const before = Date.now();
    getState().updateStatus("s1", "done");
    const s = getState().sessions[0];
    expect(s.finishedAt).not.toBeNull();
    expect(s.finishedAt!).toBeGreaterThanOrEqual(before);
  });

  it("sets finishedAt when transitioning to 'error'", () => {
    addTestSession({ id: "s1" });
    getState().updateStatus("s1", "error");
    expect(getState().sessions[0].finishedAt).not.toBeNull();
  });

  it("does NOT set finishedAt for 'running' or 'waiting'", () => {
    addTestSession({ id: "s1" });
    getState().updateStatus("s1", "running");
    expect(getState().sessions[0].finishedAt).toBeNull();
    getState().updateStatus("s1", "waiting");
    expect(getState().sessions[0].finishedAt).toBeNull();
  });

  it("is a no-op for non-existent session ID (no crash)", () => {
    addTestSession({ id: "s1" });
    getState().updateStatus("nonexistent", "running");
    expect(getState().sessions[0].status).toBe("starting");
  });

  // FIX: finishedAt is cleared when transitioning back to running/starting/waiting
  it("clears finishedAt after done->running transition", () => {
    addTestSession({ id: "s1" });
    getState().updateStatus("s1", "done");
    expect(getState().sessions[0].finishedAt).not.toBeNull();
    getState().updateStatus("s1", "running");
    expect(getState().sessions[0].finishedAt).toBeNull();
    expect(getState().sessions[0].status).toBe("running");
  });
});

// ============================================================================
// setExitCode
// ============================================================================

describe("setExitCode", () => {
  it("sets exitCode and status to 'done' for exit code 0", () => {
    addTestSession({ id: "s1" });
    getState().setExitCode("s1", 0);
    const s = getState().sessions[0];
    expect(s.exitCode).toBe(0);
    expect(s.status).toBe("done");
    expect(s.finishedAt).not.toBeNull();
  });

  it("sets exitCode and status to 'error' for non-zero exit code", () => {
    addTestSession({ id: "s1" });
    getState().setExitCode("s1", 1);
    const s = getState().sessions[0];
    expect(s.exitCode).toBe(1);
    expect(s.status).toBe("error");
  });

  it("handles negative exit codes (e.g. signal kills)", () => {
    addTestSession({ id: "s1" });
    getState().setExitCode("s1", -1);
    expect(getState().sessions[0].status).toBe("error");
    expect(getState().sessions[0].exitCode).toBe(-1);
  });

  it("is a no-op for non-existent session", () => {
    addTestSession({ id: "s1" });
    getState().setExitCode("nonexistent", 42);
    expect(getState().sessions[0].exitCode).toBeNull();
  });
});

// ============================================================================
// updateLastOutput
// ============================================================================

describe("updateLastOutput", () => {
  it("updates lastOutputSnippet and lastOutputAt", () => {
    addTestSession({ id: "s1" });
    const before = Date.now();
    getState().updateLastOutput("s1", "Hello world");
    const s = getState().sessions[0];
    expect(s.lastOutputSnippet).toBe("Hello world");
    expect(s.lastOutputAt).toBeGreaterThanOrEqual(before);
  });

  it("replaces previous snippet entirely", () => {
    addTestSession({ id: "s1" });
    getState().updateLastOutput("s1", "first");
    getState().updateLastOutput("s1", "second");
    expect(getState().sessions[0].lastOutputSnippet).toBe("second");
  });

  it("handles empty string", () => {
    addTestSession({ id: "s1" });
    getState().updateLastOutput("s1", "something");
    getState().updateLastOutput("s1", "");
    expect(getState().sessions[0].lastOutputSnippet).toBe("");
  });
});

// ============================================================================
// Selectors
// ============================================================================

describe("selectActiveSession", () => {
  it("returns the active session", () => {
    addTestSession({ id: "s1", title: "First" });
    addTestSession({ id: "s2", title: "Second" });
    getState().setActiveSession("s1");
    const active = selectActiveSession(getState());
    expect(active?.id).toBe("s1");
    expect(active?.title).toBe("First");
  });

  it("returns undefined when no active session", () => {
    expect(selectActiveSession(getState())).toBeUndefined();
  });

  it("returns undefined when activeSessionId references removed session", () => {
    addTestSession({ id: "s1" });
    getState().setActiveSession("s1");
    // Directly set state to simulate race condition
    useSessionStore.setState({ sessions: [], activeSessionId: "s1" });
    expect(selectActiveSession(getState())).toBeUndefined();
  });
});

describe("selectSessionCounts", () => {
  it("returns all zeros for empty state", () => {
    const counts = selectSessionCounts(getState());
    expect(counts).toEqual({ active: 0, waiting: 0, done: 0, error: 0, total: 0 });
  });

  it("counts by status correctly", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    addTestSession({ id: "s3" });
    addTestSession({ id: "s4" });
    getState().updateStatus("s1", "running");
    getState().updateStatus("s2", "waiting");
    getState().updateStatus("s3", "done");
    getState().updateStatus("s4", "error");
    const counts = selectSessionCounts(getState());
    expect(counts.active).toBe(1);
    expect(counts.waiting).toBe(1);
    expect(counts.done).toBe(1);
    expect(counts.error).toBe(1);
    expect(counts.total).toBe(4);
  });

  // FIX: "starting" sessions are now counted as "active"
  it("counts 'starting' sessions as active", () => {
    addTestSession({ id: "s1" });
    expect(getState().sessions[0].status).toBe("starting");
    const counts = selectSessionCounts(getState());
    expect(counts.active).toBe(1);
    expect(counts.total).toBe(1);
  });
});

// ============================================================================
// Race Conditions / Rapid Operations
// ============================================================================

describe("rapid operations", () => {
  it("handles rapid add/remove without corruption", () => {
    for (let i = 0; i < 20; i++) {
      addTestSession({ id: `rapid-${i}` });
      if (i > 0 && i % 3 === 0) {
        getState().removeSession(`rapid-${i - 1}`);
      }
    }
    // Should have at most 8 sessions (MAX_SESSIONS)
    expect(getState().sessions.length).toBeLessThanOrEqual(8);
    // No undefined/null entries
    getState().sessions.forEach((s) => {
      expect(s.id).toBeDefined();
      expect(s.status).toBeDefined();
    });
  });

  it("handles rapid status updates on same session", () => {
    addTestSession({ id: "s1" });
    const statuses: SessionStatus[] = [
      "running", "waiting", "running", "waiting", "done", "error",
    ];
    for (const status of statuses) {
      getState().updateStatus("s1", status);
    }
    // Last one wins
    expect(getState().sessions[0].status).toBe("error");
  });
});

// ============================================================================
// setLayoutMode
// ============================================================================

describe("setLayoutMode", () => {
  it("defaults to 'single'", () => {
    expect(getState().layoutMode).toBe("single");
  });

  it("switches to 'grid'", () => {
    getState().setLayoutMode("grid");
    expect(getState().layoutMode).toBe("grid");
  });

  it("auto-fills gridSessionIds with active sessions (max 4) when switching to grid", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    addTestSession({ id: "s3" });
    getState().updateStatus("s1", "running");
    getState().updateStatus("s2", "running");
    getState().updateStatus("s3", "running");

    getState().setLayoutMode("grid");
    expect(getState().gridSessionIds).toEqual(
      expect.arrayContaining(["s1", "s2", "s3"])
    );
    expect(getState().gridSessionIds.length).toBeLessThanOrEqual(4);
  });

  it("uses activeSessionId as fallback when 0 active sessions exist", () => {
    addTestSession({ id: "s1" });
    // s1 has status "starting" — not "running", but activeSessionId is "s1"
    getState().updateStatus("s1", "done");
    getState().setActiveSession("s1");

    getState().setLayoutMode("grid");
    expect(getState().gridSessionIds).toContain("s1");
  });

  it("limits gridSessionIds to first 4 when 5+ active sessions exist", () => {
    for (let i = 1; i <= 6; i++) {
      addTestSession({ id: `s${i}` });
      getState().updateStatus(`s${i}`, "running");
    }

    getState().setLayoutMode("grid");
    expect(getState().gridSessionIds).toHaveLength(4);
  });

  it("preserves gridSessionIds when switching back to 'single'", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().updateStatus("s1", "running");
    getState().updateStatus("s2", "running");

    getState().setLayoutMode("grid");
    const gridIds = [...getState().gridSessionIds];
    expect(gridIds.length).toBeGreaterThan(0);

    getState().setLayoutMode("single");
    expect(getState().layoutMode).toBe("single");
    expect(getState().gridSessionIds).toEqual(gridIds);
  });
});

// ============================================================================
// addToGrid
// ============================================================================

describe("addToGrid", () => {
  it("adds a session to gridSessionIds", () => {
    addTestSession({ id: "s1" });
    getState().addToGrid("s1");
    expect(getState().gridSessionIds).toContain("s1");
  });

  it("sets focusedGridSessionId to the newly added session", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().addToGrid("s1");
    getState().addToGrid("s2");
    expect(getState().focusedGridSessionId).toBe("s2");
  });

  it("enforces max 4 sessions — 5th session is rejected", () => {
    for (let i = 1; i <= 5; i++) {
      addTestSession({ id: `s${i}` });
      getState().addToGrid(`s${i}`);
    }
    expect(getState().gridSessionIds).toHaveLength(4);
    expect(getState().gridSessionIds).not.toContain("s5");
  });

  it("does not add duplicate IDs", () => {
    addTestSession({ id: "s1" });
    getState().addToGrid("s1");
    getState().addToGrid("s1");
    const count = getState().gridSessionIds.filter((id) => id === "s1").length;
    expect(count).toBe(1);
  });

  it("does not crash when session ID is not in sessions array", () => {
    // No session added — ID does not exist in store
    getState().addToGrid("nonexistent");
    // Should not throw; behavior (add or reject) is implementation detail
    expect(true).toBe(true);
  });
});

// ============================================================================
// removeFromGrid
// ============================================================================

describe("removeFromGrid", () => {
  it("removes a session from gridSessionIds", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().addToGrid("s1");
    getState().addToGrid("s2");
    getState().removeFromGrid("s1");
    expect(getState().gridSessionIds).not.toContain("s1");
    expect(getState().gridSessionIds).toContain("s2");
  });

  it("moves focusedGridSessionId to first remaining when focused session is removed", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    addTestSession({ id: "s3" });
    getState().addToGrid("s1");
    getState().addToGrid("s2");
    getState().addToGrid("s3");
    // s3 is focused (last added)
    expect(getState().focusedGridSessionId).toBe("s3");

    getState().removeFromGrid("s3");
    // Should fallback to first remaining
    expect(getState().focusedGridSessionId).toBe("s1");
  });

  it("switches to 'single' layout when last grid session is removed", () => {
    addTestSession({ id: "s1" });
    getState().setLayoutMode("grid");
    // Ensure s1 is in the grid
    if (!getState().gridSessionIds.includes("s1")) {
      getState().addToGrid("s1");
    }

    getState().removeFromGrid("s1");
    expect(getState().layoutMode).toBe("single");
  });

  it("does not crash when removing non-existent ID", () => {
    getState().removeFromGrid("ghost-id");
    // No throw expected
    expect(getState().gridSessionIds).toEqual([]);
  });
});

// ============================================================================
// setFocusedGridSession
// ============================================================================

describe("setFocusedGridSession", () => {
  it("sets focusedGridSessionId", () => {
    addTestSession({ id: "s1" });
    getState().setFocusedGridSession("s1");
    expect(getState().focusedGridSessionId).toBe("s1");
  });

  it("allows null", () => {
    addTestSession({ id: "s1" });
    getState().setFocusedGridSession("s1");
    getState().setFocusedGridSession(null);
    expect(getState().focusedGridSessionId).toBeNull();
  });
});

// ============================================================================
// maximizeGridSession
// ============================================================================

describe("maximizeGridSession", () => {
  it("sets layoutMode to 'single'", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().setLayoutMode("grid");
    getState().maximizeGridSession("s1");
    expect(getState().layoutMode).toBe("single");
  });

  it("sets activeSessionId to the maximized session", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().setLayoutMode("grid");
    getState().maximizeGridSession("s1");
    expect(getState().activeSessionId).toBe("s1");
  });
});

// ============================================================================
// removeSession — Grid Cleanup
// ============================================================================

describe("removeSession grid cleanup", () => {
  it("removes session from gridSessionIds when session is removed", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().addToGrid("s1");
    getState().addToGrid("s2");

    getState().removeSession("s1");
    expect(getState().gridSessionIds).not.toContain("s1");
    expect(getState().gridSessionIds).toContain("s2");
  });

  it("clears focusedGridSessionId when focused session is removed", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().addToGrid("s1");
    getState().addToGrid("s2");
    getState().setFocusedGridSession("s1");

    getState().removeSession("s1");
    // Should either be null or fallback to another grid session
    expect(getState().focusedGridSessionId).not.toBe("s1");
  });
});

// ============================================================================
// Edge Cases — Grid Layout
// ============================================================================

describe("grid layout edge cases", () => {
  it("handles rapid layout toggling (single→grid→single→grid)", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().updateStatus("s1", "running");
    getState().updateStatus("s2", "running");

    getState().setLayoutMode("grid");
    getState().setLayoutMode("single");
    getState().setLayoutMode("grid");
    getState().setLayoutMode("single");
    getState().setLayoutMode("grid");

    expect(getState().layoutMode).toBe("grid");
    // State should be consistent — no corruption
    expect(getState().gridSessionIds.length).toBeGreaterThan(0);
    expect(getState().gridSessionIds.length).toBeLessThanOrEqual(4);
  });

  it("grid works with sessions in terminal states (done/error)", () => {
    addTestSession({ id: "s1" });
    addTestSession({ id: "s2" });
    getState().updateStatus("s1", "done");
    getState().updateStatus("s2", "error");

    getState().addToGrid("s1");
    getState().addToGrid("s2");
    expect(getState().gridSessionIds).toContain("s1");
    expect(getState().gridSessionIds).toContain("s2");
  });

  it("addToGrid works when layoutMode is still 'single'", () => {
    addTestSession({ id: "s1" });
    expect(getState().layoutMode).toBe("single");

    getState().addToGrid("s1");
    // Should add to gridSessionIds even if layoutMode is "single"
    expect(getState().gridSessionIds).toContain("s1");
  });
});
