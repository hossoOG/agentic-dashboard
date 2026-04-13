import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, createEvent, act } from "@testing-library/react";
import { KanbanBoard } from "./KanbanBoard";
import { invoke } from "@tauri-apps/api/core";
import type { KanbanIssue } from "./KanbanCard";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

vi.mock("../../utils/errorLogger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      // Filter out framer-motion specific props
      const {
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _t,
        ...rest
      } = props;
      return <div {...rest}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// ── Helpers ───────────────────────────────────────────────────────────

const mockInvoke = vi.mocked(invoke);

function makeIssues(): KanbanIssue[] {
  return [
    {
      number: 1,
      title: "Backlog issue",
      state: "OPEN",
      labels: [],
      assignee: "",
      url: "https://github.com/org/repo/issues/1",
    },
    {
      number: 2,
      title: "Todo issue",
      state: "OPEN",
      labels: [{ name: "todo", color: "0075ca" }],
      assignee: "bob",
      url: "https://github.com/org/repo/issues/2",
    },
    {
      number: 3,
      title: "In progress issue",
      state: "OPEN",
      labels: [{ name: "in-progress", color: "e4e669" }],
      assignee: "alice",
      url: "https://github.com/org/repo/issues/3",
    },
    {
      number: 4,
      title: "Done issue",
      state: "CLOSED",
      labels: [],
      assignee: "",
      url: "https://github.com/org/repo/issues/4",
    },
    {
      number: 5,
      title: "Sprint issue",
      state: "OPEN",
      labels: [{ name: "sprint", color: "aabbcc" }],
      assignee: "",
      url: "https://github.com/org/repo/issues/5",
    },
    {
      number: 6,
      title: "Done label issue",
      state: "OPEN",
      labels: [{ name: "done", color: "00ff00" }],
      assignee: "",
      url: "https://github.com/org/repo/issues/6",
    },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    // Never resolve the invoke
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(<KanbanBoard folder="/test/loading" />);

    expect(screen.getByText("Lade Kanban-Daten...")).toBeTruthy();
  });

  it("renders columns with classified issues after loading", async () => {
    mockInvoke.mockResolvedValueOnce(makeIssues());

    render(<KanbanBoard folder="/test/columns" />);

    await waitFor(() => {
      expect(screen.getByText("Kanban (6 Issues)")).toBeTruthy();
    });

    // Column headers
    expect(screen.getByText("Backlog")).toBeTruthy();
    expect(screen.getByText("To Do")).toBeTruthy();
    expect(screen.getByText("In Arbeit")).toBeTruthy();
    expect(screen.getByText("Erledigt")).toBeTruthy();

    // Issue titles in correct columns
    expect(screen.getByText("Backlog issue")).toBeTruthy();
    expect(screen.getByText("Todo issue")).toBeTruthy();
    expect(screen.getByText("In progress issue")).toBeTruthy();
    expect(screen.getByText("Done issue")).toBeTruthy();
    // sprint label → in-progress column
    expect(screen.getByText("Sprint issue")).toBeTruthy();
    // done label → done column
    expect(screen.getByText("Done label issue")).toBeTruthy();
  });

  it("shows error state with retry button on fetch failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Network error"));

    render(<KanbanBoard folder="/test/error" />);

    await waitFor(() => {
      expect(
        screen.getByText("Fehler beim Laden der Issues"),
      ).toBeTruthy();
    });

    expect(screen.getByText("Network error")).toBeTruthy();
    expect(screen.getByText("Erneut versuchen")).toBeTruthy();
  });

  it("shows gh CLI hint when error contains 'not found'", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("gh not found"));

    render(<KanbanBoard folder="/test/notfound" />);

    await waitFor(() => {
      expect(
        screen.getByText(/gh CLI nicht gefunden/),
      ).toBeTruthy();
    });
  });

  it("shows 'Keine Issues' for empty columns", async () => {
    // Return a single issue so board renders but most columns are empty
    mockInvoke.mockResolvedValueOnce([
      {
        number: 1,
        title: "Only issue",
        state: "OPEN",
        labels: [{ name: "todo", color: "0075ca" }],
        assignee: "",
        url: "",
      },
    ]);

    render(<KanbanBoard folder="/test/empty-cols" />);

    await waitFor(() => {
      expect(screen.getByText("Kanban (1 Issues)")).toBeTruthy();
    });

    // Three columns should show "Keine Issues" (backlog, in-progress, done)
    const emptyMessages = screen.getAllByText("Keine Issues");
    expect(emptyMessages.length).toBe(3);
  });

  it("renders with zero issues (all columns empty)", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    render(<KanbanBoard folder="/test/zero" />);

    await waitFor(() => {
      expect(screen.getByText("Kanban (0 Issues)")).toBeTruthy();
    });

    const emptyMessages = screen.getAllByText("Keine Issues");
    expect(emptyMessages.length).toBe(4);
  });

  /** Helper: fire dragOver with a mock dataTransfer to avoid jsdom TypeError */
  function fireDragOver(element: Element) {
    const ev = createEvent.dragOver(element);
    Object.defineProperty(ev, "dataTransfer", {
      value: { dropEffect: "" },
      configurable: true,
    });
    act(() => {
      element.dispatchEvent(ev);
    });
  }

  it("onDragOver sets column highlight", async () => {
    mockInvoke.mockResolvedValueOnce(makeIssues());

    const { container } = render(<KanbanBoard folder="/test/dragover" />);

    await waitFor(() => {
      expect(screen.getByText("Kanban (6 Issues)")).toBeTruthy();
    });

    const columns = container.querySelectorAll(".flex.flex-col.w-\\[260px\\]");
    const backlogColumn = columns[0] as HTMLElement;

    // dragOver should set highlight (dragOverColumn = "backlog")
    fireDragOver(backlogColumn);

    await waitFor(() => {
      expect(backlogColumn.className).toContain("border-accent");
    });
  });

  it("onDragLeave clears highlight when leaving to an element outside the column", async () => {
    mockInvoke.mockResolvedValueOnce(makeIssues());

    const { container } = render(<KanbanBoard folder="/test/dragleave-out" />);

    await waitFor(() => {
      expect(screen.getByText("Kanban (6 Issues)")).toBeTruthy();
    });

    const columns = container.querySelectorAll(".flex.flex-col.w-\\[260px\\]");
    const backlogColumn = columns[0] as HTMLElement;
    const todoColumn = columns[1] as HTMLElement;

    // Drag over backlog to set highlight
    fireDragOver(backlogColumn);

    await waitFor(() => {
      expect(backlogColumn.className).toContain("border-accent");
    });

    // DragLeave to a sibling column (outside) → contains() returns false → highlight clears
    fireEvent.dragLeave(backlogColumn, { relatedTarget: todoColumn });

    expect(backlogColumn.className).not.toContain("border-accent");
  });
});
