import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { LibraryViewer } from "./LibraryViewer";
import { useLibraryStore } from "../../store/libraryStore";

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockItem1 = {
  id: "skill-1",
  name: "UI Rework Guide",
  item_type: "skill" as const,
  tags: ["design", "frontend"],
  description: "A guide for UI rework",
  created: "2026-04-01",
  file_name: "skill-1.md",
};

const mockItem2 = {
  id: "agent-1",
  name: "Architect Agent",
  item_type: "agent-profile" as const,
  tags: ["planning"],
  description: "Planning agent profile",
  created: "2026-04-02",
  file_name: "agent-1.md",
};

const mockItem3 = {
  id: "hook-1",
  name: "Pre-commit Hook",
  item_type: "hook" as const,
  tags: ["ci"],
  description: "Runs before commit",
  created: "2026-04-03",
  file_name: "hook-1.md",
};

describe("LibraryViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to clean state
    useLibraryStore.setState({
      items: [],
      selectedItemId: null,
      loadedContent: {},
      usage: {},
      loading: false,
      lastFetched: null,
    });
  });

  it("shows loading state when loading with no items", () => {
    useLibraryStore.setState({ loading: true, items: [], fetchItems: vi.fn() });
    render(<LibraryViewer />);
    expect(screen.getByText("Lade Library...")).toBeInTheDocument();
  });

  it("shows empty state when library is empty", () => {
    useLibraryStore.setState({ loading: false, items: [], fetchItems: vi.fn() });
    render(<LibraryViewer />);
    expect(screen.getByText("Library ist leer")).toBeInTheDocument();
    expect(screen.getByText("~/.claude/library/items/")).toBeInTheDocument();
  });

  it("renders item list with correct counts", () => {
    useLibraryStore.setState({
      loading: false,
      items: [mockItem1, mockItem2, mockItem3],
      fetchItems: vi.fn(),
    });
    render(<LibraryViewer />);

    expect(screen.getByText("Library (3)")).toBeInTheDocument();
    expect(screen.getByText("UI Rework Guide")).toBeInTheDocument();
    expect(screen.getByText("Architect Agent")).toBeInTheDocument();
    expect(screen.getByText("Pre-commit Hook")).toBeInTheDocument();
  });

  it("filters items by type", () => {
    useLibraryStore.setState({
      loading: false,
      items: [mockItem1, mockItem2, mockItem3],
      fetchItems: vi.fn(),
    });
    render(<LibraryViewer />);

    // Click "Skill" filter — there are multiple "Skill" texts (filter button + type badge)
    // Use getAllByText and click the filter button (first occurrence)
    const skillButtons = screen.getAllByText("Skill");
    fireEvent.click(skillButtons[0]); // filter button

    // Only skill item should remain visible in the list
    expect(screen.getByText("UI Rework Guide")).toBeInTheDocument();
    expect(screen.queryByText("Architect Agent")).not.toBeInTheDocument();
    expect(screen.queryByText("Pre-commit Hook")).not.toBeInTheDocument();
  });

  it("filters items by search query", () => {
    useLibraryStore.setState({
      loading: false,
      items: [mockItem1, mockItem2, mockItem3],
      fetchItems: vi.fn(),
    });
    render(<LibraryViewer />);

    const searchInput = screen.getByPlaceholderText("Suchen...");
    fireEvent.change(searchInput, { target: { value: "architect" } });

    expect(screen.queryByText("UI Rework Guide")).not.toBeInTheDocument();
    expect(screen.getByText("Architect Agent")).toBeInTheDocument();
  });

  it("selects item and shows detail view", async () => {
    const mockSelectItem = vi.fn();
    const mockLoadItemContent = vi.fn();
    useLibraryStore.setState({
      loading: false,
      items: [mockItem1, mockItem2],
      selectedItemId: "skill-1",
      loadedContent: {
        "skill-1": {
          meta: mockItem1,
          content: "raw content",
          body: "# UI Rework Guide\n\nDetailed content here.",
        },
      },
      usage: {},
      fetchItems: vi.fn(),
      selectItem: mockSelectItem,
      loadItemContent: mockLoadItemContent,
    });

    render(<LibraryViewer folder="/test/project" />);

    // Detail view should show the selected item — description appears in both list and detail
    await waitFor(() => {
      expect(screen.getAllByText("A guide for UI rework").length).toBeGreaterThanOrEqual(1);
    });
    // Body content is in a <pre> element
    expect(screen.getByText(/Detailed content here/)).toBeInTheDocument();
  });

  it("shows placeholder when no item is selected", () => {
    useLibraryStore.setState({
      loading: false,
      items: [mockItem1],
      selectedItemId: null,
      fetchItems: vi.fn(),
    });
    render(<LibraryViewer />);
    expect(screen.getByText("Item auswählen")).toBeInTheDocument();
  });

  it("shows 'Keine Items gefunden' when filters match nothing", () => {
    useLibraryStore.setState({
      loading: false,
      items: [mockItem1],
      fetchItems: vi.fn(),
    });
    render(<LibraryViewer />);

    const searchInput = screen.getByPlaceholderText("Suchen...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    expect(screen.getByText("Keine Items gefunden")).toBeInTheDocument();
  });

  it("shows new item form when clicking Neues Item button", () => {
    useLibraryStore.setState({
      loading: false,
      items: [],
      fetchItems: vi.fn(),
    });
    render(<LibraryViewer />);

    fireEvent.click(screen.getByText("Neues Item"));
    expect(screen.getByText("Neues Library-Item")).toBeInTheDocument();
  });

  it("shows usage count for items with usage data", () => {
    useLibraryStore.setState({
      loading: false,
      items: [mockItem1],
      usage: { "skill-1": ["/project/a", "/project/b"] },
      fetchItems: vi.fn(),
    });
    render(<LibraryViewer />);

    expect(screen.getByText("2x")).toBeInTheDocument();
  });
});
