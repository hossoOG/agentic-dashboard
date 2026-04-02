import { motion } from "framer-motion";
import { OrchestratorNode } from "./OrchestratorNode";
import { WorktreeNode } from "./WorktreeNode";
import { QAGateNode } from "./QAGateNode";
import { useAdaptedPipelineData } from "../store/pipelineAdapter";
import { Search, ChevronRight } from "lucide-react";

interface DashboardMapProps {
  sessionId?: string | null;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="w-16 h-16 rounded-full border-2 border-neutral-700 flex items-center justify-center">
          <Search className="w-7 h-7 text-neutral-500" />
        </div>
        <h2 className="text-lg font-display font-bold text-neutral-300 tracking-wider">
          Keine Agenten erkannt
        </h2>
        <p className="text-sm text-neutral-500 max-w-md leading-relaxed">
          Starte eine Session mit Agenten um die Pipeline-Ansicht zu sehen.
        </p>
      </motion.div>
    </div>
  );
}

/** Column divider with chevron arrow indicating flow direction */
function ColumnDivider() {
  return (
    <div className="flex flex-col items-center justify-center text-neutral-600">
      <div className="w-px flex-1 bg-neutral-700" />
      <ChevronRight className="w-5 h-5 my-2 text-neutral-500" />
      <div className="w-px flex-1 bg-neutral-700" />
    </div>
  );
}

export function DashboardMap({ sessionId }: DashboardMapProps) {
  const adapted = useAdaptedPipelineData(sessionId);
  const { hasAgents, worktrees, orchestratorStatus, orchestratorLog, qaGate } = adapted;

  if (!hasAgents) {
    return (
      <div className="h-full bg-surface-base">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="h-full bg-surface-base p-4 flex gap-4 overflow-hidden">
      {/* Left column: Orchestrator */}
      <div className="w-72 flex-shrink-0 flex items-start">
        <OrchestratorNode
          orchestratorStatus={orchestratorStatus}
          orchestratorLog={orchestratorLog}
          summary={adapted.summary}
        />
      </div>

      <ColumnDivider />

      {/* Center column: Worktrees */}
      <div className="flex-1 min-w-0 overflow-y-auto space-y-3">
        {worktrees.map((wt, index) => (
          <motion.div
            key={wt.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.3 }}
          >
            <WorktreeNode worktree={wt} />
          </motion.div>
        ))}
      </div>

      <ColumnDivider />

      {/* Right column: QA Gate */}
      <div className="w-72 flex-shrink-0 flex items-start">
        <QAGateNode qaGate={qaGate} />
      </div>
    </div>
  );
}
