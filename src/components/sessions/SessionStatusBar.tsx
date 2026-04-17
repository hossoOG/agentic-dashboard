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

  // Calculate live counts, differentiating between idle and active
  let activeCount = 0;
  let idleCount = 0;
  let waitingCount = 0;
  let doneCount = 0;
  let errorCount = 0;

  for (const s of sessions) {
    if (s.status === "running" || s.status === "starting") {
      if (getActivityLevel(s.lastOutputAt, now) === "active") {
        activeCount++;
      } else {
        idleCount++;
      }
    } else if (s.status === "waiting") {
      waitingCount++;
    } else if (s.status === "done") {
      doneCount++;
    } else if (s.status === "error") {
      errorCount++;
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-surface-raised border-t border-neutral-700 text-xs font-mono" role="status">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full bg-success text-success ${activeCount > 0 ? "status-pulse-animation" : ""}`} aria-hidden="true" />
          <span className="text-neutral-400">{activeCount} aktiv</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden="true" />
          <span className="text-neutral-400">{idleCount} inaktiv</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full bg-warning text-warning ${waitingCount > 0 ? "status-pulse-animation" : ""}`} aria-hidden="true" />
          <span className="text-neutral-400">{waitingCount} wartend</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-neutral-500 text-neutral-500" aria-hidden="true" />
          <span className="text-neutral-400">{doneCount} fertig</span>
        </span>
        <span className="text-neutral-600" aria-hidden="true">·</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-error text-error" aria-hidden="true" />
          <span className="text-neutral-400">{errorCount} Fehler</span>
        </span>
      </div>
      <div className="text-neutral-500">
        {activeSession ? SHELL_LABELS[activeSession.shell] ?? activeSession.shell : "—"}
      </div>
    </div>
  );
}
