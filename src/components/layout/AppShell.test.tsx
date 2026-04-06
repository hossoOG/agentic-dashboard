import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { useUIStore } from "../../store/uiStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../Header", () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock("./SideNav", () => ({
  SideNav: () => <nav data-testid="side-nav" />,
}));

vi.mock("../sessions/SessionManagerView", () => ({
  SessionManagerView: () => <div data-testid="session-manager" />,
}));

vi.mock("../pipeline/PipelineView", () => ({
  PipelineView: () => <div data-testid="pipeline-view" />,
}));

// Lazy-loaded views — mock as simple components
vi.mock("./placeholders", () => ({
  SettingsPlaceholder: () => <div data-testid="settings-placeholder" />,
}));
vi.mock("../kanban/KanbanDashboardView", () => ({
  KanbanDashboardView: () => <div data-testid="kanban-view" />,
}));
vi.mock("../logs/LogViewer", () => ({
  LogViewer: () => <div data-testid="log-viewer" />,
}));
vi.mock("../library/LibraryView", () => ({
  LibraryView: () => <div data-testid="library-view" />,
}));
vi.mock("../editor/MarkdownEditorView", () => ({
  MarkdownEditorView: () => <div data-testid="editor-view" />,
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ activeTab: "sessions" });
  });

  it("renders SideNav, Header, and main content area", () => {
    render(<AppShell />);
    expect(screen.getByTestId("side-nav")).toBeTruthy();
    expect(screen.getByTestId("header")).toBeTruthy();
    expect(screen.getByTestId("session-manager")).toBeTruthy();
  });

  it("renders SessionManagerView for default/sessions tab", () => {
    render(<AppShell />);
    expect(screen.getByTestId("session-manager")).toBeTruthy();
  });

  it("renders PipelineView when activeTab is pipeline", () => {
    useUIStore.setState({ activeTab: "pipeline" });
    render(<AppShell />);
    expect(screen.getByTestId("pipeline-view")).toBeTruthy();
  });

  it("has flex layout with full screen dimensions", () => {
    const { container } = render(<AppShell />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("flex");
    expect(root.className).toContain("h-screen");
    expect(root.className).toContain("w-screen");
  });
});
