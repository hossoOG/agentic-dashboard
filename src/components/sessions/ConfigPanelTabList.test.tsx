import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConfigPanelTabList } from "./ConfigPanelTabList";

// Mock Tauri dialog plugin
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

// Mock Tauri core invoke — per-test implementation swapped via mockInvoke below.
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock stores with minimal state
vi.mock("../../store/uiStore", () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      configSubTab: "claude-md",
      setConfigSubTab: vi.fn(),
      addToast: vi.fn(),
      hasDirtyEditor: false,
    }),
}));

vi.mock("../../store/settingsStore", () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      pinnedDocs: {},
      addPinnedDoc: vi.fn(),
      removePinnedDoc: vi.fn(),
      renamePinnedDoc: vi.fn(),
    }),
  normalizeProjectKey: (f: string) => f.replace(/\\/g, "/").toLowerCase(),
}));

/**
 * Helper to build an invoke implementation for the 5 Tauri commands fired by
 * ConfigPanelTabList's presence-detection useEffect.
 *
 * Defaults simulate an "empty" project (no artifacts, no git/github), which
 * lets tests override only the fields they care about.
 */
function makeInvokeImpl(overrides: {
  claudeMd?: string;
  skills?: unknown[];
  agents?: string[];
  settings?: string;
  projectPresence?:
    | { has_git: boolean; has_github: boolean; remote_url: string | null }
    | Promise<never>;
}) {
  return (cmd: string) => {
    switch (cmd) {
      case "read_project_file":
        // Called for both CLAUDE.md and settings.json — differentiate by argument order.
        // We simplify: return empty string by default, tests set claudeMd/settings together.
        return Promise.resolve(overrides.claudeMd ?? "");
      case "list_skill_dirs":
        return Promise.resolve(overrides.skills ?? []);
      case "list_project_dir":
        return Promise.resolve(overrides.agents ?? []);
      case "check_project_presence":
        if (overrides.projectPresence instanceof Promise) return overrides.projectPresence;
        return Promise.resolve(
          overrides.projectPresence ?? {
            has_git: false,
            has_github: false,
            remote_url: null,
          },
        );
      default:
        return Promise.resolve(undefined);
    }
  };
}

/**
 * More accurate invoke impl that routes read_project_file by its `relativePath`
 * argument so CLAUDE.md and settings.json can be mocked independently.
 */
function makeInvokeImplDetailed(overrides: {
  claudeMd?: string;
  skills?: unknown[];
  agents?: string[];
  settings?: string;
  projectPresence?:
    | { has_git: boolean; has_github: boolean; remote_url: string | null };
  projectPresenceReject?: boolean;
}) {
  return (cmd: string, args?: { relativePath?: string }) => {
    switch (cmd) {
      case "read_project_file":
        if (args?.relativePath === "CLAUDE.md") {
          return Promise.resolve(overrides.claudeMd ?? "");
        }
        if (args?.relativePath === ".claude/settings.json") {
          return Promise.resolve(overrides.settings ?? "");
        }
        return Promise.resolve("");
      case "list_skill_dirs":
        return Promise.resolve(overrides.skills ?? []);
      case "list_project_dir":
        return Promise.resolve(overrides.agents ?? []);
      case "check_project_presence":
        if (overrides.projectPresenceReject) {
          return Promise.reject(new Error("presence unavailable"));
        }
        return Promise.resolve(
          overrides.projectPresence ?? {
            has_git: false,
            has_github: false,
            remote_url: null,
          },
        );
      default:
        return Promise.resolve(undefined);
    }
  };
}

describe("ConfigPanelTabList", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    // Default: empty project, no git, no github.
    mockInvoke.mockImplementation(makeInvokeImpl({}));
  });

  it("renders all 7 fixed tabs while presence is loading (anti-flash)", () => {
    // Presence-detection useEffect runs on mount but awaits async work —
    // first render happens with presence === null, so all tabs must be visible.
    render(<ConfigPanelTabList folder="/test" />);

    expect(screen.getByTitle("CLAUDE.md")).toBeTruthy();
    expect(screen.getByTitle("Skills")).toBeTruthy();
    expect(screen.getByTitle("Hooks")).toBeTruthy();
    expect(screen.getByTitle("GitHub")).toBeTruthy();
    expect(screen.getByTitle("Worktrees")).toBeTruthy();
    expect(screen.getByTitle("Kanban")).toBeTruthy();
    expect(screen.getByTitle("History")).toBeTruthy();
  });

  it("renders group separators between tab groups", () => {
    const { container } = render(<ConfigPanelTabList folder="/test" />);

    // Group separators are 1px-wide divs with bg-neutral-700
    const separators = container.querySelectorAll(".w-px.bg-neutral-700");
    // Expect 2 separators: context|project, project|history
    expect(separators.length).toBe(2);
  });

  it("highlights active tab with accent color", () => {
    render(<ConfigPanelTabList folder="/test" />);

    const claudeTab = screen.getByTitle("CLAUDE.md");
    expect(claudeTab.className).toContain("text-accent");
    expect(claudeTab.className).toContain("bg-accent-a10");
  });

  it("renders non-active tabs with neutral color", () => {
    render(<ConfigPanelTabList folder="/test" />);

    const skillsTab = screen.getByTitle("Skills");
    expect(skillsTab.className).toContain("text-neutral-400");
    expect(skillsTab.className).not.toContain("text-accent");
  });

  it("renders add-pin button", () => {
    render(<ConfigPanelTabList folder="/test" />);

    expect(screen.getByTitle("Markdown-Datei anpinnen")).toBeTruthy();
  });

  it("renders GitHub tab when has_github=true and has_git=true", async () => {
    mockInvoke.mockImplementation(
      makeInvokeImplDetailed({
        projectPresence: {
          has_git: true,
          has_github: true,
          remote_url: "https://github.com/foo/bar.git",
        },
      }),
    );

    render(<ConfigPanelTabList folder="/test" />);

    await waitFor(() => {
      expect(screen.getByTitle("GitHub")).toBeTruthy();
      expect(screen.getByTitle("Worktrees")).toBeTruthy();
      expect(screen.getByTitle("Kanban")).toBeTruthy();
    });
  });

  it("hides GitHub/Worktrees/Kanban when has_github=false and has_git=false", async () => {
    mockInvoke.mockImplementation(
      makeInvokeImplDetailed({
        projectPresence: {
          has_git: false,
          has_github: false,
          remote_url: null,
        },
      }),
    );

    render(<ConfigPanelTabList folder="/test" />);

    // Wait for presence resolution (History always visible — reliable waypoint).
    await waitFor(() => {
      expect(screen.queryByTitle("GitHub")).toBeNull();
    });
    expect(screen.queryByTitle("Worktrees")).toBeNull();
    expect(screen.queryByTitle("Kanban")).toBeNull();
    expect(screen.getByTitle("History")).toBeTruthy();
  });

  it("shows Worktrees but hides GitHub/Kanban when has_git=true and has_github=false", async () => {
    mockInvoke.mockImplementation(
      makeInvokeImplDetailed({
        projectPresence: {
          has_git: true,
          has_github: false,
          remote_url: null,
        },
      }),
    );

    render(<ConfigPanelTabList folder="/test" />);

    await waitFor(() => {
      expect(screen.getByTitle("Worktrees")).toBeTruthy();
    });
    expect(screen.queryByTitle("GitHub")).toBeNull();
    expect(screen.queryByTitle("Kanban")).toBeNull();
  });

  it("hides all project-group tabs when check_project_presence rejects (safe default)", async () => {
    mockInvoke.mockImplementation(
      makeInvokeImplDetailed({
        projectPresenceReject: true,
      }),
    );

    render(<ConfigPanelTabList folder="/test" />);

    // Wait for the effect to settle (presence resolves to safe default).
    await waitFor(() => {
      expect(screen.queryByTitle("GitHub")).toBeNull();
    });
    expect(screen.queryByTitle("Worktrees")).toBeNull();
    expect(screen.queryByTitle("Kanban")).toBeNull();
  });
});
