import { motion } from "framer-motion";
import type { Worktree } from "../store/pipelineStore";
import { STEP_LABELS, getStatusStyle } from "../utils/statusConfig";
import { DURATION, EASE } from "../utils/motion";

interface Props {
  worktree: Worktree;
}

/** Map worktree status to left-border color class */
function getBorderColor(status: string): string {
  switch (status) {
    case "active":
      return "border-l-accent";
    case "done":
      return "border-l-success";
    case "error":
    case "blocked":
      return "border-l-error";
    default:
      return "border-l-neutral-600";
  }
}

export function WorktreeNode({ worktree }: Props) {
  const { status, currentStep, branch, issue, progress } = worktree;
  const isDone = status === "done";
  const isBlocked = status === "blocked" || status === "error";
  const isActive = status === "active";
  const statusLabel = status.toUpperCase().replace("_", " ");

  const style = getStatusStyle(status);
  const borderColor = getBorderColor(status);

  return (
    <motion.div
      aria-label={`Worktree ${branch} – ${statusLabel}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      className={`w-full rounded-lg border border-neutral-700 border-l-[3px] ${borderColor} bg-surface-raised overflow-hidden p-4`}
    >
      {/* Row 1: Branch + Step + Progress */}
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot} ${isActive ? "animate-pulse" : ""}`}
        />

        {/* Branch name */}
        <span
          className="text-sm font-mono text-neutral-200 truncate min-w-0 flex-shrink"
          title={branch}
        >
          {branch.replace("refs/heads/", "")}
        </span>

        {/* Current step badge */}
        <span className={`text-xs px-2 py-0.5 rounded ${style.text} bg-neutral-800 shrink-0`}>
          {isDone ? "Fertig" : STEP_LABELS[currentStep]}
        </span>

        {/* Progress bar + percentage */}
        <div className="flex items-center gap-2 ml-auto shrink-0 w-32">
          <div className="w-full bg-neutral-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isDone ? "bg-success" : isBlocked ? "bg-error" : "bg-accent"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={`text-xs tabular-nums ${style.text}`}>{progress}%</span>
        </div>
      </div>

      {/* Row 2: Task + Status */}
      <div className="flex items-center justify-between mt-1.5 pl-[22px]">
        <span className="text-xs text-neutral-500 truncate min-w-0 mr-4" title={issue}>
          {issue}
        </span>
        <span className={`text-xs ${style.text} shrink-0`}>
          {statusLabel}
        </span>
      </div>
    </motion.div>
  );
}
