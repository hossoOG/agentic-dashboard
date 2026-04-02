import { motion } from "framer-motion";
import type { QAGate, QACheckStatus } from "../store/pipelineStore";
import {
  QA_CHECK_LABELS,
  QA_STATUS_ICONS,
  getStatusStyle,
  getQAShieldIcon,
} from "../utils/statusConfig";
import { DURATION, EASE } from "../utils/motion";

interface Props {
  qaGate: QAGate;
}

export function QAGateNode({ qaGate }: Props) {
  const { overallStatus, ...checks } = qaGate;

  const ShieldIcon = getQAShieldIcon(overallStatus);
  const overallStyle = getStatusStyle(overallStatus);
  const isRunning = overallStatus === "running";

  const completedChecks = Object.values(checks).filter(
    (s) => s === "pass" || s === "fail"
  ).length;
  const totalChecks = Object.values(checks).length;
  const progressPct = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

  return (
    <motion.div
      aria-label={`QA Gate – ${overallStatus.toUpperCase()}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      className={`w-72 rounded-lg border border-neutral-700 border-l-[3px] ${overallStyle.border} bg-surface-raised overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <ShieldIcon className={`w-5 h-5 ${overallStyle.text}`} />
          <span className={`font-display font-bold text-sm tracking-widest ${overallStyle.text}`}>
            QA GATE
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${overallStyle.dot} ${isRunning ? "animate-pulse" : ""}`}
          />
          <span className={`text-xs uppercase tracking-widest ${overallStyle.text}`}>
            {overallStatus === "idle" ? "Bereit" : overallStatus === "running" ? "Läuft" : overallStatus === "pass" ? "Bestanden" : overallStatus === "fail" ? "Fehlgeschlagen" : overallStatus}
          </span>
        </div>
      </div>

      {/* Checks list */}
      <div className="px-4 py-3 space-y-2">
        {overallStatus === "idle" ? (
          <div className="text-center text-neutral-600 text-xs italic py-2">
            Keine aktiven Checks
          </div>
        ) : (
          (Object.entries(checks) as [keyof typeof checks, QACheckStatus][]).map(([key, status]) => {
            const Icon = QA_STATUS_ICONS[status];
            const label = QA_CHECK_LABELS[key];
            const checkStyle = getStatusStyle(status);
            return (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${checkStyle.text}`} />
                  <span className="text-sm text-neutral-300">{label}</span>
                </div>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded border ${checkStyle.border} ${checkStyle.text}`}
                >
                  {status.toUpperCase()}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Progress bar */}
      {overallStatus !== "idle" && (
        <div className="px-4 pb-3">
          <div className="w-full bg-neutral-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${overallStyle.bg}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
