import { WorkflowLauncher } from "./WorkflowLauncher";
import { DashboardMap } from "../DashboardMap";
import { AgentMetricsPanel } from "./AgentMetricsPanel";

/**
 * PipelineView — Wrapper that combines:
 * 1. WorkflowLauncher (top) — detected workflows from Skills/Hooks
 * 2. DashboardMap (middle) — isometric agent visualization
 * 3. AgentMetricsPanel (bottom) — aggregated agent metrics
 */
export function PipelineView() {
  return (
    <div className="flex flex-col h-full">
      {/* Top: Workflow Launcher */}
      <WorkflowLauncher />

      {/* Middle: Dashboard Map (isometric view) — takes remaining space */}
      <div className="flex-1 min-h-0">
        <DashboardMap />
      </div>

      {/* Bottom: Agent Metrics */}
      <AgentMetricsPanel />
    </div>
  );
}
