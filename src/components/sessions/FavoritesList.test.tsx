import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FavoritesList } from "./FavoritesList";
import { useSettingsStore } from "../../store/settingsStore";
import type { FavoriteFolder } from "../../store/settingsStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

function makeFavorite(overrides: Partial<FavoriteFolder> = {}): FavoriteFolder {
  return {
    id: "fav-1",
    path: "C:/Projects/test",
    label: "Test Project",
    shell: "powershell",
    addedAt: Date.now(),
    lastUsedAt: Date.now(),
    ...overrides,
  };
}

describe("FavoritesList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ favorites: [] });
  });

  it("renders empty state text when no favorites", () => {
    render(<FavoritesList onQuickStart={vi.fn()} />);
    expect(screen.getByText("Ordner hinzufügen für Schnellstart")).toBeTruthy();
  });

  it("renders section header with FAVORITEN label", () => {
    render(<FavoritesList onQuickStart={vi.fn()} />);
    expect(screen.getByText("FAVORITEN")).toBeTruthy();
  });

  it("renders favorite cards when favorites exist", () => {
    useSettingsStore.setState({
      favorites: [
        makeFavorite({ id: "f1", label: "Project A", lastUsedAt: 100 }),
        makeFavorite({ id: "f2", label: "Project B", lastUsedAt: 200 }),
      ],
    });

    render(<FavoritesList onQuickStart={vi.fn()} />);
    expect(screen.getByText("Project A")).toBeTruthy();
    expect(screen.getByText("Project B")).toBeTruthy();
  });

  it("sorts favorites by lastUsedAt descending", () => {
    useSettingsStore.setState({
      favorites: [
        makeFavorite({ id: "f1", label: "Older", lastUsedAt: 100 }),
        makeFavorite({ id: "f2", label: "Newer", lastUsedAt: 200 }),
      ],
    });

    const { container } = render(<FavoritesList onQuickStart={vi.fn()} />);
    // "Newer" should appear before "Older" in DOM order
    const labels = container.querySelectorAll(".font-bold");
    const texts = Array.from(labels).map((el) => el.textContent);
    expect(texts.indexOf("Newer")).toBeLessThan(texts.indexOf("Older"));
  });

  it("renders add favorite button with correct aria-label", () => {
    render(<FavoritesList onQuickStart={vi.fn()} />);
    expect(screen.getByLabelText("Ordner als Favorit hinzufügen")).toBeTruthy();
  });

  it("does not show empty state when favorites exist", () => {
    useSettingsStore.setState({
      favorites: [makeFavorite()],
    });

    render(<FavoritesList onQuickStart={vi.fn()} />);
    expect(screen.queryByText("Ordner hinzufügen für Schnellstart")).toBeNull();
  });
});
