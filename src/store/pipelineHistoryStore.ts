import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { logError } from "../utils/errorLogger";
import type { PipelineRun } from "../types/pipelineHistory";

// ============================================================================
// State Interface
// ============================================================================

export interface PipelineHistoryState {
  /** Loaded pipeline runs (newest first). */
  runs: PipelineRun[];
  /** Currently selected run ID for detail view. */
  selectedRunId: string | null;
  /** Whether runs are currently being loaded. */
  isLoading: boolean;

  // Actions
  /** Load runs from backend with optional pagination. */
  loadRuns: (limit?: number, offset?: number) => Promise<void>;
  /** Load a single run by ID and add/update it in the runs list. */
  loadRun: (id: string) => Promise<PipelineRun | null>;
  /** Select a run for detail viewing. */
  selectRun: (id: string | null) => void;
  /** Clear the current selection. */
  clearSelection: () => void;
}

// ============================================================================
// Store
// ============================================================================

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const usePipelineHistoryStore = create<PipelineHistoryState>((set, get) => ({
  runs: [],
  selectedRunId: null,
  isLoading: false,

  loadRuns: async (limit = 50, offset = 0) => {
    if (!isTauri) return;
    set({ isLoading: true });
    try {
      const runs = await invoke<PipelineRun[]>("list_pipeline_runs", { limit, offset });
      set({ runs, isLoading: false });
    } catch (err) {
      logError("pipelineHistoryStore.loadRuns", err);
      set({ isLoading: false });
    }
  },

  loadRun: async (id: string) => {
    if (!isTauri) return null;
    try {
      const run = await invoke<PipelineRun>("get_pipeline_run", { id });
      // Update or append in the runs list
      set((state) => {
        const idx = state.runs.findIndex((r) => r.id === id);
        if (idx >= 0) {
          const updated = [...state.runs];
          updated[idx] = run;
          return { runs: updated };
        }
        return { runs: [run, ...state.runs] };
      });
      return run;
    } catch (err) {
      logError("pipelineHistoryStore.loadRun", err);
      return null;
    }
  },

  selectRun: (id) => {
    set({ selectedRunId: id });
    // If selecting a run, also load its full data
    if (id && isTauri) {
      get().loadRun(id);
    }
  },

  clearSelection: () => set({ selectedRunId: null }),
}));
