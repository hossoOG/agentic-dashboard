import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock @tauri-apps/api/core BEFORE importing the hook (hoisted)
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useSessionRestore } from "./useSessionRestore";
import { useSessionStore } from "../store/sessionStore";
import { useSettingsStore } from "../store/settingsStore";
import { useUIStore } from "../store/uiStore";

const mockInvoke = vi.mocked(invoke);

interface ScanResult {
  session_id: string;
  started_at: string;
}

/**
 * Build a configurable invoke mock:
 *  - `create_session` echoes back the params with the chosen id/title/folder/shell
 *  - `scan_claude_sessions` returns the provided history per folder
 *  - other commands resolve to `undefined` (treated as no-op)
 */
function setupInvokeMock(historyPerFolder: Record<string, ScanResult[]> = {}) {
  // Tauri's invoke types `args` as `InvokeArgs` (which includes Uint8Array,
  // number[], etc.). For our tests every command takes a plain object, so we
  // narrow defensively at the call site.
  mockInvoke.mockImplementation((cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    if (cmd === "create_session") {
      return Promise.resolve({
        id: a.id as string,
        title: a.title as string,
        folder: a.folder as string,
        shell: a.shell as string,
      });
    }
    if (cmd === "scan_claude_sessions") {
      const folder = a.folder as string;
      return Promise.resolve(historyPerFolder[folder] ?? []);
    }
    return Promise.resolve(undefined);
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  useSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    layoutMode: "single",
    gridSessionIds: [],
    focusedGridSessionId: null,
  });
  // Toasts + UI store reset
  useUIStore.setState({ toasts: [] });
});

describe("useSessionRestore — claim-set fallback", () => {
  it("assigns distinct claudeSessionIds when persisted entries lack them", async () => {
    // Repro the user's bug: 3 cards persisted with same folder + title, no
    // claudeSessionId. scan_claude_sessions returns 3 distinct UUIDs.
    const folder = "C:/proj/m2";
    setupInvokeMock({
      [folder]: [
        { session_id: "uuid-newest", started_at: "2026-01-03T10:00:00Z" },
        { session_id: "uuid-mid", started_at: "2026-01-02T10:00:00Z" },
        { session_id: "uuid-oldest", started_at: "2026-01-01T10:00:00Z" },
      ],
    });
    useSettingsStore.setState({
      sessionRestore: {
        enabled: true,
        sessions: [
          { folder, title: "m2", shell: "powershell" },
          { folder, title: "m2", shell: "powershell" },
          { folder, title: "m2", shell: "powershell" },
        ],
        activeFolder: null,
        layoutMode: "single",
        gridFolders: [],
      },
    });

    renderHook(() => useSessionRestore());

    await waitFor(() => {
      expect(useSessionStore.getState().sessions).toHaveLength(3);
    });

    const restoredIds = useSessionStore
      .getState()
      .sessions.map((s) => s.claudeSessionId)
      .sort();
    // Expect each card to have latched onto a different UUID — no duplicates.
    expect(restoredIds).toEqual(["uuid-mid", "uuid-newest", "uuid-oldest"]);
    expect(new Set(restoredIds).size).toBe(3);
  });

  it("drops a duplicate persisted claudeSessionId and falls back to scan", async () => {
    // Defense for old persisted state from before Fix 1: two entries carry
    // the same UUID. The second should drop the resume hint and pick the
    // next-newest UUID from history.
    const folder = "C:/proj/m2";
    setupInvokeMock({
      [folder]: [
        { session_id: "uuid-A", started_at: "2026-01-02T10:00:00Z" },
        { session_id: "uuid-B", started_at: "2026-01-01T10:00:00Z" },
      ],
    });
    useSettingsStore.setState({
      sessionRestore: {
        enabled: true,
        sessions: [
          { folder, title: "m2", shell: "powershell", claudeSessionId: "uuid-A" },
          { folder, title: "m2", shell: "powershell", claudeSessionId: "uuid-A" },
        ],
        activeFolder: null,
        layoutMode: "single",
        gridFolders: [],
      },
    });

    renderHook(() => useSessionRestore());

    await waitFor(() => {
      expect(useSessionStore.getState().sessions).toHaveLength(2);
    });

    const restoredIds = useSessionStore.getState().sessions.map((s) => s.claudeSessionId);
    // First entry uses uuid-A (its persisted hint). Second entry drops the
    // duplicate hint, scans, and picks uuid-B (next-newest unclaimed).
    expect(restoredIds).toEqual(["uuid-A", "uuid-B"]);
  });

  it("falls back to fresh-spawn (undefined claudeSessionId) when scan is exhausted", async () => {
    // 3 entries to restore, but only 2 UUIDs in history. The 3rd must spawn
    // fresh (claudeSessionId = undefined) instead of recycling history[0].
    const folder = "C:/proj/m2";
    setupInvokeMock({
      [folder]: [
        { session_id: "uuid-1", started_at: "2026-01-02T10:00:00Z" },
        { session_id: "uuid-2", started_at: "2026-01-01T10:00:00Z" },
      ],
    });
    useSettingsStore.setState({
      sessionRestore: {
        enabled: true,
        sessions: [
          { folder, title: "m2", shell: "powershell" },
          { folder, title: "m2", shell: "powershell" },
          { folder, title: "m2", shell: "powershell" },
        ],
        activeFolder: null,
        layoutMode: "single",
        gridFolders: [],
      },
    });

    renderHook(() => useSessionRestore());

    await waitFor(() => {
      expect(useSessionStore.getState().sessions).toHaveLength(3);
    });

    const restoredIds = useSessionStore.getState().sessions.map((s) => s.claudeSessionId);
    // Array.sort() places undefined last per spec — that's how we line them up.
    expect(restoredIds.sort()).toEqual(["uuid-1", "uuid-2", undefined]);
  });

  it("preserves persisted claudeSessionIds when they are already distinct", async () => {
    // Sanity check for the happy path: post-Fix-1 state. All entries carry
    // distinct UUIDs, no scan needed, claim-set never blocks anything.
    const folder = "C:/proj/m2";
    setupInvokeMock();
    useSettingsStore.setState({
      sessionRestore: {
        enabled: true,
        sessions: [
          { folder, title: "m2", shell: "powershell", claudeSessionId: "uuid-1" },
          { folder, title: "m2", shell: "powershell", claudeSessionId: "uuid-2" },
        ],
        activeFolder: null,
        layoutMode: "single",
        gridFolders: [],
      },
    });

    renderHook(() => useSessionRestore());

    await waitFor(() => {
      expect(useSessionStore.getState().sessions).toHaveLength(2);
    });

    const restoredIds = useSessionStore.getState().sessions.map((s) => s.claudeSessionId);
    expect(restoredIds).toEqual(["uuid-1", "uuid-2"]);
    // scan_claude_sessions is the expensive Tauri call — it should NOT have
    // been invoked when both entries had a usable claudeSessionId.
    const scanCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "scan_claude_sessions");
    expect(scanCalls).toHaveLength(0);
  });
});
