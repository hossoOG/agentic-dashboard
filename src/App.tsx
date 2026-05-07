import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppShell } from "./components/layout/AppShell";
import { installGlobalErrorHandlers } from "./utils/globalErrorHandler";
import { wireLoggingGate, logError } from "./utils/errorLogger";
import { setPerfEnabled } from "./utils/perfLogger";
import { useThemeEffect } from "./hooks/useThemeEffect";
import { useSessionRestore } from "./hooks/useSessionRestore";
import { initSessionHistoryListener } from "./store/sessionHistoryStore";
import { initSessionRestoreSync } from "./store/sessionRestoreSync";
import { flushPendingSaves } from "./store/tauriStorage";
import { useSettingsStore } from "./store/settingsStore";

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

    // Wire runtime logging gates against the persisted preferences slice.
    wireLoggingGate(() => useSettingsStore.getState().preferences.frontendLogging);
    setPerfEnabled(useSettingsStore.getState().preferences.performanceProfiler);

    // Sync backend file-logging once on boot. The store's setter handles
    // subsequent toggles; this catches the initial state on a fresh launch.
    const initialBackendLogging = useSettingsStore.getState().preferences.backendFileLogging;
    invoke("set_file_logging_enabled", { enabled: initialBackendLogging }).catch((err) =>
      logError("App.initBackendLogging", err),
    );

    // Subscribe to perf toggle changes — perf uses a hot-path boolean, so we
    // mirror the store value into the module-local flag instead of polling.
    const unsubscribePerf = useSettingsStore.subscribe((state, prev) => {
      if (state.preferences.performanceProfiler !== prev.preferences.performanceProfiler) {
        setPerfEnabled(state.preferences.performanceProfiler);
      }
    });

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
