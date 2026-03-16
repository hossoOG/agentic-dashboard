import { useSessionStore, selectSessionCounts, selectActiveSession } from "../../store/sessionStore";

const SHELL_LABELS: Record<string, string> = {
  powershell: "PowerShell",
  cmd: "CMD",
  gitbash: "Git Bash",
};

export function SessionStatusBar() {
  const counts = useSessionStore(selectSessionCounts);
  const activeSession = useSessionStore(selectActiveSession);

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-surface-raised border-t border-neutral-700 text-xs font-mono">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-success status-pulse-animation" />
          <span className="text-gray-400">{counts.active} aktiv</span>
        </span>
        <span className="text-gray-600">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400 status-pulse-animation" />
          <span className="text-gray-400">{counts.waiting} wartend</span>
        </span>
        <span className="text-gray-600">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span className="text-gray-400">{counts.done} fertig</span>
        </span>
        <span className="text-gray-600">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-gray-400">{counts.error} Fehler</span>
        </span>
      </div>
      <div className="text-gray-500">
        {activeSession ? SHELL_LABELS[activeSession.shell] ?? activeSession.shell : "—"}
      </div>
    </div>
  );
}
