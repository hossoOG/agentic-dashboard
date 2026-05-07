import React, { Suspense, useEffect } from "react";
import { SideNav } from "./SideNav";
import { PipelineView } from "../pipeline/PipelineView";
import { SessionManagerView } from "../sessions/SessionManagerView";
import { useUIStore } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";

// Lazy-loaded views
const PreferencesView = React.lazy(() =>
  import("../settings/PreferencesView").then((m) => ({ default: m.PreferencesView }))
);
const KanbanDashboardView = React.lazy(() =>
  import("../kanban/KanbanDashboardView").then((m) => ({ default: m.KanbanDashboardView }))
);
const LogViewer = React.lazy(() =>
  import("../logs/LogViewer").then((m) => ({ default: m.LogViewer }))
);
const LibraryView = React.lazy(() =>
  import("../library/LibraryView").then((m) => ({ default: m.LibraryView }))
);
const MarkdownEditorView = React.lazy(() =>
  import("../editor/MarkdownEditorView").then((m) => ({ default: m.MarkdownEditorView }))
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
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const showProtokolleTab = useSettingsStore((s) => s.preferences.showProtokolleTab);

  // If the user hides the Protokolle tab while standing on it, fall back to
  // sessions so the main pane never renders an unreachable view.
  useEffect(() => {
    if (activeTab === "logs" && !showProtokolleTab) {
      setActiveTab("sessions");
    }
  }, [activeTab, showProtokolleTab, setActiveTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "sessions":
        return <SessionManagerView />;
      case "pipeline":
        return <PipelineView />;
      case "kanban":
        return (
          <Suspense fallback={<NeonSpinner />}>
            <KanbanDashboardView />
          </Suspense>
        );
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
      case "editor":
        return (
          <Suspense fallback={<NeonSpinner />}>
            <MarkdownEditorView />
          </Suspense>
        );
      case "settings":
        return (
          <Suspense fallback={<NeonSpinner />}>
            <PreferencesView />
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
        <main className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
