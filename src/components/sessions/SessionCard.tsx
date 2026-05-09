import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, LayoutGrid, FolderOpen, Terminal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import type { ClaudeSession } from "../../store/sessionStore";
import { getActivityLevel } from "./activityLevel";
import { logError } from "../../utils/errorLogger";
import { SessionStatusDot } from "./SessionStatusDot";
import { useNowTick } from "../../hooks/useNowTick";
import { shortenPath } from "../../utils/pathUtils";
import { formatElapsed, formatExit } from "../../utils/format";

interface SessionCardProps {
  session: ClaudeSession;
  isActive: boolean;
  isInGrid?: boolean;
  onClick: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
}

function TimeDisplay({ session }: { session: ClaudeSession }) {
  const now = useNowTick();
  const isRunning = session.status === "running" || session.status === "starting";
  const activityLevel = isRunning ? getActivityLevel(session.lastOutputAt, now) : null;

  switch (session.status) {
    case "starting":
      if (activityLevel === "idle") {
        return <span className="text-neutral-400">Startet…</span>;
      }
      return (
        <span className="text-neutral-400">
          Läuft seit {formatElapsed(now - session.createdAt)}
        </span>
      );
    case "running":
      if (activityLevel === "idle") {
        return (
          <span className="text-neutral-400">
            Idle seit {formatElapsed(now - session.lastOutputAt)}
          </span>
        );
      }
      return (
        <span className="text-neutral-400">
          Läuft seit {formatElapsed(now - session.createdAt)}
        </span>
      );
    case "waiting":
      return <span className="text-warning">Wartet auf Input</span>;
    case "done":
      return (
        <span className="text-neutral-400">
          Fertig ({formatElapsed((session.finishedAt ?? now) - session.createdAt)})
        </span>
      );
    case "error":
      return (
        <span className="text-error">
          Fehler ({session.exitCode != null ? formatExit(session.exitCode) : "Exit ?"})
        </span>
      );
  }
}

function ActivityDot({ session }: { session: ClaudeSession }) {
  const now = useNowTick();
  const isRunning = session.status === "running" || session.status === "starting";
  const activityLevel = isRunning ? getActivityLevel(session.lastOutputAt, now) : null;
  return <SessionStatusDot status={session.status} activityLevel={activityLevel} useIcons />;
}

const SessionCardInner = ({ session, isActive, isInGrid, onClick, onClose }: SessionCardProps) => {
  const renameSession = useSessionStore((s) => s.renameSession);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // Full display string includes the auto-displayId suffix when present,
  // so the user sees the same string in inline-edit as on the card.
  const displayString = session.displayId
    ? `${session.title} #${session.displayId}`
    : session.title;

  const startRename = useCallback(() => {
    setIsEditing(true);
    setEditValue(displayString);
  }, [displayString]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    // Compare against full display string so a no-op edit (open + save unchanged)
    // does not trigger a rename and inadvertently clear the displayId.
    if (trimmed && trimmed !== displayString) {
      renameSession(session.id, trimmed);
      if (session.claudeSessionId) {
        useSettingsStore.getState().setSessionTitleOverride(session.claudeSessionId, trimmed);
      }
    }
    setIsEditing(false);
    setEditValue("");
  }, [editValue, session.id, session.claudeSessionId, displayString, renameSession]);

  const cancelRename = useCallback(() => {
    setIsEditing(false);
    setEditValue("");
  }, []);

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
      {/* Backdrop-Bar deckt Card-Text dahinter — sonst Kontrast-Kollision mit Tags. */}
      <div className="absolute top-1.5 right-1.5 flex items-stretch bg-surface-base border border-neutral-700 divide-x divide-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_folder_in_explorer", { path: session.folder }).catch((err: unknown) =>
              logError("SessionCard.openFolder", err)
            );
          }}
          className="p-1.5 text-neutral-400 hover:text-accent hover:bg-hover-overlay transition-colors"
          aria-label="Ordner im Explorer öffnen"
          title="Ordner im Explorer öffnen"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_terminal_in_folder", { path: session.folder }).catch((err: unknown) =>
              logError("SessionCard.openTerminal", err)
            );
          }}
          className="p-1.5 text-neutral-400 hover:text-accent hover:bg-hover-overlay transition-colors"
          aria-label="Terminal im Ordner öffnen"
          title="Terminal im Ordner öffnen"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose(session.id);
          }}
          className="p-1.5 text-neutral-500 hover:text-error hover:bg-hover-overlay transition-colors"
          aria-label="Session schließen"
          title="Session schließen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Title row */}
      <div className="flex items-center gap-2 pr-5">
        <ActivityDot session={session} />
        {isEditing ? (
          <input
            ref={editInputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            className="font-bold text-sm text-neutral-200 bg-neutral-800 border border-neutral-600 px-1 py-0 w-full min-w-0 outline-none focus:border-accent"
            aria-label="Session umbenennen"
          />
        ) : (
          <span
            className="font-bold text-sm text-neutral-200 truncate"
            onDoubleClick={(e) => {
              e.stopPropagation();
              startRename();
            }}
            title="Doppelklick zum Umbenennen"
          >
            {session.title}
            {session.displayId && (
              <span className="font-normal text-neutral-500">
                {" "}#{session.displayId}
              </span>
            )}
          </span>
        )}
        {isInGrid && (
          <LayoutGrid className="w-3 h-3 text-accent shrink-0" aria-label="Im Grid" />
        )}
      </div>

      {/* Folder path */}
      <div className="mt-1 pl-[18px] text-xs text-neutral-400 truncate">
        {shortenPath(session.folder)}
      </div>

      {/* Time display */}
      <div className="mt-0.5 pl-[18px] text-xs">
        <TimeDisplay session={session} />
      </div>
    </div>
  );
};

export const SessionCard = React.memo(SessionCardInner);
