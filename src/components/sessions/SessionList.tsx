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
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const layoutMode = useSessionStore((s) => s.layoutMode);
  const gridSessionIds = useSessionStore((s) => s.gridSessionIds);
  const addToGrid = useSessionStore((s) => s.addToGrid);
  const focusedGridSessionId = useSessionStore((s) => s.focusedGridSessionId);
  const setFocusedGridSession = useSessionStore((s) => s.setFocusedGridSession);
  const maximizeGridSession = useSessionStore((s) => s.maximizeGridSession);
  const favorites = useSettingsStore((s) => s.favorites);

  const sorted = sortSessions(sessions);

  return (
    <div className="flex flex-col h-full bg-dark-bg">
      {/* New Session Button */}
      <div className="p-3 border-b border-dark-border">
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
          <div className="px-3 py-1.5 text-xs text-gray-500 tracking-widest border-b border-dark-border">
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
              onClick={() => {
                if (layoutMode === "grid") {
                  if (isInGrid) {
                    setFocusedGridSession(session.id);
                  } else if (gridSessionIds.length < 4) {
                    addToGrid(session.id);
                  } else {
                    maximizeGridSession(session.id);
                  }
                } else {
                  setActiveSession(session.id);
                }
              }}
              onClose={() => {
                invoke("close_session", { id: session.id }).catch((err) =>
                  console.error("[SessionList] close_session failed:", err)
                );
                removeSession(session.id);
              }}
            />
          );
        })}
        {sessions.length === 0 && (
          <div className="p-4 text-center text-gray-600 text-xs">
            Keine Sessions vorhanden
          </div>
        )}
      </div>
    </div>
  );
}
