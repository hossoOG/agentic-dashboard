import { invoke } from "@tauri-apps/api/core";
import type { StateStorage } from "zustand/middleware";

/**
 * Custom Zustand storage adapter that persists to Documents/AgenticExplorer/settings.json
 * via Tauri commands, so data survives app reinstalls.
 *
 * Falls back to localStorage when running outside Tauri (e.g. dev in browser).
 */

const isTauri = "__TAURI_INTERNALS__" in window;

// In-memory cache for synchronous getItem calls (Zustand requires sync API)
const cache = new Map<string, string>();

// Eagerly load settings from Tauri on startup
let initPromise: Promise<void> | null = null;

export function initTauriStorage(): Promise<void> {
  if (!isTauri) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = invoke<string>("load_user_settings")
    .then((data) => {
      if (data) {
        cache.set("agentic-dashboard-settings", data);
      }
    })
    .catch((err) => {
      console.warn("[tauriStorage] Failed to load settings from disk:", err);
    });

  return initPromise;
}

export const tauriStorage: StateStorage = {
  getItem(name: string): string | null {
    if (!isTauri) {
      return localStorage.getItem(name);
    }
    return cache.get(name) ?? null;
  },

  setItem(name: string, value: string): void {
    if (!isTauri) {
      localStorage.setItem(name, value);
      return;
    }
    cache.set(name, value);
    // Fire-and-forget save to disk
    invoke("save_user_settings", { data: value }).catch((err) => {
      console.error("[tauriStorage] Failed to save settings:", err);
    });
  },

  removeItem(name: string): void {
    if (!isTauri) {
      localStorage.removeItem(name);
      return;
    }
    cache.delete(name);
    invoke("save_user_settings", { data: "{}" }).catch((err) => {
      console.error("[tauriStorage] Failed to clear settings:", err);
    });
  },
};
