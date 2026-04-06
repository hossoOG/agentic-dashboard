/**
 * Centralized status configuration — single source of truth.
 *
 * All status-to-color/icon mappings live here.
 * Components import from this file instead of defining their own maps.
 */

/* ── Color tokens (Tailwind classes) ── */
export const STATUS_STYLES = {
  idle:     { text: "text-neutral-500",  border: "border-neutral-700", bg: "bg-neutral-500",   dot: "bg-neutral-500" },
  active:   { text: "text-accent",       border: "border-accent",      bg: "bg-accent",        dot: "bg-accent" },
  running:  { text: "text-accent",       border: "border-accent",      bg: "bg-accent",        dot: "bg-accent" },
  done:     { text: "text-success",      border: "border-success",     bg: "bg-success",       dot: "bg-success" },
  pass:     { text: "text-success",      border: "border-success",     bg: "bg-success",       dot: "bg-success" },
  error:    { text: "text-error",        border: "border-error",       bg: "bg-error",         dot: "bg-error" },
  fail:     { text: "text-error",        border: "border-error",       bg: "bg-error",         dot: "bg-error" },
  blocked:  { text: "text-warning",      border: "border-warning",     bg: "bg-warning",       dot: "bg-warning" },
  waiting:  { text: "text-warning",      border: "border-warning",     bg: "bg-warning",       dot: "bg-warning" },
  pending:  { text: "text-neutral-500",  border: "border-neutral-700", bg: "bg-neutral-500",   dot: "bg-neutral-500" },
  skipped:  { text: "text-neutral-400",  border: "border-neutral-600", bg: "bg-neutral-400",   dot: "bg-neutral-400" },
  planning: { text: "text-accent",       border: "border-accent",      bg: "bg-accent",        dot: "bg-accent" },
  generated_manifest: { text: "text-success", border: "border-success", bg: "bg-success",      dot: "bg-success" },
  waiting_for_input:  { text: "text-warning", border: "border-warning", bg: "bg-warning",      dot: "bg-warning" },
} as const;

export type StatusKey = keyof typeof STATUS_STYLES;

/** Get styles for any status string, with fallback to idle */
export function getStatusStyle(status: string) {
  return STATUS_STYLES[status as StatusKey] ?? STATUS_STYLES.idle;
}

/** Statuses that should pulse their indicator dot */
export const PULSE_STATUSES = new Set<string>(["active", "running", "planning"]);
