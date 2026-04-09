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

    // Compute layout indices relative to the alive-sessions array
    const activeIndex = state.activeSessionId
      ? alive.findIndex((s) => s.id === state.activeSessionId)
      : null;

    const gridIndices = state.gridSessionIds
      .map((gid) => alive.findIndex((s) => s.id === gid))
      .filter((i) => i >= 0);

    // Shallow comparison to avoid redundant writes
    const json = JSON.stringify(sessions);
    if (json === lastJson) return;
    lastJson = json;

    settings.setSessionRestore({
      enabled: true,
      sessions,
      activeIndex: activeIndex !== null && activeIndex >= 0 ? activeIndex : null,
      layoutMode: state.layoutMode,
      gridIndices,
    });
  });
}
