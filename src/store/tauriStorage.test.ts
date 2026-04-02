import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @tauri-apps/api/core — must be before importing the module under test
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock the error logger to avoid noise and verify logging calls
vi.mock("../utils/errorLogger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

// tauriStorage checks `"__TAURI_INTERNALS__" in window` at module load.
// Without it, tauriStorage falls back to localStorage — which we can test directly.
// We test the non-Tauri (localStorage) path since jsdom doesn't have __TAURI_INTERNALS__.

import { tauriStorage, getLoadedFavorites, getLoadedNotes, registerNoteFlush } from "./tauriStorage";

// ---------------------------------------------------------------------------
// tauriStorage (localStorage fallback path)
// ---------------------------------------------------------------------------

describe("tauriStorage (localStorage fallback)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getItem", () => {
    it("returns null when key does not exist", () => {
      expect(tauriStorage.getItem("nonexistent")).toBeNull();
    });

    it("returns the stored value", () => {
      localStorage.setItem("my-key", '{"data":1}');
      expect(tauriStorage.getItem("my-key")).toBe('{"data":1}');
    });

    it("falls back to old persist key for agenticexplorer-settings", () => {
      // Migration: if new key has no data, try old key
      localStorage.setItem("agentic-dashboard-settings", '{"old":true}');
      expect(tauriStorage.getItem("agenticexplorer-settings")).toBe('{"old":true}');
    });

    it("prefers new key over old key for agenticexplorer-settings", () => {
      localStorage.setItem("agenticexplorer-settings", '{"new":true}');
      localStorage.setItem("agentic-dashboard-settings", '{"old":true}');
      expect(tauriStorage.getItem("agenticexplorer-settings")).toBe('{"new":true}');
    });
  });

  describe("setItem", () => {
    it("stores value in localStorage", () => {
      tauriStorage.setItem("test-key", '{"val":"hello"}');
      expect(localStorage.getItem("test-key")).toBe('{"val":"hello"}');
    });

    it("overwrites existing value", () => {
      tauriStorage.setItem("test-key", "first");
      tauriStorage.setItem("test-key", "second");
      expect(localStorage.getItem("test-key")).toBe("second");
    });
  });

  describe("removeItem", () => {
    it("removes the key from localStorage", () => {
      localStorage.setItem("test-key", "value");
      tauriStorage.removeItem("test-key");
      expect(localStorage.getItem("test-key")).toBeNull();
    });

    it("does not throw when removing non-existent key", () => {
      expect(() => tauriStorage.removeItem("missing")).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// getLoadedFavorites / getLoadedNotes (before init)
// ---------------------------------------------------------------------------

describe("getLoadedFavorites", () => {
  it("returns null before initTauriStorage is called", () => {
    // In test environment (non-Tauri), these are never populated
    expect(getLoadedFavorites()).toBeNull();
  });
});

describe("getLoadedNotes", () => {
  it("returns null before initTauriStorage is called", () => {
    expect(getLoadedNotes()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// registerNoteFlush
// ---------------------------------------------------------------------------

describe("registerNoteFlush", () => {
  it("accepts a flush function without throwing", () => {
    const flushFn = vi.fn(() => Promise.resolve());
    expect(() => registerNoteFlush(flushFn)).not.toThrow();
  });
});
