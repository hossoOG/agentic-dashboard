import { motion, AnimatePresence } from "framer-motion";
import { Activity, AlertCircle, CheckCircle2, Circle, Pause, Loader2 } from "lucide-react";
import {
  usePipelineStatusStore,
  selectIsRunning,
  selectIsIdle,
  selectIsTerminal,
} from "../../store/pipelineStatusStore";
import { formatElapsed } from "../../utils/formatElapsed";
import type { PipelineState } from "../../protocols/schema";

// ============================================================================
// Helpers
// ============================================================================

/** Configuration for each pipeline status. */
const STATUS_CONFIG: Record<PipelineState, {
  label: string;
  color: string;
  bgColor: string;
  badgeBg: string;
  icon: typeof Activity;
}> = {
  idle: { label: "Bereit", color: "text-neutral-400", bgColor: "bg-neutral-400", badgeBg: "bg-neutral-400/10", icon: Circle },
  starting: { label: "Startet", color: "text-blue-400", bgColor: "bg-blue-400", badgeBg: "bg-blue-400/10", icon: Loader2 },
  running: { label: "Aktiv", color: "text-green-400", bgColor: "bg-green-400", badgeBg: "bg-green-400/10", icon: Activity },
  paused: { label: "Pausiert", color: "text-yellow-400", bgColor: "bg-yellow-400", badgeBg: "bg-yellow-400/10", icon: Pause },
  completing: { label: "Abschluss", color: "text-blue-400", bgColor: "bg-blue-400", badgeBg: "bg-blue-400/10", icon: Loader2 },
  completed: { label: "Abgeschlossen", color: "text-blue-400", bgColor: "bg-blue-400", badgeBg: "bg-blue-400/10", icon: CheckCircle2 },
  failed: { label: "Fehlgeschlagen", color: "text-red-400", bgColor: "bg-red-400", badgeBg: "bg-red-400/10", icon: AlertCircle },
  cancelled: { label: "Abgebrochen", color: "text-neutral-500", bgColor: "bg-neutral-500", badgeBg: "bg-neutral-500/10", icon: Circle },
};

// ============================================================================
// Component
// ============================================================================

export function PipelineStatusBar() {
  const statusInfo = usePipelineStatusStore((s) => s.statusInfo);
  const isRunning = usePipelineStatusStore(selectIsRunning);
  const isIdle = usePipelineStatusStore(selectIsIdle);
  const isTerminal = usePipelineStatusStore(selectIsTerminal);

  const config = STATUS_CONFIG[statusInfo.status];
  const Icon = config.icon;
  const showProgress = isRunning && statusInfo.totalSteps > 0;
  const showElapsed = !isIdle && statusInfo.elapsedMs > 0;
  const showError = statusInfo.status === "failed" && statusInfo.errorMessage;

  return (
    <div className="border-b border-neutral-700 px-4 py-2">
      <AnimatePresence mode="wait">
        <motion.div
          key={statusInfo.status}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-3 text-xs"
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="relative flex h-2 w-2">
              {isRunning && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.bgColor} opacity-75`}
                />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${config.bgColor}`} />
            </span>
            <Icon className={`w-3.5 h-3.5 ${config.color} ${statusInfo.status === "starting" || statusInfo.status === "completing" ? "animate-spin" : ""}`} />
            <span className={`font-medium ${config.color}`}>{config.label}</span>
          </div>

          {/* Workflow name */}
          {statusInfo.workflowName && (
            <span className="text-neutral-300 truncate max-w-[200px]" title={statusInfo.workflowName}>
              {statusInfo.workflowName}
            </span>
          )}

          {/* Step progress */}
          {showProgress && (
            <span className="text-neutral-500 shrink-0">
              Schritt {statusInfo.stepIndex}/{statusInfo.totalSteps}
            </span>
          )}

          {/* Elapsed time */}
          {showElapsed && (
            <span className="text-neutral-500 shrink-0">
              Laufzeit {formatElapsed(statusInfo.elapsedMs)}
            </span>
          )}

          <div className="flex-1" />

          {isTerminal && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color} ${config.badgeBg}`}>
              {config.label}
            </span>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Error message */}
      {showError && (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-400 bg-red-400/10 rounded px-2 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Fehler: {statusInfo.errorMessage}</span>
        </div>
      )}
    </div>
  );
}
