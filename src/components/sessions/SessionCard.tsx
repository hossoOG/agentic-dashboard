import { useEffect, useState } from "react";
import { X, Check, AlertTriangle, LayoutGrid, FolderOpen, Terminal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { ClaudeSession } from "../../store/sessionStore";

interface SessionCardProps {
  session: ClaudeSession;
  isActive: boolean;
  isInGrid?: boolean;
  onClick: () => void;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function StatusDot({ status }: { status: ClaudeSession["status"] }) {
  switch (status) {
    case "running":
    case "starting":
      return (
        <span className="w-2.5 h-2.5 rounded-full bg-success status-pulse-animation shrink-0" />
      );
    case "waiting":
      return (
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 status-pulse-animation shrink-0" />
      );
    case "done":
      return (
        <Check className="w-3.5 h-3.5 text-success shrink-0" />
      );
    case "error":
      return (
        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
      );
  }
}

function TimeDisplay({ session }: { session: ClaudeSession }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (session.status === "running" || session.status === "starting") {
      const interval = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(interval);
    }
  }, [session.status]);

  switch (session.status) {
    case "running":
    case "starting":
      return (
        <span className="text-gray-500">
          Laeuft seit {formatDuration(now - session.createdAt)}
        </span>
      );
    case "waiting":
      return <span className="text-yellow-400">Wartet auf Input</span>;
    case "done":
      return (
        <span className="text-gray-500">
          Fertig ({formatDuration((session.finishedAt ?? now) - session.createdAt)})
        </span>
      );
    case "error":
      return (
        <span className="text-red-400">
          Fehler (Exit {session.exitCode ?? "?"})
        </span>
      );
  }
}

function shortenPath(path: string): string {
  // Show last 2-3 segments for readability
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return "~/" + parts.slice(-2).join("/");
}

export function SessionCard({ session, isActive, isInGrid, onClick, onClose }: SessionCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        relative group px-3 py-2.5 cursor-pointer transition-all duration-150
        border-l-2
        ${isActive
          ? "border-l-success bg-success/5"
          : "border-l-transparent hover:bg-white/5"
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
          className="p-0.5 text-gray-600 hover:text-gray-300"
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
          className="p-0.5 text-gray-600 hover:text-gray-300"
          aria-label="Terminal im Ordner oeffnen"
          title="Terminal im Ordner oeffnen"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-0.5 text-gray-600 hover:text-gray-300"
          aria-label="Session schliessen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Title row */}
      <div className="flex items-center gap-2 pr-5">
        <StatusDot status={session.status} />
        <span className="font-bold text-sm text-gray-200 truncate">
          {session.title}
        </span>
        {isInGrid && (
          <LayoutGrid className="w-3 h-3 text-accent shrink-0" aria-label="Im Grid" />
        )}
      </div>

      {/* Folder path */}
      <div className="mt-1 pl-[18px] text-xs text-gray-500 truncate">
        {shortenPath(session.folder)}
      </div>

      {/* Time display */}
      <div className="mt-0.5 pl-[18px] text-xs">
        <TimeDisplay session={session} />
      </div>
    </div>
  );
}
