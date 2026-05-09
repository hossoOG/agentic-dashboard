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
  displayId?: string;            // 4-Char Base36 (z.B. "3K2X") — visuelle Disambiguation,
                                 // auto-generiert bei Create, gecleared bei Rename.
  folder: string;
  shell: SessionShell;
  claudeSessionId?: string;      // Claude CLI Session-UUID fuer Resume
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
const DISPLAY_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const DISPLAY_ID_LENGTH = 4;
const DISPLAY_ID_MAX_ATTEMPTS = 100;

/**
 * Generates a 4-Char Base36 display-ID, kollisionsfrei gegen die existierenden Sessions.
 * 36^4 = 1.679.616 Kombinationen — bei realistischen Session-Counts (<100) faktisch immer beim ersten Versuch unique.
 * Re-Roll-Loop schuetzt vor dem astronomisch unwahrscheinlichen Kollisionsfall.
 */
export function generateUniqueDisplayId(existingSessions: ClaudeSession[]): string {
  const taken = new Set(
    existingSessions
      .map((s) => s.displayId)
      .filter((d): d is string => Boolean(d)),
  );
  for (let attempt = 0; attempt < DISPLAY_ID_MAX_ATTEMPTS; attempt++) {
    let candidate = "";
    for (let i = 0; i < DISPLAY_ID_LENGTH; i++) {
      candidate += DISPLAY_ID_ALPHABET[Math.floor(Math.random() * DISPLAY_ID_ALPHABET.length)];
    }
    if (!taken.has(candidate)) return candidate;
  }
  // Fall-through: ~1.6M aktive Sessions noetig — praktisch unerreichbar. Letzten Kandidat zurueckgeben.
  return Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(DISPLAY_ID_LENGTH, "0");
}

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
    displayId?: string;
    folder: string;
    shell: SessionShell;
    claudeSessionId?: string;
  }) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateStatus: (id: string, status: SessionStatus) => void;
  setExitCode: (id: string, exitCode: number) => void;
  renameSession: (id: string, title: string) => void;
  setClaudeSessionId: (id: string, claudeSessionId: string) => void;
  updateLastOutput: (id: string, snippet: string) => void;

  // Layout actions
  setLayoutMode: (mode: LayoutMode) => void;
  addToGrid: (id: string) => void;
  removeFromGrid: (id: string) => void;
  setFocusedGridSession: (id: string | null) => void;
  maximizeGridSession: (id: string) => void;
}

// ============================================================================
// Transition Guard
// ============================================================================

const TERMINAL_STATUSES: ReadonlySet<SessionStatus> = new Set(["done", "error"]);

/**
 * Returns false if `from` is a terminal state — done/error sessions are final.
 * All forward transitions from non-terminal states are allowed.
 */
function canTransition(_from: SessionStatus, _to: SessionStatus): boolean {
  return !TERMINAL_STATUSES.has(_from);
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
        displayId: params.displayId,
        folder: params.folder,
        shell: params.shell,
        claudeSessionId: params.claudeSessionId,
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
      const session = state.sessions.find((s) => s.id === id);
      if (!session) return state;
      // Skip redundant updates — avoids Zustand notifications when status is unchanged.
      if (session.status === status) return state;
      if (!canTransition(session.status, status)) {
        logWarn("sessionStore", `Ignored invalid transition ${session.status}→${status} for session ${id}`);
        return state;
      }
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
    set((state) => {
      const session = state.sessions.find((s) => s.id === id);
      if (!session) return state;
      if (TERMINAL_STATUSES.has(session.status)) {
        logWarn("sessionStore", `Ignored setExitCode on terminal session ${id} (${session.status})`);
        return state;
      }
      return {
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
      };
    }),

  renameSession: (id, title) =>
    set((state) => ({
      // Rename = User uebernimmt explizit den Titel. Auto-displayId wird damit obsolet
      // und gecleared, sodass der manuelle Name allein die Disambiguation traegt.
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title, displayId: undefined } : s
      ),
    })),

  setClaudeSessionId: (id, claudeSessionId) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, claudeSessionId } : s
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
