import { describe, it, expect } from "vitest";
import {
  looksLikeThinking,
  looksLikePrompt,
  getActivityLevel,
  ACTIVE_THRESHOLD_MS,
  IDLE_THRESHOLD_MS,
} from "./activityLevel";

describe("looksLikeThinking", () => {
  it("returns true for spinner characters", () => {
    expect(looksLikeThinking("⠋ Processing...")).toBe(true);
  });

  it("returns true for 'Thinking' text", () => {
    expect(looksLikeThinking("Thinking")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looksLikeThinking("Hello world")).toBe(false);
  });
});

describe("looksLikePrompt", () => {
  it("returns true for (y/n) prompt", () => {
    expect(looksLikePrompt("Proceed(y/n)")).toBe(true);
  });

  it("returns true for [y/N] prompt", () => {
    expect(looksLikePrompt("Confirm [y/N]")).toBe(true);
  });

  it("returns true for (y/n) prompt", () => {
    expect(looksLikePrompt("Proceed(y/n)")).toBe(true);
  });

  it("returns true for [Y/n] prompt", () => {
    expect(looksLikePrompt("Confirm [Y/n]")).toBe(true);
  });

  it("returns false for non-prompt text", () => {
    expect(looksLikePrompt("Some output")).toBe(false);
  });
});

describe("getActivityLevel", () => {
  it("returns 'active' when elapsed < ACTIVE_THRESHOLD_MS", () => {
    const now = 10_000;
    const lastOutputAt = now - ACTIVE_THRESHOLD_MS + 1;
    expect(getActivityLevel(lastOutputAt, now)).toBe("active");
  });

  it("returns 'thinking' when elapsed is between thresholds", () => {
    const now = 50_000;
    const lastOutputAt = now - ACTIVE_THRESHOLD_MS - 1;
    expect(getActivityLevel(lastOutputAt, now)).toBe("thinking");
  });

  it("returns 'idle' when elapsed >= IDLE_THRESHOLD_MS with no snippet", () => {
    const now = 100_000;
    const lastOutputAt = now - IDLE_THRESHOLD_MS;
    expect(getActivityLevel(lastOutputAt, now)).toBe("idle");
  });

  it("returns 'idle' when elapsed >= IDLE_THRESHOLD_MS with prompt snippet", () => {
    const now = 100_000;
    const lastOutputAt = now - IDLE_THRESHOLD_MS;
    expect(getActivityLevel(lastOutputAt, now, "Continue? ")).toBe("idle");
  });
});
