import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { initTauriStorage } from "./store/tauriStorage";
import "./index.css";

const LogWindowApp = lazy(() => import("./LogWindowApp"));
const DetachedViewApp = lazy(() => import("./DetachedViewApp"));

const DETACHED_VIEWS = new Set(["kanban", "library", "editor"]);

initTauriStorage().then(async () => {
  if (import.meta.env.DEV || localStorage.getItem("agenticexplorer-perf") === "1") {
    const { initPerf } = await import("./utils/perfLogger");
    initPerf();
  }

  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "logs") {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <Suspense fallback={<div className="flex items-center justify-center h-screen">Lade Logs...</div>}>
          <LogWindowApp />
        </Suspense>
      </React.StrictMode>
    );
  } else if (view && DETACHED_VIEWS.has(view)) {
    const { ErrorBoundary } = await import("./components/shared/ErrorBoundary");
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center h-screen">Lade...</div>}>
            <DetachedViewApp view={view} />
          </Suspense>
        </ErrorBoundary>
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
