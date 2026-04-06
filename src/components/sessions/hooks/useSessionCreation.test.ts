import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionCreation } from "./useSessionCreation";

// ── Mocks ─────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockAddSession = vi.fn();
vi.mock("../../../store/sessionStore", () => ({
  useSessionStore: {
    getState: () => ({
      addSession: mockAddSession,
    }),
  },
}));

const mockUpdateFavoriteLastUsed = vi.fn();
vi.mock("../../../store/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      updateFavoriteLastUsed: mockUpdateFavoriteLastUsed,
    }),
  },
}));

const mockClosePreview = vi.fn();
vi.mock("../../../store/uiStore", () => ({
  useUIStore: {
    getState: () => ({
      closePreview: mockClosePreview,
    }),
  },
}));

vi.mock("../../../utils/perfLogger", () => ({
  wrapInvoke: (cmd: string, args: Record<string, unknown>) =>
    mockInvoke(cmd, args),
}));

vi.mock("../../../utils/errorLogger", () => ({
  logError: vi.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────

describe("useSessionCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleResumeSession", () => {
    it("creates a session via Tauri and adds it to the store", async () => {
      mockInvoke.mockResolvedValue({
        id: "session-resume-1",
        title: "Resume Session",
        folder: "C:/Projects/test",
        shell: "powershell",
      });

      const { result } = renderHook(() => useSessionCreation());

      await act(async () => {
        await result.current.handleResumeSession("old-session-id", "C:/Projects/test");
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "create_session",
        expect.objectContaining({
          folder: "C:/Projects/test",
          title: "Resume Session",
          shell: "powershell",
          resumeSessionId: "old-session-id",
        }),
      );

      expect(mockAddSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "session-resume-1",
          title: "Resume Session",
          folder: "C:/Projects/test",
          shell: "powershell",
        }),
      );
    });

    it("uses fallback values if invoke returns partial data", async () => {
      mockInvoke.mockResolvedValue({});

      const { result } = renderHook(() => useSessionCreation());

      await act(async () => {
        await result.current.handleResumeSession("old-id", "C:/test");
      });

      expect(mockAddSession).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Resume Session",
          folder: "C:/test",
          shell: "powershell",
        }),
      );
    });

    it("handles invoke errors gracefully", async () => {
      mockInvoke.mockRejectedValue(new Error("connection failed"));
      const { logError } = await import("../../../utils/errorLogger");

      const { result } = renderHook(() => useSessionCreation());

      await act(async () => {
        await result.current.handleResumeSession("old-id", "C:/test");
      });

      expect(logError).toHaveBeenCalledWith(
        "useSessionCreation.resumeSession",
        expect.any(Error),
      );
    });
  });

  describe("handleQuickStart", () => {
    const favorite = {
      id: "fav-1",
      label: "My Project",
      path: "C:/Projects/my-project",
      shell: "powershell" as const,
      lastUsedAt: 0,
      addedAt: Date.now(),
      pinnedDocs: [],
    };

    it("creates a session and updates favorite last-used", async () => {
      mockInvoke.mockResolvedValue({
        id: "session-quick-1",
        title: "My Project",
        folder: "C:/Projects/my-project",
        shell: "powershell",
      });

      const { result } = renderHook(() => useSessionCreation());

      await act(async () => {
        await result.current.handleQuickStart(favorite);
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "create_session",
        expect.objectContaining({
          folder: "C:/Projects/my-project",
          title: "My Project",
          shell: "powershell",
        }),
      );

      expect(mockAddSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "session-quick-1",
          title: "My Project",
        }),
      );

      expect(mockUpdateFavoriteLastUsed).toHaveBeenCalledWith("fav-1");
      expect(mockClosePreview).toHaveBeenCalled();
    });

    it("handles invoke errors gracefully", async () => {
      mockInvoke.mockRejectedValue(new Error("spawn failed"));
      const { logError } = await import("../../../utils/errorLogger");

      const { result } = renderHook(() => useSessionCreation());

      await act(async () => {
        await result.current.handleQuickStart(favorite);
      });

      expect(logError).toHaveBeenCalledWith(
        "useSessionCreation.quickStart",
        expect.any(Error),
      );
      expect(mockAddSession).not.toHaveBeenCalled();
    });
  });
});
