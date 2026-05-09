import { useEffect, useRef, useCallback } from "react";
import {
  Monitor, Columns3, ScrollText, BookOpen, FileEdit, Settings as SettingsIcon,
  Sun, Moon, ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore, type ActiveTab } from "../../store/uiStore";
import { useSettingsStore } from "../../store/settingsStore";
import { NotesPanel } from "../shared/NotesPanel";
import { useAutoUpdate, type UpdateStatus } from "../../hooks/useAutoUpdate";
import { version } from "../../../package.json";
import { logError } from "../../utils/errorLogger";

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
  const addToast = useUIStore((s) => s.addToast);
  const mode = useSettingsStore((s) => s.theme.mode);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const showProtokolleTab = useSettingsStore((s) => s.preferences.showProtokolleTab);
  const { status, newVersion, lastChecked, checkForUpdate, downloadAndInstall, confirmRelaunch } = useAutoUpdate();

  // Track previous status to fire toast exactly once per transition.
  const prevStatusRef = useRef<UpdateStatus>("idle");
  // Track whether the last check was user-initiated — only THEN do we toast "Auf neuestem Stand".
  // Auto-checks (every 30 min) stay silent on no-update to avoid noise.
  const userInitiatedRef = useRef(false);

  // Toast helpers — extracted to avoid duplicating payloads between useEffect and handleVersionClick.
  const showInstallToast = useCallback(
    (versionStr: string) => {
      addToast({
        type: "info",
        title: `Update v${versionStr} verfügbar`,
        message: "Klick auf Installieren startet den Download.",
        duration: 12000,
        action: {
          label: "Installieren",
          onClick: () => {
            downloadAndInstall().catch((err: unknown) =>
              logError("SideNav.downloadAndInstall", err),
            );
          },
        },
      });
    },
    [addToast, downloadAndInstall],
  );

  const showRestartToast = useCallback(() => {
    addToast({
      type: "success",
      title: "Update bereit",
      message: "App muss neu gestartet werden.",
      duration: 0, // sticky until user clicks action
      action: {
        label: "Neu starten",
        onClick: () => {
          confirmRelaunch().catch((err: unknown) =>
            logError("SideNav.confirmRelaunch", err),
          );
        },
      },
    });
  }, [addToast, confirmRelaunch]);

  // Toast on status transitions — fires for both manual click and auto-check.
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (status === "available" && prev !== "available" && newVersion) {
      showInstallToast(newVersion);
    } else if (status === "ready" && prev !== "ready") {
      showRestartToast();
    } else if (status === "error" && prev !== "error") {
      addToast({
        type: "error",
        title: "Update-Check fehlgeschlagen",
        duration: 5000,
      });
    } else if (status === "upToDate" && prev === "checking" && userInitiatedRef.current) {
      // Only confirm "up to date" when user explicitly initiated — silent for auto-checks.
      addToast({
        type: "success",
        title: "Auf neuestem Stand",
        duration: 2500,
      });
      userInitiatedRef.current = false;
    }
    prevStatusRef.current = status;
  }, [status, newVersion, addToast, showInstallToast, showRestartToast]);

  // State-aware version-click: idle→toast+check; available/ready→re-show actionable toast.
  function handleVersionClick() {
    if (status === "available" && newVersion) {
      showInstallToast(newVersion);
      return;
    }
    if (status === "ready") {
      showRestartToast();
      return;
    }
    // idle / checking / upToDate / error → trigger fresh check with immediate "Suche..."-Feedback.
    userInitiatedRef.current = true;
    addToast({
      type: "info",
      title: "Suche nach Updates...",
      duration: 1500,
    });
    checkForUpdate().catch((err: unknown) => logError("SideNav.checkForUpdate", err));
  }

  // Tooltip wording mirrors the click action so user sees what will happen.
  const versionTooltip =
    status === "available" && newVersion
      ? `Update v${newVersion} verfügbar — Klick: Installieren`
      : status === "ready"
        ? "Update bereit — Klick: Neu starten"
        : lastChecked
          ? `Version ${version} — Zuletzt geprüft: ${lastChecked.toLocaleTimeString("de-DE")} (Klick: nach Updates suchen)`
          : `Version ${version} (Klick: nach Updates suchen)`;

  const topItems: NavItem[] = [
    { id: "sessions", label: "Sitzungen", icon: Monitor, badge: badges.sessions },
    { id: "kanban", label: "Kanban", icon: Columns3, badge: badges.kanban },
    { id: "library", label: "Bibliothek", icon: BookOpen, badge: badges.library },
    { id: "editor", label: "Editor", icon: FileEdit, badge: badges.editor },
  ];

  // Einstellungen wandert ans absolute Ende — separat unten gerendert.
  const bottomItems: NavItem[] = showProtokolleTab
    ? [{ id: "logs" as ActiveTab, label: "Protokolle", icon: ScrollText, badge: badges.logs }]
    : [];

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
            relative flex items-center justify-center w-full h-9 rounded-none
            transition-all duration-150
            ${isActive
              ? "text-accent bg-accent-a10 border-l-2 border-accent"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay border-l-2 border-transparent"
            }
          `}
          aria-label={item.label}
          title={item.label}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {item.badge != null && item.badge > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-error text-white text-[8px] font-bold px-0.5">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </button>

        {canDetach && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              invoke("open_detached_window", { view: item.id, title: item.label }).catch((err: unknown) =>
                logError("SideNav.openDetachedWindow", err),
              );
            }}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-neutral-600 hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
            title={`${item.label} in eigenem Fenster öffnen`}
            aria-label={`${item.label} in eigenem Fenster öffnen`}
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  const isDark = mode === "dark";
  const settingsActive = activeTab === "settings";

  return (
    <nav className="flex flex-col w-14 min-w-[56px] bg-surface-base border-r border-neutral-700 py-2 gap-0.5">
      {/* Top-Nav */}
      {topItems.map(renderItem)}

      {/* Bottom-Block: Protokolle (optional) → Theme → Notizen → Divider → Einstellungen → Version */}
      <div className="mt-auto flex flex-col gap-0.5">
        {bottomItems.map(renderItem)}

        {/* Theme-Toggle */}
        <button
          onClick={() => setTheme({ mode: isDark ? "light" : "dark" })}
          className="flex items-center justify-center w-full h-9 rounded-none text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay border-l-2 border-transparent transition-all duration-150"
          aria-label={isDark ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
          title={isDark ? "Light Mode" : "Dark Mode"}
        >
          {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
        </button>

        {/* Notizen — Panel passt sich an variant="sidebar" an (icon-only) */}
        <NotesPanel variant="sidebar" />

        {/* Trenner zur visuellen Abgrenzung */}
        <div className="mx-2 my-1 border-t border-neutral-700" />

        {/* Einstellungen */}
        <button
          onClick={() => setActiveTab("settings")}
          className={`
            relative flex items-center justify-center w-full h-9 rounded-none
            transition-all duration-150
            ${settingsActive
              ? "text-accent bg-accent-a10 border-l-2 border-accent"
              : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay border-l-2 border-transparent"
            }
          `}
          aria-label="Einstellungen"
          title="Einstellungen"
        >
          <SettingsIcon className="w-4 h-4 shrink-0" />
          {badges.settings != null && badges.settings > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-error text-white text-[8px] font-bold px-0.5">
              {badges.settings > 99 ? "99+" : badges.settings}
            </span>
          )}
        </button>

        {/* Version — ganz klein, ganz unten. Click = Update-Check mit Toast-Feedback. */}
        <button
          onClick={handleVersionClick}
          className="relative flex items-center justify-center w-full px-1 py-1 text-[9px] font-medium tracking-tight text-neutral-600 hover:text-accent transition-colors"
          title={versionTooltip}
        >
          v{version}
          {/* Status-Dot bei anstehender Aktion (Update verfuegbar oder bereit zum Restart) */}
          {(status === "available" || status === "ready") && (
            <span
              className={`absolute top-0.5 right-1 w-1.5 h-1.5 rounded-full ${
                status === "ready" ? "bg-success" : "bg-accent"
              }`}
              aria-label={status === "ready" ? "Update installationsbereit" : "Update verfügbar"}
            />
          )}
        </button>
      </div>
    </nav>
  );
}
