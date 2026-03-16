import { motion } from "framer-motion";
import type { Worktree } from "../store/pipelineStore";
import {
  WORKTREE_STEPS,
  STEP_LABELS,
  getStatusStyle,
  getWorktreeIcon,
  getStepIcon,
} from "../utils/statusConfig";
import { DURATION, EASE, SPRING, staggerDelay } from "../utils/motion";

const GLOW_MAP: Record<string, string> = {
  active: "glow-accent",
  done: "glow-success",
  blocked: "glow-error",
  error: "glow-error",
  waiting_for_input: "glow-warning",
};

interface Props {
  worktree: Worktree;
}

export function WorktreeNode({ worktree }: Props) {
  const { status, currentStep, completedSteps, logs, branch, issue, progress } = worktree;
  const isActive = status === "active";
  const isDone = status === "done";
  const isBlocked = status === "blocked" || status === "error";

  const style = getStatusStyle(status);
  const StatusIcon = getWorktreeIcon(status);
  const glowClass = GLOW_MAP[status] ?? "";

  return (
    <motion.div
      aria-label={`Worktree ${branch} – ${status.toUpperCase().replace("_", " ")}`}
      animate={{
        scale: isActive ? [1, 1.01, 1] : 1,
      }}
      transition={{ duration: DURATION.ambient / 4, repeat: isActive ? Infinity : 0, ease: EASE.out as unknown as string }}
      className={`w-52 rounded-none border-2 ${style.border} ${glowClass} bg-dark-card overflow-hidden flex flex-col`}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-dark-border">
        <div className="flex items-center gap-1.5 mb-1">
          <motion.div
            animate={{ rotate: isActive ? 360 : 0 }}
            transition={{ duration: DURATION.ambient / 2, repeat: isActive ? Infinity : 0, ease: "linear" }}
          >
            <StatusIcon className={`w-4 h-4 ${style.text}`} />
          </motion.div>
          <span className={`text-xs font-display font-bold tracking-wider ${style.text}`}>
            {status.toUpperCase().replace("_", " ")}
          </span>
        </div>
        <div className="text-xs text-gray-400 truncate" title={branch}>
          🌿 {branch.replace("refs/heads/", "")}
        </div>
        <div className="text-xs text-gray-500 truncate mt-0.5" title={issue}>
          {issue}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3 pt-2">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500">Progress</span>
          <span className={style.text}>{progress}%</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5">
          <motion.div
            className={`h-1.5 rounded-full ${isDone ? "bg-success" : isBlocked ? "bg-error" : "bg-accent"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={SPRING.gentle}
          />
        </div>
      </div>

      {/* Steps checklist */}
      <div className="px-3 py-2">
        <div className="space-y-0.5">
          {WORKTREE_STEPS.map((step, index) => {
            const isCompleted = completedSteps.includes(step);
            const isCurrent = currentStep === step && !isDone;
            const { icon: StepIcon, spinning } = getStepIcon(step, completedSteps, isDone ? null : currentStep);
            return (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: DURATION.fast, delay: staggerDelay(index), ease: EASE.out as unknown as string }}
                className="flex items-center gap-1.5"
              >
                {spinning ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: DURATION.base * 3, repeat: Infinity, ease: "linear" }}
                  >
                    <StepIcon className="w-3 h-3 text-accent shrink-0" />
                  </motion.div>
                ) : (
                  <StepIcon className={`w-3 h-3 ${isCompleted ? "text-success" : "text-gray-700"} shrink-0`} />
                )}
                <span
                  className={`text-xs ${
                    isCompleted
                      ? "text-success"
                      : isCurrent
                      ? "text-accent"
                      : "text-gray-600"
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Mini terminal log */}
      <div className="retro-terminal m-2 mt-1 p-2 h-16 overflow-hidden rounded-none">
        {logs.slice(-4).map((log, i) => (
          <div key={i} className="text-xs text-gray-400 truncate leading-tight py-0.5">
            <span className="text-gray-600">›</span> {log.replace(`[${currentStep}] `, "")}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-gray-700 text-xs italic">No logs yet...</div>
        )}
      </div>
    </motion.div>
  );
}
