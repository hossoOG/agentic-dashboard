import { create } from "zustand";
import { logWarn } from "../utils/errorLogger";
import { recordPerf } from "../utils/perfLogger";

// ============================================================================
// Types
// ============================================================================

export type SessionShell = "powershell" | "cmd" | "gitbash";

export type LayoutMode = "single" | "grid";

export type SessionStatus =
  | "starting"     // PTY wird gespawnt
  | "running"      // Claude laeuft, Output kommt
  | "waiting"      // Claude wartet auf User-Input (Heuristik)
  | "done"         // Prozess beendet, Exit-Code 0
  | "error";       // Prozess beendet, Exit-Code != 0

export interface ClaudeSession {
  id: string;
  title: string;
  folder: string;
  shell: SessionShell;
  status: SessionStatus;
  createdAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  lastOutputAt: number;          // Fuer "wartet"-Heuristik
  lastOutputSnippet: string;     // Letzte ~200 Zeichen fuer Status-Anzeige
}

// ============================================================================
// Constants
// ============================================================================

const MAX_SESSIONS = 8;

// ============================================================================
// State Interface
// ============================================================================

export interface SessionState {
  sessions: ClaudeSession[];
  activeSessionId: string | null;

  // Layout state (transient — not persisted)
  layoutMode: LayoutMode;
  gridSessionIds: string[];
  focusedGridSessionId: string | null;

  // Actions
  addSession: (params: {
    id: string;
    title: string;
    folder: string;
    shell: SessionShell;
  }) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateStatus: (id: string, status: SessionStatus) => void;
  setExitCode: (id: string, exitCode: number) => void;
  updateLastOutput: (id: string, snippet: string) => void;

  // Layout actions
  setLayoutMode: (mode: LayoutMode) => void;
  addToGrid: (id: string) => void;
  removeFromGrid: (id: string) => void;
  setFocusedGridSession: (id: string | null) => void;
  maximizeGridSession: (id: string) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,
  layoutMode: "single",
  gridSessionIds: [],
  focusedGridSessionId: null,

  addSession: (params) =>
    set((state) => {
      if (state.sessions.some((s) => s.id === params.id)) return state;
      if (state.sessions.length >= MAX_SESSIONS) {
        logWarn("sessionStore", `Max sessions (${MAX_SESSIONS}) erreicht.`);
        return state;
      }
      const session: ClaudeSession = {
        id: params.id,
        title: params.title,
        folder: params.folder,
        shell: params.shell,
        status: "starting",
        createdAt: Date.now(),
        finishedAt: null,
        exitCode: null,
        lastOutputAt: Date.now(),
        lastOutputSnippet: "",
      };
      return {
        sessions: [...state.sessions, session],
        activeSessionId: params.id,
      };
    }),

  removeSession: (id) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id);
      const newGridIds = state.gridSessionIds.filter((gid) => gid !== id);
      return {
        sessions: remaining,
        activeSessionId:
          state.activeSessionId === id
            ? (remaining[remaining.length - 1]?.id ?? null)
            : state.activeSessionId,
        gridSessionIds: newGridIds,
        focusedGridSessionId:
          state.focusedGridSessionId === id
            ? (newGridIds[0] ?? null)
            : state.focusedGridSessionId,
        layoutMode: newGridIds.length === 0 && state.layoutMode === "grid" ? "single" : state.layoutMode,
      };
    }),

  setActiveSession: (id) =>
    set((state) => {
      if (id === null) return { activeSessionId: null };
      if (state.sessions.some((s) => s.id === id)) return { activeSessionId: id };
      return state;
    }),

  updateStatus: (id, status) =>
    set((state) => {
      const t0 = performance.now();
      const result = {
        sessions: state.sessions.map((s) =>
          s.id === id
            ? {
                ...s,
                status,
                finishedAt:
                  status === "done" || status === "error"
                    ? Date.now()
                    : status === "running" || status === "starting" || status === "waiting"
                      ? null
                      : s.finishedAt,
              }
            : s
        ),
      };
      recordPerf("store-update", "updateStatus", performance.now() - t0);
      return result;
    }),

  setExitCode: (id, exitCode) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id
          ? {
              ...s,
              exitCode,
              status: exitCode === 0 ? "done" : "error",
              finishedAt: Date.now(),
            }
          : s
      ),
    })),

  updateLastOutput: (id, snippet) =>
    set((state) => {
      const t0 = performance.now();
      const result = {
        sessions: state.sessions.map((s) =>
          s.id === id
            ? { ...s, lastOutputAt: Date.now(), lastOutputSnippet: snippet }
            : s
        ),
      };
      recordPerf("store-update", "updateLastOutput", performance.now() - t0);
      return result;
    }),

  // Layout actions
  setLayoutMode: (mode) =>
    set((state) => {
      if (mode === "grid") {
        const activeIds = state.sessions
          .filter((s) => s.status === "running" || s.status === "waiting" || s.status === "starting")
          .slice(0, 4)
          .map((s) => s.id);
        return {
          layoutMode: mode,
          gridSessionIds: activeIds.length > 0 ? activeIds : state.activeSessionId ? [state.activeSessionId] : [],
          focusedGridSessionId: activeIds[0] ?? state.activeSessionId ?? null,
        };
      }
      return { layoutMode: mode };
    }),

  addToGrid: (id) =>
    set((state) => {
      if (state.gridSessionIds.length >= 4) return state;
      if (state.gridSessionIds.includes(id)) return state;
      return {
        gridSessionIds: [...state.gridSessionIds, id],
        focusedGridSessionId: id,
      };
    }),

  removeFromGrid: (id) =>
    set((state) => {
      const newIds = state.gridSessionIds.filter((gid) => gid !== id);
      return {
        gridSessionIds: newIds,
        focusedGridSessionId:
          state.focusedGridSessionId === id
            ? (newIds[0] ?? null)
            : state.focusedGridSessionId,
        layoutMode: newIds.length === 0 ? "single" : state.layoutMode,
      };
    }),

  setFocusedGridSession: (id) =>
    set({ focusedGridSessionId: id }),

  maximizeGridSession: (id) =>
    set({
      layoutMode: "single",
      activeSessionId: id,
    }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectActiveSession = (state: SessionState) =>
  state.sessions.find((s) => s.id === state.activeSessionId);

export const selectSessionCounts = (state: SessionState) => ({
  active: state.sessions.filter((s) => s.status === "running" || s.status === "starting").length,
  waiting: state.sessions.filter((s) => s.status === "waiting").length,
  done: state.sessions.filter((s) => s.status === "done").length,
  error: state.sessions.filter((s) => s.status === "error").length,
  total: state.sessions.length,
});
