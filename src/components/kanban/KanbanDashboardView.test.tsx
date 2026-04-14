import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KanbanDashboardView } from "./KanbanDashboardView";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";

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

// ── Helpers ───────────────────────────────────────────────────────────

/** Click the "Projekt" toggle button to switch from global to folder mode. */
function switchToFolderMode() {
  fireEvent.click(screen.getByText("Projekt"));
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("KanbanDashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset stores to defaults
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
    });
    useSettingsStore.setState({
      favorites: [],
    });
  });

  // ── Global mode (default) ────────────────────────────────────────────

  it("defaults to global mode and renders board with null folder", () => {
    render(<KanbanDashboardView />);

    // Mode toggle buttons are visible
    expect(screen.getByText("Global")).toBeTruthy();
    expect(screen.getByText("Projekt")).toBeTruthy();

    // Board is rendered with null folder (mock renders "__global__")
    const board = screen.getByTestId("kanban-board");
    expect(board.textContent).toBe("__global__");
  });

  it("global mode shows no folder picker regardless of sessions/favorites", () => {
    useSessionStore.setState({
      sessions: [
        {
          id: "s1",
          title: "My Session",
          folder: "/projects/my-app",
          shell: "powershell",
          status: "running",
          createdAt: Date.now(),
          finishedAt: null,
          exitCode: null,
          lastOutputAt: Date.now(),
          lastOutputSnippet: "",
        },
      ],
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
      screen.getByText(
        "Erstelle eine Session oder füge einen Favoriten hinzu.",
      ),
    ).toBeTruthy();
  });

  it("renders KanbanBoard with active session folder in folder mode", () => {
    useSessionStore.setState({
      sessions: [
        {
          id: "s1",
          title: "My Session",
          folder: "/projects/my-app",
          shell: "powershell",
          status: "running",
          createdAt: Date.now(),
          finishedAt: null,
          exitCode: null,
          lastOutputAt: Date.now(),
          lastOutputSnippet: "",
        },
      ],
      activeSessionId: "s1",
    });

    render(<KanbanDashboardView />);
    switchToFolderMode();

    const board = screen.getByTestId("kanban-board");
    expect(board.textContent).toBe("/projects/my-app");
  });

  it("renders folder picker with favorites in folder mode", () => {
    useSettingsStore.setState({
      favorites: [
        {
          id: "fav-1",
          path: "/projects/fav-project",
          label: "Fav Project",
          shell: "powershell",
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ],
    });

    render(<KanbanDashboardView />);
    switchToFolderMode();

    // Folder picker should show the favorite
    expect(screen.getByText("Fav Project")).toBeTruthy();
  });

  it("switches folder when user selects from picker in folder mode", () => {
    useSettingsStore.setState({
      favorites: [
        {
          id: "fav-1",
          path: "/projects/alpha",
          label: "Alpha",
          shell: "powershell",
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
        {
          id: "fav-2",
          path: "/projects/beta",
          label: "Beta",
          shell: "powershell",
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ],
    });

    render(<KanbanDashboardView />);
    switchToFolderMode();

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "/projects/beta" } });

    const board = screen.getByTestId("kanban-board");
    expect(board.textContent).toBe("/projects/beta");
  });

  it("shows 'Projekt auswählen' when favorites exist but none selected and no session", () => {
    useSettingsStore.setState({
      favorites: [
        {
          id: "fav-1",
          path: "/projects/alpha",
          label: "Alpha",
          shell: "powershell",
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ],
    });

    render(<KanbanDashboardView />);
    switchToFolderMode();

    // Select empty value to deselect
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "" } });

    expect(screen.getByText("Projekt auswählen")).toBeTruthy();
  });
});
