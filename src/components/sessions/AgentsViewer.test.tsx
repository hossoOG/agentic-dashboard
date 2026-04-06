import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AgentsViewer } from "./AgentsViewer";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("AgentsViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders agent list when agents exist", async () => {
    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "list_project_dir") {
        return Promise.resolve(["architect.md", "test-engineer.md"]);
      }
      if (cmd === "read_project_file") {
        const path = args?.relativePath as string;
        if (path.includes("architect")) {
          return Promise.resolve(
            "---\nmodel: opus\nmax-turns: 20\n---\n\n# Architect Agent\n\nPlanning agent.",
          );
        }
        if (path.includes("test-engineer")) {
          return Promise.resolve(
            "---\nmodel: sonnet\n---\n\n# Test Engineer\n\nWrites tests.",
          );
        }
      }
      return Promise.reject(new Error("unknown command"));
    });

    render(<AgentsViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("Agents (2)")).toBeInTheDocument();
    });

    // "architect" appears in both list and detail pane (auto-selected first item)
    expect(screen.getAllByText("architect").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("test-engineer")).toBeInTheDocument();
  });

  it("shows empty state when no agents directory exists", async () => {
    mockInvoke.mockRejectedValue(new Error("directory not found"));

    render(<AgentsViewer folder="/test/project" />);

    await waitFor(() => {
      expect(
        screen.getByText("Keine Agents in diesem Projekt konfiguriert"),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state when directory has no .md files", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_project_dir") {
        return Promise.resolve(["readme.txt", "config.json"]);
      }
      return Promise.reject(new Error("unknown"));
    });

    render(<AgentsViewer folder="/test/project" />);

    await waitFor(() => {
      expect(
        screen.getByText("Keine Agents in diesem Projekt konfiguriert"),
      ).toBeInTheDocument();
    });
  });
});
