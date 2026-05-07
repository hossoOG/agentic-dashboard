import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreferencesView } from "./PreferencesView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
}));

describe("PreferencesView", () => {
  it("renders the page header and all three panel titles", () => {
    render(<PreferencesView />);
    expect(screen.getByRole("heading", { level: 2, name: /Einstellungen/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: /Neue Session/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: /Debug-Logging/i })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: /Sidebar/i })).toBeTruthy();
  });
});
