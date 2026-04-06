import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { buildEventGroups, HooksViewer } from "./HooksViewer";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ── Unit tests: buildEventGroups ──

describe("buildEventGroups", () => {
  it("merges hooks from multiple sources into event-first groups", () => {
    const raws = {
      project: JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: "Bash", command: "echo pre" }],
          PostToolUse: [{ command: "echo post" }],
        },
      }),
      "project-local": JSON.stringify({
        hooks: {
          PreToolUse: [{ command: "echo local-pre" }],
        },
      }),
      user: "",
    };

    const groups = buildEventGroups(raws);

    expect(groups).toHaveLength(2);
    // Sorted alphabetically: PostToolUse before PreToolUse
    expect(groups[0].eventName).toBe("PostToolUse");
    expect(groups[0].hooks).toHaveLength(1);
    expect(groups[0].hooks[0].source).toBe("project");

    expect(groups[1].eventName).toBe("PreToolUse");
    expect(groups[1].hooks).toHaveLength(2);
    expect(groups[1].hooks[0].source).toBe("project");
    expect(groups[1].hooks[0].matcher).toBe("Bash");
    expect(groups[1].hooks[1].source).toBe("project-local");
  });

  it("returns empty array when no sources have hooks", () => {
    const groups = buildEventGroups({ project: "", "project-local": "", user: "" });
    expect(groups).toHaveLength(0);
  });

  it("returns empty array for JSON without hooks key", () => {
    const groups = buildEventGroups({
      project: JSON.stringify({ permissions: {} }),
      "project-local": "",
      user: "",
    });
    expect(groups).toHaveLength(0);
  });

  it("handles invalid JSON gracefully", () => {
    const groups = buildEventGroups({
      project: "not valid json",
      "project-local": "",
      user: JSON.stringify({
        hooks: { PreToolUse: [{ command: "echo ok" }] },
      }),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].hooks[0].source).toBe("user");
  });

  it("preserves source badge per hook within same event", () => {
    const raws = {
      project: JSON.stringify({
        hooks: { PreToolUse: [{ command: "cmd1" }] },
      }),
      "project-local": JSON.stringify({
        hooks: { PreToolUse: [{ command: "cmd2" }] },
      }),
      user: JSON.stringify({
        hooks: { PreToolUse: [{ command: "cmd3" }] },
      }),
    };

    const groups = buildEventGroups(raws);
    expect(groups).toHaveLength(1);
    expect(groups[0].hooks).toHaveLength(3);
    expect(groups[0].hooks[0].source).toBe("project");
    expect(groups[0].hooks[1].source).toBe("project-local");
    expect(groups[0].hooks[2].source).toBe("user");
  });
});

// ── Component tests: HooksViewer ──

describe("HooksViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows empty state when no hooks configured", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue("");

    render(<HooksViewer folder="/test" />);

    expect(await screen.findByText("Keine Hooks konfiguriert")).toBeTruthy();
    expect(screen.getByText(/PreToolUse/)).toBeTruthy();
    expect(screen.getByText(/\.claude\/settings\.json/)).toBeTruthy();
  });

  it("renders event groups with source badges", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const projectJson = JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "Bash", command: "node safe-guard.mjs" }] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "read_project_file" && args?.relativePath === ".claude/settings.json") {
        return projectJson;
      }
      return "";
    });

    render(<HooksViewer folder="/test" />);

    expect(await screen.findByText("PreToolUse")).toBeTruthy();
    // "Projekt" appears in legend and badge — use getAllByText
    expect(screen.getAllByText("Projekt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("node safe-guard.mjs")).toBeTruthy();
    expect(screen.getByText("1 Event")).toBeTruthy();
  });

  it("toggles between structured and raw view", async () => {
    const rawJson = JSON.stringify({
      hooks: { PostToolUse: [{ command: "tsc --noEmit" }] },
    });
    const { invoke } = await import("@tauri-apps/api/core");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "read_project_file" && args?.relativePath === ".claude/settings.json") {
        return rawJson;
      }
      return "";
    });

    render(<HooksViewer folder="/test" />);

    // Wait for structured view
    expect(await screen.findByText("PostToolUse")).toBeTruthy();

    // Toggle to raw
    const rawButton = screen.getByTitle("Raw JSON");
    fireEvent.click(rawButton);

    // Raw JSON should show the full JSON
    expect(screen.getByText(rawJson)).toBeTruthy();
  });
});
