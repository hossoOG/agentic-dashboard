import { create } from "zustand";

export type OrchestratorStatus = "idle" | "planning" | "generated_manifest";

const MAX_ORCHESTRATOR_LOGS = 50;
const MAX_WORKTREE_LOGS = 20;
const MAX_RAW_LOGS = 200;

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

export interface Worktree {
  id: string;
  branch: string;
  issue: string;
  currentStep: WorktreeStep;
  status: WorktreeStatus;
  completedSteps: WorktreeStep[];
  logs: string[];
  progress: number; // 0-100
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
  rawLogs: string[];

  // Actions
  setProjectPath: (path: string) => void;
  setOrchestratorStatus: (status: OrchestratorStatus) => void;
  addOrchestratorLog: (log: string) => void;
  spawnWorktree: (id: string, branch: string, issue: string) => void;
  updateWorktreeStep: (id: string, step: WorktreeStep) => void;
  updateWorktreeStatus: (id: string, status: WorktreeStatus) => void;
  addWorktreeLog: (id: string, log: string) => void;
  updateQACheck: (check: keyof Omit<QAGate, "overallStatus">, status: QACheckStatus) => void;
  setQAOverallStatus: (status: QAGate["overallStatus"]) => void;
  setIsRunning: (running: boolean) => void;
  addRawLog: (log: string) => void;
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
  rawLogs: [],

  setProjectPath: (path) => set({ projectPath: path }),

  setOrchestratorStatus: (status) =>
    set({ orchestratorStatus: status }),

  addOrchestratorLog: (log) =>
    set((state) => ({
      orchestratorLog: [...state.orchestratorLog.slice(-MAX_ORCHESTRATOR_LOGS), log],
    })),

  spawnWorktree: (id, branch, issue) =>
    set((state) => ({
      worktrees: [
        ...state.worktrees,
        {
          id,
          branch,
          issue,
          currentStep: "setup",
          status: "active",
          completedSteps: [],
          logs: [],
          progress: 0,
        },
      ],
    })),

  updateWorktreeStep: (id, step) =>
    set((state) => ({
      worktrees: state.worktrees.map((wt) => {
        if (wt.id !== id) return wt;
        const stepIndex = STEP_ORDER.indexOf(step);
        const progress = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100);
        const completedSteps = STEP_ORDER.slice(0, stepIndex) as WorktreeStep[];
        return { ...wt, currentStep: step, completedSteps, progress };
      }),
    })),

  updateWorktreeStatus: (id, status) =>
    set((state) => ({
      worktrees: state.worktrees.map((wt) =>
        wt.id === id ? { ...wt, status } : wt
      ),
    })),

  addWorktreeLog: (id, log) =>
    set((state) => ({
      worktrees: state.worktrees.map((wt) =>
        wt.id === id
          ? { ...wt, logs: [...wt.logs.slice(-MAX_WORKTREE_LOGS), log] }
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

  setIsRunning: (running) => set({ isRunning: running }),

  addRawLog: (log) =>
    set((state) => ({
      rawLogs: [...state.rawLogs.slice(-MAX_RAW_LOGS), log],
    })),

  reset: () =>
    set({
      orchestratorStatus: "idle",
      orchestratorLog: [],
      worktrees: [],
      qaGate: initialQAGate,
      isRunning: false,
      rawLogs: [],
    }),
}));
