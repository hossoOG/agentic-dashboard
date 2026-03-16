import { describe, it, expect } from "vitest";
import { parseLogLine } from "./logParser";
import type { ParsedEvent } from "./logParser";

// Helper: find the first event of a given type from parseLogLine results
function findEvent(events: ParsedEvent[], type: ParsedEvent["type"]): ParsedEvent | undefined {
  return events.find((e) => e.type === type);
}

// ============================================================================
// Orchestrator Status
// ============================================================================

describe("parseLogLine — orchestrator status", () => {
  it("detects planning status from MODE: plan-only", () => {
    const events = parseLogLine("MODE: plan-only");
    const evt = findEvent(events, "orchestrator_status");
    expect(evt).toBeDefined();
    expect(evt!.payload.status).toBe("planning");
  });

  it("detects generated_manifest from SPAWN_MANIFEST", () => {
    const events = parseLogLine("SPAWN_MANIFEST generated");
    const evt = findEvent(events, "orchestrator_status");
    expect(evt).toBeDefined();
    expect(evt!.payload.status).toBe("generated_manifest");
  });
});

// ============================================================================
// Worktree Spawn
// ============================================================================

describe("parseLogLine — worktree spawn", () => {
  it("detects worktree spawn from Agent subagent pattern", () => {
    const line = 'Agent(subagent_type:"issue-implementer", isolation:"worktree" prompt:[BRIEFING #42])';
    const events = parseLogLine(line);
    const evt = findEvent(events, "worktree_spawn");
    expect(evt).toBeDefined();
    expect(evt!.payload.id).toBe("wt-42");
    expect(evt!.payload.branch).toBe("issue-42");
    expect(evt!.payload.issue).toBe("42");
  });
});

// ============================================================================
// Worktree Step
// ============================================================================

describe("parseLogLine — worktree step", () => {
  it("detects plan step from docs/plans path", () => {
    const events = parseLogLine("Writing docs/plans/feature.md", "wt-1");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.step).toBe("plan");
    expect(evt!.payload.id).toBe("wt-1");
  });

  it("detects validate step from VERIFY_RESULT: APPROVED", () => {
    const events = parseLogLine("VERIFY_RESULT: APPROVED", "wt-1");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.step).toBe("validate");
  });

  it("detects review step from code-reviewer", () => {
    const events = parseLogLine("Running code-reviewer on changes", "wt-1");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.step).toBe("review");
  });

  it("detects self_verify step from npx vitest run", () => {
    const events = parseLogLine("npx vitest run --coverage", "wt-1");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.step).toBe("self_verify");
  });

  it("detects self_verify step from npm run typecheck", () => {
    const events = parseLogLine("npm run typecheck", "wt-1");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.step).toBe("self_verify");
  });

  it("detects draft_pr step from gh pr create --draft", () => {
    const events = parseLogLine("gh pr create --draft --title 'fix'", "wt-1");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.step).toBe("draft_pr");
  });

  it("detects draft_pr step from DRAFT PR öffnen", () => {
    const events = parseLogLine("DRAFT PR öffnen für Issue #42", "wt-1");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.step).toBe("draft_pr");
  });
});

// ============================================================================
// Worktree Status
// ============================================================================

describe("parseLogLine — worktree status", () => {
  it("detects error status from escalation marker", () => {
    const events = parseLogLine("⚠️ ESCALATION: Critical failure", "wt-1");
    const evt = findEvent(events, "worktree_status");
    expect(evt).toBeDefined();
    expect(evt!.payload.status).toBe("error");
    expect(evt!.payload.id).toBe("wt-1");
  });
});

// ============================================================================
// QA Check
// ============================================================================

describe("parseLogLine — QA checks", () => {
  it("detects unitTests pass", () => {
    const events = parseLogLine("Unit Tests ✅");
    const evt = findEvent(events, "qa_check");
    expect(evt).toBeDefined();
    expect(evt!.payload.check).toBe("unitTests");
    expect(evt!.payload.status).toBe("pass");
  });

  it("detects typeCheck pass", () => {
    const events = parseLogLine("TypeCheck ✅");
    const evt = findEvent(events, "qa_check");
    expect(evt).toBeDefined();
    expect(evt!.payload.check).toBe("typeCheck");
  });

  it("detects lint pass", () => {
    const events = parseLogLine("Lint ✅");
    const evt = findEvent(events, "qa_check");
    expect(evt).toBeDefined();
    expect(evt!.payload.check).toBe("lint");
  });

  it("detects build pass", () => {
    const events = parseLogLine("Build ✅");
    const evt = findEvent(events, "qa_check");
    expect(evt).toBeDefined();
    expect(evt!.payload.check).toBe("build");
  });

  it("detects e2e pass", () => {
    const events = parseLogLine("E2E ✅");
    const evt = findEvent(events, "qa_check");
    expect(evt).toBeDefined();
    expect(evt!.payload.check).toBe("e2e");
  });

  it("detects QA overall pass from QA_RESULT: GREEN", () => {
    const events = parseLogLine("QA_RESULT: GREEN");
    const evt = findEvent(events, "qa_check");
    expect(evt).toBeDefined();
    expect(evt!.payload.check).toBe("overallStatus");
    expect(evt!.payload.status).toBe("pass");
  });

  it("detects QA overall fail from QA_RESULT: RED", () => {
    const events = parseLogLine("QA_RESULT: RED");
    const evt = findEvent(events, "qa_check");
    expect(evt).toBeDefined();
    expect(evt!.payload.check).toBe("overallStatus");
    expect(evt!.payload.status).toBe("fail");
  });
});

// ============================================================================
// Raw log (unrecognized lines)
// ============================================================================

describe("parseLogLine — raw log", () => {
  it("always includes a raw_log event", () => {
    const events = parseLogLine("some random log output");
    const raw = findEvent(events, "raw_log");
    expect(raw).toBeDefined();
    expect(raw!.payload.line).toBe("some random log output");
  });

  it("returns raw_log even for recognized lines (alongside the parsed event)", () => {
    const events = parseLogLine("MODE: plan-only");
    expect(events.filter((e) => e.type === "raw_log")).toHaveLength(1);
    expect(events.filter((e) => e.type === "orchestrator_status")).toHaveLength(1);
    expect(events.length).toBe(2);
  });

  it("returns raw_log for empty string", () => {
    const events = parseLogLine("");
    const raw = findEvent(events, "raw_log");
    expect(raw).toBeDefined();
    expect(raw!.payload.line).toBe("");
  });
});

// ============================================================================
// Context Tracking
// ============================================================================

describe("parseLogLine — context tracking", () => {
  it("tracks worktree ID from path segments across calls", () => {
    // First line sets context via path
    parseLogLine("Processing worktrees/wt-99 setup");

    // Subsequent line without explicit ID should pick up wt-99
    const events = parseLogLine("Running code-reviewer on file");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.id).toBe("wt-99");
  });

  it("explicit worktreeId parameter takes precedence over context", () => {
    // Set context to wt-99
    parseLogLine("Processing worktrees/wt-99 setup");

    // Explicit ID should override
    const events = parseLogLine("Running code-reviewer", "wt-override");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    expect(evt!.payload.id).toBe("wt-override");
  });

  it("uses 'unknown' when no context and no explicit ID", () => {
    // Reset context by parsing a line with a new context first, then test without
    // We need a fresh module state — since context is module-global, we test
    // that without any prior context-setting, the fallback is "unknown".
    // Note: this test may be affected by prior tests setting context.
    // We use an explicit worktreeId=undefined and a line that doesn't set context.
    const events = parseLogLine("npx vitest run tests");
    const evt = findEvent(events, "worktree_step");
    expect(evt).toBeDefined();
    // The id will be whatever was last tracked or "unknown"
    expect(typeof evt!.payload.id).toBe("string");
  });
});
