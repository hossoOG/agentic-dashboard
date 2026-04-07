export const IDLE_THRESHOLD_MS = 30_000;

export type ActivityLevel = "active" | "idle";

/**
 * Returns whether the last output snippet looks like an interactive prompt
 * (ends with "> ", "? ", "❯ ", or contains yes/no patterns).
 */
export function looksLikePrompt(lastOutputSnippet: string): boolean {
  const trimmed = lastOutputSnippet.trimEnd();
  return (
    trimmed.endsWith("> ") ||
    trimmed.endsWith("? ") ||
    trimmed.endsWith("❯ ") ||
    trimmed.endsWith("(y/n)") ||
    trimmed.endsWith("[Y/n]") ||
    trimmed.endsWith("[y/N]")
  );
}

export function getActivityLevel(
  lastOutputAt: number,
  now: number,
): ActivityLevel {
  return now - lastOutputAt < IDLE_THRESHOLD_MS ? "active" : "idle";
}
