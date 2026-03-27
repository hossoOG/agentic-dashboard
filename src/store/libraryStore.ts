import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────

export type LibraryItemType =
  | "skill"
  | "agent-profile"
  | "hook"
  | "template"
  | "prompt"
  | "other";

export interface LibraryItemMeta {
  id: string;
  name: string;
  item_type: LibraryItemType;
  tags: string[];
  description: string;
  created: string;
  file_name: string;
}

export interface LibraryItemFull {
  meta: LibraryItemMeta;
  content: string;
  body: string;
}

interface LibraryIndex {
  items: LibraryItemMeta[];
  usage: Record<string, string[]>;
  built_at: number;
}

// ── Store ──────────────────────────────────────────────────────────────

interface LibraryState {
  items: LibraryItemMeta[];
  selectedItemId: string | null;
  loadedContent: Record<string, LibraryItemFull>;
  usage: Record<string, string[]>;
  loading: boolean;
  lastFetched: number | null;

  fetchItems: (force?: boolean) => Promise<void>;
  selectItem: (id: string | null) => void;
  loadItemContent: (id: string) => Promise<LibraryItemFull | null>;
  saveItem: (id: string, content: string) => Promise<LibraryItemMeta | null>;
  deleteItem: (id: string) => Promise<void>;
  rebuildIndex: () => Promise<void>;
  attachToProject: (itemId: string, projectPath: string) => Promise<void>;
  detachFromProject: (itemId: string, projectPath: string) => Promise<void>;
}

const CACHE_TTL = 30_000; // 30 seconds

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  items: [],
  selectedItemId: null,
  loadedContent: {},
  usage: {},
  loading: false,
  lastFetched: null,

  fetchItems: async (force = false) => {
    const { lastFetched, loading } = get();
    if (loading) return;
    if (!force && lastFetched && Date.now() - lastFetched < CACHE_TTL) return;

    set({ loading: true });
    try {
      const items = await invoke<LibraryItemMeta[]>("list_library_items");
      // Also rebuild usage from index
      const index = await invoke<LibraryIndex>("rebuild_library_index");
      set({
        items,
        usage: index.usage,
        lastFetched: Date.now(),
      });
    } catch (err) {
      console.error("[libraryStore] fetchItems failed:", err);
    } finally {
      set({ loading: false });
    }
  },

  selectItem: (id) => set({ selectedItemId: id }),

  loadItemContent: async (id) => {
    const cached = get().loadedContent[id];
    if (cached) return cached;

    try {
      const item = await invoke<LibraryItemFull>("read_library_item", { id });
      set((state) => ({
        loadedContent: { ...state.loadedContent, [id]: item },
      }));
      return item;
    } catch (err) {
      console.error("[libraryStore] loadItemContent failed:", err);
      return null;
    }
  },

  saveItem: async (id, content) => {
    try {
      const meta = await invoke<LibraryItemMeta>("save_library_item", {
        id,
        content,
      });
      set((state) => {
        const items = state.items.some((i) => i.id === id)
          ? state.items.map((i) => (i.id === id ? meta : i))
          : [...state.items, meta].sort((a, b) =>
              a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            );
        // Invalidate content cache
        const { [id]: _, ...rest } = state.loadedContent;
        return { items, loadedContent: rest };
      });
      return meta;
    } catch (err) {
      console.error("[libraryStore] saveItem failed:", err);
      return null;
    }
  },

  deleteItem: async (id) => {
    try {
      await invoke("delete_library_item", { id });
      set((state) => {
        const { [id]: _, ...contentRest } = state.loadedContent;
        const { [id]: __, ...usageRest } = state.usage;
        return {
          items: state.items.filter((i) => i.id !== id),
          loadedContent: contentRest,
          usage: usageRest,
          selectedItemId:
            state.selectedItemId === id ? null : state.selectedItemId,
        };
      });
    } catch (err) {
      console.error("[libraryStore] deleteItem failed:", err);
    }
  },

  rebuildIndex: async () => {
    set({ loading: true });
    try {
      const index = await invoke<LibraryIndex>("rebuild_library_index");
      set({
        items: index.items,
        usage: index.usage,
        lastFetched: Date.now(),
        loadedContent: {}, // Invalidate all content caches
      });
    } catch (err) {
      console.error("[libraryStore] rebuildIndex failed:", err);
    } finally {
      set({ loading: false });
    }
  },

  attachToProject: async (itemId, projectPath) => {
    const normalized = normalizePath(projectPath);
    try {
      await invoke("attach_library_item", {
        id: itemId,
        projectPath,
      });
      set((state) => {
        const current = state.usage[itemId] ?? [];
        if (current.includes(normalized)) return state;
        return {
          usage: { ...state.usage, [itemId]: [...current, normalized] },
        };
      });
    } catch (err) {
      console.error("[libraryStore] attachToProject failed:", err);
    }
  },

  detachFromProject: async (itemId, projectPath) => {
    const normalized = normalizePath(projectPath);
    try {
      await invoke("detach_library_item", {
        id: itemId,
        projectPath,
      });
      set((state) => {
        const current = (state.usage[itemId] ?? []).filter(
          (p) => p !== normalized
        );
        if (current.length === 0) {
          const { [itemId]: _, ...rest } = state.usage;
          return { usage: rest };
        }
        return { usage: { ...state.usage, [itemId]: current } };
      });
    } catch (err) {
      console.error("[libraryStore] detachFromProject failed:", err);
    }
  },
}));

// ── Selectors ──────────────────────────────────────────────────────────

export const selectItemsByType =
  (type: LibraryItemType) => (state: LibraryState) =>
    state.items.filter((i) => i.item_type === type);

export const selectUsageForItem =
  (id: string) => (state: LibraryState) =>
    state.usage[id] ?? [];

export const selectItemsForProject =
  (projectPath: string) => (state: LibraryState) => {
    const normalized = normalizePath(projectPath);
    return state.items.filter((item) =>
      (state.usage[item.id] ?? []).includes(normalized)
    );
  };
