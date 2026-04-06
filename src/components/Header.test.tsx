import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "./Header";
import { useSessionStore } from "../store/sessionStore";
import { useSettingsStore } from "../store/settingsStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../../package.json", () => ({
  version: "1.0.0-test",
}));

vi.mock("./shared/NotesPanel", () => ({
  NotesPanel: () => <div data-testid="notes-panel" />,
}));

vi.mock("./shared/ChangelogDialog", () => ({
  ChangelogDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="changelog-dialog" /> : null,
}));

vi.mock("./shared/UpdateNotification", () => ({
  UpdateNotification: () => <div data-testid="update-notification" />,
}));

vi.mock("../hooks/useAutoUpdate", () => ({
  useAutoUpdate: () => ({
    status: "idle",
    progress: 0,
    error: null,
    newVersion: null,
    lastChecked: null,
    checkForUpdate: vi.fn(),
    downloadAndInstall: vi.fn(),
    confirmRelaunch: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ sessions: [], activeSessionId: null });
    useSettingsStore.setState({
      theme: { mode: "dark", accentColor: "#00ff41", reducedMotion: false, animationSpeed: 1 },
    });
  });

  it("renders app title and version badge", () => {
    render(<Header />);
    expect(screen.getByText("AGENTICEXPLORER")).toBeTruthy();
    expect(screen.getByText("v1.0.0-test")).toBeTruthy();
  });

  it("shows 'Keine Session ausgewaehlt' when no active session", () => {
    render(<Header />);
    expect(screen.getByText("Keine Session ausgewaehlt")).toBeTruthy();
  });

  it("toggles theme between dark and light on button click", () => {
    render(<Header />);

    const themeBtn = screen.getByLabelText("Light Mode aktivieren");
    fireEvent.click(themeBtn);

    const mode = useSettingsStore.getState().theme.mode;
    expect(mode).toBe("light");
  });

  it("renders NotesPanel component", () => {
    render(<Header />);
    expect(screen.getByTestId("notes-panel")).toBeTruthy();
  });
});
