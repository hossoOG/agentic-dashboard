import { describe, it, expect, beforeEach, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
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
const mockOpen = open as ReturnType<typeof vi.fn>;

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

async function openAndDirty(
  original = "orig",
  modified = "modified",
  folder = "/p",
  relativePath = "t.md",
) {
  mockInvoke.mockResolvedValueOnce(original);
  await useEditorStore.getState().openFileFromProject(folder, relativePath);
  useEditorStore.getState().updateContent(modified);
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

  // ── Persistence Safety (Sentinel Tests — highest risk) ──────────────

  describe("[SENTINEL] edge: open/close while dirty (documents current behavior)", () => {
    // Sentinel tests — will BREAK intentionally if a dirty-guard is added.
    // See bug-finding in PR #89 description / architect plan.
    it("openFileFromProject overwrites dirty file without warning", async () => {
      await openAndDirty("a-orig", "a-dirty", "/p", "a.md");
      expect(selectIsDirty(useEditorStore.getState())).toBe(true);

      mockInvoke.mockResolvedValueOnce("b-orig");
      await useEditorStore.getState().openFileFromProject("/p", "b.md");

      const state = useEditorStore.getState();
      expect(state.openFile?.relativePath).toBe("b.md");
      expect(state.openFile?.content).toBe("b-orig");
    });

    it("closeFile discards dirty file without warning", async () => {
      await openAndDirty("orig", "dirty");
      expect(selectIsDirty(useEditorStore.getState())).toBe(true);

      useEditorStore.getState().closeFile();
      expect(useEditorStore.getState().openFile).toBeNull();
    });
  });

  // ── saveFile edge cases ──────────────────────────────────────────────

  describe("saveFile edge cases", () => {
    it("flips isSaving flag during write and clears it afterwards", async () => {
      await openAndDirty("x", "y");

      let savingDuringWrite = false;
      mockInvoke.mockImplementationOnce(async () => {
        savingDuringWrite = useEditorStore.getState().isSaving;
        return undefined;
      });
      await useEditorStore.getState().saveFile();

      expect(savingDuringWrite).toBe(true);
      expect(useEditorStore.getState().isSaving).toBe(false);
    });

    it("second save call is no-op when not dirty anymore", async () => {
      await openAndDirty("orig", "new");

      mockInvoke.mockResolvedValueOnce(undefined);
      const firstResult = await useEditorStore.getState().saveFile();
      expect(firstResult).toBe(true);
      const callsAfterFirstSave = mockInvoke.mock.calls.length;

      const secondResult = await useEditorStore.getState().saveFile();
      expect(secondResult).toBe(false);
      expect(mockInvoke.mock.calls.length).toBe(callsAfterFirstSave);
    });

    it("becomes dirty again after save + subsequent edit", async () => {
      await openAndDirty("a", "b");

      mockInvoke.mockResolvedValueOnce(undefined);
      await useEditorStore.getState().saveFile();
      expect(selectIsDirty(useEditorStore.getState())).toBe(false);

      useEditorStore.getState().updateContent("c");
      expect(selectIsDirty(useEditorStore.getState())).toBe(true);
    });
  });

  // ── updateContent dirty-tracking bidirectional ───────────────────────

  describe("updateContent dirty-tracking", () => {
    it("reverting content to savedContent clears dirty flag", async () => {
      mockInvoke.mockResolvedValueOnce("orig");
      await useEditorStore.getState().openFileFromProject("/p", "t.md");

      useEditorStore.getState().updateContent("changed");
      expect(selectIsDirty(useEditorStore.getState())).toBe(true);

      useEditorStore.getState().updateContent("orig");
      expect(selectIsDirty(useEditorStore.getState())).toBe(false);
    });
  });

  // ── openFileFromDialog ───────────────────────────────────────────────

  describe("openFileFromDialog", () => {
    it("opens file selected via dialog (Unix path)", async () => {
      mockOpen.mockResolvedValueOnce("/home/user/docs/note.md");
      mockInvoke.mockResolvedValueOnce("# Note");

      await useEditorStore.getState().openFileFromDialog();

      expect(mockInvoke).toHaveBeenCalledWith("read_project_file", {
        folder: "/home/user/docs",
        relativePath: "note.md",
      });
      expect(useEditorStore.getState().openFile?.content).toBe("# Note");
    });

    it("parses Windows paths correctly (backslash → slash)", async () => {
      mockOpen.mockResolvedValueOnce("C:\\Users\\h\\doc.md");
      mockInvoke.mockResolvedValueOnce("x");

      await useEditorStore.getState().openFileFromDialog();

      expect(mockInvoke).toHaveBeenCalledWith("read_project_file", {
        folder: "C:/Users/h",
        relativePath: "doc.md",
      });
    });

    it("returns silently when user cancels dialog", async () => {
      mockOpen.mockResolvedValueOnce(null);

      await useEditorStore.getState().openFileFromDialog();

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(useEditorStore.getState().openFile).toBeNull();
    });

    it("ignores non-string dialog result (e.g. multi-select array)", async () => {
      mockOpen.mockResolvedValueOnce(["/a.md", "/b.md"]);

      await useEditorStore.getState().openFileFromDialog();

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(useEditorStore.getState().openFile).toBeNull();
    });

    it("shows error toast when dialog throws", async () => {
      mockOpen.mockRejectedValueOnce(new Error("dialog fail"));

      await useEditorStore.getState().openFileFromDialog();

      const toasts = useUIStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].type).toBe("error");
      expect(toasts[0].title).toBe("Fehler beim Oeffnen");
    });
  });

  // ── recentFiles dedup ────────────────────────────────────────────────

  describe("recentFiles dedup", () => {
    it("deduplicates and moves to top when same file opened twice", async () => {
      mockInvoke.mockResolvedValueOnce("v1");
      await useEditorStore.getState().openFileFromProject("/p", "a.md");
      mockInvoke.mockResolvedValueOnce("v2");
      await useEditorStore.getState().openFileFromProject("/p", "b.md");
      mockInvoke.mockResolvedValueOnce("v3");
      await useEditorStore.getState().openFileFromProject("/p", "a.md");

      const recent = useEditorStore.getState().recentFiles;
      expect(recent).toHaveLength(2);
      expect(recent[0].relativePath).toBe("a.md");
      expect(recent[1].relativePath).toBe("b.md");
    });
  });
});
