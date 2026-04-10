import { useSessionStore } from "./sessionStore";
import { useSettingsStore, type RestorableSession } from "./settingsStore";

/**
 * Subscribes to sessionStore changes and continuously syncs
 * a restore snapshot into settingsStore (persisted).
 * Returns an unsubscribe function.
 */
export function initSessionRestoreSync(): () => void {
  let lastJson = "";

  return useSessionStore.subscribe((state) => {
    const settings = useSettingsStore.getState();
    if (!settings.sessionRestore.enabled) return;

    // Only include sessions that are still alive (not done/error)
    const alive = state.sessions.filter(
      (s) => s.status !== "done" && s.status !== "error",
    );

    const sessions: RestorableSession[] = alive.map((s) => ({
      folder: s.folder,
      title: s.title,
      shell: s.shell,
      claudeSessionId: s.claudeSessionId,
    }));

    // Resolve active/grid sessions by folder (stable across restore failures)
    const activeSession = state.activeSessionId
      ? alive.find((s) => s.id === state.activeSessionId)
      : undefined;

    const gridFolders = state.gridSessionIds
      .map((gid) => alive.find((s) => s.id === gid)?.folder)
      .filter((f): f is string => !!f);

    // Shallow comparison to avoid redundant writes
    const json = JSON.stringify(sessions);
    if (json === lastJson) return;
    lastJson = json;

    settings.setSessionRestore({
      enabled: true,
      sessions,
      activeFolder: activeSession?.folder ?? null,
      layoutMode: state.layoutMode,
      gridFolders,
    });
  });
}
