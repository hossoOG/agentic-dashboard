import { describe, it, expect, vi } from "vitest";
import {
  isADPError,
  parseInvokeError,
  getErrorMessage,
  isRetryable,
  withRetry,
} from "./adpError";
import type { ADPError } from "../protocols/schema";

describe("isADPError", () => {
  it("returns true for valid ADPError objects", () => {
    const err: ADPError = {
      code: "INTERNAL_ERROR",
      message: "something broke",
      retryable: false,
    };
    expect(isADPError(err)).toBe(true);
  });

  it("returns true for ADPError with optional fields", () => {
    const err: ADPError = {
      code: "SERVICE_RATE_LIMITED",
      message: "slow down",
      retryable: true,
      retryAfterMs: 5000,
      details: "stack trace",
    };
    expect(isADPError(err)).toBe(true);
  });

  it("returns false for plain strings", () => {
    expect(isADPError("some error")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isADPError(null)).toBe(false);
    expect(isADPError(undefined)).toBe(false);
  });

  it("returns false for objects missing required fields", () => {
    expect(isADPError({ code: "X" })).toBe(false);
    expect(isADPError({ code: "X", message: "y" })).toBe(false);
    expect(isADPError({ message: "y", retryable: false })).toBe(false);
  });
});

describe("parseInvokeError", () => {
  it("passes through a valid ADPError", () => {
    const err: ADPError = {
      code: "FILE_IO_ERROR",
      message: "disk full",
      retryable: false,
    };
    expect(parseInvokeError(err)).toBe(err);
  });

  it("wraps a string error into INTERNAL_ERROR", () => {
    const result = parseInvokeError("something went wrong");
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).toBe("something went wrong");
    expect(result.retryable).toBe(false);
  });

  it("wraps an Error instance", () => {
    const result = parseInvokeError(new Error("boom"));
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).toBe("boom");
  });

  it("handles non-string non-Error values", () => {
    const result = parseInvokeError(42);
    expect(result.message).toBe("42");
  });
});

describe("getErrorMessage", () => {
  it("extracts message from ADPError", () => {
    expect(
      getErrorMessage({ code: "PARSE_ERROR", message: "bad json", retryable: false }),
    ).toBe("bad json");
  });

  it("returns string errors directly", () => {
    expect(getErrorMessage("plain error")).toBe("plain error");
  });

  it("extracts message from native Error", () => {
    expect(getErrorMessage(new Error("native error"))).toBe("native error");
  });
});

describe("isRetryable", () => {
  it("returns true for errors with retryable flag", () => {
    const err: ADPError = {
      code: "INTERNAL_ERROR",
      message: "transient",
      retryable: true,
    };
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for known retryable codes even without flag", () => {
    const err: ADPError = {
      code: "SERVICE_RATE_LIMITED",
      message: "rate limited",
      retryable: false,
    };
    expect(isRetryable(err)).toBe(true);
  });

  it("returns false for non-retryable errors", () => {
    const err: ADPError = {
      code: "SCHEMA_VALIDATION_FAILED",
      message: "bad input",
      retryable: false,
    };
    expect(isRetryable(err)).toBe(false);
  });

  it("returns false for string errors", () => {
    expect(isRetryable("some error")).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error", async () => {
    const retryableErr: ADPError = {
      code: "SERVICE_RATE_LIMITED",
      message: "slow",
      retryable: true,
      retryAfterMs: 10,
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(retryableErr)
      .mockResolvedValue("ok");

    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable error", async () => {
    const err: ADPError = {
      code: "SCHEMA_VALIDATION_FAILED",
      message: "bad",
      retryable: false,
    };
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 3, 10)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries", async () => {
    const err: ADPError = {
      code: "SERVICE_TIMEOUT",
      message: "timeout",
      retryable: true,
    };
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, 2, 10)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
