import { useEffect, useRef } from "react";
import { wrapInvoke } from "../utils/perfLogger";
import { useSessionStore } from "../store/sessionStore";
import { useSettingsStore } from "../store/settingsStore";
import { useUIStore } from "../store/uiStore";
import { logWarn } from "../utils/errorLogger";
import type { SessionShell } from "../store/sessionStore";

interface ClaudeSessionSummary {
  session_id: string;
  started_at: string;
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_SESSIONS = 8;

/**
 * Restores previously open sessions on app startup.
 * Runs once on mount — reads the persisted snapshot from settingsStore,
 * recreates sessions via Tauri, and restores layout state.
 */
export function useSessionRestore(): void {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const { sessionRestore } = useSettingsStore.getState();
    if (!sessionRestore.enabled || sessionRestore.sessions.length === 0) return;

    restoreSessions(sessionRestore);
  }, []);
}

async function restoreSessions(
  restore: ReturnType<typeof useSettingsStore.getState>["sessionRestore"],
): Promise<void> {
  const sessionsToRestore = restore.sessions.slice(0, MAX_SESSIONS);
  const createdIds: string[] = [];
  const errors: string[] = [];

  for (const entry of sessionsToRestore) {
    const id = generateSessionId();
    try {
      // Use persisted Claude CLI session ID if available, otherwise scan for most recent
      let resumeSessionId: string | undefined = entry.claudeSessionId;
      if (!resumeSessionId) {
        try {
          const history = await wrapInvoke<ClaudeSessionSummary[]>(
            "scan_claude_sessions",
            { folder: entry.folder },
          );
          if (history && history.length > 0) {
            // Sessions are sorted by date desc — first entry is the most recent
            resumeSessionId = history[0].session_id;
          }
        } catch {
          // Non-critical: if scan fails, just start a fresh session
          logWarn("sessionRestore", `Claude-History für "${entry.folder}" nicht lesbar, starte frisch`);
        }
      }

      const result = await wrapInvoke<{
        id: string;
        title: string;
        folder: string;
        shell: string;
      }>("create_session", {
        id,
        folder: entry.folder,
        title: entry.title,
        shell: entry.shell,
        resumeSessionId,
      });

      const sessionId = result?.id ?? id;
      useSessionStore.getState().addSession({
        id: sessionId,
        title: result?.title ?? entry.title,
        folder: result?.folder ?? entry.folder,
        shell: (result?.shell ?? entry.shell) as SessionShell,
        claudeSessionId: resumeSessionId,
      });
      createdIds.push(sessionId);
    } catch (err) {
      logWarn("sessionRestore", `Session für "${entry.folder}" übersprungen: ${err}`);
      errors.push(entry.title || entry.folder);
    }
  }

  if (createdIds.length === 0) return;

  // Restore layout
  const store = useSessionStore.getState();

  if (restore.layoutMode === "grid" && restore.gridIndices.length > 0) {
    store.setLayoutMode("grid");
    for (const idx of restore.gridIndices) {
      if (idx >= 0 && idx < createdIds.length) {
        useSessionStore.getState().addToGrid(createdIds[idx]);
      }
    }
  }

  if (
    restore.activeIndex !== null &&
    restore.activeIndex >= 0 &&
    restore.activeIndex < createdIds.length
  ) {
    useSessionStore.getState().setActiveSession(createdIds[restore.activeIndex]);
  }

  // Toast feedback
  const addToast = useUIStore.getState().addToast;
  if (errors.length > 0) {
    addToast({
      type: "info",
      title: `${createdIds.length} von ${sessionsToRestore.length} Sessions wiederhergestellt`,
      message: `Übersprungen: ${errors.join(", ")}`,
      duration: 6000,
    });
  } else {
    addToast({
      type: "success",
      title: `${createdIds.length} Session${createdIds.length > 1 ? "s" : ""} wiederhergestellt`,
      duration: 4000,
    });
  }
}
