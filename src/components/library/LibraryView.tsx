import { useState, useEffect } from "react";
import { BookOpen, FolderSearch, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { LibraryViewer } from "../sessions/LibraryViewer";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useProjectConfigStore, type ProjectConfig } from "../../store/projectConfigStore";
import { useSettingsStore } from "../../store/settingsStore";

// ── Project Config Card ───────────────────────────────────────────────

function ConfigCard({
  config,
  expanded,
  onToggle,
}: {
  config: ProjectConfig;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasAny = config.hasClaude || config.skillCount > 0 || config.hookCount > 0;

  return (
    <button
      onClick={onToggle}
      className="w-full text-left p-3 bg-surface-raised rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {hasAny ? (
              expanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              )
            ) : (
              <span className="w-3.5" />
            )}
            <span className="text-sm font-semibold text-neutral-200 truncate">
              {config.label}
            </span>
          </div>
          <p className="text-xs text-neutral-500 truncate mt-0.5 ml-5">
            {config.path}
          </p>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {config.error ? (
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-red-500/15 text-red-400">
              Fehler
            </span>
          ) : (
            <>
              {config.hasClaude && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-green-500/15 text-green-400">
                  CLAUDE.md
                </span>
              )}
              {config.skillCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-blue-500/15 text-blue-400">
                  {config.skillCount} Skill{config.skillCount !== 1 ? "s" : ""}
                </span>
              )}
              {config.hookCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-amber-500/15 text-amber-400">
                  {config.hookCount} Hook{config.hookCount !== 1 ? "s" : ""}
                </span>
              )}
              {!config.hasClaude && config.skillCount === 0 && config.hookCount === 0 && (
                <span className="text-[10px] text-neutral-600">Keine Konfiguration</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && hasAny && !config.error && (
        <div className="mt-2 ml-5 space-y-1.5 border-t border-neutral-700 pt-2">
          {config.skills.length > 0 && (
            <div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Skills</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {config.skills.map((s) => (
                  <span key={s} className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {config.hooks.length > 0 && (
            <div>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Hook-Events</span>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {config.hooks.map((h) => (
                  <span key={h} className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/10 text-amber-400">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {expanded && config.error && (
        <p className="mt-2 ml-5 text-xs text-red-400">{config.error}</p>
      )}
    </button>
  );
}

// ── Main View ─────────────────────────────────────────────────────────

export function LibraryView() {
  const activeSession = useSessionStore(selectActiveSession);
  const folder = activeSession?.folder;

  const favorites = useSettingsStore((s) => s.favorites);
  const configs = useProjectConfigStore((s) => s.configs);
  const globalConfig = useProjectConfigStore((s) => s.globalConfig);
  const loading = useProjectConfigStore((s) => s.loading);
  const scanAllFavorites = useProjectConfigStore((s) => s.scanAllFavorites);

  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  useEffect(() => {
    scanAllFavorites();
  }, [scanAllFavorites]);

  const toggleExpand = (path: string) => {
    setExpandedPath((prev) => (prev === path ? null : path));
  };

  const handleRescan = () => {
    // Force rescan by resetting lastScanned
    useProjectConfigStore.setState({ lastScanned: null });
    scanAllFavorites();
  };

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

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Project Configs Section */}
        <div className="shrink-0 border-b border-neutral-700">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2">
              <FolderSearch className="w-4 h-4 text-neutral-400" />
              <h2 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                Projekt-Konfigurationen
              </h2>
            </div>
            <button
              onClick={handleRescan}
              className={`p-1 text-neutral-500 hover:text-neutral-300 transition-colors ${loading ? "animate-spin" : ""}`}
              title="Neu scannen"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-4 pb-3 space-y-2">
            {loading && Object.keys(configs).length === 0 ? (
              <div className="text-xs text-neutral-500 py-2">Scanne Projekte...</div>
            ) : favorites.length === 0 ? (
              <div className="text-xs text-neutral-500 py-2">
                Keine Favoriten-Projekte vorhanden — fuege Projekte als Favoriten hinzu
              </div>
            ) : (
              <>
                {/* Global config */}
                {globalConfig && (
                  <ConfigCard
                    config={globalConfig}
                    expanded={expandedPath === globalConfig.path}
                    onToggle={() => toggleExpand(globalConfig.path)}
                  />
                )}

                {/* Per-project configs */}
                {favorites.map((fav) => {
                  const config = configs[fav.path];
                  if (!config) return null;
                  return (
                    <ConfigCard
                      key={fav.id}
                      config={config}
                      expanded={expandedPath === config.path}
                      onToggle={() => toggleExpand(config.path)}
                    />
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Library Items */}
        <div className="flex-1 min-h-0">
          <LibraryViewer folder={folder} />
        </div>
      </div>
    </div>
  );
}
