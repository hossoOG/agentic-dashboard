import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MarkdownEditorView } from "./MarkdownEditorView";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import { useEditorStore, type EditorFile } from "../../store/editorStore";
import { useUIStore } from "../../store/uiStore";

type CodeMirrorEditorProps = ComponentProps<typeof CodeMirrorEditor>;

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("../../utils/perfLogger", () => ({
  wrapInvoke: vi.fn(),
}));

vi.mock("../../utils/errorLogger", () => ({
  logError: vi.fn(),
}));

// CodeMirror mock — replace heavy editor with a simple textarea
vi.mock("./CodeMirrorEditor", () => ({
  CodeMirrorEditor: (p: CodeMirrorEditorProps) => (
    <textarea
      data-testid="cm-mock"
      value={p.value}
      onChange={(e) => p.onChange(e.target.value)}
    />
  ),
}));

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

function makeFile(overrides: Partial<EditorFile> = {}): EditorFile {
  return {
    folder: "/project",
    relativePath: "notes.md",
    content: "# Hello",
    savedContent: "# Hello",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("MarkdownEditorView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("shows EmptyState with open-file CTA when no file is open", () => {
    render(<MarkdownEditorView />);
    // EmptyState renders CTA button with visible text "Markdown-Datei oeffnen"
    // EmptyState CTA button has visible text "Markdown-Datei oeffnen"; toolbar's "Oeffnen" button also has that aria-label.
    // Find EmptyState specifically via the button that has textContent matching exactly.
    const buttons = screen.getAllByRole("button", { name: "Markdown-Datei oeffnen" });
    const emptyStateCta = buttons.find((b) => b.textContent?.trim() === "Markdown-Datei oeffnen");
    expect(emptyStateCta).toBeTruthy();
    // "Keine Datei geoeffnet" appears twice (toolbar + EmptyState) when no file is open
    expect(screen.getAllByText("Keine Datei geoeffnet").length).toBeGreaterThanOrEqual(1);
    // No editor textarea in empty state
    expect(screen.queryByTestId("cm-mock")).toBeNull();
  });

  it("renders editor + preview split when file is open and preview visible", () => {
    useEditorStore.setState({
      openFile: makeFile(),
      isPreviewVisible: true,
    });
    const { container } = render(<MarkdownEditorView />);
    expect(screen.getByTestId("cm-mock")).toBeTruthy();
    // Separator between editor/preview present
    expect(screen.getByRole("separator")).toBeTruthy();
    // Preview container rendered
    expect(container.querySelector(".md-preview")).toBeTruthy();
  });

  it("hides preview pane when isPreviewVisible is false", () => {
    useEditorStore.setState({
      openFile: makeFile(),
      isPreviewVisible: false,
    });
    const { container } = render(<MarkdownEditorView />);
    expect(screen.getByTestId("cm-mock")).toBeTruthy();
    // Separator gone
    expect(screen.queryByRole("separator")).toBeNull();
    // Preview container gone
    expect(container.querySelector(".md-preview")).toBeNull();
  });

  it("handles file close lifecycle: open file → closeFile → EmptyState reappears", () => {
    useEditorStore.setState({ openFile: makeFile() });
    const { rerender } = render(<MarkdownEditorView />);
    expect(screen.getByTestId("cm-mock")).toBeTruthy();

    // Invoke closeFile action from the real store
    act(() => {
      useEditorStore.getState().closeFile();
    });
    rerender(<MarkdownEditorView />);

    expect(screen.queryByTestId("cm-mock")).toBeNull();
    // EmptyState CTA button has visible text "Markdown-Datei oeffnen"; toolbar's "Oeffnen" button also has that aria-label.
    // Find EmptyState specifically via the button that has textContent matching exactly.
    const buttons = screen.getAllByRole("button", { name: "Markdown-Datei oeffnen" });
    const emptyStateCta = buttons.find((b) => b.textContent?.trim() === "Markdown-Datei oeffnen");
    expect(emptyStateCta).toBeTruthy();
  });

  it("triggers saveFile on global Ctrl+S when file is dirty", () => {
    const saveFileSpy = vi.fn().mockResolvedValue(true);
    useEditorStore.setState({
      openFile: makeFile({ content: "changed", savedContent: "orig" }),
      saveFile: saveFileSpy,
    });
    render(<MarkdownEditorView />);

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(saveFileSpy).toHaveBeenCalledTimes(1);

    // Clean file → Ctrl+S should not trigger save
    saveFileSpy.mockClear();
    act(() => {
      useEditorStore.setState({
        openFile: makeFile({ content: "same", savedContent: "same" }),
      });
    });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(saveFileSpy).not.toHaveBeenCalled();
  });
});
