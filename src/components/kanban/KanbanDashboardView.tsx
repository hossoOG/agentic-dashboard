import { useState } from "react";
import { Columns3 } from "lucide-react";
import { KanbanBoard } from "./KanbanBoard";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";

type BoardMode = "global" | "folder";

/**
 * Dashboard-level Kanban view (SideNav tab).
 *
 * Two modes:
 * - "global" (default) — shows the user's GitHub Projects v2 board without
 *   requiring a folder. Works even with no active session or favorites.
 * - "folder" — the existing folder-scoped board. Requires an active session
 *   or at least one favorite.
 */
export function KanbanDashboardView() {
  const [boardMode, setBoardMode] = useState<BoardMode>("global");
  const activeSession = useSessionStore(selectActiveSession);
  const favorites = useSettingsStore((s) => s.favorites);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const folderModeFolder = selectedFolder ?? activeSession?.folder ?? null;

  // ── Mode toggle ───────────────────────────────────────────────────────

  const modeToggle = (
    <div className="flex items-center gap-1 border border-neutral-700 rounded-sm p-0.5">
      {(["global", "folder"] as BoardMode[]).map((m) => (
        <button
          key={m}
          onClick={() => setBoardMode(m)}
          className={`px-2.5 py-0.5 text-xs rounded-[2px] transition-colors ${
            boardMode === m
              ? "bg-neutral-700 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {m === "global" ? "Global" : "Projekt"}
        </button>
      ))}
    </div>
  );

  // ── Global mode ───────────────────────────────────────────────────────

  if (boardMode === "global") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-700 shrink-0">
          <Columns3 className="w-3.5 h-3.5 text-neutral-500" />
          <span className="text-xs text-neutral-500 mr-auto">Globales Board</span>
          {modeToggle}
        </div>
        <div className="flex-1 min-h-0">
          <KanbanBoard folder={null} />
        </div>
      </div>
    );
  }

  // ── Folder mode ───────────────────────────────────────────────────────

  if (!folderModeFolder && favorites.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-neutral-700 shrink-0">
          {modeToggle}
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-neutral-500">
          <Columns3 className="w-10 h-10 text-neutral-600" />
          <span className="text-sm">Kein Projekt verfügbar</span>
          <span className="text-xs text-neutral-600">
            Erstelle eine Session oder füge einen Favoriten hinzu.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header: folder picker + mode toggle */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-700 shrink-0">
        <span className="text-xs text-neutral-500">Projekt:</span>
        <select
          value={folderModeFolder ?? ""}
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
        <div className="ml-auto">{modeToggle}</div>
      </div>

      {/* Board */}
      {folderModeFolder ? (
        <div className="flex-1 min-h-0">
          <KanbanBoard folder={folderModeFolder} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-neutral-500">
          <Columns3 className="w-10 h-10 text-neutral-600" />
          <span className="text-sm">Projekt auswählen</span>
        </div>
      )}
    </div>
  );
}
