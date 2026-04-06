/**
 * ADPError utilities for structured error handling from Tauri commands.
 *
 * After migrating Tauri commands from `Result<T, String>` to `Result<T, ADPError>`,
 * the `.catch` handler receives a JSON object instead of a plain string.
 * These utilities provide type-safe parsing and backward-compatible handling.
 */

import type { ADPError, ADPErrorCode } from "../protocols/schema";

/**
 * Type guard: checks if an unknown error value is a structured ADPError.
 * Works for both the new ADPError objects and any object with matching shape.
 */
export function isADPError(err: unknown): err is ADPError {
  if (err == null || typeof err !== "object") return false;
  const obj = err as Record<string, unknown>;
  return (
    typeof obj.code === "string" &&
    typeof obj.message === "string" &&
    typeof obj.retryable === "boolean"
  );
}

/**
 * Parse an invoke error into a normalized ADPError.
 * Handles both old-style string errors and new structured ADPError objects.
 */
export function parseInvokeError(err: unknown): ADPError {
  // Already a structured error from the new Rust commands
  if (isADPError(err)) return err;

  // Old-style string error (backward compat during migration)
  const message =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : String(err);

  return {
    code: "INTERNAL_ERROR" as ADPErrorCode,
    message,
    retryable: false,
  };
}

/**
 * Extract a user-friendly message from an invoke error.
 * Prefers the structured message, falls back to string representation.
 */
export function getErrorMessage(err: unknown): string {
  const parsed = parseInvokeError(err);
  return parsed.message;
}

/** Error codes that indicate the operation can be retried. */
const RETRYABLE_CODES: ReadonlySet<ADPErrorCode> = new Set([
  "SERVICE_RATE_LIMITED",
  "SERVICE_TIMEOUT",
  "FILE_IO_ERROR",
]);

/**
 * Check if an error is retryable (either via the `retryable` flag
 * or by matching known retryable error codes).
 */
export function isRetryable(err: unknown): boolean {
  if (!isADPError(err)) return false;
  return err.retryable || RETRYABLE_CODES.has(err.code);
}

/**
 * Retry an async operation with exponential backoff.
 * Respects `retryAfterMs` from structured errors when available.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries || !isRetryable(err)) {
        throw err;
      }
      const parsed = parseInvokeError(err);
      const delay = parsed.retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
