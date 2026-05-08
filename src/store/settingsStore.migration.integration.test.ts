/**
 * Layer-B integration test — settingsStore migration contract for Issue #209.
 *
 * Locks the contract that `migrate()` MUST validate persisted
 * `claudeSessionId` values as UUID-v4 (and dedupe duplicate IDs) when
 * rehydrating the persist payload.
 *
 * STATUS: This file is RED-BY-DESIGN today (Wave 3). The current migration
 * (settingsStore.ts ~L632-634) spreads `p.sessionRestore` blindly without
 * validating the `sessions[]` array. Wave 4 F4.2 will introduce a
 * `validateSessionRestore` helper modeled on `validatePinnedDocs`
 * (settingsStore.ts ~L599-617). Once F4.2 lands, the RED tests flip GREEN
 * with no test changes.
 *
 * Plan reference: reports/2026-05-08-session-loading-real-tests-PLAN.md (Wave 3 / B3.5)
 *
 * Test environment notes:
 *  - Persist key: `"agenticexplorer-settings"` (settingsStore.ts L555).
 *  - Storage adapter: `tauriStorage` falls back to localStorage when
 *    `__TAURI_INTERNALS__` is absent (jsdom). So localStorage seeding
 *    works the same way Wave-3 plan documented.
 *  - Rehydrate API: zustand persist middleware exposes
 *    `useSettingsStore.persist.rehydrate()` returning a Promise. Calling
 *    it after seeding localStorage forces a fresh read + `migrate()` run.
 *  - Per CLAUDE rules: NEVER `vi.mock("@tauri-apps/api/core")`. NEVER
 *    mock production modules. This test only seeds localStorage and
 *    exercises the real store.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settingsStore";
import { resetAllStores } from "../test/storeReset";

const PERSIST_KEY = "agenticexplorer-settings";

// Valid UUID-v4 fixtures (4xxx version nibble + 8/9/a/b variant nibble).
const VALID_UUID_A = "12345678-1234-4234-8234-123456789012";
const VALID_UUID_B = "abcdef01-2345-4678-9abc-def012345678";

interface PersistedSessionEntry {
  folder: string;
  title: string;
  shell: string;
  claudeSessionId?: unknown;
}

/**
 * Build a persist-shaped payload with the given sessions array. Mirrors
 * the zustand `{ version, state }` envelope produced by the persist
 * middleware (settingsStore.ts version: 3).
 */
function buildPersistPayload(sessions: PersistedSessionEntry[]): string {
  return JSON.stringify({
    version: 3,
    state: {
      sessionRestore: {
        enabled: true,
        sessions,
        activeFolder: null,
        layoutMode: "single",
        gridFolders: [],
      },
    },
  });
}

/**
 * Force a fresh migrate() pass: reset stores (clears localStorage), seed
 * the persist key with the test fixture, then call rehydrate() so
 * zustand re-reads + migrates the payload into the live store.
 */
async function seedAndRehydrate(payload: string): Promise<void> {
  resetAllStores();
  localStorage.setItem(PERSIST_KEY, payload);
  // Type assertion: zustand persist middleware adds `.persist` to the
  // store API but the public types vary by version. The runtime API
  // exposes `rehydrate()` returning a Promise<void>.
  const store = useSettingsStore as unknown as {
    persist: { rehydrate: () => Promise<void> };
  };
  await store.persist.rehydrate();
}

describe("settingsStore migration — Issue #209 sessionRestore contract", () => {
  beforeEach(() => {
    resetAllStores();
  });

  it("filters entries with non-UUID claudeSessionId during migration", async () => {
    // STATUS: RED today, GREEN after Wave 4 F4.2.
    // The migration today spreads `p.sessionRestore` blindly — both the
    // "not-a-uuid" and the valid entry survive. F4.2 will add a
    // validateSessionRestore step that drops the non-UUID entry.
    await seedAndRehydrate(
      buildPersistPayload([
        {
          folder: "C:\\test\\a",
          title: "x",
          shell: "powershell",
          claudeSessionId: "not-a-uuid",
        },
        {
          folder: "C:\\test\\b",
          title: "y",
          shell: "powershell",
          claudeSessionId: VALID_UUID_A,
        },
      ]),
    );

    const sessions = useSettingsStore.getState().sessionRestore.sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].claudeSessionId).toBe(VALID_UUID_A);
    expect(sessions[0].folder).toBe("C:\\test\\b");
  });

  it("filters entries where claudeSessionId is the wrong type (number, object, null)", async () => {
    // STATUS: RED today, GREEN after Wave 4 F4.2.
    // Validates type narrowing: only a string matching the UUID-v4 shape
    // is acceptable. Numbers, plain objects, and explicit `null` (vs.
    // legitimately-undefined pre-discovery state) MUST be filtered.
    await seedAndRehydrate(
      buildPersistPayload([
        {
          folder: "C:\\test\\num",
          title: "num",
          shell: "powershell",
          claudeSessionId: 12345,
        },
        {
          folder: "C:\\test\\obj",
          title: "obj",
          shell: "powershell",
          claudeSessionId: { id: VALID_UUID_A } as unknown,
        },
        {
          folder: "C:\\test\\null",
          title: "null",
          shell: "powershell",
          claudeSessionId: null,
        },
        {
          folder: "C:\\test\\valid",
          title: "valid",
          shell: "powershell",
          claudeSessionId: VALID_UUID_A,
        },
      ]),
    );

    const sessions = useSettingsStore.getState().sessionRestore.sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].folder).toBe("C:\\test\\valid");
    expect(sessions[0].claudeSessionId).toBe(VALID_UUID_A);
  });

  it("preserves entries with claudeSessionId === undefined (legitimate pre-discovery state)", async () => {
    // STATUS: GREEN today.
    // A session entry with NO claudeSessionId field is legitimate —
    // the field gets populated lazily once the Claude CLI emits its
    // session UUID. This must not be filtered out either today or
    // after F4.2.
    await seedAndRehydrate(
      buildPersistPayload([
        {
          folder: "C:\\test\\pre-discovery",
          title: "pending",
          shell: "powershell",
          // claudeSessionId intentionally omitted
        },
      ]),
    );

    const sessions = useSettingsStore.getState().sessionRestore.sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].folder).toBe("C:\\test\\pre-discovery");
    expect(sessions[0].claudeSessionId).toBeUndefined();
  });

  it("preserves multiple entries with valid UUID-v4 ids", async () => {
    // STATUS: GREEN today.
    // Sanity floor: a clean payload of valid UUIDs must round-trip
    // unchanged through migrate(). If F4.2 over-filters, this test
    // catches the regression.
    await seedAndRehydrate(
      buildPersistPayload([
        {
          folder: "C:\\test\\one",
          title: "one",
          shell: "powershell",
          claudeSessionId: VALID_UUID_A,
        },
        {
          folder: "C:\\test\\two",
          title: "two",
          shell: "bash",
          claudeSessionId: VALID_UUID_B,
        },
      ]),
    );

    const sessions = useSettingsStore.getState().sessionRestore.sessions;
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.claudeSessionId).sort();
    expect(ids).toEqual([VALID_UUID_A, VALID_UUID_B].sort());
  });

  it("deduplicates entries with the same claudeSessionId during hydration", async () => {
    // STATUS: RED today, GREEN after Wave 4 F4.2.
    // Migration-time dedup complements the persist-time dedup that
    // already exists in the action layer. Two entries sharing a UUID
    // (e.g. from a botched manual edit of settings.json) must collapse
    // to one. Order-preserving: first-seen wins.
    await seedAndRehydrate(
      buildPersistPayload([
        {
          folder: "C:\\test\\first",
          title: "first",
          shell: "powershell",
          claudeSessionId: VALID_UUID_A,
        },
        {
          folder: "C:\\test\\duplicate",
          title: "duplicate",
          shell: "powershell",
          claudeSessionId: VALID_UUID_A,
        },
      ]),
    );

    const sessions = useSettingsStore.getState().sessionRestore.sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].claudeSessionId).toBe(VALID_UUID_A);
    // First-seen-wins: the "first" entry survives, "duplicate" is dropped.
    expect(sessions[0].folder).toBe("C:\\test\\first");
  });
});
