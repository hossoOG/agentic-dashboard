import { create } from "zustand";
import type { ExternalServiceType, ADPRetryPolicy } from "../protocols/schema";

// ============================================================================
// Types
// ============================================================================

export type ServiceAdapterStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "rate-limited";

export interface CostEntry {
  timestamp: number;
  costUsd: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ServiceCostSummary {
  totalCostUsd: number;
  totalRequests: number;
  inputTokens: number;
  outputTokens: number;
  costHistory: CostEntry[];
}

export interface CredentialMetadata {
  kind: "api-key" | "oauth-token" | "pat";
  provider: string;
  storedAt: number;
  expiresAt?: number;
  isValid: boolean;
  redactedKey: string;
}

export interface ServiceAdapter {
  id: string;
  type: ExternalServiceType;
  displayName: string;
  status: ServiceAdapterStatus;
  costTracking: ServiceCostSummary;
  credential?: CredentialMetadata;
  rateLimit?: ADPRetryPolicy;
  lastError?: string;
}

export type CostAlertPeriod = "daily" | "weekly" | "monthly";

export interface CostAlert {
  id: string;
  adapterId?: string;
  thresholdUsd: number;
  period: CostAlertPeriod;
  enabled: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_COST_HISTORY_PER_ADAPTER = 1000;
const MAX_GLOBAL_COST_HISTORY = 5000;

// ============================================================================
// State Interface
// ============================================================================

export interface ServiceState {
  adapters: ServiceAdapter[];
  globalCost: ServiceCostSummary;
  costAlerts: CostAlert[];

  // Adapter CRUD
  addAdapter: (adapter: ServiceAdapter) => void;
  removeAdapter: (id: string) => void;
  updateAdapter: (id: string, partial: Partial<Omit<ServiceAdapter, "id">>) => void;
  setAdapterStatus: (id: string, status: ServiceAdapterStatus) => void;

  // Credential Metadata
  setCredentialMetadata: (adapterId: string, credential: CredentialMetadata) => void;
  clearCredentialMetadata: (adapterId: string) => void;

  // Cost Tracking
  addCostEntry: (adapterId: string, entry: CostEntry) => void;

  // Cost Alerts
  addCostAlert: (alert: CostAlert) => void;
  removeCostAlert: (id: string) => void;

  // Reset
  reset: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

const createEmptyCostSummary = (): ServiceCostSummary => ({
  totalCostUsd: 0,
  totalRequests: 0,
  inputTokens: 0,
  outputTokens: 0,
  costHistory: [],
});

// ============================================================================
// Store
// ============================================================================

export const useServiceStore = create<ServiceState>((set) => ({
  adapters: [],
  globalCost: createEmptyCostSummary(),
  costAlerts: [],

  addAdapter: (adapter) =>
    set((state) => ({
      adapters: [...state.adapters, adapter],
    })),

  removeAdapter: (id) =>
    set((state) => ({
      adapters: state.adapters.filter((a) => a.id !== id),
    })),

  updateAdapter: (id, partial) =>
    set((state) => ({
      adapters: state.adapters.map((a) =>
        a.id === id ? { ...a, ...partial } : a
      ),
    })),

  setAdapterStatus: (id, status) =>
    set((state) => ({
      adapters: state.adapters.map((a) =>
        a.id === id ? { ...a, status } : a
      ),
    })),

  setCredentialMetadata: (adapterId, credential) =>
    set((state) => ({
      adapters: state.adapters.map((a) =>
        a.id === adapterId ? { ...a, credential } : a
      ),
    })),

  clearCredentialMetadata: (adapterId) =>
    set((state) => ({
      adapters: state.adapters.map((a) =>
        a.id === adapterId ? { ...a, credential: undefined } : a
      ),
    })),

  addCostEntry: (adapterId, entry) =>
    set((state) => {
      // Update adapter-level cost tracking
      const updatedAdapters = state.adapters.map((a) => {
        if (a.id !== adapterId) return a;

        const updatedHistory = [...a.costTracking.costHistory, entry];
        const costTracking: ServiceCostSummary = {
          totalCostUsd: a.costTracking.totalCostUsd + entry.costUsd,
          totalRequests: a.costTracking.totalRequests + 1,
          inputTokens: a.costTracking.inputTokens + (entry.inputTokens ?? 0),
          outputTokens: a.costTracking.outputTokens + (entry.outputTokens ?? 0),
          costHistory: updatedHistory.length > MAX_COST_HISTORY_PER_ADAPTER
            ? updatedHistory.slice(-MAX_COST_HISTORY_PER_ADAPTER)
            : updatedHistory,
        };

        return { ...a, costTracking };
      });

      // Update global cost tracking
      const globalHistory = [...state.globalCost.costHistory, entry];
      const globalCost: ServiceCostSummary = {
        totalCostUsd: state.globalCost.totalCostUsd + entry.costUsd,
        totalRequests: state.globalCost.totalRequests + 1,
        inputTokens: state.globalCost.inputTokens + (entry.inputTokens ?? 0),
        outputTokens: state.globalCost.outputTokens + (entry.outputTokens ?? 0),
        costHistory: globalHistory.length > MAX_GLOBAL_COST_HISTORY
          ? globalHistory.slice(-MAX_GLOBAL_COST_HISTORY)
          : globalHistory,
      };

      return { adapters: updatedAdapters, globalCost };
    }),

  addCostAlert: (alert) =>
    set((state) => ({
      costAlerts: [...state.costAlerts, alert],
    })),

  removeCostAlert: (id) =>
    set((state) => ({
      costAlerts: state.costAlerts.filter((a) => a.id !== id),
    })),

  reset: () =>
    set({
      adapters: [],
      globalCost: createEmptyCostSummary(),
      costAlerts: [],
    }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectConnectedAdapters = (state: ServiceState): ServiceAdapter[] =>
  state.adapters.filter((a) => a.status === "connected");

export const selectTotalMonthlyCost = (state: ServiceState): number => {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  return state.globalCost.costHistory
    .filter((e) => e.timestamp >= thirtyDaysAgo)
    .reduce((sum, e) => sum + e.costUsd, 0);
};

export const selectExpiringCredentials = (
  state: ServiceState,
  withinMs: number = 7 * 24 * 60 * 60 * 1000
): ServiceAdapter[] => {
  const now = Date.now();
  return state.adapters.filter((a) => {
    if (!a.credential?.expiresAt) return false;
    return a.credential.expiresAt - now <= withinMs && a.credential.expiresAt > now;
  });
};
