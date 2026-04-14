export const IDLE_THRESHOLD_MS = 30_000;

export type ActivityLevel = "active" | "idle";

export function getActivityLevel(
  lastOutputAt: number,
  now: number,
): ActivityLevel {
  return now - lastOutputAt < IDLE_THRESHOLD_MS ? "active" : "idle";
}
