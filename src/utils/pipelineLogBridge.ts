import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useLogViewerStore } from "../store/logViewerStore";
import { useSettingsStore } from "../store/settingsStore";

/**
 * Subscribes the current React root's logViewerStore to pipeline-log events.
 *
 * Why this exists: previously the listener lived only in LogWindowApp.tsx,
 * so the main window's Protokolle tab silently showed nothing during a
 * pipeline run (G-01 BLOCKER). Now both main and log window mount this and
 * see the same stream. Gated by preferences.frontendLogging so the toggle
 * actually means "no buffer growth" — earlier the pipeline path bypassed
 * the gate entirely.
 *
 * Returns a Promise resolving to the unlisten handle.
 */
export async function subscribeToPipelineLog(): Promise<UnlistenFn> {
  return listen<{ line: string; stream: string }>("pipeline-log", (event) => {
    // Gate by frontendLogging — if logging is off, no buffer growth.
    if (!useSettingsStore.getState().preferences.frontendLogging) return;

    const line = event?.payload?.line;
    if (typeof line !== "string") return;

    useLogViewerStore.getState().addEntries([{
      timestamp: new Date().toISOString(),
      severity: event.payload.stream === "stderr" ? "warn" : "info",
      source: "pipeline",
      message: line,
    }]);
  });
}
