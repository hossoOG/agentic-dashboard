import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { KanbanCard, type KanbanIssue } from "./KanbanCard";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockOpen = vi.fn();
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

vi.mock("../../utils/errorLogger", () => ({
  logWarn: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeIssue(overrides: Partial<KanbanIssue> = {}): KanbanIssue {
  return {
    number: 42,
    title: "Implement feature X",
    state: "OPEN",
    labels: [{ name: "bug", color: "d73a4a" }],
    assignee: "alice",
    url: "https://github.com/org/repo/issues/42",
    ...overrides,
  };
}

/**
 * jsdom does not propagate clientX/clientY from fireEvent.pointerMove init
 * into React's SyntheticEvent. Use native PointerEvent constructors instead.
 * Wrap in act() so React state updates (setIsDragging) are flushed synchronously.
 */
function nativePointerDown(element: Element, clientX = 0, clientY = 0) {
  act(() => {
    element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX, clientY, button: 0 }),
    );
  });
}

function nativePointerMove(element: Element, clientX: number, clientY = 0) {
  act(() => {
    element.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, cancelable: true, clientX, clientY }),
    );
  });
}

function nativePointerUp(element: Element) {
  act(() => {
    element.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, cancelable: true }),
    );
  });
}

/** Simulate a full drag gesture beyond the 5px threshold */
function simulateDrag(element: Element, dx = 20) {
  nativePointerDown(element);
  nativePointerMove(element, dx);
  nativePointerUp(element);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("KanbanCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpen.mockResolvedValue(undefined);
  });

  it("renders issue number, title, labels, and assignee", () => {
    render(<KanbanCard issue={makeIssue()} />);

    expect(screen.getByText("#42")).toBeTruthy();
    expect(screen.getByText("Implement feature X")).toBeTruthy();
    expect(screen.getByText("bug")).toBeTruthy();
    expect(screen.getByText("alice")).toBeTruthy();
  });

  it("renders multiple labels with correct styling", () => {
    const issue = makeIssue({
      labels: [
        { name: "bug", color: "d73a4a" },
        { name: "priority", color: "#ff0000" },
      ],
    });
    render(<KanbanCard issue={issue} />);

    const bugLabel = screen.getByText("bug");
    expect(bugLabel).toBeTruthy();
    // jsdom normalizes hex to rgb
    expect(bugLabel.style.color).toBe("rgb(215, 58, 74)");

    const priorityLabel = screen.getByText("priority");
    expect(priorityLabel).toBeTruthy();
    expect(priorityLabel.style.color).toBe("rgb(255, 0, 0)");
  });

  it("hides assignee when empty", () => {
    render(<KanbanCard issue={makeIssue({ assignee: "" })} />);
    expect(screen.queryByText("alice")).toBeNull();
  });

  it("calls onClick when card is clicked (no drag)", () => {
    const onClick = vi.fn();
    render(<KanbanCard issue={makeIssue()} onClick={onClick} />);

    fireEvent.click(screen.getByText("Implement feature X"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("card has cursor-grab class for drag affordance", () => {
    const { container } = render(<KanbanCard issue={makeIssue()} />);
    const card = container.firstElementChild!;
    expect(card.className).toContain("cursor-grab");
  });

  it("calls onDragStart when pointer moves beyond threshold", () => {
    const onDragStart = vi.fn();
    const { container } = render(
      <KanbanCard issue={makeIssue()} onDragStart={onDragStart} />,
    );

    const card = container.firstElementChild!;
    nativePointerDown(card, 0, 0);
    nativePointerMove(card, 10); // 10px > 5px threshold

    expect(onDragStart).toHaveBeenCalledOnce();
  });

  it("does NOT call onDragStart for sub-threshold pointer move", () => {
    const onDragStart = vi.fn();
    const { container } = render(
      <KanbanCard issue={makeIssue()} onDragStart={onDragStart} />,
    );

    const card = container.firstElementChild!;
    nativePointerDown(card, 0, 0);
    nativePointerMove(card, 3); // 3px < 5px threshold

    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("calls onDragEnd on pointerUp after a drag", () => {
    const onDragEnd = vi.fn();
    const { container } = render(
      <KanbanCard issue={makeIssue()} onDragEnd={onDragEnd} />,
    );

    const card = container.firstElementChild!;
    simulateDrag(card);

    expect(onDragEnd).toHaveBeenCalledOnce();
  });

  it("does NOT call onDragEnd when pointerUp follows no drag (pure click)", () => {
    const onDragEnd = vi.fn();
    const { container } = render(
      <KanbanCard issue={makeIssue()} onDragEnd={onDragEnd} />,
    );

    const card = container.firstElementChild!;
    nativePointerDown(card);
    nativePointerUp(card);

    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it("suppresses onClick during active drag", () => {
    const onClick = vi.fn();
    const { container } = render(
      <KanbanCard issue={makeIssue()} onClick={onClick} />,
    );

    const card = container.firstElementChild!;
    nativePointerDown(card, 0, 0);
    nativePointerMove(card, 10); // drag threshold exceeded → isDraggingRef = true
    fireEvent.click(card);       // click while dragging → suppressed

    expect(onClick).not.toHaveBeenCalled();
  });

  it("opens URL in browser when external link button is clicked", async () => {
    render(<KanbanCard issue={makeIssue()} />);

    const linkButton = screen.getByTitle("Im Browser öffnen");
    fireEvent.click(linkButton);

    expect(mockOpen).toHaveBeenCalledWith(
      "https://github.com/org/repo/issues/42",
    );
  });

  it("does not render external link button when url is empty", () => {
    render(<KanbanCard issue={makeIssue({ url: "" })} />);
    expect(screen.queryByTitle("Im Browser öffnen")).toBeNull();
  });

  it("external link click does not propagate to card onClick", () => {
    const onClick = vi.fn();
    render(<KanbanCard issue={makeIssue()} onClick={onClick} />);

    const linkButton = screen.getByTitle("Im Browser öffnen");
    fireEvent.click(linkButton);

    expect(onClick).not.toHaveBeenCalled();
  });
});
