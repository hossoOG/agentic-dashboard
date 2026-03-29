import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  BookOpen,
  Copy,
  Link,
  Unlink,
  Trash2,
  Plus,
  FolderOpen,
} from "lucide-react";
import { logError } from "../../utils/errorLogger";
import {
  useLibraryStore,
  type LibraryItemMeta,
  type LibraryItemFull,
  type LibraryItemType,
} from "../../store/libraryStore";
import { useUIStore } from "../../store/uiStore";

interface LibraryViewerProps {
  folder?: string;
}

const TYPE_LABELS: Record<LibraryItemType, string> = {
  skill: "Skill",
  "agent-profile": "Agent",
  hook: "Hook",
  template: "Template",
  prompt: "Prompt",
  other: "Sonstige",
};

const TYPE_COLORS: Record<LibraryItemType, string> = {
  skill: "bg-accent-a10 text-accent",
  "agent-profile": "bg-purple-500/15 text-purple-400",
  hook: "bg-amber-500/15 text-amber-400",
  template: "bg-blue-500/15 text-blue-400",
  prompt: "bg-green-500/15 text-green-400",
  other: "bg-neutral-800 text-neutral-500",
};

type TypeFilter = "alle" | LibraryItemType;

export function LibraryViewer({ folder = "" }: LibraryViewerProps) {
  const items = useLibraryStore((s) => s.items);
  const selectedItemId = useLibraryStore((s) => s.selectedItemId);
  const usage = useLibraryStore((s) => s.usage);
  const loading = useLibraryStore((s) => s.loading);
  const fetchItems = useLibraryStore((s) => s.fetchItems);
  const selectItem = useLibraryStore((s) => s.selectItem);
  const rebuildIndex = useLibraryStore((s) => s.rebuildIndex);

  const [filter, setFilter] = useState<TypeFilter>("alle");
  const [search, setSearch] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const filteredItems = useMemo(() => {
    let result = items;

    if (filter !== "alle") {
      result = result.filter((i) => i.item_type === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [items, filter, search]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const handleRefresh = useCallback(async () => {
    await rebuildIndex();
  }, [rebuildIndex]);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Library...
      </div>
    );
  }

  if (items.length === 0 && !showNewForm) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <BookOpen className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Library ist leer</span>
        <span className="text-xs text-neutral-600">
          ~/.claude/library/items/
        </span>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent-a10 text-accent rounded hover:bg-accent-a20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Neues Item
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 border border-neutral-700 rounded hover:bg-hover-overlay transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Index neu aufbauen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left column — item list */}
      <div className="w-64 min-w-[256px] border-r border-neutral-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 shrink-0">
          <span className="text-xs text-neutral-400 font-medium">
            Library ({items.length})
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewForm(true)}
              className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
              title="Neues Item"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              className={`p-1 text-neutral-500 hover:text-neutral-300 transition-colors ${
                loading ? "animate-spin" : ""
              }`}
              title="Neu laden"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-3 py-2 border-b border-neutral-700 space-y-2 shrink-0">
          <div className="flex gap-1 flex-wrap">
            {(
              [
                "alle",
                "skill",
                "agent-profile",
                "hook",
                "template",
                "prompt",
              ] as TypeFilter[]
            ).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                  filter === f
                    ? "bg-accent-a10 text-accent"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay"
                }`}
              >
                {f === "alle" ? "Alle" : TYPE_LABELS[f]}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-base border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
          />
        </div>

        {/* Item cards */}
        <div className="flex-1 overflow-auto">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-4 text-xs text-neutral-500 text-center">
              Keine Items gefunden
            </div>
          ) : (
            filteredItems.map((item) => {
              const isActive = selectedItemId === item.id;
              const usageCount = (usage[item.id] ?? []).length;
              return (
                <button
                  key={item.id}
                  onClick={() => selectItem(item.id)}
                  className={`w-full text-left px-3 py-2 transition-colors border-l-2 ${
                    isActive
                      ? "border-accent bg-accent-a10"
                      : "border-transparent hover:bg-hover-overlay"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold truncate ${
                        isActive ? "text-accent" : "text-neutral-200"
                      }`}
                    >
                      {item.name}
                    </span>
                    {usageCount > 0 && (
                      <span className="text-[10px] text-neutral-500 shrink-0">
                        {usageCount}x
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <div className="text-xs text-neutral-400 truncate mt-0.5">
                      {item.description}
                    </div>
                  )}
                  <div className="flex items-center gap-1 mt-1">
                    <span
                      className={`inline-block px-1.5 py-0 text-[10px] rounded-full ${
                        TYPE_COLORS[item.item_type]
                      }`}
                    >
                      {TYPE_LABELS[item.item_type]}
                    </span>
                    {item.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="inline-block px-1.5 py-0 text-[10px] rounded-full bg-neutral-800 text-neutral-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right column — detail */}
      <div className="flex-1 overflow-auto p-4">
        {showNewForm ? (
          <NewItemForm
            onClose={() => setShowNewForm(false)}
            onCreated={(id) => {
              setShowNewForm(false);
              selectItem(id);
            }}
          />
        ) : selectedItem ? (
          <ItemDetail item={selectedItem} folder={folder} />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            Item auswaehlen
          </div>
        )}
      </div>
    </div>
  );
}

// ── Item Detail ────────────────────────────────────────────────────────

function ItemDetail({
  item,
  folder,
}: {
  item: LibraryItemMeta;
  folder: string;
}) {
  const loadItemContent = useLibraryStore((s) => s.loadItemContent);
  const loadedContent = useLibraryStore((s) => s.loadedContent);
  const usage = useLibraryStore((s) => s.usage);
  const attachToProject = useLibraryStore((s) => s.attachToProject);
  const detachFromProject = useLibraryStore((s) => s.detachFromProject);
  const deleteItem = useLibraryStore((s) => s.deleteItem);
  const addToast = useUIStore((s) => s.addToast);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const content = loadedContent[item.id] as LibraryItemFull | undefined;
  const itemUsage = usage[item.id] ?? [];
  const normalizedFolder = folder.replace(/\\/g, "/").toLowerCase();
  const isAttached = itemUsage.includes(normalizedFolder);

  useEffect(() => {
    loadItemContent(item.id);
    setConfirmDelete(false);
  }, [item.id]);

  const handleCopyPath = async () => {
    try {
      const path = await invoke<string>("get_library_item_path", {
        id: item.id,
      });
      await navigator.clipboard.writeText(path);
      addToast({
        type: "info",
        title: "Pfad kopiert",
        message: path,
      });
    } catch (err) {
      logError("LibraryViewer.copyPath", err);
    }
  };

  const handleToggleAttach = async () => {
    if (!folder) return;
    if (isAttached) {
      await detachFromProject(item.id, folder);
      addToast({ type: "info", title: `"${item.name}" getrennt` });
    } else {
      await attachToProject(item.id, folder);
      addToast({ type: "info", title: `"${item.name}" verknuepft` });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteItem(item.id);
    addToast({ type: "info", title: `"${item.name}" geloescht` });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-neutral-200">
            {item.name}
          </h2>
          <span
            className={`inline-block px-1.5 py-0 text-[10px] rounded-full ${
              TYPE_COLORS[item.item_type]
            }`}
          >
            {TYPE_LABELS[item.item_type]}
          </span>
        </div>
        {item.description && (
          <p className="text-sm text-neutral-400">{item.description}</p>
        )}
        {item.tags.length > 0 && (
          <div className="flex gap-1 mt-2">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="inline-block px-1.5 py-0.5 text-[10px] rounded-full bg-neutral-800 text-neutral-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopyPath}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-300 border border-neutral-700 rounded hover:bg-hover-overlay transition-colors"
          title="Pfad in Zwischenablage kopieren"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy Path
        </button>
        {folder && (
          <button
            onClick={handleToggleAttach}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors ${
              isAttached
                ? "text-amber-400 border border-amber-500/30 hover:bg-amber-500/10"
                : "text-accent border border-accent/30 hover:bg-accent-a10"
            }`}
          >
            {isAttached ? (
              <>
                <Unlink className="w-3.5 h-3.5" />
                Trennen
              </>
            ) : (
              <>
                <Link className="w-3.5 h-3.5" />
                Verknuepfen
              </>
            )}
          </button>
        )}
        <button
          onClick={handleDelete}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors ${
            confirmDelete
              ? "text-red-400 bg-red-500/15 border border-red-500/30"
              : "text-neutral-500 border border-neutral-700 hover:text-red-400 hover:border-red-500/30"
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {confirmDelete ? "Wirklich loeschen?" : "Loeschen"}
        </button>
      </div>

      {/* Usage */}
      {itemUsage.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Verwendet in ({itemUsage.length})
          </h3>
          <div className="space-y-1">
            {itemUsage.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface-raised rounded text-xs"
              >
                <FolderOpen className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <span className="text-neutral-300 truncate">{path}</span>
                {path === normalizedFolder && (
                  <span className="text-[10px] text-accent shrink-0">
                    aktuell
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {content?.body ? (
        <div>
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Inhalt
          </h3>
          <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed bg-surface-raised rounded p-3 max-h-[60vh] overflow-auto">
            {content.body}
          </pre>
        </div>
      ) : !content ? (
        <div className="text-xs text-neutral-500">Lade Inhalt...</div>
      ) : null}
    </div>
  );
}

// ── New Item Form ──────────────────────────────────────────────────────

function NewItemForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const saveItem = useLibraryStore((s) => s.saveItem);
  const addToast = useUIStore((s) => s.addToast);

  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<LibraryItemType>("skill");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const handleSave = async () => {
    if (!name.trim() || !id) return;
    setSaving(true);

    const today = new Date().toISOString().split("T")[0];
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const content = [
      "---",
      `name: ${name.trim()}`,
      `type: ${itemType}`,
      `description: ${description.trim()}`,
      `tags: [${tagList.join(", ")}]`,
      `created: ${today}`,
      "---",
      "",
      body,
    ].join("\n");

    const meta = await saveItem(id, content);
    setSaving(false);

    if (meta) {
      addToast({ type: "achievement", title: `"${meta.name}" erstellt` });
      onCreated(meta.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-200">
          Neues Library-Item
        </h2>
        <button
          onClick={onClose}
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Abbrechen
        </button>
      </div>

      <div className="space-y-3">
        {/* Name */}
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. UI Rework Guide"
            className="w-full bg-surface-base border border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
            autoFocus
          />
          {id && (
            <span className="text-[10px] text-neutral-600 mt-0.5 block">
              ID: {id}.md
            </span>
          )}
        </div>

        {/* Type */}
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Typ</label>
          <div className="flex gap-1 flex-wrap">
            {(
              Object.entries(TYPE_LABELS) as [LibraryItemType, string][]
            ).map(([type, label]) => (
              <button
                key={type}
                onClick={() => setItemType(type)}
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  itemType === type
                    ? TYPE_COLORS[type]
                    : "text-neutral-400 hover:text-neutral-200 bg-neutral-800 hover:bg-neutral-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-neutral-400 block mb-1">
            Beschreibung
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kurze Beschreibung..."
            className="w-full bg-surface-base border border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs text-neutral-400 block mb-1">
            Tags (Komma-getrennt)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="z.B. design, frontend, workflow"
            className="w-full bg-surface-base border border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
          />
        </div>

        {/* Body */}
        <div>
          <label className="text-xs text-neutral-400 block mb-1">Inhalt</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Markdown-Inhalt des Library Items..."
            rows={12}
            className="w-full bg-surface-base border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500 font-mono resize-y"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!name.trim() || saving}
        className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Speichert..." : "Erstellen"}
      </button>
    </div>
  );
}
