import { Maximize2, X, GitBranch } from "lucide-react";
import { useSessionStore } from "../../store/sessionStore";
import type { SessionStatus } from "../../store/sessionStore";
import { SessionTerminal } from "./SessionTerminal";
import { SessionStatusDot } from "./SessionStatusDot";
import { getActivityLevel } from "./activityLevel";
import { useNowTick } from "../../hooks/useNowTick";
import { useGitBranch } from "../../hooks/useGitBranch";

interface GridCellProps {
  sessionId: string;
  isFocused: boolean;
  onFocus: () => void;
  onMaximize: () => void;
  onRemove: () => void;
}

function GridCellStatusDot({ status, lastOutputAt }: { status: SessionStatus; lastOutputAt: number }) {
  const now = useNowTick();
  const isRunning = status === "running" || status === "starting";
  const activityLevel = isRunning ? getActivityLevel(lastOutputAt, now) : null;
  return <SessionStatusDot status={status} activityLevel={activityLevel} size="sm" />;
}

export function GridCell({
  sessionId,
  isFocused,
  onFocus,
  onMaximize,
  onRemove,
}: GridCellProps) {
  const session = useSessionStore((s) => s.sessions.find((sess) => sess.id === sessionId));
  const title = session?.title ?? "Session";
  const status = session?.status ?? "starting";
  const lastOutputAt = session?.lastOutputAt ?? Date.now();
  const branch = useGitBranch(session?.folder);

  return (
    <div
      onClick={onFocus}
      className={`
        flex flex-col h-full min-h-0 overflow-hidden rounded-sm transition-all duration-150
        ${isFocused
          ? "border-2 border-accent glow-accent"
          : "border border-neutral-700"
        }
      `}
    >
      {/* Title bar */}
      <div
        className={`
          group flex items-center gap-2 px-2 shrink-0
          ${isFocused ? "bg-accent-subtle" : "bg-surface-raised"}
        `}
        style={{ height: "28px", minHeight: "28px" }}
      >
        <GridCellStatusDot status={status as SessionStatus} lastOutputAt={lastOutputAt} />
        <span className="text-xs text-neutral-200 font-bold truncate flex-1">
          {title}
        </span>
        {branch && (
          <span
            data-testid="git-branch-chip"
            title={branch}
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-neutral-800 text-[9px] text-neutral-400 border border-neutral-700 shrink-0 max-w-[90px]"
          >
            <GitBranch className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{branch}</span>
          </span>
        )}

        {/* Action buttons — visible on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMaximize();
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Maximieren"
          title="Maximieren"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Aus Grid entfernen"
          title="Aus Grid entfernen"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Terminal body */}
      <div className="flex-1 min-h-0">
        <SessionTerminal sessionId={sessionId} />
      </div>
    </div>
  );
}
