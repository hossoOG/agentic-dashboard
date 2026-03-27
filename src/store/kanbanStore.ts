import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// ── Types ──────────────────────────────────────────────────────────────

export interface ProjectInfo {
  number: number;
  title: string;
  id: string;
}

export interface ProjectColumn {
  id: string;
  name: string;
}

interface ProjectColumnsResult {
  field_id: string;
  columns: ProjectColumn[];
}

export interface KanbanItem {
  id: string;
  title: string;
  number: number | null;
  status: string;
  labels: string[];
  assignees: string[];
  url: string;
  item_type: string;
}

// ── Store ──────────────────────────────────────────────────────────────

interface KanbanState {
  projects: ProjectInfo[];
  selectedProject: number | null;
  columns: ProjectColumn[];
  items: KanbanItem[];
  fieldId: string | null;
  projectId: string | null;
  loading: boolean;
  error: string | null;
  lastFetched: number;

  loadProjects: (owner: string) => Promise<void>;
  selectProject: (owner: string, projectNumber: number) => Promise<void>;
  moveItem: (itemId: string, newOptionId: string) => Promise<void>;
  refresh: (owner: string) => Promise<void>;
  reset: () => void;
}

const CACHE_TTL = 60_000; // 60 seconds

export const useKanbanStore = create<KanbanState>((set, get) => ({
  projects: [],
  selectedProject: null,
  columns: [],
  items: [],
  fieldId: null,
  projectId: null,
  loading: false,
  error: null,
  lastFetched: 0,

  loadProjects: async (owner: string) => {
    const now = Date.now();
    const state = get();
    if (state.projects.length > 0 && now - state.lastFetched < CACHE_TTL) return;

    set({ loading: true, error: null });
    try {
      const projects = await invoke<ProjectInfo[]>("get_github_projects", { owner });
      set({ projects, loading: false, lastFetched: Date.now() });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  selectProject: async (owner: string, projectNumber: number) => {
    set({ loading: true, error: null, selectedProject: projectNumber });
    try {
      const [columnsResult, items] = await Promise.all([
        invoke<ProjectColumnsResult>("get_project_columns", { owner, projectNumber }),
        invoke<KanbanItem[]>("get_project_items", { owner, projectNumber }),
      ]);

      // Find the project ID from loaded projects
      const project = get().projects.find((p) => p.number === projectNumber);
      const projectId = project?.id ?? null;

      set({
        columns: columnsResult?.columns ?? [],
        fieldId: columnsResult?.field_id || null,
        items,
        projectId,
        loading: false,
        lastFetched: Date.now(),
      });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  moveItem: async (itemId: string, newOptionId: string) => {
    const { projectId, fieldId } = get();
    if (!projectId) {
      set({ error: "Kein Projekt-ID vorhanden" });
      return;
    }
    if (!fieldId) {
      set({ error: "Kein Status-Feld-ID vorhanden. Drag & Drop ist erst nach erneutem Laden moeglich." });
      return;
    }

    // Optimistic update
    const prevItems = get().items;
    const targetColumn = get().columns.find((c) => c.id === newOptionId);
    if (targetColumn) {
      set({
        items: prevItems.map((item) =>
          item.id === itemId ? { ...item, status: targetColumn.name } : item
        ),
      });
    }

    try {
      await invoke("update_item_status", {
        projectId,
        itemId,
        fieldId,
        optionId: newOptionId,
      });
    } catch (err) {
      // Rollback on failure
      set({ items: prevItems, error: String(err) });
    }
  },

  refresh: async (owner: string) => {
    const { selectedProject } = get();
    set({ lastFetched: 0 });
    await get().loadProjects(owner);
    if (selectedProject != null) {
      await get().selectProject(owner, selectedProject);
    }
  },

  reset: () =>
    set({
      projects: [],
      selectedProject: null,
      columns: [],
      items: [],
      fieldId: null,
      projectId: null,
      loading: false,
      error: null,
      lastFetched: 0,
    }),
}));
