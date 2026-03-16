/**
 * Log Redactor — maskiert Secrets in Log-Ausgaben.
 * Reine Funktionen, keine Dependencies.
 */

/** Patterns fuer bekannte Secret-Formate */
const SECRET_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Anthropic API Keys: sk-ant-api03-...
  { pattern: /\bsk-ant-[A-Za-z0-9_-]+/g, replacement: "sk-***" },
  // OpenAI project keys: sk-proj-...
  { pattern: /\bsk-proj-[A-Za-z0-9_-]+/g, replacement: "sk-***" },
  // Generic OpenAI keys: sk-... (at least 20 chars after prefix)
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/g, replacement: "sk-***" },
  // GitHub PATs: ghp_...
  { pattern: /\bghp_[A-Za-z0-9_-]+/g, replacement: "ghp_***" },
  // GitHub fine-grained PATs: github_pat_...
  { pattern: /\bgithub_pat_[A-Za-z0-9_-]+/g, replacement: "ghp_***" },
  // Bearer tokens
  { pattern: /\bBearer\s+[A-Za-z0-9_.\-/+=]+/gi, replacement: "Bearer ***" },
  // Generic long hex strings (>30 chars)
  { pattern: /\b[0-9a-fA-F]{31,}\b/g, replacement: "[REDACTED]" },
  // Generic long base64 strings (>30 chars, no spaces)
  { pattern: /\b[A-Za-z0-9+/=]{31,}\b/g, replacement: "[REDACTED]" },
];

/**
 * Maskiert bekannte Secret-Patterns in einem Text.
 * Gibt den bereinigten Text zurueck.
 */
export function redactSecrets(text: string): string {
  let result = text;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    // Reset lastIndex fuer globale Regex
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Prueft ob ein Text potenziell Secrets enthaelt.
 * Schneller Check ohne Ersetzung.
 */
export function containsSecret(text: string): boolean {
  for (const { pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}
