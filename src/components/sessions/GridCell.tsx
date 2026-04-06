import { Maximize2, X } from "lucide-react";
import { useSessionStore } from "../../store/sessionStore";
import type { SessionStatus } from "../../store/sessionStore";
import { SessionTerminal } from "./SessionTerminal";
import { SessionStatusDot } from "./SessionStatusDot";
import { getActivityLevel } from "./activityLevel";
import { useNowTick } from "../../hooks/useNowTick";

interface GridCellProps {
  sessionId: string;
  isFocused: boolean;
  onFocus: () => void;
  onMaximize: () => void;
  onRemove: () => void;
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
  const lastOutputSnippet = session?.lastOutputSnippet ?? "";

  const now = useNowTick();
  const isRunning = status === "running" || status === "starting";

  const activityLevel = isRunning ? getActivityLevel(lastOutputAt, now, lastOutputSnippet) : null;

  return (
    <div
      onClick={onFocus}
      className={`
        flex flex-col min-h-0 overflow-hidden rounded-sm transition-all duration-150
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
        <SessionStatusDot status={status as SessionStatus} activityLevel={activityLevel} size="sm" />
        <span className="text-xs text-neutral-200 font-bold truncate flex-1">
          {title}
        </span>

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
