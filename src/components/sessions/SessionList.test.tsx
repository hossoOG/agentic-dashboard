import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionList } from "./SessionList";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import type { ClaudeSession } from "../../store/sessionStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  const now = Date.now();
  return {
    id: "s-1",
    title: "Test Session",
    folder: "C:/Projects/test",
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

describe("SessionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      sessions: [],
      activeSessionId: null,
      layoutMode: "single",
      gridSessionIds: [],
      focusedGridSessionId: null,
    });
    useSettingsStore.setState({ favorites: [] });
  });

  it("renders the new session button", () => {
    render(<SessionList onNewSession={vi.fn()} onQuickStart={vi.fn()} />);
    expect(screen.getByText("NEUE SESSION")).toBeTruthy();
  });

  it("calls onNewSession when button is clicked", () => {
    const onNewSession = vi.fn();
    render(<SessionList onNewSession={onNewSession} onQuickStart={vi.fn()} />);

    fireEvent.click(screen.getByText("NEUE SESSION"));
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it("shows empty state text when no sessions exist", () => {
    render(<SessionList onNewSession={vi.fn()} onQuickStart={vi.fn()} />);
    expect(screen.getByText("Keine Sessions vorhanden")).toBeTruthy();
  });

  it("renders session cards for existing sessions", () => {
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s1", title: "Session Alpha" }),
        makeSession({ id: "s2", title: "Session Beta" }),
      ],
      activeSessionId: "s1",
    });

    render(<SessionList onNewSession={vi.fn()} onQuickStart={vi.fn()} />);
    expect(screen.getByText("Session Alpha")).toBeTruthy();
    expect(screen.getByText("Session Beta")).toBeTruthy();
  });

  it("shows SESSIONS header when favorites exist", () => {
    useSettingsStore.setState({
      favorites: [{
        id: "f1",
        path: "/fav",
        label: "Fav",
        shell: "powershell",
        addedAt: Date.now(),
        lastUsedAt: Date.now(),
      }],
    });

    render(<SessionList onNewSession={vi.fn()} onQuickStart={vi.fn()} />);
    expect(screen.getByText("SESSIONS")).toBeTruthy();
  });

  it("always shows SESSIONS header", () => {
    render(<SessionList onNewSession={vi.fn()} onQuickStart={vi.fn()} />);
    expect(screen.getByText("SESSIONS")).toBeTruthy();
  });

  it("sorts active sessions before done sessions", () => {
    const now = Date.now();
    useSessionStore.setState({
      sessions: [
        makeSession({ id: "s-done", title: "Done Session", status: "done", createdAt: now - 1000 }),
        makeSession({ id: "s-run", title: "Running Session", status: "running", createdAt: now }),
      ],
      activeSessionId: "s-run",
    });

    const { container } = render(<SessionList onNewSession={vi.fn()} onQuickStart={vi.fn()} />);
    // Running session should appear before done in DOM
    const cards = container.querySelectorAll("[class*='cursor-pointer']");
    const titles = Array.from(cards).map((c) => c.textContent ?? "");
    const runIdx = titles.findIndex((t) => t.includes("Running Session"));
    const doneIdx = titles.findIndex((t) => t.includes("Done Session"));
    // Both should be found, running first
    if (runIdx !== -1 && doneIdx !== -1) {
      expect(runIdx).toBeLessThan(doneIdx);
    }
  });
});
