/**
 * Zentrale Konstanten fuer das Agentic Dashboard.
 * Ersetzt Magic Numbers im gesamten Codebase.
 */

// --- Limits ---

/** Maximale Log-Eintraege pro Worktree */
export const MAX_WORKTREE_LOGS = 20;

/** Maximale Log-Eintraege fuer den Orchestrator */
export const MAX_ORCHESTRATOR_LOGS = 50;

/** Maximale Anzahl roher Log-Zeilen */
export const MAX_RAW_LOGS = 200;

/** Maximale Zeilen im Terminal-Output-Buffer */
export const MAX_TERMINAL_OUTPUT_LINES = 5000;

/** Maximale gleichzeitige Terminal-Sessions */
export const MAX_TERMINAL_SESSIONS = 8;

/** Maximale gespeicherte Pipeline-Fehler */
export const MAX_PIPELINE_ERRORS = 100;

/** Maximale Eintraege in der Kosten-Historie */
export const MAX_COST_HISTORY_ENTRIES = 1000;

/** Maximale gleichzeitig angezeigte Toasts */
export const MAX_TOASTS = 5;

// --- Timing ---

/** Standard-Anzeigedauer fuer Toast-Benachrichtigungen (ms) */
export const TOAST_DEFAULT_DURATION_MS = 5000;

/** Mindest-Intervall fuer Pipeline-Status-Updates (ms) */
export const PIPELINE_STATUS_UPDATE_THRESHOLD_MS = 500;

// --- Neon-Farben (OKLCH) ---

export const NEON_GREEN = "oklch(72% 0.16 155)";
export const NEON_BLUE = "oklch(72% 0.14 190)";
export const NEON_PURPLE = "oklch(60% 0.20 300)";
export const NEON_ORANGE = "oklch(75% 0.14 70)";

// --- Dark-Theme (OKLCH) ---

export const DARK_BG = "oklch(14% 0.02 260)";
export const DARK_CARD = "oklch(18% 0.02 250)";
export const DARK_BORDER = "oklch(24% 0.02 250)";
