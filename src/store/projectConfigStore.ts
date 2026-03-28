import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./settingsStore";

// ── Types ──────────────────────────────────────────────────────────────

interface SkillDirEntry {
  dir_name: string;
  content: string;
  has_reference_dir: boolean;
}

interface HookEntry {
  matcher?: string;
  command: string;
}

export interface ProjectConfig {
  path: string;
  label: string;
  hasClaude: boolean;
  skillCount: number;
  hookCount: number;
  skills: string[];
  hooks: string[];
  error?: string;
}

interface ProjectConfigState {
  configs: Record<string, ProjectConfig>;
  globalConfig: ProjectConfig | null;
  loading: boolean;
  lastScanned: number | null;

  scanAllFavorites: () => Promise<void>;
  scanProject: (path: string, label: string) => Promise<ProjectConfig>;
}

// ── Helpers ────────────────────────────────────────────────────────────

const CACHE_TTL = 60_000; // 60 seconds

function extractHookInfo(raw: string): { hooks: string[]; hookCount: number } {
  try {
    const parsed = JSON.parse(raw);
    const hooksObj = parsed?.hooks;
    if (!hooksObj || typeof hooksObj !== "object") return { hooks: [], hookCount: 0 };

    const hookNames: string[] = [];
    for (const [eventName, hookList] of Object.entries(hooksObj)) {
      const entries = hookList as HookEntry[];
      if (Array.isArray(entries) && entries.length > 0) {
        hookNames.push(eventName);
      }
    }
    return { hooks: hookNames, hookCount: hookNames.length };
  } catch {
    return { hooks: [], hookCount: 0 };
  }
}

// ── Store ──────────────────────────────────────────────────────────────

export const useProjectConfigStore = create<ProjectConfigState>((set, get) => ({
  configs: {},
  globalConfig: null,
  loading: false,
  lastScanned: null,

  scanProject: async (path: string, label: string): Promise<ProjectConfig> => {
    const config: ProjectConfig = {
      path,
      label,
      hasClaude: false,
      skillCount: 0,
      hookCount: 0,
      skills: [],
      hooks: [],
    };

    const [claudeResult, skillsResult, hooksResult] = await Promise.allSettled([
      invoke<string>("read_project_file", { folder: path, relativePath: "CLAUDE.md" }),
      invoke<SkillDirEntry[]>("list_skill_dirs", { folder: path }),
      invoke<string>("read_project_file", { folder: path, relativePath: ".claude/settings.json" }),
    ]);

    if (claudeResult.status === "fulfilled" && claudeResult.value) {
      config.hasClaude = true;
    }

    if (skillsResult.status === "fulfilled") {
      config.skills = skillsResult.value.map((d) => d.dir_name);
      config.skillCount = config.skills.length;
    }

    if (hooksResult.status === "fulfilled" && hooksResult.value) {
      const { hooks, hookCount } = extractHookInfo(hooksResult.value);
      config.hooks = hooks;
      config.hookCount = hookCount;
    }

    // If all three failed, the path is likely invalid
    if (
      claudeResult.status === "rejected" &&
      skillsResult.status === "rejected" &&
      hooksResult.status === "rejected"
    ) {
      config.error = "Pfad nicht gefunden";
    }

    return config;
  },

  scanAllFavorites: async () => {
    const { lastScanned, loading } = get();
    if (loading) return;
    if (lastScanned && Date.now() - lastScanned < CACHE_TTL) return;

    set({ loading: true });

    const favorites = useSettingsStore.getState().favorites;
    const configs: Record<string, ProjectConfig> = {};

    // Scan all favorite projects in parallel
    const results = await Promise.allSettled(
      favorites.map((fav) => get().scanProject(fav.path, fav.label))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        configs[result.value.path] = result.value;
      }
    }

    // Scan global ~/.claude/ for hooks
    let globalConfig: ProjectConfig | null = null;
    try {
      const raw = await invoke<string>("read_user_claude_file", {
        relativePath: "settings.json",
      });
      if (raw) {
        const { hooks, hookCount } = extractHookInfo(raw);
        if (hookCount > 0) {
          globalConfig = {
            path: "~/.claude",
            label: "Global",
            hasClaude: false,
            skillCount: 0,
            hookCount,
            skills: [],
            hooks,
          };
        }
      }
    } catch {
      // Global settings not available
    }

    set({
      configs,
      globalConfig,
      loading: false,
      lastScanned: Date.now(),
    });
  },
}));
