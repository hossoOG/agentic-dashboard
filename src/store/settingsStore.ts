import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tauriStorage, getLoadedFavorites, getLoadedNotes, registerNoteFlush } from "./tauriStorage";
import { logError } from "../utils/errorLogger";

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

/** User-pinned Markdown document inside a project folder. */
export interface PinnedDoc {
  id: string;
  /** Path relative to the project folder, forward-slashes, no `..`. */
  relativePath: string;
  /** Display label — defaults to the filename, user-editable. */
  label: string;
  addedAt: number;
}

/** Normalize a project folder path for use as a Record key. */
export function normalizeProjectKey(folder: string): string {
  return folder.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
}

/** Validate a relative path for a pinned document. Returns null if valid, else an error message. */
export function validatePinnedPath(relativePath: string): string | null {
  if (!relativePath || typeof relativePath !== "string") return "Pfad darf nicht leer sein";
  const trimmed = relativePath.trim();
  if (!trimmed) return "Pfad darf nicht leer sein";
  // Reject absolute paths (Windows: C:\, /foo, \\share)
  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    return "Pfad muss relativ zum Projektordner sein";
  }
  // Reject traversal
  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.split("/").some((seg) => seg === "..")) {
    return "Path-Traversal nicht erlaubt ('..' im Pfad)";
  }
  // Only markdown extensions
  if (!/\.(md|markdown)$/i.test(normalized)) {
    return "Nur .md- oder .markdown-Dateien koennen angepinnt werden";
  }
  return null;
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
  /** Pinned docs per project (key: normalized folder path). */
  pinnedDocs: Record<string, PinnedDoc[]>;

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

  /** Pin a markdown file from a project folder. Returns error message or null on success. */
  addPinnedDoc: (folder: string, relativePath: string, label?: string) => string | null;
  removePinnedDoc: (folder: string, pinId: string) => void;
  renamePinnedDoc: (folder: string, pinId: string, label: string) => void;

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

// Debounce note saves to prevent excessive file I/O on every keystroke
const noteTimers = new Map<string, ReturnType<typeof setTimeout>>();
const NOTE_SAVE_DEBOUNCE_MS = 800;

function debouncedSaveNoteFile(noteKey: string, content: string): void {
  if (!isTauri) return;
  const existing = noteTimers.get(noteKey);
  if (existing) clearTimeout(existing);
  noteTimers.set(noteKey, setTimeout(() => {
    noteTimers.delete(noteKey);
    invoke("save_note_file", { noteKey, content }).catch((err) => {
      logError("settingsStore.saveNoteFile", err);
      window.dispatchEvent(new CustomEvent("storage-save-error", {
        detail: { error: `Note save failed: ${err}` },
      }));
    });
  }, NOTE_SAVE_DEBOUNCE_MS));
}

/** Flush all pending note saves immediately. */
function flushPendingNoteSaves(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const [noteKey, timer] of noteTimers) {
    clearTimeout(timer);
    noteTimers.delete(noteKey);
    // We don't have the content in the timer, so read from store state
    const state = useSettingsStore.getState();
    const content = noteKey === "global"
      ? state.globalNotes
      : state.projectNotes[noteKey] ?? "";
    if (content) {
      promises.push(
        invoke("save_note_file", { noteKey, content })
          .then(() => {})
          .catch((err) => logError("settingsStore.noteFlush", err))
      );
    }
  }
  return Promise.all(promises).then(() => {});
}

// Register note flush so tauriStorage.flushPendingSaves() can call it
registerNoteFlush(flushPendingNoteSaves);

function saveFavoritesFile(favorites: FavoriteFolder[]): void {
  if (!isTauri) return;
  invoke("save_favorites_file", { data: JSON.stringify(favorites, null, 2) }).catch((err) => {
    logError("settingsStore.saveFavoritesFile", err);
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
      pinnedDocs: {},

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
        debouncedSaveNoteFile("global", notes);
      },

      setProjectNotes: (folder, notes) =>
        set((state) => {
          const key = folder.replace(/\\/g, "/").toLowerCase();
          debouncedSaveNoteFile(key, notes);
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

      addPinnedDoc: (folder, relativePath, label) => {
        const validationError = validatePinnedPath(relativePath);
        if (validationError) return validationError;

        const normalized = relativePath.replace(/\\/g, "/").trim();
        const key = normalizeProjectKey(folder);
        const state = useSettingsStore.getState();
        const existing = state.pinnedDocs[key] ?? [];

        // Deduplicate by relativePath
        if (existing.some((p) => p.relativePath === normalized)) {
          return "Diese Datei ist bereits angepinnt";
        }

        const filename = normalized.split("/").pop() ?? normalized;
        const pin: PinnedDoc = {
          id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          relativePath: normalized,
          label: label?.trim() || filename,
          addedAt: Date.now(),
        };

        set((s) => ({
          pinnedDocs: {
            ...s.pinnedDocs,
            [key]: [...existing, pin],
          },
        }));
        return null;
      },

      removePinnedDoc: (folder, pinId) =>
        set((state) => {
          const key = normalizeProjectKey(folder);
          const existing = state.pinnedDocs[key] ?? [];
          const filtered = existing.filter((p) => p.id !== pinId);
          if (filtered.length === existing.length) return state;
          const next = { ...state.pinnedDocs };
          if (filtered.length === 0) {
            delete next[key];
          } else {
            next[key] = filtered;
          }
          return { pinnedDocs: next };
        }),

      renamePinnedDoc: (folder, pinId, label) =>
        set((state) => {
          const key = normalizeProjectKey(folder);
          const existing = state.pinnedDocs[key] ?? [];
          const trimmed = label.trim();
          if (!trimmed) return state;
          const updated = existing.map((p) => (p.id === pinId ? { ...p, label: trimmed } : p));
          return {
            pinnedDocs: { ...state.pinnedDocs, [key]: updated },
          };
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
      partialize: (state) => ({
        theme: state.theme,
        notifications: state.notifications,
        sound: state.sound,
        pipeline: state.pipeline,
        apiKeys: state.apiKeys,
        favorites: state.favorites,
        locale: state.locale,
        defaultShell: state.defaultShell,
        defaultProjectPath: state.defaultProjectPath,
        globalNotes: state.globalNotes,
        projectNotes: state.projectNotes,
        pinnedDocs: state.pinnedDocs,
      }),
      version: 2,
      migrate: (persisted: unknown, _version: number) => {
        // Deep-merge persisted data with defaults so new fields get defaults
        // while existing values are preserved. This prevents undefined fields
        // when the schema grows between app versions.
        const defaults = {
          theme: defaultTheme,
          notifications: defaultNotifications,
          sound: defaultSound,
          pipeline: defaultPipeline,
          apiKeys: [],
          favorites: [],
          locale: "de" as const,
          defaultShell: "auto" as const,
          defaultProjectPath: "",
          globalNotes: "",
          projectNotes: {},
          pinnedDocs: {} as Record<string, PinnedDoc[]>,
        };
        if (!persisted || typeof persisted !== "object") return defaults as unknown as SettingsState;
        const p = persisted as Record<string, unknown>;
        // Validate pinnedDocs structure: Record<string, PinnedDoc[]>
        const validatePinnedDocs = (raw: unknown): Record<string, PinnedDoc[]> => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
          const result: Record<string, PinnedDoc[]> = {};
          for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
            if (!Array.isArray(val)) continue;
            const pins = val.filter((p): p is PinnedDoc =>
              p != null &&
              typeof p === "object" &&
              typeof (p as PinnedDoc).id === "string" &&
              typeof (p as PinnedDoc).relativePath === "string" &&
              typeof (p as PinnedDoc).label === "string" &&
              typeof (p as PinnedDoc).addedAt === "number" &&
              // Re-validate path at load time (defense in depth)
              validatePinnedPath((p as PinnedDoc).relativePath) === null
            );
            if (pins.length > 0) result[key] = pins;
          }
          return result;
        };
        return {
          theme: { ...defaults.theme, ...(p.theme && typeof p.theme === "object" ? p.theme : {}) },
          notifications: { ...defaults.notifications, ...(p.notifications && typeof p.notifications === "object" ? p.notifications : {}) },
          sound: { ...defaults.sound, ...(p.sound && typeof p.sound === "object" ? p.sound : {}) },
          pipeline: { ...defaults.pipeline, ...(p.pipeline && typeof p.pipeline === "object" ? p.pipeline : {}) },
          apiKeys: Array.isArray(p.apiKeys) ? p.apiKeys : defaults.apiKeys,
          favorites: Array.isArray(p.favorites) ? p.favorites : defaults.favorites,
          locale: p.locale === "de" || p.locale === "en" ? p.locale : defaults.locale,
          defaultShell: ["auto", "powershell", "bash", "cmd", "zsh"].includes(p.defaultShell as string) ? p.defaultShell : defaults.defaultShell,
          defaultProjectPath: typeof p.defaultProjectPath === "string" ? p.defaultProjectPath : defaults.defaultProjectPath,
          globalNotes: typeof p.globalNotes === "string" ? p.globalNotes : defaults.globalNotes,
          projectNotes: p.projectNotes && typeof p.projectNotes === "object" && !Array.isArray(p.projectNotes) ? p.projectNotes : defaults.projectNotes,
          pinnedDocs: validatePinnedDocs(p.pinnedDocs),
        } as unknown as SettingsState; // Actions are added by Zustand during merge
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          logError("settingsStore.hydration", error);
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
