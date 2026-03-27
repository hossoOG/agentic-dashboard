import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useThemeEffect } from "./hooks/useThemeEffect";
import { useLogViewerStore } from "./store/logViewerStore";
import { logError } from "./utils/errorLogger";
import { LogViewer } from "./components/logs/LogViewer";

/**
 * Standalone app shell for the detached log viewer window.
 * Renders LogViewer fullscreen and listens for pipeline-log events.
 */
export default function LogWindowApp() {
  useThemeEffect();

  const listenerActive = useRef(false);

  useEffect(() => {
    if (listenerActive.current) return;
    listenerActive.current = true;

    let unlisten: (() => void) | undefined;

    listen<{ line: string; stream: string }>("pipeline-log", (event) => {
      try {
        const line = event?.payload?.line;
        if (typeof line !== "string") return;

        useLogViewerStore.getState().addEntries([
          {
            timestamp: new Date().toISOString(),
            severity: "info",
            source: "pipeline",
            message: line,
          },
        ]);
      } catch (err) {
        logError("LogWindowApp", err);
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        logError("LogWindowApp", err);
      });

    return () => {
      unlisten?.();
      listenerActive.current = false;
    };
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-surface-base text-neutral-200">
      <LogViewer />
    </div>
  );
}
