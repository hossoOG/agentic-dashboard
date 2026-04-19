import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore, type ActiveTab } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";
import { NotesPanel } from "../shared/NotesPanel";
import { ChangelogDialog } from "../shared/ChangelogDialog";
import { UpdateNotification } from "../shared/UpdateNotification";
import { useAutoUpdate } from "../../hooks/useAutoUpdate";
import { version } from "../../../package.json";
import { logError } from "../../utils/errorLogger";
import { ICONS, ICON_SIZE } from "../../utils/icons";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "available":
    case "downloading":
    case "ready": {
      const Available = ICONS.update.available;
      return <Available className={`${ICON_SIZE.inline} text-accent status-pulse-animation`} />;
    }
    case "error": {
      const Err = ICONS.update.error;
      return <Err className={`${ICON_SIZE.inline} text-red-400`} />;
    }
    default:
      return null;
  }
}

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: LucideIcon;
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
    { id: "sessions", label: "Sitzungen", icon: ICONS.nav.sessions, badge: badges.sessions },
    { id: "kanban", label: "Kanban", icon: ICONS.nav.kanban, badge: badges.kanban },
    { id: "library", label: "Bibliothek", icon: ICONS.nav.library, badge: badges.library },
    { id: "editor", label: "Editor", icon: ICONS.nav.editor, badge: badges.editor },
  ];

  const bottomItems: NavItem[] = [
    { id: "logs", label: "Protokolle", icon: ICONS.nav.logs, badge: badges.logs },
  ];

  const detachableViews = new Set<ActiveTab>(["kanban", "library", "editor"]);
  const ExternalLinkIcon = ICONS.action.externalLink;
  const LightIcon = ICONS.theme.light;
  const DarkIcon = ICONS.theme.dark;

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
          <Icon className={`${ICON_SIZE.nav} shrink-0`} />
          <span className="text-xs truncate">{item.label}</span>

          {/* Badge */}
          {item.badge != null && item.badge > 0 && (
            <span className="ml-auto min-w-[16px] h-4 flex items-center justify-center rounded-sm bg-error text-white text-[9px] font-bold px-1">
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
            <ExternalLinkIcon className={ICON_SIZE.inline} />
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
            {mode === "dark"
              ? <LightIcon className={`${ICON_SIZE.nav} shrink-0`} />
              : <DarkIcon className={`${ICON_SIZE.nav} shrink-0`} />}
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
