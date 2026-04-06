import { useState } from "react";
import { Columns3 } from "lucide-react";
import { KanbanBoard } from "./KanbanBoard";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";

/**
 * Dashboard-level Kanban view (SideNav tab).
 * Uses the active session's folder, or lets the user pick from favorites.
 */
export function KanbanDashboardView() {
  const activeSession = useSessionStore(selectActiveSession);
  const favorites = useSettingsStore((s) => s.favorites);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const folder = selectedFolder ?? activeSession?.folder ?? null;

  if (!folder && favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <Columns3 className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Kein Projekt verfügbar</span>
        <span className="text-xs text-neutral-600">
          Erstelle eine Session oder füge einen Favoriten hinzu.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Folder picker when multiple options available */}
      {(favorites.length > 0 || activeSession) && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-700 shrink-0">
          <span className="text-xs text-neutral-500">Projekt:</span>
          <select
            value={folder ?? ""}
            onChange={(e) => setSelectedFolder(e.target.value || null)}
            className="text-xs bg-surface-base border border-neutral-700 text-neutral-300 rounded-sm px-2 py-1 outline-none focus:border-accent max-w-xs"
          >
            {activeSession && (
              <option value={activeSession.folder}>
                {activeSession.title} (aktive Session)
              </option>
            )}
            {favorites
              .filter((f) => f.path !== activeSession?.folder)
              .map((fav) => (
                <option key={fav.id} value={fav.path}>
                  {fav.label}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Board */}
      {folder ? (
        <div className="flex-1 min-h-0">
          <KanbanBoard folder={folder} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
          <Columns3 className="w-10 h-10 text-neutral-600" />
          <span className="text-sm">Projekt auswählen</span>
        </div>
      )}
    </div>
  );
}
