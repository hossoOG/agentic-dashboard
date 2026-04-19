/**
 * Canonical number-formatters for UI rendering.
 *
 * Rules (from CLAUDE.md design-system → "Number-Formatting"):
 *  - Durations   → `ms`   format, with space, lowercase unit (e.g. `312 ms`)
 *  - Elapsed     → `mm:ss`                                   (e.g. `2:14`)
 *  - Exit codes  → verbatim                                  (e.g. `Exit 0`, `Exit 1`)
 *
 * Use these helpers at every rendering site — do NOT build ad-hoc inline
 * formatters. Verbatim durations coming from Claude-CLI output (like
 * `"2m 38s"` parsed from a tool-line) are out of scope and stay as-is.
 */

/** Format a millisecond duration for UI. Example: `formatMs(312) → "312 ms"`. */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "– ms";
  const rounded = Math.max(0, Math.round(ms));
  return `${rounded} ms`;
}

/**
 * Format an elapsed duration as `mm:ss`.
 *
 * Accepts milliseconds (not seconds) for symmetry with `Date.now()` deltas
 * and our Tauri payloads. Examples:
 *   formatElapsed(0)       → "0:00"
 *   formatElapsed(134_000) → "2:14"
 *   formatElapsed(65_000)  → "1:05"
 *
 * For durations ≥ 1h the minute-field simply grows (`73:05`) — we do not
 * switch to `h:mm:ss`, since all current call-sites cap out well below 1h
 * and switching formats mid-flight would break alignment in status bars.
 */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Format a process exit-code. Example: `formatExit(0) → "Exit 0"`.
 * Returns an empty string for null/undefined so callers can render
 * conditionally without extra checks.
 */
export function formatExit(code: number | null | undefined): string {
  if (code === null || code === undefined) return "";
  return `Exit ${code}`;
}
