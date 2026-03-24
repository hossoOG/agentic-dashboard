export const ACTIVE_THRESHOLD_MS = 8_000;
export const IDLE_THRESHOLD_MS = 60_000;

export type ActivityLevel = "active" | "thinking" | "idle";

export function getActivityLevel(
  lastOutputAt: number,
  now: number,
): ActivityLevel {
  const elapsed = now - lastOutputAt;
  if (elapsed < ACTIVE_THRESHOLD_MS) return "active";
  if (elapsed < IDLE_THRESHOLD_MS) return "thinking";
  return "idle";
}
