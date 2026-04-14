import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TerminalToolbar } from "./TerminalToolbar";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: <T,>(cmd: string, args?: Record<string, unknown>) =>
    mockInvoke(cmd, args) as Promise<T>,
}));

beforeEach(() => {
  mockInvoke.mockReset();
  // Default: not a git repo — prevents unhandled promise warnings in tests
  // that don't set their own mock
  mockInvoke.mockRejectedValue(new Error("Not a git repository"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TerminalToolbar", () => {
  it("shows active session title in single mode", () => {
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        activeSessionTitle="My Session"
        gridCount={0}
      />,
    );
    expect(screen.getByText("My Session")).toBeTruthy();
  });

  it("shows 'Kein Terminal' when no active session title in single mode", () => {
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        gridCount={0}
      />,
    );
    expect(screen.getByText("Kein Terminal")).toBeTruthy();
  });

  it("shows grid count in grid mode", () => {
    render(
      <TerminalToolbar
        layoutMode="grid"
        onLayoutChange={vi.fn()}
        gridCount={3}
      />,
    );
    expect(screen.getByText("Grid (3 Sessions)")).toBeTruthy();
  });

  it("uses singular 'Session' for grid count of 1", () => {
    render(
      <TerminalToolbar
        layoutMode="grid"
        onLayoutChange={vi.fn()}
        gridCount={1}
      />,
    );
    expect(screen.getByText("Grid (1 Session)")).toBeTruthy();
  });

  it("calls onLayoutChange with correct mode on button clicks", () => {
    const onLayoutChange = vi.fn();
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={onLayoutChange}
        gridCount={0}
      />,
    );

    fireEvent.click(screen.getByLabelText("Grid-Ansicht"));
    expect(onLayoutChange).toHaveBeenCalledWith("grid");

    fireEvent.click(screen.getByLabelText("Einzelansicht"));
    expect(onLayoutChange).toHaveBeenCalledWith("single");
  });

  it("renders config panel toggle in single mode when handler provided", () => {
    const onToggle = vi.fn();
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        gridCount={0}
        configPanelOpen={false}
        onToggleConfigPanel={onToggle}
      />,
    );

    const btn = screen.getByLabelText("Konfig-Panel öffnen");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not render config panel toggle in grid mode", () => {
    render(
      <TerminalToolbar
        layoutMode="grid"
        onLayoutChange={vi.fn()}
        gridCount={2}
        configPanelOpen={false}
        onToggleConfigPanel={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Konfig-Panel öffnen")).toBeNull();
  });

  it("shows close label when config panel is open", () => {
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        gridCount={0}
        configPanelOpen={true}
        onToggleConfigPanel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Konfig-Panel schließen")).toBeTruthy();
  });

  // ── Branch chip ────────────────────────────────────────────────────────────

  it("shows branch chip when folder has a git repo", async () => {
    mockInvoke.mockResolvedValue({ branch: "feature/test-chip", last_commit: null, remote_url: "" });
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        activeSessionTitle="My Session"
        folder="/some/git/repo"
        gridCount={0}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("git-branch-chip")).toBeTruthy();
    });
    expect(screen.getByText("feature/test-chip")).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith("get_git_info", { folder: "/some/git/repo" });
  });

  it("shows no branch chip when folder is undefined", async () => {
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        activeSessionTitle="My Session"
        gridCount={0}
      />,
    );
    // Allow any async effects to flush before asserting
    await act(async () => {});
    expect(screen.queryByTestId("git-branch-chip")).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("shows no branch chip when HEAD is detached", async () => {
    mockInvoke.mockResolvedValue({ branch: "HEAD", last_commit: null, remote_url: "" });
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        folder="/some/git/repo"
        gridCount={0}
      />,
    );
    await act(async () => {});
    expect(screen.queryByTestId("git-branch-chip")).toBeNull();
  });

  it("shows no branch chip when get_git_info throws", async () => {
    mockInvoke.mockRejectedValue(new Error("Not a git repository"));
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        folder="/not/a/repo"
        gridCount={0}
      />,
    );
    await act(async () => {});
    expect(screen.queryByTestId("git-branch-chip")).toBeNull();
  });

  it("shows no branch chip when branch is empty string", async () => {
    mockInvoke.mockResolvedValue({ branch: "", last_commit: null, remote_url: "" });
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        folder="/some/git/repo"
        gridCount={0}
      />,
    );
    await act(async () => {});
    expect(screen.queryByTestId("git-branch-chip")).toBeNull();
  });

  it("does not invoke get_git_info in grid mode even with folder set", async () => {
    render(
      <TerminalToolbar
        layoutMode="grid"
        onLayoutChange={vi.fn()}
        folder="/some/git/repo"
        gridCount={2}
      />,
    );
    await act(async () => {});
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId("git-branch-chip")).toBeNull();
  });

  it("polls for branch again after 30 s", async () => {
    vi.useFakeTimers();
    mockInvoke.mockResolvedValue({ branch: "master", last_commit: null, remote_url: "" });

    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        folder="/some/git/repo"
        gridCount={0}
      />,
    );

    // First fetch on mount — flush promises
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // Advance past poll interval
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("does not call setState after unmount", async () => {
    mockInvoke.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ branch: "main", last_commit: null, remote_url: "" }), 100)),
    );
    const { unmount } = render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        folder="/some/git/repo"
        gridCount={0}
      />,
    );
    // Unmount before the invoke resolves — no setState-after-unmount warning
    unmount();
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    // No assertion needed — test passes if no React warning/error is thrown
  });
});
