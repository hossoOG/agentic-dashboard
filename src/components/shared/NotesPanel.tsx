import { useState, useRef, useEffect, useMemo } from "react";
import { StickyNote, ChevronDown, FolderOpen } from "lucide-react";
import { useSettingsStore } from "../../store/settingsStore";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { folderLabel } from "../../utils/pathUtils";

type NotesTab = "project" | "global";

/** Normalize folder path for consistent lookup */
function normalizePath(p: string) {
  return p.replace(/\\/g, "/").toLowerCase();
}

export function NotesPanel() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotesTab>("project");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const globalNotes = useSettingsStore((s) => s.globalNotes);
  const setGlobalNotes = useSettingsStore((s) => s.setGlobalNotes);
  const projectNotes = useSettingsStore((s) => s.projectNotes);
  const setProjectNotes = useSettingsStore((s) => s.setProjectNotes);
  const favorites = useSettingsStore((s) => s.favorites);
  const activeSession = useSessionStore(selectActiveSession);

  // Determine effective folder: session folder takes priority, then manual selection
  const sessionFolderKey = activeSession?.folder ? normalizePath(activeSession.folder) : "";
  const effectiveFolderKey = sessionFolderKey || selectedFolder || "";
  const currentProjectNotes = effectiveFolderKey ? (projectNotes[effectiveFolderKey] ?? "") : "";

  // Build list of available folders (favorites + folders with existing notes)
  const availableFolders = useMemo(() => {
    const folderMap = new Map<string, { key: string; originalPath: string; label: string; hasNotes: boolean }>();

    // Add favorites
    for (const fav of favorites) {
      const key = normalizePath(fav.path);
      folderMap.set(key, {
        key,
        originalPath: fav.path,
        label: fav.label || folderLabel(fav.path),
        hasNotes: key in projectNotes && !!projectNotes[key],
      });
    }

    // Add folders that have notes but aren't in favorites
    for (const noteKey of Object.keys(projectNotes)) {
      if (!folderMap.has(noteKey) && projectNotes[noteKey]) {
        folderMap.set(noteKey, {
          key: noteKey,
          originalPath: noteKey,
          label: folderLabel(noteKey),
          hasNotes: true,
        });
      }
    }

    return Array.from(folderMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [favorites, projectNotes]);

  const hasAnyProjectNotes = Object.values(projectNotes).some((v) => !!v);
  const hasAnyNotes = globalNotes || hasAnyProjectNotes;

  // Default to project tab if session active or folders available, otherwise global
  useEffect(() => {
    if (open) {
      if (activeSession) {
        setActiveTab("project");
      } else if (availableFolders.length > 0) {
        setActiveTab("project");
        // Auto-select first folder with notes, or first folder
        if (!selectedFolder) {
          const withNotes = availableFolders.find((f) => f.hasNotes);
          setSelectedFolder((withNotes ?? availableFolders[0])?.key ?? null);
        }
      } else {
        setActiveTab("global");
      }
    }
  }, [open, activeSession, availableFolders, selectedFolder]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFolderPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const showFolderPicker = activeTab === "project" && !activeSession;
  const hasProjectContext = !!effectiveFolderKey;

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
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === "project"
                  ? "text-accent border-b-2 border-accent"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Projekt-Notizen
              {hasAnyProjectNotes && (
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
          {activeTab === "project" ? (
            <>
              {/* Folder Picker (shown when no session active) */}
              {showFolderPicker && (
                <div className="relative border-b border-neutral-700">
                  <button
                    onClick={() => setFolderPickerOpen(!folderPickerOpen)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-300 hover:bg-hover-overlay transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span className="truncate flex-1 text-left">
                      {effectiveFolderKey
                        ? folderLabel(effectiveFolderKey)
                        : "Projekt wählen..."}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${folderPickerOpen ? "rotate-180" : ""}`} />
                  </button>

                  {folderPickerOpen && (
                    <div className="absolute left-0 right-0 top-full z-10 max-h-48 overflow-y-auto bg-surface-overlay border border-neutral-700 rounded-b-sm shadow-lg">
                      {availableFolders.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-neutral-500 text-center">
                          Keine Projekte vorhanden — starte eine Session oder füge Favoriten hinzu
                        </div>
                      ) : (
                        availableFolders.map((f) => (
                          <button
                            key={f.key}
                            onClick={() => {
                              setSelectedFolder(f.key);
                              setFolderPickerOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                              f.key === effectiveFolderKey
                                ? "bg-accent-a15 text-accent"
                                : "text-neutral-300 hover:bg-hover-overlay"
                            }`}
                            title={f.originalPath}
                          >
                            <span className="truncate flex-1 text-left">{f.label}</span>
                            {f.hasNotes && (
                              <span className="w-1.5 h-1.5 bg-accent rounded-full shrink-0" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Notes Textarea */}
              {hasProjectContext ? (
                <>
                  <textarea
                    value={currentProjectNotes}
                    onChange={(e) => setProjectNotes(effectiveFolderKey, e.target.value)}
                    placeholder="Notizen für dieses Projekt..."
                    className="w-full h-52 p-3 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none resize-none font-mono"
                    autoFocus
                  />
                  <div className="px-3 py-1.5 border-t border-neutral-700 text-[10px] text-neutral-500 truncate">
                    {activeSession?.folder ?? effectiveFolderKey}
                  </div>
                </>
              ) : (
                <div className="h-52 flex items-center justify-center text-sm text-neutral-500">
                  {availableFolders.length === 0
                    ? "Keine Projekte vorhanden"
                    : "Projekt wählen um Notizen zu sehen"}
                </div>
              )}
            </>
          ) : (
            <textarea
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
              placeholder="Globale Stichsaetze, Ideen, TODOs..."
              className="w-full h-52 p-3 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none resize-none font-mono"
              autoFocus
            />
          )}
        </div>
      )}
    </div>
  );
}
