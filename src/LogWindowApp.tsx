import { Suspense, lazy, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useSettingsStore } from "./store/settingsStore";
import { useLogViewerStore } from "./store/logViewerStore";

const LogViewer = lazy(() => import("./components/logs/LogViewer").then(m => ({ default: m.LogViewer })));

export default function LogWindowApp() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const addEntries = useLogViewerStore.getState().addEntries;
    const unlisten = listen<{ message: string; level: string }>("pipeline-log", (event) => {
      addEntries([{
        timestamp: new Date().toISOString(),
        severity: event.payload.level === "stderr" ? "warn" : "info",
        source: "pipeline",
        message: event.payload.message,
      }]);
    });
    return () => { unlisten.then((fn) => fn()); };
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
