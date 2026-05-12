import { useState, useRef, useEffect, useMemo, Fragment, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { X, Plus, Pin, Settings2, EyeOff, Eye } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useUIStore, type ConfigSubTab } from "../../store/uiStore";
import { useSettingsStore, normalizeProjectKey } from "../../store/settingsStore";
import { getTabsForProject, type PresenceMap, type TabId } from "../../store/tabConfig";
import { logError } from "../../utils/errorLogger";
import { type ConfigTab } from "./configPanelShared";
import { TabConfigDialog } from "./TabConfigDialog";

interface ConfigPanelTabListProps {
  folder: string;
  /** Tab size variant — ConfigPanel uses "md", FavoritePreview uses "sm" */
  size?: "sm" | "md";
  /**
   * Whether this instance owns the canonical tab state.
   * Only the primary instance is allowed to auto-switch the global
   * `configSubTab` when its current value isn't visible for the folder.
   * Non-primary instances (e.g. FavoritePreview) must not mutate the
   * shared store on mount — otherwise they hijack the main panel's tab.
   */
  isPrimary?: boolean;
}

/**
 * Renders the tab buttons (fixed tabs + user pins + add-pin button) shared
 * between ConfigPanel (split-view) and FavoritePreview (favorite preview).
 *
 * Uses `uiStore.configSubTab` so tab selection stays consistent across views.
 * File-picking, pin add/remove and toasts are handled here.
 */
export function ConfigPanelTabList({ folder, size = "md", isPrimary = true }: ConfigPanelTabListProps) {
  const configSubTab = useUIStore((s) => s.configSubTab);
  const setConfigSubTabRaw = useUIStore((s) => s.setConfigSubTab);
  const addToast = useUIStore((s) => s.addToast);
  const hasDirtyEditor = useUIStore((s) => s.hasDirtyEditor);

  /** Tab-switch with unsaved-changes guard. */
  const setConfigSubTab = (newTab: ConfigSubTab) => {
    if (hasDirtyEditor && newTab !== configSubTab) {
      const ok = window.confirm(
        "Ungespeicherte Änderungen gehen verloren. Wirklich wechseln?"
      );
      if (!ok) return;
    }
    setConfigSubTabRaw(newTab);
  };

  const pins = useSettingsStore(
    (s) => s.pinnedDocs[normalizeProjectKey(folder)] ?? []
  );
  const addPinnedDoc = useSettingsStore((s) => s.addPinnedDoc);
  const removePinnedDoc = useSettingsStore((s) => s.removePinnedDoc);
  const renamePinnedDoc = useSettingsStore((s) => s.renamePinnedDoc);

  // Inline-Edit state for pin labels
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + select when edit mode starts
  useEffect(() => {
    if (editingPinId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingPinId]);

  const startRename = (pinId: string, currentLabel: string) => {
    setEditingPinId(pinId);
    setEditValue(currentLabel);
  };

  const commitRename = () => {
    if (!editingPinId) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      renamePinnedDoc(folder, editingPinId, trimmed);
    }
    setEditingPinId(null);
    setEditValue("");
  };

  const cancelRename = () => {
    setEditingPinId(null);
    setEditValue("");
  };

  // ── Presence detection ─────────────────────────────────────────────────
  // Check which context artifacts exist in the folder so we can hide empty tabs.
  // While detection is in flight (presence === null), all tabs remain visible to
  // avoid a layout flash on first render.
  const [presence, setPresence] = useState<PresenceMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!folder) { setPresence(null); return; }

    (async () => {
      // Resolve to the main working tree root — worktree sessions may point to a
      // branch-specific path that lacks the context artifacts (CLAUDE.md, .claude/...).
      // Mirrors the resolution done in ClaudeMdViewer.load/save.
      const resolvedFolder = await invoke<string>("resolve_project_root", { folder }).catch(() => folder);
      if (cancelled) return;

      const [claudeMdText, skillDirs, agentFiles, settingsText, projectPresence] = await Promise.all([
        invoke<string>("read_project_file", { folder: resolvedFolder, relativePath: "CLAUDE.md" }).catch(() => ""),
        invoke<unknown[]>("list_skill_dirs", { folder: resolvedFolder }).catch(() => [] as unknown[]),
        invoke<string[]>("list_project_dir", { folder: resolvedFolder, relativePath: ".claude/agents" })
          .then((files) => files.filter((f) => f.endsWith(".md")))
          .catch(() => [] as string[]),
        invoke<string>("read_project_file", { folder: resolvedFolder, relativePath: ".claude/settings.json" }).catch(() => ""),
        invoke<{ has_git: boolean; has_github: boolean; remote_url: string | null }>(
          "check_project_presence", { folder: resolvedFolder }
        ).catch(() => ({ has_git: false, has_github: false, remote_url: null })),
      ]);

      if (cancelled) return;

      let hasHooks = false;
      try {
        const parsed = JSON.parse(settingsText || "{}") as Record<string, unknown>;
        const hooksObj = parsed?.hooks;
        hasHooks = !!hooksObj && typeof hooksObj === "object" && Object.keys(hooksObj).length > 0;
      } catch { /* not valid JSON — no hooks */ }

      setPresence({
        claudeMd: !!claudeMdText,
        skills: (skillDirs as unknown[]).length > 0,
        agents: agentFiles.length > 0,
        hooks: hasHooks,
        settings: !!settingsText,
        git: projectPresence.has_git,
        github: projectPresence.has_github,
      });
    })();

    return () => { cancelled = true; };
  }, [folder]);

  const defaultTabConfig = useSettingsStore((s) => s.defaultTabConfig);
  const projectTabOverrides = useSettingsStore((s) => s.projectTabOverrides);
  const setProjectTabOverride = useSettingsStore((s) => s.setProjectTabOverride);

  const visibleTabs = useMemo(
    () => getTabsForProject(folder, presence, defaultTabConfig, projectTabOverrides),
    [folder, presence, defaultTabConfig, projectTabOverrides],
  );

  // Right-click context menu state (single, project-scoped)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: TabId;
    isCurrentlyHidden: boolean;
  } | null>(null);

  // Dialog open state
  const [dialogOpen, setDialogOpen] = useState(false);

  // dnd-kit sensors: pointer + 6px activation distance so a normal
  // tab-switch click is unaffected.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Effective override-or-default order — used for dnd reorder math so the
  // resulting `order: TabId[]` always covers ALL known TabIds (sichtbare
  // PLUS versteckte), preserving Spec §6.1 invariant.
  const overrideKey = normalizeProjectKey(folder);
  const effectiveOrder = useMemo<TabId[]>(() => {
    const override = projectTabOverrides[overrideKey] ?? {};
    return [...(override.order ?? defaultTabConfig.order)];
  }, [overrideKey, projectTabOverrides, defaultTabConfig]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = effectiveOrder.indexOf(active.id as TabId);
    const newIndex = effectiveOrder.indexOf(over.id as TabId);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(effectiveOrder, oldIndex, newIndex);
    setProjectTabOverride(folder, { order: next });
  };

  const setHiddenForTab = (tabId: TabId, hide: boolean) => {
    const currentHidden =
      projectTabOverrides[overrideKey]?.hidden ?? defaultTabConfig.hidden;
    const nextHidden = hide
      ? (currentHidden.includes(tabId) ? currentHidden : [...currentHidden, tabId])
      : currentHidden.filter((id) => id !== tabId);
    setProjectTabOverride(folder, { hidden: nextHidden });
    setContextMenu(null);
  };

  // Close context menu on outside click / Esc
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  // Auto-switch away from a now-hidden tab when session folder changes.
  // Gated on isPrimary so a non-primary instance (FavoritePreview) cannot
  // hijack the main panel's tab via the shared uiStore.
  useEffect(() => {
    if (!isPrimary) return;
    if (presence === null) return;
    const isActiveVisible = visibleTabs.some((t) => t.id === configSubTab);
    const isPinned = configSubTab.startsWith("pin:");
    if (!isActiveVisible && !isPinned) {
      setConfigSubTabRaw(visibleTabs[0]?.id ?? "github");
    }
  }, [isPrimary, presence, visibleTabs, configSubTab, setConfigSubTabRaw]);

  const buttonPadding = size === "sm" ? "px-2.5 py-1" : "px-2 py-1";
  const iconSize = "w-3 h-3";
  const textSize = "text-[11px]";

  const handleAddPin = async () => {
    try {
      const filePath = await open({
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        multiple: false,
        defaultPath: folder,
        title: "Markdown-Datei zum Anpinnen auswählen",
      });
      if (!filePath || typeof filePath !== "string") return;

      // Derive relativePath by stripping folder prefix
      const normalizedFile = filePath.replace(/\\/g, "/");
      const normalizedFolder = folder.replace(/\\/g, "/").replace(/\/+$/, "");
      if (!normalizedFile.toLowerCase().startsWith(normalizedFolder.toLowerCase() + "/")) {
        addToast({
          type: "error",
          title: "Datei außerhalb des Projekts",
          message: "Nur Dateien innerhalb des Projektordners können angepinnt werden.",
        });
        return;
      }
      const relativePath = normalizedFile.slice(normalizedFolder.length + 1);

      const err = addPinnedDoc(folder, relativePath);
      if (err) {
        addToast({ type: "error", title: "Pin fehlgeschlagen", message: err });
        return;
      }

      // Activate the newly created pin
      const updated = useSettingsStore.getState().pinnedDocs?.[normalizeProjectKey(folder)] ?? [];
      const newPin = updated.find((p) => p.relativePath === relativePath.replace(/\\/g, "/"));
      if (newPin) {
        setConfigSubTab(`pin:${newPin.id}`);
      }
      addToast({ type: "success", title: "Angepinnt", message: relativePath });
    } catch (e) {
      logError("ConfigPanelTabList.handleAddPin", e);
      addToast({ type: "error", title: "Pin fehlgeschlagen", message: String(e) });
    }
  };

  const handleRemovePin = (pinId: string, label: string) => {
    removePinnedDoc(folder, pinId);
    // If the removed pin was active, switch to the first visible tab.
    // Use raw setter to bypass dirty-guard (user removed the pin intentionally).
    if (configSubTab === `pin:${pinId}`) {
      setConfigSubTabRaw(visibleTabs[0]?.id ?? "github");
    }
    addToast({ type: "info", title: "Pin entfernt", message: label });
  };

  // Primary instances get DnD + gear icon. Secondary (FavoritePreview)
  // renders a plain non-sortable list to avoid hijacking the global
  // store state on hover.
  const renderTab = (tab: ConfigTab, idx: number) => {
    const Icon = tab.icon;
    const isActive = configSubTab === tab.id;
    const prevGroup = idx > 0 ? visibleTabs[idx - 1].group : null;
    const showSeparator = prevGroup !== null && prevGroup !== tab.group;
    return (
      <Fragment key={tab.id}>
        {showSeparator && (
          <div className="w-px h-4 bg-neutral-700 shrink-0 mx-0.5" />
        )}
        {isPrimary ? (
          <SortableTabButton
            tab={tab}
            isActive={isActive}
            buttonPadding={buttonPadding}
            iconSize={iconSize}
            textSize={textSize}
            onSelect={() => setConfigSubTab(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              const hiddenList = projectTabOverrides[overrideKey]?.hidden ?? defaultTabConfig.hidden;
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                tabId: tab.id as TabId,
                isCurrentlyHidden: hiddenList.includes(tab.id as TabId),
              });
            }}
          />
        ) : (
          <button
            onClick={() => setConfigSubTab(tab.id)}
            className={`flex items-center gap-1 ${buttonPadding} ${textSize} font-medium rounded-sm whitespace-nowrap transition-colors ${
              isActive
                ? "text-accent bg-accent-a10"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay"
            }`}
            title={tab.label}
          >
            <Icon className={`${iconSize} shrink-0`} />
            {tab.label}
          </button>
        )}
      </Fragment>
    );
  };

  return (
    <>
      {isPrimary ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={visibleTabs.map((t) => t.id)}
            strategy={horizontalListSortingStrategy}
          >
            {visibleTabs.map(renderTab)}
          </SortableContext>
        </DndContext>
      ) : (
        visibleTabs.map(renderTab)
      )}

      {/* User-pinned docs */}
      {pins.length > 0 && (
        <div className="w-px h-4 bg-neutral-700 shrink-0 mx-0.5" />
      )}
      {pins.map((pin) => {
        const tabId: ConfigSubTab = `pin:${pin.id}`;
        const isActive = configSubTab === tabId;
        const isEditing = editingPinId === pin.id;
        return (
          <div
            key={pin.id}
            className={`group flex items-center gap-0.5 rounded-sm whitespace-nowrap transition-colors ${
              isActive
                ? "text-accent bg-accent-a10"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay"
            }`}
          >
            {isEditing ? (
              <div className={`flex items-center gap-1 pl-2 py-1 ${textSize}`}>
                <Pin className={`${iconSize} shrink-0`} />
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                  className={`${textSize} font-medium bg-transparent border border-accent rounded-sm px-1 outline-none min-w-[60px] max-w-[200px]`}
                  maxLength={64}
                  aria-label="Pin-Label bearbeiten"
                />
              </div>
            ) : (
              <button
                onClick={() => setConfigSubTab(tabId)}
                onDoubleClick={() => startRename(pin.id, pin.label)}
                className={`flex items-center gap-1 pl-2 py-1 ${textSize} font-medium`}
                title={`${pin.relativePath}\n(Doppelklick zum Umbenennen)`}
              >
                <Pin className={`${iconSize} shrink-0`} />
                {pin.label}
              </button>
            )}
            {!isEditing && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemovePin(pin.id, pin.label);
                }}
                className="p-0.5 pr-1.5 text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Pin entfernen"
                aria-label={`Pin ${pin.label} entfernen`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        );
      })}

      {/* Add pin button */}
      <button
        onClick={handleAddPin}
        className={`flex items-center gap-1 px-1.5 py-1 ${textSize} rounded-sm whitespace-nowrap text-neutral-500 hover:text-accent hover:bg-accent-a10 transition-colors`}
        title="Markdown-Datei anpinnen"
        aria-label="Markdown-Datei anpinnen"
      >
        <Plus className={iconSize} />
      </button>

      {/* Gear icon — opens TabConfigDialog. Primary instance only. */}
      {isPrimary && (
        <button
          onClick={() => setDialogOpen(true)}
          className={`flex items-center gap-1 px-1.5 py-1 ${textSize} rounded-sm whitespace-nowrap text-neutral-500 hover:text-accent hover:bg-accent-a10 transition-colors ml-auto`}
          title="Tab-Leiste konfigurieren"
          aria-label="Tab-Leiste konfigurieren"
        >
          <Settings2 className={iconSize} />
        </button>
      )}

      {/* Right-click context menu (renders into normal flow, position: fixed) */}
      {contextMenu && (
        <div
          role="menu"
          aria-label="Tab-Aktionen"
          className="fixed z-50 bg-neutral-900 border border-neutral-700 shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            onClick={() => setHiddenForTab(contextMenu.tabId, !contextMenu.isCurrentlyHidden)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-neutral-300 hover:bg-hover-overlay hover:text-neutral-100 transition-colors"
          >
            {contextMenu.isCurrentlyHidden ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                Wieder einblenden
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                Tab verstecken
              </>
            )}
          </button>
        </div>
      )}

      {/* Config dialog */}
      {isPrimary && dialogOpen && (
        <TabConfigDialog
          folder={folder}
          presence={presence}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}

// ============================================================================
// Sortable tab button — single tab rendered as a dnd-kit sortable.
// ============================================================================

interface SortableTabButtonProps {
  tab: ConfigTab;
  isActive: boolean;
  buttonPadding: string;
  iconSize: string;
  textSize: string;
  onSelect: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
}

function SortableTabButton({
  tab,
  isActive,
  buttonPadding,
  iconSize,
  textSize,
  onSelect,
  onContextMenu,
}: SortableTabButtonProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.id });
  const Icon = tab.icon;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1 ${buttonPadding} ${textSize} font-medium rounded-sm whitespace-nowrap transition-colors ${
        isActive
          ? "text-accent bg-accent-a10"
          : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay"
      }`}
      title={tab.label}
      data-tab-id={tab.id}
    >
      <Icon className={`${iconSize} shrink-0`} />
      {tab.label}
    </button>
  );
}
