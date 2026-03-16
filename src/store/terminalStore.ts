import { create } from "zustand";

// ============================================================================
// Types
// ============================================================================

export type TerminalShell = "powershell" | "bash" | "cmd" | "zsh";
export type TerminalSessionStatus = "starting" | "running" | "exited" | "error";

export interface TerminalSession {
  id: string;
  label: string;
  shell: TerminalShell;
  workingDirectory: string;
  status: TerminalSessionStatus;
  createdAt: number;
  exitCode?: number;
  signal?: string;
  outputBuffer: string[];
  cols: number;
  rows: number;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_SESSIONS = 8;
const MAX_OUTPUT_LINES = 5000;

// ============================================================================
// State Interface
// ============================================================================

export interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  maxSessions: number;

  // Actions
  createSession: (params: {
    id: string;
    label: string;
    shell: TerminalShell;
    workingDirectory: string;
    cols?: number;
    rows?: number;
  }) => void;
  closeSession: (id: string) => void;
  setSessionStatus: (id: string, status: TerminalSessionStatus) => void;
  setSessionExit: (id: string, exitCode: number, signal?: string) => void;
  appendOutput: (id: string, data: string) => void;
  resizeSession: (id: string, cols: number, rows: number) => void;
  setActiveSession: (id: string) => void;
  closeAllSessions: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: [],
  activeSessionId: null,
  maxSessions: MAX_SESSIONS,

  createSession: (params) =>
    set((state) => {
      if (state.sessions.length >= MAX_SESSIONS) {
        console.warn(
          `[terminalStore] Max sessions (${MAX_SESSIONS}) reached. Cannot create new session.`
        );
        return state;
      }

      const newSession: TerminalSession = {
        id: params.id,
        label: params.label,
        shell: params.shell,
        workingDirectory: params.workingDirectory,
        status: "starting",
        createdAt: Date.now(),
        outputBuffer: [],
        cols: params.cols ?? 80,
        rows: params.rows ?? 24,
      };

      return {
        sessions: [...state.sessions, newSession],
        activeSessionId: params.id,
      };
    }),

  closeSession: (id) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id);
      let nextActiveId = state.activeSessionId;

      if (state.activeSessionId === id) {
        // Auto-activate the last remaining session
        nextActiveId =
          remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      }

      return {
        sessions: remaining,
        activeSessionId: nextActiveId,
      };
    }),

  setSessionStatus: (id, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, status } : s
      ),
    })),

  setSessionExit: (id, exitCode, signal) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id
          ? { ...s, status: "exited" as const, exitCode, signal }
          : s
      ),
    })),

  appendOutput: (id, data) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== id) return s;
        const updated = [...s.outputBuffer, data];
        // Ring-buffer: keep only the last MAX_OUTPUT_LINES entries
        return {
          ...s,
          outputBuffer: updated.length > MAX_OUTPUT_LINES
            ? updated.slice(-MAX_OUTPUT_LINES)
            : updated,
        };
      }),
    })),

  resizeSession: (id, cols, rows) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, cols, rows } : s
      ),
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  closeAllSessions: () =>
    set({
      sessions: [],
      activeSessionId: null,
    }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectActiveSession = (state: TerminalState): TerminalSession | undefined =>
  state.sessions.find((s) => s.id === state.activeSessionId);

export const selectSessionById = (id: string) =>
  (state: TerminalState): TerminalSession | undefined =>
    state.sessions.find((s) => s.id === id);

export const selectRunningSessions = (state: TerminalState): TerminalSession[] =>
  state.sessions.filter((s) => s.status === "running");

export const selectSessionCount = (state: TerminalState): number =>
  state.sessions.length;
