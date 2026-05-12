import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { DiffWindowView } from "./DiffWindowView";
import type { SessionDiff } from "../components/diff/types";

// CodeMirror does some DOM measuring that jsdom does not fully support — we
// stub the DiffMergeView so the tests focus on routing + state flows. The
// child component owns its own unit test (DiffMergeView.test.tsx).
vi.mock("../components/diff/DiffMergeView", () => ({
  DiffMergeView: ({
    file,
    mode,
  }: {
    file: { path: string };
    mode: string;
  }) => (
    <div data-testid="diff-merge-stub" data-mode={mode}>
      {file.path}
    </div>
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

function makeDiff(overrides: Partial<SessionDiff> = {}): SessionDiff {
  return {
    sessionId: "session-1",
    snapshotCommit: "abc123",
    snapshotAt: "2026-05-12T14:02:00Z",
    computedAt: "2026-05-12T14:05:00Z",
    computeMs: 42,
    files: [
      {
        path: "src/foo.ts",
        status: "modified",
        additions: 3,
        deletions: 1,
        oldContent: "old",
        newContent: "new",
        oversize: false,
      },
    ],
    truncated: false,
    ...overrides,
  };
}

describe("DiffWindowView", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("invokes get_session_diff on mount and renders file list + selected merge view", async () => {
    mockedInvoke.mockResolvedValueOnce(makeDiff());
    render(<DiffWindowView sessionId="session-1" />);

    await waitFor(() => {
      expect(mockedInvoke).toHaveBeenCalledWith("get_session_diff", {
        sessionId: "session-1",
      });
    });
    // File list (button) shows the modified file path
    const fileBtn = screen.getByTitle("Geaendert: src/foo.ts");
    expect(fileBtn).toBeTruthy();
    // Merge view stub mounts in side mode by default
    const stub = await screen.findByTestId("diff-merge-stub");
    expect(stub.getAttribute("data-mode")).toBe("side");
    expect(stub.textContent).toBe("src/foo.ts");
  });

  it("renders error banner with retry when invoke rejects", async () => {
    mockedInvoke.mockRejectedValueOnce(new Error("Snapshot missing"));
    render(<DiffWindowView sessionId="session-err" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Snapshot missing");
    const retry = screen.getByRole("button", { name: /Erneut versuchen/i });
    expect(retry).toBeTruthy();

    // Successful retry replaces banner with normal content.
    mockedInvoke.mockResolvedValueOnce(makeDiff());
    fireEvent.click(retry);
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(screen.getByTitle("Geaendert: src/foo.ts")).toBeTruthy();
  });

  it("renders empty-state when no files in diff", async () => {
    mockedInvoke.mockResolvedValueOnce(makeDiff({ files: [] }));
    render(<DiffWindowView sessionId="session-empty" />);

    await waitFor(() => {
      expect(screen.getByText(/Keine Aenderungen seit Session-Start/i)).toBeTruthy();
    });
  });

  it("switches view mode via the Side/Inline radio group", async () => {
    mockedInvoke.mockResolvedValueOnce(makeDiff());
    render(<DiffWindowView sessionId="session-1" />);

    const inlineBtn = await screen.findByRole("radio", { name: /Inline/i });
    fireEvent.click(inlineBtn);
    const stub = await screen.findByTestId("diff-merge-stub");
    expect(stub.getAttribute("data-mode")).toBe("inline");
  });

  it("shows missing-id error if sessionId is null", async () => {
    render(<DiffWindowView sessionId={null} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Session-ID");
    // No invoke call because we never had an id.
    expect(mockedInvoke).not.toHaveBeenCalled();
  });
});
