import { motion, AnimatePresence } from "framer-motion";
import { Brain, Zap, CheckCircle2 } from "lucide-react";
import { usePipelineStore } from "../store/pipelineStore";

const STATUS_CONFIG = {
  idle: {
    color: "text-gray-500",
    borderColor: "border-gray-700",
    glowClass: "",
    label: "IDLE",
    icon: Brain,
  },
  planning: {
    color: "text-neon-blue",
    borderColor: "border-neon-blue",
    glowClass: "neon-glow-blue",
    label: "PLANNING",
    icon: Zap,
  },
  generated_manifest: {
    color: "text-neon-green",
    borderColor: "border-neon-green",
    glowClass: "neon-glow-green",
    label: "MANIFEST READY",
    icon: CheckCircle2,
  },
};

export function OrchestratorNode() {
  const { orchestratorStatus, orchestratorLog } = usePipelineStore();
  const config = STATUS_CONFIG[orchestratorStatus];
  const Icon = config.icon;

  return (
    <motion.div
      animate={{
        scale: orchestratorStatus === "planning" ? [1, 1.02, 1] : 1,
      }}
      transition={{ duration: 2, repeat: orchestratorStatus === "planning" ? Infinity : 0 }}
      className={`w-80 rounded-none border-2 ${config.borderColor} bg-dark-card ${config.glowClass} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: orchestratorStatus === "planning" ? 360 : 0 }}
            transition={{ duration: 3, repeat: orchestratorStatus === "planning" ? Infinity : 0, ease: "linear" }}
          >
            <Icon className={`w-5 h-5 ${config.color}`} />
          </motion.div>
          <span className={`font-bold text-sm tracking-widest ${config.color}`}>
            ORCHESTRATOR
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${config.color}`}>
          <motion.div
            className={`w-2 h-2 rounded-full bg-current`}
            animate={{ opacity: orchestratorStatus !== "idle" ? [1, 0.2, 1] : 0.3 }}
            transition={{ duration: 1, repeat: Infinity }}
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
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs text-gray-300 py-0.5"
            >
              <span className="text-neon-green mr-1">›</span>
              {log}
            </motion.div>
          ))}
          {orchestratorLog.length === 0 && (
            <div className="text-gray-600 text-xs italic">Waiting to start...</div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
