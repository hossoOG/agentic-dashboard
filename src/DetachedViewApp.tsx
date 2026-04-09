import { Suspense, lazy, useEffect } from "react";
import { useSettingsStore } from "./store/settingsStore";

const KanbanDashboardView = lazy(() =>
  import("./components/kanban/KanbanDashboardView").then((m) => ({ default: m.KanbanDashboardView }))
);
const LibraryView = lazy(() =>
  import("./components/library/LibraryView").then((m) => ({ default: m.LibraryView }))
);
const MarkdownEditorView = lazy(() =>
  import("./components/editor/MarkdownEditorView").then((m) => ({ default: m.MarkdownEditorView }))
);

function NeonSpinner() {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="w-8 h-8 border-2 border-accent-a30 border-t-accent rounded-full animate-spin" />
    </div>
  );
}

export default function DetachedViewApp({ view }: { view: string }) {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme.mode === "dark");
  }, [theme.mode]);

  const renderView = () => {
    switch (view) {
      case "kanban":
        return <KanbanDashboardView />;
      case "library":
        return <LibraryView />;
      case "editor":
        return <MarkdownEditorView />;
      default:
        return <div className="flex items-center justify-center h-full text-neutral-500">Unbekannte Ansicht: {view}</div>;
    }
  };

  return (
    <div className={`h-screen w-screen overflow-hidden ${theme.mode === "dark" ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}>
      <Suspense fallback={<NeonSpinner />}>
        {renderView()}
      </Suspense>
    </div>
  );
}
