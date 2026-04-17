import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionStatusBar } from "./SessionStatusBar";
import { useSessionStore } from "../../store/sessionStore";
import type { ClaudeSession } from "../../store/sessionStore";

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  const now = Date.now();
  return {
    id: "s-1",
    title: "Test",
    folder: "/test",
    shell: "powershell",
    status: "running",
    createdAt: now,
    finishedAt: null,
    exitCode: null,
    lastOutputAt: now,
    lastOutputSnippet: "",
    ...overrides,
  };
}

describe("SessionStatusBar", () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
    });
  });

  it("renders all count labels with zero values", () => {
    render(<SessionStatusBar />);

    expect(screen.getByText("0 aktiv")).toBeTruthy();
    expect(screen.getByText("0 passiv")).toBeTruthy();
    expect(screen.getByText("0 wartend")).toBeTruthy();
    expect(screen.queryByText(/fertig/)).toBeNull();
    expect(screen.queryByText(/Fehler/)).toBeNull();
  });

  it("displays correct aktiv count for recently-active running session", () => {
    // lastOutputAt = now → active (within 30s threshold)
    const now = Date.now();
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", status: "running", lastOutputAt: now }),
        makeSession({ id: "s2", status: "waiting", lastOutputAt: now }),
      ],
      activeSessionId: "s1",
    });

    render(<SessionStatusBar />);

    expect(screen.getByText("1 aktiv")).toBeTruthy();
    expect(screen.getByText("0 passiv")).toBeTruthy();
    expect(screen.getByText("1 wartend")).toBeTruthy();
  });

  it("counts idle running sessions as passiv", () => {
    // lastOutputAt = far in the past → idle → passiv
    const oldTime = Date.now() - 60_000;
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", status: "running", lastOutputAt: oldTime }),
        makeSession({ id: "s2", status: "running", lastOutputAt: oldTime }),
      ],
      activeSessionId: "s1",
    });

    render(<SessionStatusBar />);

    expect(screen.getByText("0 aktiv")).toBeTruthy();
    expect(screen.getByText("2 passiv")).toBeTruthy();
    expect(screen.getByText("0 wartend")).toBeTruthy();
  });

  it("shows shell label for active session", () => {
    useSessionStore.setState({
      sessions: [makeSession({ id: "s1", shell: "gitbash" })],
      activeSessionId: "s1",
    });

    render(<SessionStatusBar />);
    expect(screen.getByText("Git Bash")).toBeTruthy();
  });

  it("shows dash when no active session", () => {
    useSessionStore.setState({ sessions: [], activeSessionId: null });

    render(<SessionStatusBar />);
    // The em-dash fallback
    expect(screen.getByText("\u2014")).toBeTruthy();
  });

  it("applies pulse animation when active sessions exist", () => {
    const now = Date.now();
    useSessionStore.setState({
      sessions: [makeSession({ id: "s1", status: "running", lastOutputAt: now })],
      activeSessionId: "s1",
    });

    const { container } = render(<SessionStatusBar />);
    const pulseDot = container.querySelector(".status-pulse-animation.bg-success");
    expect(pulseDot).toBeTruthy();
  });
});
