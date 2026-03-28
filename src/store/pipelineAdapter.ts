/**
 * Pipeline Adapter — maps agentStore data to pipelineStore-compatible structures.
 *
 * This adapter enables the Pipeline-View to render real detected agents
 * from agent_detector.rs without modifying pipelineStore itself.
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
// Status Mapping
// ============================================================================

function mapAgentStatusToWorktreeStatus(agent: DetectedAgent): WorktreeStatus {
  switch (agent.status) {
    case "running":
      return "active";
    case "completed":
      return "done";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

function deriveCurrentStep(agent: DetectedAgent): WorktreeStep {
  if (agent.status === "completed") return "draft_pr";
  if (agent.status === "error") return "setup";

  // Running agents: estimate step from elapsed time and worktree state
  if (agent.status === "running") {
    if (!agent.worktreePath) return "setup";

    // Agent has a worktree — estimate step from elapsed time
    const elapsedMs = Date.now() - agent.detectedAt;
    const elapsedMin = elapsedMs / 60_000;

    // Heuristic: typical agent progression over time
    if (elapsedMin < 1) return "plan";
    if (elapsedMin < 2) return "validate";
    if (elapsedMin < 10) return "code";
    if (elapsedMin < 15) return "review";
    return "self_verify";
  }

  return "setup";
}

const STEP_ORDER: WorktreeStep[] = [
  "setup", "plan", "validate", "code", "review", "self_verify", "draft_pr",
];

function deriveCompletedSteps(currentStep: WorktreeStep): WorktreeStep[] {
  const idx = STEP_ORDER.indexOf(currentStep);
  if (idx <= 0) return [];
  return STEP_ORDER.slice(0, idx);
}

function deriveProgress(currentStep: WorktreeStep, status: DetectedAgent["status"]): number {
  if (status === "completed") return 100;
  if (status === "error") return 0;
  const idx = STEP_ORDER.indexOf(currentStep);
  if (idx < 0) return 0;
  return Math.round((idx / (STEP_ORDER.length - 1)) * 100);
}

// ============================================================================
// Adapter Types
// ============================================================================

export interface AdaptedPipelineData {
  /** True if agentStore has agents to display */
  hasAgents: boolean;
  /** Agents mapped to Worktree-compatible structures */
  worktrees: Worktree[];
  /** Derived orchestrator status */
  orchestratorStatus: OrchestratorStatus;
  /** Summary log lines for orchestrator */
  orchestratorLog: string[];
  /** QA gate (idle when using agent data) */
  qaGate: QAGate;
  /** Summary counts */
  summary: {
    total: number;
    running: number;
    completed: number;
    error: number;
  };
}

// ============================================================================
// Adapter Hook
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

export function useAdaptedPipelineData(): AdaptedPipelineData {
  const agents = useAgentStore((s) => s.agents);
  const agentWorktrees = useAgentStore((s) => s.worktrees);

  return useMemo(() => {
    const agentList = Object.values(agents);
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

    // Map agents to Worktree-compatible structures
    const worktrees: Worktree[] = agentList.map((agent) => {
      const wtInfo = agent.worktreePath
        ? agentWorktrees[agent.worktreePath]
        : null;

      const status = mapAgentStatusToWorktreeStatus(agent);
      const currentStep = deriveCurrentStep(agent);
      const completedSteps = deriveCompletedSteps(currentStep);
      const progress = deriveProgress(currentStep, agent.status);

      // Build contextual log lines from available agent data
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

    // Derive orchestrator status from agent states
    const running = agentList.filter((a) => a.status === "running").length;
    const completed = agentList.filter((a) => a.status === "completed").length;
    const errorCount = agentList.filter((a) => a.status === "error").length;

    // Derive orchestrator status:
    // - "planning" = agents are actively running (closest available status)
    // - "generated_manifest" = all agents completed (pipeline done)
    // - "idle" = no active work (but agents with errors exist)
    let orchestratorStatus: OrchestratorStatus = "idle";
    if (running > 0) {
      orchestratorStatus = "planning";
    } else if (completed > 0 && errorCount === 0) {
      orchestratorStatus = "generated_manifest";
    } else if (completed > 0 && errorCount > 0) {
      // Mixed results — still mark as done (errors visible in worktree nodes)
      orchestratorStatus = "generated_manifest";
    }

    // Build orchestrator log from agent info
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
  }, [agents, agentWorktrees]);
}
