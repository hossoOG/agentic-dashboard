import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConfigDiscoveryStore } from "./configDiscoveryStore";

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

vi.mock("../utils/errorLogger", () => ({
  logError: vi.fn(),
}));

function resetStore() {
  useConfigDiscoveryStore.setState({
    globalConfig: null,
    projectConfig: null,
    projectPath: null,
    loading: false,
    error: null,
    contentCache: {},
    contentLoading: {},
  });
}

beforeEach(() => {
  resetStore();
  Object.keys(invokeHandlers).forEach((k) => delete invokeHandlers[k]);
});

// ── discoverGlobal ────────────────────────────────────────────────────

describe("discoverGlobal", () => {
  it("parses global settings with hooks and agents", async () => {
    const settings = JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "Bash", command: "node safe-guard.mjs" }],
        PostToolUse: [{ command: "tsc --noEmit" }],
      },
      agents: {
        architect: { model: "opus" },
        "test-engineer": { model: "sonnet" },
      },
    });

    invokeHandlers["read_user_claude_file"] = async (args) => {
      const rp = (args as { relativePath: string }).relativePath;
      if (rp === "settings.json") return settings;
      return "";
    };
    invokeHandlers["list_user_claude_dir"] = async () => [];

    await useConfigDiscoveryStore.getState().discoverGlobal();

    const config = useConfigDiscoveryStore.getState().globalConfig;
    expect(config).not.toBeNull();
    expect(config!.hooks).toHaveLength(2);
    expect(config!.hooks[0].event).toBe("PreToolUse");
    expect(config!.hooks[0].matcher).toBe("Bash");
    expect(config!.hooks[0].command).toBe("node safe-guard.mjs");
    expect(config!.hooks[1].event).toBe("PostToolUse");

    expect(config!.agents).toHaveLength(2);
    expect(config!.agents[0].name).toBe("architect");
    expect(config!.agents[0].model).toBe("opus");
    expect(config!.agents[1].name).toBe("test-engineer");
  });

  it("handles empty/missing settings gracefully", async () => {
    invokeHandlers["read_user_claude_file"] = async () => "";
    invokeHandlers["list_user_claude_dir"] = async () => [];

    await useConfigDiscoveryStore.getState().discoverGlobal();

    const config = useConfigDiscoveryStore.getState().globalConfig;
    expect(config).not.toBeNull();
    expect(config!.hooks).toHaveLength(0);
    expect(config!.agents).toHaveLength(0);
    expect(config!.skills).toHaveLength(0);
  });

  it("discovers global skills from commands dir", async () => {
    invokeHandlers["read_user_claude_file"] = async (args) => {
      const rp = (args as { relativePath: string }).relativePath;
      if (rp === "settings.json") return "";
      if (rp === "commands/implement/SKILL.md") {
        return "---\nname: implement\ndescription: Issue to PR\n---\nBody";
      }
      return "";
    };
    invokeHandlers["list_user_claude_dir"] = async (args) => {
      const rp = (args as { relativePath: string }).relativePath;
      if (rp === "commands") return ["implement"];
      if (rp === "projects") return [];
      return [];
    };

    await useConfigDiscoveryStore.getState().discoverGlobal();

    const config = useConfigDiscoveryStore.getState().globalConfig;
    expect(config!.skills).toHaveLength(1);
    expect(config!.skills[0].name).toBe("implement");
    expect(config!.skills[0].description).toBe("Issue to PR");
  });
});

// ── discoverProject ───────────────────────────────────────────────────

describe("discoverProject", () => {
  it("discovers project skills, hooks, agents, and CLAUDE.md", async () => {
    invokeHandlers["read_project_file"] = async (args) => {
      const rp = (args as { relativePath: string }).relativePath;
      if (rp === "CLAUDE.md") return "# Project Instructions";
      if (rp === ".claude/settings.json") {
        return JSON.stringify({
          hooks: { PreToolUse: [{ command: "lint" }] },
          agents: { reviewer: { model: "opus" } },
        });
      }
      if (rp === ".claude/settings.local.json") return "";
      return "";
    };
    invokeHandlers["list_skill_dirs"] = async () => [
      {
        dir_name: "deploy",
        content: "---\nname: deploy\ndescription: Deploy workflow\n---\nBody",
        has_reference_dir: true,
      },
    ];

    await useConfigDiscoveryStore.getState().discoverProject("/test/project");

    const config = useConfigDiscoveryStore.getState().projectConfig;
    expect(config).not.toBeNull();
    expect(config!.claudeMd).toBe("# Project Instructions");
    expect(config!.skills).toHaveLength(1);
    expect(config!.skills[0].name).toBe("deploy");
    expect(config!.skills[0].hasReference).toBe(true);
    expect(config!.hooks).toHaveLength(1);
    expect(config!.agents).toHaveLength(1);
    expect(config!.agents[0].name).toBe("reviewer");
  });

  it("does nothing when folder is empty", async () => {
    await useConfigDiscoveryStore.getState().discoverProject("");

    expect(useConfigDiscoveryStore.getState().projectConfig).toBeNull();
  });

  it("merges local settings hooks", async () => {
    invokeHandlers["read_project_file"] = async (args) => {
      const rp = (args as { relativePath: string }).relativePath;
      if (rp === "CLAUDE.md") return "";
      if (rp === ".claude/settings.json") {
        return JSON.stringify({
          hooks: { PreToolUse: [{ command: "lint" }] },
        });
      }
      if (rp === ".claude/settings.local.json") {
        return JSON.stringify({
          hooks: { PostToolUse: [{ command: "test" }] },
        });
      }
      return "";
    };
    invokeHandlers["list_skill_dirs"] = async () => [];

    await useConfigDiscoveryStore.getState().discoverProject("/test/project");

    const config = useConfigDiscoveryStore.getState().projectConfig;
    expect(config!.hooks).toHaveLength(2);
    expect(config!.hooks[0].source).toBe("settings.json");
    expect(config!.hooks[1].source).toBe("settings.local.json");
  });
});

// ── loadContent ───────────────────────────────────────────────────────

describe("loadContent", () => {
  it("caches loaded content", async () => {
    let callCount = 0;
    const loader = async () => {
      callCount++;
      return "file content";
    };

    const result1 = await useConfigDiscoveryStore.getState().loadContent("test:key", loader);
    expect(result1).toBe("file content");
    expect(callCount).toBe(1);

    const result2 = await useConfigDiscoveryStore.getState().loadContent("test:key", loader);
    expect(result2).toBe("file content");
    expect(callCount).toBe(1); // still 1 — cached
  });

  it("handles loader errors gracefully", async () => {
    const loader = async () => {
      throw new Error("read failed");
    };

    const result = await useConfigDiscoveryStore.getState().loadContent("error:key", loader);
    expect(result).toBe("");

    const cached = useConfigDiscoveryStore.getState().contentCache["error:key"];
    expect(cached).toContain("Fehler");
  });
});
