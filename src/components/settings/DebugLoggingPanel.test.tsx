import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebugLoggingPanel } from "./DebugLoggingPanel";
import { useSettingsStore } from "../../store/settingsStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

describe("DebugLoggingPanel", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      preferences: {
        frontendLogging: false,
        backendFileLogging: false,
        performanceProfiler: false,
        showProtokolleTab: false,
      },
    });
  });

  it("renders Komplett-aus radio selected by default", () => {
    render(<DebugLoggingPanel />);
    const offRadio = screen.getByRole("radio", { name: /Komplett aus/i });
    expect((offRadio as HTMLInputElement).checked).toBe(true);
  });

  it("disables sub-checkboxes while master is off", () => {
    render(<DebugLoggingPanel />);
    const sub = screen.getByRole("checkbox", { name: /Frontend-Errors/i }) as HTMLInputElement;
    expect(sub.disabled).toBe(true);
  });

  it("enables frontendLogging when master is switched on", () => {
    render(<DebugLoggingPanel />);
    const onRadio = screen.getByRole("radio", { name: /Aktiviert/i });
    fireEvent.click(onRadio);
    expect(useSettingsStore.getState().preferences.frontendLogging).toBe(true);
  });

  it("toggles a sub-checkbox independently while master is on", () => {
    useSettingsStore.setState({
      preferences: {
        frontendLogging: true,
        backendFileLogging: false,
        performanceProfiler: false,
        showProtokolleTab: false,
      },
    });
    render(<DebugLoggingPanel />);
    const backendBox = screen.getByRole("checkbox", { name: /Backend-Log-Files/i });
    fireEvent.click(backendBox);
    expect(useSettingsStore.getState().preferences.backendFileLogging).toBe(true);
  });

  it("clears all sub-toggles when master is switched off", () => {
    useSettingsStore.setState({
      preferences: {
        frontendLogging: true,
        backendFileLogging: true,
        performanceProfiler: true,
        showProtokolleTab: false,
      },
    });
    render(<DebugLoggingPanel />);
    const offRadio = screen.getByRole("radio", { name: /Komplett aus/i });
    fireEvent.click(offRadio);
    const prefs = useSettingsStore.getState().preferences;
    expect(prefs.frontendLogging).toBe(false);
    expect(prefs.backendFileLogging).toBe(false);
    expect(prefs.performanceProfiler).toBe(false);
  });
});
