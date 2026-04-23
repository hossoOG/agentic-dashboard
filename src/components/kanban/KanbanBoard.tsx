import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Columns3, AlertCircle, ChevronDown } from "lucide-react";
import { getErrorMessage } from "../../utils/adpError";
import { wrapInvoke } from "../../utils/perfLogger";
import { KanbanCard, type KanbanIssue } from "./KanbanCard";
import { KanbanDetailModal } from "./KanbanDetailModal";
import { useProjectStore } from "../../store/projectStore";
import { logError } from "../../utils/errorLogger";

// ── Types from backend ────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  number: number;
  title: string;
  items_total: number;
}

interface ProjectLane {
  option_id: string;
  name: string;
  order: number;
}

interface ProjectItem {
  item_id: string;
  issue_number: number;
  title: string;
  assignee: string;
  labels: { name: string; color: string }[];
  url: string;
  state: string;
  current_lane_option_id: string | null;
}

interface ProjectBoard {
  project_id: string;
  status_field_id: string;
  lanes: ProjectLane[];
  items: ProjectItem[];
}

// ── Cache ─────────────────────────────────────────────────────────────

interface CacheEntry {
  board: ProjectBoard;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

/** Converts a backend ProjectItem to the KanbanIssue shape the card expects. */
function toKanbanIssue(item: ProjectItem): KanbanIssue {
  return {
    itemId: item.item_id,
    number: item.issue_number,
    title: item.title,
    state: item.state,
    labels: item.labels,
    assignee: item.assignee,
    url: item.url,
  };
}

// ── Props ─────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  folder: string;
}

// ── Component ─────────────────────────────────────────────────────────

export function KanbanBoard({ folder }: KanbanBoardProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [board, setBoard] = useState<ProjectBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [dragOverOptionId, setDragOverOptionId] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null); // item_id being moved
  const [moveError, setMoveError] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);

  const { setFolderProject, getProjectForFolder } = useProjectStore();
  const mountedRef = useRef(true);
  /** Tracks whether the initial load (loadProjects → loadBoard) has fired.
   * Prevents the second useEffect from double-loading on mount. */
  const boardInitializedRef = useRef(false);
  const draggedItemRef = useRef<{ itemId: string; issueNumber: number } | null>(
    null
  );
  /** AbortController für die globalen PointerEvent-Listener des aktiven Drags.
   * Wird beim pointerup und beim Unmount der Komponente abgebrochen, damit
   * keine Listener-Leaks entstehen, wenn die Komponente während eines Drags
   * unmountet wird. */
  const dragAbortRef = useRef<AbortController | null>(null);

  const selectedProject = getProjectForFolder(folder);

  // Cleanup globaler Drag-Listener beim Unmount, damit kein Listener-Leak
  // entsteht, wenn die Komponente während eines aktiven Drags unmountet wird.
  useEffect(() => {
    return () => {
      dragAbortRef.current?.abort();
    };
  }, []);

  // ── Data loading ────────────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    try {
      const result = await wrapInvoke<ProjectSummary[]>("list_user_projects", {
        folder,
      });
      if (!mountedRef.current) return;
      setProjects(result);
      // Auto-select first project if none stored for this folder
      if (result.length > 0 && !getProjectForFolder(folder)) {
        setFolderProject(folder, {
          projectNumber: result[0].number,
          projectId: result[0].id,
          title: result[0].title,
        });
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(getErrorMessage(err));
        setLoading(false);
      }
    }
  }, [folder, getProjectForFolder, setFolderProject]);

  const loadBoard = useCallback(
    async (forceRefresh = false) => {
      const proj = getProjectForFolder(folder);
      if (!proj) return;

      const cacheKey = `${folder}:${proj.projectNumber}`;
      if (!forceRefresh) {
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          setBoard(cached.board);
          setError("");
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError("");

      try {
        const result = await wrapInvoke<ProjectBoard>("get_project_board", {
          projectNumber: proj.projectNumber,
          projectId: proj.projectId,
          folder,
        });
        const cacheEntry: CacheEntry = { board: result, timestamp: Date.now() };
        cache.set(cacheKey, cacheEntry);
        if (mountedRef.current) {
          setBoard(result);
          setLoading(false);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(getErrorMessage(err));
          setLoading(false);
        }
      }
    },
    [folder, getProjectForFolder]
  );

  useEffect(() => {
    mountedRef.current = true;
    boardInitializedRef.current = false;
    void loadProjects().then(() => {
      boardInitializedRef.current = true;
      return loadBoard();
    });
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder]);

  // Re-load board when the user switches projects via the picker.
  // Skip if the initial load sequence already handles it.
  useEffect(() => {
    if (!boardInitializedRef.current) return;
    if (selectedProject) void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.projectNumber]);

  // ── Drag & drop ─────────────────────────────────────────────────────

  const handleDropLane = useCallback(
    async (targetOptionId: string) => {
      const dragged = draggedItemRef.current;
      draggedItemRef.current = null;
      setDragOverOptionId(null);
      if (!dragged || !board) return;

      const item = board.items.find((i) => i.item_id === dragged.itemId);
      if (!item || item.current_lane_option_id === targetOptionId) return;

      setMoving(dragged.itemId);
      setMoveError(null);

      // Optimistic update
      const prevBoard = board;
      setBoard({
        ...board,
        items: board.items.map((i) =>
          i.item_id === dragged.itemId
            ? { ...i, current_lane_option_id: targetOptionId }
            : i
        ),
      });

      try {
        await invoke("move_project_item", {
          projectId: board.project_id,
          itemId: dragged.itemId,
          fieldId: board.status_field_id,
          optionId: targetOptionId,
          folder,
        });
        // Invalidate cache so next refresh reflects server state
        const proj = getProjectForFolder(folder);
        if (proj) cache.delete(`${folder}:${proj.projectNumber}`);
      } catch (err) {
        logError("KanbanBoard.moveItem", err);
        setMoveError(
          `Verschieben fehlgeschlagen: ${getErrorMessage(err)}`
        );
        // Rollback to previous state
        setBoard(prevBoard);
      } finally {
        setMoving(null);
      }
    },
    [board, folder, getProjectForFolder]
  );

  const startGlobalDragListeners = useCallback(() => {
    // Vorherigen AbortController defensiv abbrechen (z.B. bei rapid-fire Drags).
    dragAbortRef.current?.abort();
    dragAbortRef.current = new AbortController();
    const { signal } = dragAbortRef.current;

    const onMove = (e: PointerEvent) => {
      if (!draggedItemRef.current) return;
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      const laneEl = els.find((el) => el.hasAttribute("data-lane-id"));
      setDragOverOptionId(laneEl?.getAttribute("data-lane-id") ?? null);
    };

    const onUp = (e: PointerEvent) => {
      // Signal abbrechen entfernt beide Listener automatisch.
      dragAbortRef.current?.abort();
      dragAbortRef.current = null;
      if (!draggedItemRef.current) return;
      const els = document.elementsFromPoint(e.clientX, e.clientY);
      const laneEl = els.find((el) => el.hasAttribute("data-lane-id"));
      const optionId = laneEl?.getAttribute("data-lane-id") ?? null;
      if (optionId) void handleDropLane(optionId);
      else {
        draggedItemRef.current = null;
        setDragOverOptionId(null);
      }
    };

    window.addEventListener("pointermove", onMove, { signal });
    window.addEventListener("pointerup", onUp, { signal });
  }, [handleDropLane]);

  // ── Project picker ───────────────────────────────────────────────────

  const handleSelectProject = (proj: ProjectSummary) => {
    setFolderProject(folder, {
      projectNumber: proj.number,
      projectId: proj.id,
      title: proj.title,
    });
    setProjectPickerOpen(false);
    setBoard(null);
    setLoading(true);
  };

  // ── Loading / error states ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Kanban-Daten...
      </div>
    );
  }

  if (error) {
    const isScope = error.toLowerCase().includes("project");
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <AlertCircle className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Fehler beim Laden des Boards</span>
        <span className="text-xs text-neutral-600 max-w-md text-center">
          {isScope
            ? 'GitHub Scope fehlt. Führe aus: gh auth refresh -s project,read:project'
            : error}
        </span>
        <button
          onClick={() => { setError(""); void loadBoard(true); }}
          className="mt-2 px-3 py-1.5 text-xs text-neutral-300 bg-surface-raised border border-neutral-700 rounded-sm hover:bg-hover-overlay transition-colors"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!board) return null;

  const itemCount = board.items.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 shrink-0">
        <div className="flex items-center gap-2">
          <Columns3 className="w-4 h-4 text-neutral-400" />
          {/* Project selector */}
          <div className="relative">
            <button
              onClick={() => setProjectPickerOpen((o) => !o)}
              className="flex items-center gap-1 text-xs text-neutral-300 hover:text-neutral-100 transition-colors"
            >
              <span className="font-medium">
                {selectedProject?.title ?? "Projekt wählen"}
              </span>
              <ChevronDown className="w-3 h-3 text-neutral-500" />
            </button>
            {projectPickerOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-surface-raised border border-neutral-700 rounded-sm shadow-lg min-w-[200px]">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProject(p)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-hover-overlay transition-colors ${
                      selectedProject?.projectNumber === p.number
                        ? "text-accent"
                        : "text-neutral-300"
                    }`}
                  >
                    <span className="block truncate">{p.title}</span>
                    <span className="text-[10px] text-neutral-500">
                      {p.items_total} Items
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-xs text-neutral-600">({itemCount} Issues)</span>
        </div>
        <button
          onClick={() => void loadBoard(true)}
          className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Neu laden"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Move error toast */}
      {moveError && (
        <div className="mx-4 mt-2 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-sm flex items-center justify-between">
          <span>{moveError}</span>
          <button
            onClick={() => setMoveError(null)}
            className="ml-2 text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* Board — lanes from GitHub Projects v2 Status field */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-3 h-full min-w-min">
          {board.lanes.map((lane) => {
            const laneItems = board.items.filter(
              (i) => i.current_lane_option_id === lane.option_id
            );
            return (
              <div
                key={lane.option_id}
                data-lane-id={lane.option_id}
                className={`flex flex-col w-[260px] min-w-[260px] bg-surface-raised border rounded-sm transition-colors ${
                  dragOverOptionId === lane.option_id
                    ? "border-accent bg-accent-a10/5"
                    : "border-neutral-700"
                }`}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 shrink-0">
                  <span className="text-xs font-medium text-neutral-300">
                    {lane.name}
                  </span>
                  <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded-sm">
                    {laneItems.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {laneItems.length === 0 ? (
                    <div className="text-[11px] text-neutral-600 text-center py-4">
                      Keine Issues
                    </div>
                  ) : (
                    laneItems.map((item) => (
                      <div
                        key={item.item_id}
                        className={
                          moving === item.item_id
                            ? "opacity-50 pointer-events-none"
                            : ""
                        }
                      >
                        <KanbanCard
                          issue={toKanbanIssue(item)}
                          onClick={() => setSelectedIssue(item.issue_number)}
                          onDragStart={() => {
                            draggedItemRef.current = {
                              itemId: item.item_id,
                              issueNumber: item.issue_number,
                            };
                            startGlobalDragListeners();
                          }}
                          onDragEnd={() => {
                            draggedItemRef.current = null;
                            setDragOverOptionId(null);
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}

          {/* Items with no status — shown as extra column if any */}
          {(() => {
            const noStatusItems = board.items.filter(
              (i) => i.current_lane_option_id === null
            );
            if (noStatusItems.length === 0) return null;
            return (
              <div
                key="__no_status__"
                data-lane-id="__no_status__"
                className="flex flex-col w-[260px] min-w-[260px] bg-surface-raised border border-dashed border-neutral-700 rounded-sm"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 shrink-0">
                  <span className="text-xs font-medium text-neutral-500">
                    Kein Status
                  </span>
                  <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded-sm">
                    {noStatusItems.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {noStatusItems.map((item) => (
                    <KanbanCard
                      key={item.item_id}
                      issue={toKanbanIssue(item)}
                      onClick={() => setSelectedIssue(item.issue_number)}
                      onDragStart={() => {
                        draggedItemRef.current = {
                          itemId: item.item_id,
                          issueNumber: item.issue_number,
                        };
                        startGlobalDragListeners();
                      }}
                      onDragEnd={() => {
                        draggedItemRef.current = null;
                        setDragOverOptionId(null);
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedIssue !== null && (
        <KanbanDetailModal
          open
          folder={folder}
          repository={null}
          issueNumber={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onIssueChanged={() => {
            const proj = getProjectForFolder(folder);
            if (proj) cache.delete(`${folder}:${proj.projectNumber}`);
            void loadBoard(true);
          }}
        />
      )}
    </div>
  );
}
