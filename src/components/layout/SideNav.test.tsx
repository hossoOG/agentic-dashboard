import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SideNav } from "./SideNav";
import { useUIStore } from "../../store/uiStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../../hooks/useAutoUpdate", () => ({
  useAutoUpdate: () => ({
    status: "idle",
    progress: 0,
    error: null,
    newVersion: null,
    lastChecked: null,
    checkForUpdate: vi.fn(),
    downloadAndInstall: vi.fn(),
    confirmRelaunch: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock("../shared/NotesPanel", () => ({
  NotesPanel: ({ variant }: { variant?: string }) => (
    <button data-testid="notes-panel" data-variant={variant}>Notizen</button>
  ),
}));

vi.mock("../shared/ChangelogDialog", () => ({
  ChangelogDialog: () => null,
}));

vi.mock("../shared/UpdateNotification", () => ({
  UpdateNotification: () => null,
}));

describe("SideNav", () => {
  beforeEach(() => {
    useUIStore.setState({ activeTab: "sessions" });
    vi.clearAllMocks();
  });

  it("renders all 5 visible nav items with German labels", () => {
    render(<SideNav />);
    expect(screen.getByLabelText("Sitzungen")).toBeTruthy();
    expect(screen.getByLabelText("Kanban")).toBeTruthy();
    expect(screen.getByLabelText("Bibliothek")).toBeTruthy();
    expect(screen.getByLabelText("Editor")).toBeTruthy();
    expect(screen.getByLabelText("Protokolle")).toBeTruthy();
    // Pipeline tab is disabled (not production-ready)
    expect(screen.queryByLabelText("Pipeline")).toBeNull();
    // Settings tab is hidden (#138)
    expect(screen.queryByLabelText("Einstellungen")).toBeNull();
  });

  it("highlights active tab and calls setActiveTab on click", () => {
    render(<SideNav />);

    const sessionsBtn = screen.getByLabelText("Sitzungen");
    // active tab has "text-accent" class
    expect(sessionsBtn.className).toContain("text-accent");

    const kanbanBtn = screen.getByLabelText("Kanban");
    // non-active tab should not have text-accent
    expect(kanbanBtn.className).not.toContain("text-accent");

    fireEvent.click(kanbanBtn);
    expect(useUIStore.getState().activeTab).toBe("kanban");
  });

  it("shows permanent text labels (not just icon tooltips)", () => {
    render(<SideNav />);
    expect(screen.getByText("Sitzungen")).toBeTruthy();
    expect(screen.getByText("Kanban")).toBeTruthy();
    expect(screen.getByText("Bibliothek")).toBeTruthy();
    expect(screen.getByText("Protokolle")).toBeTruthy();
  });

  it("renders badge when count > 0 and hides when 0 or undefined", () => {
    const { rerender } = render(<SideNav badges={{ sessions: 3 }} />);
    expect(screen.getByText("3")).toBeTruthy();

    rerender(<SideNav badges={{ sessions: 0 }} />);
    expect(screen.queryByText("0")).toBeNull();

    rerender(<SideNav badges={{}} />);
    // no badge numerals visible
    expect(screen.queryByText("3")).toBeNull();
  });

  it("caps badge at 99+ when count > 99", () => {
    render(<SideNav badges={{ sessions: 150 }} />);
    expect(screen.getByText("99+")).toBeTruthy();
    expect(screen.queryByText("150")).toBeNull();
  });

  it("renders version badge", () => {
    render(<SideNav />);
    expect(screen.getByTitle(/Version/)).toBeTruthy();
  });

  it("renders theme toggle and notes panel in sidebar variant", () => {
    render(<SideNav />);
    expect(screen.getByLabelText(/Mode aktivieren/)).toBeTruthy();
    const notesPanel = screen.getByTestId("notes-panel");
    expect(notesPanel.dataset.variant).toBe("sidebar");
  });
});
