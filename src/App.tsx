import { useEffect, useRef } from "react";
import { AppShell } from "./components/layout/AppShell";
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

    return () => {
      unlistenClose?.();
      unsubscribeHistory();
      listenerActive.current = false;
    };
  }, []);

  return <AppShell />;
}

export default App;
