import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionManagerView } from "./SessionManagerView";
import { useSessionStore } from "../../store/sessionStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

// Mock heavy child components to keep tests fast and isolated
vi.mock("./SessionTerminal", () => ({
  SessionTerminal: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="session-terminal">{sessionId}</div>
  ),
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
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    layoutMode: "single",
    gridSessionIds: [],
    focusedGridSessionId: null,
  });
});

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
    expect(screen.getByTestId("agent-bottom-panel")).toBeTruthy();
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
