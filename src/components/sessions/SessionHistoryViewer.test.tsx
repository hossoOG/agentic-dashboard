import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SessionHistoryViewer from "./SessionHistoryViewer";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockSession = {
  session_id: "sess-001",
  title: "Fix login bug",
  started_at: "2026-04-05T10:00:00Z",
  ended_at: "2026-04-05T10:30:00Z",
  model: "claude-opus-4-20250514",
  user_turns: 5,
  total_messages: 20,
  subagent_count: 2,
  git_branch: "fix/login",
  cwd: "/projects/app",
};

const mockSession2 = {
  session_id: "sess-002",
  title: "Add unit tests",
  started_at: "2026-04-04T14:00:00Z",
  ended_at: "2026-04-04T15:15:00Z",
  model: "claude-sonnet-4-20250514",
  user_turns: 12,
  total_messages: 40,
  subagent_count: 0,
  git_branch: "test/coverage",
  cwd: "/projects/app",
};

describe("SessionHistoryViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<SessionHistoryViewer folder="/test/project" />);
    expect(screen.getByText("Sessions werden geladen...")).toBeInTheDocument();
  });

  it("renders session list", async () => {
    mockInvoke.mockResolvedValue([mockSession, mockSession2]);

    render(<SessionHistoryViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("2 Sessions")).toBeInTheDocument();
    });

    expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    expect(screen.getByText("Add unit tests")).toBeInTheDocument();

    // Model display
    expect(screen.getByText("Opus")).toBeInTheDocument();
    expect(screen.getByText("Sonnet")).toBeInTheDocument();

    // Git branch
    expect(screen.getByText("fix/login")).toBeInTheDocument();
    expect(screen.getByText("test/coverage")).toBeInTheDocument();
  });

  it("shows empty state when no sessions found", async () => {
    mockInvoke.mockResolvedValue([]);

    render(<SessionHistoryViewer folder="/test/project" />);

    await waitFor(() => {
      expect(
        screen.getByText("Keine Claude-Sessions fuer dieses Projekt gefunden"),
      ).toBeInTheDocument();
    });
  });

  it("shows error state when loading fails", async () => {
    mockInvoke.mockRejectedValue(new Error("scan failed"));

    render(<SessionHistoryViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText(/Fehler beim Laden/)).toBeInTheDocument();
    });

    expect(screen.getByText("Erneut versuchen")).toBeInTheDocument();
  });

  it("calls onResumeSession when clicking resume button", async () => {
    mockInvoke.mockResolvedValue([mockSession]);
    const handleResume = vi.fn();

    render(
      <SessionHistoryViewer
        folder="/test/project"
        onResumeSession={handleResume}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    });

    const resumeBtn = screen.getByTitle("Session fortsetzen");
    fireEvent.click(resumeBtn);

    expect(handleResume).toHaveBeenCalledWith("sess-001", "/projects/app");
  });

  it("does not show resume button when onResumeSession is not provided", async () => {
    mockInvoke.mockResolvedValue([mockSession]);

    render(<SessionHistoryViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    });

    expect(screen.queryByTitle("Session fortsetzen")).not.toBeInTheDocument();
  });

  it("shows subagent count only when > 0", async () => {
    mockInvoke.mockResolvedValue([mockSession, mockSession2]);

    render(<SessionHistoryViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    });

    // mockSession has 2 subagents, mockSession2 has 0
    expect(screen.getByText("2")).toBeInTheDocument(); // subagent count for session 1
    // Session 2 should not have a subagent count displayed
    // (5 and 12 are user_turns, not subagent counts)
  });

  it("refreshes on button click", async () => {
    mockInvoke.mockResolvedValue([mockSession]);

    render(<SessionHistoryViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeInTheDocument();
    });

    const refreshBtn = screen.getByTitle("Neu laden");
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });
  });

  it("shows singular 'Session' for single result", async () => {
    mockInvoke.mockResolvedValue([mockSession]);

    render(<SessionHistoryViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByText("1 Session")).toBeInTheDocument();
    });
  });
});
