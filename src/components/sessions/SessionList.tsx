import { useCallback, useState } from "react";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../../store/sessionStore";
import { useAgentStore } from "../../store/agentStore";
import { useUIStore } from "../../store/uiStore";
import { SessionCard } from "./SessionCard";
import { FavoritesList } from "./FavoritesList";
import { logError } from "../../utils/errorLogger";
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
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const layoutMode = useSessionStore((s) => s.layoutMode);
  const gridSessionIds = useSessionStore((s) => s.gridSessionIds);
  const focusedGridSessionId = useSessionStore((s) => s.focusedGridSessionId);
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
      useUIStore.getState().closePreview();
    }
  }, []);

  const handleClose = useCallback((sessionId: string) => {
    invoke("close_session", { id: sessionId }).catch((err) =>
      logError("SessionList.closeSession", err)
    );
    useSessionStore.getState().removeSession(sessionId);
    useAgentStore.getState().removeAgentsBySession(sessionId);
  }, []);

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Scrollable content: Favorites + Sessions */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Favorites section */}
        <FavoritesList onQuickStart={onQuickStart} />

        {/* Sessions section header — with inline new-session trigger */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 cursor-pointer hover:bg-hover-overlay transition-colors"
          onClick={() => setSessionsExpanded((v) => !v)}
        >
          <div className="flex items-center gap-1.5">
            {sessionsExpanded ? <ChevronDown className="w-3 h-3 text-neutral-500" /> : <ChevronRight className="w-3 h-3 text-neutral-500" />}
            <span className="text-xs text-neutral-500 uppercase tracking-widest">SESSIONS</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onNewSession(); }}
            className="text-neutral-500 hover:text-accent transition-colors"
            aria-label="Neue Session starten"
            title="Neue Session starten"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Session cards */}
        {sessionsExpanded && (
          <>
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
              <div className="p-4 text-center text-neutral-500 text-xs">
                Keine Sessions vorhanden
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
