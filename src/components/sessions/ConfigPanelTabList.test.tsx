import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfigPanelTabList } from "./ConfigPanelTabList";

// Mock Tauri dialog plugin
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
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

describe("ConfigPanelTabList", () => {
  it("renders all 7 fixed tabs", () => {
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
});
