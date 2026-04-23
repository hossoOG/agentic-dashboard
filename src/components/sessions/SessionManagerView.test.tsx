import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { SessionManagerView } from "./SessionManagerView";
import { useSessionStore } from "../../store/sessionStore";
import { useUIStore } from "../../store/uiStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

// Shared unmount-spy for the SessionTerminal mock — populated per test.
// Allows a Regression-Test to verify that Tab-Switches do NOT unmount
// previously mounted SessionTerminal-Instances (Scroll-Bug-Fix aus 8b820f5).
const sessionTerminalUnmountSpy = vi.fn<(sessionId: string) => void>();

// Mock heavy child components to keep tests fast and isolated.
// Two testids are emitted:
//   - "session-terminal" → legacy-Selector (bestehende Tests).
//   - `terminal-${sessionId}` → dynamischer Selector (Regression-Tests).
vi.mock("./SessionTerminal", () => ({
  SessionTerminal: ({ sessionId }: { sessionId: string }) => {
    useEffect(() => {
      return () => {
        sessionTerminalUnmountSpy(sessionId);
      };
    }, [sessionId]);
    return (
      <div data-testid="session-terminal">
        <div data-testid={`terminal-${sessionId}`}>{sessionId}</div>
      </div>
    );
  },
}));

vi.mock("./SessionGrid", () => ({
  SessionGrid: () => <div data-testid="session-grid" />,
}));

vi.mock("./ConfigPanel", () => ({
  ConfigPanel: () => <div data-testid="config-panel" />,
}));

vi.mock("./FavoritePreview", () => ({
  FavoritePreview: () => <div data-testid="favorite-preview" />,
}));

vi.mock("./AgentBottomPanel", () => ({
  AgentBottomPanel: () => <div data-testid="agent-bottom-panel" />,
}));

vi.mock("./hooks/useResizeHandle", () => ({
  useResizeHandle: () => ({ containerRef: { current: null }, handleResizeStart: vi.fn() }),
}));

vi.mock("./hooks/useSessionEvents", () => ({
  useSessionEvents: vi.fn(),
}));

vi.mock("./hooks/useSessionCreation", () => ({
  useSessionCreation: () => ({
    handleResumeSession: vi.fn(),
    handleQuickStart: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionTerminalUnmountSpy.mockClear();
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    layoutMode: "single",
    gridSessionIds: [],
    focusedGridSessionId: null,
  });
  useUIStore.setState({ previewFolder: null });
});

// Test-Helper: Session-Fabrik für Regression-Tests.
function mockSession(id: string) {
  return {
    id,
    title: `Session ${id}`,
    folder: "/test",
    shell: "powershell" as const,
    status: "running" as const,
    createdAt: Date.now(),
    finishedAt: null,
    exitCode: null,
    lastOutputAt: Date.now(),
    lastOutputSnippet: "",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("SessionManagerView", () => {
  it("renders empty state when no sessions exist", () => {
    render(<SessionManagerView />);

    // EmptyState should be visible (it has a "Neue Session" text or similar)
    // The sidebar toggle button should be present
    const toggleBtn = screen.getByTitle("Sidebar ausblenden");
    expect(toggleBtn).toBeTruthy();
  });

  it("renders terminal when an active session exists", () => {
    useSessionStore.setState({
      sessions: [
        {
          id: "s-1",
          title: "Test",
          folder: "/test",
          shell: "powershell",
          status: "running",
          createdAt: Date.now(),
          finishedAt: null,
          exitCode: null,
          lastOutputAt: Date.now(),
          lastOutputSnippet: "",
        },
      ],
      activeSessionId: "s-1",
      layoutMode: "single",
      gridSessionIds: [],
      focusedGridSessionId: null,
    });

    render(<SessionManagerView />);

    expect(screen.getByTestId("session-terminal")).toBeTruthy();
  });

  it("shows favorite preview even when a session is active", () => {
    useSessionStore.setState({
      sessions: [
        {
          id: "s-1",
          title: "Test",
          folder: "/test",
          shell: "powershell",
          status: "running",
          createdAt: Date.now(),
          finishedAt: null,
          exitCode: null,
          lastOutputAt: Date.now(),
          lastOutputSnippet: "",
        },
      ],
      activeSessionId: "s-1",
      layoutMode: "single",
      gridSessionIds: [],
      focusedGridSessionId: null,
    });
    useUIStore.setState({ previewFolder: "/some/project" });

    render(<SessionManagerView />);

    expect(screen.getByTestId("favorite-preview")).toBeTruthy();
    expect(screen.queryByTestId("session-terminal")).toBeNull();
  });

  it("returns to terminal when preview is closed", () => {
    useSessionStore.setState({
      sessions: [
        {
          id: "s-1",
          title: "Test",
          folder: "/test",
          shell: "powershell",
          status: "running",
          createdAt: Date.now(),
          finishedAt: null,
          exitCode: null,
          lastOutputAt: Date.now(),
          lastOutputSnippet: "",
        },
      ],
      activeSessionId: "s-1",
      layoutMode: "single",
      gridSessionIds: [],
      focusedGridSessionId: null,
    });
    useUIStore.setState({ previewFolder: "/some/project" });

    const { rerender } = render(<SessionManagerView />);
    expect(screen.getByTestId("favorite-preview")).toBeTruthy();

    // Close the preview
    useUIStore.getState().closePreview();
    rerender(<SessionManagerView />);

    expect(screen.queryByTestId("favorite-preview")).toBeNull();
    expect(screen.getByTestId("session-terminal")).toBeTruthy();
  });

  it("renders session grid in grid layout mode", () => {
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      layoutMode: "grid",
      gridSessionIds: ["s-1", "s-2"],
      focusedGridSessionId: null,
    });

    render(<SessionManagerView />);

    expect(screen.getByTestId("session-grid")).toBeTruthy();
  });
});

// ── Regression-Tests: Scroll-Bug-Fix (Commit 8b820f5) ────────────────
// Sichern ab, dass im Single-Mode ALLE Sessions gleichzeitig gemountet
// bleiben, damit xterm-Scrollback einen Tab-Switch überlebt.
describe("SessionManagerView — Scroll-Regression (always-mounted Terminals)", () => {
  it("rendert alle Sessions gleichzeitig im Single-Mode (3 Sessions → 3 Terminal-Instanzen)", () => {
    useSessionStore.setState({
      sessions: [mockSession("A"), mockSession("B"), mockSession("C")],
      activeSessionId: "A",
      layoutMode: "single",
      gridSessionIds: [],
      focusedGridSessionId: null,
    });

    render(<SessionManagerView />);

    // Alle drei Terminal-Instanzen müssen gerendert sein — nicht nur die aktive.
    expect(screen.getByTestId("terminal-A")).toBeTruthy();
    expect(screen.getByTestId("terminal-B")).toBeTruthy();
    expect(screen.getByTestId("terminal-C")).toBeTruthy();
  });

  it("zeigt nur die aktive Session, versteckt die anderen (display:none)", () => {
    useSessionStore.setState({
      sessions: [mockSession("A"), mockSession("B")],
      activeSessionId: "B",
      layoutMode: "single",
      gridSessionIds: [],
      focusedGridSessionId: null,
    });

    const { container } = render(<SessionManagerView />);

    const wrapperA = container.querySelector('[data-session-wrapper="A"]');
    const wrapperB = container.querySelector('[data-session-wrapper="B"]');

    expect(wrapperA).toBeTruthy();
    expect(wrapperB).toBeTruthy();
    // Inaktive Session → display:none.
    expect((wrapperA as HTMLElement).style.display).toBe("none");
    // Aktive Session → display:block (nicht none).
    expect((wrapperB as HTMLElement).style.display).toBe("block");
  });

  it("unmountet SessionTerminal nicht beim Tab-Switch (Scrollback-Buffer bleibt erhalten)", () => {
    useSessionStore.setState({
      sessions: [mockSession("A"), mockSession("B")],
      activeSessionId: "A",
      layoutMode: "single",
      gridSessionIds: [],
      focusedGridSessionId: null,
    });

    const { rerender } = render(<SessionManagerView />);

    // Initial: keine Unmounts.
    expect(sessionTerminalUnmountSpy).not.toHaveBeenCalled();

    // Tab-Switch von A zu B — beide Sessions bleiben im DOM.
    act(() => {
      useSessionStore.setState({ activeSessionId: "B" });
    });
    rerender(<SessionManagerView />);

    // Weder A noch B dürfen unmountet worden sein.
    expect(sessionTerminalUnmountSpy).not.toHaveBeenCalledWith("A");
    expect(sessionTerminalUnmountSpy).not.toHaveBeenCalledWith("B");
    expect(sessionTerminalUnmountSpy).not.toHaveBeenCalled();

    // Beide Terminals weiterhin im DOM.
    expect(screen.getByTestId("terminal-A")).toBeTruthy();
    expect(screen.getByTestId("terminal-B")).toBeTruthy();
  });
});
