/**
 * Layer-B integration test — `ConfigPanelTabList` renders via
 * `getTabsForProject` resolver and honors per-project overrides.
 *
 * Spec §6.1 / §9.1 — render coverage for default order, override order,
 * override hidden, requiresPresence vs user-toggle (Code gewinnt), and
 * the right-click context menu.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ConfigPanelTabList } from "./ConfigPanelTabList";
import { useSettingsStore } from "../../store/settingsStore";
import { useUIStore } from "../../store/uiStore";
import { DEFAULT_TAB_CONFIG } from "../../store/tabConfig";
import { resetAllStores } from "../../test/storeReset";
import { installRealIPC, clearTauriIPC } from "../../test/mockTauriIPC";

const FOLDER = "C:/Proj/A";

function installFullPresence() {
  installRealIPC({
    resolve_project_root: ({ folder }) => folder,
    read_project_file: ({ relativePath }) => {
      if (relativePath === ".claude/settings.json") {
        return JSON.stringify({ hooks: { PostToolUse: [] } });
      }
      return "CLAUDE.md content";
    },
    list_skill_dirs: () => [{ name: "test-skill" }],
    list_project_dir: () => ["agent1.md"],
    check_project_presence: () => ({ has_git: true, has_github: true, remote_url: "x" }),
  });
}

describe("ConfigPanelTabList — render contract", () => {
  beforeEach(() => {
    resetAllStores();
    installFullPresence();
  });
  afterEach(() => {
    clearTauriIPC();
    cleanup();
  });

  it("renders ALL default tabs when no override and full presence", async () => {
    render(<ConfigPanelTabList folder={FOLDER} />);
    // Wait for presence to load
    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });
    // Verify all 9 known tab buttons render (use data-tab-id, label-casing
    // varies: GitHub, CLAUDE.md, etc.)
    const tabButtons = screen.getAllByRole("button").filter((b) => b.getAttribute("data-tab-id"));
    const renderedIds = tabButtons.map((b) => b.getAttribute("data-tab-id"));
    for (const id of DEFAULT_TAB_CONFIG.order) {
      expect(renderedIds).toContain(id);
    }
  });

  it("respects override.order — first tab matches override", async () => {
    useSettingsStore.getState().setProjectTabOverride(FOLDER, {
      order: ["history", "claude-md", "skills", "hooks", "settings", "agents", "github", "worktrees", "kanban"],
    });
    render(<ConfigPanelTabList folder={FOLDER} />);
    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });
    const tabButtons = screen.getAllByRole("button").filter((b) => b.getAttribute("data-tab-id"));
    expect(tabButtons[0].getAttribute("data-tab-id")).toBe("history");
  });

  it("hides tabs listed in override.hidden", async () => {
    useSettingsStore.getState().setProjectTabOverride(FOLDER, { hidden: ["kanban", "history"] });
    render(<ConfigPanelTabList folder={FOLDER} />);
    await waitFor(() => {
      expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
    });
    expect(screen.queryByText("History")).not.toBeInTheDocument();
    expect(screen.queryByText("Kanban")).not.toBeInTheDocument();
  });

  it("Code gewinnt: requiresPresence-tab stays hidden when artifact missing, even if user-toggled visible", async () => {
    // Skills artifact missing
    installRealIPC({
      resolve_project_root: ({ folder }) => folder,
      read_project_file: () => "x",
      list_skill_dirs: () => [],
      list_project_dir: () => [],
      check_project_presence: () => ({ has_git: false, has_github: false, remote_url: null }),
    });
    // User has nothing in hidden — skills should still not render b/c artifact missing.
    render(<ConfigPanelTabList folder={FOLDER} />);
    await waitFor(() => {
      // History has no requiresPresence and should always show.
      expect(screen.getByText("History")).toBeInTheDocument();
    });
    expect(screen.queryByText("Skills")).not.toBeInTheDocument();
  });

  it("right-click context menu shows 'Verstecken' on visible tab", async () => {
    render(<ConfigPanelTabList folder={FOLDER} />);
    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });
    const historyBtn = screen.getAllByRole("button").find((b) => b.getAttribute("data-tab-id") === "history");
    expect(historyBtn).toBeDefined();
    fireEvent.contextMenu(historyBtn!);
    expect(screen.getByText("Tab verstecken")).toBeInTheDocument();
  });

  it("active-tab sync: hiding the active tab re-routes uiStore.configSubTab", async () => {
    useUIStore.setState({ configSubTab: "history" });
    render(<ConfigPanelTabList folder={FOLDER} />);
    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });
    useSettingsStore.getState().setProjectTabOverride(FOLDER, { hidden: ["history"] });
    await waitFor(() => {
      expect(useUIStore.getState().configSubTab).not.toBe("history");
    });
  });
});
