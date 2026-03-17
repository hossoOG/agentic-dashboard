import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  mode: "dark";
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

  // Actions
  setTheme: (partial: Partial<ThemeSettings>) => void;
  setNotifications: (partial: Partial<NotificationSettings>) => void;
  setSound: (partial: Partial<SoundSettings>) => void;
  setPipeline: (partial: Partial<PipelineSettings>) => void;
  setLocale: (locale: "de" | "en") => void;
  setDefaultShell: (shell: SettingsState["defaultShell"]) => void;
  setDefaultProjectPath: (path: string) => void;
  setGlobalNotes: (notes: string) => void;

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

      setGlobalNotes: (notes) => set({ globalNotes: notes }),

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
          return { favorites: [...state.favorites, favorite] };
        }),

      removeFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((f) => f.id !== id),
        })),

      updateFavoriteLastUsed: (id) =>
        set((state) => ({
          favorites: state.favorites.map((f) =>
            f.id === id ? { ...f, lastUsedAt: Date.now() } : f
          ),
        })),

      reorderFavorites: (ids) =>
        set((state) => {
          const byId = new Map(state.favorites.map((f) => [f.id, f]));
          const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as FavoriteFolder[];
          // Append any favorites not in the ids array (safety net)
          const remaining = state.favorites.filter((f) => !ids.includes(f.id));
          return { favorites: [...reordered, ...remaining] };
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
          // apiKeys, favorites and globalNotes are intentionally NOT reset
          apiKeys: state.apiKeys,
          favorites: state.favorites,
          globalNotes: state.globalNotes,
        })),
    }),
    {
      name: "agentic-dashboard-settings",
    }
  )
);
