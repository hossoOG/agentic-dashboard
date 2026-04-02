export const ACTIVE_THRESHOLD_MS = 8_000;
export const IDLE_THRESHOLD_MS = 60_000;

export type ActivityLevel = "active" | "thinking" | "idle";

/** Spinner characters used by Claude CLI during thinking */
const SPINNER_CHARS = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;

/**
 * Returns whether the last output snippet looks like Claude is actively thinking
 * (spinner chars, "Thinking" text). This prevents long thinking pauses (ultrathink)
 * from being misclassified as "idle".
 */
export function looksLikeThinking(lastOutputSnippet: string): boolean {
  return SPINNER_CHARS.test(lastOutputSnippet) || lastOutputSnippet.includes("Thinking");
}

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
  lastOutputSnippet?: string,
): ActivityLevel {
  const elapsed = now - lastOutputAt;
  if (elapsed < ACTIVE_THRESHOLD_MS) return "active";
  if (elapsed < IDLE_THRESHOLD_MS) return "thinking";

  // Beyond IDLE_THRESHOLD: only classify as "idle" if the last output looks
  // like a prompt. If it looks like thinking (spinner, "Thinking" text) or is
  // just normal output, stay in "thinking" — Claude may be in ultrathink mode.
  if (lastOutputSnippet && looksLikePrompt(lastOutputSnippet)) {
    return "idle";
  }
  if (lastOutputSnippet && looksLikeThinking(lastOutputSnippet)) {
    return "thinking";
  }

  return "idle";
}
