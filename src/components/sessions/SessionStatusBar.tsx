import { useShallow } from "zustand/react/shallow";
import { useSessionStore, selectSessionCounts, selectActiveSession } from "../../store/sessionStore";

const SHELL_LABELS: Record<string, string> = {
  powershell: "PowerShell",
  cmd: "CMD",
  gitbash: "Git Bash",
};

export function SessionStatusBar() {
  const counts = useSessionStore(useShallow(selectSessionCounts));
  const activeSession = useSessionStore(selectActiveSession);

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-surface-raised border-t border-neutral-700 text-xs font-mono" role="status">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full bg-success ${counts.active > 0 ? "status-pulse-animation" : ""}`} aria-hidden="true" />
          <span className="text-neutral-400">{counts.active} aktiv</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full bg-warning ${counts.waiting > 0 ? "status-pulse-animation" : ""}`} aria-hidden="true" />
          <span className="text-neutral-400">{counts.waiting} wartend</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-neutral-500" aria-hidden="true" />
          <span className="text-neutral-400">{counts.done} fertig</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-error" aria-hidden="true" />
          <span className="text-neutral-400">{counts.error} Fehler</span>
        </span>
      </div>
      <div className="text-neutral-500">
        {activeSession ? SHELL_LABELS[activeSession.shell] ?? activeSession.shell : "—"}
      </div>
    </div>
  );
}
