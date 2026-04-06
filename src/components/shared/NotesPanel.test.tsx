import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NotesPanel } from "./NotesPanel";
import { useSettingsStore } from "../../store/settingsStore";
import { useSessionStore } from "../../store/sessionStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        return ({ children, ...props }: { children?: React.ReactNode }) => {
          const filtered: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(props)) {
            if (!["layout", "initial", "animate", "exit", "transition", "whileHover", "whileTap"].includes(k)) {
              filtered[k] = v;
            }
          }
          return <div {...filtered}>{children}</div>;
        };
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe("NotesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      globalNotes: "",
      projectNotes: {},
      favorites: [],
    });
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
    });
  });

  it("renders the Notizen button", () => {
    render(<NotesPanel />);
    expect(screen.getByLabelText("Notizen")).toBeTruthy();
  });

  it("opens panel on button click", () => {
    render(<NotesPanel />);
    fireEvent.click(screen.getByLabelText("Notizen"));
    // Should show tab buttons
    expect(screen.getByText("Globale Notizen")).toBeTruthy();
    expect(screen.getByText("Projekt-Notizen")).toBeTruthy();
  });

  it("closes panel on second button click", () => {
    render(<NotesPanel />);
    fireEvent.click(screen.getByLabelText("Notizen"));
    expect(screen.getByText("Globale Notizen")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Notizen"));
    expect(screen.queryByText("Globale Notizen")).toBeNull();
  });

  it("defaults to global tab when no sessions or favorites", () => {
    render(<NotesPanel />);
    fireEvent.click(screen.getByLabelText("Notizen"));
    // Global tab should be active — textarea with global placeholder visible
    expect(screen.getByPlaceholderText("Globale Stichsaetze, Ideen, TODOs...")).toBeTruthy();
  });

  it("shows global notes textarea with stored value", () => {
    useSettingsStore.setState({ globalNotes: "My global notes" });
    render(<NotesPanel />);
    fireEvent.click(screen.getByLabelText("Notizen"));

    // Switch to global tab
    fireEvent.click(screen.getByText("Globale Notizen"));
    const textarea = screen.getByPlaceholderText("Globale Stichsaetze, Ideen, TODOs...");
    expect((textarea as HTMLTextAreaElement).value).toBe("My global notes");
  });

  it("updates global notes on textarea change", () => {
    render(<NotesPanel />);
    fireEvent.click(screen.getByLabelText("Notizen"));
    fireEvent.click(screen.getByText("Globale Notizen"));

    const textarea = screen.getByPlaceholderText("Globale Stichsaetze, Ideen, TODOs...");
    fireEvent.change(textarea, { target: { value: "Updated notes" } });

    expect(useSettingsStore.getState().globalNotes).toBe("Updated notes");
  });

  it("shows project notes when session is active", () => {
    useSessionStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Test",
          folder: "C:\\Projects\\test",
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
    useSettingsStore.setState({
      projectNotes: { "c:/projects/test": "Project note content" },
    });

    render(<NotesPanel />);
    fireEvent.click(screen.getByLabelText("Notizen"));

    // Should show project tab with project notes textarea
    const textarea = screen.getByPlaceholderText("Notizen für dieses Projekt...");
    expect((textarea as HTMLTextAreaElement).value).toBe("Project note content");
  });

  it("shows folder picker when no active session but favorites exist", () => {
    useSettingsStore.setState({
      favorites: [{
        id: "fav-1",
        path: "C:\\Projects\\fav",
        label: "Favorite Proj",
        shell: "powershell",
        addedAt: Date.now(),
        lastUsedAt: Date.now(),
      }],
    });

    render(<NotesPanel />);
    fireEvent.click(screen.getByLabelText("Notizen"));

    // Should show project tab with folder picker — button shows folderLabel result
    fireEvent.click(screen.getByText("Projekt-Notizen"));
    // The folder picker button shows the auto-selected folder label via folderLabel()
    expect(screen.getByText("fav")).toBeTruthy();

    // Open the dropdown to see the full label
    fireEvent.click(screen.getByText("fav"));
    expect(screen.getByText("Favorite Proj")).toBeTruthy();
  });

  it("highlights button when notes exist", () => {
    useSettingsStore.setState({ globalNotes: "Some notes" });
    const { container } = render(<NotesPanel />);
    const button = container.querySelector("button");
    expect(button?.className).toContain("text-accent");
  });

  it("closes panel on outside click", () => {
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <NotesPanel />
      </div>,
    );
    fireEvent.click(screen.getByLabelText("Notizen"));
    expect(screen.getByText("Globale Notizen")).toBeTruthy();

    // Simulate outside click
    act(() => {
      fireEvent.mouseDown(screen.getByTestId("outside"));
    });
    expect(screen.queryByText("Globale Notizen")).toBeNull();
  });
});
