# AI Architect Sync — Agentic Dashboard Code Snapshot

> **Purpose:** Precision reference for the strategic AI architect to review the current state of types, parsing logic, Rust bridge, and UI styling before providing Tailwind-class improvements and Regex enhancements.
>
> **Generated from:** `src/store/pipelineStore.ts`, `src/store/logParser.ts`, `src-tauri/src/lib.rs`, `src/index.css`, `tailwind.config.js`, `src/App.tsx`, `src/components/*`
>
> **Last updated:** 2026-03-05 — Tauri listener wired; isometric 3D board; parser context-tracking added

---

## 0. Build & Runtime Status

| Item | Status |
|---|---|
| Tauri desktop app | ✅ Starts successfully |
| Vite dev server port | `5173` (changed from 1420 to avoid conflicts) |
| Rust toolchain | `rustc 1.94.0` required minimum (was 1.87, bumped for `time` crate) |
| Icons | ✅ All generated via `tauri icon` from `src-tauri/icons/app-icon.png` |
| `#[tauri::command]` macros | Moved into `mod commands {}` to fix E0255 duplicate-definition error with rustc 1.94 |
| Tauri `pipeline-log` listener | ✅ Wired up in `App.tsx` with React Strict Mode guard (`listenerActive` ref) |
| Mock pipeline | ✅ Still the default; `Header` START button calls `startMockPipeline()` |

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
  const events: ParsedEvent[] = [];

  // Context-tracking: detect worktree context switches embedded in the log stream.
  // Matches both "worktrees/wt-123" path segments and "Agent ... wt-123" references.
  const contextMatch = line.match(/worktrees\/(wt-\d+)|Agent.*?(wt-\d+)/i);
  if (contextMatch && (contextMatch[1] || contextMatch[2])) {
    currentContextWorktreeId = contextMatch[1] || contextMatch[2];
  }

  // Explicit caller-supplied id takes precedence; fall back to context-tracked id.
  const activeId = worktreeId ?? currentContextWorktreeId;

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
        payload: { id: activeId || "unknown", step: pattern.step },
      });
    } else if ("status" in pattern && pattern.status) {
      events.push({
        type: "worktree_status",
        payload: { id: activeId || "unknown", status: pattern.status },
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
        // "overallStatus" is routed to setQAOverallStatus; all other checks use updateQACheck
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
        store.addRawLog(event.payload.line);
        break;
    }
  }
}
```

### Parser Notes for the Architect

| Topic | Current state |
|---|---|
| Context tracking | Module-global `currentContextWorktreeId` updated via `worktrees/(wt-\d+)` or `Agent.*wt-\d+` matches; caller-supplied `worktreeId` takes precedence |
| Spawn pattern | Matches `Agent(subagent_type:"issue-implementer", isolation:"worktree" … prompt:[BRIEFING #<N>])` — needs real Claude CLI output validation |
| Step keywords | Tuned to PIPELINE.md exact strings (`VERIFY_RESULT: APPROVED`, `gh pr create --draft`, etc.) |
| QA overall status | `QA_RESULT: GREEN/RED` routes to `setQAOverallStatus`; individual checks route via emoji-badge patterns (`Unit Tests.*✅` etc.) |
| `setup` step | No explicit regex — worktrees start with `currentStep: "setup"` from `spawnWorktree`; no log pattern needed unless we want to re-trigger it |

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
// App.tsx — ACTIVE listener with React Strict Mode guard
import { listen } from "@tauri-apps/api/event";

interface LogEvent {
  line: string;
  stream: "stdout" | "stderr";
  // worktree_id is always null today — Rust does not yet demux by worktree
  worktree_id: string | null;
}

// Registered once in useEffect with a listenerActive ref guard to prevent
// double-registration under React Strict Mode's remount cycle.
await listen<LogEvent>("pipeline-log", (event) => {
  const parsed = parseLogLine(event.payload.line, undefined);
  applyParsedEvents(parsed);
});
```

> **Integration status:** The `listen` call is wired up and active. The app will process real `pipeline-log` events from the Rust backend as soon as `start_pipeline` is called with a valid project path. The `worktree_id` field from Rust is always `null` — context demultiplexing happens entirely in `parseLogLine` via the `currentContextWorktreeId` module-global.

> **Mock vs real:** The Header START button currently calls `startMockPipeline()`. Real pipeline mode requires swapping that call to invoke the `start_pipeline` Tauri command with the project path from the store.

---

## 4. UI / Styling Status

### Color Palette (Tailwind custom colors + CSS)

| Token | Hex | Used for |
|---|---|---|
| `dark-bg` | `#0a0e1a` | Full-page background, project path input bg |
| `dark-card` | `#111827` | All node card backgrounds |
| `dark-border` | `#1f2937` | Default card borders, dividers, scrollbar track |
| `neon-green` | `#00ff88` | Done state, QA pass, progress bars, START button |
| `neon-blue` | `#00d4ff` | Active state, Orchestrator planning, SVG data lines, Header title, grid lines |
| `neon-orange` | `#ff6b00` | `waiting_for_input` state |
| `neon-purple` | `#b300ff` | Defined in config but not yet applied to any component |
| `text-red-400` / `border-red-500` | Tailwind built-in | Blocked / error / QA fail state, STOP button |

### Tailwind Animation Additions (in `tailwind.config.js`)

| Class | Keyframe | Usage |
|---|---|---|
| `animate-pulse-slow` | `pulse 3s cubic-bezier(0.4,0,0.6,1) infinite` | Available but not yet applied |
| `animate-flow` | `strokeDashoffset 100→0` | SVG connection line dash animation |

### Custom CSS Utilities (in `index.css`)

| Class | Description |
|---|---|
| `.grid-bg` | 40×40 px faint cyan grid — available but **not used on main canvas** anymore |
| `.neon-glow-green/blue/red/orange` | CSS `box-shadow` double-ring glow on active/status cards |
| `.retro-terminal` | `background: rgba(0,0,0,0.8)`, `border: 1px solid #1f2937`, monospace 11 px — used in Header and log panes |
| `.data-packet` | `offset-distance` CSS motion path animation (SVG moving dots) |
| `.perspective-container` | `perspective: 2000px` wrapper; `100vw × 100vh`; flex center — wraps the entire map canvas |
| `.isometric-board` | `rotateX(60deg) rotateZ(-45deg)` 3D transform; `140vw × 140vh`; own 50×50 px grid at 0.1 opacity |
| `.isometric-node` | `translateZ(40px)` lift per node; `box-shadow` with depth cue + neon-blue edge; hover lifts to `translateZ(50px)` |

### Keyframes defined in `index.css`

| Name | Purpose |
|---|---|
| `dataflow` | `stroke-dashoffset` sweep on SVG connection paths |
| `pulse-glow` | Double-ring `box-shadow` throb (defined; not yet wired to a Tailwind `animate-*` class) |
| `scan-line` | Vertical `translateY` sweep (defined in CSS but **not used** — the ambient scan line in `DashboardMap` is driven by Framer Motion `animate={{ y }}`) |
| `movePacket` | `offset-distance 0%→100%` for `.data-packet` SVG circles |

### Layout Architecture (`DashboardMap.tsx`)

```
<div class="perspective-container bg-dark-bg">        ← viewport, perspective origin
  <ConnectionLines … />                               ← SVG bezier layer, flat (outside isometric board)
  <div class="isometric-board">                       ← 3D rotated grid canvas
    <OrchestratorNode />   // absolute top-8 center, z-10 isometric-node
    <WorktreeNode × N />   // absolute middle, flex-wrap, Framer Motion spring entry
    <QAGateNode />         // absolute bottom-8 center, z-10 isometric-node
    <motion.div />         // ambient scan-line, opacity-10, neon-blue gradient h-px
  </div>
</div>
```

### `App.tsx` Structure

```
useEffect()           → registers listen("pipeline-log") once (Strict Mode guard via listenerActive ref)
return (
  <div flex flex-col h-screen w-screen overflow-hidden bg-dark-bg>
    <Header />          → fixed-height toolbar: title, path input, LIVE/IDLE badge, START/STOP button
    <DashboardMap />    → flex-1, isometric 3D canvas
  </div>
)
```

### Node Aesthetic Summary

| Node | Shape | Glow | Corners |
|---|---|---|---|
| `OrchestratorNode` | `w-80 border-2 rounded-none` | Status-driven neon glow class | Sharp (`rounded-none`) |
| `WorktreeNode` | `border-2 rounded-none` | Status-driven neon glow | Sharp (`rounded-none`) |
| `QAGateNode` | `w-96 border-2 rounded-none` | Status-driven neon glow | Sharp (`rounded-none`) |
| Header | `border-b-2 retro-terminal` | None (no neon glow on header) | N/A (bar) |

> **Remaining styling gaps:** `neon-purple` color is unused. The `pulse-glow` keyframe has no Tailwind `animate-*` binding. The `scan-line` CSS keyframe is superseded by the Framer Motion version. The `.grid-bg` class is defined but the grid is now provided by `.isometric-board`'s `background-image`.
