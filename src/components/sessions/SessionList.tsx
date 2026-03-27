import { useCallback } from "react";
import { Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { SessionCard } from "./SessionCard";
import { FavoritesList } from "./FavoritesList";
import type { ClaudeSession } from "../../store/sessionStore";
import type { FavoriteFolder } from "../../store/settingsStore";

interface SessionListProps {
  onNewSession: () => void;
  onQuickStart: (favorite: FavoriteFolder) => void;
}

/** Active/waiting sessions first, then done/error. Within each group: by createdAt. */
function sortSessions(sessions: ClaudeSession[]): ClaudeSession[] {
  const activeStatuses = new Set(["starting", "running", "waiting"]);
  return [...sessions].sort((a, b) => {
    const aActive = activeStatuses.has(a.status) ? 0 : 1;
    const bActive = activeStatuses.has(b.status) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.createdAt - b.createdAt;
  });
}

export function SessionList({ onNewSession, onQuickStart }: SessionListProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const layoutMode = useSessionStore((s) => s.layoutMode);
  const gridSessionIds = useSessionStore((s) => s.gridSessionIds);
  const focusedGridSessionId = useSessionStore((s) => s.focusedGridSessionId);
  const favorites = useSettingsStore((s) => s.favorites);

  const sorted = sortSessions(sessions);

  const handleClick = useCallback((sessionId: string) => {
    const store = useSessionStore.getState();
    if (store.layoutMode === "grid") {
      if (store.gridSessionIds.includes(sessionId)) {
        store.setFocusedGridSession(sessionId);
      } else if (store.gridSessionIds.length < 4) {
        store.addToGrid(sessionId);
      } else {
        store.maximizeGridSession(sessionId);
      }
    } else {
      store.setActiveSession(sessionId);
    }
  }, []);

  const handleClose = useCallback((sessionId: string) => {
    invoke("close_session", { id: sessionId }).catch((err) =>
      console.error("[SessionList] close_session failed:", err)
    );
    useSessionStore.getState().removeSession(sessionId);
  }, []);

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* New Session Button */}
      <div className="p-3 border-b border-neutral-700">
        <button
          onClick={onNewSession}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-neon-green/10 border border-neon-green text-neon-green text-xs font-bold tracking-widest hover:bg-neon-green/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          NEUE SESSION
        </button>
      </div>

      {/* Scrollable content: Favorites + Sessions */}
      <div className="flex-1 overflow-y-auto">
        {/* Favorites section */}
        <FavoritesList onQuickStart={onQuickStart} />

        {/* Sessions section header (only when favorites exist) */}
        {favorites.length > 0 && (
          <div className="px-3 py-1.5 text-xs text-neutral-500 tracking-widest border-b border-neutral-700">
            SESSIONS
          </div>
        )}

        {/* Session cards */}
        {sorted.map((session) => {
          const isInGrid = gridSessionIds.includes(session.id);
          return (
            <SessionCard
              key={session.id}
              session={session}
              isActive={
                layoutMode === "grid"
                  ? session.id === focusedGridSessionId
                  : session.id === activeSessionId
              }
              isInGrid={isInGrid}
              onClick={handleClick}
              onClose={handleClose}
            />
          );
        })}
        {sessions.length === 0 && (
          <div className="p-4 text-center text-neutral-600 text-xs">
            Keine Sessions vorhanden
          </div>
        )}
      </div>
    </div>
  );
}
