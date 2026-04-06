import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SideNav } from "./SideNav";
import { useUIStore } from "../../store/uiStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("SideNav", () => {
  beforeEach(() => {
    useUIStore.setState({ activeTab: "sessions" });
    vi.clearAllMocks();
  });

  it("renders all 6 visible nav items with German labels", () => {
    render(<SideNav />);
    expect(screen.getByLabelText("Sitzungen")).toBeTruthy();
    expect(screen.getByLabelText("Pipeline")).toBeTruthy();
    expect(screen.getByLabelText("Kanban")).toBeTruthy();
    expect(screen.getByLabelText("Bibliothek")).toBeTruthy();
    expect(screen.getByLabelText("Editor")).toBeTruthy();
    expect(screen.getByLabelText("Protokolle")).toBeTruthy();
    // Settings tab is hidden (#138)
    expect(screen.queryByLabelText("Einstellungen")).toBeNull();
  });

  it("highlights active tab and calls setActiveTab on click", () => {
    render(<SideNav />);

    const sessionsBtn = screen.getByLabelText("Sitzungen");
    // active tab has "text-accent" class
    expect(sessionsBtn.className).toContain("text-accent");

    const pipelineBtn = screen.getByLabelText("Pipeline");
    // non-active tab should not have text-accent
    expect(pipelineBtn.className).not.toContain("text-accent");

    fireEvent.click(pipelineBtn);
    expect(useUIStore.getState().activeTab).toBe("pipeline");
  });

  it("shows permanent text labels (not just icon tooltips)", () => {
    render(<SideNav />);
    expect(screen.getByText("Sitzungen")).toBeTruthy();
    expect(screen.getByText("Pipeline")).toBeTruthy();
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
    render(<SideNav badges={{ pipeline: 150 }} />);
    expect(screen.getByText("99+")).toBeTruthy();
    expect(screen.queryByText("150")).toBeNull();
  });
});
