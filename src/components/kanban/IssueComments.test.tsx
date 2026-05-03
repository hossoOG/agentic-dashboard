import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { IssueComments, type IssueComment } from "./IssueComments";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("../editor/MarkdownPreview", () => ({
  MarkdownBody: ({ content }: { content: string }) => (
    <span data-testid="markdown-body">{content}</span>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeComment(overrides: Partial<IssueComment> = {}): IssueComment {
  return {
    id: "IC_kwDODefault",
    author: "alice",
    body: "Default body",
    created_at: "2024-01-15T10:00:00Z",
    ...overrides,
  };
}

const formatDate = (iso: string) => iso;

// ── Tests ─────────────────────────────────────────────────────────────

describe("IssueComments", () => {
  it("renders nothing when comments array is empty", () => {
    const { container } = render(
      <IssueComments comments={[]} formatDate={formatDate} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the correct comment count for a single comment", () => {
    const { getByText } = render(
      <IssueComments
        comments={[makeComment()]}
        formatDate={formatDate}
      />,
    );
    expect(getByText(/1 Kommentar/)).toBeTruthy();
  });

  it("renders the correct comment count for multiple comments", () => {
    const comments = [
      makeComment({ id: "IC_kwDO001" }),
      makeComment({ id: "IC_kwDO002" }),
      makeComment({ id: "IC_kwDO003" }),
    ];
    const { getByText } = render(
      <IssueComments comments={comments} formatDate={formatDate} />,
    );
    expect(getByText(/3 Kommentare/)).toBeTruthy();
  });

  it("uses comment.id as React key — two comments from same author at same time both render", () => {
    // Bug-Szenario: gleicher Author, gleicher Timestamp, aber unterschiedliche IDs.
    // Ohne id-basierten Key wuerden React-Key-Kollisionen entstehen.
    const comments: IssueComment[] = [
      {
        id: "IC_kwDOFirst111",
        author: "bob",
        body: "First comment",
        created_at: "2024-01-15T10:00:00Z",
      },
      {
        id: "IC_kwDOSecond222",
        author: "bob",
        body: "Second comment",
        created_at: "2024-01-15T10:00:00Z",
      },
    ];

    const { getAllByTestId, getByText } = render(
      <IssueComments comments={comments} formatDate={formatDate} />,
    );

    // Beide Kommentare muessen im DOM erscheinen
    const bodies = getAllByTestId("markdown-body");
    expect(bodies).toHaveLength(2);
    expect(getByText("First comment")).toBeTruthy();
    expect(getByText("Second comment")).toBeTruthy();
  });

  it("renders author name and formatted date for each comment", () => {
    const comment = makeComment({
      id: "IC_kwDOTest",
      author: "charlie",
      created_at: "2026-04-16T12:30:00Z",
    });
    const { getByText } = render(
      <IssueComments comments={[comment]} formatDate={(iso) => `formatted:${iso}`} />,
    );
    expect(getByText("charlie")).toBeTruthy();
    expect(getByText("formatted:2026-04-16T12:30:00Z")).toBeTruthy();
  });
});
