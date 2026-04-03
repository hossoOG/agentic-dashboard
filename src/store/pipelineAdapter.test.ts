import { describe, it, expect } from "vitest";
import type { DetectedAgent } from "./agentStore";
import {
  mapAgentStatusToWorktreeStatus,
  deriveCurrentStep,
  deriveCompletedSteps,
  deriveProgress,
  STEP_ORDER,
} from "./pipelineAdapter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<DetectedAgent> = {}): DetectedAgent {
  return {
    id: "agent-1",
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

// ---------------------------------------------------------------------------
// mapAgentStatusToWorktreeStatus
// ---------------------------------------------------------------------------

describe("mapAgentStatusToWorktreeStatus", () => {
  it("maps running → active", () => {
    expect(mapAgentStatusToWorktreeStatus(makeAgent({ status: "running" }))).toBe("active");
  });

  it("maps completed → done", () => {
    expect(mapAgentStatusToWorktreeStatus(makeAgent({ status: "completed" }))).toBe("done");
  });

  it("maps error → error", () => {
    expect(mapAgentStatusToWorktreeStatus(makeAgent({ status: "error" }))).toBe("error");
  });

  it("maps unknown status → idle", () => {
    // Force an unknown status to exercise the default branch
    const agent = makeAgent({ status: "unknown" as DetectedAgent["status"] });
    expect(mapAgentStatusToWorktreeStatus(agent)).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// deriveCurrentStep
// ---------------------------------------------------------------------------

describe("deriveCurrentStep", () => {
  it("returns draft_pr for completed agents", () => {
    expect(deriveCurrentStep(makeAgent({ status: "completed" }))).toBe("draft_pr");
  });

  it("returns setup for error agents", () => {
    expect(deriveCurrentStep(makeAgent({ status: "error" }))).toBe("setup");
  });

  it("returns code for all running agents", () => {
    expect(deriveCurrentStep(makeAgent({ status: "running", worktreePath: null }))).toBe("code");
    expect(deriveCurrentStep(makeAgent({ status: "running", worktreePath: "/tmp/wt-1" }))).toBe("code");
  });

  it("returns setup for unknown status (default branch)", () => {
    const agent = makeAgent({ status: "unknown" as DetectedAgent["status"] });
    expect(deriveCurrentStep(agent)).toBe("setup");
  });
});

// ---------------------------------------------------------------------------
// deriveCompletedSteps
// ---------------------------------------------------------------------------

describe("deriveCompletedSteps", () => {
  it("returns empty array for setup (first step)", () => {
    expect(deriveCompletedSteps("setup")).toEqual([]);
  });

  it("returns [setup] for plan", () => {
    expect(deriveCompletedSteps("plan")).toEqual(["setup"]);
  });

  it("returns [setup, plan] for validate", () => {
    expect(deriveCompletedSteps("validate")).toEqual(["setup", "plan"]);
  });

  it("returns all steps before code for code", () => {
    expect(deriveCompletedSteps("code")).toEqual(["setup", "plan", "validate"]);
  });

  it("returns all steps except draft_pr for draft_pr", () => {
    const expected = STEP_ORDER.slice(0, STEP_ORDER.length - 1);
    expect(deriveCompletedSteps("draft_pr")).toEqual(expected);
  });

  it("returns empty array for unknown step", () => {
    // An invalid step won't be found in STEP_ORDER → indexOf returns -1
    expect(deriveCompletedSteps("nonexistent" as never)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deriveProgress
// ---------------------------------------------------------------------------

describe("deriveProgress", () => {
  it("returns 100 for completed status regardless of step", () => {
    expect(deriveProgress("setup", "completed")).toBe(100);
    expect(deriveProgress("code", "completed")).toBe(100);
  });

  it("returns 0 for error status regardless of step", () => {
    expect(deriveProgress("code", "error")).toBe(0);
    expect(deriveProgress("draft_pr", "error")).toBe(0);
  });

  it("returns 50 for any running status regardless of step", () => {
    expect(deriveProgress("setup", "running")).toBe(50);
    expect(deriveProgress("code", "running")).toBe(50);
    expect(deriveProgress("draft_pr", "running")).toBe(50);
  });

  it("returns 0 for unknown status", () => {
    expect(deriveProgress("code", "unknown" as never)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// STEP_ORDER
// ---------------------------------------------------------------------------

describe("STEP_ORDER", () => {
  it("contains 7 steps in the correct order", () => {
    expect(STEP_ORDER).toEqual([
      "setup", "plan", "validate", "code", "review", "self_verify", "draft_pr",
    ]);
  });
});
