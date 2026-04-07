import { describe, it, expect } from "vitest";
import {
  looksLikePrompt,
  getActivityLevel,
  IDLE_THRESHOLD_MS,
} from "./activityLevel";

describe("looksLikePrompt", () => {
  it("returns true for (y/n) prompt", () => {
    expect(looksLikePrompt("Proceed(y/n)")).toBe(true);
  });

  it("returns true for [y/N] prompt", () => {
    expect(looksLikePrompt("Confirm [y/N]")).toBe(true);
  });

  it("returns true for [Y/n] prompt", () => {
    expect(looksLikePrompt("Confirm [Y/n]")).toBe(true);
  });

  it("returns false for non-prompt text", () => {
    expect(looksLikePrompt("Some output")).toBe(false);
  });
});

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
