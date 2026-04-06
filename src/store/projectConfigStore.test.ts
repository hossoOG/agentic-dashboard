import { describe, it, expect, vi, beforeEach } from "vitest";
import { useProjectConfigStore } from "./projectConfigStore";
import { useSettingsStore } from "./settingsStore";

// ── Mock Tauri invoke ─────────────────────────────────────────────────

type InvokeHandler = (args?: Record<string, unknown>) => Promise<unknown>;
const invokeHandlers: Record<string, InvokeHandler> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: Record<string, unknown>) => {
    const handler = invokeHandlers[cmd];
    if (handler) return handler(args);
    return Promise.reject(new Error(`No handler for ${cmd}`));
  }),
}));

function resetStore() {
  useProjectConfigStore.setState({
    configs: {},
    globalConfig: null,
    loading: false,
    lastScanned: null,
  });
}

beforeEach(() => {
  resetStore();
  Object.keys(invokeHandlers).forEach((k) => delete invokeHandlers[k]);
});

// ── scanProject ──────────────────────────────────────────────────────

describe("scanProject", () => {
  it("detects CLAUDE.md, skills, and hooks for a project", async () => {
    invokeHandlers["read_project_file"] = async (args) => {
      const rp = (args as { relativePath: string }).relativePath;
      if (rp === "CLAUDE.md") return "# Instructions";
      if (rp === ".claude/settings.json") {
        return JSON.stringify({
          hooks: {
            PreToolUse: [{ command: "lint" }],
            PostToolUse: [{ command: "tsc" }],
          },
        });
      }
      return "";
    };
    invokeHandlers["list_skill_dirs"] = async () => [
      { dir_name: "implement", content: "", has_reference_dir: false },
      { dir_name: "deploy", content: "", has_reference_dir: true },
    ];

    const config = await useProjectConfigStore
      .getState()
      .scanProject("/test/proj", "TestProj");

    expect(config.path).toBe("/test/proj");
    expect(config.label).toBe("TestProj");
    expect(config.hasClaude).toBe(true);
    expect(config.skillCount).toBe(2);
    expect(config.skills).toEqual(["implement", "deploy"]);
    expect(config.hookCount).toBe(2);
    expect(config.hooks).toEqual(["PreToolUse", "PostToolUse"]);
    expect(config.error).toBeUndefined();
  });

  it("sets error when all three invocations fail", async () => {
    // No handlers registered → all reject
    const config = await useProjectConfigStore
      .getState()
      .scanProject("/nonexistent", "Bad");

    expect(config.error).toBe("Pfad nicht gefunden");
    expect(config.hasClaude).toBe(false);
    expect(config.skillCount).toBe(0);
    expect(config.hookCount).toBe(0);
  });

  it("handles missing hooks JSON gracefully", async () => {
    invokeHandlers["read_project_file"] = async (args) => {
      const rp = (args as { relativePath: string }).relativePath;
      if (rp === "CLAUDE.md") return "# Docs";
      if (rp === ".claude/settings.json") return "invalid json{";
      return "";
    };
    invokeHandlers["list_skill_dirs"] = async () => [];

    const config = await useProjectConfigStore
      .getState()
      .scanProject("/proj", "Proj");

    expect(config.hasClaude).toBe(true);
    expect(config.hookCount).toBe(0);
    expect(config.hooks).toEqual([]);
  });
});

// ── scanAllFavorites ─────────────────────────────────────────────────

describe("scanAllFavorites", () => {
  it("scans all favorites and populates configs", async () => {
    // Set up favorites in settingsStore
    useSettingsStore.setState({
      favorites: [
        {
          id: "fav-1",
          path: "/proj/a",
          label: "A",
          shell: "powershell",
          addedAt: 0,
          lastUsedAt: 0,
        },
      ],
    });

    invokeHandlers["read_project_file"] = async (args) => {
      const rp = (args as { relativePath: string }).relativePath;
      if (rp === "CLAUDE.md") return "# A";
      return "";
    };
    invokeHandlers["list_skill_dirs"] = async () => [];
    invokeHandlers["read_user_claude_file"] = async () => "";

    await useProjectConfigStore.getState().scanAllFavorites();

    const state = useProjectConfigStore.getState();
    expect(state.loading).toBe(false);
    expect(state.lastScanned).toBeTypeOf("number");
    expect(state.configs["/proj/a"]).toBeDefined();
    expect(state.configs["/proj/a"].hasClaude).toBe(true);
  });

  it("skips scan when cache is fresh", async () => {
    useProjectConfigStore.setState({
      lastScanned: Date.now(),
      loading: false,
    });

    useSettingsStore.setState({ favorites: [] });

    await useProjectConfigStore.getState().scanAllFavorites();

    // Should not have changed lastScanned (cache hit)
    expect(useProjectConfigStore.getState().configs).toEqual({});
  });

  it("skips scan when already loading", async () => {
    useProjectConfigStore.setState({ loading: true });

    await useProjectConfigStore.getState().scanAllFavorites();

    // loading stays true (not toggled by a second call)
    expect(useProjectConfigStore.getState().loading).toBe(true);
  });

  it("discovers global hooks from ~/.claude/settings.json", async () => {
    useSettingsStore.setState({ favorites: [] });
    useProjectConfigStore.setState({ lastScanned: null });

    invokeHandlers["read_user_claude_file"] = async () =>
      JSON.stringify({
        hooks: { PreToolUse: [{ command: "guard" }] },
      });

    await useProjectConfigStore.getState().scanAllFavorites();

    const global = useProjectConfigStore.getState().globalConfig;
    expect(global).not.toBeNull();
    expect(global!.path).toBe("~/.claude");
    expect(global!.hookCount).toBe(1);
    expect(global!.hooks).toEqual(["PreToolUse"]);
  });
});
