import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
    updated_at: "2026-03-16T09:00:00Z",
    closed_at: "",
    labels: [
      { name: "bug", color: "d73a4a" },
      { name: "priority", color: "ff0000" },
    ],
    assignees: ["bob"],
    milestone: null as string | null,
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
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Laden/)).toBeTruthy();
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
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeTruthy();
    });

    // State badge
    expect(screen.getByText("Offen")).toBeTruthy();
    // Author in sidebar
    expect(screen.getByText("alice")).toBeTruthy();
    // Assignee in sidebar (rendered as plain username)
    expect(screen.getByText("bob")).toBeTruthy();
    // Labels
    expect(screen.getByText("bug")).toBeTruthy();
    expect(screen.getByText("priority")).toBeTruthy();
    // Body (rendered via MarkdownBody → DOM text is findable)
    expect(
      screen.getByText("The login form does not validate email."),
    ).toBeTruthy();
    // Comments
    expect(screen.getByText("1 Kommentar")).toBeTruthy();
    expect(screen.getByText("charlie")).toBeTruthy();
    expect(screen.getByText("I can reproduce this.")).toBeTruthy();
  });

  it("renders closed state badge and closed_at date in sidebar", async () => {
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
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Geschlossen")).toBeTruthy();
    });

    // Sidebar shows "Geschlossen: {date}"
    expect(screen.getByText(/Geschlossen:/)).toBeTruthy();
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
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Verknüpfte Pull Requests"),
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

  it("shows error state with retry button on fetch failure", async () => {
    mockInvoke.mockRejectedValue(new Error("API error"));

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("API error")).toBeTruthy();
    });

    // Retry button should be present
    expect(screen.getByText("Erneut versuchen")).toBeTruthy();
  });

  it("retry button triggers a fresh load", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("API error"));

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Erneut versuchen")).toBeTruthy();
    });

    // On retry, second call succeeds
    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(makeIssueDetail());
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    fireEvent.click(screen.getByText("Erneut versuchen"));

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeTruthy();
    });
  });

  it("does not render content when open is false", () => {
    const { container } = render(
      <KanbanDetailModal
        open={false}
        folder="/test"
        repository={null}
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
        repository={null}
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
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeTruthy();
    });

    // IssueComments is hidden when empty; but IssueCommentForm still renders.
    // Verify the comment count badge from IssueComments is absent.
    expect(screen.queryByText(/\d+ Kommentar/)).toBeNull();
  });

  it("renders all assignees when multiple are present", async () => {
    const detail = makeIssueDetail();
    detail.assignees = ["bob", "carol", "dave"];

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeTruthy();
    });

    expect(screen.getByText("carol")).toBeTruthy();
    expect(screen.getByText("dave")).toBeTruthy();
  });

  it("shows 'Niemand zugewiesen' when assignees is empty", async () => {
    const detail = makeIssueDetail();
    detail.assignees = [];

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Niemand zugewiesen")).toBeTruthy();
    });
  });

  it("renders milestone when present", async () => {
    const detail = makeIssueDetail();
    detail.milestone = "v2.0";

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("v2.0")).toBeTruthy();
    });
  });

  it("hides milestone section when milestone is null", async () => {
    const detail = makeIssueDetail();
    detail.milestone = null;

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeTruthy();
    });

    expect(screen.queryByText("Milestone")).toBeNull();
  });

  it("renders body markdown (bold text)", async () => {
    const detail = makeIssueDetail();
    detail.body = "This is **important** info.";

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    const { container } = render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeTruthy();
    });

    // MarkdownBody should render **important** as <strong>
    const strong = container.querySelector("strong");
    expect(strong).toBeTruthy();
    expect(strong?.textContent).toBe("important");
  });

  it("shows empty body placeholder when body is empty", async () => {
    const detail = makeIssueDetail();
    detail.body = "";

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(detail);
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Keine Beschreibung")).toBeTruthy();
    });
  });

  it("calls onIssueChanged and reloads after comment is posted", async () => {
    const onIssueChanged = vi.fn();

    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(makeIssueDetail());
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      if (cmd === "post_issue_comment") return Promise.resolve(undefined);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
        onIssueChanged={onIssueChanged}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Fix login bug")).toBeTruthy();
    });

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    fireEvent.change(textarea, { target: { value: "Hello world" } });

    const submitButton = screen.getByText("Kommentar posten");
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(onIssueChanged).toHaveBeenCalledOnce();
    });
  });

  it("disables submit when comment body is empty", async () => {
    mockInvoke.mockImplementation(((cmd: string) => {
      if (cmd === "get_issue_detail") return Promise.resolve(makeIssueDetail());
      if (cmd === "get_issue_checks") return Promise.resolve([]);
      return Promise.resolve(null);
    }) as typeof invoke);

    render(
      <KanbanDetailModal
        open
        folder="/test"
        repository={null}
        issueNumber={42}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Kommentar posten")).toBeTruthy();
    });

    const submitButton = screen.getByText("Kommentar posten");
    expect(submitButton).toHaveProperty("disabled", true);
  });
});
