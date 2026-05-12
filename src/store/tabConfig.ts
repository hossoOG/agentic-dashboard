/**
 * Per-project tab-bar configuration.
 *
 * Lives in `store/` (not in `configPanelShared.tsx`) because this module
 * carries the persistence sanitize-helpers + a pure resolver, while
 * `configPanelShared.tsx` is UI-bound (imports `lucide-react`). Keeping
 * pure functions out of UI modules lets the unit tests run without
 * loading React.
 *
 * Spec: `tasks/specs/2026-05-12-tab-bar-config.md`.
 */
import type { ConfigTab, PresenceKey } from "../components/sessions/configPanelShared";
import { CONFIG_TABS_BY_ID, meetsPresence } from "../components/sessions/configPanelShared";

/**
 * Inlined to avoid an import cycle with `settingsStore.ts` (which itself
 * imports from this module). Must stay byte-identical to
 * `settingsStore.normalizeProjectKey`.
 */
function normalizeProjectKey(folder: string): string {
  return folder.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
}

/**
 * Canonical tab identifiers. Mirrors the entries in `CONFIG_TABS` and the
 * non-pin variants of `ConfigSubTab` (uiStore).
 */
export type TabId =
  | "claude-md"
  | "skills"
  | "hooks"
  | "settings"
  | "agents"
  | "github"
  | "worktrees"
  | "kanban"
  | "history";

export interface TabConfig {
  /** Full ordering of all known TabIds. */
  order: TabId[];
  /** Subset of TabIds the user has explicitly hidden. */
  hidden: TabId[];
}

export const KNOWN_TAB_IDS: readonly TabId[] = [
  "claude-md",
  "skills",
  "hooks",
  "settings",
  "agents",
  "github",
  "worktrees",
  "kanban",
  "history",
] as const;

export const DEFAULT_TAB_CONFIG: TabConfig = {
  order: [...KNOWN_TAB_IDS],
  hidden: [],
};

/** Presence map shape — derived from `PresenceKey` so the keys cannot drift. */
export type PresenceMap = Record<PresenceKey, boolean>;

function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && (KNOWN_TAB_IDS as readonly string[]).includes(value);
}

/**
 * Sanitize an unknown `TabConfig` payload from persisted storage.
 *
 * - `order`: filter to known TabIds, drop duplicates, append any missing
 *   IDs in `DEFAULT_TAB_CONFIG.order` order. Fallback (kaputt): full
 *   default order. This self-heals when CONFIG_TABS later gains a 10th
 *   entry — persisted arrays auto-receive the new id at the end.
 * - `hidden`: filter to known TabIds, drop duplicates. Fallback: `[]`.
 */
export function sanitizeTabConfig(input: unknown): TabConfig {
  const fallback: TabConfig = {
    order: [...DEFAULT_TAB_CONFIG.order],
    hidden: [],
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) return fallback;
  const raw = input as Record<string, unknown>;

  // Order
  let order: TabId[];
  if (Array.isArray(raw.order)) {
    const seen = new Set<TabId>();
    const cleaned: TabId[] = [];
    for (const entry of raw.order) {
      if (isTabId(entry) && !seen.has(entry)) {
        seen.add(entry);
        cleaned.push(entry);
      }
    }
    // Append missing known IDs in default order
    for (const id of DEFAULT_TAB_CONFIG.order) {
      if (!seen.has(id)) cleaned.push(id);
    }
    order = cleaned;
  } else {
    order = [...DEFAULT_TAB_CONFIG.order];
  }

  // Hidden
  let hidden: TabId[];
  if (Array.isArray(raw.hidden)) {
    const seen = new Set<TabId>();
    const cleaned: TabId[] = [];
    for (const entry of raw.hidden) {
      if (isTabId(entry) && !seen.has(entry)) {
        seen.add(entry);
        cleaned.push(entry);
      }
    }
    hidden = cleaned;
  } else {
    hidden = [];
  }

  return { order, hidden };
}

/**
 * Sanitize a `Record<string, Partial<TabConfig>>` payload from persisted
 * storage. Each value is normalized so `order` and `hidden` are present
 * only when they parse successfully — keeps Partial-semantics intact so
 * the resolver still falls back to the default for missing fields.
 *
 * Invalid entries are dropped with a console.warn (key-traceable).
 */
export function sanitizeOverrides(input: unknown): Record<string, Partial<TabConfig>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const result: Record<string, Partial<TabConfig>> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || !key.trim()) {
      // eslint-disable-next-line no-console
      console.warn(`[settingsStore] dropped invalid tab override for key=${String(key)}`);
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      // eslint-disable-next-line no-console
      console.warn(`[settingsStore] dropped invalid tab override for key=${key}`);
      continue;
    }
    const rawValue = value as Record<string, unknown>;
    const patch: Partial<TabConfig> = {};

    if (Array.isArray(rawValue.order)) {
      const seen = new Set<TabId>();
      const cleaned: TabId[] = [];
      for (const entry of rawValue.order) {
        if (isTabId(entry) && !seen.has(entry)) {
          seen.add(entry);
          cleaned.push(entry);
        }
      }
      // Self-healing: append missing known IDs in default order. Override
      // arrays must remain fully populated so dnd reorder is total.
      for (const id of DEFAULT_TAB_CONFIG.order) {
        if (!seen.has(id)) cleaned.push(id);
      }
      patch.order = cleaned;
    }

    if (Array.isArray(rawValue.hidden)) {
      const seen = new Set<TabId>();
      const cleaned: TabId[] = [];
      for (const entry of rawValue.hidden) {
        if (isTabId(entry) && !seen.has(entry)) {
          seen.add(entry);
          cleaned.push(entry);
        }
      }
      patch.hidden = cleaned;
    }

    // Empty patches (no order, no hidden) are noise — drop.
    if (Object.keys(patch).length === 0) continue;
    result[key] = patch;
  }

  return result;
}

/**
 * Pure resolver — given the project key, presence map, default config
 * and overrides record, returns the ordered + filtered list of visible
 * tabs. No store access, no React.
 *
 * Filter order matters: presence first (artifact gating wins), then
 * `hidden` (user toggle). This implements the "Code gewinnt"-Regel from
 * Spec §3 (#4): a user toggle persists latent but only takes effect
 * when the artifact exists.
 */
export function getTabsForProject(
  folder: string,
  presence: PresenceMap | null,
  defaultConfig: TabConfig,
  overrides: Record<string, Partial<TabConfig>>,
): ConfigTab[] {
  const key = normalizeProjectKey(folder);
  const override = overrides[key] ?? {};
  const order = override.order ?? defaultConfig.order;
  const hidden = new Set<TabId>(override.hidden ?? defaultConfig.hidden);

  return order
    .map((id) => CONFIG_TABS_BY_ID[id])
    .filter((tab): tab is ConfigTab => Boolean(tab))
    .filter((tab) => meetsPresence(tab, presence))
    .filter((tab) => !hidden.has(tab.id as TabId));
}
