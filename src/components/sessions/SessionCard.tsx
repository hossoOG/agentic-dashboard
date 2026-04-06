import React from "react";
import { X, LayoutGrid, FolderOpen, Terminal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeSession } from "../../store/sessionStore";
import { getActivityLevel, type ActivityLevel } from "./activityLevel";
import { SessionStatusDot } from "./SessionStatusDot";
import { useNowTick } from "../../hooks/useNowTick";
import { shortenPath } from "../../utils/pathUtils";

interface SessionCardProps {
  session: ClaudeSession;
  isActive: boolean;
  isInGrid?: boolean;
  onClick: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function TimeDisplay({
  session,
  now,
  activityLevel,
}: {
  session: ClaudeSession;
  now: number;
  activityLevel: ActivityLevel | null;
}) {
  switch (session.status) {
    case "running":
    case "starting":
      if (activityLevel === "idle") {
        return (
          <span className="text-neutral-500">
            Idle seit {formatDuration(now - session.lastOutputAt)}
          </span>
        );
      }
      return activityLevel === "thinking" ? (
        <span className="text-info">
          Denkt... (seit {formatDuration(now - session.lastOutputAt)})
        </span>
      ) : (
        <span className="text-neutral-500">
          Laeuft seit {formatDuration(now - session.createdAt)}
        </span>
      );
    case "waiting":
      return <span className="text-warning">Wartet auf Input</span>;
    case "done":
      return (
        <span className="text-neutral-500">
          Fertig ({formatDuration((session.finishedAt ?? now) - session.createdAt)})
        </span>
      );
    case "error":
      return (
        <span className="text-error">
          Fehler (Exit {session.exitCode ?? "?"})
        </span>
      );
  }
}

const SessionCardInner = ({ session, isActive, isInGrid, onClick, onClose }: SessionCardProps) => {
  const now = useNowTick();

  const isRunning = session.status === "running" || session.status === "starting";
  const activityLevel = isRunning ? getActivityLevel(session.lastOutputAt, now, session.lastOutputSnippet) : null;

  return (
    <div
      onClick={() => onClick(session.id)}
      className={`
        relative group px-3 py-2.5 cursor-pointer transition-all duration-150
        border-l-2
        ${isActive
          ? "border-l-success bg-success-a05"
          : "border-l-transparent hover:bg-hover-overlay"
        }
      `}
    >
      {/* Action buttons — visible on hover */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_folder_in_explorer", { path: session.folder });
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
          aria-label="Ordner im Explorer oeffnen"
          title="Ordner im Explorer oeffnen"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_terminal_in_folder", { path: session.folder });
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
          aria-label="Terminal im Ordner oeffnen"
          title="Terminal im Ordner oeffnen"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose(session.id);
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
          aria-label="Session schliessen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Title row */}
      <div className="flex items-center gap-2 pr-5">
        <SessionStatusDot status={session.status} activityLevel={activityLevel} useIcons />
        <span className="font-bold text-sm text-neutral-200 truncate">
          {session.title}
        </span>
        {isInGrid && (
          <LayoutGrid className="w-3 h-3 text-accent shrink-0" aria-label="Im Grid" />
        )}
      </div>

      {/* Folder path */}
      <div className="mt-1 pl-[18px] text-xs text-neutral-500 truncate">
        {shortenPath(session.folder)}
      </div>

      {/* Time display */}
      <div className="mt-0.5 pl-[18px] text-xs">
        <TimeDisplay session={session} now={now} activityLevel={activityLevel} />
      </div>
    </div>
  );
};

export const SessionCard = React.memo(SessionCardInner);
