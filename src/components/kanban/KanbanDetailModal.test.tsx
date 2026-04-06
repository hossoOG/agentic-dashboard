import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { KanbanDetailModal } from "./KanbanDetailModal";
import { invoke } from "@tauri-apps/api/core";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

// Mock framer-motion to render synchronously
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => {
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

function makeIssueDetail() {
  return {
    number: 42,
    title: "Fix login bug",
    body: "The login form does not validate email.",
    state: "OPEN",
    author: "alice",
    created_at: "2026-03-15T10:00:00Z",
    closed_at: "",
    labels: [
      { name: "bug", color: "d73a4a" },
      { name: "priority", color: "ff0000" },
    ],
    assignee: "bob",
    url: "https://github.com/org/repo/issues/42",
    comments: [
      {
        author: "charlie",
        body: "I can reproduce this.",
        created_at: "2026-03-16T08:00:00Z",
      },
    ],
  };
}

function makeLinkedPRs() {
  return [
    {
      number: 50,
      title: "Fix login validation",
      state: "MERGED",
      url: "https://github.com/org/repo/pull/50",
      checks: [
        { name: "CI", status: "COMPLETED", conclusion: "SUCCESS" },
        { name: "Lint", status: "COMPLETED", conclusion: "FAILURE" },
        { name: "Build", status: "IN_PROGRESS", conclusion: "" },
      ],
    },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("KanbanDetailModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state while fetching", () => {
    mockInvoke.mockReturnValue(new Promise(() => {}));

    render(
      <KanbanDetailModal
        open
        folder="/test"
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Laden...")).toBeTruthy();
    expect(screen.getByText("#42")).toBeTruthy();
  });

  it("renders issue details after loading", async () => {
    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(makeIssueDetail());
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeTruthy();
    });

    // State badge
    expect(screen.getByText("Offen")).toBeTruthy();
    // Author
    expect(screen.getByText("alice")).toBeTruthy();
    // Assignee
    expect(screen.getByText(/Zugewiesen: bob/)).toBeTruthy();
    // Labels
    expect(screen.getByText("bug")).toBeTruthy();
    expect(screen.getByText("priority")).toBeTruthy();
    // Body
    expect(
      screen.getByText("The login form does not validate email."),
    ).toBeTruthy();
    // Comments
    expect(screen.getByText("1 Kommentar")).toBeTruthy();
    expect(screen.getByText("charlie")).toBeTruthy();
    expect(screen.getByText("I can reproduce this.")).toBeTruthy();
  });

  it("renders closed state badge and closed_at date", async () => {
    const detail = makeIssueDetail();
    detail.state = "CLOSED";
    detail.closed_at = "2026-03-20T14:00:00Z";

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Geschlossen")).toBeTruthy();
    });

    expect(screen.getByText(/Geschlossen am/)).toBeTruthy();
  });

  it("renders linked PRs with CI checks", async () => {
    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(makeIssueDetail());
      if (cmd === "get_issue_checks") return Promise.resolve(makeLinkedPRs());
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Verknuepfte Pull Requests"),
      ).toBeTruthy();
    });

    // PR title
    expect(screen.getByText(/#50 Fix login validation/)).toBeTruthy();
    // PR state badge
    expect(screen.getByText("Merged")).toBeTruthy();
    // Check names
    expect(screen.getByText("CI")).toBeTruthy();
    expect(screen.getByText("Lint")).toBeTruthy();
    expect(screen.getByText("Build")).toBeTruthy();
  });

  it("shows error state on fetch failure", async () => {
    mockInvoke.mockRejectedValue(new Error("API error"));

    render(
      <KanbanDetailModal
        open
        folder="/test"
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("API error")).toBeTruthy();
    });
  });

  it("does not render content when open is false", () => {
    const { container } = render(
      <KanbanDetailModal
        open={false}
        folder="/test"
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    // Modal is not rendered when closed
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders plural 'Kommentare' for multiple comments", async () => {
    const detail = makeIssueDetail();
    detail.comments = [
      { author: "a", body: "First", created_at: "2026-03-16T08:00:00Z" },
      { author: "b", body: "Second", created_at: "2026-03-17T08:00:00Z" },
    ];

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("2 Kommentare")).toBeTruthy();
    });
  });

  it("hides comments section when no comments", async () => {
    const detail = makeIssueDetail();
    detail.comments = [];

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeTruthy();
    });

    expect(screen.queryByText(/Kommentar/)).toBeNull();
  });
});
