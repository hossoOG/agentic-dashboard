import { Search } from "lucide-react";
import { useAgentStore } from "../../store/agentStore";
import { useAdaptedTaskTree } from "../../store/pipelineAdapter";
import { TaskTreeNode } from "./TaskTreeNode";

interface TaskTreeViewProps {
  sessionId?: string | null;
}

export function TaskTreeView({ sessionId }: TaskTreeViewProps) {
  const { hasAgents, roots, summary, taskSummary } = useAdaptedTaskTree(sessionId);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);

  if (!hasAgents) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-3">
        <Search className="w-10 h-10 stroke-[1.5]" />
        <div className="text-center">
          <p className="text-sm">Keine Agenten erkannt</p>
          <p className="text-xs text-neutral-600 mt-1">
            Starte eine Session mit Claude CLI um Agenten zu sehen
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-neutral-700 text-xs text-neutral-400 shrink-0">
        <span>
          <strong className="text-neutral-200">{summary.total}</strong> Agenten
        </span>
        {summary.running > 0 && (
          <span className="text-accent">
            {summary.running} aktiv
          </span>
        )}
        {summary.completed > 0 && (
          <span className="text-success">
            {summary.completed} fertig
          </span>
        )}
        {summary.error > 0 && (
          <span className="text-red-500">
            {summary.error} Fehler
          </span>
        )}
        {summary.pending > 0 && (
          <span className="text-neutral-500">
            {summary.pending} wartend
          </span>
        )}
        {summary.blocked > 0 && (
          <span className="text-yellow-500">
            {summary.blocked} blockiert
          </span>
        )}
      </div>

      {/* Tree */}
      <div className="flex-1 min-h-0 overflow-auto py-1">
        {roots.map((node) => (
          <TaskTreeNode
            key={node.agent.id}
            node={node}
            onSelect={setSelectedAgent}
            selectedAgentId={selectedAgentId}
          />
        ))}
      </div>

      {/* Task summary footer */}
      {taskSummary && (taskSummary.pending > 0 || taskSummary.completed > 0) && (
        <div className="px-4 py-1.5 border-t border-neutral-700 text-[10px] text-neutral-500 shrink-0">
          +{taskSummary.pending} wartend
          {taskSummary.completed > 0 && `, ${taskSummary.completed} abgeschlossen`}
        </div>
      )}
    </div>
  );
}
