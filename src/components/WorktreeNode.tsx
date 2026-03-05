import { motion } from "framer-motion";
import { GitBranch, CheckCircle2, Circle, Loader2, AlertTriangle } from "lucide-react";
import type { Worktree, WorktreeStep, WorktreeStatus } from "../store/pipelineStore";

const STEPS: WorktreeStep[] = [
  "setup",
  "plan",
  "validate",
  "code",
  "review",
  "self_verify",
  "draft_pr",
];

const STEP_LABELS: Record<WorktreeStep, string> = {
  setup: "Setup",
  plan: "Plan",
  validate: "Validate",
  code: "Code",
  review: "Review",
  self_verify: "Self-Verify",
  draft_pr: "Draft PR",
};

const STATUS_COLORS: Record<WorktreeStatus, string> = {
  idle: "border-gray-700",
  active: "border-neon-blue neon-glow-blue",
  blocked: "border-red-500 neon-glow-red",
  waiting_for_input: "border-neon-orange neon-glow-orange",
  done: "border-neon-green neon-glow-green",
  error: "border-red-500 neon-glow-red",
};

const STATUS_TEXT: Record<WorktreeStatus, string> = {
  idle: "text-gray-500",
  active: "text-neon-blue",
  blocked: "text-red-400",
  waiting_for_input: "text-orange-400",
  done: "text-neon-green",
  error: "text-red-400",
};

interface Props {
  worktree: Worktree;
}

export function WorktreeNode({ worktree }: Props) {
  const { status, currentStep, completedSteps, logs, branch, issue, progress } = worktree;
  const isActive = status === "active";
  const isDone = status === "done";
  const isBlocked = status === "blocked" || status === "error";

  const StatusIcon = isBlocked ? AlertTriangle : isDone ? CheckCircle2 : GitBranch;

  return (
    <motion.div
      animate={{
        scale: isActive ? [1, 1.01, 1] : 1,
      }}
      transition={{ duration: 2, repeat: isActive ? Infinity : 0 }}
      className={`w-52 rounded-xl border-2 ${STATUS_COLORS[status]} bg-dark-card overflow-hidden flex flex-col`}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-dark-border">
        <div className="flex items-center gap-1.5 mb-1">
          <motion.div
            animate={{ rotate: isActive ? 360 : 0 }}
            transition={{ duration: 4, repeat: isActive ? Infinity : 0, ease: "linear" }}
          >
            <StatusIcon className={`w-4 h-4 ${STATUS_TEXT[status]}`} />
          </motion.div>
          <span className={`text-xs font-bold tracking-wider ${STATUS_TEXT[status]}`}>
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
          <span className={STATUS_TEXT[status]}>{progress}%</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5">
          <motion.div
            className={`h-1.5 rounded-full ${isDone ? "bg-neon-green" : isBlocked ? "bg-red-500" : "bg-neon-blue"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 50 }}
          />
        </div>
      </div>

      {/* Steps checklist */}
      <div className="px-3 py-2">
        <div className="space-y-0.5">
          {STEPS.map((step) => {
            const isCompleted = completedSteps.includes(step);
            const isCurrent = currentStep === step && !isDone;
            return (
              <div key={step} className="flex items-center gap-1.5">
                {isCompleted ? (
                  <CheckCircle2 className="w-3 h-3 text-neon-green shrink-0" />
                ) : isCurrent ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 className="w-3 h-3 text-neon-blue shrink-0" />
                  </motion.div>
                ) : (
                  <Circle className="w-3 h-3 text-gray-700 shrink-0" />
                )}
                <span
                  className={`text-xs ${
                    isCompleted
                      ? "text-neon-green"
                      : isCurrent
                      ? "text-neon-blue"
                      : "text-gray-600"
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini terminal log */}
      <div className="retro-terminal m-2 mt-1 p-2 h-16 overflow-hidden rounded">
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
