import { useState, useRef, useEffect } from "react";
import { Cpu, FolderOpen, StickyNote } from "lucide-react";
import { useSessionStore, selectActiveSession } from "../store/sessionStore";
import { useSettingsStore } from "../store/settingsStore";
import { version } from "../../package.json";

function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return parts.slice(-2).join("/");
}

function NotesDropdown() {
  const [open, setOpen] = useState(false);
  const globalNotes = useSettingsStore((s) => s.globalNotes);
  const setGlobalNotes = useSettingsStore((s) => s.setGlobalNotes);
  const panelRef = useRef<HTMLDivElement>(null);

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
            ? "bg-accent/15 text-accent border border-accent/40"
            : globalNotes
              ? "text-accent hover:bg-white/5 border border-transparent"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5 border border-transparent"
        }`}
        aria-label="Notizen"
        title="Notizen"
      >
        <StickyNote className="w-4 h-4" />
        <span className="text-xs hidden lg:inline">Notizen</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 w-80 bg-surface-overlay border border-neutral-700 rounded-sm shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700">
            <span className="text-xs text-neutral-400 font-medium">Globale Notizen</span>
          </div>
          <textarea
            value={globalNotes}
            onChange={(e) => setGlobalNotes(e.target.value)}
            placeholder="Stichsaetze, Ideen, TODOs..."
            className="w-full h-48 p-3 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none resize-none font-mono"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

export function Header() {
  const activeSession = useSessionStore(selectActiveSession);

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b-2 border-neutral-700 bg-surface-raised retro-terminal">
      <div className="flex items-center gap-3">
        <Cpu className="w-6 h-6 text-accent" />
        <span className="text-accent font-bold text-lg tracking-wider font-display">
          AGENTIC DASHBOARD
        </span>
        <span className="text-xs text-neutral-400 border border-neutral-700 px-2 py-0.5 rounded-none">
          v{version}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Active session context */}
        {activeSession ? (
          <div className="flex items-center gap-2 text-sm text-neutral-300">
            <FolderOpen className="w-4 h-4 text-neutral-500 shrink-0" />
            <span className="font-bold truncate max-w-[200px]">{activeSession.title}</span>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-500 truncate max-w-[250px]">
              {shortenPath(activeSession.folder)}
            </span>
          </div>
        ) : (
          <span className="text-sm text-neutral-500">Keine Session ausgewaehlt</span>
        )}

        {/* Divider */}
        <div className="w-px h-5 bg-neutral-700" />

        {/* Notes */}
        <NotesDropdown />
      </div>
    </header>
  );
}
