import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { tauriStorage, getLoadedFavorites, getLoadedNotes, registerNoteFlush } from "./tauriStorage";
import { logError } from "../utils/errorLogger";
import { broadcastPreferencesChange } from "../utils/preferencesBroadcast";

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

/**
 * Logging + UI toggles for daily-use performance.
 * All default to `false` — power-users opt in when actively debugging.
 */
export interface AppPreferencesSettings {
  /** Frontend errorLogger ring-buffer aktiv? Toast-Output bleibt unabhängig. */
  frontendLogging: boolean;
  /** Rust file logging aktiv? Steuert agentic-explorer.log via Tauri-Command. */
  backendFileLogging: boolean;
  /** perfLogger (IPC-Latenz, Render-Zeit) aktiv? Bereits DEV-only, dieses Toggle gated zusätzlich. */
  performanceProfiler: boolean;
  /** Protokolle-Tab in SideNav sichtbar? */
  showProtokolleTab: boolean;
  /**
   * xterm-Scrollback-Limit pro Terminal (Zeilen). Default 25_000 — eine
   * Claude-CLI-Session mit Tool-Calls + TUI-Repaints kann 5-10× mehr
   * Output produzieren als typische Shells, daher höher als der
   * xterm-Default (1000). Empfohlene Werte: 5_000 / 10_000 / 25_000 / 50_000.
   * Memory-Kosten: ~12 Bytes pro Cell × cols × scrollback. 25k @ 200 cols
   * ≈ 63 MB pro Terminal. 50k ≈ 126 MB.
   */
  scrollbackLines: number;
}

/** Allowed presets for the Settings-UI scrollback selector. */
export const SCROLLBACK_PRESETS = [5_000, 10_000, 25_000, 50_000] as const;
export type ScrollbackPreset = (typeof SCROLLBACK_PRESETS)[number];

/** Clamp + sanitize a candidate scrollback value to a known-safe preset. */
export function sanitizeScrollbackLines(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 25_000;
  }
  // Allow any positive integer in a sane band; UI only exposes presets.
  // Hard ceiling 100k to prevent settings-tampering OOM.
  return Math.max(1_000, Math.min(100_000, Math.floor(value)));
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

// Session restore types
import type { SessionShell, LayoutMode } from "./sessionStore";

export interface RestorableSession {
  folder: string;
  title: string;
  shell: SessionShell;
  claudeSessionId?: string;      // Claude CLI Session-UUID fuer Resume
}

export interface SessionRestoreData {
  enabled: boolean;
  sessions: RestorableSession[];
  /** Folder-key of the active session (stable across restore failures). */
  activeFolder: string | null;
  layoutMode: LayoutMode;
  /** Folder-keys of sessions shown in the grid. */
  gridFolders: string[];
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
    return "Nur .md- oder .markdown-Dateien können angepinnt werden";
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
  preferences: AppPreferencesSettings;
  apiKeys: ApiKeyMetadataEntry[];
  favorites: FavoriteFolder[];
  locale: "de" | "en";
  defaultShell: "auto" | "powershell" | "bash" | "cmd" | "zsh";
  defaultProjectPath: string;
  globalNotes: string;
  projectNotes: Record<string, string>;
  /** Pinned docs per project (key: normalized folder path). */
  pinnedDocs: Record<string, PinnedDoc[]>;
  /** Session restore state — persisted to restore sessions on next startup. */
  sessionRestore: SessionRestoreData;
  /** User-defined titles for Claude session IDs (history/resume override). */
  sessionTitleOverrides: Record<string, string>;

  // Actions
  setTheme: (partial: Partial<ThemeSettings>) => void;
  setNotifications: (partial: Partial<NotificationSettings>) => void;
  setSound: (partial: Partial<SoundSettings>) => void;
  setPipeline: (partial: Partial<PipelineSettings>) => void;
  setPreferences: (partial: Partial<AppPreferencesSettings>) => void;
  setLocale: (locale: "de" | "en") => void;
  setDefaultShell: (shell: SettingsState["defaultShell"]) => void;
  setDefaultProjectPath: (path: string) => void;
  setGlobalNotes: (notes: string) => void;
  setProjectNotes: (folder: string, notes: string) => void;

  setSessionRestore: (data: SessionRestoreData) => void;
  setSessionTitleOverride: (sessionId: string, title: string) => void;
  clearSessionTitleOverride: (sessionId: string) => void;

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

const defaultPreferences: AppPreferencesSettings = {
  frontendLogging: false,
  backendFileLogging: false,
  performanceProfiler: false,
  showProtokolleTab: false,
  scrollbackLines: 25_000,
};

const defaultSessionRestore: SessionRestoreData = {
  enabled: true,
  sessions: [],
  activeFolder: null,
  layoutMode: "single",
  gridFolders: [],
};

// UUID-v4 regex (lowercase only — Claude CLI writes lowercase).
// Issue #209: persisted `claudeSessionId` must be format-validated so a
// tampered or stale settings.json cannot inject arbitrary strings into
// the `--resume <UUID>` Tauri command.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Validate the persisted `sessionRestore` payload during hydration.
 *
 * Filters entries with invalid `claudeSessionId` (wrong type, malformed
 * UUID) AND deduplicates by `claudeSessionId` (first-seen wins, mirrors
 * the persist-time dedup in `sessionRestoreSync.ts`). Entries with
 * `claudeSessionId === undefined` are LEGITIMATE pre-discovery state
 * and are preserved unchanged.
 *
 * Called from BOTH `migrate` (schema upgrades) and `onRehydrateStorage`
 * (every hydration) so validation runs even when version matches and
 * migrate is bypassed.
 */
export function validateSessionRestore(raw: unknown): SessionRestoreData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultSessionRestore;
  }
  const r = raw as Record<string, unknown>;
  const sessions = Array.isArray(r.sessions) ? r.sessions : [];
  const seenClaudeIds = new Set<string>();
  const cleanSessions: RestorableSession[] = [];
  for (const s of sessions) {
    if (!s || typeof s !== "object") continue;
    const entry = s as Record<string, unknown>;
    if (
      typeof entry.folder !== "string" ||
      typeof entry.title !== "string" ||
      typeof entry.shell !== "string"
    ) {
      continue;
    }
    let claudeSessionId: string | undefined;
    if (entry.claudeSessionId !== undefined) {
      if (typeof entry.claudeSessionId !== "string") continue;
      if (!UUID_V4_RE.test(entry.claudeSessionId)) continue;
      if (seenClaudeIds.has(entry.claudeSessionId)) continue;
      seenClaudeIds.add(entry.claudeSessionId);
      claudeSessionId = entry.claudeSessionId;
    }
    cleanSessions.push({
      folder: entry.folder,
      title: entry.title,
      shell: entry.shell as RestorableSession["shell"],
      claudeSessionId,
    });
  }
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : defaultSessionRestore.enabled,
    sessions: cleanSessions,
    activeFolder: typeof r.activeFolder === "string" ? r.activeFolder : null,
    layoutMode: r.layoutMode === "grid" ? "grid" : "single",
    gridFolders: Array.isArray(r.gridFolders)
      ? r.gridFolders.filter((f): f is string => typeof f === "string")
      : [],
  };
}

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
      preferences: defaultPreferences,
      apiKeys: [],
      favorites: [],
      locale: "de",
      defaultShell: "auto",
      defaultProjectPath: "",
      globalNotes: "",
      projectNotes: {},
      pinnedDocs: {},
      sessionRestore: defaultSessionRestore,
      sessionTitleOverrides: {},

      setSessionRestore: (data) => set({ sessionRestore: data }),

      setSessionTitleOverride: (sessionId, title) =>
        set((state) => {
          const key = sessionId.trim();
          const value = title.trim();
          if (!key || !value) return state;
          if (state.sessionTitleOverrides[key] === value) return state;
          return {
            sessionTitleOverrides: {
              ...state.sessionTitleOverrides,
              [key]: value,
            },
          };
        }),

      clearSessionTitleOverride: (sessionId) =>
        set((state) => {
          const key = sessionId.trim();
          if (!key || !(key in state.sessionTitleOverrides)) return state;
          const next = { ...state.sessionTitleOverrides };
          delete next[key];
          return { sessionTitleOverrides: next };
        }),

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

      setPreferences: (partial) => {
        let didChange = false;
        set((state) => {
          const next = { ...state.preferences, ...partial };
          // Sync backend logging toggle with Rust side. The store update is
          // the source of truth; on invoke failure we surface a toast so the
          // user knows the Rust side may be out of sync (deliberate choice
          // over silently rolling back the toggle and causing UI flicker).
          if (
            isTauri &&
            partial.backendFileLogging !== undefined &&
            partial.backendFileLogging !== state.preferences.backendFileLogging
          ) {
            const wantedValue = partial.backendFileLogging;
            invoke("set_file_logging_enabled", { enabled: wantedValue }).catch((err) => {
              logError("settingsStore.setBackendFileLogging", err);
              // Lazy import of uiStore to avoid a hard dep at module init.
              import("./uiStore").then(({ useUIStore }) => {
                useUIStore.getState().addToast({
                  type: "error",
                  title: "Backend-Logging-Toggle fehlgeschlagen",
                  message: `Datei-Logging konnte nicht auf ${wantedValue ? "an" : "aus"} gesetzt werden. Bitte App neu starten.`,
                  duration: 10000,
                });
              }).catch(() => { /* uiStore unreachable — already logged */ });
            });
          }
          didChange = Object.keys(partial).some(
            (k) => state.preferences[k as keyof AppPreferencesSettings] !== next[k as keyof AppPreferencesSettings],
          );
          return { preferences: next };
        });
        // Broadcast to other webviews. Receivers filter their own echoes
        // via sourceWindow and apply via raw setState, so no loop.
        if (didChange) {
          void broadcastPreferencesChange(partial);
        }
      },

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
          preferences: defaultPreferences,
          locale: "de",
          defaultShell: "auto",
          defaultProjectPath: "",
          // apiKeys, favorites, globalNotes, projectNotes, sessionRestore and sessionTitleOverrides are intentionally NOT reset
          apiKeys: state.apiKeys,
          favorites: state.favorites,
          globalNotes: state.globalNotes,
          projectNotes: state.projectNotes,
          sessionRestore: state.sessionRestore,
          sessionTitleOverrides: state.sessionTitleOverrides,
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
        preferences: state.preferences,
        apiKeys: state.apiKeys,
        favorites: state.favorites,
        locale: state.locale,
        defaultShell: state.defaultShell,
        defaultProjectPath: state.defaultProjectPath,
        globalNotes: state.globalNotes,
        projectNotes: state.projectNotes,
        pinnedDocs: state.pinnedDocs,
        sessionRestore: state.sessionRestore,
        sessionTitleOverrides: state.sessionTitleOverrides,
      }),
      version: 3,
      migrate: (persisted: unknown, _version: number) => {
        // Deep-merge persisted data with defaults so new fields get defaults
        // while existing values are preserved. This prevents undefined fields
        // when the schema grows between app versions.
        const defaults = {
          theme: defaultTheme,
          notifications: defaultNotifications,
          sound: defaultSound,
          pipeline: defaultPipeline,
          preferences: defaultPreferences,
          apiKeys: [],
          favorites: [],
          locale: "de" as const,
          defaultShell: "auto" as const,
          defaultProjectPath: "",
          globalNotes: "",
          projectNotes: {},
          pinnedDocs: {} as Record<string, PinnedDoc[]>,
          sessionRestore: defaultSessionRestore,
          sessionTitleOverrides: {} as Record<string, string>,
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
          preferences: { ...defaults.preferences, ...(p.preferences && typeof p.preferences === "object" ? p.preferences : {}) },
          apiKeys: Array.isArray(p.apiKeys) ? p.apiKeys : defaults.apiKeys,
          favorites: Array.isArray(p.favorites) ? p.favorites : defaults.favorites,
          locale: p.locale === "de" || p.locale === "en" ? p.locale : defaults.locale,
          defaultShell: ["auto", "powershell", "bash", "cmd", "zsh"].includes(p.defaultShell as string) ? p.defaultShell : defaults.defaultShell,
          defaultProjectPath: typeof p.defaultProjectPath === "string" ? p.defaultProjectPath : defaults.defaultProjectPath,
          globalNotes: typeof p.globalNotes === "string" ? p.globalNotes : defaults.globalNotes,
          projectNotes: p.projectNotes && typeof p.projectNotes === "object" && !Array.isArray(p.projectNotes) ? p.projectNotes : defaults.projectNotes,
          pinnedDocs: validatePinnedDocs(p.pinnedDocs),
          // Validate sessionRestore at migrate-time too (defense in depth —
          // schema upgrades fire here, content upgrades in onRehydrateStorage).
          sessionRestore: validateSessionRestore(p.sessionRestore),
          sessionTitleOverrides: p.sessionTitleOverrides && typeof p.sessionTitleOverrides === "object" && !Array.isArray(p.sessionTitleOverrides)
            ? Object.fromEntries(
              Object.entries(p.sessionTitleOverrides as Record<string, unknown>).filter(
                ([k, v]) => typeof k === "string" && !!k.trim() && typeof v === "string" && !!v.trim(),
              ),
            )
            : defaults.sessionTitleOverrides,
        } as unknown as SettingsState; // Actions are added by Zustand during merge
      },
      onRehydrateStorage: () => (state, error) => {
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

        // ALWAYS validate sessionRestore on hydration (not just on schema
        // bump). The migrate function only fires when the persisted version
        // differs from the current schema version; validation must run
        // regardless to catch tampered or corrupt entries from same-version
        // payloads (Issue #209).
        if (state) {
          const validatedRestore = validateSessionRestore(state.sessionRestore);
          if (JSON.stringify(validatedRestore) !== JSON.stringify(state.sessionRestore)) {
            patches.sessionRestore = validatedRestore;
          }
        }

        if (Object.keys(patches).length > 0) {
          useSettingsStore.setState(patches);
        }
      },
    }
  )
);
