export const ACTIVE_THRESHOLD_MS = 8_000;

export type ActivityLevel = "active" | "thinking";

export function getActivityLevel(
  lastOutputAt: number,
  now: number,
): ActivityLevel {
  return now - lastOutputAt < ACTIVE_THRESHOLD_MS ? "active" : "thinking";
}
