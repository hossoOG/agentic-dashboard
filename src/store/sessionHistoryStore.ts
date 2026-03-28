import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useSessionStore } from "./sessionStore";
import type { ClaudeSession } from "./sessionStore";

// ============================================================================
// Types
// ============================================================================

export type SessionOutcome = "success" | "error" | "cancelled" | "unknown";

export interface SessionHistoryEntry {
  id: string;
  sessionId: string;
  projectFolder: string;
  title: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  outcome: SessionOutcome;
  exitCode: number | null;
  agentCount: number;
  lastOutputSnippet: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_HISTORY_ENTRIES = 500;
const STORAGE_KEY = "agenticexplorer-session-history";

// ============================================================================
// Helpers
// ============================================================================

function normalizeFolder(folder: string): string {
  return folder.replace(/\\/g, "/").toLowerCase();
}

function deriveOutcome(session: ClaudeSession): SessionOutcome {
  if (session.status === "done") {
    return session.exitCode === 0 || session.exitCode === null
      ? "success"
      : "error";
  }
  if (session.status === "error") return "error";
  return "unknown";
}

function createHistoryEntry(session: ClaudeSession): SessionHistoryEntry {
  const now = Date.now();
  const finishedAt = session.finishedAt ?? now;
  return {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: session.id,
    projectFolder: normalizeFolder(session.folder),
    title: session.title,
    startedAt: session.createdAt,
    finishedAt,
    durationMs: finishedAt - session.createdAt,
    outcome: deriveOutcome(session),
    exitCode: session.exitCode,
    agentCount: 0, // No agentStore available — default to 0
    lastOutputSnippet: (session.lastOutputSnippet ?? "").slice(0, 200),
  };
}

// ============================================================================
// State Interface
// ============================================================================

export interface SessionHistoryState {
  /** All history entries, keyed internally but stored flat */
  entries: SessionHistoryEntry[];

  // Actions
  addEntry: (entry: SessionHistoryEntry) => void;
  clearForProject: (folder: string) => void;
  getEntriesForProject: (folder: string) => SessionHistoryEntry[];
}

// ============================================================================
// Storage adapter — localStorage fallback (same pattern as tauriStorage)
// ============================================================================

const historyStorage = createJSONStorage<SessionHistoryState>(() => localStorage);

// ============================================================================
// Store (with persist middleware)
// ============================================================================

export const useSessionHistoryStore = create<SessionHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (entry) =>
        set((state) => {
          // Check duplicate by sessionId
          if (state.entries.some((e) => e.sessionId === entry.sessionId)) {
            return state;
          }

          const updated = [entry, ...state.entries];

          // Enforce MAX per project (FIFO — keep newest)
          const projectCounts = new Map<string, number>();
          const filtered: SessionHistoryEntry[] = [];
          for (const e of updated) {
            const count = projectCounts.get(e.projectFolder) ?? 0;
            if (count < MAX_HISTORY_ENTRIES) {
              filtered.push(e);
              projectCounts.set(e.projectFolder, count + 1);
            }
          }

          return { entries: filtered };
        }),

      clearForProject: (folder) =>
        set((state) => ({
          entries: state.entries.filter(
            (e) => e.projectFolder !== normalizeFolder(folder)
          ),
        })),

      getEntriesForProject: (folder) => {
        const normalized = normalizeFolder(folder);
        return get()
          .entries.filter((e) => e.projectFolder === normalized)
          .sort((a, b) => b.startedAt - a.startedAt);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: historyStorage,
      version: 1,
      migrate: (persistedState) => {
        // v1 is the initial version — no migration needed yet
        return persistedState as SessionHistoryState;
      },
    }
  )
);

// ============================================================================
// Session Completion Listener
// ============================================================================

/**
 * Subscribe to sessionStore and record history entries when sessions
 * transition to "done" or "error".
 *
 * Returns an unsubscribe function.
 *
 * IMPORTANT: This fires on EVERY state update (including frequent
 * updateLastOutput calls). We track previous statuses to only react
 * on actual status changes.
 */
export function initSessionHistoryListener(): () => void {
  const trackedStatuses = new Map<string, string>();

  return useSessionStore.subscribe((state) => {
    for (const session of state.sessions) {
      const prev = trackedStatuses.get(session.id);
      if (prev !== session.status) {
        trackedStatuses.set(session.id, session.status);
        if (session.status === "done" || session.status === "error") {
          const entry = createHistoryEntry(session);
          useSessionHistoryStore.getState().addEntry(entry);
        }
      }
    }

    // Cleanup tracked entries for removed sessions
    for (const id of trackedStatuses.keys()) {
      if (!state.sessions.some((s) => s.id === id)) {
        trackedStatuses.delete(id);
      }
    }
  });
}
