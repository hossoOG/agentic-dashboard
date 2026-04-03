import { describe, it, expect, beforeEach } from "vitest";
import {
  useSessionHistoryStore,
  type SessionHistoryEntry,
} from "./sessionHistoryStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHistoryEntry(
  overrides: Partial<SessionHistoryEntry> = {}
): SessionHistoryEntry {
  return {
    id: `hist-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: `sess-${Math.random().toString(36).slice(2, 8)}`,
    projectFolder: "c:/projects/test",
    title: "Test Session",
    startedAt: Date.now() - 60_000,
    finishedAt: Date.now(),
    durationMs: 60_000,
    outcome: "success",
    exitCode: 0,
    agentCount: 1,
    lastOutputSnippet: "Done.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useSessionHistoryStore.setState({ entries: [] });
  localStorage.clear();
});

describe("addEntry", () => {
  it("prepends entry to list", () => {
    const entry1 = makeHistoryEntry({ sessionId: "s1", startedAt: 1000 });
    const entry2 = makeHistoryEntry({ sessionId: "s2", startedAt: 2000 });

    useSessionHistoryStore.getState().addEntry(entry1);
    useSessionHistoryStore.getState().addEntry(entry2);

    const entries = useSessionHistoryStore.getState().entries;
    expect(entries).toHaveLength(2);
    // entry2 was added last, so it should be first (prepended)
    expect(entries[0].sessionId).toBe("s2");
    expect(entries[1].sessionId).toBe("s1");
  });

  it("deduplicates by sessionId (second add with same sessionId is no-op)", () => {
    const entry = makeHistoryEntry({ sessionId: "dup-1" });

    useSessionHistoryStore.getState().addEntry(entry);
    useSessionHistoryStore.getState().addEntry({ ...entry, id: "different-id" });

    expect(useSessionHistoryStore.getState().entries).toHaveLength(1);
  });

  it("enforces MAX per project (add 501 entries for same project, verify 500 kept)", () => {
    const entries: SessionHistoryEntry[] = [];
    for (let i = 0; i < 501; i++) {
      entries.push(
        makeHistoryEntry({
          sessionId: `sess-${i}`,
          projectFolder: "c:/projects/test",
        })
      );
    }

    for (const entry of entries) {
      useSessionHistoryStore.getState().addEntry(entry);
    }

    const stored = useSessionHistoryStore.getState().entries;
    expect(stored).toHaveLength(500);
  });

  it("keeps newest entries when capped (oldest removed)", () => {
    // Add 500 entries first
    for (let i = 0; i < 500; i++) {
      useSessionHistoryStore.getState().addEntry(
        makeHistoryEntry({
          sessionId: `old-${i}`,
          projectFolder: "c:/projects/test",
        })
      );
    }

    // Add one more — the oldest should be evicted
    const newest = makeHistoryEntry({
      sessionId: "newest",
      projectFolder: "c:/projects/test",
    });
    useSessionHistoryStore.getState().addEntry(newest);

    const stored = useSessionHistoryStore.getState().entries;
    expect(stored).toHaveLength(500);
    // Newest entry should be first (prepended)
    expect(stored[0].sessionId).toBe("newest");
    // The very first entry added (old-499 was prepended last among old ones,
    // so old-0 ended up at the tail) should be gone
    expect(stored.some((e) => e.sessionId === "old-0")).toBe(false);
  });
});

describe("clearForProject", () => {
  it("removes entries matching normalized folder", () => {
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s1", projectFolder: "c:/projects/foo" })
    );
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s2", projectFolder: "c:/projects/foo" })
    );

    useSessionHistoryStore.getState().clearForProject("c:/projects/foo");

    expect(useSessionHistoryStore.getState().entries).toHaveLength(0);
  });

  it('normalizes: "C:\\\\Projects\\\\Foo" matches "c:/projects/foo"', () => {
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s1", projectFolder: "c:/projects/foo" })
    );

    // clearForProject uses normalizeFolder internally
    useSessionHistoryStore.getState().clearForProject("C:\\Projects\\Foo");

    expect(useSessionHistoryStore.getState().entries).toHaveLength(0);
  });

  it("preserves entries from other projects", () => {
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s1", projectFolder: "c:/projects/foo" })
    );
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s2", projectFolder: "c:/projects/bar" })
    );

    useSessionHistoryStore.getState().clearForProject("c:/projects/foo");

    const entries = useSessionHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].projectFolder).toBe("c:/projects/bar");
  });
});

describe("getEntriesForProject", () => {
  it("returns entries sorted by startedAt descending", () => {
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s1", projectFolder: "c:/projects/test", startedAt: 1000 })
    );
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s2", projectFolder: "c:/projects/test", startedAt: 3000 })
    );
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s3", projectFolder: "c:/projects/test", startedAt: 2000 })
    );

    const result = useSessionHistoryStore.getState().getEntriesForProject("c:/projects/test");
    expect(result).toHaveLength(3);
    expect(result[0].startedAt).toBe(3000);
    expect(result[1].startedAt).toBe(2000);
    expect(result[2].startedAt).toBe(1000);
  });

  it("returns empty array for unknown project", () => {
    const result = useSessionHistoryStore.getState().getEntriesForProject("c:/nonexistent");
    expect(result).toEqual([]);
  });

  it("normalizes folder path before comparison", () => {
    useSessionHistoryStore.getState().addEntry(
      makeHistoryEntry({ sessionId: "s1", projectFolder: "c:/projects/test" })
    );

    // Query with backslashes and mixed case
    const result = useSessionHistoryStore
      .getState()
      .getEntriesForProject("C:\\Projects\\Test");
    expect(result).toHaveLength(1);
  });
});
