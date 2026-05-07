import { useEffect, useRef } from "react";
import { AppShell } from "./components/layout/AppShell";
import { installGlobalErrorHandlers } from "./utils/globalErrorHandler";
import { wireRuntimeGates, syncBackendFileLoggingFromPreferences } from "./utils/wireRuntimeGates";
import { useThemeEffect } from "./hooks/useThemeEffect";
import { useSessionRestore } from "./hooks/useSessionRestore";
import { initSessionHistoryListener } from "./store/sessionHistoryStore";
import { initSessionRestoreSync } from "./store/sessionRestoreSync";
import { flushPendingSaves } from "./store/tauriStorage";

function App() {
  useThemeEffect();
  useSessionRestore();

  // Guard against double-registration in React Strict Mode: the ref persists
  // across the mount → unmount → remount cycle that Strict Mode triggers in dev.
  const listenerActive = useRef(false);

  useEffect(() => {
    if (listenerActive.current) return;
    listenerActive.current = true;

    // Install global error handlers once
    installGlobalErrorHandlers();

    // Wire runtime logging + perf gates against the persisted preferences.
    // Perf is OR'd with DEV / localStorage opt-ins inside the helper so
    // existing dev workflows keep working when the user pref is off.
    const unsubscribePerf = wireRuntimeGates();

    // Push the persisted backend-file-logging value to Rust. Only the main
    // window owns this; detached windows share the same Rust process flag.
    syncBackendFileLoggingFromPreferences();

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
    // Sync open sessions to settingsStore for restore on next startup
    const unsubscribeRestore = initSessionRestoreSync();

    return () => {
      unlistenClose?.();
      unsubscribeHistory();
      unsubscribeRestore();
      unsubscribePerf();
      listenerActive.current = false;
    };
  }, []);

  return <AppShell />;
}

export default App;
