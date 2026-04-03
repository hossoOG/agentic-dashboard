import { create } from "zustand";
import { recordPerf } from "../utils/perfLogger";

// ============================================================================
// Types
// ============================================================================

export type AgentStatus = "running" | "completed" | "error" | "pending" | "blocked";

export interface DetectedAgent {
  id: string;
  sessionId: string;
  parentAgentId: string | null;
  childrenIds: string[];
  depth: number;
  name: string | null;
  task: string | null;
  taskNumber: number | null;
  phaseNumber: number | null;
  status: AgentStatus;
  detectedAt: number;
  completedAt: number | null;
  worktreePath: string | null;
  durationStr: string | null;
  tokenCount: string | null;
  blockedBy: number | null;
  toolUses: number | null;
}

export interface DetectedWorktree {
  path: string;
  branch: string | null;
  agentId: string | null;
  sessionId: string;
  active: boolean;
}

// ============================================================================
// State Interface
// ============================================================================

export interface AgentState {
  agents: Record<string, DetectedAgent>;
  worktrees: Record<string, DetectedWorktree>;
  selectedAgentId: string | null;
  bottomPanelCollapsed: boolean;
  taskSummary: { pending: number; completed: number } | null;

  // Actions
  addAgent: (agent: DetectedAgent) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus, completedAt: number) => void;
  updateAgentDetails: (agentId: string, updates: Partial<DetectedAgent>) => void;
  removeAgentsBySession: (sessionId: string) => void;
  addWorktree: (worktree: DetectedWorktree) => void;
  updateWorktreeActive: (path: string, active: boolean) => void;
  setSelectedAgent: (id: string | null) => void;
  setBottomPanelCollapsed: (collapsed: boolean) => void;
  setTaskSummary: (pending: number, completed: number) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useAgentStore = create<AgentState>((set) => ({
  agents: {},
  worktrees: {},
  selectedAgentId: null,
  bottomPanelCollapsed: true,
  taskSummary: null,

  addAgent: (agent) =>
    set((state) => {
      const t0 = performance.now();
      const newAgents = { ...state.agents, [agent.id]: agent };

      // Track parent → child relationship
      if (agent.parentAgentId && state.agents[agent.parentAgentId]) {
        const parent = state.agents[agent.parentAgentId];
        newAgents[agent.parentAgentId] = {
          ...parent,
          childrenIds: [...parent.childrenIds, agent.id],
        };
      }

      const result = {
        agents: newAgents,
        // Auto-expand panel when first agent is detected
        bottomPanelCollapsed: Object.keys(state.agents).length === 0 ? false : state.bottomPanelCollapsed,
      };
      recordPerf("store-update", "addAgent", performance.now() - t0);
      return result;
    }),

  updateAgentStatus: (agentId, status, completedAt) =>
    set((state) => {
      const agent = state.agents[agentId];
      if (!agent) return state;
      return {
        agents: {
          ...state.agents,
          [agentId]: { ...agent, status, completedAt },
        },
      };
    }),

  updateAgentDetails: (agentId, updates) =>
    set((state) => {
      const t0 = performance.now();
      const agent = state.agents[agentId];
      if (!agent) {
        recordPerf("store-update", "updateAgentDetails", performance.now() - t0);
        return state;
      }
      const result = {
        agents: {
          ...state.agents,
          [agentId]: { ...agent, ...updates },
        },
      };
      recordPerf("store-update", "updateAgentDetails", performance.now() - t0);
      return result;
    }),

  removeAgentsBySession: (sessionId) =>
    set((state) => {
      const newAgents: Record<string, DetectedAgent> = {};
      for (const [id, agent] of Object.entries(state.agents)) {
        if (agent.sessionId !== sessionId) {
          newAgents[id] = agent;
        }
      }
      const newWorktrees: Record<string, DetectedWorktree> = {};
      for (const [path, wt] of Object.entries(state.worktrees)) {
        if (wt.sessionId !== sessionId) {
          newWorktrees[path] = wt;
        }
      }
      return { agents: newAgents, worktrees: newWorktrees };
    }),

  addWorktree: (worktree) =>
    set((state) => ({
      worktrees: { ...state.worktrees, [worktree.path]: worktree },
    })),

  updateWorktreeActive: (path, active) =>
    set((state) => {
      const wt = state.worktrees[path];
      if (!wt) return state;
      return {
        worktrees: { ...state.worktrees, [path]: { ...wt, active } },
      };
    }),

  setSelectedAgent: (id) => set({ selectedAgentId: id }),

  setBottomPanelCollapsed: (collapsed) => set({ bottomPanelCollapsed: collapsed }),

  setTaskSummary: (pending, completed) =>
    set({ taskSummary: { pending, completed } }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectAgentsForSession = (sessionId: string) => (state: AgentState) =>
  Object.values(state.agents).filter((a) => a.sessionId === sessionId);

export const selectActiveAgentCount = (sessionId: string) => (state: AgentState) =>
  Object.values(state.agents).filter((a) => a.sessionId === sessionId && a.status === "running").length;

export const selectWorktreesForSession = (sessionId: string) => (state: AgentState) =>
  Object.values(state.worktrees).filter((w) => w.sessionId === sessionId);

/** Get root-level agents (no parent) for a session — used for tree rendering */
export const selectAgentTree = (sessionId: string) => (state: AgentState) =>
  Object.values(state.agents).filter((a) => a.sessionId === sessionId && a.parentAgentId === null);

/** Get children of a specific agent */
export const selectChildAgents = (parentId: string) => (state: AgentState) =>
  Object.values(state.agents).filter((a) => a.parentAgentId === parentId);
