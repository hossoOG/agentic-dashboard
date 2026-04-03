import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { wrapInvoke } from "../utils/perfLogger";
import {
  useLibraryStore,
  selectItemsByType,
  selectUsageForItem,
  selectItemsForProject,
  type LibraryItemMeta,
  type LibraryItemFull,
} from "./libraryStore";

// ── Mocks ─────────────────────────────────────────────────────────────

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../utils/perfLogger", () => ({
  wrapInvoke: vi.fn(),
}));

vi.mock("../utils/errorLogger", () => ({
  logError: vi.fn(),
}));

const mockInvoke = invoke as ReturnType<typeof vi.fn>;
const mockWrapInvoke = wrapInvoke as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────

function makeMeta(overrides: Partial<LibraryItemMeta> = {}): LibraryItemMeta {
  const id = overrides.id ?? `item-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    name: `Item ${id}`,
    item_type: "skill",
    tags: [],
    description: "A test item",
    created: "2026-04-01T00:00:00Z",
    file_name: `${id}.md`,
    ...overrides,
  };
}

function makeFull(
  metaOverrides: Partial<LibraryItemMeta> = {},
  content = "# Content",
  body = "Body text"
): LibraryItemFull {
  return { meta: makeMeta(metaOverrides), content, body };
}

const INITIAL_STATE = {
  items: [],
  selectedItemId: null,
  loadedContent: {},
  usage: {},
  loading: false,
  lastFetched: null,
};

// ── Tests ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState(INITIAL_STATE);
});

// ── fetchItems ────────────────────────────────────────────────────────

describe("fetchItems", () => {
  it("fetches items and usage from Tauri", async () => {
    const items = [makeMeta({ id: "s1" }), makeMeta({ id: "s2" })];
    const index = { items, usage: { s1: ["/proj/a"] }, built_at: 1 };
    mockWrapInvoke.mockResolvedValueOnce(items);
    mockInvoke.mockResolvedValueOnce(index);

    await useLibraryStore.getState().fetchItems();

    expect(mockWrapInvoke).toHaveBeenCalledWith("list_library_items");
    expect(mockInvoke).toHaveBeenCalledWith("rebuild_library_index");
    const state = useLibraryStore.getState();
    expect(state.items).toEqual(items);
    expect(state.usage).toEqual({ s1: ["/proj/a"] });
    expect(state.lastFetched).toBeGreaterThan(0);
    expect(state.loading).toBe(false);
  });

  it("skips fetch when already loading", async () => {
    useLibraryStore.setState({ loading: true });

    await useLibraryStore.getState().fetchItems();

    expect(mockWrapInvoke).not.toHaveBeenCalled();
  });

  it("skips fetch when cache is fresh (within TTL)", async () => {
    useLibraryStore.setState({ lastFetched: Date.now() });

    await useLibraryStore.getState().fetchItems();

    expect(mockWrapInvoke).not.toHaveBeenCalled();
  });

  it("forces fetch even when cache is fresh", async () => {
    useLibraryStore.setState({ lastFetched: Date.now() });
    mockWrapInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce({ items: [], usage: {}, built_at: 1 });

    await useLibraryStore.getState().fetchItems(true);

    expect(mockWrapInvoke).toHaveBeenCalled();
  });

  it("fetches when cache has expired", async () => {
    useLibraryStore.setState({ lastFetched: Date.now() - 60_000 });
    mockWrapInvoke.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValueOnce({ items: [], usage: {}, built_at: 1 });

    await useLibraryStore.getState().fetchItems();

    expect(mockWrapInvoke).toHaveBeenCalled();
  });

  it("sets loading false on error", async () => {
    mockWrapInvoke.mockRejectedValueOnce(new Error("network"));

    await useLibraryStore.getState().fetchItems();

    expect(useLibraryStore.getState().loading).toBe(false);
  });
});

// ── selectItem ────────────────────────────────────────────────────────

describe("selectItem", () => {
  it("sets selectedItemId", () => {
    useLibraryStore.getState().selectItem("item-1");
    expect(useLibraryStore.getState().selectedItemId).toBe("item-1");
  });

  it("clears selectedItemId with null", () => {
    useLibraryStore.setState({ selectedItemId: "item-1" });
    useLibraryStore.getState().selectItem(null);
    expect(useLibraryStore.getState().selectedItemId).toBeNull();
  });
});

// ── loadItemContent ───────────────────────────────────────────────────

describe("loadItemContent", () => {
  it("returns cached content without invoking", async () => {
    const full = makeFull({ id: "c1" });
    useLibraryStore.setState({ loadedContent: { c1: full } });

    const result = await useLibraryStore.getState().loadItemContent("c1");

    expect(result).toEqual(full);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("fetches and caches content from Tauri", async () => {
    const full = makeFull({ id: "c2" });
    mockInvoke.mockResolvedValueOnce(full);

    const result = await useLibraryStore.getState().loadItemContent("c2");

    expect(mockInvoke).toHaveBeenCalledWith("read_library_item", { id: "c2" });
    expect(result).toEqual(full);
    expect(useLibraryStore.getState().loadedContent["c2"]).toEqual(full);
  });

  it("returns null on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("not found"));

    const result = await useLibraryStore.getState().loadItemContent("bad-id");

    expect(result).toBeNull();
  });
});

// ── saveItem ──────────────────────────────────────────────────────────

describe("saveItem", () => {
  it("updates existing item in list and invalidates content cache", async () => {
    const original = makeMeta({ id: "s1", name: "Original" });
    const updated = makeMeta({ id: "s1", name: "Updated" });
    const cachedContent = makeFull({ id: "s1" });
    useLibraryStore.setState({
      items: [original],
      loadedContent: { s1: cachedContent },
    });
    mockInvoke.mockResolvedValueOnce(updated);

    const result = await useLibraryStore.getState().saveItem("s1", "new content");

    expect(result).toEqual(updated);
    const state = useLibraryStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe("Updated");
    // Content cache invalidated
    expect(state.loadedContent["s1"]).toBeUndefined();
  });

  it("adds new item sorted by name when id not in list", async () => {
    const existing = makeMeta({ id: "s1", name: "Bravo" });
    const newItem = makeMeta({ id: "s2", name: "Alpha" });
    useLibraryStore.setState({ items: [existing] });
    mockInvoke.mockResolvedValueOnce(newItem);

    await useLibraryStore.getState().saveItem("s2", "content");

    const names = useLibraryStore.getState().items.map((i) => i.name);
    expect(names).toEqual(["Alpha", "Bravo"]);
  });

  it("returns null on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("save failed"));

    const result = await useLibraryStore.getState().saveItem("x", "content");

    expect(result).toBeNull();
  });
});

// ── deleteItem ────────────────────────────────────────────────────────

describe("deleteItem", () => {
  it("removes item from items, loadedContent, usage, and clears selection if matching", async () => {
    const item = makeMeta({ id: "d1" });
    const full = makeFull({ id: "d1" });
    useLibraryStore.setState({
      items: [item],
      loadedContent: { d1: full },
      usage: { d1: ["/proj"] },
      selectedItemId: "d1",
    });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().deleteItem("d1");

    const state = useLibraryStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.loadedContent["d1"]).toBeUndefined();
    expect(state.usage["d1"]).toBeUndefined();
    expect(state.selectedItemId).toBeNull();
  });

  it("preserves selectedItemId when deleting a different item", async () => {
    useLibraryStore.setState({
      items: [makeMeta({ id: "d1" }), makeMeta({ id: "d2" })],
      selectedItemId: "d2",
    });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().deleteItem("d1");

    expect(useLibraryStore.getState().selectedItemId).toBe("d2");
    expect(useLibraryStore.getState().items).toHaveLength(1);
  });

  it("handles error gracefully", async () => {
    useLibraryStore.setState({ items: [makeMeta({ id: "d1" })] });
    mockInvoke.mockRejectedValueOnce(new Error("delete failed"));

    await useLibraryStore.getState().deleteItem("d1");

    // Items remain unchanged on error
    expect(useLibraryStore.getState().items).toHaveLength(1);
  });
});

// ── rebuildIndex ──────────────────────────────────────────────────────

describe("rebuildIndex", () => {
  it("replaces items, usage, clears content cache", async () => {
    const oldContent = makeFull({ id: "old" });
    useLibraryStore.setState({ loadedContent: { old: oldContent } });

    const newItems = [makeMeta({ id: "n1" })];
    const index = { items: newItems, usage: { n1: ["/proj"] }, built_at: 2 };
    mockInvoke.mockResolvedValueOnce(index);

    await useLibraryStore.getState().rebuildIndex();

    const state = useLibraryStore.getState();
    expect(state.items).toEqual(newItems);
    expect(state.usage).toEqual({ n1: ["/proj"] });
    expect(state.loadedContent).toEqual({});
    expect(state.lastFetched).toBeGreaterThan(0);
    expect(state.loading).toBe(false);
  });

  it("sets loading false on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("rebuild failed"));

    await useLibraryStore.getState().rebuildIndex();

    expect(useLibraryStore.getState().loading).toBe(false);
  });
});

// ── attachToProject ───────────────────────────────────────────────────

describe("attachToProject", () => {
  it("adds normalized path to usage", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().attachToProject("a1", "C:\\Projects\\App");

    const usage = useLibraryStore.getState().usage["a1"];
    expect(usage).toEqual(["c:/projects/app"]);
  });

  it("does not duplicate if path already in usage", async () => {
    useLibraryStore.setState({ usage: { a1: ["c:/projects/app"] } });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().attachToProject("a1", "C:\\Projects\\App");

    expect(useLibraryStore.getState().usage["a1"]).toEqual(["c:/projects/app"]);
  });

  it("appends to existing usage array", async () => {
    useLibraryStore.setState({ usage: { a1: ["/existing"] } });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().attachToProject("a1", "/new-proj");

    expect(useLibraryStore.getState().usage["a1"]).toEqual(["/existing", "/new-proj"]);
  });

  it("calls invoke with original (non-normalized) path", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().attachToProject("a1", "C:\\Foo\\Bar");

    expect(mockInvoke).toHaveBeenCalledWith("attach_library_item", {
      id: "a1",
      projectPath: "C:\\Foo\\Bar",
    });
  });

  it("handles error gracefully", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("attach failed"));

    await useLibraryStore.getState().attachToProject("a1", "/proj");

    // Usage unchanged
    expect(useLibraryStore.getState().usage["a1"]).toBeUndefined();
  });
});

// ── detachFromProject ─────────────────────────────────────────────────

describe("detachFromProject", () => {
  it("removes normalized path from usage", async () => {
    useLibraryStore.setState({ usage: { a1: ["c:/projects/app", "/other"] } });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().detachFromProject("a1", "C:\\Projects\\App");

    expect(useLibraryStore.getState().usage["a1"]).toEqual(["/other"]);
  });

  it("removes usage key entirely when last path removed", async () => {
    useLibraryStore.setState({ usage: { a1: ["c:/projects/app"] } });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().detachFromProject("a1", "C:\\Projects\\App");

    expect(useLibraryStore.getState().usage["a1"]).toBeUndefined();
  });

  it("calls invoke with original path", async () => {
    useLibraryStore.setState({ usage: { a1: ["/proj"] } });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().detachFromProject("a1", "/proj");

    expect(mockInvoke).toHaveBeenCalledWith("detach_library_item", {
      id: "a1",
      projectPath: "/proj",
    });
  });

  it("handles error gracefully", async () => {
    useLibraryStore.setState({ usage: { a1: ["/proj"] } });
    mockInvoke.mockRejectedValueOnce(new Error("detach failed"));

    await useLibraryStore.getState().detachFromProject("a1", "/proj");

    // Usage unchanged on error
    expect(useLibraryStore.getState().usage["a1"]).toEqual(["/proj"]);
  });

  it("no-op when item has no usage entry", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useLibraryStore.getState().detachFromProject("a1", "/proj");

    // Key removed since result is empty
    expect(useLibraryStore.getState().usage["a1"]).toBeUndefined();
  });
});

// ── Selectors ─────────────────────────────────────────────────────────

describe("selectors", () => {
  describe("selectItemsByType", () => {
    it("filters items by type", () => {
      const items = [
        makeMeta({ id: "s1", item_type: "skill" }),
        makeMeta({ id: "s2", item_type: "hook" }),
        makeMeta({ id: "s3", item_type: "skill" }),
      ];
      useLibraryStore.setState({ items });

      const skills = selectItemsByType("skill")(useLibraryStore.getState());
      expect(skills).toHaveLength(2);
      expect(skills.map((i) => i.id)).toEqual(["s1", "s3"]);
    });

    it("returns empty array when no items match", () => {
      useLibraryStore.setState({ items: [makeMeta({ item_type: "skill" })] });

      const result = selectItemsByType("template")(useLibraryStore.getState());
      expect(result).toEqual([]);
    });
  });

  describe("selectUsageForItem", () => {
    it("returns usage paths for item", () => {
      useLibraryStore.setState({ usage: { x: ["/a", "/b"] } });

      expect(selectUsageForItem("x")(useLibraryStore.getState())).toEqual(["/a", "/b"]);
    });

    it("returns empty array when item has no usage", () => {
      expect(selectUsageForItem("missing")(useLibraryStore.getState())).toEqual([]);
    });
  });

  describe("selectItemsForProject", () => {
    it("returns items attached to a project (normalized path match)", () => {
      const items = [
        makeMeta({ id: "i1" }),
        makeMeta({ id: "i2" }),
        makeMeta({ id: "i3" }),
      ];
      useLibraryStore.setState({
        items,
        usage: {
          i1: ["c:/projects/app"],
          i2: ["c:/other"],
          i3: ["c:/projects/app", "/also"],
        },
      });

      const result = selectItemsForProject("C:\\Projects\\App")(
        useLibraryStore.getState()
      );
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(["i1", "i3"]);
    });

    it("returns empty when no items attached to project", () => {
      useLibraryStore.setState({
        items: [makeMeta({ id: "i1" })],
        usage: {},
      });

      const result = selectItemsForProject("/proj")(useLibraryStore.getState());
      expect(result).toEqual([]);
    });
  });
});
