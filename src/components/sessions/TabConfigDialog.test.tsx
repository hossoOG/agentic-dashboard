/**
 * Unit tests for `TabConfigDialog`. Pure store-bound — no IPC touch.
 *
 * Spec §6.2, §9.1 (TabConfigDialog.test.tsx coverage):
 *  - "Als Default speichern" persistiert defaultTabConfig
 *  - "Reset" entfernt Override-Schlüssel
 *  - Letzte sichtbare Checkbox ist disabled
 *  - "Wartet auf Artefakt"-Pill nur für requiresPresence-Tabs ohne Artefakt
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TabConfigDialog } from "./TabConfigDialog";
import { useSettingsStore } from "../../store/settingsStore";
import { DEFAULT_TAB_CONFIG, type PresenceMap } from "../../store/tabConfig";

const FOLDER = "C:/Proj/A";

const FULL_PRESENCE: PresenceMap = {
  claudeMd: true,
  skills: true,
  agents: true,
  hooks: true,
  settings: true,
  git: true,
  github: true,
};

function resetSettingsStore() {
  useSettingsStore.setState({
    defaultTabConfig: { order: [...DEFAULT_TAB_CONFIG.order], hidden: [] },
    projectTabOverrides: {},
  });
}

describe("TabConfigDialog", () => {
  beforeEach(() => { resetSettingsStore(); });
  afterEach(() => { cleanup(); });

  it("renders one row per known TabId", () => {
    render(<TabConfigDialog folder={FOLDER} presence={FULL_PRESENCE} onClose={() => {}} />);
    const rows = document.querySelectorAll("[data-tab-row]");
    expect(rows).toHaveLength(DEFAULT_TAB_CONFIG.order.length);
  });

  it("Als Default speichern writes effective config to defaultTabConfig", () => {
    useSettingsStore.getState().setProjectTabOverride(FOLDER, { hidden: ["history"] });
    render(<TabConfigDialog folder={FOLDER} presence={FULL_PRESENCE} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Als Default speichern"));
    expect(useSettingsStore.getState().defaultTabConfig.hidden).toContain("history");
  });

  it("Reset-Button deletes the project override key", () => {
    useSettingsStore.getState().setProjectTabOverride(FOLDER, { hidden: ["history"] });
    render(<TabConfigDialog folder={FOLDER} presence={FULL_PRESENCE} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Override zurücksetzen"));
    expect(useSettingsStore.getState().projectTabOverrides["c:/proj/a"]).toBeUndefined();
  });

  it("Reset-Button is disabled when no override exists", () => {
    render(<TabConfigDialog folder={FOLDER} presence={FULL_PRESENCE} onClose={() => {}} />);
    const btn = screen.getByText("Override zurücksetzen") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Letzte sichtbare Checkbox ist disabled (constraint: >=1 visible)", () => {
    // Hide 8 of 9 tabs — the remaining checkbox must be disabled.
    useSettingsStore.getState().setProjectTabOverride(FOLDER, {
      hidden: ["claude-md", "skills", "hooks", "settings", "agents", "github", "worktrees", "kanban"],
    });
    render(<TabConfigDialog folder={FOLDER} presence={FULL_PRESENCE} onClose={() => {}} />);
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const enabled = checkboxes.filter((c) => !c.disabled && c.checked);
    expect(enabled).toHaveLength(0);
    const visibleChecked = checkboxes.filter((c) => c.checked);
    expect(visibleChecked).toHaveLength(1);
    expect(visibleChecked[0].disabled).toBe(true);
  });

  it("'wartet auf Artefakt'-Pill renders only for requiresPresence-tabs with missing artifact", () => {
    const partialPresence: PresenceMap = { ...FULL_PRESENCE, skills: false };
    render(<TabConfigDialog folder={FOLDER} presence={partialPresence} onClose={() => {}} />);
    const pills = screen.getAllByText("wartet auf Artefakt");
    // Exactly one row (Skills) should show the pill since only skills is missing
    expect(pills).toHaveLength(1);
  });

  it("Checkbox-Toggle ruft setProjectTabOverride und persistiert hidden", () => {
    render(<TabConfigDialog folder={FOLDER} presence={FULL_PRESENCE} onClose={() => {}} />);
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // Toggle the first one off
    fireEvent.click(checkboxes[0]);
    const overrides = useSettingsStore.getState().projectTabOverrides["c:/proj/a"];
    expect(overrides?.hidden).toBeDefined();
    expect(overrides?.hidden?.length).toBe(1);
  });
});
