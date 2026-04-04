import { create } from "zustand";
import type { ADPError } from "../protocols/schema";

export type OrchestratorStatus = "idle" | "planning" | "generated_manifest";

const MAX_ORCHESTRATOR_LOGS = 50;
const MAX_WORKTREE_LOGS = 20;
const MAX_ERRORS = 100;

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

// --- Neue Typen ---

export interface StepTiming {
  step: WorktreeStep;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  lastUpdated: number;
}

export interface PipelineError {
  id: string;
  timestamp: number;
  source: string;
  sourceId?: string;
  error: ADPError;
  acknowledged: boolean;
}

export interface SpawnManifest {
  generatedAt: number;
  entries: ManifestEntry[];
}

export interface ManifestEntry {
  id: string;
  branch: string;
  issue: string;
  priority: number;
}

const DEFAULT_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalCostUsd: 0,
  lastUpdated: 0,
};

export interface Worktree {
  id: string;
  branch: string;
  issue: string;
  agentId?: string; // Cross-reference to agentStore DetectedAgent (SSOT for agent identity)
  currentStep: WorktreeStep;
  status: WorktreeStatus;
  completedSteps: WorktreeStep[];
  logs: string[];
  progress: number; // 0-100
  spawnedAt: number;
  stepTimings: StepTiming[];
  currentStepStartedAt?: number;
  tokenUsage: TokenUsage;
  lastError?: { code: string; message: string };
  retryCount: number;
  priority: number;
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
  orchestratorLog: string[];
  worktrees: Worktree[];
  qaGate: QAGate;
  isRunning: boolean;
  projectPath: string;
  pipelineStartedAt: number | null;
  pipelineStoppedAt: number | null;
  manifest: SpawnManifest | null;
  errors: PipelineError[];
  totalTokenUsage: TokenUsage;
  mode: "real" | "mock";

  // Actions
  setProjectPath: (path: string) => void;
  setOrchestratorStatus: (status: OrchestratorStatus) => void;
  addOrchestratorLog: (log: string) => void;
  spawnWorktree: (id: string, branch: string, issue: string, priority?: number, agentId?: string) => void;
  updateWorktreeStep: (id: string, step: WorktreeStep) => void;
  updateWorktreeStatus: (id: string, status: WorktreeStatus, reason?: string) => void;
  addWorktreeLog: (id: string, log: string) => void;
  updateQACheck: (check: keyof Omit<QAGate, "overallStatus">, status: QACheckStatus) => void;
  setQAOverallStatus: (status: QAGate["overallStatus"]) => void;
  setIsRunning: (running: boolean) => void;
  setManifest: (manifest: SpawnManifest) => void;
  addError: (error: Omit<PipelineError, "id" | "timestamp" | "acknowledged">) => void;
  acknowledgeError: (errorId: string) => void;
  clearErrors: () => void;
  updateWorktreeTokenUsage: (worktreeId: string, usage: Partial<Omit<TokenUsage, "lastUpdated">>) => void;
  reset: () => void;
}

const STEP_ORDER: WorktreeStep[] = [
  "setup",
  "plan",
  "validate",
  "code",
  "review",
  "self_verify",
  "draft_pr",
];

const initialQAGate: QAGate = {
  unitTests: "pending",
  typeCheck: "pending",
  lint: "pending",
  build: "pending",
  e2e: "pending",
  overallStatus: "idle",
};

export const usePipelineStore = create<PipelineState>((set) => ({
  orchestratorStatus: "idle",
  orchestratorLog: [],
  worktrees: [],
  qaGate: initialQAGate,
  isRunning: false,
  projectPath: "",
  pipelineStartedAt: null,
  pipelineStoppedAt: null,
  manifest: null,
  errors: [],
  totalTokenUsage: { ...DEFAULT_TOKEN_USAGE },
  mode: "mock",

  setProjectPath: (path) => set({ projectPath: path }),

  setOrchestratorStatus: (status) =>
    set({ orchestratorStatus: status }),

  addOrchestratorLog: (log) =>
    set((state) => ({
      orchestratorLog: [...state.orchestratorLog, log].slice(-MAX_ORCHESTRATOR_LOGS),
    })),

  spawnWorktree: (id, branch, issue, priority = 0, agentId?) =>
    set((state) => {
      const now = Date.now();
      return {
        worktrees: [
          ...state.worktrees,
          {
            id,
            branch,
            issue,
            agentId,
            currentStep: "setup" as WorktreeStep,
            status: "active" as WorktreeStatus,
            completedSteps: [],
            logs: [],
            progress: 0,
            spawnedAt: now,
            stepTimings: [{ step: "setup" as WorktreeStep, startedAt: now }],
            currentStepStartedAt: now,
            tokenUsage: { ...DEFAULT_TOKEN_USAGE },
            retryCount: 0,
            priority,
          },
        ],
      };
    }),

  updateWorktreeStep: (id, step) =>
    set((state) => {
      const now = Date.now();
      return {
        worktrees: state.worktrees.map((wt) => {
          if (wt.id !== id) return wt;
          const stepIndex = STEP_ORDER.indexOf(step);
          if (stepIndex < 0) return wt; // Unknown step — ignore silently
          const progress = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100);
          const completedSteps = STEP_ORDER.slice(0, stepIndex) as WorktreeStep[];

          // Complete the previous step timing
          const stepTimings = wt.stepTimings.map((st, i) => {
            if (i === wt.stepTimings.length - 1 && !st.completedAt) {
              const completedAt = now;
              return { ...st, completedAt, durationMs: completedAt - st.startedAt };
            }
            return st;
          });

          // Start timing for the new step
          stepTimings.push({ step, startedAt: now });

          return {
            ...wt,
            currentStep: step,
            completedSteps,
            progress,
            stepTimings,
            currentStepStartedAt: now,
          };
        }),
      };
    }),

  updateWorktreeStatus: (id, status, reason?) =>
    set((state) => ({
      worktrees: state.worktrees.map((wt) => {
        if (wt.id !== id) return wt;
        const updates: Partial<Worktree> = { status };

        // On error, record the reason
        if (status === "error" && reason) {
          updates.lastError = { code: "WORKTREE_ERROR", message: reason };
        }

        // On done, complete the last step timing
        if (status === "done" || status === "error") {
          const now = Date.now();
          updates.stepTimings = wt.stepTimings.map((st, i) => {
            if (i === wt.stepTimings.length - 1 && !st.completedAt) {
              return { ...st, completedAt: now, durationMs: now - st.startedAt };
            }
            return st;
          });
          updates.currentStepStartedAt = undefined;
        }

        return { ...wt, ...updates };
      }),
    })),

  addWorktreeLog: (id, log) =>
    set((state) => ({
      worktrees: state.worktrees.map((wt) =>
        wt.id === id
          ? { ...wt, logs: [...wt.logs, log].slice(-MAX_WORKTREE_LOGS) }
          : wt
      ),
    })),

  updateQACheck: (check, status) =>
    set((state) => ({
      qaGate: { ...state.qaGate, [check]: status },
    })),

  setQAOverallStatus: (status) =>
    set((state) => ({
      qaGate: { ...state.qaGate, overallStatus: status },
    })),

  setIsRunning: (running) =>
    set((state) => {
      const updates: Partial<PipelineState> = { isRunning: running };
      if (running && !state.pipelineStartedAt) {
        updates.pipelineStartedAt = Date.now();
        updates.pipelineStoppedAt = null;
      } else if (!running && state.pipelineStartedAt) {
        updates.pipelineStoppedAt = Date.now();
      }
      return updates;
    }),

  setManifest: (manifest) => set({ manifest }),

  addError: (error) =>
    set((state) => {
      const newError: PipelineError = {
        ...error,
        id: crypto?.randomUUID?.() ?? `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        acknowledged: false,
      };
      return {
        errors: [...state.errors, newError].slice(-MAX_ERRORS),
      };
    }),

  acknowledgeError: (errorId) =>
    set((state) => ({
      errors: state.errors.map((e) =>
        e.id === errorId ? { ...e, acknowledged: true } : e
      ),
    })),

  clearErrors: () => set({ errors: [] }),

  updateWorktreeTokenUsage: (worktreeId, usage) =>
    set((state) => {
      const now = Date.now();
      let deltaInput = 0;
      let deltaOutput = 0;
      let deltaCost = 0;

      const worktrees = state.worktrees.map((wt) => {
        if (wt.id !== worktreeId) return wt;
        const newInput = usage.inputTokens ?? 0;
        const newOutput = usage.outputTokens ?? 0;
        const newCost = usage.totalCostUsd ?? 0;
        deltaInput = newInput;
        deltaOutput = newOutput;
        deltaCost = newCost;
        return {
          ...wt,
          tokenUsage: {
            inputTokens: wt.tokenUsage.inputTokens + newInput,
            outputTokens: wt.tokenUsage.outputTokens + newOutput,
            totalCostUsd: wt.tokenUsage.totalCostUsd + newCost,
            lastUpdated: now,
          },
        };
      });

      return {
        worktrees,
        totalTokenUsage: {
          inputTokens: state.totalTokenUsage.inputTokens + deltaInput,
          outputTokens: state.totalTokenUsage.outputTokens + deltaOutput,
          totalCostUsd: state.totalTokenUsage.totalCostUsd + deltaCost,
          lastUpdated: now,
        },
      };
    }),

  reset: () =>
    set({
      orchestratorStatus: "idle",
      orchestratorLog: [],
      worktrees: [],
      qaGate: initialQAGate,
      isRunning: false,
      pipelineStartedAt: null,
      pipelineStoppedAt: null,
      manifest: null,
      errors: [],
      totalTokenUsage: { ...DEFAULT_TOKEN_USAGE },
      mode: "mock",
    }),
}));

// ============================================================================
// SELEKTOREN — Exportierte Funktionen fuer performante Re-Render-Kontrolle
// ============================================================================

export const selectWorktreeById = (id: string) => (state: PipelineState) =>
  state.worktrees.find((wt) => wt.id === id) ?? null;

export const selectActiveWorktrees = (state: PipelineState) =>
  state.worktrees.filter((wt) => wt.status === "active");

export const selectErrorWorktrees = (state: PipelineState) =>
  state.worktrees.filter((wt) => wt.status === "error");

export const selectUnacknowledgedErrors = (state: PipelineState) =>
  state.errors.filter((e) => !e.acknowledged);

export const selectPipelineSummary = (state: PipelineState) => {
  const now = Date.now();
  return {
    totalWorktrees: state.worktrees.length,
    activeCount: state.worktrees.filter((wt) => wt.status === "active").length,
    doneCount: state.worktrees.filter((wt) => wt.status === "done").length,
    errorCount: state.worktrees.filter((wt) => wt.status === "error").length,
    totalTokens: state.totalTokenUsage.inputTokens + state.totalTokenUsage.outputTokens,
    uptimeMs: state.pipelineStartedAt
      ? (state.pipelineStoppedAt ?? now) - state.pipelineStartedAt
      : 0,
  };
};
