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

  it("renders all 7 nav items with aria-labels", () => {
    render(<SideNav />);
    expect(screen.getByLabelText("Sessions")).toBeTruthy();
    expect(screen.getByLabelText("Pipeline")).toBeTruthy();
    expect(screen.getByLabelText("Kanban")).toBeTruthy();
    expect(screen.getByLabelText("Library")).toBeTruthy();
    expect(screen.getByLabelText("Editor")).toBeTruthy();
    expect(screen.getByLabelText("Logs")).toBeTruthy();
    expect(screen.getByLabelText("Einstellungen")).toBeTruthy();
  });

  it("highlights active tab and calls setActiveTab on click", () => {
    render(<SideNav />);

    const sessionsBtn = screen.getByLabelText("Sessions");
    // active tab has "text-accent" class
    expect(sessionsBtn.className).toContain("text-accent");

    const pipelineBtn = screen.getByLabelText("Pipeline");
    // non-active tab should not have text-accent
    expect(pipelineBtn.className).not.toContain("text-accent");

    fireEvent.click(pipelineBtn);
    expect(useUIStore.getState().activeTab).toBe("pipeline");
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
