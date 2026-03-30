import { usePipelineStore } from "./pipelineStore";
import type { WorktreeStep, WorktreeStatus } from "./pipelineStore";
import { logError } from "../utils/errorLogger";

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

// Module-global state for demultiplexing worktree context from a linear log stream.
// Tracks which worktree is "active" based on context-switch markers in the log output.
let currentContextWorktreeId: string | undefined = undefined;

// Regex patterns tuned to the exact output described in PIPELINE.md
const PATTERNS = [
  // Orchestrator Phase
  { regex: /MODE:\s*plan-only/i, event: { type: "orchestrator_status", payload: { status: "planning" } } },
  { regex: /SPAWN_MANIFEST/i, event: { type: "orchestrator_status", payload: { status: "generated_manifest" } } },

  // Worktree Spawning (detecting the subagent call)
  { regex: /Agent\(subagent_type:"issue-implementer",\s*isolation:"worktree".*?prompt:\[BRIEFING\s*#?(\w+)\]/i, extract: (m: RegExpMatchArray) => ({
    type: "worktree_spawn",
    payload: { id: `wt-${m[1] || Date.now()}`, branch: `issue-${m[1]}`, issue: m[1] || "unknown" },
  })},

  // Steps Pipeline (matching exact bash tools or comments from PIPELINE.md)
  { regex: /docs\/plans\/.*\.md/, step: "plan" as WorktreeStep },
  { regex: /VERIFY_RESULT:\s*APPROVED/, step: "validate" as WorktreeStep },
  { regex: /code-reviewer/, step: "review" as WorktreeStep },
  { regex: /npx vitest run|npm run typecheck|npm run lint/, step: "self_verify" as WorktreeStep },
  { regex: /gh pr create --draft|DRAFT PR öffnen/, step: "draft_pr" as WorktreeStep },

  // QA Orchestrator & E2E (Pre-PR Gate)
  { regex: /\[QA Orchestrator\] QA Report/, event: { type: "orchestrator_status", payload: { status: "idle" } } },
  { regex: /Unit Tests.*?✅/, qa: "unitTests", qaStatus: "pass" },
  { regex: /TypeCheck.*?✅/, qa: "typeCheck", qaStatus: "pass" },
  { regex: /Lint.*?✅/, qa: "lint", qaStatus: "pass" },
  { regex: /Build.*?✅/, qa: "build", qaStatus: "pass" },
  { regex: /E2E.*?✅/, qa: "e2e", qaStatus: "pass" },
  { regex: /QA_RESULT:\s*GREEN/, event: { type: "qa_check", payload: { check: "overallStatus", status: "pass" } } },
  { regex: /QA_RESULT:\s*RED/, event: { type: "qa_check", payload: { check: "overallStatus", status: "fail" } } },

  // Escalation / Errors
  { regex: /⚠️.*ESCALATION/i, status: "error" as WorktreeStatus },
];

export function parseLogLine(line: string, worktreeId?: string): ParsedEvent[] {
  // Defensive: return empty array for null/undefined/non-string input
  if (line == null || typeof line !== "string") {
    logError("logParser.parseLogLine", `called with non-string input: ${typeof line}`);
    return [];
  }

  try {
    const events: ParsedEvent[] = [];

    // Context-tracking: detect worktree context switches embedded in the log stream.
    // Matches both "worktrees/wt-123" path segments and "Agent ... wt-123" references.
    const contextMatch = line.match(/worktrees\/(wt-\d+)|Agent.*?(wt-\d+)/i);
    if (contextMatch && (contextMatch[1] || contextMatch[2])) {
      currentContextWorktreeId = contextMatch[1] ?? contextMatch[2];
    }

    // Explicit caller-supplied id takes precedence; fall back to context-tracked id.
    const activeId = worktreeId ?? currentContextWorktreeId;

    for (const pattern of PATTERNS) {
      const match = line.match(pattern.regex);
      if (!match) continue;

      if ("event" in pattern && pattern.event) {
        events.push(pattern.event as ParsedEvent);
      } else if ("extract" in pattern && pattern.extract) {
        const extracted = pattern.extract(match);
        if (extracted) {
          events.push(extracted as ParsedEvent);
        }
      } else if ("step" in pattern && pattern.step) {
        events.push({
          type: "worktree_step",
          payload: { id: activeId ?? "unknown", step: pattern.step },
        });
      } else if ("status" in pattern && pattern.status) {
        events.push({
          type: "worktree_status",
          payload: { id: activeId ?? "unknown", status: pattern.status },
        });
      } else if ("qa" in pattern && pattern.qa) {
        events.push({
          type: "qa_check",
          payload: { check: (pattern.qa as string) ?? "unknown", status: (pattern.qaStatus as string) ?? "pending" },
        });
      }
    }

    // Always add raw log
    events.push({ type: "raw_log", payload: { line } });

    return events;
  } catch (err) {
    logError("logParser.parseLogLine", err);
    return [];
  }
}

export function applyParsedEvents(events: ParsedEvent[]): void {
  if (!Array.isArray(events) || events.length === 0) return;

  try {
    const store = usePipelineStore.getState();

    for (const event of events) {
      if (!event?.type || !event?.payload) continue;

      try {
        switch (event.type) {
          case "orchestrator_status":
            store.setOrchestratorStatus(event.payload.status as Parameters<typeof store.setOrchestratorStatus>[0]);
            break;
          case "orchestrator_log":
            store.addOrchestratorLog(event.payload.log ?? "");
            break;
          case "worktree_spawn":
            store.spawnWorktree(
              event.payload.id ?? "unknown",
              event.payload.branch ?? "unknown",
              event.payload.issue ?? "unknown"
            );
            break;
          case "worktree_step":
            store.updateWorktreeStep(event.payload.id ?? "unknown", event.payload.step as WorktreeStep);
            break;
          case "worktree_status":
            store.updateWorktreeStatus(event.payload.id ?? "unknown", event.payload.status as WorktreeStatus);
            break;
          case "worktree_log":
            store.addWorktreeLog(event.payload.id ?? "unknown", event.payload.log ?? "");
            break;
          case "qa_check": {
            if (event.payload.check === "overallStatus") {
              store.setQAOverallStatus(event.payload.status as "idle" | "running" | "pass" | "fail");
            } else {
              store.updateQACheck(
                event.payload.check as "unitTests" | "typeCheck" | "lint" | "build" | "e2e",
                event.payload.status as "pending" | "running" | "pass" | "fail"
              );
            }
            break;
          }
          case "raw_log":
            store.addRawLog(event.payload.line ?? "");
            break;
        }
      } catch (eventErr) {
        logError(`logParser.applyEvent(${event.type})`, eventErr);
      }
    }
  } catch (err) {
    logError("logParser.applyParsedEvents", err);
  }
}
