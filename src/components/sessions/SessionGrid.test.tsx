import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionGrid } from "./SessionGrid";

// Mock GridCell to avoid deep rendering (it uses SessionTerminal + xterm)
vi.mock("./GridCell", () => ({
  GridCell: ({ sessionId, isFocused }: { sessionId: string; isFocused: boolean }) => (
    <div data-testid={`grid-cell-${sessionId}`} data-focused={isFocused}>
      {sessionId}
    </div>
  ),
}));

describe("SessionGrid", () => {
  const defaultProps = {
    focusedSessionId: null,
    onFocusSession: vi.fn(),
    onMaximizeSession: vi.fn(),
    onRemoveFromGrid: vi.fn(),
  };

  it("renders empty state when no sessions", () => {
    render(<SessionGrid sessionIds={[]} {...defaultProps} />);
    expect(screen.getByText("Keine Sessions im Grid")).toBeTruthy();
  });

  it("renders grid cells for each session", () => {
    render(
      <SessionGrid
        sessionIds={["s1", "s2", "s3"]}
        {...defaultProps}
      />,
    );

    expect(screen.getByTestId("grid-cell-s1")).toBeTruthy();
    expect(screen.getByTestId("grid-cell-s2")).toBeTruthy();
    expect(screen.getByTestId("grid-cell-s3")).toBeTruthy();
  });

  it("passes isFocused=true to the focused session cell", () => {
    render(
      <SessionGrid
        sessionIds={["s1", "s2"]}
        {...defaultProps}
        focusedSessionId="s2"
      />,
    );

    expect(screen.getByTestId("grid-cell-s1").dataset.focused).toBe("false");
    expect(screen.getByTestId("grid-cell-s2").dataset.focused).toBe("true");
  });

  it("uses correct grid areas for 4 sessions", () => {
    const { container } = render(
      <SessionGrid
        sessionIds={["a", "b", "c", "d"]}
        {...defaultProps}
      />,
    );

    const cells = container.querySelectorAll("[data-testid^='grid-cell-']");
    expect(cells).toHaveLength(4);
    // Each cell is wrapped in a div with gridArea
    const wrapper = cells[0]?.parentElement;
    expect(wrapper?.style.gridArea).toBe("a");
  });
});
