import { describe, it, expect, beforeEach } from "vitest";
import { usePipelineStore } from "./pipelineStore";
import type { WorktreeStep, WorktreeStatus, QACheckStatus } from "./pipelineStore";

// Reset store before each test to ensure isolation
beforeEach(() => {
  usePipelineStore.getState().reset();
});

// ============================================================================
// Initial State
// ============================================================================

describe("initial state", () => {
  it("has orchestratorStatus idle", () => {
    expect(usePipelineStore.getState().orchestratorStatus).toBe("idle");
  });

  it("has empty worktrees array", () => {
    expect(usePipelineStore.getState().worktrees).toEqual([]);
  });

  it("has isRunning false", () => {
    expect(usePipelineStore.getState().isRunning).toBe(false);
  });

  it("has all QA checks as pending", () => {
    const qa = usePipelineStore.getState().qaGate;
    expect(qa.unitTests).toBe("pending");
    expect(qa.typeCheck).toBe("pending");
    expect(qa.lint).toBe("pending");
    expect(qa.build).toBe("pending");
    expect(qa.e2e).toBe("pending");
    expect(qa.overallStatus).toBe("idle");
  });

  it("has empty orchestratorLog", () => {
    expect(usePipelineStore.getState().orchestratorLog).toEqual([]);
  });

  it("has null pipelineStartedAt and pipelineStoppedAt", () => {
    expect(usePipelineStore.getState().pipelineStartedAt).toBeNull();
    expect(usePipelineStore.getState().pipelineStoppedAt).toBeNull();
  });
});

// ============================================================================
// setOrchestratorStatus
// ============================================================================

describe("setOrchestratorStatus", () => {
  it("sets status correctly", () => {
    usePipelineStore.getState().setOrchestratorStatus("planning");
    expect(usePipelineStore.getState().orchestratorStatus).toBe("planning");
  });

  it("accepts all valid values", () => {
    const statuses = ["idle", "planning", "generated_manifest"] as const;
    for (const status of statuses) {
      usePipelineStore.getState().setOrchestratorStatus(status);
      expect(usePipelineStore.getState().orchestratorStatus).toBe(status);
    }
  });
});

// ============================================================================
// spawnWorktree
// ============================================================================

describe("spawnWorktree", () => {
  it("adds a new worktree", () => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
    const worktrees = usePipelineStore.getState().worktrees;
    expect(worktrees).toHaveLength(1);
    expect(worktrees[0].id).toBe("wt-1");
    expect(worktrees[0].branch).toBe("fix/bug");
    expect(worktrees[0].issue).toBe("#42");
  });

  it("sets correct initial state", () => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
    const wt = usePipelineStore.getState().worktrees[0];
    expect(wt.currentStep).toBe("setup");
    expect(wt.status).toBe("active");
    expect(wt.progress).toBe(0);
    expect(wt.completedSteps).toEqual([]);
    expect(wt.logs).toEqual([]);
    expect(wt.retryCount).toBe(0);
  });

  it("sets priority from argument", () => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42", 5);
    expect(usePipelineStore.getState().worktrees[0].priority).toBe(5);
  });

  it("defaults priority to 0", () => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
    expect(usePipelineStore.getState().worktrees[0].priority).toBe(0);
  });

  it("adds duplicate ID as a new entry (no error)", () => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
    usePipelineStore.getState().spawnWorktree("wt-1", "feat/new", "#99");
    const worktrees = usePipelineStore.getState().worktrees;
    expect(worktrees).toHaveLength(2);
    expect(worktrees[0].issue).toBe("#42");
    expect(worktrees[1].issue).toBe("#99");
  });

  it("initializes stepTimings with setup entry", () => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
    const wt = usePipelineStore.getState().worktrees[0];
    expect(wt.stepTimings).toHaveLength(1);
    expect(wt.stepTimings[0].step).toBe("setup");
    expect(typeof wt.stepTimings[0].startedAt).toBe("number");
  });

  it("stores agentId cross-reference when provided", () => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42", 0, "agent-abc");
    const wt = usePipelineStore.getState().worktrees[0];
    expect(wt.agentId).toBe("agent-abc");
  });

  it("has undefined agentId when not provided", () => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
    const wt = usePipelineStore.getState().worktrees[0];
    expect(wt.agentId).toBeUndefined();
  });
});

// ============================================================================
// updateWorktreeStep
// ============================================================================

describe("updateWorktreeStep", () => {
  beforeEach(() => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
  });

  it("updates currentStep", () => {
    usePipelineStore.getState().updateWorktreeStep("wt-1", "code");
    expect(usePipelineStore.getState().worktrees[0].currentStep).toBe("code");
  });

  it("calculates progress correctly for each step", () => {
    // STEP_ORDER: setup(0), plan(1), validate(2), code(3), review(4), self_verify(5), draft_pr(6)
    // progress = round(index / 6 * 100)
    const expectedProgress: Record<WorktreeStep, number> = {
      setup: 0,           // 0/6 = 0
      plan: 17,           // round(1/6 * 100) = 17
      validate: 33,       // round(2/6 * 100) = 33
      code: 50,           // round(3/6 * 100) = 50
      review: 67,         // round(4/6 * 100) = 67
      self_verify: 83,    // round(5/6 * 100) = 83
      draft_pr: 100,      // round(6/6 * 100) = 100
    };

    for (const [step, expected] of Object.entries(expectedProgress)) {
      usePipelineStore.getState().updateWorktreeStep("wt-1", step as WorktreeStep);
      expect(usePipelineStore.getState().worktrees[0].progress).toBe(expected);
    }
  });

  it("calculates completedSteps correctly", () => {
    usePipelineStore.getState().updateWorktreeStep("wt-1", "code");
    // code is at index 3, so completed = setup, plan, validate
    expect(usePipelineStore.getState().worktrees[0].completedSteps).toEqual([
      "setup",
      "plan",
      "validate",
    ]);
  });

  it("has empty completedSteps when at setup", () => {
    usePipelineStore.getState().updateWorktreeStep("wt-1", "setup");
    expect(usePipelineStore.getState().worktrees[0].completedSteps).toEqual([]);
  });

  it("does not crash when worktree is not found", () => {
    // Should not throw
    expect(() => {
      usePipelineStore.getState().updateWorktreeStep("nonexistent", "code");
    }).not.toThrow();
    // Original worktree is unchanged
    expect(usePipelineStore.getState().worktrees[0].currentStep).toBe("setup");
  });

  it("adds step timing entry for new step", () => {
    usePipelineStore.getState().updateWorktreeStep("wt-1", "plan");
    const wt = usePipelineStore.getState().worktrees[0];
    expect(wt.stepTimings).toHaveLength(2);
    expect(wt.stepTimings[1].step).toBe("plan");
  });
});

// ============================================================================
// updateWorktreeStatus
// ============================================================================

describe("updateWorktreeStatus", () => {
  beforeEach(() => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
  });

  it("sets status correctly", () => {
    usePipelineStore.getState().updateWorktreeStatus("wt-1", "blocked");
    expect(usePipelineStore.getState().worktrees[0].status).toBe("blocked");
  });

  it("accepts all valid status values", () => {
    const statuses: WorktreeStatus[] = [
      "idle",
      "active",
      "blocked",
      "waiting_for_input",
      "done",
      "error",
    ];
    for (const status of statuses) {
      usePipelineStore.getState().updateWorktreeStatus("wt-1", status);
      expect(usePipelineStore.getState().worktrees[0].status).toBe(status);
    }
  });

  it("records lastError when status is error with reason", () => {
    usePipelineStore.getState().updateWorktreeStatus("wt-1", "error", "Something broke");
    const wt = usePipelineStore.getState().worktrees[0];
    expect(wt.lastError).toBeDefined();
    expect(wt.lastError?.message).toBe("Something broke");
    expect(wt.lastError?.code).toBe("WORKTREE_ERROR");
  });

  it("does not crash when worktree is not found", () => {
    expect(() => {
      usePipelineStore.getState().updateWorktreeStatus("nonexistent", "done");
    }).not.toThrow();
  });
});

// ============================================================================
// addWorktreeLog
// ============================================================================

describe("addWorktreeLog", () => {
  beforeEach(() => {
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
  });

  it("adds a log entry", () => {
    usePipelineStore.getState().addWorktreeLog("wt-1", "Starting setup...");
    expect(usePipelineStore.getState().worktrees[0].logs).toEqual([
      "Starting setup...",
    ]);
  });

  it("adds multiple log entries in order", () => {
    usePipelineStore.getState().addWorktreeLog("wt-1", "line 1");
    usePipelineStore.getState().addWorktreeLog("wt-1", "line 2");
    usePipelineStore.getState().addWorktreeLog("wt-1", "line 3");
    expect(usePipelineStore.getState().worktrees[0].logs).toEqual([
      "line 1",
      "line 2",
      "line 3",
    ]);
  });

  it("respects MAX_WORKTREE_LOGS limit (20)", () => {
    for (let i = 0; i < 25; i++) {
      usePipelineStore.getState().addWorktreeLog("wt-1", `log-${i}`);
    }
    const logs = usePipelineStore.getState().worktrees[0].logs;
    expect(logs).toHaveLength(20);
    // Oldest logs are trimmed, newest are kept
    expect(logs[0]).toBe("log-5");
    expect(logs[19]).toBe("log-24");
  });
});

// ============================================================================
// updateQACheck
// ============================================================================

describe("updateQACheck", () => {
  it("sets check status correctly", () => {
    usePipelineStore.getState().updateQACheck("unitTests", "pass");
    expect(usePipelineStore.getState().qaGate.unitTests).toBe("pass");
  });

  it("works for all check names", () => {
    const checks = ["unitTests", "typeCheck", "lint", "build", "e2e"] as const;
    for (const check of checks) {
      usePipelineStore.getState().updateQACheck(check, "running");
      expect(usePipelineStore.getState().qaGate[check]).toBe("running");
    }
  });

  it("accepts all status values", () => {
    const statuses: QACheckStatus[] = ["pending", "running", "pass", "fail"];
    for (const status of statuses) {
      usePipelineStore.getState().updateQACheck("unitTests", status);
      expect(usePipelineStore.getState().qaGate.unitTests).toBe(status);
    }
  });

  it("does not affect other checks", () => {
    usePipelineStore.getState().updateQACheck("unitTests", "pass");
    expect(usePipelineStore.getState().qaGate.typeCheck).toBe("pending");
    expect(usePipelineStore.getState().qaGate.lint).toBe("pending");
  });
});

// ============================================================================
// reset
// ============================================================================

describe("reset", () => {
  it("resets everything to initial state", () => {
    // Modify state
    usePipelineStore.getState().setOrchestratorStatus("planning");
    usePipelineStore.getState().spawnWorktree("wt-1", "fix/bug", "#42");
    usePipelineStore.getState().setIsRunning(true);
    usePipelineStore.getState().updateQACheck("unitTests", "pass");
    usePipelineStore.getState().addOrchestratorLog("test log");

    // Reset
    usePipelineStore.getState().reset();

    const state = usePipelineStore.getState();
    expect(state.orchestratorStatus).toBe("idle");
    expect(state.worktrees).toEqual([]);
    expect(state.isRunning).toBe(false);
    expect(state.qaGate.unitTests).toBe("pending");
    expect(state.qaGate.overallStatus).toBe("idle");
    expect(state.orchestratorLog).toEqual([]);
    expect(state.pipelineStartedAt).toBeNull();
    expect(state.pipelineStoppedAt).toBeNull();
    expect(state.manifest).toBeNull();
    expect(state.errors).toEqual([]);
    expect(state.mode).toBe("mock");
  });
});

// ============================================================================
// setIsRunning
// ============================================================================

describe("setIsRunning", () => {
  it("sets isRunning to true and records pipelineStartedAt", () => {
    usePipelineStore.getState().setIsRunning(true);
    const state = usePipelineStore.getState();
    expect(state.isRunning).toBe(true);
    expect(state.pipelineStartedAt).toBeTypeOf("number");
  });

  it("sets isRunning to false and records pipelineStoppedAt", () => {
    usePipelineStore.getState().setIsRunning(true);
    usePipelineStore.getState().setIsRunning(false);
    const state = usePipelineStore.getState();
    expect(state.isRunning).toBe(false);
    expect(state.pipelineStoppedAt).toBeTypeOf("number");
  });
});

// ============================================================================
// addOrchestratorLog
// ============================================================================

describe("addOrchestratorLog", () => {
  it("adds log entries", () => {
    usePipelineStore.getState().addOrchestratorLog("Starting plan...");
    expect(usePipelineStore.getState().orchestratorLog).toEqual([
      "Starting plan...",
    ]);
  });

  it("respects MAX_ORCHESTRATOR_LOGS limit (50)", () => {
    for (let i = 0; i < 55; i++) {
      usePipelineStore.getState().addOrchestratorLog(`log-${i}`);
    }
    const logs = usePipelineStore.getState().orchestratorLog;
    expect(logs).toHaveLength(50);
    expect(logs[0]).toBe("log-5");
  });
});
