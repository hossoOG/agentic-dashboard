import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { logError } from "../utils/errorLogger";
import type { PipelineStatusInfo } from "../protocols/schema";

// ============================================================================
// State Interface
// ============================================================================

export interface PipelineStatusState {
  /** Current pipeline status info from the backend. */
  statusInfo: PipelineStatusInfo;
  /** Whether a fetch is currently in progress. */
  isLoading: boolean;
  /** Polling interval ID (null when not polling). */
  pollingId: ReturnType<typeof setInterval> | null;

  // Actions
  /** Fetch current status from the Tauri backend. */
  fetchStatus: () => Promise<void>;
  /** Start periodic polling at the given interval (ms). */
  startPolling: (intervalMs?: number) => void;
  /** Stop periodic polling. */
  stopPolling: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const DEFAULT_STATUS: PipelineStatusInfo = {
  status: "idle",
  workflowName: null,
  stepIndex: 0,
  totalSteps: 0,
  elapsedMs: 0,
  errorMessage: null,
};

const DEFAULT_POLL_INTERVAL = 2000;

/** Shallow compare two PipelineStatusInfo objects to detect changes. */
function statusChanged(a: PipelineStatusInfo, b: PipelineStatusInfo): boolean {
  return (
    a.status !== b.status ||
    a.workflowName !== b.workflowName ||
    a.stepIndex !== b.stepIndex ||
    a.totalSteps !== b.totalSteps ||
    a.elapsedMs !== b.elapsedMs ||
    a.errorMessage !== b.errorMessage
  );
}

// ============================================================================
// Selectors
// ============================================================================

/** Is the pipeline currently running (running or starting)? */
export const selectIsRunning = (s: PipelineStatusState): boolean =>
  s.statusInfo.status === "running" || s.statusInfo.status === "starting";

/** Is the pipeline idle? */
export const selectIsIdle = (s: PipelineStatusState): boolean =>
  s.statusInfo.status === "idle";

/** Is the pipeline in a terminal state (completed, failed, cancelled)? */
export const selectIsTerminal = (s: PipelineStatusState): boolean =>
  s.statusInfo.status === "completed" ||
  s.statusInfo.status === "failed" ||
  s.statusInfo.status === "cancelled";

// ============================================================================
// Store
// ============================================================================

export const usePipelineStatusStore = create<PipelineStatusState>((set, get) => ({
  statusInfo: DEFAULT_STATUS,
  isLoading: false,
  pollingId: null,

  fetchStatus: async () => {
    if (!isTauri) return;
    try {
      const info = await invoke<PipelineStatusInfo>("get_pipeline_status");
      // Only update store if status actually changed to avoid unnecessary re-renders
      const current = get().statusInfo;
      if (statusChanged(current, info)) {
        set({ statusInfo: info });
      }
    } catch (err) {
      logError("pipelineStatusStore.fetchStatus", err);
    }
  },

  startPolling: (intervalMs = DEFAULT_POLL_INTERVAL) => {
    const { pollingId, fetchStatus } = get();
    // Don't start if already polling
    if (pollingId !== null) return;

    // Fetch immediately, then poll
    fetchStatus();
    const id = setInterval(() => {
      fetchStatus();
    }, intervalMs);
    set({ pollingId: id });
  },

  stopPolling: () => {
    const { pollingId } = get();
    if (pollingId !== null) {
      clearInterval(pollingId);
      set({ pollingId: null });
    }
  },
}));
