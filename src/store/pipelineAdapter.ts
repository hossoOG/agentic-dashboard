/**
 * Pipeline Adapter — maps agentStore data to visualization structures.
 *
 * Provides two hooks:
 * - useAdaptedTaskTree: Tree-based adapter for the new TaskTreeView (Phase 3)
 * - useAdaptedPipelineData: Legacy adapter for the 3-column DashboardMap (deprecated)
 */

import { useMemo } from "react";
import { useAgentStore } from "./agentStore";
import type { DetectedAgent } from "./agentStore";
import type {
  Worktree,
  WorktreeStep,
  WorktreeStatus,
  OrchestratorStatus,
  QAGate,
} from "./pipelineStore";

// ============================================================================
// Task Tree Types (new)
// ============================================================================

export interface TaskTreeNode {
  agent: DetectedAgent;
  children: TaskTreeNode[];
}

export interface AdaptedTaskTreeData {
  hasAgents: boolean;
  roots: TaskTreeNode[];
  summary: {
    total: number;
    running: number;
    completed: number;
    error: number;
    pending: number;
    blocked: number;
  };
  taskSummary: { pending: number; completed: number } | null;
}

// ============================================================================
// Task Tree Hook (new)
// ============================================================================

export function useAdaptedTaskTree(sessionId?: string | null): AdaptedTaskTreeData {
  const agents = useAgentStore((s) => s.agents);
  const taskSummary = useAgentStore((s) => s.taskSummary);

  return useMemo(() => {
    let agentList = Object.values(agents);
    if (sessionId) {
      agentList = agentList.filter((a) => a.sessionId === sessionId);
    }
    const hasAgents = agentList.length > 0;

    if (!hasAgents) {
      return {
        hasAgents: false,
        roots: [],
        summary: { total: 0, running: 0, completed: 0, error: 0, pending: 0, blocked: 0 },
        taskSummary,
      };
    }

    // Build tree: find roots (agents with no parent or whose parent is not in this session)
    const agentMap = new Map(agentList.map((a) => [a.id, a]));
    const roots: TaskTreeNode[] = [];

    function buildNode(agent: DetectedAgent): TaskTreeNode {
      const children = agentList
        .filter((a) => a.parentAgentId === agent.id)
        .sort((a, b) => a.detectedAt - b.detectedAt)
        .map(buildNode);
      return { agent, children };
    }

    agentList
      .filter((a) => !a.parentAgentId || !agentMap.has(a.parentAgentId))
      .sort((a, b) => a.detectedAt - b.detectedAt)
      .forEach((a) => roots.push(buildNode(a)));

    const summary = {
      total: agentList.length,
      running: agentList.filter((a) => a.status === "running").length,
      completed: agentList.filter((a) => a.status === "completed").length,
      error: agentList.filter((a) => a.status === "error").length,
      pending: agentList.filter((a) => a.status === "pending").length,
      blocked: agentList.filter((a) => a.status === "blocked").length,
    };

    return { hasAgents: true, roots, summary, taskSummary };
  }, [agents, sessionId, taskSummary]);
}

// ============================================================================
// Legacy Adapter (deprecated — used by DashboardMap until Phase 3 replaces it)
// ============================================================================

/** @internal Exported for testing */
export function mapAgentStatusToWorktreeStatus(agent: DetectedAgent): WorktreeStatus {
  switch (agent.status) {
    case "running":
      return "active";
    case "completed":
      return "done";
    case "error":
      return "error";
    case "blocked":
      return "blocked";
    default:
      return "idle";
  }
}

/** @internal Exported for testing */
export function deriveCurrentStep(agent: DetectedAgent): WorktreeStep {
  if (agent.status === "completed") return "draft_pr";
  if (agent.status === "error") return "setup";
  if (agent.status === "running") return "code";
  return "setup";
}

/** @internal Exported for testing */
export const STEP_ORDER: WorktreeStep[] = [
  "setup", "plan", "validate", "code", "review", "self_verify", "draft_pr",
];

/** @internal Exported for testing */
export function deriveCompletedSteps(currentStep: WorktreeStep): WorktreeStep[] {
  const idx = STEP_ORDER.indexOf(currentStep);
  if (idx <= 0) return [];
  return STEP_ORDER.slice(0, idx);
}

/** @internal Exported for testing */
export function deriveProgress(_currentStep: WorktreeStep, status: DetectedAgent["status"]): number {
  if (status === "completed") return 100;
  if (status === "error") return 0;
  if (status === "running") return 50;
  return 0;
}

// ============================================================================
// Legacy Adapter Types
// ============================================================================

export interface AdaptedPipelineData {
  hasAgents: boolean;
  worktrees: Worktree[];
  orchestratorStatus: OrchestratorStatus;
  orchestratorLog: string[];
  qaGate: QAGate;
  summary: {
    total: number;
    running: number;
    completed: number;
    error: number;
  };
}

// ============================================================================
// Legacy Adapter Hook
// ============================================================================

const DEFAULT_TOKEN_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalCostUsd: 0,
  lastUpdated: 0,
};

const IDLE_QA_GATE: QAGate = {
  unitTests: "pending",
  typeCheck: "pending",
  lint: "pending",
  build: "pending",
  e2e: "pending",
  overallStatus: "idle",
};

/** @deprecated Use useAdaptedTaskTree instead */
export function useAdaptedPipelineData(sessionId?: string | null): AdaptedPipelineData {
  const agents = useAgentStore((s) => s.agents);
  const agentWorktrees = useAgentStore((s) => s.worktrees);

  return useMemo(() => {
    let agentList = Object.values(agents);
    if (sessionId) {
      agentList = agentList.filter((a) => a.sessionId === sessionId);
    }
    const hasAgents = agentList.length > 0;

    if (!hasAgents) {
      return {
        hasAgents: false,
        worktrees: [],
        orchestratorStatus: "idle" as OrchestratorStatus,
        orchestratorLog: [],
        qaGate: IDLE_QA_GATE,
        summary: { total: 0, running: 0, completed: 0, error: 0 },
      };
    }

    const worktrees: Worktree[] = agentList.map((agent) => {
      const wtInfo = agent.worktreePath
        ? agentWorktrees[agent.worktreePath]
        : null;

      const status = mapAgentStatusToWorktreeStatus(agent);
      const currentStep = deriveCurrentStep(agent);
      const completedSteps = deriveCompletedSteps(currentStep);
      const progress = deriveProgress(currentStep, agent.status);

      const logs: string[] = [];
      if (agent.task) logs.push(agent.task);
      if (agent.worktreePath) logs.push(`Worktree: ${agent.worktreePath.split(/[\\/]/).pop()}`);
      if (agent.status === "error") logs.push("Fehler aufgetreten");
      if (agent.status === "completed" && agent.completedAt) {
        const durationSec = Math.round((agent.completedAt - agent.detectedAt) / 1000);
        logs.push(`Abgeschlossen nach ${durationSec}s`);
      }

      return {
        id: agent.id,
        branch: wtInfo?.branch ?? agent.name ?? agent.id,
        issue: agent.task ?? agent.name ?? "Agent-Task",
        currentStep,
        status,
        completedSteps,
        logs,
        progress,
        spawnedAt: agent.detectedAt,
        stepTimings: [],
        currentStepStartedAt: agent.status === "running" ? agent.detectedAt : undefined,
        tokenUsage: { ...DEFAULT_TOKEN_USAGE },
        retryCount: 0,
        priority: 0,
      };
    });

    const running = agentList.filter((a) => a.status === "running").length;
    const completed = agentList.filter((a) => a.status === "completed").length;
    const errorCount = agentList.filter((a) => a.status === "error").length;

    let orchestratorStatus: OrchestratorStatus = "idle";
    if (running > 0) {
      orchestratorStatus = "planning";
    } else if (completed > 0) {
      orchestratorStatus = "generated_manifest";
    }

    const orchestratorLog: string[] = [];
    orchestratorLog.push(`${agentList.length} Agent(en) erkannt`);
    if (running > 0) orchestratorLog.push(`${running} aktiv`);
    if (completed > 0) orchestratorLog.push(`${completed} abgeschlossen`);
    if (errorCount > 0) orchestratorLog.push(`${errorCount} mit Fehler`);

    agentList.forEach((agent) => {
      const label = agent.name ?? agent.id.slice(0, 8);
      const statusLabel =
        agent.status === "running"
          ? "laeuft"
          : agent.status === "completed"
          ? "fertig"
          : "Fehler";
      orchestratorLog.push(`[${label}] ${statusLabel}`);
    });

    return {
      hasAgents: true,
      worktrees,
      orchestratorStatus,
      orchestratorLog,
      qaGate: IDLE_QA_GATE,
      summary: {
        total: agentList.length,
        running,
        completed,
        error: errorCount,
      },
    };
  }, [agents, agentWorktrees, sessionId]);
}
