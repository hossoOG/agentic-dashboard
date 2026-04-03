import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  logError,
  logWarn,
  logInfo,
  getRecentLogs,
  clearLogs,
  subscribeToLogs,
} from "./errorLogger";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearLogs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// logError
// ---------------------------------------------------------------------------

describe("logError", () => {
  it("adds error entry to buffer", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError("test-source", new Error("boom"));

    const logs = getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].severity).toBe("error");
    expect(logs[0].source).toBe("test-source");
  });

  it("calls console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("src", "fail");

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("extracts message from Error objects (inkl. stack)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("something broke");
    logError("mod", err);

    const entry = getRecentLogs()[0];
    expect(entry.message).toBe("something broke");
    expect(entry.stack).toBeDefined();
    expect(entry.stack).toContain("something broke");
  });

  it("extracts message from string errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError("mod", "plain string error");

    const entry = getRecentLogs()[0];
    expect(entry.message).toBe("plain string error");
    expect(entry.stack).toBeUndefined();
  });

  it("extracts message from plain objects via JSON.stringify", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError("mod", { code: 42, detail: "oops" });

    const entry = getRecentLogs()[0];
    expect(entry.message).toBe(JSON.stringify({ code: 42, detail: "oops" }));
  });

  it("falls back to String() for non-stringifiable", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logError("mod", circular);

    const entry = getRecentLogs()[0];
    expect(entry.message).toBe("[object Object]");
  });
});

// ---------------------------------------------------------------------------
// logWarn / logInfo
// ---------------------------------------------------------------------------

describe("logWarn / logInfo", () => {
  it("adds warn entry and calls console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("src", "warning msg");

    const logs = getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].severity).toBe("warn");
    expect(logs[0].message).toBe("warning msg");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("adds info entry and calls console.info", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logInfo("src", "info msg");

    const logs = getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].severity).toBe("info");
    expect(logs[0].message).toBe("info msg");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getRecentLogs
// ---------------------------------------------------------------------------

describe("getRecentLogs", () => {
  it("returns all entries", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});

    logError("a", "e1");
    logWarn("b", "w1");
    logInfo("c", "i1");

    expect(getRecentLogs()).toHaveLength(3);
  });

  it("FIFO: keeps last 100 when buffer overflows", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    for (let i = 0; i < 120; i++) {
      logInfo("src", `msg-${i}`);
    }

    const logs = getRecentLogs();
    expect(logs).toHaveLength(100);
    // First entry should be msg-20 (oldest kept after 120 inserts into 100-cap buffer)
    expect(logs[0].message).toBe("msg-20");
    expect(logs[99].message).toBe("msg-119");
  });
});

// ---------------------------------------------------------------------------
// clearLogs
// ---------------------------------------------------------------------------

describe("clearLogs", () => {
  it("empties buffer", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError("s", "x");
    expect(getRecentLogs()).toHaveLength(1);

    clearLogs();
    expect(getRecentLogs()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// subscribeToLogs
// ---------------------------------------------------------------------------

describe("subscribeToLogs", () => {
  it("subscriber receives new entries", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const received: unknown[] = [];
    subscribeToLogs((entry) => received.push(entry));

    logInfo("s", "hello");

    expect(received).toHaveLength(1);
    expect((received[0] as { message: string }).message).toBe("hello");
  });

  it("unsubscribe stops notifications", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const received: unknown[] = [];
    const unsub = subscribeToLogs((entry) => received.push(entry));

    logInfo("s", "first");
    unsub();
    logInfo("s", "second");

    expect(received).toHaveLength(1);
  });

  it("new subscriber replaces old (last wins)", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const first: unknown[] = [];
    const second: unknown[] = [];

    subscribeToLogs((entry) => first.push(entry));
    subscribeToLogs((entry) => second.push(entry));

    logInfo("s", "test");

    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });
});
