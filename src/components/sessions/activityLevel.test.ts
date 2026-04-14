/**
 * Note: looksLikePrompt was removed — the Rust backend (manager.rs detect_status)
 * is the authoritative source for waiting-state detection and covers a superset
 * of patterns atomically per PTY chunk. See #221.
 */
import { describe, it, expect } from "vitest";
import { getActivityLevel, IDLE_THRESHOLD_MS } from "./activityLevel";

describe("getActivityLevel", () => {
  it("returns 'active' when elapsed < IDLE_THRESHOLD_MS", () => {
    const now = 50_000;
    const lastOutputAt = now - IDLE_THRESHOLD_MS + 1;
    expect(getActivityLevel(lastOutputAt, now)).toBe("active");
  });

  it("returns 'idle' when elapsed >= IDLE_THRESHOLD_MS", () => {
    const now = 100_000;
    const lastOutputAt = now - IDLE_THRESHOLD_MS;
    expect(getActivityLevel(lastOutputAt, now)).toBe("idle");
  });

  it("returns 'active' for very recent output", () => {
    const now = 10_000;
    const lastOutputAt = now - 1_000;
    expect(getActivityLevel(lastOutputAt, now)).toBe("active");
  });

  it("returns 'idle' for long-elapsed output", () => {
    const now = 200_000;
    const lastOutputAt = now - 120_000;
    expect(getActivityLevel(lastOutputAt, now)).toBe("idle");
  });
});
