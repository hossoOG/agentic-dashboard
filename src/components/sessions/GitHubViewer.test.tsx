import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { GitHubViewer } from "./GitHubViewer";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock @tauri-apps/plugin-shell
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GitHubViewer", () => {
  it("shows loading state initially", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<GitHubViewer folder="/test/project" />);
    expect(screen.getByText("Lade Git/GitHub-Daten...")).toBeInTheDocument();
  });

  it("renders git info, PRs, and issues", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_git_info") {
        return Promise.resolve({
          branch: "feature/test",
          last_commit: {
            hash: "abc1234",
            message: "fix: something",
            date: "2026-04-01",
          },
          remote_url: "https://github.com/user/repo.git",
        });
      }
      if (cmd === "get_github_prs") {
        return Promise.resolve([
          {
            number: 42,
            title: "Add feature X",
            author: "dev1",
            status: "APPROVED",
            url: "https://github.com/user/repo/pull/42",
          },
        ]);
      }
      if (cmd === "get_github_issues") {
        return Promise.resolve([
          {
            number: 10,
            title: "Bug in login",
            labels: ["bug", "high-priority"],
            assignee: "dev2",
            url: "https://github.com/user/repo/issues/10",
          },
        ]);
      }
      return Promise.reject(new Error("unknown"));
    });

    render(<GitHubViewer folder="/test/fresh-project" />);

    await waitFor(() => {
      expect(screen.getByText("feature/test")).toBeInTheDocument();
    });

    // Git info
    expect(screen.getByText("abc1234")).toBeInTheDocument();
    expect(screen.getByText("fix: something")).toBeInTheDocument();

    // PR
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Add feature X")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();

    // Issue
    expect(screen.getByText("#10")).toBeInTheDocument();
    expect(screen.getByText("Bug in login")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("high-priority")).toBeInTheDocument();
  });

  it("shows empty state when git fails", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_git_info") {
        return Promise.reject(new Error("not a git repository"));
      }
      if (cmd === "get_github_prs") return Promise.resolve([]);
      if (cmd === "get_github_issues") return Promise.resolve([]);
      return Promise.reject(new Error("unknown"));
    });

    render(<GitHubViewer folder="/test/no-git-project" />);

    await waitFor(() => {
      expect(screen.getByText("Kein Git-Repository")).toBeInTheDocument();
    });
  });

  it("shows gh CLI error when github commands fail", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_git_info") {
        return Promise.resolve({
          branch: "main",
          last_commit: null,
          remote_url: "",
        });
      }
      if (cmd === "get_github_prs" || cmd === "get_github_issues") {
        return Promise.reject(new Error("gh not found"));
      }
      return Promise.reject(new Error("unknown"));
    });

    render(<GitHubViewer folder="/test/no-gh-project" />);

    await waitFor(() => {
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    // The error contains "not found" which triggers the special gh CLI message
    expect(
      screen.getByText("gh CLI nicht gefunden — installiere von https://cli.github.com"),
    ).toBeInTheDocument();
  });

  it("shows no PRs/issues when lists are empty", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_git_info") {
        return Promise.resolve({
          branch: "main",
          last_commit: null,
          remote_url: "",
        });
      }
      if (cmd === "get_github_prs") return Promise.resolve([]);
      if (cmd === "get_github_issues") return Promise.resolve([]);
      return Promise.reject(new Error("unknown"));
    });

    render(<GitHubViewer folder="/test/empty-gh-project" />);

    await waitFor(() => {
      expect(screen.getByText("Keine offenen PRs")).toBeInTheDocument();
    });
    expect(screen.getByText("Keine offenen Issues")).toBeInTheDocument();
  });

  it("renders refresh button", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_git_info") {
        return Promise.resolve({ branch: "main", last_commit: null, remote_url: "" });
      }
      if (cmd === "get_github_prs") return Promise.resolve([]);
      if (cmd === "get_github_issues") return Promise.resolve([]);
      return Promise.reject(new Error("unknown"));
    });

    render(<GitHubViewer folder="/test/refresh-project" />);

    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });

    const refreshBtn = screen.getByTitle("Neu laden");
    expect(refreshBtn).toBeInTheDocument();

    // Click refresh triggers reload
    fireEvent.click(refreshBtn);
    expect(mockInvoke).toHaveBeenCalledWith("get_git_info", { folder: "/test/refresh-project" });
  });
});
