import { describe, it, expect, beforeEach } from "vitest";
import {
  useLogViewerStore,
  parseBackendLogLine,
  type UnifiedLogEntry,
} from "./logViewerStore";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useLogViewerStore.setState({
    entries: [],
    severityFilter: new Set(["error", "warn", "info"]),
    sourceFilter: new Set(["frontend", "backend", "pipeline"]),
    searchText: "",
    liveTail: true,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(
  overrides: Partial<Omit<UnifiedLogEntry, "id">> = {}
): Omit<UnifiedLogEntry, "id"> {
  return {
    timestamp: "2025-01-15T10:30:00.000Z",
    severity: "info",
    source: "frontend",
    message: "test message",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// initial state
// ---------------------------------------------------------------------------

describe("initial state", () => {
  it("empty entries, all severities, all sources, empty search, liveTail=true", () => {
    const state = useLogViewerStore.getState();
    expect(state.entries).toEqual([]);
    expect(state.severityFilter).toEqual(new Set(["error", "warn", "info"]));
    expect(state.sourceFilter).toEqual(
      new Set(["frontend", "backend", "pipeline"])
    );
    expect(state.searchText).toBe("");
    expect(state.liveTail).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addEntries
// ---------------------------------------------------------------------------

describe("addEntries", () => {
  it("assigns auto-incrementing IDs", () => {
    useLogViewerStore.getState().addEntries([makeEntry(), makeEntry()]);

    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(2);
    // IDs should be sequential (relative ordering)
    expect(entries[1].id).toBe(entries[0].id + 1);
  });

  it("caps at MAX_ENTRIES=1000", () => {
    // Add 1100 entries in batches
    const batch = Array.from({ length: 1100 }, (_, i) =>
      makeEntry({ message: `msg-${i}` })
    );
    useLogViewerStore.getState().addEntries(batch);

    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(1000);
  });

  it("keeps newest when capped", () => {
    const batch = Array.from({ length: 1100 }, (_, i) =>
      makeEntry({ message: `msg-${i}` })
    );
    useLogViewerStore.getState().addEntries(batch);

    const entries = useLogViewerStore.getState().entries;
    // Newest entries (100..1099) should be kept, oldest (0..99) dropped
    expect(entries[0].message).toBe("msg-100");
    expect(entries[999].message).toBe("msg-1099");
  });
});

// ---------------------------------------------------------------------------
// clearEntries
// ---------------------------------------------------------------------------

describe("clearEntries", () => {
  it("empties array", () => {
    useLogViewerStore.getState().addEntries([makeEntry(), makeEntry()]);
    expect(useLogViewerStore.getState().entries).toHaveLength(2);

    useLogViewerStore.getState().clearEntries();
    expect(useLogViewerStore.getState().entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------

describe("filters", () => {
  it("setSeverityFilter updates filter", () => {
    const filter = new Set<"error" | "warn" | "info">(["error"]);
    useLogViewerStore.getState().setSeverityFilter(filter);

    expect(useLogViewerStore.getState().severityFilter).toEqual(
      new Set(["error"])
    );
  });

  it("setSourceFilter updates filter", () => {
    const filter = new Set<"frontend" | "backend" | "pipeline">(["backend"]);
    useLogViewerStore.getState().setSourceFilter(filter);

    expect(useLogViewerStore.getState().sourceFilter).toEqual(
      new Set(["backend"])
    );
  });

  it("setSearchText updates search text", () => {
    useLogViewerStore.getState().setSearchText("error pattern");
    expect(useLogViewerStore.getState().searchText).toBe("error pattern");
  });

  it("toggleLiveTail flips boolean", () => {
    expect(useLogViewerStore.getState().liveTail).toBe(true);

    useLogViewerStore.getState().toggleLiveTail();
    expect(useLogViewerStore.getState().liveTail).toBe(false);

    useLogViewerStore.getState().toggleLiveTail();
    expect(useLogViewerStore.getState().liveTail).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseBackendLogLine
// ---------------------------------------------------------------------------

describe("parseBackendLogLine", () => {
  it('parses valid Rust log format', () => {
    const result = parseBackendLogLine(
      "[2025-01-15 10:30:45.123] [ERROR] [auth] Login failed for user"
    );

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe("2025-01-15T10:30:45.123Z");
    expect(result!.severity).toBe("error");
    expect(result!.source).toBe("backend");
    expect(result!.module).toBe("auth");
    expect(result!.message).toBe("Login failed for user");
  });

  it("returns null for non-matching lines", () => {
    expect(parseBackendLogLine("just a random line")).toBeNull();
    expect(parseBackendLogLine("")).toBeNull();
    expect(parseBackendLogLine("[incomplete")).toBeNull();
  });

  it('maps DEBUG/TRACE to "info" severity', () => {
    const debug = parseBackendLogLine(
      "[2025-01-15 10:30:45.123] [DEBUG] [db] Query executed"
    );
    expect(debug).not.toBeNull();
    expect(debug!.severity).toBe("info");

    const trace = parseBackendLogLine(
      "[2025-01-15 10:30:45.123] [TRACE] [net] Packet received"
    );
    expect(trace).not.toBeNull();
    expect(trace!.severity).toBe("info");
  });
});
