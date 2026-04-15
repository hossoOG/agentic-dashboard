import { describe, it, expect, beforeEach } from "vitest";
import { useAgentStore, type DetectedAgent, type DetectedWorktree } from "./agentStore";
import {
  selectAgentsForSession,
  selectActiveAgentCount,
  selectWorktreesForSession,
  selectAgentTree,
  selectChildAgents,
  selectDetectionQuality,
} from "./agentStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<DetectedAgent> = {}): DetectedAgent {
  return {
    id: `agent-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "sess-1",
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

function makeWorktree(overrides: Partial<DetectedWorktree> = {}): DetectedWorktree {
  return {
    path: `/tmp/wt-${Math.random().toString(36).slice(2, 8)}`,
    branch: "feature-branch",
    agentId: null,
    sessionId: "sess-1",
    active: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useAgentStore.setState({
    agents: {},
    worktrees: {},
    selectedAgentId: null,
    bottomPanelCollapsed: true,
    taskSummary: null,
    detectionQuality: {},
  });
});

describe("addAgent", () => {
  it("adds agent to agents record by id", () => {
    const agent = makeAgent({ id: "a1" });
    useAgentStore.getState().addAgent(agent);

    expect(useAgentStore.getState().agents["a1"]).toEqual(agent);
  });

  it("auto-expands bottomPanel on first agent", () => {
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(true);

    useAgentStore.getState().addAgent(makeAgent());

    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(false);
  });

  it("does NOT change panel state on subsequent agents", () => {
    useAgentStore.getState().addAgent(makeAgent());
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(false);

    // Manually collapse again
    useAgentStore.setState({ bottomPanelCollapsed: true });

    // Second agent should not touch the flag
    useAgentStore.getState().addAgent(makeAgent());
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(true);
  });

  it("updates parent's childrenIds when parentAgentId set", () => {
    const parent = makeAgent({ id: "parent-1" });
    useAgentStore.getState().addAgent(parent);

    const child = makeAgent({ id: "child-1", parentAgentId: "parent-1" });
    useAgentStore.getState().addAgent(child);

    const updatedParent = useAgentStore.getState().agents["parent-1"];
    expect(updatedParent.childrenIds).toContain("child-1");
  });

  it("handles orphan agent (parentAgentId references nonexistent agent) gracefully", () => {
    const orphan = makeAgent({ parentAgentId: "nonexistent" });

    // Should not throw
    expect(() => useAgentStore.getState().addAgent(orphan)).not.toThrow();
    expect(useAgentStore.getState().agents[orphan.id]).toBeDefined();
  });
});

describe("updateAgentStatus", () => {
  it("updates status and completedAt for existing agent", () => {
    const agent = makeAgent({ id: "a1", status: "running" });
    useAgentStore.getState().addAgent(agent);

    const now = Date.now();
    useAgentStore.getState().updateAgentStatus("a1", "completed", now);

    const updated = useAgentStore.getState().agents["a1"];
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).toBe(now);
  });

  it("no-op for unknown id (state unchanged)", () => {
    const before = useAgentStore.getState().agents;
    useAgentStore.getState().updateAgentStatus("nonexistent", "completed", Date.now());
    expect(useAgentStore.getState().agents).toBe(before);
  });
});

describe("updateAgentDetails", () => {
  it("merges partial updates (e.g., durationStr, tokenCount)", () => {
    const agent = makeAgent({ id: "a1" });
    useAgentStore.getState().addAgent(agent);

    useAgentStore.getState().updateAgentDetails("a1", {
      durationStr: "5m 30s",
      tokenCount: "12345",
    });

    const updated = useAgentStore.getState().agents["a1"];
    expect(updated.durationStr).toBe("5m 30s");
    expect(updated.tokenCount).toBe("12345");
    // Original fields preserved
    expect(updated.task).toBe("Implement feature");
  });

  it("no-op for unknown id", () => {
    const before = useAgentStore.getState().agents;
    useAgentStore.getState().updateAgentDetails("nonexistent", { durationStr: "1m" });
    expect(useAgentStore.getState().agents).toBe(before);
  });
});

describe("removeAgentsBySession", () => {
  it("removes all agents matching sessionId", () => {
    useAgentStore.getState().addAgent(makeAgent({ id: "a1", sessionId: "sess-1" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "a2", sessionId: "sess-1" }));

    useAgentStore.getState().removeAgentsBySession("sess-1");

    expect(Object.keys(useAgentStore.getState().agents)).toHaveLength(0);
  });

  it("removes all worktrees matching sessionId", () => {
    useAgentStore.getState().addWorktree(makeWorktree({ path: "/wt/1", sessionId: "sess-1" }));
    useAgentStore.getState().addWorktree(makeWorktree({ path: "/wt/2", sessionId: "sess-1" }));

    useAgentStore.getState().removeAgentsBySession("sess-1");

    expect(Object.keys(useAgentStore.getState().worktrees)).toHaveLength(0);
  });

  it("preserves agents and worktrees from other sessions", () => {
    useAgentStore.getState().addAgent(makeAgent({ id: "a1", sessionId: "sess-1" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "a2", sessionId: "sess-2" }));
    useAgentStore.getState().addWorktree(makeWorktree({ path: "/wt/1", sessionId: "sess-1" }));
    useAgentStore.getState().addWorktree(makeWorktree({ path: "/wt/2", sessionId: "sess-2" }));

    useAgentStore.getState().removeAgentsBySession("sess-1");

    expect(Object.keys(useAgentStore.getState().agents)).toEqual(["a2"]);
    expect(Object.keys(useAgentStore.getState().worktrees)).toEqual(["/wt/2"]);
  });
});

describe("worktree actions", () => {
  it("addWorktree adds by path key", () => {
    const wt = makeWorktree({ path: "/tmp/wt-abc" });
    useAgentStore.getState().addWorktree(wt);

    expect(useAgentStore.getState().worktrees["/tmp/wt-abc"]).toEqual(wt);
  });

  it("updateWorktreeActive toggles active flag", () => {
    useAgentStore.getState().addWorktree(makeWorktree({ path: "/tmp/wt-1", active: true }));

    useAgentStore.getState().updateWorktreeActive("/tmp/wt-1", false);
    expect(useAgentStore.getState().worktrees["/tmp/wt-1"].active).toBe(false);

    useAgentStore.getState().updateWorktreeActive("/tmp/wt-1", true);
    expect(useAgentStore.getState().worktrees["/tmp/wt-1"].active).toBe(true);
  });

  it("updateWorktreeActive is no-op for unknown path", () => {
    const before = useAgentStore.getState().worktrees;
    useAgentStore.getState().updateWorktreeActive("/nonexistent", false);
    expect(useAgentStore.getState().worktrees).toBe(before);
  });
});

describe("simple setters", () => {
  it("setSelectedAgent sets id", () => {
    useAgentStore.getState().setSelectedAgent("agent-42");
    expect(useAgentStore.getState().selectedAgentId).toBe("agent-42");
  });

  it("setBottomPanelCollapsed sets flag", () => {
    useAgentStore.getState().setBottomPanelCollapsed(false);
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(false);

    useAgentStore.getState().setBottomPanelCollapsed(true);
    expect(useAgentStore.getState().bottomPanelCollapsed).toBe(true);
  });

  it("setTaskSummary sets pending+completed counts", () => {
    useAgentStore.getState().setTaskSummary(3, 7);
    expect(useAgentStore.getState().taskSummary).toEqual({ pending: 3, completed: 7 });
  });
});

describe("selectors", () => {
  it("selectAgentsForSession filters by sessionId (returns array)", () => {
    useAgentStore.getState().addAgent(makeAgent({ id: "a1", sessionId: "sess-1" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "a2", sessionId: "sess-2" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "a3", sessionId: "sess-1" }));

    const result = selectAgentsForSession("sess-1")(useAgentStore.getState());
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id).sort()).toEqual(["a1", "a3"]);
  });

  it("selectActiveAgentCount counts agents with status running", () => {
    useAgentStore.getState().addAgent(makeAgent({ id: "a1", sessionId: "sess-1", status: "running" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "a2", sessionId: "sess-1", status: "completed" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "a3", sessionId: "sess-1", status: "running" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "a4", sessionId: "sess-2", status: "running" }));

    expect(selectActiveAgentCount("sess-1")(useAgentStore.getState())).toBe(2);
  });

  it("selectWorktreesForSession filters by sessionId", () => {
    useAgentStore.getState().addWorktree(makeWorktree({ path: "/wt/1", sessionId: "sess-1" }));
    useAgentStore.getState().addWorktree(makeWorktree({ path: "/wt/2", sessionId: "sess-2" }));

    const result = selectWorktreesForSession("sess-1")(useAgentStore.getState());
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("/wt/1");
  });

  it("selectAgentTree returns root agents (parentAgentId === null)", () => {
    useAgentStore.getState().addAgent(makeAgent({ id: "root1", sessionId: "sess-1", parentAgentId: null }));
    useAgentStore.getState().addAgent(makeAgent({ id: "root2", sessionId: "sess-1", parentAgentId: null }));
    useAgentStore.getState().addAgent(makeAgent({ id: "child1", sessionId: "sess-1", parentAgentId: "root1" }));

    const roots = selectAgentTree("sess-1")(useAgentStore.getState());
    expect(roots).toHaveLength(2);
    expect(roots.map((a) => a.id).sort()).toEqual(["root1", "root2"]);
  });

  it("selectChildAgents returns agents with matching parentId", () => {
    useAgentStore.getState().addAgent(makeAgent({ id: "parent", sessionId: "sess-1" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "c1", sessionId: "sess-1", parentAgentId: "parent" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "c2", sessionId: "sess-1", parentAgentId: "parent" }));
    useAgentStore.getState().addAgent(makeAgent({ id: "c3", sessionId: "sess-1", parentAgentId: "other" }));

    const children = selectChildAgents("parent")(useAgentStore.getState());
    expect(children).toHaveLength(2);
    expect(children.map((a) => a.id).sort()).toEqual(["c1", "c2"]);
  });

  it("selectDetectionQuality returns 'none' when no entry exists", () => {
    const quality = selectDetectionQuality("unknown-session")(useAgentStore.getState());
    expect(quality).toBe("none");
  });
});

describe("setDetectionQuality", () => {
  it("sets quality for a session", () => {
    useAgentStore.getState().setDetectionQuality("sess-1", "good");

    expect(useAgentStore.getState().detectionQuality["sess-1"]).toBe("good");
  });

  it("overwrites existing value", () => {
    useAgentStore.getState().setDetectionQuality("sess-1", "good");
    expect(useAgentStore.getState().detectionQuality["sess-1"]).toBe("good");

    useAgentStore.getState().setDetectionQuality("sess-1", "degraded");
    expect(useAgentStore.getState().detectionQuality["sess-1"]).toBe("degraded");
  });

  it("does not affect other sessions", () => {
    useAgentStore.getState().setDetectionQuality("sess-1", "good");
    useAgentStore.getState().setDetectionQuality("sess-2", "degraded");

    expect(useAgentStore.getState().detectionQuality["sess-1"]).toBe("good");
    expect(useAgentStore.getState().detectionQuality["sess-2"]).toBe("degraded");
  });
});

describe("removeAgentsBySession clears detectionQuality", () => {
  it("removes detectionQuality entry when removing agents for a session", () => {
    useAgentStore.getState().addAgent(makeAgent({ id: "a1", sessionId: "sess-1" }));
    useAgentStore.getState().setDetectionQuality("sess-1", "good");

    useAgentStore.getState().removeAgentsBySession("sess-1");

    // Agents should be removed
    expect(Object.keys(useAgentStore.getState().agents)).toHaveLength(0);
    // detectionQuality for the session should also be cleaned up
    expect(useAgentStore.getState().detectionQuality["sess-1"]).toBeUndefined();
  });

  it("preserves detectionQuality for other sessions", () => {
    useAgentStore.getState().setDetectionQuality("sess-1", "good");
    useAgentStore.getState().setDetectionQuality("sess-2", "degraded");

    useAgentStore.getState().removeAgentsBySession("sess-1");

    expect(useAgentStore.getState().detectionQuality["sess-1"]).toBeUndefined();
    expect(useAgentStore.getState().detectionQuality["sess-2"]).toBe("degraded");
  });
});
