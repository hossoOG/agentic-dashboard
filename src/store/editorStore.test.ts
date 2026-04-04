import { describe, it, expect, beforeEach, vi } from "vitest";
import { wrapInvoke } from "../utils/perfLogger";
import { useEditorStore, selectIsDirty } from "./editorStore";
import { useUIStore } from "./uiStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../utils/perfLogger", () => ({
  wrapInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../utils/errorLogger", () => ({
  logError: vi.fn(),
}));

const mockInvoke = wrapInvoke as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────

function resetStore() {
  useEditorStore.setState({
    openFile: null,
    isPreviewVisible: true,
    isSaving: false,
    recentFiles: [],
  });
  useUIStore.setState({ toasts: [] });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("editorStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  describe("openFileFromProject", () => {
    it("loads file content and sets state", async () => {
      mockInvoke.mockResolvedValueOnce("# Hello World");

      await useEditorStore.getState().openFileFromProject("/project", "README.md");

      const state = useEditorStore.getState();
      expect(mockInvoke).toHaveBeenCalledWith("read_project_file", {
        folder: "/project",
        relativePath: "README.md",
      });
      expect(state.openFile).toEqual({
        folder: "/project",
        relativePath: "README.md",
        content: "# Hello World",
        savedContent: "# Hello World",
      });
    });

    it("adds to recent files", async () => {
      mockInvoke.mockResolvedValueOnce("content1");
      await useEditorStore.getState().openFileFromProject("/p", "a.md");

      mockInvoke.mockResolvedValueOnce("content2");
      await useEditorStore.getState().openFileFromProject("/p", "b.md");

      const recent = useEditorStore.getState().recentFiles;
      expect(recent).toHaveLength(2);
      expect(recent[0].relativePath).toBe("b.md");
      expect(recent[1].relativePath).toBe("a.md");
    });

    it("limits recent files to 10", async () => {
      for (let i = 0; i < 12; i++) {
        mockInvoke.mockResolvedValueOnce(`content-${i}`);
        await useEditorStore.getState().openFileFromProject("/p", `file-${i}.md`);
      }

      expect(useEditorStore.getState().recentFiles).toHaveLength(10);
    });

    it("shows error toast on failure", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("File not found"));

      await useEditorStore.getState().openFileFromProject("/p", "missing.md");

      const toasts = useUIStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe("error");
      expect(toasts[0].title).toBe("Fehler beim Oeffnen");
    });
  });

  describe("updateContent", () => {
    it("updates content and makes file dirty", async () => {
      mockInvoke.mockResolvedValueOnce("original");
      await useEditorStore.getState().openFileFromProject("/p", "test.md");

      useEditorStore.getState().updateContent("modified");

      const state = useEditorStore.getState();
      expect(state.openFile?.content).toBe("modified");
      expect(state.openFile?.savedContent).toBe("original");
      expect(selectIsDirty(state)).toBe(true);
    });

    it("does nothing when no file is open", () => {
      useEditorStore.getState().updateContent("something");
      expect(useEditorStore.getState().openFile).toBeNull();
    });
  });

  describe("isDirty selector", () => {
    it("returns false when content matches saved", async () => {
      mockInvoke.mockResolvedValueOnce("same");
      await useEditorStore.getState().openFileFromProject("/p", "test.md");

      expect(selectIsDirty(useEditorStore.getState())).toBe(false);
    });

    it("returns false when no file is open", () => {
      expect(selectIsDirty(useEditorStore.getState())).toBe(false);
    });
  });

  describe("saveFile", () => {
    it("saves file and resets dirty state", async () => {
      mockInvoke.mockResolvedValueOnce("original");
      await useEditorStore.getState().openFileFromProject("/p", "test.md");
      useEditorStore.getState().updateContent("updated");

      mockInvoke.mockResolvedValueOnce(undefined);
      const result = await useEditorStore.getState().saveFile();

      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("write_project_file", {
        folder: "/p",
        relativePath: "test.md",
        content: "updated",
      });

      const state = useEditorStore.getState();
      expect(state.openFile?.savedContent).toBe("updated");
      expect(selectIsDirty(state)).toBe(false);
    });

    it("shows success toast on save", async () => {
      mockInvoke.mockResolvedValueOnce("content");
      await useEditorStore.getState().openFileFromProject("/p", "test.md");
      useEditorStore.getState().updateContent("changed");

      mockInvoke.mockResolvedValueOnce(undefined);
      await useEditorStore.getState().saveFile();

      const toasts = useUIStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe("success");
      expect(toasts[0].title).toBe("Gespeichert");
    });

    it("shows error toast on failure", async () => {
      mockInvoke.mockResolvedValueOnce("content");
      await useEditorStore.getState().openFileFromProject("/p", "test.md");
      useEditorStore.getState().updateContent("changed");

      mockInvoke.mockRejectedValueOnce(new Error("Permission denied"));
      const result = await useEditorStore.getState().saveFile();

      expect(result).toBe(false);
      expect(useEditorStore.getState().isSaving).toBe(false);

      const toasts = useUIStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe("error");
    });

    it("returns false when not dirty", async () => {
      mockInvoke.mockResolvedValueOnce("content");
      await useEditorStore.getState().openFileFromProject("/p", "test.md");

      const result = await useEditorStore.getState().saveFile();
      expect(result).toBe(false);
      expect(mockInvoke).toHaveBeenCalledTimes(1); // Only the read call
    });
  });

  describe("closeFile", () => {
    it("clears the open file", async () => {
      mockInvoke.mockResolvedValueOnce("content");
      await useEditorStore.getState().openFileFromProject("/p", "test.md");

      useEditorStore.getState().closeFile();
      expect(useEditorStore.getState().openFile).toBeNull();
    });
  });

  describe("togglePreview", () => {
    it("toggles preview visibility", () => {
      expect(useEditorStore.getState().isPreviewVisible).toBe(true);

      useEditorStore.getState().togglePreview();
      expect(useEditorStore.getState().isPreviewVisible).toBe(false);

      useEditorStore.getState().togglePreview();
      expect(useEditorStore.getState().isPreviewVisible).toBe(true);
    });
  });
});
