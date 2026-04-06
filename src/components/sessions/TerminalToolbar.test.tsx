import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TerminalToolbar } from "./TerminalToolbar";

describe("TerminalToolbar", () => {
  it("shows active session title in single mode", () => {
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        activeSessionTitle="My Session"
        gridCount={0}
      />,
    );
    expect(screen.getByText("My Session")).toBeTruthy();
  });

  it("shows 'Kein Terminal' when no active session title in single mode", () => {
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        gridCount={0}
      />,
    );
    expect(screen.getByText("Kein Terminal")).toBeTruthy();
  });

  it("shows grid count in grid mode", () => {
    render(
      <TerminalToolbar
        layoutMode="grid"
        onLayoutChange={vi.fn()}
        gridCount={3}
      />,
    );
    expect(screen.getByText("Grid (3 Sessions)")).toBeTruthy();
  });

  it("uses singular 'Session' for grid count of 1", () => {
    render(
      <TerminalToolbar
        layoutMode="grid"
        onLayoutChange={vi.fn()}
        gridCount={1}
      />,
    );
    expect(screen.getByText("Grid (1 Session)")).toBeTruthy();
  });

  it("calls onLayoutChange with correct mode on button clicks", () => {
    const onLayoutChange = vi.fn();
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={onLayoutChange}
        gridCount={0}
      />,
    );

    fireEvent.click(screen.getByLabelText("Grid-Ansicht"));
    expect(onLayoutChange).toHaveBeenCalledWith("grid");

    fireEvent.click(screen.getByLabelText("Einzelansicht"));
    expect(onLayoutChange).toHaveBeenCalledWith("single");
  });

  it("renders config panel toggle in single mode when handler provided", () => {
    const onToggle = vi.fn();
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        gridCount={0}
        configPanelOpen={false}
        onToggleConfigPanel={onToggle}
      />,
    );

    const btn = screen.getByLabelText("Konfig-Panel oeffnen");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not render config panel toggle in grid mode", () => {
    render(
      <TerminalToolbar
        layoutMode="grid"
        onLayoutChange={vi.fn()}
        gridCount={2}
        configPanelOpen={false}
        onToggleConfigPanel={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Konfig-Panel oeffnen")).toBeNull();
  });

  it("shows close label when config panel is open", () => {
    render(
      <TerminalToolbar
        layoutMode="single"
        onLayoutChange={vi.fn()}
        gridCount={0}
        configPanelOpen={true}
        onToggleConfigPanel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Konfig-Panel schliessen")).toBeTruthy();
  });
});
