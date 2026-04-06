import { useCallback } from "react";
import { wrapInvoke } from "../../../utils/perfLogger";
import { useSessionStore } from "../../../store/sessionStore";
import { useSettingsStore } from "../../../store/settingsStore";
import { useUIStore } from "../../../store/uiStore";
import { logError } from "../../../utils/errorLogger";
import type { FavoriteFolder } from "../../../store/settingsStore";
import type { SessionShell } from "../../../store/sessionStore";

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseSessionCreationReturn {
  handleResumeSession: (resumeSessionId: string, cwd: string) => Promise<void>;
  handleQuickStart: (favorite: FavoriteFolder) => Promise<void>;
}

export function useSessionCreation(): UseSessionCreationReturn {
  const handleResumeSession = useCallback(
    async (resumeSessionId: string, cwd: string) => {
      const id = generateSessionId();
      const title = "Resume Session";
      const shell = "powershell";

      try {
        const result = await wrapInvoke<{
          id: string;
          title: string;
          folder: string;
          shell: string;
        }>("create_session", {
          id,
          folder: cwd,
          title,
          shell,
          resumeSessionId,
        });

        const sessionId = result?.id ?? id;
        useSessionStore.getState().addSession({
          id: sessionId,
          title: result?.title ?? title,
          folder: result?.folder ?? cwd,
          shell: (result?.shell ?? shell) as SessionShell,
        });
      } catch (err) {
        logError("useSessionCreation.resumeSession", err);
      }
    },
    [],
  );

  const handleQuickStart = useCallback(async (favorite: FavoriteFolder) => {
    const id = generateSessionId();
    const title = favorite.label;
    const folder = favorite.path;
    const shell = favorite.shell;

    try {
      const result = await wrapInvoke<{
        id: string;
        title: string;
        folder: string;
        shell: string;
      }>("create_session", {
        id,
        folder,
        title,
        shell,
      });

      const sessionId = result?.id ?? id;
      useSessionStore.getState().addSession({
        id: sessionId,
        title: result?.title ?? title,
        folder: result?.folder ?? folder,
        shell: (result?.shell ?? shell) as SessionShell,
      });
      useSettingsStore.getState().updateFavoriteLastUsed(favorite.id);
      useUIStore.getState().closePreview();
    } catch (err) {
      logError("useSessionCreation.quickStart", err);
    }
  }, []);

  return { handleResumeSession, handleQuickStart };
}
