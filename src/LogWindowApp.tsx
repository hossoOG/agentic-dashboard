import { Suspense, lazy, useEffect } from "react";
import { useSettingsStore } from "./store/settingsStore";
import { wireRuntimeGates } from "./utils/wireRuntimeGates";
import { subscribeToPipelineLog } from "./utils/pipelineLogBridge";
import { logError } from "./utils/errorLogger";

const LogViewer = lazy(() => import("./components/logs/LogViewer").then(m => ({ default: m.LogViewer })));

export default function LogWindowApp() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    // Each window mounts its own React root; perf/logging gates are
    // module-local and must be re-wired per-window. No backend sync
    // here — only the main window owns the Rust-side toggle.
    const unsubscribeGates = wireRuntimeGates();

    let unlistenPipeline: (() => void) | null = null;
    void subscribeToPipelineLog()
      .then((fn) => { unlistenPipeline = fn; })
      .catch((err) => logError("LogWindowApp.subscribePipelineLog", err));

    return () => {
      unsubscribeGates();
      unlistenPipeline?.();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme.mode === "dark");
  }, [theme.mode]);

  return (
    <div className={`h-screen w-screen overflow-hidden ${theme.mode === "dark" ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
      <Suspense fallback={<div className="flex items-center justify-center h-full">Lade Logs...</div>}>
        <LogViewer />
      </Suspense>
    </div>
  );
}
