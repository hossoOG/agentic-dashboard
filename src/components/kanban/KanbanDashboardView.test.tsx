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
  KanbanBoard: ({ folder }: { folder: string }) => (
    <div data-testid="kanban-board">{folder}</div>
  ),
}));

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

  it("shows empty state when no folder and no favorites", () => {
    render(<KanbanDashboardView />);

    expect(screen.getByText("Kein Projekt verfuegbar")).toBeTruthy();
    expect(
      screen.getByText(
        "Erstelle eine Session oder fuege einen Favoriten hinzu.",
      ),
    ).toBeTruthy();
  });

  it("renders KanbanBoard with active session folder", () => {
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

    const board = screen.getByTestId("kanban-board");
    expect(board.textContent).toBe("/projects/my-app");
  });

  it("renders folder picker with favorites", () => {
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

    // Folder picker should show the favorite
    expect(screen.getByText("Fav Project")).toBeTruthy();
  });

  it("switches folder when user selects from picker", () => {
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

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "/projects/beta" } });

    const board = screen.getByTestId("kanban-board");
    expect(board.textContent).toBe("/projects/beta");
  });

  it("shows 'Projekt auswaehlen' when favorites exist but none selected and no session", () => {
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

    // Select empty value to deselect
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "" } });

    expect(screen.getByText("Projekt auswaehlen")).toBeTruthy();
  });
});
