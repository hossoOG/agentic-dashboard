import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GridCellChrome, GridCell } from "./GridCell";
import { useSessionStore } from "../../store/sessionStore";
import type { ClaudeSession } from "../../store/sessionStore";

// Mock useNowTick to return a stable timestamp
vi.mock("../../hooks/useNowTick", () => ({
  useNowTick: () => 1700000000000,
}));

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: "cell-1",
    title: "Grid Session",
    folder: "/test",
    shell: "powershell",
    status: "running",
    createdAt: 1700000000000 - 60000,
    finishedAt: null,
    exitCode: null,
    lastOutputAt: 1700000000000 - 2000,
    lastOutputSnippet: "some output",
    ...overrides,
  };
}

describe("GridCellChrome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      sessions: [makeSession()],
      activeSessionId: "cell-1",
    });
  });

  it("renders session title (Terminal lives outside the chrome now)", () => {
    render(
      <GridCellChrome
        sessionId="cell-1"
        isFocused={false}
        onFocus={vi.fn()}
        onMaximize={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("Grid Session")).toBeTruthy();
    // Scroll-Bug-Fix: Terminal darf NICHT innerhalb des Chrome-Elements leben.
    expect(screen.queryByTestId("terminal-cell-1")).toBeNull();
  });

  it("uses fallback title when session not found", () => {
    useSessionStore.setState({ sessions: [] });

    render(
      <GridCellChrome
        sessionId="missing"
        isFocused={false}
        onFocus={vi.fn()}
        onMaximize={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("Session")).toBeTruthy();
  });

  it("calls onFocus when chrome is clicked", () => {
    const onFocus = vi.fn();
    render(
      <GridCellChrome
        sessionId="cell-1"
        isFocused={false}
        onFocus={onFocus}
        onMaximize={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Grid Session"));
    expect(onFocus).toHaveBeenCalled();
  });

  it("calls onMaximize when maximize button is clicked without triggering onFocus", () => {
    const onFocus = vi.fn();
    const onMaximize = vi.fn();
    render(
      <GridCellChrome
        sessionId="cell-1"
        isFocused={false}
        onFocus={onFocus}
        onMaximize={onMaximize}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Maximieren"));
    expect(onMaximize).toHaveBeenCalledTimes(1);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();
    render(
      <GridCellChrome
        sessionId="cell-1"
        isFocused={false}
        onFocus={vi.fn()}
        onMaximize={vi.fn()}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByLabelText("Aus Grid entfernen"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("applies focused border styling when isFocused is true", () => {
    const { container } = render(
      <GridCellChrome
        sessionId="cell-1"
        isFocused={true}
        onFocus={vi.fn()}
        onMaximize={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const chrome = container.firstChild as HTMLElement;
    expect(chrome.className).toContain("border-accent");
  });

  it("applies neutral border styling when isFocused is false", () => {
    const { container } = render(
      <GridCellChrome
        sessionId="cell-1"
        isFocused={false}
        onFocus={vi.fn()}
        onMaximize={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const chrome = container.firstChild as HTMLElement;
    expect(chrome.className).toContain("border-neutral-700");
  });

  it("GridCell-Alias verweist auf GridCellChrome (Backwards-Compat)", () => {
    expect(GridCell).toBe(GridCellChrome);
  });
});
