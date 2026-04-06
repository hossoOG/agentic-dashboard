import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { WorktreeViewer } from "./WorktreeViewer";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("WorktreeViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<WorktreeViewer folder="/test/project" />);
    expect(screen.getByText("Laden...")).toBeInTheDocument();
  });

  it("renders worktree list", async () => {
    mockInvoke.mockResolvedValue([
      { path: "/projects/main", branch: "master", is_main: true },
      { path: "/projects/.claude/worktrees/feature-x", branch: "feature-x", is_main: false },
    ]);

    render(<WorktreeViewer folder="/test/wt-project" />);

    await waitFor(() => {
      expect(screen.getByText("Worktrees (2)")).toBeInTheDocument();
    });

    expect(screen.getByText("master")).toBeInTheDocument();
    expect(screen.getByText("feature-x")).toBeInTheDocument();
    expect(screen.getByText("Haupt")).toBeInTheDocument(); // main badge
    expect(screen.getByText("/projects/main")).toBeInTheDocument();
  });

  it("shows error state when scan fails", async () => {
    mockInvoke.mockRejectedValue(new Error("git error: not a repository"));

    render(<WorktreeViewer folder="/test/error-project" />);

    await waitFor(() => {
      expect(screen.getByText("git error: not a repository")).toBeInTheDocument();
    });
  });

  it("shows empty worktree message", async () => {
    mockInvoke.mockResolvedValue([]);

    render(<WorktreeViewer folder="/test/empty-project" />);

    await waitFor(() => {
      expect(screen.getByText("Keine Worktrees gefunden")).toBeInTheDocument();
    });
  });

  it("handles detached HEAD worktrees", async () => {
    mockInvoke.mockResolvedValue([
      { path: "/projects/detached", branch: null, is_main: false },
    ]);

    render(<WorktreeViewer folder="/test/detached-project" />);

    await waitFor(() => {
      expect(screen.getByText("detached")).toBeInTheDocument();
    });
  });

  it("refreshes on button click", async () => {
    mockInvoke.mockResolvedValue([
      { path: "/projects/main", branch: "master", is_main: true },
    ]);

    render(<WorktreeViewer folder="/test/refresh-project" />);

    await waitFor(() => {
      expect(screen.getByText("Worktrees (1)")).toBeInTheDocument();
    });

    const refreshBtn = screen.getByTitle("Neu laden");
    fireEvent.click(refreshBtn);

    // Should invoke again with force
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });
  });
});
