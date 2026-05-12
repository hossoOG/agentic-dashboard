/**
 * Unit tests for `tabConfig.ts` — sanitize helpers + pure resolver.
 *
 * No store/IPC/React touch — these are pure functions, validated against
 * the spec's sanitize-rules and resolver contract (Spec §4.3, §5.3).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAB_CONFIG,
  KNOWN_TAB_IDS,
  type PresenceMap,
  type TabConfig,
  type TabId,
  getTabsForProject,
  sanitizeOverrides,
  sanitizeTabConfig,
} from "./tabConfig";

const FULL_PRESENCE: PresenceMap = {
  claudeMd: true,
  skills: true,
  agents: true,
  hooks: true,
  settings: true,
  git: true,
  github: true,
};

describe("sanitizeTabConfig", () => {
  it("returns DEFAULT_TAB_CONFIG for null/undefined/array/primitive input", () => {
    expect(sanitizeTabConfig(null)).toEqual(DEFAULT_TAB_CONFIG);
    expect(sanitizeTabConfig(undefined)).toEqual(DEFAULT_TAB_CONFIG);
    expect(sanitizeTabConfig([])).toEqual(DEFAULT_TAB_CONFIG);
    expect(sanitizeTabConfig(42)).toEqual(DEFAULT_TAB_CONFIG);
    expect(sanitizeTabConfig("garbage")).toEqual(DEFAULT_TAB_CONFIG);
  });

  it("strips unknown TabIds from order and hidden", () => {
    const input = {
      order: ["skills", "unknown-tab", "claude-md"],
      hidden: ["bogus", "history"],
    };
    const out = sanitizeTabConfig(input);
    expect(out.order).not.toContain("unknown-tab");
    expect(out.hidden).toEqual(["history"]);
  });

  it("removes duplicate TabIds from order (first-seen wins)", () => {
    const input = {
      order: ["skills", "skills", "claude-md", "skills"],
      hidden: [],
    };
    const out = sanitizeTabConfig(input);
    const skillsCount = out.order.filter((t) => t === "skills").length;
    expect(skillsCount).toBe(1);
  });

  it("appends missing TabIds in DEFAULT order (self-healing)", () => {
    const input: { order: TabId[]; hidden: TabId[] } = {
      order: ["history", "claude-md"],
      hidden: [],
    };
    const out = sanitizeTabConfig(input);
    expect(out.order).toHaveLength(KNOWN_TAB_IDS.length);
    expect(out.order[0]).toBe("history");
    expect(out.order[1]).toBe("claude-md");
    // Remaining IDs in DEFAULT order
    expect(out.order.slice(2)).toEqual(
      DEFAULT_TAB_CONFIG.order.filter((id) => id !== "history" && id !== "claude-md"),
    );
  });

  it("falls back to DEFAULT order when order field is non-array", () => {
    const out = sanitizeTabConfig({ order: "not-an-array", hidden: [] });
    expect(out.order).toEqual(DEFAULT_TAB_CONFIG.order);
  });

  it("falls back to empty hidden when hidden field is non-array", () => {
    const out = sanitizeTabConfig({ order: [], hidden: "broken" });
    expect(out.hidden).toEqual([]);
  });
});

describe("sanitizeOverrides", () => {
  it("returns {} for null/array/primitive input", () => {
    expect(sanitizeOverrides(null)).toEqual({});
    expect(sanitizeOverrides([])).toEqual({});
    expect(sanitizeOverrides("nope")).toEqual({});
    expect(sanitizeOverrides(42)).toEqual({});
  });

  it("drops invalid entries with non-object values", () => {
    const input = {
      "c:/proj/a": "not-an-object",
      "c:/proj/b": { order: ["skills", "claude-md"] },
    };
    const out = sanitizeOverrides(input);
    expect(out["c:/proj/a"]).toBeUndefined();
    expect(out["c:/proj/b"]).toBeDefined();
  });

  it("preserves Partial semantics — order-only patch has no hidden field", () => {
    const out = sanitizeOverrides({
      "c:/proj/a": { order: ["history", "skills"] },
    });
    expect(out["c:/proj/a"]?.order).toBeDefined();
    expect(out["c:/proj/a"]?.hidden).toBeUndefined();
  });

  it("self-heals override.order with missing TabIds (full array post-sanitize)", () => {
    const out = sanitizeOverrides({
      "c:/proj/a": { order: ["history"] },
    });
    expect(out["c:/proj/a"]?.order).toHaveLength(KNOWN_TAB_IDS.length);
    expect(out["c:/proj/a"]?.order?.[0]).toBe("history");
  });

  it("drops empty patches (no order, no hidden)", () => {
    const out = sanitizeOverrides({
      "c:/proj/a": {},
      "c:/proj/b": { order: [] },
    });
    expect(out["c:/proj/a"]).toBeUndefined();
    // b has order [] which sanitizes to full default order (self-healing) → kept
    expect(out["c:/proj/b"]?.order).toHaveLength(KNOWN_TAB_IDS.length);
  });

  it("strips unknown TabIds from override.hidden", () => {
    const out = sanitizeOverrides({
      "c:/proj/a": { hidden: ["bogus", "skills", "also-bogus"] },
    });
    expect(out["c:/proj/a"]?.hidden).toEqual(["skills"]);
  });
});

describe("getTabsForProject", () => {
  const defaultConfig: TabConfig = DEFAULT_TAB_CONFIG;

  it("returns DEFAULT order with full presence and no overrides", () => {
    const tabs = getTabsForProject("c:/proj/a", FULL_PRESENCE, defaultConfig, {});
    expect(tabs.map((t) => t.id)).toEqual([...DEFAULT_TAB_CONFIG.order]);
  });

  it("applies override.order before presence/hidden filter", () => {
    const tabs = getTabsForProject(
      "c:/proj/a",
      FULL_PRESENCE,
      defaultConfig,
      {
        "c:/proj/a": { order: ["history", "claude-md", "skills", "hooks", "settings", "agents", "github", "worktrees", "kanban"] },
      },
    );
    expect(tabs[0].id).toBe("history");
    expect(tabs[1].id).toBe("claude-md");
  });

  it("hides tabs listed in override.hidden", () => {
    const tabs = getTabsForProject(
      "c:/proj/a",
      FULL_PRESENCE,
      defaultConfig,
      {
        "c:/proj/a": { hidden: ["kanban", "history"] },
      },
    );
    const ids = tabs.map((t) => t.id);
    expect(ids).not.toContain("kanban");
    expect(ids).not.toContain("history");
  });

  it("respects presence even when override.hidden is empty (Code gewinnt)", () => {
    const presence: PresenceMap = { ...FULL_PRESENCE, skills: false };
    const tabs = getTabsForProject("c:/proj/a", presence, defaultConfig, {});
    expect(tabs.find((t) => t.id === "skills")).toBeUndefined();
  });

  it("falls back to defaultConfig when no override for folder", () => {
    const customDefault: TabConfig = {
      order: ["history", "kanban", "worktrees", "github", "agents", "settings", "hooks", "skills", "claude-md"],
      hidden: ["skills"],
    };
    const tabs = getTabsForProject("c:/proj/unknown", FULL_PRESENCE, customDefault, {});
    expect(tabs[0].id).toBe("history");
    expect(tabs.find((t) => t.id === "skills")).toBeUndefined();
  });

  it("uses normalizeProjectKey — folder paths with backslashes still match", () => {
    const overrides = {
      "c:/proj/a": { hidden: ["history"] as TabId[] },
    };
    const tabs = getTabsForProject("C:\\Proj\\A", FULL_PRESENCE, defaultConfig, overrides);
    expect(tabs.find((t) => t.id === "history")).toBeUndefined();
  });

  it("treats null presence as 'all visible' (loading state)", () => {
    const tabs = getTabsForProject("c:/proj/a", null, defaultConfig, {});
    expect(tabs.map((t) => t.id)).toEqual([...DEFAULT_TAB_CONFIG.order]);
  });
});
