import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Loader2, Inbox } from "lucide-react";
import { usePipelineHistoryStore } from "../../store/pipelineHistoryStore";
import { formatElapsed } from "../../utils/formatElapsed";
import { OUTCOME_CONFIG, formatTimestamp } from "./pipelineOutcomeConfig";
import type { PipelineRun } from "../../types/pipelineHistory";

// ============================================================================
// Sub-Components
// ============================================================================

function RunRow({
  run,
  onSelect,
}: {
  run: PipelineRun;
  onSelect: (id: string) => void;
}) {
  const config = OUTCOME_CONFIG[run.outcome];
  const Icon = config.icon;
  const stepCount = run.steps.length;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      onClick={() => onSelect(run.id)}
      className="w-full text-left px-4 py-3 hover:bg-surface-raised/60 transition-colors border-b border-neutral-700/50 flex items-center gap-3 group"
      data-testid={`run-row-${run.id}`}
    >
      {/* Status icon */}
      <span className={`shrink-0 ${config.color}`}>
        <Icon className="w-4 h-4" />
      </span>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200 truncate">
            {run.workflowName}
          </span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.color} ${config.bg}`}
          >
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-neutral-500">
          <span>{formatTimestamp(run.startedAt)}</span>
          <span>Laufzeit {formatElapsed(run.totalDurationMs)}</span>
          <span>
            {stepCount} {stepCount === 1 ? "Schritt" : "Schritte"}
          </span>
        </div>
      </div>

      {/* Chevron */}
      <span className="text-neutral-600 group-hover:text-neutral-400 transition-colors shrink-0">
        &rsaquo;
      </span>
    </motion.button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PipelineHistoryView() {
  const runs = usePipelineHistoryStore((s) => s.runs);
  const isLoading = usePipelineHistoryStore((s) => s.isLoading);
  const loadRuns = usePipelineHistoryStore((s) => s.loadRuns);
  const selectRun = usePipelineHistoryStore((s) => s.selectRun);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
        <h3 className="text-xs font-display font-bold text-neutral-400 tracking-widest uppercase">
          Pipeline-Verlauf
        </h3>
        <button
          onClick={() => loadRuns()}
          disabled={isLoading}
          className="p-1 rounded hover:bg-surface-raised text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Aktualisieren"
          data-testid="refresh-button"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && runs.length === 0 ? (
          /* Loading state */
          <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs">Lade Pipeline-Runs...</span>
          </div>
        ) : runs.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-500 px-4">
            <Inbox className="w-8 h-8" />
            <span className="text-sm">
              Noch keine Pipeline-Runs vorhanden
            </span>
          </div>
        ) : (
          /* Run list */
          <AnimatePresence mode="popLayout">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} onSelect={selectRun} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
