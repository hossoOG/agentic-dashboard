import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { parseLogLine, applyParsedEvents } from "./store/logParser";
import { logError } from "./utils/errorLogger";
import { useLogViewerStore } from "./store/logViewerStore";
import { installGlobalErrorHandlers } from "./utils/globalErrorHandler";
import { useThemeEffect } from "./hooks/useThemeEffect";
import { initSessionHistoryListener } from "./store/sessionHistoryStore";
import { flushPendingSaves } from "./store/tauriStorage";

function App() {
  useThemeEffect();

  // Guard against double-registration in React Strict Mode: the ref persists
  // across the mount → unmount → remount cycle that Strict Mode triggers in dev.
  const listenerActive = useRef(false);

  useEffect(() => {
    if (listenerActive.current) return;
    listenerActive.current = true;

    // Install global error handlers once
    installGlobalErrorHandlers();

    // Flush pending saves on window close to prevent data loss.
    // Use Tauri's close-requested event which supports async (unlike beforeunload).
    let unlistenClose: (() => void) | undefined;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      getCurrentWindow().onCloseRequested(async () => {
        await flushPendingSaves();
      }).then((fn) => { unlistenClose = fn; });
    }).catch(() => {
      // Fallback for non-Tauri environments (dev browser)
      window.addEventListener("beforeunload", () => { flushPendingSaves(); });
    });

    // Start session history listener (records completed sessions)
    const unsubscribeHistory = initSessionHistoryListener();

    let unlisten: (() => void) | undefined;

    listen<{ line: string; stream: string }>("pipeline-log", (event) => {
      try {
        const line = event?.payload?.line;
        if (typeof line !== "string") {
          logError("App", `pipeline-log event has invalid payload: ${JSON.stringify(event?.payload)}`);
          return;
        }
        const parsed = parseLogLine(line, undefined);
        applyParsedEvents(parsed);

        // Forward to log viewer store
        useLogViewerStore.getState().addEntries([{
          timestamp: new Date().toISOString(),
          severity: "info",
          source: "pipeline",
          message: line,
        }]);
      } catch (err) {
        logError("App", err);
      }
    }).then((fn) => {
      unlisten = fn;
    }).catch((err) => {
      logError("App", err);
    });

    return () => {
      unlisten?.();
      unlistenClose?.();
      unsubscribeHistory();
      listenerActive.current = false;
    };
  }, []);

  return <AppShell />;
}

export default App;
