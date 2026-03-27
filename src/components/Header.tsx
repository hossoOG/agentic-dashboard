import { useState } from "react";
import { Cpu, FolderOpen, Sun, Moon } from "lucide-react";
import { useSessionStore, selectActiveSession } from "../store/sessionStore";
import { useSettingsStore } from "../store/settingsStore";
import { NotesPanel } from "./shared/NotesPanel";
import { ChangelogDialog } from "./shared/ChangelogDialog";
import { UpdateNotification } from "./shared/UpdateNotification";
import { useAutoUpdate } from "../hooks/useAutoUpdate";
import { version } from "../../package.json";

function shortenPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return parts.slice(-2).join("/");
}

function ThemeToggle() {
  const mode = useSettingsStore((s) => s.theme.mode);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <button
      onClick={() => setTheme({ mode: mode === "dark" ? "light" : "dark" })}
      className="flex items-center justify-center w-8 h-8 rounded-sm text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay transition-colors"
      aria-label={mode === "dark" ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
      title={mode === "dark" ? "Light Mode" : "Dark Mode"}
    >
      {mode === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

export function Header() {
  const activeSession = useSessionStore(selectActiveSession);
  const [showChangelog, setShowChangelog] = useState(false);
  const { status, progress, error, newVersion, downloadAndInstall, dismiss } = useAutoUpdate();

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b-2 border-neutral-700 bg-surface-raised retro-terminal">
      <div className="flex items-center gap-3">
        <Cpu className="w-6 h-6 text-accent" />
        <span className="text-accent font-bold text-lg tracking-wider font-display">
          AGENTIC DASHBOARD
        </span>
        <button
          onClick={() => setShowChangelog(true)}
          className="text-xs text-neutral-400 border border-neutral-700 px-2 py-0.5 rounded-none hover:text-accent hover:border-accent transition-colors cursor-pointer"
          title="Changelog anzeigen"
        >
          v{version}
        </button>
        {showChangelog && <ChangelogDialog onClose={() => setShowChangelog(false)} />}
        <UpdateNotification
          status={status}
          progress={progress}
          error={error}
          newVersion={newVersion}
          onUpdate={downloadAndInstall}
          onDismiss={dismiss}
        />
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

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notes */}
        <NotesPanel />
      </div>
    </header>
  );
}
