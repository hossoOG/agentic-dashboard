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
    expect(screen.getByText("0 wartend")).toBeTruthy();
    expect(screen.getByText("0 fertig")).toBeTruthy();
    expect(screen.getByText("0 Fehler")).toBeTruthy();
  });

  it("displays correct counts for mixed session statuses", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", status: "running" }),
        makeSession({ id: "s2", status: "running" }),
        makeSession({ id: "s3", status: "waiting" }),
        makeSession({ id: "s4", status: "done" }),
        makeSession({ id: "s5", status: "error" }),
        makeSession({ id: "s6", status: "error" }),
      ],
      activeSessionId: "s1",
    });

    render(<SessionStatusBar />);

    expect(screen.getByText("2 aktiv")).toBeTruthy();
    expect(screen.getByText("1 wartend")).toBeTruthy();
    expect(screen.getByText("1 fertig")).toBeTruthy();
    expect(screen.getByText("2 Fehler")).toBeTruthy();
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
    useSessionStore.setState({
      sessions: [makeSession({ id: "s1", status: "running" })],
      activeSessionId: "s1",
    });

    const { container } = render(<SessionStatusBar />);
    const pulseDot = container.querySelector(".status-pulse-animation.bg-success");
    expect(pulseDot).toBeTruthy();
  });
});
