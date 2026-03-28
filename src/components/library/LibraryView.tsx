import { BookOpen } from "lucide-react";
import { LibraryViewer } from "../sessions/LibraryViewer";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";

export function LibraryView() {
  const activeSession = useSessionStore(selectActiveSession);
  const folder = activeSession?.folder;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 bg-surface-raised shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          <h1 className="text-sm font-semibold text-neutral-200">Library</h1>
        </div>
        {folder && (
          <span className="text-xs text-neutral-500 truncate max-w-[400px]">
            Projekt: {folder}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        <LibraryViewer folder={folder} />
      </div>
    </div>
  );
}
