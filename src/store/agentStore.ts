import { create } from "zustand";

// ============================================================================
// Types
// ============================================================================

export type AgentStatus = "running" | "completed" | "error";

export interface DetectedAgent {
  id: string;
  sessionId: string;
  parentAgentId: string | null;
  name: string | null;
  task: string | null;
  status: AgentStatus;
  detectedAt: number;
  completedAt: number | null;
  worktreePath: string | null;
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

  // Actions
  addAgent: (agent: DetectedAgent) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus, completedAt: number) => void;
  removeAgentsBySession: (sessionId: string) => void;
  addWorktree: (worktree: DetectedWorktree) => void;
  updateWorktreeActive: (path: string, active: boolean) => void;
  setSelectedAgent: (id: string | null) => void;
  setBottomPanelCollapsed: (collapsed: boolean) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useAgentStore = create<AgentState>((set) => ({
  agents: {},
  worktrees: {},
  selectedAgentId: null,
  bottomPanelCollapsed: true,

  addAgent: (agent) =>
    set((state) => ({
      agents: { ...state.agents, [agent.id]: agent },
      // Auto-expand panel when first agent is detected
      bottomPanelCollapsed: Object.keys(state.agents).length === 0 ? false : state.bottomPanelCollapsed,
    })),

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
