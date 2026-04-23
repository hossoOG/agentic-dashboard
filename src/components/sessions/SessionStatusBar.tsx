import { useShallow } from "zustand/react/shallow";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useNowTick } from "../../hooks/useNowTick";
import { getActivityLevel } from "./activityLevel";

const SHELL_LABELS: Record<string, string> = {
  powershell: "PowerShell",
  cmd: "CMD",
  gitbash: "Git Bash",
};

export function SessionStatusBar() {
  // useShallow stabilisiert die sessions-Array-Reference, damit der StatusBar
  // nicht bei jedem Output-Event neu gerendert wird (nur wenn sich die Liste
  // wirklich ändert). Die idle/active-Unterscheidung braucht die volle Liste,
  // weshalb wir keinen count-Selector nutzen können.
  const sessions = useSessionStore(useShallow((s) => s.sessions));
  const activeSession = useSessionStore(selectActiveSession);
  const now = useNowTick();

  // Calculate live counts, differentiating between idle (passiv) and active.
  // Nach Remote-Design (4a3c3dd) zeigen wir nur aktiv/passiv/wartend — done
  // und error sind in den per-session-Indikatoren sichtbar.
  let activeCount = 0;
  let idleCount = 0;
  let waitingCount = 0;

  for (const s of sessions) {
    if (s.status === "running" || s.status === "starting") {
      if (getActivityLevel(s.lastOutputAt, now) === "active") {
        activeCount++;
      } else {
        idleCount++;
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
          <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden="true" />
          <span className="text-neutral-400">{idleCount} passiv</span>
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
