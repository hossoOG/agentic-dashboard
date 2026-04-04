import { create } from "zustand";

export type ActiveTab = "sessions" | "pipeline" | "kanban" | "logs" | "library" | "settings" | "editor";

export type ConfigSubTab = "claude-md" | "skills" | "hooks" | "github" | "worktrees" | "kanban" | "history";

export type ToastType = "achievement" | "error" | "info" | "success";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface DetailPanel {
  isOpen: boolean;
  type: string | null;
  targetId: string | null;
}

interface UIState {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  configSubTab: ConfigSubTab;
  setConfigSubTab: (tab: ConfigSubTab) => void;

  configPanelOpen: boolean;
  toggleConfigPanel: () => void;
  setConfigPanelOpen: (open: boolean) => void;

  configPanelWidth: number;
  setConfigPanelWidth: (width: number) => void;

  previewFolder: string | null;
  openPreview: (folder: string) => void;
  closePreview: () => void;

  detailPanel: DetailPanel;
  openDetailPanel: (type: string, targetId: string) => void;
  closeDetailPanel: () => void;

  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>((set) => ({
  activeTab: "sessions",
  setActiveTab: (tab) => set({ activeTab: tab }),

  configSubTab: "claude-md",
  setConfigSubTab: (tab) => set({ configSubTab: tab }),

  configPanelOpen: false,
  toggleConfigPanel: () => set((state) => ({ configPanelOpen: !state.configPanelOpen })),
  setConfigPanelOpen: (open) => set({ configPanelOpen: open }),

  configPanelWidth: 400,
  setConfigPanelWidth: (width) => set({ configPanelWidth: Math.max(250, Math.min(800, width)) }),

  previewFolder: null,
  openPreview: (folder) => set({ previewFolder: folder }),
  closePreview: () => set({ previewFolder: null }),

  detailPanel: { isOpen: false, type: null, targetId: null },
  openDetailPanel: (type, targetId) =>
    set({ detailPanel: { isOpen: true, type, targetId } }),
  closeDetailPanel: () =>
    set({ detailPanel: { isOpen: false, type: null, targetId: null } }),

  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: `toast-${++toastCounter}` },
      ].slice(-10),
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
