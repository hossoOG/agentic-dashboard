import { useState, useEffect } from "react";
import { WorkflowLauncher } from "./WorkflowLauncher";
import { PipelineControls } from "./PipelineControls";
import { TaskTreeView } from "./TaskTreeView";
import { AgentMetricsPanel } from "./AgentMetricsPanel";
import { PipelineStatusBar } from "./PipelineStatusBar";
import { PipelineHistoryView } from "./PipelineHistoryView";
import { PipelineRunDetail } from "./PipelineRunDetail";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useAgentStore, selectDetectionQuality } from "../../store/agentStore";
import { usePipelineStatusStore } from "../../store/pipelineStatusStore";
import { usePipelineHistoryStore } from "../../store/pipelineHistoryStore";
import { useStaleAgentCleanup } from "./useStaleAgentCleanup";

type PipelineTab = "live" | "history";

/**
 * PipelineView — Wrapper that combines:
 * 1. Header with session filter dropdown + tab switcher (Live / Verlauf)
 * 2. Live tab: WorkflowLauncher, TaskTreeView, AgentMetricsPanel
 * 3. History tab: PipelineHistoryView / PipelineRunDetail
 */
export function PipelineView() {
  const activeSession = useSessionStore(selectActiveSession);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const favorites = useSettingsStore((s) => s.favorites);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [filterSessionId, setFilterSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PipelineTab>("live");

  // Folder resolution: explicit selection > active session > null
  const folder = selectedFolder ?? activeSession?.folder ?? null;

  const effectiveSessionId = filterSessionId ?? activeSessionId;
  const detectionQuality = useAgentStore(selectDetectionQuality(effectiveSessionId ?? ""));
  const startPolling = usePipelineStatusStore((s) => s.startPolling);
  const stopPolling = usePipelineStatusStore((s) => s.stopPolling);

  // History detail state
  const selectedRunId = usePipelineHistoryStore((s) => s.selectedRunId);
  const runs = usePipelineHistoryStore((s) => s.runs);
  const selectedRun = selectedRunId
    ? runs.find((r) => r.id === selectedRunId) ?? null
    : null;

  // Start/stop pipeline status polling on mount/unmount
  useEffect(() => {
    startPolling();
    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  // Clean up stale agents stuck in "running" status
  useStaleAgentCleanup();

  const TAB_CLASSES = (tab: PipelineTab) =>
    `px-3 py-1 text-xs font-medium rounded transition-colors ${
      activeTab === tab
        ? "bg-accent/20 text-accent"
        : "text-neutral-500 hover:text-neutral-300"
    }`;

  return (
    <div className="flex flex-col h-full">
      {/* Header with session selector + tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-display font-bold text-neutral-300 tracking-widest uppercase">
            Pipeline
          </h2>
          <div className="flex items-center gap-1">
            <button
              className={TAB_CLASSES("live")}
              onClick={() => setActiveTab("live")}
            >
              Live
            </button>
            <button
              className={TAB_CLASSES("history")}
              onClick={() => setActiveTab("history")}
              data-testid="history-tab"
            >
              Verlauf
            </button>
          </div>
        </div>
        {activeTab === "live" && (
          <select
            value={filterSessionId ?? ""}
            onChange={(e) =>
              setFilterSessionId(e.target.value === "" ? null : e.target.value)
            }
            className="bg-surface-raised border border-neutral-700 text-sm text-neutral-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Alle Sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        )}
      </div>

      {activeTab === "live" ? (
        <>
          <PipelineStatusBar />

          {/* Folder picker — session or favorites */}
          {(favorites.length > 0 || activeSession) && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700 shrink-0">
              <span className="text-xs text-neutral-500">Projekt:</span>
              <select
                value={folder ?? ""}
                onChange={(e) => setSelectedFolder(e.target.value || null)}
                className="text-xs bg-surface-base border border-neutral-700 text-neutral-300 rounded-sm px-2 py-1 outline-none focus:border-accent max-w-xs"
                data-testid="folder-picker"
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

          {/* Pipeline Controls — start/stop workflows */}
          {folder && <PipelineControls projectPath={folder} />}

          {/* Detection quality warning */}
          {effectiveSessionId && detectionQuality === "none" && (
            <div className="mx-4 mt-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
              Agent-Erkennung hat noch keine Agents erkannt. Die Erkennung basiert auf Terminal-Output-Patterns und funktioniert möglicherweise nicht mit allen Claude CLI Versionen.
            </div>
          )}

          {/* Top: Workflow Launcher */}
          <WorkflowLauncher folder={folder} />

          {/* Middle: Task Tree — takes remaining space */}
          <div className="flex-1 min-h-0">
            <TaskTreeView sessionId={effectiveSessionId} />
          </div>

          {/* Bottom: Agent Metrics */}
          <AgentMetricsPanel sessionId={effectiveSessionId ?? undefined} />
        </>
      ) : selectedRun ? (
        <PipelineRunDetail run={selectedRun} />
      ) : (
        <PipelineHistoryView />
      )}
    </div>
  );
}
