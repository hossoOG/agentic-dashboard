/**
 * Integration tests for the session status pipeline.
 *
 * Verifies the full state machine: addSession → transitions → terminal states.
 * Specifically covers the backward-transition guard added in #223.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useSessionStore,
  selectSessionCounts,
  type SessionState,
  type SessionShell,
} from "./sessionStore";
import { useAgentStore, type DetectedAgent } from "./agentStore";

// Mock sessionHistoryStore to prevent zustand persist middleware from
// calling localStorage.setItem (which is unavailable in this test environment).
// The mock provides an in-memory store plus the real listener logic.
vi.mock("./sessionHistoryStore", async () => {
  const { create } = await import("zustand");
  const { useSessionStore } = await import("./sessionStore");

  interface HistoryEntry { sessionId: string; [key: string]: unknown }
  interface HistoryState {
    entries: HistoryEntry[];
    addEntry: (e: HistoryEntry) => void;
    clearForProject: () => void;
    getEntriesForProject: () => HistoryEntry[];
  }

  // Plain in-memory store (no persist middleware — no localStorage needed)
  const store = create<HistoryState>((set, get) => ({
    entries: [],
    addEntry: (entry) => {
      if (get().entries.some((e) => e.sessionId === entry.sessionId)) return;
      set((s) => ({ entries: [entry, ...s.entries] }));
    },
    clearForProject: () => set({ entries: [] }),
    getEntriesForProject: () => get().entries,
  }));

  function initSessionHistoryListener(): () => void {
    const tracked = new Map<string, string>();
    return useSessionStore.subscribe((state) => {
      for (const session of state.sessions) {
        const prev = tracked.get(session.id);
        if (prev !== session.status) {
          tracked.set(session.id, session.status);
          if (session.status === "done" || session.status === "error") {
            store.getState().addEntry({
              id: `hist-${Date.now()}`,
              sessionId: session.id,
              projectFolder: session.folder,
              title: session.title,
              startedAt: session.createdAt,
              finishedAt: session.finishedAt,
              durationMs: null,
              outcome: session.status === "done" ? "success" : "error",
              exitCode: session.exitCode,
              agentCount: 0,
              lastOutputSnippet: "",
            });
          }
        }
      }
      for (const id of tracked.keys()) {
        if (!state.sessions.some((s) => s.id === id)) tracked.delete(id);
      }
    });
  }

  return {
    useSessionHistoryStore: store,
    initSessionHistoryListener,
    selectRecentSessions: vi.fn(() => []),
  };
});

// Import after mock registration
const { useSessionHistoryStore, initSessionHistoryListener } = await import("./sessionHistoryStore");

// ============================================================================
// Helpers
// ============================================================================

function getState(): SessionState {
  return useSessionStore.getState();
}

const DEFAULT_SESSION = {
  id: "test-session-001",
  title: "Integration Test Session",
  folder: "C:/projects/test",
  shell: "powershell" as SessionShell,
};

function addSession(overrides?: Partial<typeof DEFAULT_SESSION>) {
  getState().addSession({ ...DEFAULT_SESSION, ...overrides });
}

// ============================================================================
// Reset
// ============================================================================

function makeAgent(overrides: Partial<DetectedAgent> = {}): DetectedAgent {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "test-session-001",
    parentAgentId: null,
    childrenIds: [],
    depth: 0,
    name: "test-agent",
    task: "Implement feature",
    taskNumber: null,
    phaseNumber: null,
    status: "running",
    detectedAt: Date.now(),
    completedAt: null,
    worktreePath: null,
    durationStr: null,
    tokenCount: null,
    blockedBy: null,
    toolUses: null,
    ...overrides,
  };
}

beforeEach(() => {
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    layoutMode: "single",
    gridSessionIds: [],
    focusedGridSessionId: null,
  });
  useSessionHistoryStore.setState({ entries: [] });
  useAgentStore.setState({
    agents: {},
    worktrees: {},
    selectedAgentId: null,
    bottomPanelCollapsed: true,
    taskSummary: null,
    detectionQuality: {},
  });
});

// ============================================================================
// 1. Initial status
// ============================================================================

describe("addSession", () => {
  it("sets initial status to 'starting'", () => {
    addSession();
    const session = getState().sessions[0];
    expect(session.status).toBe("starting");
    expect(session.finishedAt).toBeNull();
  });
});

// ============================================================================
// 2. Forward transitions
// ============================================================================

describe("forward transitions", () => {
  it("starting → running clears finishedAt", () => {
    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "running");
    const s = getState().sessions[0];
    expect(s.status).toBe("running");
    expect(s.finishedAt).toBeNull();
  });

  it("starting → waiting clears finishedAt", () => {
    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "waiting");
    const s = getState().sessions[0];
    expect(s.status).toBe("waiting");
    expect(s.finishedAt).toBeNull();
  });

  it("running → waiting and back to running is allowed", () => {
    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "running");
    getState().updateStatus(DEFAULT_SESSION.id, "waiting");
    getState().updateStatus(DEFAULT_SESSION.id, "running");
    expect(getState().sessions[0].status).toBe("running");
  });

  it("setExitCode 0 → done with finishedAt set", () => {
    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "running");
    getState().setExitCode(DEFAULT_SESSION.id, 0);
    const s = getState().sessions[0];
    expect(s.status).toBe("done");
    expect(s.exitCode).toBe(0);
    expect(s.finishedAt).toBeTypeOf("number");
  });

  it("setExitCode non-zero → error with finishedAt set", () => {
    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "running");
    getState().setExitCode(DEFAULT_SESSION.id, 1);
    const s = getState().sessions[0];
    expect(s.status).toBe("error");
    expect(s.exitCode).toBe(1);
    expect(s.finishedAt).toBeTypeOf("number");
  });
});

// ============================================================================
// 3. Terminal-state guard (#223)
// ============================================================================

describe("transition guard — terminal states are final", () => {
  it("updateStatus after done is a no-op", () => {
    addSession();
    getState().setExitCode(DEFAULT_SESSION.id, 0);
    expect(getState().sessions[0].status).toBe("done");

    const finishedAtBefore = getState().sessions[0].finishedAt;
    getState().updateStatus(DEFAULT_SESSION.id, "running");

    const s = getState().sessions[0];
    expect(s.status).toBe("done");
    expect(s.finishedAt).toBe(finishedAtBefore);
  });

  it("updateStatus after error is a no-op", () => {
    addSession();
    getState().setExitCode(DEFAULT_SESSION.id, 137);
    expect(getState().sessions[0].status).toBe("error");

    getState().updateStatus(DEFAULT_SESSION.id, "running");
    expect(getState().sessions[0].status).toBe("error");
  });

  it("setExitCode after done is a no-op — preserves original exit code", () => {
    addSession();
    getState().setExitCode(DEFAULT_SESSION.id, 0);
    const firstFinishedAt = getState().sessions[0].finishedAt;

    getState().setExitCode(DEFAULT_SESSION.id, 1);

    const s = getState().sessions[0];
    expect(s.status).toBe("done");
    expect(s.exitCode).toBe(0);
    expect(s.finishedAt).toBe(firstFinishedAt);
  });

  it("done→running→done bounce does NOT change status", () => {
    addSession();
    getState().setExitCode(DEFAULT_SESSION.id, 0);
    getState().updateStatus(DEFAULT_SESSION.id, "running"); // stale backend event
    getState().updateStatus(DEFAULT_SESSION.id, "done");    // another stale event
    expect(getState().sessions[0].status).toBe("done");
  });
});

// ============================================================================
// 4. Legitimate edge cases
// ============================================================================

describe("legitimate transitions", () => {
  it("starting → waiting directly (backend can skip running)", () => {
    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "waiting");
    expect(getState().sessions[0].status).toBe("waiting");
  });

  it("starting → done directly (fast exit)", () => {
    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "done");
    expect(getState().sessions[0].status).toBe("done");
  });
});

// ============================================================================
// 5. selectSessionCounts consistency
// ============================================================================

describe("selectSessionCounts", () => {
  it("reflects correct buckets across multiple sessions", () => {
    addSession({ id: "s1" });
    addSession({ id: "s2" });
    addSession({ id: "s3" });
    addSession({ id: "s4" });

    getState().updateStatus("s1", "running");
    getState().updateStatus("s2", "waiting");
    getState().setExitCode("s3", 0);
    getState().setExitCode("s4", 1);

    const counts = selectSessionCounts(getState());
    expect(counts.active).toBe(1);
    expect(counts.waiting).toBe(1);
    expect(counts.done).toBe(1);
    expect(counts.error).toBe(1);
    expect(counts.total).toBe(4);
  });

  it("done session stays in done bucket after stale running event", () => {
    addSession({ id: "s1" });
    getState().setExitCode("s1", 0);
    getState().updateStatus("s1", "running"); // stale event — guard blocks it

    const counts = selectSessionCounts(getState());
    expect(counts.active).toBe(0);
    expect(counts.done).toBe(1);
  });
});

// ============================================================================
// 6. History listener — exactly one entry per terminal transition
// ============================================================================

describe("sessionHistoryStore — initSessionHistoryListener", () => {
  it("records done entry exactly once, even with a stale bounce", () => {
    const unlisten = initSessionHistoryListener();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "running");
    getState().setExitCode(DEFAULT_SESSION.id, 0);

    // Simulate stale backend events — guard blocks these
    getState().updateStatus(DEFAULT_SESSION.id, "running");
    getState().updateStatus(DEFAULT_SESSION.id, "done");

    const entries = useSessionHistoryStore.getState().entries;
    expect(entries.filter((e) => e.sessionId === DEFAULT_SESSION.id)).toHaveLength(1);

    unlisten();
    warnSpy.mockRestore();
  });

  it("records error entry exactly once", () => {
    const unlisten = initSessionHistoryListener();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    addSession();
    getState().updateStatus(DEFAULT_SESSION.id, "running");
    getState().setExitCode(DEFAULT_SESSION.id, 1);
    getState().updateStatus(DEFAULT_SESSION.id, "running"); // stale

    const entries = useSessionHistoryStore.getState().entries;
    expect(entries.filter((e) => e.sessionId === DEFAULT_SESSION.id)).toHaveLength(1);

    unlisten();
    warnSpy.mockRestore();
  });
});

// ============================================================================
// 7. Cross-Store Cleanup — Bug #10
// ============================================================================

describe("Cross-Store-Cleanup: removeSession + removeAgentsBySession", () => {
  it("cleans both stores coherently when a session with selected agents is removed", () => {
    const sessionId = DEFAULT_SESSION.id;

    // Setup: Session mit 2 Agents anlegen, einen selektieren, Panel offen
    addSession();
    const agent1 = makeAgent({ id: "agent-1", sessionId });
    const agent2 = makeAgent({ id: "agent-2", sessionId });
    useAgentStore.getState().addAgent(agent1);
    useAgentStore.getState().addAgent(agent2);
    useAgentStore.setState({ selectedAgentId: "agent-1", bottomPanelCollapsed: false });
    useAgentStore.getState().setDetectionQuality(sessionId, "good");

    // Verify preconditions
    expect(getState().sessions).toHaveLength(1);
    expect(Object.keys(useAgentStore.getState().agents)).toHaveLength(2);
    expect(useAgentStore.getState().selectedAgentId).toBe("agent-1");
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(false);
    expect(useAgentStore.getState().detectionQuality[sessionId]).toBe("good");

    // Act: Session entfernen + Agents cleanen (wie im echten App-Code)
    getState().removeSession(sessionId);
    useAgentStore.getState().removeAgentsBySession(sessionId);

    // Assert: sessionStore sauber
    expect(getState().sessions).toHaveLength(0);
    expect(getState().activeSessionId).toBeNull();

    // Assert: agentStore vollständig bereinigt
    expect(Object.keys(useAgentStore.getState().agents)).toHaveLength(0);
    expect(useAgentStore.getState().selectedAgentId).toBeNull();
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(true);
    expect(useAgentStore.getState().detectionQuality[sessionId]).toBeUndefined();
  });

  it("preserves other-session agents and selection when only one session is removed", () => {
    const sessionId1 = "sess-keep";
    const sessionId2 = DEFAULT_SESSION.id;

    addSession({ id: sessionId1 });
    addSession({ id: sessionId2 });

    const agentKept = makeAgent({ id: "agent-kept", sessionId: sessionId1 });
    const agentRemoved = makeAgent({ id: "agent-removed", sessionId: sessionId2 });
    useAgentStore.getState().addAgent(agentKept);
    useAgentStore.getState().addAgent(agentRemoved);
    useAgentStore.setState({ selectedAgentId: "agent-kept", bottomPanelCollapsed: false });

    // Nur sessionId2 entfernen
    getState().removeSession(sessionId2);
    useAgentStore.getState().removeAgentsBySession(sessionId2);

    // sessionId1-Session bleibt
    expect(getState().sessions).toHaveLength(1);
    expect(getState().sessions[0].id).toBe(sessionId1);

    // Agent aus sessionId1 bleibt erhalten
    expect(useAgentStore.getState().agents["agent-kept"]).toBeDefined();
    expect(useAgentStore.getState().agents["agent-removed"]).toBeUndefined();

    // selectedAgentId bleibt, da agent-kept noch existiert
    expect(useAgentStore.getState().selectedAgentId).toBe("agent-kept");

    // bottomPanel bleibt offen, da noch Agents vorhanden
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(false);
  });
});
