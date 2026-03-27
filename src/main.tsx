import React from "react";
import ReactDOM from "react-dom/client";
import { initTauriStorage } from "./store/tauriStorage";
import "./index.css";

// Load persisted settings from Documents/AgenticExplorer/ before mounting.
// App is imported dynamically so that settingsStore (and its persist hydration)
// runs AFTER the cache is warm — otherwise getItem returns null and defaults win.
initTauriStorage().then(async () => {
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
});
