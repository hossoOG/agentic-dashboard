/**
 * Layer-B integration test — `settingsStore` tab-bar-config contract.
 *
 * Validates Spec §4.2, §4.3, §5.1, §5.2, §5.3, §6.3:
 *  - Migration v3 → v4 inserts defaults
 *  - Migrate + onRehydrateStorage sanitize-Symmetrie (Issue-#209-Klasse)
 *  - Patch-Merge semantics (order-only update preserves hidden)
 *  - Reset löscht Schlüssel komplett
 *  - Sync von `uiStore.configSubTab` bei Visibility-Toggle
 *
 * Per CLAUDE rules: NEVER `vi.mock("@tauri-apps/api/core")`. NEVER mock
 * production modules. This test only seeds localStorage and exercises
 * the real store.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settingsStore";
import { DEFAULT_TAB_CONFIG } from "./tabConfig";
import { useUIStore } from "./uiStore";
import { resetAllStores } from "../test/storeReset";

const PERSIST_KEY = "agenticexplorer-settings";

async function seedAndRehydrate(payload: string): Promise<void> {
  resetAllStores();
  localStorage.setItem(PERSIST_KEY, payload);
  const store = useSettingsStore as unknown as {
    persist: { rehydrate: () => Promise<void> };
  };
  await store.persist.rehydrate();
}

describe("settingsStore — tab-config migration (v3 → v4)", () => {
  beforeEach(() => { resetAllStores(); });

  it("inserts DEFAULT_TAB_CONFIG when v3 payload lacks tab fields (happy path)", async () => {
    await seedAndRehydrate(JSON.stringify({
      version: 3,
      state: { /* no defaultTabConfig, no projectTabOverrides */ },
    }));
    const s = useSettingsStore.getState();
    expect(s.defaultTabConfig).toEqual(DEFAULT_TAB_CONFIG);
    expect(s.projectTabOverrides).toEqual({});
  });

  it("sanitizes corrupt defaultTabConfig (null) → DEFAULT during migrate", async () => {
    await seedAndRehydrate(JSON.stringify({
      version: 3,
      state: { defaultTabConfig: null, projectTabOverrides: {} },
    }));
    expect(useSettingsStore.getState().defaultTabConfig).toEqual(DEFAULT_TAB_CONFIG);
  });

  it("strips unknown TabIds from persisted order during migrate", async () => {
    await seedAndRehydrate(JSON.stringify({
      version: 3,
      state: {
        defaultTabConfig: {
          order: ["skills", "unknown-tab-id", "claude-md"],
          hidden: [],
        },
        projectTabOverrides: {},
      },
    }));
    const order = useSettingsStore.getState().defaultTabConfig.order;
    expect(order).not.toContain("unknown-tab-id");
  });

  it("appends missing TabIds in DEFAULT order during migrate", async () => {
    await seedAndRehydrate(JSON.stringify({
      version: 3,
      state: {
        defaultTabConfig: { order: ["history"], hidden: [] },
        projectTabOverrides: {},
      },
    }));
    const order = useSettingsStore.getState().defaultTabConfig.order;
    expect(order[0]).toBe("history");
    expect(order).toHaveLength(DEFAULT_TAB_CONFIG.order.length);
  });

  it("sanitizes corrupt projectTabOverrides (array) → {} during migrate", async () => {
    await seedAndRehydrate(JSON.stringify({
      version: 3,
      state: { projectTabOverrides: ["not", "an", "object"] },
    }));
    expect(useSettingsStore.getState().projectTabOverrides).toEqual({});
  });

  it("preserves valid override-patch with order-only diff (no hidden field)", async () => {
    await seedAndRehydrate(JSON.stringify({
      version: 3,
      state: {
        projectTabOverrides: {
          "c:/proj/a": { order: ["history", "skills", "claude-md", "hooks", "settings", "agents", "github", "worktrees", "kanban"] },
        },
      },
    }));
    const overrides = useSettingsStore.getState().projectTabOverrides;
    expect(overrides["c:/proj/a"]?.order?.[0]).toBe("history");
    expect(overrides["c:/proj/a"]?.hidden).toBeUndefined();
  });
});

describe("settingsStore — setProjectTabOverride patch-merge", () => {
  beforeEach(() => { resetAllStores(); });

  it("merges order-only patch into existing override (preserves hidden)", () => {
    const folder = "C:/Proj/A";
    const { setProjectTabOverride } = useSettingsStore.getState();
    setProjectTabOverride(folder, { hidden: ["skills"] });
    setProjectTabOverride(folder, { order: ["history", "claude-md", "skills", "hooks", "settings", "agents", "github", "worktrees", "kanban"] });
    const out = useSettingsStore.getState().projectTabOverrides["c:/proj/a"];
    expect(out?.hidden).toEqual(["skills"]);
    expect(out?.order?.[0]).toBe("history");
  });

  it("merges hidden-only patch into existing override (preserves order)", () => {
    const folder = "C:/Proj/B";
    const { setProjectTabOverride } = useSettingsStore.getState();
    setProjectTabOverride(folder, { order: ["history", "claude-md", "skills", "hooks", "settings", "agents", "github", "worktrees", "kanban"] });
    setProjectTabOverride(folder, { hidden: ["kanban"] });
    const out = useSettingsStore.getState().projectTabOverrides["c:/proj/b"];
    expect(out?.order?.[0]).toBe("history");
    expect(out?.hidden).toEqual(["kanban"]);
  });

  it("ignores no-op patch (empty object)", () => {
    const folder = "C:/Proj/C";
    const { setProjectTabOverride } = useSettingsStore.getState();
    setProjectTabOverride(folder, {});
    expect(useSettingsStore.getState().projectTabOverrides["c:/proj/c"]).toBeUndefined();
  });

  it("sanitizes incoming patch — drops unknown TabIds", () => {
    const folder = "C:/Proj/D";
    const { setProjectTabOverride } = useSettingsStore.getState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setProjectTabOverride(folder, { hidden: ["history", "garbage"] as any });
    const out = useSettingsStore.getState().projectTabOverrides["c:/proj/d"];
    expect(out?.hidden).toEqual(["history"]);
  });
});

describe("settingsStore — resetProjectTabOverride", () => {
  beforeEach(() => { resetAllStores(); });

  it("removes the override key completely (no empty patch left behind)", () => {
    const folder = "C:/Proj/E";
    const { setProjectTabOverride, resetProjectTabOverride } = useSettingsStore.getState();
    setProjectTabOverride(folder, { hidden: ["history"] });
    expect(useSettingsStore.getState().projectTabOverrides["c:/proj/e"]).toBeDefined();
    resetProjectTabOverride(folder);
    expect(useSettingsStore.getState().projectTabOverrides["c:/proj/e"]).toBeUndefined();
  });

  it("is a no-op when no override exists for the folder", () => {
    const before = useSettingsStore.getState().projectTabOverrides;
    useSettingsStore.getState().resetProjectTabOverride("C:/Unknown/Folder");
    expect(useSettingsStore.getState().projectTabOverrides).toBe(before);
  });
});

describe("settingsStore — configSubTab sync (Spec §6.3)", () => {
  beforeEach(() => { resetAllStores(); });

  it("re-routes uiStore.configSubTab when active tab is hidden", async () => {
    useUIStore.setState({ configSubTab: "skills" });
    useSettingsStore.getState().setProjectTabOverride("C:/Proj/F", { hidden: ["skills"] });
    // syncConfigSubTab defers via dynamic import → wait a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(useUIStore.getState().configSubTab).not.toBe("skills");
  });

  it("leaves uiStore.configSubTab alone when active tab stays visible", async () => {
    useUIStore.setState({ configSubTab: "history" });
    useSettingsStore.getState().setProjectTabOverride("C:/Proj/G", { hidden: ["skills"] });
    await new Promise((r) => setTimeout(r, 10));
    expect(useUIStore.getState().configSubTab).toBe("history");
  });

  it("does not touch pin: tabs even when hidden changes", async () => {
    useUIStore.setState({ configSubTab: "pin:abc123" });
    useSettingsStore.getState().setProjectTabOverride("C:/Proj/H", { hidden: ["skills"] });
    await new Promise((r) => setTimeout(r, 10));
    expect(useUIStore.getState().configSubTab).toBe("pin:abc123");
  });

  it("re-routes after resetProjectTabOverride if active tab not in default", async () => {
    useSettingsStore.setState({
      defaultTabConfig: { ...DEFAULT_TAB_CONFIG, hidden: ["history"] },
    });
    useSettingsStore.getState().setProjectTabOverride("C:/Proj/I", { hidden: [] });
    useUIStore.setState({ configSubTab: "history" });
    useSettingsStore.getState().resetProjectTabOverride("C:/Proj/I");
    await new Promise((r) => setTimeout(r, 10));
    expect(useUIStore.getState().configSubTab).not.toBe("history");
  });
});
