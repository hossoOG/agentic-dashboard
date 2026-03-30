import { invoke } from "@tauri-apps/api/core";
import type { StateStorage } from "zustand/middleware";
import { logError, logWarn } from "../utils/errorLogger";

/**
 * Custom Zustand storage adapter that persists to Documents/AgenticExplorer/settings.json
 * via Tauri commands, so data survives app reinstalls.
 *
 * Falls back to localStorage when running outside Tauri (e.g. dev in browser).
 */

const isTauri = "__TAURI_INTERNALS__" in window;

// In-memory cache for synchronous getItem calls (Zustand requires sync API)
const cache = new Map<string, string>();

let initialized = false;

const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();
const SAVE_DEBOUNCE_MS = 300; // coalesce rapid writes

// Loaded favorites and notes from their dedicated files (available after init)
let loadedFavorites: unknown[] | null = null;
let loadedNotes: { global: string; project: Record<string, string> } | null = null;

// Eagerly load settings from Tauri on startup
let initPromise: Promise<void> | null = null;

export function initTauriStorage(): Promise<void> {
  if (!isTauri) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = Promise.all([
    invoke<string>("load_user_settings"),
    invoke<string>("load_favorites_file"),
    invoke<string>("load_notes"),
  ])
    .then(([settingsData, favoritesData, notesData]) => {
      if (settingsData) {
        cache.set("agenticexplorer-settings", settingsData);
      }

      // Parse favorites from dedicated file
      if (favoritesData) {
        try {
          loadedFavorites = JSON.parse(favoritesData);
        } catch {
          logWarn("tauriStorage", "Failed to parse favorites.json");
        }
      }

      // Parse notes from dedicated files
      if (notesData) {
        try {
          const raw = JSON.parse(notesData) as Record<string, string>;
          const globalNotes = raw["global"] ?? "";
          const projectNotes: Record<string, string> = {};
          for (const [key, value] of Object.entries(raw)) {
            if (key !== "global") {
              projectNotes[key] = value;
            }
          }
          loadedNotes = { global: globalNotes, project: projectNotes };
        } catch {
          logWarn("tauriStorage", "Failed to parse notes");
        }
      }
    })
    .then(() => {
      initialized = true;
    })
    .catch((err) => {
      logWarn("tauriStorage", `Failed to load settings from disk: ${err}`);
      initialized = true;
    });

  return initPromise;
}

/** Returns favorites loaded from favorites.json (available after initTauriStorage resolves) */
export function getLoadedFavorites(): unknown[] | null {
  return loadedFavorites;
}

/** Returns notes loaded from notes/ directory (available after initTauriStorage resolves) */
export function getLoadedNotes(): { global: string; project: Record<string, string> } | null {
  return loadedNotes;
}

export const tauriStorage: StateStorage = {
  getItem(name: string): string | null {
    if (!isTauri) {
      const value = localStorage.getItem(name);
      // Migration: fall back to old persist key if new key has no data
      if (value === null && name === "agenticexplorer-settings") {
        return localStorage.getItem("agentic-dashboard-settings");
      }
      return value;
    }
    if (!initialized) {
      logWarn("tauriStorage", `getItem called before init completed for: ${name}`);
    }
    const cached = cache.get(name);
    // Migration: fall back to old persist key if new key has no data
    if (cached === undefined && name === "agenticexplorer-settings") {
      return cache.get("agentic-dashboard-settings") ?? null;
    }
    return cached ?? null;
  },

  setItem(name: string, value: string): void {
    if (!isTauri) {
      localStorage.setItem(name, value);
      return;
    }
    cache.set(name, value);

    // Per-key debounce: coalesce rapid writes, always save latest value
    const existing = pendingSaves.get(name);
    if (existing) clearTimeout(existing);
    pendingSaves.set(name, setTimeout(() => {
      pendingSaves.delete(name);
      const latestValue = cache.get(name) ?? value;
      invoke("save_user_settings", { data: latestValue }).catch((err) => {
        logError("tauriStorage.save", err);
        setTimeout(() => {
          invoke("save_user_settings", { data: cache.get(name) ?? latestValue }).catch((err2) => {
            logError("tauriStorage.saveRetry", err2);
            window.dispatchEvent(new CustomEvent("storage-save-error", {
              detail: { error: String(err2) },
            }));
          });
        }, 1000);
      });
    }, SAVE_DEBOUNCE_MS));
  },

  removeItem(name: string): void {
    if (!isTauri) {
      localStorage.removeItem(name);
      return;
    }
    cache.delete(name);
    // Do NOT write empty object to disk — just clear the cache.
    // The next save will write the correct state.
    logWarn("tauriStorage", `removeItem called for: ${name}`);
  },
};

/** Flush any pending settings saves immediately. Call before app close. */
export function flushPendingSaves(): Promise<void> {
  if (!isTauri) return Promise.resolve();
  // Cancel all pending debounced saves and fire them immediately
  const promises: Promise<void>[] = [];
  for (const [name, timer] of pendingSaves) {
    clearTimeout(timer);
    pendingSaves.delete(name);
    const latestValue = cache.get(name);
    if (latestValue) {
      promises.push(
        invoke("save_user_settings", { data: latestValue })
          .then(() => {})
          .catch((err) => logError("tauriStorage.flush", err))
      );
    }
  }
  // Also flush note timers from settingsStore (injected via registerNoteFlush)
  if (_noteFlushFn) {
    promises.push(_noteFlushFn());
  }
  return Promise.all(promises).then(() => {});
}

// Allow settingsStore to register its note-flush function to avoid circular imports
let _noteFlushFn: (() => Promise<void>) | null = null;
export function registerNoteFlush(fn: () => Promise<void>): void {
  _noteFlushFn = fn;
}
