import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ClaudeMdViewer } from "./ClaudeMdViewer";

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

describe("ClaudeMdViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ClaudeMdViewer folder="/test/project" />);
    expect(screen.getByText("Lade CLAUDE.md...")).toBeInTheDocument();
  });

  it("renders markdown content after loading", async () => {
    mockInvoke.mockResolvedValue("# My Project\n\nSome content here.");
    render(<ClaudeMdViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByTestId("markdown-preview")).toBeInTheDocument();
    });

    expect(screen.getByTestId("markdown-preview")).toHaveTextContent("# My Project");
    expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
  });

  it("shows empty state when no CLAUDE.md found", async () => {
    mockInvoke.mockRejectedValue(new Error("file not found"));
    render(<ClaudeMdViewer folder="/test/project" />);

    await waitFor(() => {
      expect(
        screen.getByText("Keine CLAUDE.md in diesem Projekt gefunden"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("/test/project")).toBeInTheDocument();
  });

  it("enters edit mode when clicking Bearbeiten button", async () => {
    mockInvoke.mockResolvedValue("# Content");
    render(<ClaudeMdViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByTestId("markdown-preview")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Datei bearbeiten"));

    await waitFor(() => {
      expect(screen.getByTestId("code-editor")).toBeInTheDocument();
    });
  });

  it("saves file and exits edit mode", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "read_project_file") return Promise.resolve("original");
      if (cmd === "write_project_file") return Promise.resolve(undefined);
      return Promise.reject(new Error("unknown"));
    });

    render(<ClaudeMdViewer folder="/test/project" />);

    await waitFor(() => {
      expect(screen.getByTestId("markdown-preview")).toBeInTheDocument();
    });

    // Enter edit mode
    fireEvent.click(screen.getByLabelText("Datei bearbeiten"));

    await waitFor(() => {
      expect(screen.getByTestId("code-editor")).toBeInTheDocument();
    });

    // Modify content
    fireEvent.change(screen.getByTestId("code-editor"), {
      target: { value: "modified content" },
    });

    // Save
    fireEvent.click(screen.getByLabelText("Datei speichern"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("write_project_file", {
        folder: "/test/project",
        relativePath: "CLAUDE.md",
        content: "modified content",
      });
    });
  });

  it("shows empty content as null (not found state)", async () => {
    mockInvoke.mockResolvedValue("");
    render(<ClaudeMdViewer folder="/test/project" />);

    await waitFor(() => {
      expect(
        screen.getByText("Keine CLAUDE.md in diesem Projekt gefunden"),
      ).toBeInTheDocument();
    });
  });
});
