import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SkillsViewer } from "./SkillsViewer";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const skillContent1 = `---
name: implement
description: Issue to PR workflow
user-invokable: true
args:
  - name: issue
    description: GitHub issue number
    required: true
---

# Implement Skill

Steps to implement a feature.`;

const skillContent2 = `---
name: auto-lint
description: Automatic linting hook
user-invokable: false
---

# Auto Lint

Runs lint automatically.`;

describe("SkillsViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<SkillsViewer folder="/test/project" />);
    expect(screen.getByText("Lade Skills...")).toBeInTheDocument();
  });

  it("renders skill list via list_skill_dirs", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_skill_dirs") {
        return Promise.resolve([
          {
            dir_name: "implement",
            content: skillContent1,
            has_reference_dir: true,
          },
          {
            dir_name: "auto-lint",
            content: skillContent2,
            has_reference_dir: false,
          },
        ]);
      }
      return Promise.reject(new Error("unknown"));
    });

    render(<SkillsViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("Skills (2)")).toBeInTheDocument();
    });

    // "implement" appears in both list and detail (auto-selected first item)
    expect(screen.getAllByText("implement").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("auto-lint")).toBeInTheDocument();
  });

  it("shows empty state when no skills found", async () => {
    mockInvoke.mockRejectedValue(new Error("not found"));

    render(<SkillsViewer folder="/test/project" />);

    await waitFor(() => {
      expect(
        screen.getByText("Keine Skills in diesem Projekt konfiguriert"),
      ).toBeInTheDocument();
    });
  });

  it("filters skills by invokable type", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_skill_dirs") {
        return Promise.resolve([
          { dir_name: "implement", content: skillContent1, has_reference_dir: false },
          { dir_name: "auto-lint", content: skillContent2, has_reference_dir: false },
        ]);
      }
      return Promise.reject(new Error("unknown"));
    });

    render(<SkillsViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("Skills (2)")).toBeInTheDocument();
    });

    // Filter to "Aufrufbar" (user-invokable) — multiple "Aufrufbar" exist (filter btn + badge)
    const aufrufbarButtons = screen.getAllByText("Aufrufbar");
    fireEvent.click(aufrufbarButtons[0]); // filter button

    // Only invokable skill should show
    expect(screen.getAllByText("implement").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("auto-lint")).not.toBeInTheDocument();

    // Filter to "Automatisch"
    const autoButtons = screen.getAllByText("Automatisch");
    fireEvent.click(autoButtons[0]);

    // "implement" should no longer be in the list, only in the detail (if still selected)
    expect(screen.getByText("auto-lint")).toBeInTheDocument();
  });

  it("searches skills by name", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_skill_dirs") {
        return Promise.resolve([
          { dir_name: "implement", content: skillContent1, has_reference_dir: false },
          { dir_name: "auto-lint", content: skillContent2, has_reference_dir: false },
        ]);
      }
      return Promise.reject(new Error("unknown"));
    });

    render(<SkillsViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("Skills (2)")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Suchen...");
    fireEvent.change(searchInput, { target: { value: "lint" } });

    // auto-lint is shown in the filtered list
    expect(screen.getAllByText("auto-lint").length).toBeGreaterThanOrEqual(1);
  });

  it("auto-selects first skill and shows detail", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_skill_dirs") {
        return Promise.resolve([
          { dir_name: "implement", content: skillContent1, has_reference_dir: true },
        ]);
      }
      return Promise.reject(new Error("unknown"));
    });

    render(<SkillsViewer folder="/test/project" />);

    await waitFor(() => {
      // Detail pane shows the skill description
      expect(screen.getAllByText("Issue to PR workflow").length).toBeGreaterThanOrEqual(1);
    });

    // Args section should show the parameter
    expect(screen.getByText("Parameter")).toBeInTheDocument();
    expect(screen.getByText("issue")).toBeInTheDocument();
  });

  it("falls back to legacy loading when list_skill_dirs fails", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_skill_dirs") {
        return Promise.reject(new Error("command not found"));
      }
      if (cmd === "list_project_dir") {
        return Promise.resolve(["implement.md"]);
      }
      if (cmd === "read_project_file") {
        return Promise.resolve(skillContent1);
      }
      return Promise.reject(new Error("unknown"));
    });

    render(<SkillsViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("Skills (1)")).toBeInTheDocument();
    });
  });
});
