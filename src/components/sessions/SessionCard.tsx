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

  const startRename = useCallback(() => {
    setIsEditing(true);
    setEditValue(session.title);
  }, [session.title]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title) {
      renameSession(session.id, trimmed);
      if (session.claudeSessionId) {
        useSettingsStore.getState().setSessionTitleOverride(session.claudeSessionId, trimmed);
      }
    }
    setIsEditing(false);
    setEditValue("");
  }, [editValue, session.id, session.title, session.claudeSessionId, renameSession]);

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
      {/* Action buttons — visible on hover */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_folder_in_explorer", { path: session.folder }).catch((err: unknown) =>
              logError("SessionCard.openFolder", err)
            );
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
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
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
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
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
          aria-label="Session schließen"
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
            className="font-bold text-sm text-neutral-200 bg-neutral-800 border border-neutral-600 rounded px-1 py-0 w-full min-w-0 outline-none focus:border-neon-green"
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
