import { useState } from "react";
import { WorkflowLauncher } from "./WorkflowLauncher";
import { DashboardMap } from "../DashboardMap";
import { AgentMetricsPanel } from "./AgentMetricsPanel";
import { useSessionStore } from "../../store/sessionStore";

/**
 * PipelineView — Wrapper that combines:
 * 1. Header with session filter dropdown
 * 2. WorkflowLauncher — detected workflows from Skills/Hooks
 * 3. DashboardMap — 2D agent pipeline visualization
 * 4. AgentMetricsPanel — aggregated agent metrics
 */
export function PipelineView() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessions = useSessionStore((s) => s.sessions);
  const [filterSessionId, setFilterSessionId] = useState<string | null>(null);
  const effectiveSessionId = filterSessionId ?? activeSessionId;

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

      {/* Top: Workflow Launcher */}
      <WorkflowLauncher />

      {/* Middle: Dashboard Map — takes remaining space */}
      <div className="flex-1 min-h-0">
        <DashboardMap sessionId={effectiveSessionId} />
      </div>

      {/* Bottom: Agent Metrics */}
      <AgentMetricsPanel sessionId={effectiveSessionId ?? undefined} />
    </div>
  );
}
