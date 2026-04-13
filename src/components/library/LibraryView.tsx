import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  RefreshCw,
  Globe,
  FolderOpen,
  Zap,
  Bot,
  Webhook,
  Settings,
  FileText,
  Brain,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import {
  useConfigDiscoveryStore,
  selectOpenDetail,
  type ScopeConfig,
  type ConfigScope,
  type DiscoveredSkill,
  type DiscoveredAgent,
  type DiscoveredHook,
  type DiscoveredMemoryFile,
} from "../../store/configDiscoveryStore";
import { LibraryDetailModal } from "./LibraryDetailModal";
import { SkillArgBadge } from "./SkillArgBadge";

// ── Content Preview Panel ────────────────────────────────────────────

function ContentPreview({
  title,
  contentKey,
  loader,
}: {
  title: string;
  contentKey: string;
  loader: () => Promise<string>;
}) {
  const loadContent = useConfigDiscoveryStore((s) => s.loadContent);
  const cached = useConfigDiscoveryStore((s) => s.contentCache[contentKey]);
  const isLoading = useConfigDiscoveryStore((s) => s.contentLoading[contentKey]);
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (cached !== undefined) {
      setContent(cached);
      return;
    }
    let cancelled = false;
    loadContent(contentKey, loader).then((c) => {
      if (!cancelled) setContent(c);
    });
    return () => {
      cancelled = true;
    };
  }, [contentKey, cached, loadContent, loader]);

  if (isLoading) {
    return (
      <div className="text-xs text-neutral-500 py-4 text-center">Lade...</div>
    );
  }

  const text = content ?? cached ?? "";

  if (!text) {
    return (
      <div className="text-xs text-neutral-500 py-4 text-center">
        Kein Inhalt
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
        {title}
      </div>
      <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono leading-relaxed bg-surface-base rounded p-3 max-h-[40vh] overflow-auto border border-neutral-700">
        {text}
      </pre>
    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  count,
  defaultOpen = false,
  children,
}: {
  icon: typeof Zap;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (count === 0) return null;

  return (
    <div className="border-b border-neutral-800 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-hover-overlay transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-neutral-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-neutral-500 shrink-0" />
        )}
        <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="text-xs font-medium text-neutral-300">{title}</span>
        <span className="text-[10px] text-neutral-500 ml-auto">{count}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// ── Skill Card ───────────────────────────────────────────────────────

function SkillCard({ skill }: { skill: DiscoveredSkill }) {
  const openDetail = useConfigDiscoveryStore(selectOpenDetail);

  return (
    <div className="rounded border border-neutral-700 bg-surface-raised mb-1.5">
      <button
        onClick={() => openDetail({ category: "skills", item: skill })}
        className="w-full text-left px-3 py-2 hover:bg-hover-overlay transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-3 h-3 text-accent shrink-0" />
          <span className="text-xs font-semibold text-neutral-200">
            {skill.name}
          </span>
          {skill.hasReference && (
            <span className="text-[10px] px-1 rounded bg-blue-500/15 text-blue-400">
              ref/
            </span>
          )}
        </div>
        {skill.description && (
          <p className="text-[11px] text-neutral-400 mt-0.5 ml-5 line-clamp-2">
            {skill.description}
          </p>
        )}
        {skill.args.length > 0 && (
          <div className="flex gap-1 mt-1 ml-5 flex-wrap">
            {skill.args.map((a) => (
              <SkillArgBadge key={a.name} arg={a} />
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

// ── Agent Card ───────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: DiscoveredAgent }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 rounded border border-neutral-700 bg-surface-raised mb-1.5">
      <Bot className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-neutral-200">
            {agent.name}
          </span>
          <span className="text-[10px] px-1.5 rounded-full bg-purple-500/15 text-purple-400 ml-auto shrink-0">
            {agent.model}
          </span>
        </div>
        {agent.description && (
          <p className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">
            {agent.description}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Hook Card ────────────────────────────────────────────────────────

function HookCard({ hook }: { hook: DiscoveredHook }) {
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 rounded border border-neutral-700 bg-surface-raised mb-1.5">
      <Webhook className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-neutral-200">
            {hook.event}
          </span>
          {hook.matcher && (
            <span className="text-[10px] px-1 rounded bg-neutral-800 text-neutral-500 truncate max-w-[200px]">
              {hook.matcher}
            </span>
          )}
        </div>
        <code className="text-[11px] text-neutral-400 block mt-0.5 truncate font-mono">
          {hook.command}
        </code>
      </div>
      <span className="text-[10px] text-neutral-600 shrink-0">{hook.source}</span>
    </div>
  );
}

// ── Memory File List ─────────────────────────────────────────────────

function MemoryFileCard({ file }: { file: DiscoveredMemoryFile }) {
  const [expanded, setExpanded] = useState(false);
  const contentKey = `global:memory:${file.relativePath}`;
  const loader = useCallback(
    () =>
      invoke<string>("read_user_claude_file", {
        relativePath: file.relativePath,
      }),
    [file.relativePath],
  );

  return (
    <div className="rounded border border-neutral-700 bg-surface-raised mb-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-1.5 hover:bg-hover-overlay transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-3 h-3 text-green-400 shrink-0" />
          <span className="text-xs text-neutral-200 truncate">{file.name}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          <ContentPreview
            title={file.name}
            contentKey={contentKey}
            loader={loader}
          />
        </div>
      )}
    </div>
  );
}

// ── Scope Panel ──────────────────────────────────────────────────────

function ScopePanel({
  scope,
  config,
  label,
  icon: Icon,
}: {
  scope: ConfigScope;
  config: ScopeConfig;
  label: string;
  icon: typeof Globe;
}) {
  const [open, setOpen] = useState(true);

  const hasContent =
    config.skills.length > 0 ||
    config.agents.length > 0 ||
    config.hooks.length > 0 ||
    config.settingsRaw.length > 0 ||
    config.claudeMd.length > 0 ||
    config.memoryFiles.length > 0;

  const settingsContentKey = `${scope}:settings`;
  const settingsLoader = useCallback(async () => config.settingsRaw, [config.settingsRaw]);

  const claudeMdContentKey = `${scope}:claude-md`;
  const claudeMdLoader = useCallback(async () => config.claudeMd, [config.claudeMd]);

  return (
    <div className="border border-neutral-700 rounded-lg overflow-hidden bg-surface-raised">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-hover-overlay transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        )}
        <Icon className="w-4 h-4 text-accent shrink-0" />
        <span className="text-sm font-semibold text-neutral-200">{label}</span>
        {!hasContent && (
          <span className="text-[10px] text-neutral-600 ml-auto">
            Keine Konfiguration gefunden
          </span>
        )}
      </button>

      {open && hasContent && (
        <div className="border-t border-neutral-700">
          <Section
            icon={Zap}
            title="Skills"
            count={config.skills.length}
            defaultOpen
          >
            {config.skills.map((s) => (
              <SkillCard key={`${s.scope}-${s.dirName}`} skill={s} />
            ))}
          </Section>

          <Section
            icon={Bot}
            title="Agents"
            count={config.agents.length}
            defaultOpen
          >
            {config.agents.map((a) => (
              <AgentCard key={`${a.scope}-${a.name}`} agent={a} />
            ))}
          </Section>

          <Section
            icon={Webhook}
            title="Hooks"
            count={config.hooks.length}
            defaultOpen
          >
            {config.hooks.map((h, i) => (
              <HookCard key={`${h.scope}-${h.event}-${i}`} hook={h} />
            ))}
          </Section>

          {config.settingsRaw && (
            <Section icon={Settings} title="Settings" count={1}>
              <ContentPreview
                title="settings.json"
                contentKey={settingsContentKey}
                loader={settingsLoader}
              />
            </Section>
          )}

          {config.claudeMd && (
            <Section icon={FileText} title="CLAUDE.md" count={1}>
              <ContentPreview
                title="CLAUDE.md"
                contentKey={claudeMdContentKey}
                loader={claudeMdLoader}
              />
            </Section>
          )}

          {config.memoryFiles.length > 0 && (
            <Section
              icon={Brain}
              title="Memory"
              count={config.memoryFiles.length}
            >
              {config.memoryFiles.map((f) => (
                <MemoryFileCard key={f.relativePath} file={f} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main View ────────────────────────────────────────────────────────

export function LibraryView() {
  const activeSession = useSessionStore(selectActiveSession);
  const folder = activeSession?.folder ?? "";

  const globalConfig = useConfigDiscoveryStore((s) => s.globalConfig);
  const projectConfig = useConfigDiscoveryStore((s) => s.projectConfig);
  const favoriteConfigs = useConfigDiscoveryStore((s) => s.favoriteConfigs);
  const loading = useConfigDiscoveryStore((s) => s.loading);
  const discoverGlobal = useConfigDiscoveryStore((s) => s.discoverGlobal);
  const discoverProject = useConfigDiscoveryStore((s) => s.discoverProject);
  const discoverFavorites = useConfigDiscoveryStore((s) => s.discoverFavorites);

  const favorites = useSettingsStore((s) => s.favorites);

  useEffect(() => {
    discoverGlobal();
  }, [discoverGlobal]);

  useEffect(() => {
    if (folder) {
      discoverProject(folder);
    }
  }, [folder, discoverProject]);

  // Discover configs for all favorite projects (excluding the active session folder)
  useEffect(() => {
    const favPaths = favorites
      .map((f) => f.path)
      .filter((p) => p !== folder);
    if (favPaths.length > 0) {
      discoverFavorites(favPaths);
    }
  }, [favorites, folder, discoverFavorites]);

  const handleRefresh = useCallback(() => {
    discoverGlobal();
    if (folder) {
      discoverProject(folder);
    }
    const favPaths = favorites
      .map((f) => f.path)
      .filter((p) => p !== folder);
    if (favPaths.length > 0) {
      discoverFavorites(favPaths);
    }
  }, [discoverGlobal, discoverProject, discoverFavorites, folder, favorites]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 bg-surface-raised shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-accent" />
          <h1 className="text-sm font-semibold text-neutral-200">
            Library
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {folder && (
            <span className="text-xs text-neutral-500 truncate max-w-[300px]">
              {folder}
            </span>
          )}
          <button
            onClick={handleRefresh}
            className={`p-1 text-neutral-500 hover:text-neutral-300 transition-colors ${
              loading ? "animate-spin" : ""
            }`}
            title="Neu laden"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Detail modal — mounts here, reads state from store */}
      <LibraryDetailModal />

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
        {loading && !globalConfig && !projectConfig ? (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            Scanne Konfigurationen...
          </div>
        ) : (
          <>
            {/* Global scope */}
            {globalConfig && (
              <ScopePanel
                scope="global"
                config={globalConfig}
                label="Global (~/.claude/)"
                icon={Globe}
              />
            )}

            {/* Active session project scope */}
            {projectConfig && folder && (
              <ScopePanel
                scope="project"
                config={projectConfig}
                label={`Projekt (${folder.split(/[\\/]/).pop() ?? folder})`}
                icon={FolderOpen}
              />
            )}

            {/* Favorite projects */}
            {favorites
              .filter((f) => f.path !== folder)
              .map((fav) => {
                const config = favoriteConfigs[fav.path];
                if (!config) return null;
                return (
                  <ScopePanel
                    key={fav.id}
                    scope="project"
                    config={config}
                    label={`${fav.label} (${fav.path.split(/[\\/]/).pop() ?? fav.path})`}
                    icon={FolderOpen}
                  />
                );
              })}

            {!globalConfig && !projectConfig && Object.keys(favoriteConfigs).length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-neutral-500">
                <BookOpen className="w-10 h-10 text-neutral-600" />
                <span className="text-sm">Keine Konfigurationen gefunden</span>
                <span className="text-xs text-neutral-600">
                  ~/.claude/ oder .claude/ im Projekt
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
