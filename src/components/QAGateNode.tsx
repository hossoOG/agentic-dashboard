import { motion } from "framer-motion";
import { usePipelineStore } from "../store/pipelineStore";
import type { QACheckStatus } from "../store/pipelineStore";
import {
  QA_CHECK_LABELS,
  QA_STATUS_ICONS,
  getStatusStyle,
  getQAShieldIcon,
} from "../utils/statusConfig";
import { DURATION, EASE, SPRING } from "../utils/motion";

const GLOW_MAP: Record<string, string> = {
  running: "glow-accent",
  pass: "glow-success",
  fail: "glow-error",
};

export function QAGateNode() {
  const { qaGate } = usePipelineStore();
  const { overallStatus, ...checks } = qaGate;

  const ShieldIcon = getQAShieldIcon(overallStatus);
  const overallStyle = getStatusStyle(overallStatus);
  const glowClass = GLOW_MAP[overallStatus] ?? "";
  const isRunning = overallStatus === "running";

  return (
    <motion.div
      aria-label={`QA Gate – ${overallStatus.toUpperCase()}`}
      animate={{
        scale: isRunning ? [1, 1.01, 1] : 1,
      }}
      transition={{ duration: DURATION.ambient / 5, repeat: isRunning ? Infinity : 0, ease: EASE.out as unknown as string }}
      className={`rounded-none border-2 bg-dark-card overflow-hidden w-96 retro-terminal ${overallStyle.border} ${overallStyle.text} ${glowClass}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <ShieldIcon className="w-5 h-5" />
          <span className="font-display font-bold text-sm tracking-widest">QA GATE</span>
        </div>
        <span className="text-xs uppercase tracking-widest">{overallStatus}</span>
      </div>

      {/* Checks table */}
      <div className="px-4 py-3 space-y-2">
        {(Object.entries(checks) as [keyof typeof checks, QACheckStatus][]).map(([key, status]) => {
          const Icon = QA_STATUS_ICONS[status];
          const label = QA_CHECK_LABELS[key];
          const checkStyle = getStatusStyle(status);
          return (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: status === "running" ? 360 : 0 }}
                  transition={{ duration: DURATION.base * 3, repeat: status === "running" ? Infinity : 0, ease: "linear" }}
                >
                  <Icon className={`w-4 h-4 ${checkStyle.text}`} />
                </motion.div>
                <span className="text-sm text-gray-300">{label}</span>
              </div>
              <div className={`text-xs font-mono px-2 py-0.5 rounded-none border ${checkStyle.border} ${checkStyle.text} ${checkStyle.bg}/10`}>
                {status.toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Status bar */}
      {overallStatus !== "idle" && (
        <div className="px-4 pb-3">
          <div className="w-full bg-gray-800 rounded-full h-1.5">
            <motion.div
              className={`h-1.5 rounded-full ${overallStyle.bg}`}
              initial={{ width: 0 }}
              animate={{
                width: `${
                  (Object.values(checks).filter((s) => s === "pass" || s === "fail").length /
                    Object.values(checks).length) *
                  100
                }%`,
              }}
              transition={SPRING.gentle}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
