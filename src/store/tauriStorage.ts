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
          logWarn("tauriStorage.init", "Failed to parse favorites.json");
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
          logWarn("tauriStorage.init", "Failed to parse notes");
        }
      }
    })
    .catch((err) => {
      logWarn("tauriStorage.init", `Failed to load settings from disk: ${err}`);
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
    // Fire-and-forget save to disk
    invoke("save_user_settings", { data: value }).catch((err) => {
      logError("tauriStorage.setItem", err);
    });
  },

  removeItem(name: string): void {
    if (!isTauri) {
      localStorage.removeItem(name);
      return;
    }
    cache.delete(name);
    invoke("save_user_settings", { data: "{}" }).catch((err) => {
      logError("tauriStorage.removeItem", err);
    });
  },
};
