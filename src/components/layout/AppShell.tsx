import React, { Suspense } from "react";
import { Header } from "../Header";
import { SideNav } from "./SideNav";
import { PipelineView } from "../pipeline/PipelineView";
import { SessionManagerView } from "../sessions/SessionManagerView";
import { useUIStore } from "../../store/uiStore";

// Lazy-loaded views
const SettingsPlaceholder = React.lazy(() =>
  import("./placeholders").then((m) => ({ default: m.SettingsPlaceholder }))
);
const LogViewer = React.lazy(() =>
  import("../logs/LogViewer").then((m) => ({ default: m.LogViewer }))
);
const LibraryView = React.lazy(() =>
  import("../library/LibraryView").then((m) => ({ default: m.LibraryView }))
);

function NeonSpinner() {
  return (
    <div className="flex items-center justify-center h-full w-full bg-surface-base">
      <div className="w-8 h-8 border-2 border-accent-a30 border-t-accent rounded-full animate-spin" />
    </div>
  );
}

export function AppShell() {
  const activeTab = useUIStore((s) => s.activeTab);

  const renderContent = () => {
    switch (activeTab) {
      case "sessions":
        return <SessionManagerView />;
      case "pipeline":
        return <PipelineView />;
      case "logs":
        return (
          <Suspense fallback={<NeonSpinner />}>
            <LogViewer />
          </Suspense>
        );
      case "library":
        return (
          <Suspense fallback={<NeonSpinner />}>
            <LibraryView />
          </Suspense>
        );
      case "settings":
        return (
          <Suspense fallback={<NeonSpinner />}>
            <SettingsPlaceholder />
          </Suspense>
        );
      default:
        return <SessionManagerView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-base">
      <SideNav />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
