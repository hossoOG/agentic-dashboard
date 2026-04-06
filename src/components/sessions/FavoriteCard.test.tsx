import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FavoriteCard } from "./FavoriteCard";
import { useUIStore } from "../../store/uiStore";
import { invoke } from "@tauri-apps/api/core";
import type { FavoriteFolder } from "../../store/settingsStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

function makeFavorite(overrides: Partial<FavoriteFolder> = {}): FavoriteFolder {
  return {
    id: "fav-1",
    path: "C:/Projects/my-project",
    label: "My Project",
    shell: "powershell",
    addedAt: Date.now(),
    lastUsedAt: Date.now(),
    ...overrides,
  };
}

describe("FavoriteCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ previewFolder: null });
  });

  it("renders favorite label and shortened path", () => {
    render(
      <FavoriteCard favorite={makeFavorite()} onStart={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByText("My Project")).toBeTruthy();
    // shortenPath("C:/Projects/my-project") has 3 segments → returned as-is
    expect(screen.getByText("C:/Projects/my-project")).toBeTruthy();
  });

  it("calls onStart when play button is clicked", () => {
    const onStart = vi.fn();
    render(
      <FavoriteCard favorite={makeFavorite()} onStart={onStart} onRemove={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("Session starten"));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();
    render(
      <FavoriteCard favorite={makeFavorite()} onStart={vi.fn()} onRemove={onRemove} />,
    );

    fireEvent.click(screen.getByLabelText("Favorit entfernen"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("invokes open_folder_in_explorer on folder button click", () => {
    const fav = makeFavorite({ path: "/test/path" });
    render(
      <FavoriteCard favorite={fav} onStart={vi.fn()} onRemove={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("Ordner im Explorer öffnen"));
    expect(mockInvoke).toHaveBeenCalledWith("open_folder_in_explorer", { path: "/test/path" });
  });

  it("invokes open_terminal_in_folder on terminal button click", () => {
    const fav = makeFavorite({ path: "/test/path" });
    render(
      <FavoriteCard favorite={fav} onStart={vi.fn()} onRemove={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("Terminal im Ordner öffnen"));
    expect(mockInvoke).toHaveBeenCalledWith("open_terminal_in_folder", { path: "/test/path" });
  });

  it("opens preview in uiStore when card is clicked", () => {
    const fav = makeFavorite({ path: "/preview/folder" });
    render(
      <FavoriteCard favorite={fav} onStart={vi.fn()} onRemove={vi.fn()} />,
    );

    // Click the card body (not an action button)
    fireEvent.click(screen.getByText("My Project"));
    // openPreview sets previewFolder in uiStore (propagation from label click to card)
    // The card onClick calls openPreview(favorite.path)
    expect(useUIStore.getState().previewFolder).toBe("/preview/folder");
  });
});
