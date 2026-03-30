import { useMemo } from "react";
import { motion } from "framer-motion";
import type { OrchestratorStatus, Worktree } from "../store/pipelineStore";
import { DURATION } from "../utils/motion";

interface Props {
  worktreeCount: number;
  dimensions: { width: number; height: number };
  orchestratorStatus: OrchestratorStatus;
  qaStatus: string;
  worktrees: Worktree[];
}

/* ── Color tokens for SVG (must be raw values, not Tailwind classes) ── */
const COLOR_ACCENT  = "var(--color-accent)";
const COLOR_SUCCESS = "var(--color-success)";
const COLOR_MUTED   = "var(--color-neutral-700)";

function DataPacket({ path, color, delay = 0 }: { path: string; color: string; delay?: number }) {
  return (
    <motion.circle
      r="3"
      fill={color}
      filter={`drop-shadow(0 0 4px ${color})`}
      initial={{ offsetDistance: "0%", opacity: 0 }}
      animate={{ offsetDistance: "100%", opacity: [0, 1, 1, 0] }}
      transition={{
        duration: 2,
        delay,
        repeat: Infinity,
        ease: "linear",
      }}
      style={{ offsetPath: `path("${path}")` } as React.CSSProperties}
    />
  );
}

export function ConnectionLines({ worktreeCount, dimensions, orchestratorStatus, qaStatus, worktrees }: Props) {
  const { width, height } = dimensions;

  const lines = useMemo(() => {
    if (worktreeCount === 0) return { orchToWorktrees: [], worktreesToQA: [] };

    const oY = 80 + 120;
    const wY = height / 2;
    const qY = height - 80 - 10;

    const orchX = width / 2;
    const spacing = Math.min(220, (width - 100) / worktreeCount);
    const startX = orchX - ((worktreeCount - 1) * spacing) / 2;

    const orchToWorktrees = Array.from({ length: worktreeCount }, (_, i) => {
      const x = startX + i * spacing;
      return { x1: orchX, y1: oY, x2: x, y2: wY - 130 };
    });

    const worktreesToQA = Array.from({ length: worktreeCount }, (_, i) => {
      const x = startX + i * spacing;
      return { x1: x, y1: wY + 130, x2: orchX, y2: qY };
    });

    return { orchToWorktrees, worktreesToQA };
  }, [worktreeCount, width, height]);

  const isOrchActive = orchestratorStatus !== "idle";
  const isQAActive = qaStatus === "running";

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} aria-hidden="true">
      <defs>
        <filter id="glow-blue">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-green">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Orchestrator to Worktrees */}
      {lines.orchToWorktrees.map((line, i) => {
        const wt = worktrees[i];
        const isActive = wt?.status === "active";
        const isDone = wt?.status === "done";
        const pathStr = `M ${line.x1} ${line.y1} C ${line.x1} ${(line.y1 + line.y2) / 2}, ${line.x2} ${(line.y1 + line.y2) / 2}, ${line.x2} ${line.y2}`;

        return (
          <g key={`orch-wt-${i}`}>
            <motion.path
              d={pathStr}
              stroke={isActive ? COLOR_ACCENT : isDone ? COLOR_SUCCESS : COLOR_MUTED}
              strokeWidth={isActive ? 2 : 1}
              fill="none"
              strokeDasharray={isActive ? "6 3" : "none"}
              filter={isActive ? "url(#glow-blue)" : undefined}
              animate={{
                strokeDashoffset: isActive ? [0, -18] : 0,
                opacity: isOrchActive ? 1 : 0.3,
              }}
              transition={{ duration: DURATION.slow, repeat: isActive ? Infinity : 0, ease: "linear" }}
            />
            {isActive && (
              <DataPacket path={pathStr} color={COLOR_ACCENT} delay={i * 0.4} />
            )}
          </g>
        );
      })}

      {/* Worktrees to QA Gate */}
      {lines.worktreesToQA.map((line, i) => {
        const wt = worktrees[i];
        const isDone = wt?.status === "done";
        const pathStr = `M ${line.x1} ${line.y1} C ${line.x1} ${(line.y1 + line.y2) / 2}, ${line.x2} ${(line.y1 + line.y2) / 2}, ${line.x2} ${line.y2}`;

        return (
          <g key={`wt-qa-${i}`}>
            <motion.path
              d={pathStr}
              stroke={isDone ? COLOR_SUCCESS : COLOR_MUTED}
              strokeWidth={isDone ? 2 : 1}
              fill="none"
              strokeDasharray={isDone ? "6 3" : "none"}
              filter={isDone ? "url(#glow-green)" : undefined}
              animate={{
                strokeDashoffset: isDone ? [0, -18] : 0,
                opacity: isDone || isQAActive ? 1 : 0.2,
              }}
              transition={{ duration: DURATION.slow, repeat: isDone ? Infinity : 0, ease: "linear" }}
            />
            {isDone && (
              <DataPacket path={pathStr} color={COLOR_SUCCESS} delay={i * 0.4} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
