import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionCard } from "./SessionCard";
import type { ClaudeSession } from "../../store/sessionStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  const now = Date.now();
  return {
    id: "session-1",
    title: "Test Session",
    folder: "C:/Projects/foo/bar/baz",
    shell: "powershell",
    status: "running",
    createdAt: now - 65_000, // 1:05
    finishedAt: null,
    exitCode: null,
    lastOutputAt: now - 2_000, // recent → active
    lastOutputSnippet: "hello output",
    ...overrides,
  };
}

function renderCard(
  session: ClaudeSession,
  overrides: {
    isActive?: boolean;
    onClick?: (id: string) => void;
    onClose?: (id: string) => void;
  } = {},
) {
  return render(
    <SessionCard
      session={session}
      isActive={overrides.isActive ?? false}
      onClick={overrides.onClick ?? vi.fn()}
      onClose={overrides.onClose ?? vi.fn()}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("SessionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title, status dot and shortened folder path", () => {
    const session = makeSession({
      title: "My Session",
      folder: "C:/Projects/foo/bar/baz",
    });
    const { container } = renderCard(session);

    expect(screen.getByText("My Session")).toBeTruthy();
    // shortenPath("C:/Projects/foo/bar/baz") → "~/bar/baz" (4 segments)
    expect(screen.getByText("~/bar/baz")).toBeTruthy();
    // Status dot: running + active → status-pulse-animation + bg-success
    const dot = container.querySelector(".status-pulse-animation");
    expect(dot).toBeTruthy();
  });

  it("shows 'Läuft seit' for running status with recent output", () => {
    renderCard(makeSession({ status: "running" }));
    // "active" level → "Läuft seit X:XX"
    expect(screen.getByText(/Läuft seit/)).toBeTruthy();
  });

  it("shows check icon and 'Fertig' for done status", () => {
    const now = Date.now();
    const { container } = renderCard(
      makeSession({
        status: "done",
        createdAt: now - 120_000,
        finishedAt: now - 60_000,
      }),
    );
    expect(screen.getByText(/Fertig/)).toBeTruthy();
    // Check icon has text-success class
    const checkIcon = container.querySelector("svg.text-success");
    expect(checkIcon).toBeTruthy();
  });

  it("shows alert icon and exit code for error status", () => {
    const { container } = renderCard(
      makeSession({ status: "error", exitCode: 42 }),
    );
    expect(screen.getByText(/Fehler \(Exit 42\)/)).toBeTruthy();
    // AlertTriangle icon with text-error (theme token)
    const alertIcon = container.querySelector("svg.text-error");
    expect(alertIcon).toBeTruthy();
  });

  it("calls onClick with id on card click and onClose on close button", () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    renderCard(makeSession({ id: "sess-99" }), { onClick, onClose });

    // Click card body (title) — should trigger onClick
    fireEvent.click(screen.getByText("Test Session"));
    expect(onClick).toHaveBeenCalledWith("sess-99");
    expect(onClose).not.toHaveBeenCalled();

    // Click close button — should trigger onClose, NOT re-trigger onClick
    // (stopPropagation verified via call count unchanged)
    const closeBtn = screen.getByLabelText("Session schließen");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledWith("sess-99");
    expect(onClick).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it("renders starting status with breathe dot animation class", () => {
    const { container } = renderCard(makeSession({ status: "starting" }));
    // starting → status-breathe-animation + bg-success
    const dot = container.querySelector(".status-breathe-animation.bg-success");
    expect(dot).toBeTruthy();
  });
});
