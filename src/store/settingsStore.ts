import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tauriStorage, getLoadedFavorites, getLoadedNotes } from "./tauriStorage";

// ============================================================================
// Types
// ============================================================================

export interface FavoriteFolder {
  id: string;
  path: string;
  label: string;
  shell: "powershell" | "cmd" | "gitbash";
  addedAt: number;
  lastUsedAt: number;
}

export interface ThemeSettings {
  mode: "dark" | "light";
  accentColor: string;
  reducedMotion: boolean;
  animationSpeed: number;
}

export interface NotificationSettings {
  enabled: boolean;
  pipelineComplete: boolean;
  pipelineError: boolean;
  qaGateResult: boolean;
  costAlert: boolean;
}

export interface SoundSettings {
  enabled: boolean;
  volume: number;
}

export interface PipelineSettings {
  defaultMode: "mock" | "real";
  maxConcurrentWorktrees: number;
  autoRetryOnError: boolean;
  logBufferSize: number;
}

export interface ApiKeyMetadataEntry {
  id: string;
  provider: string;
  label: string;
  redactedKey: string;
  addedAt: number;
  lastUsedAt?: number;
  isValid: boolean;
}

// ============================================================================
// State Interface
// ============================================================================

export interface SettingsState {
  theme: ThemeSettings;
  notifications: NotificationSettings;
  sound: SoundSettings;
  pipeline: PipelineSettings;
  apiKeys: ApiKeyMetadataEntry[];
  favorites: FavoriteFolder[];
  locale: "de" | "en";
  defaultShell: "auto" | "powershell" | "bash" | "cmd" | "zsh";
  defaultProjectPath: string;
  globalNotes: string;
  projectNotes: Record<string, string>;

  // Actions
  setTheme: (partial: Partial<ThemeSettings>) => void;
  setNotifications: (partial: Partial<NotificationSettings>) => void;
  setSound: (partial: Partial<SoundSettings>) => void;
  setPipeline: (partial: Partial<PipelineSettings>) => void;
  setLocale: (locale: "de" | "en") => void;
  setDefaultShell: (shell: SettingsState["defaultShell"]) => void;
  setDefaultProjectPath: (path: string) => void;
  setGlobalNotes: (notes: string) => void;
  setProjectNotes: (folder: string, notes: string) => void;

  addApiKeyMetadata: (entry: ApiKeyMetadataEntry) => void;
  removeApiKeyMetadata: (id: string) => void;
  updateApiKeyMetadata: (id: string, partial: Partial<Omit<ApiKeyMetadataEntry, "id">>) => void;

  addFavorite: (path: string, label?: string) => void;
  removeFavorite: (id: string) => void;
  updateFavoriteLastUsed: (id: string) => void;
  reorderFavorites: (ids: string[]) => void;

  resetToDefaults: () => void;
}

// ============================================================================
// Defaults
// ============================================================================

const defaultTheme: ThemeSettings = {
  mode: "dark",
  accentColor: "oklch(72% 0.14 190)", // accent teal
  reducedMotion: false,
  animationSpeed: 1.0,
};

const defaultNotifications: NotificationSettings = {
  enabled: true,
  pipelineComplete: true,
  pipelineError: true,
  qaGateResult: true,
  costAlert: true,
};

const defaultSound: SoundSettings = {
  enabled: false,
  volume: 0.5,
};

const defaultPipeline: PipelineSettings = {
  defaultMode: "mock",
  maxConcurrentWorktrees: 5,
  autoRetryOnError: false,
  logBufferSize: 200,
};

// ============================================================================
// File persistence (Documents/AgenticExplorer/)
// ============================================================================

const isTauri = "__TAURI_INTERNALS__" in window;

function saveNoteFile(noteKey: string, content: string): void {
  if (!isTauri) return;
  invoke("save_note_file", { noteKey, content }).catch((err) => {
    console.error("[settingsStore] Failed to save note file:", err);
  });
}

function saveFavoritesFile(favorites: FavoriteFolder[]): void {
  if (!isTauri) return;
  invoke("save_favorites_file", { data: JSON.stringify(favorites, null, 2) }).catch((err) => {
    console.error("[settingsStore] Failed to save favorites file:", err);
  });
}

// ============================================================================
// Store (with persist middleware)
// ============================================================================

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: defaultTheme,
      notifications: defaultNotifications,
      sound: defaultSound,
      pipeline: defaultPipeline,
      apiKeys: [],
      favorites: [],
      locale: "de",
      defaultShell: "auto",
      defaultProjectPath: "",
      globalNotes: "",
      projectNotes: {},

      setTheme: (partial) =>
        set((state) => ({
          theme: { ...state.theme, ...partial },
        })),

      setNotifications: (partial) =>
        set((state) => ({
          notifications: { ...state.notifications, ...partial },
        })),

      setSound: (partial) =>
        set((state) => ({
          sound: { ...state.sound, ...partial },
        })),

      setPipeline: (partial) =>
        set((state) => ({
          pipeline: { ...state.pipeline, ...partial },
        })),

      setLocale: (locale) => set({ locale }),

      setDefaultShell: (shell) => set({ defaultShell: shell }),

      setDefaultProjectPath: (path) => set({ defaultProjectPath: path }),

      setGlobalNotes: (notes) => {
        set({ globalNotes: notes });
        saveNoteFile("global", notes);
      },

      setProjectNotes: (folder, notes) =>
        set((state) => {
          const key = folder.replace(/\\/g, "/").toLowerCase();
          saveNoteFile(key, notes);
          return {
            projectNotes: { ...state.projectNotes, [key]: notes },
          };
        }),

      addApiKeyMetadata: (entry) =>
        set((state) => ({
          apiKeys: [...state.apiKeys, entry],
        })),

      removeApiKeyMetadata: (id) =>
        set((state) => ({
          apiKeys: state.apiKeys.filter((k) => k.id !== id),
        })),

      updateApiKeyMetadata: (id, partial) =>
        set((state) => ({
          apiKeys: state.apiKeys.map((k) =>
            k.id === id ? { ...k, ...partial } : k
          ),
        })),

      addFavorite: (path, label) =>
        set((state) => {
          if (state.favorites.some((f) => f.path === path)) return state;
          const folderName = path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "folder";
          const favorite: FavoriteFolder = {
            id: `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            path,
            label: label ?? folderName,
            shell: "powershell",
            addedAt: Date.now(),
            lastUsedAt: Date.now(),
          };
          const updated = [...state.favorites, favorite];
          saveFavoritesFile(updated);
          return { favorites: updated };
        }),

      removeFavorite: (id) =>
        set((state) => {
          const updated = state.favorites.filter((f) => f.id !== id);
          saveFavoritesFile(updated);
          return { favorites: updated };
        }),

      updateFavoriteLastUsed: (id) =>
        set((state) => {
          const updated = state.favorites.map((f) =>
            f.id === id ? { ...f, lastUsedAt: Date.now() } : f
          );
          saveFavoritesFile(updated);
          return { favorites: updated };
        }),

      reorderFavorites: (ids) =>
        set((state) => {
          const byId = new Map(state.favorites.map((f) => [f.id, f]));
          const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as FavoriteFolder[];
          // Append any favorites not in the ids array (safety net)
          const remaining = state.favorites.filter((f) => !ids.includes(f.id));
          const updated = [...reordered, ...remaining];
          saveFavoritesFile(updated);
          return { favorites: updated };
        }),

      resetToDefaults: () =>
        set((state) => ({
          theme: defaultTheme,
          notifications: defaultNotifications,
          sound: defaultSound,
          pipeline: defaultPipeline,
          locale: "de",
          defaultShell: "auto",
          defaultProjectPath: "",
          // apiKeys, favorites, globalNotes and projectNotes are intentionally NOT reset
          apiKeys: state.apiKeys,
          favorites: state.favorites,
          globalNotes: state.globalNotes,
          projectNotes: state.projectNotes,
        })),
    }),
    {
      name: "agenticexplorer-settings",
      storage: createJSONStorage(() => tauriStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error("[settingsStore] Hydration error:", error);
          return;
        }
        // Merge favorites and notes from their dedicated files.
        // These are the source of truth — settings.json may be stale.
        const fileFavorites = getLoadedFavorites();
        const fileNotes = getLoadedNotes();
        const patches: Partial<SettingsState> = {};

        if (Array.isArray(fileFavorites) && fileFavorites.length > 0) {
          patches.favorites = fileFavorites as FavoriteFolder[];
        }
        if (fileNotes) {
          if (fileNotes.global) {
            patches.globalNotes = fileNotes.global;
          }
          if (Object.keys(fileNotes.project).length > 0) {
            patches.projectNotes = fileNotes.project;
          }
        }

        if (Object.keys(patches).length > 0) {
          useSettingsStore.setState(patches);
        }
      },
    }
  )
);
