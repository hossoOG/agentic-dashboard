import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Columns3, AlertCircle } from "lucide-react";
import { KanbanCard, type KanbanIssue } from "./KanbanCard";
import { KanbanDetailModal } from "./KanbanDetailModal";
import { logError } from "../../utils/errorLogger";

/** Shared drag state (avoids dataTransfer issues in WebView2) */
let draggedIssueNumber: number | null = null;

interface KanbanBoardProps {
  folder: string;
}

interface Column {
  id: string;
  label: string;
  issues: KanbanIssue[];
}

// Cache to avoid re-fetching on tab switches
interface CacheEntry {
  issues: KanbanIssue[];
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60_000;

/** Map an issue to a column based on labels and state */
function classifyIssue(issue: KanbanIssue): string {
  const labelNames = issue.labels.map((l) => l.name.toLowerCase());

  if (issue.state === "CLOSED" || labelNames.includes("done")) return "done";
  if (labelNames.includes("in-progress") || labelNames.includes("in progress") || labelNames.includes("sprint")) return "in-progress";
  if (labelNames.includes("todo") || labelNames.includes("to do")) return "todo";
  return "backlog";
}

function buildColumns(issues: KanbanIssue[]): Column[] {
  const buckets: Record<string, KanbanIssue[]> = {
    backlog: [],
    todo: [],
    "in-progress": [],
    done: [],
  };

  for (const issue of issues) {
    const col = classifyIssue(issue);
    buckets[col].push(issue);
  }

  return [
    { id: "backlog", label: "Backlog", issues: buckets.backlog },
    { id: "todo", label: "To Do", issues: buckets.todo },
    { id: "in-progress", label: "In Arbeit", issues: buckets["in-progress"] },
    { id: "done", label: "Erledigt", issues: buckets.done },
  ];
}

export function KanbanBoard({ folder }: KanbanBoardProps) {
  const [issues, setIssues] = useState<KanbanIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = cache.get(folder);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          setIssues(cached.issues);
          setError("");
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError("");

      try {
        const result = await invoke<KanbanIssue[]>("get_kanban_issues", { folder });
        cache.set(folder, { issues: result, timestamp: Date.now() });
        if (mountedRef.current) {
          setIssues(result);
          setLoading(false);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(String(err));
          setLoading(false);
        }
      }
    },
    [folder]
  );

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const handleDrop = useCallback(
    async (targetLane: string, e: React.DragEvent) => {
      e.preventDefault();
      setDragOverColumn(null);

      const issueNumber = draggedIssueNumber;
      draggedIssueNumber = null;
      if (issueNumber == null) return;

      // Check if already in this lane
      const issue = issues.find((i) => i.number === issueNumber);
      if (!issue) return;
      const currentLane = classifyIssue(issue);
      if (currentLane === targetLane) return;

      setMoving(issueNumber);
      setMoveError(null);
      try {
        await invoke("move_issue_lane", {
          folder,
          number: issueNumber,
          targetLane,
        });
        // Refresh after move
        cache.delete(folder);
        await load(true);
      } catch (err) {
        logError("KanbanBoard.moveIssue", err);
        setMoveError(`Verschieben von #${issueNumber} fehlgeschlagen: ${String(err)}`);
      } finally {
        setMoving(null);
      }
    },
    [folder, issues, load]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Kanban-Daten...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <AlertCircle className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Fehler beim Laden der Issues</span>
        <span className="text-xs text-neutral-600 max-w-md text-center">
          {error.includes("not found")
            ? "gh CLI nicht gefunden — installiere von https://cli.github.com"
            : error}
        </span>
        <button
          onClick={() => load(true)}
          className="mt-2 px-3 py-1.5 text-xs text-neutral-300 bg-surface-raised border border-neutral-700 rounded-sm hover:bg-hover-overlay transition-colors"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  const columns = buildColumns(issues);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 shrink-0">
        <div className="flex items-center gap-2">
          <Columns3 className="w-4 h-4 text-neutral-400" />
          <span className="text-xs text-neutral-400 font-medium">
            Kanban ({issues.length} Issues)
          </span>
        </div>
        <button
          onClick={() => load(true)}
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
          <button onClick={() => setMoveError(null)} className="ml-2 text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <div className="flex gap-3 h-full min-w-min">
          {columns.map((col) => (
            <div
              key={col.id}
              className={`flex flex-col w-[260px] min-w-[260px] bg-surface-raised border rounded-sm transition-colors ${
                dragOverColumn === col.id
                  ? "border-accent bg-accent-a10/5"
                  : "border-neutral-700"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverColumn(col.id);
              }}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => handleDrop(col.id, e)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 shrink-0">
                <span className="text-xs font-medium text-neutral-300">
                  {col.label}
                </span>
                <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded-sm">
                  {col.issues.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {col.issues.length === 0 ? (
                  <div className="text-[11px] text-neutral-600 text-center py-4">
                    Keine Issues
                  </div>
                ) : (
                  col.issues.map((issue) => (
                    <div
                      key={issue.number}
                      className={
                        moving === issue.number ? "opacity-50 pointer-events-none" : ""
                      }
                    >
                      <KanbanCard
                        issue={issue}
                        onClick={() => setSelectedIssue(issue.number)}
                        onDragStart={() => {
                          draggedIssueNumber = issue.number;
                        }}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedIssue !== null && (
        <KanbanDetailModal
          folder={folder}
          issueNumber={selectedIssue}
          onClose={() => setSelectedIssue(null)}
        />
      )}
    </div>
  );
}
