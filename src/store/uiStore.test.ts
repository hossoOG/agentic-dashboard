import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "./uiStore";

// ============================================================================
// Helpers
// ============================================================================

function getState() {
  return useUIStore.getState();
}

// ============================================================================
// Reset
// ============================================================================

beforeEach(() => {
  useUIStore.setState({
    activeTab: "sessions",
    detailPanel: { isOpen: false, type: null, targetId: null },
    toasts: [],
  });
});

// ============================================================================
// Initial State / Defaults
// ============================================================================

describe("initial state", () => {
  it("defaults activeTab to 'sessions'", () => {
    expect(getState().activeTab).toBe("sessions");
  });

  it("defaults detailPanel to closed", () => {
    expect(getState().detailPanel).toEqual({
      isOpen: false,
      type: null,
      targetId: null,
    });
  });

  it("defaults toasts to empty array", () => {
    expect(getState().toasts).toEqual([]);
  });
});

// ============================================================================
// setActiveTab
// ============================================================================

describe("setActiveTab", () => {
  it("switches to pipeline tab", () => {
    getState().setActiveTab("pipeline");
    expect(getState().activeTab).toBe("pipeline");
  });

  it("switches to settings tab", () => {
    getState().setActiveTab("settings");
    expect(getState().activeTab).toBe("settings");
  });

  it("switches back to sessions", () => {
    getState().setActiveTab("pipeline");
    getState().setActiveTab("sessions");
    expect(getState().activeTab).toBe("sessions");
  });

  it("is idempotent — setting same tab twice is fine", () => {
    getState().setActiveTab("sessions");
    getState().setActiveTab("sessions");
    expect(getState().activeTab).toBe("sessions");
  });
});

// ============================================================================
// DetailPanel
// ============================================================================

describe("detailPanel", () => {
  it("opens with type and targetId", () => {
    getState().openDetailPanel("session", "s1");
    expect(getState().detailPanel).toEqual({
      isOpen: true,
      type: "session",
      targetId: "s1",
    });
  });

  it("closes and resets fields", () => {
    getState().openDetailPanel("session", "s1");
    getState().closeDetailPanel();
    expect(getState().detailPanel).toEqual({
      isOpen: false,
      type: null,
      targetId: null,
    });
  });

  it("can reopen with different target", () => {
    getState().openDetailPanel("session", "s1");
    getState().openDetailPanel("worktree", "w2");
    expect(getState().detailPanel).toEqual({
      isOpen: true,
      type: "worktree",
      targetId: "w2",
    });
  });
});

// ============================================================================
// Toasts
// ============================================================================

describe("toasts", () => {
  it("adds a toast with auto-generated ID", () => {
    getState().addToast({ type: "info", title: "Hello" });
    const toasts = getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe("info");
    expect(toasts[0].title).toBe("Hello");
    expect(toasts[0].id).toMatch(/^toast-\d+$/);
  });

  it("adds multiple toasts with unique IDs", () => {
    getState().addToast({ type: "info", title: "First" });
    getState().addToast({ type: "error", title: "Second" });
    getState().addToast({ type: "achievement", title: "Third" });
    const toasts = getState().toasts;
    expect(toasts).toHaveLength(3);
    const ids = new Set(toasts.map((t) => t.id));
    expect(ids.size).toBe(3);
  });

  it("removes toast by ID", () => {
    getState().addToast({ type: "info", title: "Stay" });
    getState().addToast({ type: "error", title: "Remove" });
    const toastToRemove = getState().toasts[1];
    getState().removeToast(toastToRemove.id);
    expect(getState().toasts).toHaveLength(1);
    expect(getState().toasts[0].title).toBe("Stay");
  });

  it("removeToast is a no-op for non-existent ID", () => {
    getState().addToast({ type: "info", title: "Stay" });
    getState().removeToast("toast-nonexistent");
    expect(getState().toasts).toHaveLength(1);
  });

  it("preserves optional fields (message, duration)", () => {
    getState().addToast({
      type: "achievement",
      title: "Level Up",
      message: "You reached level 5",
      duration: 5000,
    });
    const toast = getState().toasts[0];
    expect(toast.message).toBe("You reached level 5");
    expect(toast.duration).toBe(5000);
  });

  // FIX: Toast array is capped at 10 entries
  it("limits toasts to max 10", () => {
    for (let i = 0; i < 100; i++) {
      getState().addToast({ type: "info", title: `Toast ${i}` });
    }
    expect(getState().toasts).toHaveLength(10);
    // Should keep the most recent 10
    expect(getState().toasts[0].title).toBe("Toast 90");
    expect(getState().toasts[9].title).toBe("Toast 99");
  });

  // Note: toastCounter is a module-level let, meaning IDs are globally
  // incrementing across tests and app lifetime. This is not a bug per se
  // but means IDs are not reset between test runs.
  it("toast IDs are monotonically increasing across calls", () => {
    getState().addToast({ type: "info", title: "A" });
    getState().addToast({ type: "info", title: "B" });
    const [a, b] = getState().toasts;
    const idA = parseInt(a.id.replace("toast-", ""), 10);
    const idB = parseInt(b.id.replace("toast-", ""), 10);
    expect(idB).toBeGreaterThan(idA);
  });
});
