import { useState, useEffect } from "react";
import { WorkflowLauncher } from "./WorkflowLauncher";
import { TaskTreeView } from "./TaskTreeView";
import { AgentMetricsPanel } from "./AgentMetricsPanel";
import { PipelineStatusBar } from "./PipelineStatusBar";
import { useSessionStore } from "../../store/sessionStore";
import { useAgentStore, selectDetectionQuality } from "../../store/agentStore";
import { usePipelineStatusStore } from "../../store/pipelineStatusStore";

/**
 * PipelineView — Wrapper that combines:
 * 1. Header with session filter dropdown
 * 2. WorkflowLauncher — detected workflows from Skills/Hooks
 * 3. TaskTreeView — hierarchical agent/task tree visualization
 * 4. AgentMetricsPanel — aggregated agent metrics
 */
export function PipelineView() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const [filterSessionId, setFilterSessionId] = useState<string | null>(null);
  const effectiveSessionId = filterSessionId ?? activeSessionId;
  const detectionQuality = useAgentStore(selectDetectionQuality(effectiveSessionId ?? ""));
  const startPolling = usePipelineStatusStore((s) => s.startPolling);
  const stopPolling = usePipelineStatusStore((s) => s.stopPolling);

  // Start/stop pipeline status polling on mount/unmount
  useEffect(() => {
    startPolling();
    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with session selector */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
        <h2 className="text-sm font-display font-bold text-neutral-300 tracking-wider uppercase">
          Pipeline
        </h2>
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
      </div>

      <PipelineStatusBar />

      {/* Detection quality warning */}
      {effectiveSessionId && detectionQuality === "none" && (
        <div className="mx-4 mt-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
          Agent-Erkennung hat noch keine Agents erkannt. Die Erkennung basiert auf Terminal-Output-Patterns und funktioniert möglicherweise nicht mit allen Claude CLI Versionen.
        </div>
      )}

      {/* Top: Workflow Launcher */}
      <WorkflowLauncher />

      {/* Middle: Task Tree — takes remaining space */}
      <div className="flex-1 min-h-0">
        <TaskTreeView sessionId={effectiveSessionId} />
      </div>

      {/* Bottom: Agent Metrics */}
      <AgentMetricsPanel sessionId={effectiveSessionId ?? undefined} />
    </div>
  );
}
