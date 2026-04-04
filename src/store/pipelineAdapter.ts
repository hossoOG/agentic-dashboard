/**
 * Pipeline Adapter — maps agentStore data to visualization structures.
 *
 * Provides:
 * - useAdaptedTaskTree: Tree-based adapter for TaskTreeView
 */

import { useMemo } from "react";
import { useAgentStore } from "./agentStore";
import type { DetectedAgent } from "./agentStore";

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

