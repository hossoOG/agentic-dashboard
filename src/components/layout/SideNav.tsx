import { useState } from "react";
import {
  Monitor, Columns3, ScrollText, BookOpen, FileEdit,
  Sun, Moon, Check, RefreshCw, ArrowDownCircle, AlertCircle, ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore, type ActiveTab } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";
import { NotesPanel } from "../shared/NotesPanel";
import { ChangelogDialog } from "../shared/ChangelogDialog";
import { UpdateNotification } from "../shared/UpdateNotification";
import { useAutoUpdate } from "../../hooks/useAutoUpdate";
import { version } from "../../../package.json";
import { logError } from "../../utils/errorLogger";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "checking":
      return <RefreshCw className="w-3 h-3 text-neutral-400 animate-spin" />;
    case "upToDate":
      return <Check className="w-3 h-3 text-emerald-400" />;
    case "available":
    case "downloading":
    case "ready":
      return <ArrowDownCircle className="w-3 h-3 text-accent status-pulse-animation" />;
    case "error":
      return <AlertCircle className="w-3 h-3 text-red-400" />;
    default:
      return null;
  }
}

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: typeof Monitor;
  badge?: number;
}

interface SideNavProps {
  badges?: Partial<Record<ActiveTab, number>>;
}

export function SideNav({ badges = {} }: SideNavProps) {
  const { activeTab, setActiveTab } = useUIStore();
  const mode = useSettingsStore((s) => s.theme.mode);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const [showChangelog, setShowChangelog] = useState(false);
  const { status, progress, error, newVersion, lastChecked, checkForUpdate, downloadAndInstall, confirmRelaunch, dismiss } = useAutoUpdate();

  const statusTitle = lastChecked
    ? `Version ${version} — Zuletzt geprüft: ${lastChecked.toLocaleTimeString("de-DE")}`
    : `Version ${version}`;

  const topItems: NavItem[] = [
    { id: "sessions", label: "Sitzungen", icon: Monitor, badge: badges.sessions },
    { id: "kanban", label: "Kanban", icon: Columns3, badge: badges.kanban },
    { id: "library", label: "Bibliothek", icon: BookOpen, badge: badges.library },
    { id: "editor", label: "Editor", icon: FileEdit, badge: badges.editor },
  ];

  const bottomItems: NavItem[] = [
    { id: "logs", label: "Protokolle", icon: ScrollText, badge: badges.logs },
  ];

  const detachableViews = new Set<ActiveTab>(["kanban", "library", "editor"]);

  function renderItem(item: NavItem) {
    const isActive = activeTab === item.id;
    const Icon = item.icon;
    const canDetach = detachableViews.has(item.id);

    return (
      <div key={item.id} className="relative group">
        <button
          onClick={() => setActiveTab(item.id)}
          className={`
            relative flex items-center gap-2 w-full h-9 px-3 rounded-none
            transition-all duration-150 text-left
            ${isActive
              ? "text-accent bg-accent-a10 border-l-2 border-accent"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay border-l-2 border-transparent"
            }
          `}
          aria-label={item.label}
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="text-xs truncate">{item.label}</span>

          {/* Badge */}
          {item.badge != null && item.badge > 0 && (
            <span className="ml-auto min-w-[16px] h-4 flex items-center justify-center rounded-full bg-error text-white text-[9px] font-bold px-1">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </button>

        {/* Pop-out button */}
        {canDetach && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              invoke("open_detached_window", { view: item.id, title: item.label }).catch((err: unknown) =>
                logError("SideNav.openDetachedWindow", err)
              );
            }}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-neutral-600 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
            title={`${item.label} in eigenem Fenster öffnen`}
            aria-label={`${item.label} in eigenem Fenster öffnen`}
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <nav className="flex flex-col w-32 min-w-[128px] bg-surface-base border-r border-neutral-700 py-2 gap-0.5">
        {/* Logo + Version */}
        <div className="flex flex-col items-center px-3 pb-2 mb-1 border-b border-neutral-700">
          <button
            onClick={() => { checkForUpdate(); setShowChangelog(true); }}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-accent transition-colors cursor-pointer font-bold"
            title={statusTitle}
          >
            v{version}
            <StatusIcon status={status} />
          </button>
        </div>

        {topItems.map(renderItem)}

        <div className="mt-auto flex flex-col gap-0.5">
          {bottomItems.map(renderItem)}

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-neutral-700" />

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme({ mode: mode === "dark" ? "light" : "dark" })}
            className="flex items-center gap-2 w-full h-9 px-3 rounded-none text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay border-l-2 border-transparent transition-all duration-150 text-left"
            aria-label={mode === "dark" ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
            title={mode === "dark" ? "Light Mode" : "Dark Mode"}
          >
            {mode === "dark" ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
            <span className="text-xs truncate">{mode === "dark" ? "Light" : "Dark"}</span>
          </button>

          {/* Notes */}
          <NotesPanel variant="sidebar" />
        </div>
      </nav>

      {/* Dialogs — outside nav to avoid layout interference */}
      <ChangelogDialog open={showChangelog} onClose={() => setShowChangelog(false)} />
      <UpdateNotification
        status={status}
        progress={progress}
        error={error}
        newVersion={newVersion}
        lastChecked={lastChecked}
        onUpdate={downloadAndInstall}
        onRelaunch={confirmRelaunch}
        onRetry={checkForUpdate}
        onDismiss={dismiss}
      />
    </>
  );
}
