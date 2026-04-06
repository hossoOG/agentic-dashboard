import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { buildSettingsSections, parseSettings, SettingsViewer } from "./SettingsViewer";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ── Unit tests: parseSettings ──

describe("parseSettings", () => {
  it("parses valid JSON object", () => {
    const result = parseSettings(JSON.stringify({ allowedTools: ["Bash"] }));
    expect(result).toEqual({ allowedTools: ["Bash"] });
  });

  it("returns null for invalid JSON", () => {
    expect(parseSettings("not json")).toBeNull();
  });

  it("returns null for arrays", () => {
    expect(parseSettings("[]")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSettings("")).toBeNull();
  });
});

// ── Unit tests: buildSettingsSections ──

describe("buildSettingsSections", () => {
  it("groups settings by key with source attribution", () => {
    const raws = {
      project: JSON.stringify({
        allowedTools: ["Bash", "Edit"],
        mcpServers: { playwright: { command: "npx" } },
      }),
      "project-local": "",
      user: JSON.stringify({
        allowedTools: ["Read"],
        model: "opus",
      }),
    };

    const sections = buildSettingsSections(raws);

    // allowedTools appears first (known section order)
    expect(sections[0].title).toBe("Erlaubte Tools");
    expect(sections[0].entries).toHaveLength(2);
    expect(sections[0].entries[0].source).toBe("project");
    expect(sections[0].entries[1].source).toBe("user");

    // mcpServers
    const mcpSection = sections.find((s) => s.title === "MCP-Server");
    expect(mcpSection).toBeDefined();
    expect(mcpSection!.entries[0].source).toBe("project");

    // model
    const modelSection = sections.find((s) => s.title === "Modell");
    expect(modelSection).toBeDefined();
    expect(modelSection!.entries[0].value).toBe("opus");
    expect(modelSection!.entries[0].source).toBe("user");
  });

  it("excludes hooks key (shown in Hooks tab)", () => {
    const raws = {
      project: JSON.stringify({
        hooks: { PreToolUse: [] },
        allowedTools: ["Bash"],
      }),
      "project-local": "",
      user: "",
    };

    const sections = buildSettingsSections(raws);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Erlaubte Tools");
  });

  it("returns empty array when no settings exist", () => {
    const sections = buildSettingsSections({ project: "", "project-local": "", user: "" });
    expect(sections).toHaveLength(0);
  });

  it("handles invalid JSON gracefully", () => {
    const sections = buildSettingsSections({
      project: "broken{",
      "project-local": "",
      user: JSON.stringify({ model: "sonnet" }),
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].entries[0].source).toBe("user");
  });

  it("handles unknown keys with fallback title", () => {
    const raws = {
      project: JSON.stringify({ customKey: "value" }),
      "project-local": "",
      user: "",
    };

    const sections = buildSettingsSections(raws);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("customKey");
  });
});

// ── Component tests: SettingsViewer ──

describe("SettingsViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no settings configured", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    // All sources return only hooks (excluded) or empty
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ hooks: {} }));

    render(<SettingsViewer folder="/test" />);

    expect(await screen.findByText("Keine Settings konfiguriert")).toBeTruthy();
  });

  it("renders settings sections with source badges", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const projectJson = JSON.stringify({
      allowedTools: ["Bash", "Edit", "Read"],
      mcpServers: { playwright: { command: "npx playwright" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "read_project_file" && args?.relativePath === ".claude/settings.json") {
        return projectJson;
      }
      return "";
    });

    render(<SettingsViewer folder="/test" />);

    // Wait for structured view
    expect(await screen.findByText("Erlaubte Tools")).toBeTruthy();
    expect(screen.getByText("MCP-Server")).toBeTruthy();
    expect(screen.getByText("2 Kategorien")).toBeTruthy();

    // Source badge
    expect(screen.getAllByText("Projekt").length).toBeGreaterThanOrEqual(1);

    // Tool list items
    expect(screen.getByText("Bash")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("toggles between structured and raw view", async () => {
    const rawJson = JSON.stringify({ allowedTools: ["Bash"] });
    const { invoke } = await import("@tauri-apps/api/core");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "read_project_file" && args?.relativePath === ".claude/settings.json") {
        return rawJson;
      }
      return "";
    });

    render(<SettingsViewer folder="/test" />);

    // Wait for structured view
    expect(await screen.findByText("Erlaubte Tools")).toBeTruthy();

    // Toggle to raw
    const rawButton = screen.getByTitle("Raw JSON");
    fireEvent.click(rawButton);

    // Raw JSON should show the full JSON
    expect(screen.getByText(rawJson)).toBeTruthy();
  });

  it("shows settings from multiple sources with correct attribution", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const projectJson = JSON.stringify({ allowedTools: ["Bash"] });
    const userJson = JSON.stringify({ allowedTools: ["Read"], model: "opus" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "read_project_file" && args?.relativePath === ".claude/settings.json") {
        return projectJson;
      }
      if (cmd === "read_user_claude_file") {
        return userJson;
      }
      return "";
    });

    render(<SettingsViewer folder="/test" />);

    expect(await screen.findByText("Erlaubte Tools")).toBeTruthy();
    expect(screen.getByText("Modell")).toBeTruthy();

    // Both sources visible
    expect(screen.getAllByText("Projekt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("User").length).toBeGreaterThanOrEqual(1);
  });
});
