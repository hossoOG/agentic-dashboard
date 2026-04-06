import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("calls onClick when card is clicked", () => {
    const onClick = vi.fn();
    render(<KanbanCard issue={makeIssue()} onClick={onClick} />);

    fireEvent.click(screen.getByText("Implement feature X"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onDragStart and sets dataTransfer on drag", () => {
    const onDragStart = vi.fn();
    const { container } = render(
      <KanbanCard issue={makeIssue()} onDragStart={onDragStart} />,
    );

    const card = container.firstElementChild!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(card, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "42");
    expect(onDragStart).toHaveBeenCalledOnce();
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

    // stopPropagation prevents onClick on card
    expect(onClick).not.toHaveBeenCalled();
  });
});
