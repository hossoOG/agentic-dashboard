import { useState, useRef, useEffect } from "react";
import { StickyNote } from "lucide-react";
import { useSettingsStore } from "../../store/settingsStore";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";

type NotesTab = "project" | "global";

export function NotesPanel() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotesTab>("project");
  const panelRef = useRef<HTMLDivElement>(null);

  const globalNotes = useSettingsStore((s) => s.globalNotes);
  const setGlobalNotes = useSettingsStore((s) => s.setGlobalNotes);
  const projectNotes = useSettingsStore((s) => s.projectNotes);
  const setProjectNotes = useSettingsStore((s) => s.setProjectNotes);
  const activeSession = useSessionStore(selectActiveSession);

  const folderKey = activeSession?.folder?.replace(/\\/g, "/").toLowerCase() ?? "";
  const currentProjectNotes = folderKey ? (projectNotes[folderKey] ?? "") : "";
  const hasAnyNotes = globalNotes || currentProjectNotes;

  // Default to project tab if session active, otherwise global
  useEffect(() => {
    if (open) {
      setActiveTab(activeSession ? "project" : "global");
    }
  }, [open, activeSession]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-sm transition-all ${
          open
            ? "bg-accent-a15 text-accent border border-accent-a40"
            : hasAnyNotes
              ? "text-accent hover:bg-hover-overlay border border-transparent"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay border border-transparent"
        }`}
        aria-label="Notizen"
        title="Notizen"
      >
        <StickyNote className="w-4 h-4" />
        <span className="text-xs hidden lg:inline">Notizen</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 w-96 bg-surface-overlay border border-neutral-700 rounded-sm shadow-xl">
          {/* Tab Bar */}
          <div className="flex border-b border-neutral-700">
            <button
              onClick={() => setActiveTab("project")}
              disabled={!activeSession}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "project"
                  ? "text-accent border-b-2 border-accent"
                  : activeSession
                    ? "text-neutral-400 hover:text-neutral-200"
                    : "text-neutral-600 cursor-not-allowed"
              }`}
            >
              Projekt-Notizen
              {currentProjectNotes && (
                <span className="ml-1.5 w-1.5 h-1.5 bg-accent rounded-full inline-block" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("global")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "global"
                  ? "text-accent border-b-2 border-accent"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Globale Notizen
              {globalNotes && (
                <span className="ml-1.5 w-1.5 h-1.5 bg-accent rounded-full inline-block" />
              )}
            </button>
          </div>

          {/* Content */}
          {activeTab === "project" && activeSession ? (
            <>
              <textarea
                value={currentProjectNotes}
                onChange={(e) => setProjectNotes(activeSession.folder, e.target.value)}
                placeholder="Notizen fuer dieses Projekt..."
                className="w-full h-52 p-3 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none resize-none font-mono"
                autoFocus
              />
              <div className="px-3 py-1.5 border-t border-neutral-700 text-[10px] text-neutral-500 truncate">
                {activeSession.folder}
              </div>
            </>
          ) : activeTab === "global" ? (
            <textarea
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
              placeholder="Globale Stichsaetze, Ideen, TODOs..."
              className="w-full h-52 p-3 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none resize-none font-mono"
              autoFocus
            />
          ) : (
            <div className="h-52 flex items-center justify-center text-sm text-neutral-500">
              Keine Session aktiv
            </div>
          )}
        </div>
      )}
    </div>
  );
}
