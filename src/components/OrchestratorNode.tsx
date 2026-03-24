import { motion, AnimatePresence } from "framer-motion";
import { usePipelineStore } from "../store/pipelineStore";
import { ORCHESTRATOR_CONFIG, getStatusStyle, PULSE_STATUSES } from "../utils/statusConfig";
import { DURATION, EASE, VARIANTS } from "../utils/motion";

const GLOW_MAP: Record<string, string> = {
  planning: "glow-accent",
  generated_manifest: "glow-success",
};

export function OrchestratorNode() {
  const { orchestratorStatus, orchestratorLog } = usePipelineStore();
  const config = ORCHESTRATOR_CONFIG[orchestratorStatus];
  const style = getStatusStyle(orchestratorStatus);
  const Icon = config.icon;
  const isActive = PULSE_STATUSES.has(orchestratorStatus);
  const glowClass = GLOW_MAP[orchestratorStatus] ?? "";

  return (
    <motion.div
      aria-label={`Orchestrator – ${config.label}`}
      animate={VARIANTS.breathe(isActive)}
      transition={{ duration: DURATION.ambient / 4, repeat: isActive ? Infinity : 0, ease: EASE.out as unknown as string }}
      className={`w-80 rounded-none border-2 ${style.border} bg-surface-raised ${glowClass} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <motion.div
            animate={VARIANTS.spin(isActive)}
            transition={{ duration: DURATION.ambient / 2.5, repeat: isActive ? Infinity : 0, ease: "linear" }}
          >
            <Icon className={`w-5 h-5 ${style.text}`} />
          </motion.div>
          <span className={`font-display font-bold text-sm tracking-widest ${style.text}`}>
            ORCHESTRATOR
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${style.text}`}>
          <motion.div
            className="w-2 h-2 rounded-full bg-current"
            animate={VARIANTS.dotPulse(isActive)}
            transition={{ duration: DURATION.base * 3, repeat: Infinity }}
          />
          {config.label}
        </div>
      </div>

      {/* Terminal log */}
      <div className="retro-terminal p-3 h-28 overflow-y-auto">
        <AnimatePresence>
          {orchestratorLog.slice(-8).map((log, i) => (
            <motion.div
              key={`${log}-${i}`}
              initial={VARIANTS.fadeInLeft.initial}
              animate={VARIANTS.fadeInLeft.animate}
              transition={{ duration: DURATION.fast, ease: EASE.out as unknown as string }}
              className="text-xs text-neutral-300 py-0.5"
            >
              <span className="text-success mr-1">›</span>
              {log}
            </motion.div>
          ))}
          {orchestratorLog.length === 0 && (
            <div className="text-neutral-600 text-xs italic">Waiting to start...</div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
