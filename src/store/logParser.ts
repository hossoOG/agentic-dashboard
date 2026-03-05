import { usePipelineStore } from "./pipelineStore";
import type { WorktreeStep, WorktreeStatus } from "./pipelineStore";

export interface ParsedEvent {
  type:
    | "orchestrator_status"
    | "orchestrator_log"
    | "worktree_spawn"
    | "worktree_step"
    | "worktree_status"
    | "worktree_log"
    | "qa_check"
    | "raw_log";
  payload: Record<string, string>;
}

// Regex patterns for the pipeline
const PATTERNS = [
  // Orchestrator patterns
  { regex: /SPAWN_MANIFEST/i, event: { type: "orchestrator_status", payload: { status: "generated_manifest" } } },
  { regex: /scanning.*(issue|repo)/i, event: { type: "orchestrator_status", payload: { status: "planning" } } },
  { regex: /orchestrat/i, event: { type: "orchestrator_status", payload: { status: "planning" } } },

  // Worktree spawn
  { regex: /spawning.*worktree.*?(wt-\d+|worktree-\d+)/i, extract: (m: RegExpMatchArray) => ({
    type: "worktree_spawn",
    payload: { id: m[1] || `wt-${Date.now()}`, branch: "unknown", issue: "unknown" }
  })},
  { regex: /git worktree add.*?([\w\/\-]+)/i, extract: (m: RegExpMatchArray) => ({
    type: "worktree_spawn",
    payload: { id: `wt-${Date.now()}`, branch: m[1] || "unknown", issue: "unknown" }
  })},

  // Step detection (maps terminal output to WorktreeStep)
  { regex: /plan.validat/i, step: "validate" as WorktreeStep },
  { regex: /generating.*plan|plan.*generat/i, step: "plan" as WorktreeStep },
  { regex: /implementing|writing.*code|code.*implement/i, step: "code" as WorktreeStep },
  { regex: /self.review|review.*check/i, step: "review" as WorktreeStep },
  { regex: /npx vitest run|running.*tests|vitest/i, step: "self_verify" as WorktreeStep },
  { regex: /npx tsc|tsc.*noEmit|typecheck/i, step: "self_verify" as WorktreeStep },
  { regex: /draft.*pr|creating.*pr|gh.*pr.*create/i, step: "draft_pr" as WorktreeStep },
  { regex: /git worktree add|npm install|setup.*complete/i, step: "setup" as WorktreeStep },

  // Status patterns
  { regex: /blocked|error|failed|FAILED/i, status: "blocked" as WorktreeStatus },
  { regex: /waiting.*input|needs.*approval/i, status: "waiting_for_input" as WorktreeStatus },
  { regex: /complete|done|✓|SUCCESS/i, status: "done" as WorktreeStatus },

  // QA patterns
  { regex: /vitest.*pass|tests.*passed|✓.*tests/i, qa: "unitTests", qaStatus: "pass" },
  { regex: /vitest.*fail|tests.*failed|✗.*tests/i, qa: "unitTests", qaStatus: "fail" },
  { regex: /tsc.*ok|type.*check.*pass|no.*type.*error/i, qa: "typeCheck", qaStatus: "pass" },
  { regex: /tsc.*error|type.*error/i, qa: "typeCheck", qaStatus: "fail" },
  { regex: /eslint.*ok|lint.*pass|no.*lint.*error/i, qa: "lint", qaStatus: "pass" },
  { regex: /eslint.*error|lint.*fail/i, qa: "lint", qaStatus: "fail" },
  { regex: /build.*success|build.*complete/i, qa: "build", qaStatus: "pass" },
  { regex: /build.*fail|build.*error/i, qa: "build", qaStatus: "fail" },
  { regex: /e2e.*pass|playwright.*ok/i, qa: "e2e", qaStatus: "pass" },
  { regex: /e2e.*fail|playwright.*fail/i, qa: "e2e", qaStatus: "fail" },
];

export function parseLogLine(line: string, worktreeId?: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  for (const pattern of PATTERNS) {
    const match = line.match(pattern.regex);
    if (!match) continue;

    if ("event" in pattern && pattern.event) {
      events.push(pattern.event as ParsedEvent);
    } else if ("extract" in pattern && pattern.extract) {
      events.push(pattern.extract(match) as ParsedEvent);
    } else if ("step" in pattern && pattern.step) {
      events.push({
        type: "worktree_step",
        payload: { id: worktreeId || "unknown", step: pattern.step },
      });
    } else if ("status" in pattern && pattern.status) {
      events.push({
        type: "worktree_status",
        payload: { id: worktreeId || "unknown", status: pattern.status },
      });
    } else if ("qa" in pattern && pattern.qa) {
      events.push({
        type: "qa_check",
        payload: { check: pattern.qa as string, status: pattern.qaStatus as string },
      });
    }
  }

  // Always add raw log
  events.push({ type: "raw_log", payload: { line } });

  return events;
}

export function applyParsedEvents(events: ParsedEvent[]): void {
  const store = usePipelineStore.getState();

  for (const event of events) {
    switch (event.type) {
      case "orchestrator_status":
        store.setOrchestratorStatus(event.payload.status as Parameters<typeof store.setOrchestratorStatus>[0]);
        break;
      case "orchestrator_log":
        store.addOrchestratorLog(event.payload.log);
        break;
      case "worktree_spawn":
        store.spawnWorktree(event.payload.id, event.payload.branch, event.payload.issue);
        break;
      case "worktree_step":
        store.updateWorktreeStep(event.payload.id, event.payload.step as WorktreeStep);
        break;
      case "worktree_status":
        store.updateWorktreeStatus(event.payload.id, event.payload.status as WorktreeStatus);
        break;
      case "worktree_log":
        store.addWorktreeLog(event.payload.id, event.payload.log);
        break;
      case "qa_check": {
        store.updateQACheck(
          event.payload.check as "unitTests" | "typeCheck" | "lint" | "build" | "e2e",
          event.payload.status as "pending" | "running" | "pass" | "fail"
        );
        break;
      }
      case "raw_log":
        store.addRawLog(event.payload.line);
        break;
    }
  }
}
