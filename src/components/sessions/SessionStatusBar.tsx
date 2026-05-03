import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useNowTick } from "../../hooks/useNowTick";
import { getActivityLevel } from "./activityLevel";

const SHELL_LABELS: Record<string, string> = {
  powershell: "PowerShell",
  cmd: "CMD",
  gitbash: "Git Bash",
};

export function SessionStatusBar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSession = useSessionStore(selectActiveSession);
  const now = useNowTick();

  let activeCount = 0;
  let passiveCount = 0;
  let waitingCount = 0;

  for (const s of sessions) {
    if (s.status === "starting" || s.status === "running") {
      if (getActivityLevel(s.lastOutputAt, now) === "idle") {
        passiveCount++;
      } else {
        activeCount++;
      }
    } else if (s.status === "waiting") {
      waitingCount++;
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-surface-raised border-t border-neutral-700 text-xs font-mono" role="status">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full bg-success ${activeCount > 0 ? "status-pulse-animation" : ""}`} aria-hidden="true" />
          <span className="text-neutral-400">{activeCount} aktiv</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-info" aria-hidden="true" />
          <span className="text-neutral-400">{passiveCount} passiv</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full bg-warning ${waitingCount > 0 ? "status-pulse-animation" : ""}`} aria-hidden="true" />
          <span className="text-neutral-400">{waitingCount} wartend</span>
        </span>
      </div>
      <div className="text-neutral-500">
        {activeSession ? SHELL_LABELS[activeSession.shell] ?? activeSession.shell : "—"}
      </div>
    </div>
  );
}
