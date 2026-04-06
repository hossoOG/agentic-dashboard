import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import App from "./App";
import { useThemeEffect } from "./hooks/useThemeEffect";
import { initSessionHistoryListener } from "./store/sessionHistoryStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(() => Promise.resolve(() => {})),
  }),
}));

vi.mock("./components/layout/AppShell", () => ({
  AppShell: () => <div data-testid="app-shell" />,
}));

vi.mock("./utils/globalErrorHandler", () => ({
  installGlobalErrorHandlers: vi.fn(),
}));

vi.mock("./hooks/useThemeEffect", () => ({
  useThemeEffect: vi.fn(),
}));

vi.mock("./store/sessionHistoryStore", () => ({
  initSessionHistoryListener: vi.fn(() => vi.fn()),
}));

vi.mock("./store/tauriStorage", () => ({
  flushPendingSaves: vi.fn(() => Promise.resolve()),
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders AppShell component", () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId("app-shell")).toBeTruthy();
  });

  it("calls useThemeEffect on mount", () => {
    render(<App />);
    expect(useThemeEffect).toHaveBeenCalled();
  });

  it("initializes session history listener on mount", () => {
    render(<App />);
    expect(initSessionHistoryListener).toHaveBeenCalled();
  });
});
