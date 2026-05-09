import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  logError,
  logWarn,
  logInfo,
  wireLoggingGate,
} from "./errorLogger";
import { useLogViewerStore } from "../store/logViewerStore";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset shared log store between tests (no longer a separate ring buffer
  // in errorLogger — it pushes directly into logViewerStore now).
  useLogViewerStore.setState({
    entries: [],
    severityFilter: new Set(["error", "warn", "info"]),
    sourceFilter: new Set(["frontend", "backend"]),
    searchText: "",
    liveTail: true,
  });
  // Open the gate so prior tests' wireLoggingGate-off doesn't bleed in.
  wireLoggingGate(() => true);
  vi.restoreAllMocks();
});

afterEach(() => {
  // Reset gate to default for the rest of the suite.
  wireLoggingGate(() => true);
});

// ---------------------------------------------------------------------------
// logError — pushes into logViewerStore with source: "frontend"
// ---------------------------------------------------------------------------

describe("logError", () => {
  it("pushes an error entry into logViewerStore", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError("test-source", new Error("boom"));

    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].severity).toBe("error");
    expect(entries[0].source).toBe("frontend");
    expect(entries[0].module).toBe("test-source");
    expect(entries[0].message).toBe("boom");
  });

  it("calls console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("src", "fail");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("captures the stack from Error objects", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError("mod", new Error("something broke"));

    const entry = useLogViewerStore.getState().entries[0];
    expect(entry.message).toBe("something broke");
    expect(entry.stack).toBeDefined();
    expect(entry.stack).toContain("something broke");
  });

  it("extracts a string error verbatim", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError("mod", "plain string error");

    const entry = useLogViewerStore.getState().entries[0];
    expect(entry.message).toBe("plain string error");
    expect(entry.stack).toBeUndefined();
  });

  it("JSON-stringifies plain object errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError("mod", { code: 42, detail: "oops" });

    const entry = useLogViewerStore.getState().entries[0];
    expect(entry.message).toBe(JSON.stringify({ code: 42, detail: "oops" }));
  });

  it("falls back to String() for non-stringifiable values", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logError("mod", circular);

    const entry = useLogViewerStore.getState().entries[0];
    expect(entry.message).toBe("[object Object]");
  });
});

// ---------------------------------------------------------------------------
// logWarn / logInfo
// ---------------------------------------------------------------------------

describe("logWarn / logInfo", () => {
  it("logWarn pushes a warn entry and calls console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("src", "warning msg");

    const entry = useLogViewerStore.getState().entries[0];
    expect(entry.severity).toBe("warn");
    expect(entry.message).toBe("warning msg");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("logInfo pushes an info entry and calls console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logInfo("src", "info msg");

    const entry = useLogViewerStore.getState().entries[0];
    expect(entry.severity).toBe("info");
    expect(entry.message).toBe("info msg");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// wireLoggingGate — runtime master switch
// ---------------------------------------------------------------------------

describe("wireLoggingGate", () => {
  it("logViewerStore stays empty when the gate returns false", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    wireLoggingGate(() => false);

    logError("src", new Error("dropped"));
    logWarn("src", "also dropped");
    logInfo("src", "and this");

    expect(useLogViewerStore.getState().entries).toHaveLength(0);
  });

  it("console mirror is also silenced while the gate is closed", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    wireLoggingGate(() => false);

    logError("src", "muted");

    expect(errSpy).not.toHaveBeenCalled();
  });

  it("entries flow again once the gate reopens", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    let enabled = false;
    wireLoggingGate(() => enabled);

    logInfo("src", "first");
    expect(useLogViewerStore.getState().entries).toHaveLength(0);

    enabled = true;
    logInfo("src", "second");
    const entries = useLogViewerStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("second");
  });
});
