import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { logError } from "../utils/errorLogger";
import { parseSkillFrontmatter, type ParsedSkill } from "../utils/parseSkillFrontmatter";

// ── Types ──────────────────────────────────────────────────────────────

export type ConfigScope = "global" | "project";

export type LibraryCategory =
  | "skills"
  | "agents"
  | "hooks"
  | "settings"
  | "claudeMd"
  | "memory"
  | "commands"
  | "mcp"
  | "rules"
  | "knowledge";

export type KnowledgeCategory = "security" | "templates" | "general";

export interface DiscoveredSkill {
  name: string;
  dirName: string;
  description: string;
  args: { name: string; description: string; required: boolean }[];
  hasReference: boolean;
  scope: ConfigScope;
  body: string;
}

export interface DiscoveredAgent {
  name: string;
  model: string;
  description: string;
  scope: ConfigScope;
}

export interface DiscoveredHook {
  event: string;
  matcher?: string;
  command: string;
  scope: ConfigScope;
  source: string; // e.g. "settings.json", "settings.local.json"
}

export interface DiscoveredMemoryFile {
  name: string;
  relativePath: string;
}

/** A user-global rule file from ~/.claude/rules/ (code-quality, git-safety, ...). */
export interface DiscoveredRule {
  /** Filename minus .md extension — e.g. "code-quality" */
  name: string;
  /** Original filename including extension — e.g. "code-quality.md" */
  filename: string;
  /** Glob pattern from the "# Glob: ..." header line, if present. Null = applies globally. */
  glob: string | null;
  /** File content excluding the glob header (so the body renders cleanly). */
  body: string;
}

/** A user-global knowledge entry from ~/.claude/knowledge/ (templates, security checklists, configs). */
export interface DiscoveredKnowledge {
  /** Filename minus extension — e.g. "frontend-xss" */
  name: string;
  /** Original filename — e.g. "frontend-xss.md", "github-labels.yml" */
  filename: string;
  /** Subdirectory category. "general" = top-level, "security"/"templates" = subdir-derived. */
  category: KnowledgeCategory;
  /** Relative path from ~/.claude/ root — useful for refresh / reload. */
  relativePath: string;
  /** Raw file content (rendered as markdown for .md, monospace for .yml). */
  body: string;
  /** "md" or "yml" — drives copy-paste rendering (no markdown processing for YAML). */
  fileType: "md" | "yml";
}

export type SelectedDetail =
  | { category: "skills"; item: DiscoveredSkill }
  | { category: "agents"; item: DiscoveredAgent }
  | { category: "hooks"; item: DiscoveredHook }
  | { category: "memory"; item: DiscoveredMemoryFile }
  | { category: "rules"; item: DiscoveredRule }
  | { category: "knowledge"; item: DiscoveredKnowledge };

export interface ScopeConfig {
  skills: DiscoveredSkill[];
  agents: DiscoveredAgent[];
  hooks: DiscoveredHook[];
  settingsRaw: string;
  claudeMd: string;
  memoryFiles: DiscoveredMemoryFile[];
  /** Global-only: ~/.claude/rules/*.md. Empty for project-scope. */
  rules: DiscoveredRule[];
  /** Global-only: ~/.claude/knowledge/**\/*.{md,yml}. Empty for project-scope. */
  knowledge: DiscoveredKnowledge[];
}

// ── Store ──────────────────────────────────────────────────────────────

interface ConfigDiscoveryState {
  globalConfig: ScopeConfig | null;
  projectConfig: ScopeConfig | null;
  projectPath: string | null;
  /** Configs for favorite projects, keyed by folder path */
  favoriteConfigs: Record<string, ScopeConfig>;
  /** Paths currently being scanned */
  favoritesLoading: Record<string, boolean>;
  loading: boolean;
  error: string | null;

  /** Content cache for lazy-loaded files, keyed by "scope:type:identifier" */
  contentCache: Record<string, string>;
  contentLoading: Record<string, boolean>;

  /** Detail modal state */
  selectedDetail: SelectedDetail | null;

  discoverGlobal: () => Promise<void>;
  discoverProject: (folder: string) => Promise<void>;
  discoverFavorites: (folders: string[]) => Promise<void>;
  loadContent: (key: string, loader: () => Promise<string>) => Promise<string>;
  clearProject: () => void;
  openDetail: (detail: SelectedDetail) => void;
  closeDetail: () => void;
}

const EMPTY_SCOPE: ScopeConfig = {
  skills: [],
  agents: [],
  hooks: [],
  settingsRaw: "",
  claudeMd: "",
  memoryFiles: [],
  rules: [],
  knowledge: [],
};

// ── Helpers ────────────────────────────────────────────────────────────

interface SkillDirEntry {
  dir_name: string;
  content: string;
  has_reference_dir: boolean;
}

interface HookEntry {
  matcher?: string;
  command: string;
}

function parseSkillEntries(
  dirs: SkillDirEntry[],
  scope: ConfigScope,
): DiscoveredSkill[] {
  return dirs.map((dir) => {
    const fallbackName = dir.dir_name.replace(/\.md$/, "");
    const parsed: ParsedSkill = dir.content
      ? parseSkillFrontmatter(dir.content)
      : { metadata: { name: fallbackName, description: "", userInvokable: false, args: [] }, body: "" };
    return {
      name: parsed.metadata.name && parsed.metadata.name !== "Unknown" ? parsed.metadata.name : fallbackName,
      dirName: dir.dir_name,
      description: parsed.metadata.description,
      args: parsed.metadata.args,
      hasReference: dir.has_reference_dir,
      scope,
      body: parsed.body,
    };
  });
}

function parseAgentsFromSettings(raw: string, scope: ConfigScope): DiscoveredAgent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const agents = parsed?.agents;
    if (!agents || typeof agents !== "object") return [];
    return Object.entries(agents).map(([name, config]) => ({
      name,
      model: (config as { model?: string })?.model ?? "unknown",
      description: (config as { description?: string })?.description ?? "",
      scope,
    }));
  } catch {
    return [];
  }
}

/** Parse agent frontmatter from .md files in ~/.claude/agents/ */
function parseAgentMdFrontmatter(
  fileName: string,
  content: string,
  scope: ConfigScope,
): DiscoveredAgent {
  const defaults: DiscoveredAgent = {
    name: fileName.replace(/\.md$/, ""),
    model: "unknown",
    description: "",
    scope,
  };
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return defaults;

  const fm = match[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const modelMatch = fm.match(/^model:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim() ?? defaults.name,
    model: modelMatch?.[1]?.trim() ?? defaults.model,
    description: descMatch?.[1]?.trim() ?? defaults.description,
    scope,
  };
}

function parseHooksFromSettings(
  raw: string,
  scope: ConfigScope,
  source: string,
): DiscoveredHook[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const hooksObj = parsed?.hooks;
    if (!hooksObj || typeof hooksObj !== "object") return [];

    const result: DiscoveredHook[] = [];
    for (const [eventName, hookList] of Object.entries(hooksObj)) {
      const entries = hookList as HookEntry[];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        result.push({
          event: eventName,
          matcher: entry.matcher,
          command: entry.command,
          scope,
          source,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

// ── Store Implementation ──────────────────────────────────────────────

export const useConfigDiscoveryStore = create<ConfigDiscoveryState>((set, get) => ({
  globalConfig: null,
  projectConfig: null,
  projectPath: null,
  favoriteConfigs: {},
  favoritesLoading: {},
  loading: false,
  error: null,
  contentCache: {},
  contentLoading: {},
  selectedDetail: null,

  discoverGlobal: async () => {
    set({ loading: true, error: null });
    try {
      const config: ScopeConfig = { ...EMPTY_SCOPE };

      // Read global CLAUDE.md, settings.json, commands/, skills/, agents/
      const [claudeMdResult, settingsResult, commandsDirResult, skillsDirResult, agentsDirResult] =
        await Promise.allSettled([
          invoke<string>("read_user_claude_file", { relativePath: "CLAUDE.md" }),
          invoke<string>("read_user_claude_file", { relativePath: "settings.json" }),
          invoke<string[]>("list_user_claude_dir", { relativePath: "commands" }),
          invoke<string[]>("list_user_claude_dir", { relativePath: "skills" }),
          invoke<string[]>("list_user_claude_dir", { relativePath: "agents" }),
        ]);

      // Global CLAUDE.md
      if (claudeMdResult.status === "fulfilled" && claudeMdResult.value) {
        config.claudeMd = claudeMdResult.value;
      }

      // Parse settings
      if (settingsResult.status === "fulfilled" && settingsResult.value) {
        config.settingsRaw = settingsResult.value;
        config.agents = parseAgentsFromSettings(settingsResult.value, "global");
        config.hooks = parseHooksFromSettings(settingsResult.value, "global", "settings.json");
      }

      // Global commands + skills — entries can be directories (with SKILL.md) or plain .md files
      const allSkillEntries: SkillDirEntry[] = [];

      // Scan ~/.claude/commands/
      if (commandsDirResult.status === "fulfilled" && commandsDirResult.value.length > 0) {
        for (const dirName of commandsDirResult.value) {
          let content = "";
          try {
            // Plain .md file: read directly. Directory: try SKILL.md inside.
            const relativePath = dirName.endsWith(".md")
              ? `commands/${dirName}`
              : `commands/${dirName}/SKILL.md`;
            content = await invoke<string>("read_user_claude_file", { relativePath });
          } catch {
            // Skill may not have content
          }
          allSkillEntries.push({ dir_name: dirName, content, has_reference_dir: false });
        }
      }

      // Scan ~/.claude/skills/
      if (skillsDirResult.status === "fulfilled" && skillsDirResult.value.length > 0) {
        const existingNames = new Set(allSkillEntries.map((e) => e.dir_name));
        for (const dirName of skillsDirResult.value) {
          if (existingNames.has(dirName)) continue; // avoid duplicates
          let content = "";
          try {
            const relativePath = dirName.endsWith(".md")
              ? `skills/${dirName}`
              : `skills/${dirName}/SKILL.md`;
            content = await invoke<string>("read_user_claude_file", { relativePath });
          } catch {
            // Skill may not have SKILL.md
          }
          allSkillEntries.push({ dir_name: dirName, content, has_reference_dir: false });
        }
      }

      if (allSkillEntries.length > 0) {
        config.skills = parseSkillEntries(allSkillEntries, "global");
      }

      // Global agents from ~/.claude/agents/*.md
      if (agentsDirResult.status === "fulfilled" && agentsDirResult.value.length > 0) {
        const mdAgents: DiscoveredAgent[] = [];
        for (const fileName of agentsDirResult.value) {
          if (!fileName.endsWith(".md")) continue;
          try {
            const content = await invoke<string>("read_user_claude_file", {
              relativePath: `agents/${fileName}`,
            });
            mdAgents.push(parseAgentMdFrontmatter(fileName, content, "global"));
          } catch {
            // Skip unreadable agent files
          }
        }
        // Merge: settings.json agents + .md file agents (no duplicates)
        const existingAgentNames = new Set(config.agents.map((a) => a.name));
        config.agents = [
          ...config.agents,
          ...mdAgents.filter((a) => !existingAgentNames.has(a.name)),
        ];
      }

      // Discover rules (~/.claude/rules/*.md) — applies user-globally to all
      // Claude sessions. Each file may declare a "# Glob: ..." header that
      // restricts when it applies (e.g. only to *.ts files).
      try {
        const ruleEntries = await invoke<string[]>("list_user_claude_dir", {
          relativePath: "rules",
        });
        const rules: DiscoveredRule[] = [];
        for (const fileName of ruleEntries) {
          if (!fileName.endsWith(".md")) continue;
          try {
            const content = await invoke<string>("read_user_claude_file", {
              relativePath: `rules/${fileName}`,
            });
            const globMatch = content.match(/^#\s*Glob:\s*(.+)$/m);
            const body = globMatch
              ? content.replace(globMatch[0], "").trim()
              : content;
            rules.push({
              name: fileName.replace(/\.md$/, ""),
              filename: fileName,
              glob: globMatch?.[1]?.trim() ?? null,
              body,
            });
          } catch {
            // Skip unreadable rule file
          }
        }
        config.rules = rules;
      } catch {
        // No rules dir — leave config.rules as []
      }

      // Discover knowledge entries (~/.claude/knowledge/) — recursive into
      // security/ + templates/ subdirs. Top-level files default to "general".
      try {
        const topLevelEntries = await invoke<string[]>("list_user_claude_dir", {
          relativePath: "knowledge",
        });
        const knowledge: DiscoveredKnowledge[] = [];

        const pushEntry = async (
          subPath: string,
          fileName: string,
          category: KnowledgeCategory,
        ) => {
          if (!fileName.endsWith(".md") && !fileName.endsWith(".yml")) return;
          try {
            const relativePath = subPath
              ? `knowledge/${subPath}/${fileName}`
              : `knowledge/${fileName}`;
            const content = await invoke<string>("read_user_claude_file", {
              relativePath,
            });
            knowledge.push({
              name: fileName.replace(/\.(md|yml)$/, ""),
              filename: fileName,
              category,
              relativePath,
              body: content,
              fileType: fileName.endsWith(".yml") ? "yml" : "md",
            });
          } catch {
            // Skip unreadable
          }
        };

        for (const entry of topLevelEntries) {
          await pushEntry("", entry, "general");
        }
        for (const subDir of ["security", "templates"] as const) {
          try {
            const subEntries = await invoke<string[]>("list_user_claude_dir", {
              relativePath: `knowledge/${subDir}`,
            });
            for (const entry of subEntries) {
              await pushEntry(subDir, entry, subDir);
            }
          } catch {
            // Subdir missing — fine
          }
        }
        config.knowledge = knowledge;
      } catch {
        // No knowledge dir — leave config.knowledge as []
      }

      // Discover memory files in projects dir
      // ~/.claude/projects/ contains per-project memory dirs
      try {
        const projectDirs = await invoke<string[]>("list_user_claude_dir", {
          relativePath: "projects",
        });
        const memFiles: DiscoveredMemoryFile[] = [];
        for (const dir of projectDirs) {
          // Each project dir may have memory/ subdir and MEMORY.md
          try {
            const memoryDir = await invoke<string[]>("list_user_claude_dir", {
              relativePath: `projects/${dir}/memory`,
            });
            for (const file of memoryDir) {
              memFiles.push({
                name: `${dir}/${file}`,
                relativePath: `projects/${dir}/memory/${file}`,
              });
            }
          } catch {
            // No memory dir
          }
        }
        config.memoryFiles = memFiles;
      } catch {
        // No projects dir
      }

      set({ globalConfig: config, loading: false });
    } catch (err) {
      logError("configDiscoveryStore.discoverGlobal", err);
      set({ error: String(err), loading: false });
    }
  },

  discoverProject: async (folder: string) => {
    if (!folder) return;
    set({ loading: true, error: null, projectPath: folder });
    try {
      const config: ScopeConfig = { ...EMPTY_SCOPE };

      const [claudeMdResult, skillsResult, settingsResult, localSettingsResult] =
        await Promise.allSettled([
          invoke<string>("read_project_file", { folder, relativePath: "CLAUDE.md" }),
          invoke<SkillDirEntry[]>("list_skill_dirs", { folder }),
          invoke<string>("read_project_file", { folder, relativePath: ".claude/settings.json" }),
          invoke<string>("read_project_file", { folder, relativePath: ".claude/settings.local.json" }),
        ]);

      if (claudeMdResult.status === "fulfilled") {
        config.claudeMd = claudeMdResult.value;
      }

      if (skillsResult.status === "fulfilled") {
        config.skills = parseSkillEntries(skillsResult.value, "project");
      }

      if (settingsResult.status === "fulfilled" && settingsResult.value) {
        config.settingsRaw = settingsResult.value;
        config.agents = parseAgentsFromSettings(settingsResult.value, "project");
        config.hooks = parseHooksFromSettings(settingsResult.value, "project", "settings.json");
      }

      // Also parse local settings hooks
      if (localSettingsResult.status === "fulfilled" && localSettingsResult.value) {
        const localHooks = parseHooksFromSettings(
          localSettingsResult.value,
          "project",
          "settings.local.json",
        );
        config.hooks = [...config.hooks, ...localHooks];

        // Merge agents from local settings
        const localAgents = parseAgentsFromSettings(localSettingsResult.value, "project");
        config.agents = [...config.agents, ...localAgents];
      }

      set({ projectConfig: config, loading: false });
    } catch (err) {
      logError("configDiscoveryStore.discoverProject", err);
      set({ error: String(err), loading: false });
    }
  },

  discoverFavorites: async (folders: string[]) => {
    if (folders.length === 0) return;

    // Mark all as loading
    const loadingMap: Record<string, boolean> = {};
    for (const f of folders) loadingMap[f] = true;
    set({ favoritesLoading: loadingMap });

    const results: Record<string, ScopeConfig> = {};

    await Promise.allSettled(
      folders.map(async (folder) => {
        try {
          const config: ScopeConfig = { ...EMPTY_SCOPE, skills: [], agents: [], hooks: [], memoryFiles: [] };

          const [claudeMdResult, skillsResult, settingsResult, localSettingsResult] =
            await Promise.allSettled([
              invoke<string>("read_project_file", { folder, relativePath: "CLAUDE.md" }),
              invoke<SkillDirEntry[]>("list_skill_dirs", { folder }),
              invoke<string>("read_project_file", { folder, relativePath: ".claude/settings.json" }),
              invoke<string>("read_project_file", { folder, relativePath: ".claude/settings.local.json" }),
            ]);

          if (claudeMdResult.status === "fulfilled") {
            config.claudeMd = claudeMdResult.value;
          }
          if (skillsResult.status === "fulfilled") {
            config.skills = parseSkillEntries(skillsResult.value, "project");
          }
          if (settingsResult.status === "fulfilled" && settingsResult.value) {
            config.settingsRaw = settingsResult.value;
            config.agents = parseAgentsFromSettings(settingsResult.value, "project");
            config.hooks = parseHooksFromSettings(settingsResult.value, "project", "settings.json");
          }
          if (localSettingsResult.status === "fulfilled" && localSettingsResult.value) {
            const localHooks = parseHooksFromSettings(localSettingsResult.value, "project", "settings.local.json");
            config.hooks = [...config.hooks, ...localHooks];
            const localAgents = parseAgentsFromSettings(localSettingsResult.value, "project");
            config.agents = [...config.agents, ...localAgents];
          }

          results[folder] = config;
        } catch (err) {
          logError(`configDiscoveryStore.discoverFavorite(${folder})`, err);
        }
      }),
    );

    set({ favoriteConfigs: results, favoritesLoading: {} });
  },

  loadContent: async (key: string, loader: () => Promise<string>) => {
    const cached = get().contentCache[key];
    if (cached !== undefined) return cached;

    const isLoading = get().contentLoading[key];
    if (isLoading) return "";

    set((s) => ({ contentLoading: { ...s.contentLoading, [key]: true } }));

    try {
      const content = await loader();
      set((s) => ({
        contentCache: { ...s.contentCache, [key]: content },
        contentLoading: { ...s.contentLoading, [key]: false },
      }));
      return content;
    } catch (err) {
      logError("configDiscoveryStore.loadContent", err);
      set((s) => ({
        contentCache: { ...s.contentCache, [key]: `Fehler beim Laden: ${err}` },
        contentLoading: { ...s.contentLoading, [key]: false },
      }));
      return "";
    }
  },

  clearProject: () => {
    set({ projectConfig: null, projectPath: null, contentCache: {}, contentLoading: {} });
  },

  openDetail: (detail: SelectedDetail) => set({ selectedDetail: detail }),
  closeDetail: () => set({ selectedDetail: null }),
}));

// ── Selectors ──────────────────────────────────────────────────────────

export const selectGlobalConfig = (s: ConfigDiscoveryState) => s.globalConfig;
export const selectProjectConfig = (s: ConfigDiscoveryState) => s.projectConfig;
export const selectFavoriteConfigs = (s: ConfigDiscoveryState) => s.favoriteConfigs;
export const selectDiscoveryLoading = (s: ConfigDiscoveryState) => s.loading;
export const selectContentCache = (s: ConfigDiscoveryState) => s.contentCache;
export const selectContentLoading = (s: ConfigDiscoveryState) => s.contentLoading;
export const selectSelectedDetail = (s: ConfigDiscoveryState) => s.selectedDetail;
export const selectOpenDetail = (s: ConfigDiscoveryState) => s.openDetail;
export const selectCloseDetail = (s: ConfigDiscoveryState) => s.closeDetail;
