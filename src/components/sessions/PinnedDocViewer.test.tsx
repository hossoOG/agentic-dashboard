import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PinnedDocViewer } from "./PinnedDocViewer";
import { useSettingsStore, normalizeProjectKey } from "../../store/settingsStore";

// Mock @tauri-apps/api/core
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("../editor/MarkdownPreview", () => ({
  MarkdownPreview: ({ content }: { content: string }) => (
    <div data-testid="markdown-preview">{content}</div>
  ),
}));

vi.mock("../editor/CodeMirrorEditor", () => ({
  CodeMirrorEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const TEST_FOLDER = "/test/project";
const TEST_PIN_ID = "pin-123";

function setupPinnedDoc(relativePath: string, label?: string) {
  const key = normalizeProjectKey(TEST_FOLDER);
  useSettingsStore.setState({
    pinnedDocs: {
      [key]: [
        {
          id: TEST_PIN_ID,
          relativePath,
          label: label ?? relativePath,
          addedAt: Date.now(),
        },
      ],
    },
  });
}

describe("PinnedDocViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ pinnedDocs: {} });
  });

  it("shows 'Pin nicht gefunden' when pin does not exist", () => {
    render(<PinnedDocViewer folder={TEST_FOLDER} pinId="nonexistent" />);
    expect(screen.getByText("Pin nicht gefunden")).toBeInTheDocument();
  });

  it("shows loading state while fetching", () => {
    setupPinnedDoc("docs/guide.md", "Guide");
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PinnedDocViewer folder={TEST_FOLDER} pinId={TEST_PIN_ID} />);
    expect(screen.getByText(/Lade docs\/guide.md/)).toBeInTheDocument();
  });

  it("renders document content after loading", async () => {
    setupPinnedDoc("docs/guide.md", "Guide");
    mockInvoke.mockResolvedValue("# Guide\n\nHelpful content.");
    render(<PinnedDocViewer folder={TEST_FOLDER} pinId={TEST_PIN_ID} />);

    await waitFor(() => {
      expect(screen.getByTestId("markdown-preview")).toBeInTheDocument();
    });

    expect(screen.getByTestId("markdown-preview")).toHaveTextContent("# Guide");
  });

  it("shows error state when loading fails", async () => {
    setupPinnedDoc("docs/missing.md", "Missing Doc");
    mockInvoke.mockRejectedValue(new Error("file not found"));
    render(<PinnedDocViewer folder={TEST_FOLDER} pinId={TEST_PIN_ID} />);

    await waitFor(() => {
      expect(screen.getByText("Fehler beim Laden")).toBeInTheDocument();
    });

    expect(screen.getByText("Erneut versuchen")).toBeInTheDocument();
  });

  it("shows empty file state when content is empty", async () => {
    setupPinnedDoc("docs/empty.md", "Empty Doc");
    mockInvoke.mockResolvedValue("");
    render(<PinnedDocViewer folder={TEST_FOLDER} pinId={TEST_PIN_ID} />);

    await waitFor(() => {
      expect(
        screen.getByText("Datei existiert nicht oder ist leer"),
      ).toBeInTheDocument();
    });
  });

  it("enters edit mode and can save", async () => {
    setupPinnedDoc("docs/guide.md", "Guide");
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_project_file") return Promise.resolve("original content");
      if (cmd === "write_project_file") return Promise.resolve(undefined);
      return Promise.reject(new Error("unknown"));
    });

    render(<PinnedDocViewer folder={TEST_FOLDER} pinId={TEST_PIN_ID} />);

    await waitFor(() => {
      expect(screen.getByTestId("markdown-preview")).toBeInTheDocument();
    });

    // Enter edit mode
    fireEvent.click(screen.getByLabelText("Datei bearbeiten"));

    await waitFor(() => {
      expect(screen.getByTestId("code-editor")).toBeInTheDocument();
    });

    // Modify and save
    fireEvent.change(screen.getByTestId("code-editor"), {
      target: { value: "updated content" },
    });

    fireEvent.click(screen.getByLabelText("Datei speichern"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("write_project_file", {
        folder: TEST_FOLDER,
        relativePath: "docs/guide.md",
        content: "updated content",
      });
    });
  });
});
