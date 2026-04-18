import { describe, it, expect } from "vitest";
import { formatMs, formatElapsed, formatExit } from "./format";

describe("formatMs", () => {
  it("renders a plain integer with space + lowercase unit", () => {
    expect(formatMs(312)).toBe("312 ms");
  });

  it("renders zero as '0 ms'", () => {
    expect(formatMs(0)).toBe("0 ms");
  });

  it("rounds fractional input", () => {
    expect(formatMs(12.7)).toBe("13 ms");
  });

  it("clamps negative input to zero", () => {
    expect(formatMs(-5)).toBe("0 ms");
  });

  it("falls back for non-finite input", () => {
    expect(formatMs(Number.NaN)).toBe("– ms");
    expect(formatMs(Number.POSITIVE_INFINITY)).toBe("– ms");
  });
});

describe("formatElapsed", () => {
  it("renders zero as '0:00'", () => {
    expect(formatElapsed(0)).toBe("0:00");
  });

  it("pads the seconds field", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
  });

  it("renders minutes and seconds", () => {
    expect(formatElapsed(134_000)).toBe("2:14");
  });

  it("handles sub-second durations by flooring", () => {
    expect(formatElapsed(500)).toBe("0:00");
  });

  it("falls back to '0:00' for negative or non-finite input", () => {
    expect(formatElapsed(-1)).toBe("0:00");
    expect(formatElapsed(Number.NaN)).toBe("0:00");
  });
});

describe("formatExit", () => {
  it("renders 'Exit 0' for a success code", () => {
    expect(formatExit(0)).toBe("Exit 0");
  });

  it("renders 'Exit 1' for failure", () => {
    expect(formatExit(1)).toBe("Exit 1");
  });

  it("preserves non-standard codes verbatim", () => {
    expect(formatExit(137)).toBe("Exit 137");
  });

  it("returns an empty string for null/undefined", () => {
    expect(formatExit(null)).toBe("");
    expect(formatExit(undefined)).toBe("");
  });
});
