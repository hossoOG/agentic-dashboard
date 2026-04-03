import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { initTauriStorage } from "./store/tauriStorage";
import "./index.css";

const LogWindowApp = lazy(() => import("./LogWindowApp"));

initTauriStorage().then(async () => {
  if (import.meta.env.DEV || localStorage.getItem("agenticexplorer-perf") === "1") {
    const { initPerf } = await import("./utils/perfLogger");
    initPerf();
  }

  const isLogWindow = window.location.search.includes("view=logs");

  if (isLogWindow) {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <Suspense fallback={<div className="flex items-center justify-center h-screen">Lade Logs...</div>}>
          <LogWindowApp />
        </Suspense>
      </React.StrictMode>
    );
  } else {
    const [{ default: App }, { ErrorBoundary }] = await Promise.all([
      import("./App"),
      import("./components/shared/ErrorBoundary"),
    ]);
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  }
});
