import { motion, AnimatePresence } from "framer-motion";
import type { OrchestratorStatus } from "../store/pipelineStore";
import { ORCHESTRATOR_CONFIG, getStatusStyle, PULSE_STATUSES } from "../utils/statusConfig";
import { DURATION, EASE } from "../utils/motion";

interface Props {
  orchestratorStatus: OrchestratorStatus;
  orchestratorLog: string[];
  summary?: {
    total: number;
    running: number;
    completed: number;
    error: number;
  };
}

export function OrchestratorNode({ orchestratorStatus, orchestratorLog, summary }: Props) {
  const config = ORCHESTRATOR_CONFIG[orchestratorStatus];
  const style = getStatusStyle(orchestratorStatus);
  const Icon = config.icon;
  const isActive = PULSE_STATUSES.has(orchestratorStatus);

  return (
    <motion.div
      aria-label={`Orchestrator – ${config.label}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      className={`w-72 rounded-lg border border-neutral-700 bg-surface-raised overflow-hidden border-l-[3px] ${style.border}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${style.text}`} />
          <span className={`font-display font-bold text-sm tracking-widest ${style.text}`}>
            ORCHESTRATOR
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${style.text}`}>
          <div
            className={`w-2 h-2 rounded-full ${style.dot} ${isActive ? "animate-pulse" : "opacity-40"}`}
          />
          {config.label}
        </div>
      </div>

      {/* Agent summary bar */}
      {summary && summary.total > 0 && (
        <div className="px-4 py-2 border-b border-neutral-700 flex items-center gap-3 text-xs">
          <span className="text-neutral-400">
            <span className="text-neutral-200 font-bold">{summary.total}</span> Agent(en)
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
            <span className="text-error">
              {summary.error} Fehler
            </span>
          )}
        </div>
      )}

      {/* Log viewer */}
      <div className="p-3 h-28 overflow-y-auto font-mono">
        <AnimatePresence>
          {orchestratorLog.slice(-5).map((log, i) => (
            <motion.div
              key={`${log}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.fast, ease: EASE.out }}
              className="text-xs text-neutral-300 py-0.5"
            >
              <span className="text-success mr-1">{"›"}</span>
              {log}
            </motion.div>
          ))}
          {orchestratorLog.length === 0 && (
            <div className="text-neutral-600 text-xs italic">Warte auf Start...</div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
