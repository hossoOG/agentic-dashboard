import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { KanbanDashboardView } from "./KanbanDashboardView";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { invoke } from "@tauri-apps/api/core";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

// Mock KanbanBoard to avoid its async data fetching
vi.mock("./KanbanBoard", () => ({
  KanbanBoard: ({ folder }: { folder: string | null }) => (
    <div data-testid="kanban-board">{folder ?? "__global__"}</div>
  ),
}));

const mockInvoke = vi.mocked(invoke);
const GIT_INFO_OK = { branch: "main", remote_url: "", last_commit: null };

// ── Helpers ───────────────────────────────────────────────────────────

/** Click the "Projekt" toggle button to switch from global to folder mode. */
function switchToFolderMode() {
  fireEvent.click(screen.getByText("Projekt"));
}

function makeSession(folder: string, id = "s1") {
  return {
    id,
    title: "My Session",
    folder,
    shell: "powershell" as const,
    status: "running" as const,
    createdAt: Date.now(),
    finishedAt: null,
    exitCode: null,
    lastOutputAt: Date.now(),
    lastOutputSnippet: "",
  };
}

function makeFavorite(id: string, path: string, label: string) {
  return {
    id,
    path,
    label,
    shell: "powershell" as const,
    addedAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("KanbanDashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default: get_git_info resolves for any folder, others reject
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_git_info") return Promise.resolve(GIT_INFO_OK);
      return Promise.reject(new Error(`unhandled invoke: ${cmd}`));
    });
    // Reset stores to defaults
    useSessionStore.setState({ sessions: [], activeSessionId: null });
    useSettingsStore.setState({ favorites: [] });
  });

  // ── Global mode (default) ────────────────────────────────────────────

  it("defaults to global mode and renders board with null folder", () => {
    render(<KanbanDashboardView />);

    expect(screen.getByText("Global")).toBeTruthy();
    expect(screen.getByText("Projekt")).toBeTruthy();

    const board = screen.getByTestId("kanban-board");
    expect(board.textContent).toBe("__global__");
  });

  it("global mode shows no folder picker regardless of sessions/favorites", () => {
    useSessionStore.setState({
      sessions: [makeSession("/projects/my-app")],
      activeSessionId: "s1",
    });

    render(<KanbanDashboardView />);

    // No combobox (folder picker) in global mode
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  // ── Folder mode ──────────────────────────────────────────────────────

  it("shows empty state in folder mode when no folder and no favorites", () => {
    render(<KanbanDashboardView />);
    switchToFolderMode();

    expect(screen.getByText("Kein Projekt verfügbar")).toBeTruthy();
    expect(
      screen.getByText("Erstelle eine Session oder füge einen Favoriten hinzu."),
    ).toBeTruthy();
  });

  it("renders KanbanBoard with active session folder after git validation", async () => {
    useSessionStore.setState({
      sessions: [makeSession("/projects/my-app")],
      activeSessionId: "s1",
    });

    render(<KanbanDashboardView />);
    switchToFolderMode();

    // Git validation is async — wait for the board to reflect the validated folder
    await waitFor(() => {
      const board = screen.getByTestId("kanban-board");
      expect(board.textContent).toBe("/projects/my-app");
    });
  });

  it("renders folder picker with favorites after git validation", async () => {
    useSettingsStore.setState({
      favorites: [makeFavorite("fav-1", "/projects/fav-project", "Fav Project")],
    });

    render(<KanbanDashboardView />);
    switchToFolderMode();

    await waitFor(() => {
      expect(screen.getByText("Fav Project")).toBeTruthy();
    });
  });

  it("switches folder when user selects from picker", async () => {
    useSettingsStore.setState({
      favorites: [
        makeFavorite("fav-1", "/projects/alpha", "Alpha"),
        makeFavorite("fav-2", "/projects/beta", "Beta"),
      ],
    });

    render(<KanbanDashboardView />);
    switchToFolderMode();

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "/projects/beta" } });

    expect(screen.getByTestId("kanban-board").textContent).toBe("/projects/beta");
  });

  it("keeps a valid folder when user deselects (auto-fallback to first available)", async () => {
    useSettingsStore.setState({
      favorites: [
        makeFavorite("fav-1", "/projects/alpha", "Alpha"),
        makeFavorite("fav-2", "/projects/beta", "Beta"),
      ],
    });

    render(<KanbanDashboardView />);
    switchToFolderMode();

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeTruthy();
    });

    // Select beta first
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "/projects/beta" } });
    expect(screen.getByTestId("kanban-board").textContent).toBe("/projects/beta");

    // Deselect (empty value) → component auto-falls back to first valid folder
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });

    // Board should still show a valid folder (not empty/broken)
    const board = screen.getByTestId("kanban-board");
    expect(board.textContent).not.toBe("");
    expect(board.textContent).not.toBe("__global__");
  });
});
