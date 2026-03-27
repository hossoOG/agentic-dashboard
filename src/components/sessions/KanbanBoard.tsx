import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layout, RefreshCw, AlertTriangle, ChevronDown } from "lucide-react";
import { useKanbanStore } from "../../store/kanbanStore";
import { KanbanCard } from "./KanbanCard";
import type { KanbanItem } from "../../store/kanbanStore";

interface KanbanBoardProps {
  folder: string;
}

function parseGitHubOwner(remoteUrl: string): string | null {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\//);
  return match ? match[1] : null;
}

export function KanbanBoard({ folder }: KanbanBoardProps) {
  const [owner, setOwner] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const {
    projects,
    selectedProject,
    columns,
    items,
    loading,
    error,
    loadProjects,
    selectProject,
    moveItem,
    refresh,
  } = useKanbanStore();

  useEffect(() => {
    if (!folder) {
      setResolving(false);
      return;
    }
    setResolving(true);
    invoke<{ remote_url: string }>("get_git_info", { folder })
      .then((info) => {
        const parsed = parseGitHubOwner(info?.remote_url ?? "");
        setOwner(parsed);
        setResolving(false);
      })
      .catch(() => {
        setOwner(null);
        setResolving(false);
      });
  }, [folder]);

  useEffect(() => {
    if (owner) {
      loadProjects(owner);
    }
  }, [owner, loadProjects]);

  const handleProjectSelect = useCallback(
    (projectNumber: number) => {
      if (owner) {
        selectProject(owner, projectNumber);
      }
    },
    [owner, selectProject]
  );

  const handleRefresh = useCallback(() => {
    if (owner) {
      refresh(owner);
    }
  }, [owner, refresh]);

  function handleDragOver(e: React.DragEvent, columnId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumnId(columnId);
  }

  function handleDragLeave() {
    setDragOverColumnId(null);
  }

  function handleDrop(e: React.DragEvent, columnId: string) {
    e.preventDefault();
    setDragOverColumnId(null);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) {
      moveItem(itemId, columnId);
    }
  }

  // Group items by their status column, collecting unmatched items separately
  const { itemsByStatus, uncategorized } = useMemo(() => {
    const byStatus = new Map<string, KanbanItem[]>();
    for (const col of columns) {
      byStatus.set(col.name, []);
    }
    const uncat: KanbanItem[] = [];
    for (const item of items) {
      const bucket = byStatus.get(item.status);
      if (bucket) {
        bucket.push(item);
      } else {
        uncat.push(item);
      }
    }
    return { itemsByStatus: byStatus, uncategorized: uncat };
  }, [columns, items]);

  if (!folder) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
        Keine aktive Session
      </div>
    );
  }

  if (resolving) {
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
        Git-Repository wird erkannt...
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-500 text-sm p-8">
        <AlertTriangle className="w-5 h-5 text-yellow-500" />
        <span>Kein GitHub-Remote gefunden.</span>
        <span className="text-xs text-neutral-600">
          Das Repository muss ein GitHub-Remote haben, um Projects anzuzeigen.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700 bg-surface-raised shrink-0">
        <Layout className="w-4 h-4 text-accent" />
        <span className="text-xs font-medium text-neutral-200">Kanban</span>

        <div className="relative ml-2">
          <select
            value={selectedProject ?? ""}
            onChange={(e) => {
              const num = Number(e.target.value);
              if (num) handleProjectSelect(num);
            }}
            className="appearance-none bg-surface-base border border-neutral-700 rounded px-2 py-1 pr-6 text-xs text-neutral-200
                       focus:border-accent focus:outline-none cursor-pointer"
          >
            <option value="">Projekt waehlen...</option>
            {projects.map((p) => (
              <option key={p.number} value={p.number}>
                {p.title}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-500 pointer-events-none" />
        </div>

        <button
          onClick={handleRefresh}
          disabled={loading}
          className="ml-auto flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50"
          title="Aktualisieren"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>

        {loading && (
          <span className="text-[10px] text-neutral-500">Laden...</span>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-900/20 border-b border-red-900/40 text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="line-clamp-2">{error}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        {selectedProject == null ? (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            {projects.length === 0 && !loading
              ? "Keine GitHub Projects gefunden fuer diesen Owner."
              : "Bitte ein Projekt auswaehlen."}
          </div>
        ) : columns.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            Keine Status-Spalten gefunden. Ist ein &quot;Status&quot;-Feld im Projekt konfiguriert?
          </div>
        ) : (
          <div className="flex gap-3 p-3 h-full min-w-min">
            {columns.map((col) => {
              const colItems = itemsByStatus.get(col.name) ?? [];
              const isDropTarget = dragOverColumnId === col.id;
              return (
                <div
                  key={col.id}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className={`flex flex-col w-64 min-w-[256px] rounded bg-surface-raised border transition-colors
                    ${isDropTarget ? "border-accent bg-accent-a05" : "border-neutral-700"}`}
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700/50">
                    <span className="text-xs font-medium text-neutral-200 truncate">
                      {col.name}
                    </span>
                    <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded-full">
                      {colItems.length}
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {colItems.map((item) => (
                      <KanbanCard key={item.id} item={item} />
                    ))}
                    {colItems.length === 0 && (
                      <div className="text-[10px] text-neutral-600 text-center py-4">
                        Keine Items
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {uncategorized.length > 0 && (
              <div className="flex flex-col w-64 min-w-[256px] rounded bg-surface-raised border border-neutral-700">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700/50">
                  <span className="text-xs font-medium text-neutral-400 truncate">
                    Ohne Status
                  </span>
                  <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded-full">
                    {uncategorized.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {uncategorized.map((item) => (
                    <KanbanCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
