import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { usePipelineStore } from "../store/pipelineStore";
import type { QACheckStatus } from "../store/pipelineStore";

const CHECK_LABELS = {
  unitTests: "Unit Tests",
  typeCheck: "TypeCheck",
  lint: "ESLint",
  build: "Build",
  e2e: "E2E Tests",
} as const;

const STATUS_ICONS: Record<QACheckStatus, React.FC<{ className?: string }>> = {
  pending: Clock,
  running: Loader2,
  pass: CheckCircle2,
  fail: XCircle,
};

const STATUS_COLORS: Record<QACheckStatus, string> = {
  pending: "text-gray-500",
  running: "text-neon-blue",
  pass: "text-neon-green",
  fail: "text-red-400",
};

export function QAGateNode() {
  const { qaGate } = usePipelineStore();
  const { overallStatus, ...checks } = qaGate;

  const ShieldIcon = overallStatus === "pass" ? ShieldCheck : ShieldAlert;
  const overallColor =
    overallStatus === "pass"
      ? "text-neon-green border-neon-green neon-glow-green"
      : overallStatus === "fail"
      ? "text-red-400 border-red-500 neon-glow-red"
      : overallStatus === "running"
      ? "text-neon-blue border-neon-blue neon-glow-blue"
      : "text-gray-500 border-gray-700";

  return (
    <motion.div
      animate={{
        scale: overallStatus === "running" ? [1, 1.01, 1] : 1,
      }}
      transition={{ duration: 1.5, repeat: overallStatus === "running" ? Infinity : 0 }}
      className={`rounded-none border-2 bg-dark-card overflow-hidden w-96 retro-terminal ${overallColor}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <ShieldIcon className={`w-5 h-5`} />
          <span className="font-bold text-sm tracking-widest">QA GATE</span>
        </div>
        <span className="text-xs uppercase tracking-widest">{overallStatus}</span>
      </div>

      {/* Checks table */}
      <div className="px-4 py-3 space-y-2">
        {(Object.entries(checks) as [keyof typeof checks, QACheckStatus][]).map(([key, status]) => {
          const Icon = STATUS_ICONS[status];
          const label = CHECK_LABELS[key];
          return (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: status === "running" ? 360 : 0 }}
                  transition={{ duration: 1, repeat: status === "running" ? Infinity : 0, ease: "linear" }}
                >
                  <Icon className={`w-4 h-4 ${STATUS_COLORS[status]}`} />
                </motion.div>
                <span className="text-sm text-gray-300">{label}</span>
              </div>
              <div className={`text-xs font-mono px-2 py-0.5 rounded-none border ${
                status === "pass"
                  ? "border-neon-green text-neon-green bg-neon-green/10"
                  : status === "fail"
                  ? "border-red-500 text-red-400 bg-red-900/20"
                  : status === "running"
                  ? "border-neon-blue text-neon-blue bg-neon-blue/10"
                  : "border-gray-700 text-gray-500"
              }`}>
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
              className={`h-1.5 rounded-full ${
                overallStatus === "pass"
                  ? "bg-neon-green"
                  : overallStatus === "fail"
                  ? "bg-red-500"
                  : "bg-neon-blue"
              }`}
              initial={{ width: 0 }}
              animate={{
                width: `${
                  (Object.values(checks).filter((s) => s === "pass" || s === "fail").length /
                    Object.values(checks).length) *
                  100
                }%`,
              }}
              transition={{ type: "spring", stiffness: 50 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
