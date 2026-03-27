import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { initTauriStorage } from "./store/tauriStorage";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const viewMode = params.get("view");

const LogWindowApp = viewMode === "logs"
  ? React.lazy(() => import("./LogWindowApp"))
  : null;

// Load persisted settings from Documents/AgenticExplorer/ before mounting
initTauriStorage().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        {LogWindowApp ? (
          <Suspense fallback={null}>
            <LogWindowApp />
          </Suspense>
        ) : (
          <App />
        )}
      </ErrorBoundary>
    </React.StrictMode>
  );
});
