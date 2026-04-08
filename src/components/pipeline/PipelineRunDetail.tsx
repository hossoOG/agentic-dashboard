import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { usePipelineHistoryStore } from "../../store/pipelineHistoryStore";
import { formatElapsed } from "../../utils/formatElapsed";
import { OUTCOME_CONFIG, formatTimestamp } from "./pipelineOutcomeConfig";
import type {
  PipelineRun,
  StepRecord,
} from "../../types/pipelineHistory";

// ============================================================================
// Helpers
// ============================================================================

const STEP_TYPE_LABELS: Record<string, string> = {
  agent: "Agent",
  gate: "Gate",
  action: "Aktion",
};

// ============================================================================
// Sub-Components
// ============================================================================

function StepTimelineItem({ step, index }: { step: StepRecord; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = OUTCOME_CONFIG[step.outcome];
  const Icon = config.icon;
  const hasOutput = !!step.outputSnippet;
  const hasError = !!step.errorMessage;
  const isExpandable = hasOutput || hasError;

  return (
    <div className="relative pl-6" data-testid={`step-${step.stepId}`}>
      {/* Timeline connector line */}
      <div className="absolute left-[9px] top-6 bottom-0 w-px bg-neutral-700" />

      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-1 w-[18px] h-[18px] rounded-full border-2 border-neutral-800 flex items-center justify-center ${config.bg}`}
      >
        <Icon className={`w-3 h-3 ${config.color}`} />
      </div>

      <div className="pb-4">
        {/* Step header */}
        <button
          onClick={() => isExpandable && setExpanded((v) => !v)}
          className={`flex items-center gap-2 text-left w-full ${isExpandable ? "cursor-pointer" : "cursor-default"}`}
          disabled={!isExpandable}
        >
          <span className="text-sm font-medium text-neutral-200">
            {index + 1}. {step.stepId}
          </span>
          <span className="text-[10px] text-neutral-500 bg-neutral-800 rounded px-1.5 py-0.5">
            {STEP_TYPE_LABELS[step.stepType] ?? step.stepType}
          </span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.color} ${config.bg}`}
          >
            {config.label}
          </span>
          {step.retryCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-yellow-400"
              data-testid={`retry-${step.stepId}`}
            >
              <RotateCcw className="w-3 h-3" />
              {step.retryCount}x
            </span>
          )}
          <span className="text-xs text-neutral-500 ml-auto shrink-0">
            {formatElapsed(step.durationMs)}
          </span>
          {isExpandable && (
            <span className="text-neutral-600 shrink-0">
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </span>
          )}
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2">
                {hasError && (
                  <div className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">
                    <span className="font-medium">Fehler: </span>
                    {step.errorMessage}
                  </div>
                )}
                {hasOutput && (
                  <pre className="text-xs text-neutral-400 bg-neutral-800/50 rounded px-3 py-2 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {step.outputSnippet}
                  </pre>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PipelineRunDetail({ run }: { run: PipelineRun }) {
  const clearSelection = usePipelineHistoryStore((s) => s.clearSelection);
  const config = OUTCOME_CONFIG[run.outcome];
  const Icon = config.icon;
  const inputEntries = Object.entries(run.inputs ?? {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-700 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={clearSelection}
            className="p-1 rounded hover:bg-surface-raised text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Zurueck"
            data-testid="back-button"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-display font-bold text-neutral-200 truncate">
            {run.workflowName}
          </h3>
          <span
            className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${config.color} ${config.bg}`}
          >
            <Icon className="w-3 h-3" />
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span>Gestartet: {formatTimestamp(run.startedAt)}</span>
          <span>Laufzeit: {formatElapsed(run.totalDurationMs)}</span>
          <span>
            {run.steps.length}{" "}
            {run.steps.length === 1 ? "Schritt" : "Schritte"}
          </span>
          {run.totalTokens != null && run.totalTokens > 0 && (
            <span>{run.totalTokens.toLocaleString("de-DE")} Tokens</span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
        {/* Inputs section */}
        {inputEntries.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
              Eingaben
            </h4>
            <div className="bg-neutral-800/50 rounded px-3 py-2 space-y-1">
              {inputEntries.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-xs">
                  <span className="text-neutral-500 shrink-0">{key}:</span>
                  <span className="text-neutral-300 break-words">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step timeline */}
        <div>
          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
            Schritte
          </h4>
          {run.steps.length === 0 ? (
            <span className="text-xs text-neutral-500">
              Keine Schritte vorhanden
            </span>
          ) : (
            <div>
              {run.steps.map((step, i) => (
                <StepTimelineItem key={step.stepId} step={step} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
