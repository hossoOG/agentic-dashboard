# AI Architect Sync — Agentic Dashboard Code Snapshot

> **Purpose:** Precision reference for the strategic AI architect to review the current state of types, parsing logic, Rust bridge, and UI styling before providing Tailwind-class improvements and Regex enhancements.
>
> **Generated from:** `src/store/pipelineStore.ts`, `src/store/logParser.ts`, `src-tauri/src/lib.rs`, `src/index.css`, `tailwind.config.js`
>
> **Last updated:** 2026-03-05 — App successfully starts as Tauri desktop app

---

## 0. Build & Runtime Status

| Item | Status |
|---|---|
| Tauri desktop app | ✅ Starts successfully |
| Vite dev server port | `5173` (changed from 1420 to avoid conflicts) |
| Rust toolchain | `rustc 1.94.0` required minimum (was 1.87, bumped for `time` crate) |
| Icons | ✅ All generated via `tauri icon` from `src-tauri/icons/app-icon.png` |
| `#[tauri::command]` macros | Moved into `mod commands {}` to fix E0255 duplicate-definition error with rustc 1.94 |

---

## 1. Zustand Store Types

### Enums / Union Types

```typescript
// src/store/pipelineStore.ts

export type OrchestratorStatus = "idle" | "planning" | "generated_manifest";

export type WorktreeStep =
  | "setup"
  | "plan"
  | "validate"
  | "code"
  | "review"
  | "self_verify"
  | "draft_pr";

export type WorktreeStatus =
  | "idle"
  | "active"
  | "blocked"
  | "waiting_for_input"
  | "done"
  | "error";

export type QACheckStatus = "pending" | "running" | "pass" | "fail";
```

### Interfaces

```typescript
export interface Worktree {
  id: string;
  branch: string;
  issue: string;
  currentStep: WorktreeStep;
  status: WorktreeStatus;
  completedSteps: WorktreeStep[];
  logs: string[];
  progress: number; // 0–100, derived from STEP_ORDER index
}

export interface QAGate {
  unitTests: QACheckStatus;
  typeCheck: QACheckStatus;
  lint: QACheckStatus;
  build: QACheckStatus;
  e2e: QACheckStatus;
  overallStatus: "idle" | "running" | "pass" | "fail";
}

export interface PipelineState {
  orchestratorStatus: OrchestratorStatus;
  orchestratorLog: string[];   // capped at MAX_ORCHESTRATOR_LOGS = 50
  worktrees: Worktree[];
  qaGate: QAGate;
  isRunning: boolean;
  projectPath: string;
  rawLogs: string[];           // capped at MAX_RAW_LOGS = 200

  // Actions
  setProjectPath: (path: string) => void;
  setOrchestratorStatus: (status: OrchestratorStatus) => void;
  addOrchestratorLog: (log: string) => void;
  spawnWorktree: (id: string, branch: string, issue: string) => void;
  updateWorktreeStep: (id: string, step: WorktreeStep) => void;
  updateWorktreeStatus: (id: string, status: WorktreeStatus) => void;
  addWorktreeLog: (id: string, log: string) => void;   // capped at MAX_WORKTREE_LOGS = 20
  updateQACheck: (check: keyof Omit<QAGate, "overallStatus">, status: QACheckStatus) => void;
  setQAOverallStatus: (status: QAGate["overallStatus"]) => void;
  setIsRunning: (running: boolean) => void;
  addRawLog: (log: string) => void;
  reset: () => void;
}
```

### Step Order (used to compute `progress` and `completedSteps`)

```typescript
const STEP_ORDER: WorktreeStep[] = [
  "setup",       // index 0 →   0%
  "plan",        // index 1 →  17%
  "validate",    // index 2 →  33%
  "code",        // index 3 →  50%
  "review",      // index 4 →  67%
  "self_verify", // index 5 →  83%
  "draft_pr",    // index 6 → 100%
];
```

---

## 2. Log Parser

Full source of `src/store/logParser.ts`:

```typescript
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
```

### Parser Notes for the Architect

| What to improve | Current gap |
|---|---|
| Worktree ID extraction | Spawn patterns don't reliably extract the worktree ID from real Claude CLI output — the real format needs to be confirmed |
| Step keywords | Based on guesses; need real Claude CLI output samples to refine |
| `worktreeId` parameter | `parseLogLine(line, worktreeId?)` — the caller must know which worktree a log line belongs to; currently there is no per-worktree stdout segregation |
| Conflicting patterns | `"failed"` → `blocked` and `"done"` → `done` can both fire on the same line; no priority ordering |

---

## 3. Rust CLI Bridge — `src-tauri/src/lib.rs`

> **Architecture note:** All `#[tauri::command]` functions are wrapped in `mod commands {}` to avoid the rustc 1.94 E0255 macro namespace collision. The `run()` function references them as `commands::start_pipeline` etc.

### Module Structure

```rust
// Top-level: shared types only
pub struct LogEvent { pub line: String, pub stream: String, pub worktree_id: Option<String> }
pub struct PipelineState { pub child_pid: Option<u32> }

mod commands {
    // All #[tauri::command] functions live here
    pub async fn start_pipeline(...)  // spawns `claude m`, streams stdout/stderr as "pipeline-log" events
    pub async fn stop_pipeline(...)   // taskkill /F on Windows, SIGTERM on Unix
    pub async fn pick_project_folder(...) // native folder picker via tauri-plugin-dialog
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::start_pipeline,
            commands::stop_pipeline,
            commands::pick_project_folder,
        ])
        ...
}
```

### `start_pipeline` — Key behavior

```rust
// Spawns `claude m` in the given project_path directory
// Writes "/orchestrate-issues\n" to stdin, then drops stdin (EOF)
// Streams stdout/stderr line-by-line as Tauri "pipeline-log" events
// PID stored in Arc<Mutex<PipelineState>> for stop_pipeline to kill
```

### Tauri Event Schema

```typescript
// Frontend listener (not yet wired up — needs to be added to App.tsx or DashboardMap.tsx)
import { listen } from "@tauri-apps/api/event";

interface LogEvent {
  line: string;
  stream: "stdout" | "stderr";
  worktree_id: string | null;
}

await listen<LogEvent>("pipeline-log", (event) => {
  const parsed = parseLogLine(event.payload.line, event.payload.worktree_id ?? undefined);
  applyParsedEvents(parsed);
});
```

> **Note for Architect:** The frontend does **not** yet wire up this `listen` call. It only runs the mock pipeline today. This is the exact integration point that needs to be completed.

---

## 4. UI / Styling Status

### Color Palette (Tailwind custom colors + CSS)

| Token | Hex | Used for |
|---|---|---|
| `dark-bg` | `#0a0e1a` | Full-page background |
| `dark-card` | `#111827` | All node card backgrounds |
| `dark-border` | `#1f2937` | Default card borders, dividers |
| `neon-green` | `#00ff88` | Done state, QA pass, progress bars |
| `neon-blue` | `#00d4ff` | Active state, Orchestrator planning, SVG data lines |
| `neon-orange` | `#ff6b00` | `waiting_for_input` state |
| `neon-purple` | `#b300ff` | Defined but not yet applied to any component |
| `text-red-400` / `border-red-500` | Tailwind built-in | Blocked / error / QA fail state |

### Custom CSS Utilities (in `index.css`)

- `.grid-bg` — 40×40 px grid of faint `rgba(0,212,255,0.03)` lines on the map canvas
- `.neon-glow-green/blue/red/orange` — CSS `box-shadow` double-ring glow applied to active cards
- `.retro-terminal` — `background: rgba(0,0,0,0.8)`, `border: 1px solid #1f2937`, monospace 11 px font for the mini log windows inside each node
- `.data-packet` — `offset-path` CSS motion path animation (used by SVG moving dots on connection lines)
- `@keyframes pulse-glow` — double-ring `box-shadow` throb (defined but not yet applied via a Tailwind `animate-*` class)
- `@keyframes scan-line` — vertical sweep (triggered via Framer Motion in `DashboardMap`, not the CSS keyframe)
- Font stack: `'JetBrains Mono', 'Fira Code', 'Consolas', monospace` — gives the retro-terminal feel without a web font CDN

### Current Look Description

The nodes are **rounded rectangles** (`rounded-xl`, `border-2`) rather than purely sharp eckig boxes — they have a soft border-radius but the overall aesthetic is already retro-tech through the neon border glow (`box-shadow` double-ring), the dark near-black backgrounds, and the monospace font in the terminal log panes. The map canvas has a faint cyan dot-grid. The connection lines are animated SVG bezier curves with moving `<circle>` data-packet dots driven by Framer Motion `offsetPath` animations. **The main area not yet styled in "Retro-Tech" style** is the Header bar, which is a plain dark card with no glow or scanline effects, and the QA Gate table rows, which use standard Tailwind badge classes rather than custom retro borders.
