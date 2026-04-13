import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IssueCommentForm } from "./IssueCommentForm";
import { invoke } from "@tauri-apps/api/core";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../../utils/adpError", () => ({
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

// ── Helpers ───────────────────────────────────────────────────────────

const mockInvoke = vi.mocked(invoke);

// ── Tests ─────────────────────────────────────────────────────────────

describe("IssueCommentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders textarea and disabled submit button when empty", () => {
    render(
      <IssueCommentForm folder="/test" issueNumber={42} onCommentPosted={vi.fn()} />,
    );

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    expect(textarea).toBeTruthy();

    const button = screen.getByText("Kommentar posten");
    expect(button).toHaveProperty("disabled", true);
  });

  it("enables submit button when body has text", () => {
    render(
      <IssueCommentForm folder="/test" issueNumber={42} onCommentPosted={vi.fn()} />,
    );

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    fireEvent.change(textarea, { target: { value: "A comment" } });

    const button = screen.getByText("Kommentar posten");
    expect(button).toHaveProperty("disabled", false);
  });

  it("keeps submit disabled when body is only whitespace", () => {
    render(
      <IssueCommentForm folder="/test" issueNumber={42} onCommentPosted={vi.fn()} />,
    );

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    fireEvent.change(textarea, { target: { value: "   " } });

    const button = screen.getByText("Kommentar posten");
    expect(button).toHaveProperty("disabled", true);
  });

  it("calls post_issue_comment and onCommentPosted on successful submit", async () => {
    const onCommentPosted = vi.fn();
    mockInvoke.mockResolvedValueOnce(undefined);

    render(
      <IssueCommentForm
        folder="/test"
        issueNumber={42}
        onCommentPosted={onCommentPosted}
      />,
    );

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    fireEvent.change(textarea, { target: { value: "Great fix!" } });
    fireEvent.click(screen.getByText("Kommentar posten"));

    await waitFor(() => {
      expect(onCommentPosted).toHaveBeenCalledOnce();
    });

    expect(mockInvoke).toHaveBeenCalledWith("post_issue_comment", {
      folder: "/test",
      number: 42,
      body: "Great fix!",
    });
  });

  it("clears textarea after successful submit", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    render(
      <IssueCommentForm folder="/test" issueNumber={42} onCommentPosted={vi.fn()} />,
    );

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    fireEvent.change(textarea, { target: { value: "My comment" } });
    fireEvent.click(screen.getByText("Kommentar posten"));

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe("");
    });
  });

  it("shows error message on failed submit", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("Network timeout"));

    render(
      <IssueCommentForm folder="/test" issueNumber={42} onCommentPosted={vi.fn()} />,
    );

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    fireEvent.change(textarea, { target: { value: "A comment" } });
    fireEvent.click(screen.getByText("Kommentar posten"));

    await waitFor(() => {
      expect(screen.getByText("Network timeout")).toBeTruthy();
    });
  });

  it("does not call onCommentPosted on failed submit", async () => {
    const onCommentPosted = vi.fn();
    mockInvoke.mockRejectedValueOnce(new Error("fail"));

    render(
      <IssueCommentForm
        folder="/test"
        issueNumber={42}
        onCommentPosted={onCommentPosted}
      />,
    );

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    fireEvent.change(textarea, { target: { value: "A comment" } });
    fireEvent.click(screen.getByText("Kommentar posten"));

    await waitFor(() => {
      expect(screen.getByText("fail")).toBeTruthy();
    });

    expect(onCommentPosted).not.toHaveBeenCalled();
  });

  it("shows submitting state while posting", async () => {
    let resolve!: (v: undefined) => void;
    mockInvoke.mockReturnValueOnce(new Promise((r) => (resolve = r)));

    render(
      <IssueCommentForm folder="/test" issueNumber={42} onCommentPosted={vi.fn()} />,
    );

    const textarea = screen.getByPlaceholderText(/Kommentar verfassen/);
    fireEvent.change(textarea, { target: { value: "A comment" } });
    fireEvent.click(screen.getByText("Kommentar posten"));

    expect(screen.getByText("Wird gesendet…")).toBeTruthy();

    resolve(undefined);
  });
});
