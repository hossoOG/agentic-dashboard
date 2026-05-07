import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../store/settingsStore";
import { wireLoggingGate, logError } from "./errorLogger";
import { setPerfEnabled } from "./perfLogger";

const isPerfEnv =
  import.meta.env.DEV || localStorage.getItem("agenticexplorer-perf") === "1";

/**
 * Wires runtime preference gates for the current React root. Must be called
 * from EVERY entry point (main App, log window, detached views) — each window
 * mounts its own root and the module-local gate state is per-window.
 *
 * Returns the unsubscribe function for the perf-toggle subscription so the
 * caller can clean up on unmount.
 */
export function wireRuntimeGates(): () => void {
  // Frontend gate is a function reference re-read on every log call —
  // no subscription needed, just inject the closure once.
  wireLoggingGate(() => useSettingsStore.getState().preferences.frontendLogging);

  // Perf is a hot-path boolean. OR the user preference with the existing
  // DEV / localStorage opt-ins so devs don't silently lose perf data.
  const computePerfEnabled = () =>
    useSettingsStore.getState().preferences.performanceProfiler || isPerfEnv;
  setPerfEnabled(computePerfEnabled());

  return useSettingsStore.subscribe((state, prev) => {
    if (state.preferences.performanceProfiler !== prev.preferences.performanceProfiler) {
      setPerfEnabled(computePerfEnabled());
    }
  });
}

/**
 * Pushes the persisted backendFileLogging value to the Rust side. Only the
 * main window calls this — the Rust flag is process-global, racing it from
 * multiple webview roots would cause stutter.
 */
export function syncBackendFileLoggingFromPreferences(): void {
  const enabled = useSettingsStore.getState().preferences.backendFileLogging;
  invoke("set_file_logging_enabled", { enabled }).catch((err) =>
    logError("wireRuntimeGates.backendSync", err),
  );
}
