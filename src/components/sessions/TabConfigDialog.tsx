/**
 * TabConfigDialog — modal for managing the per-project tab-bar config.
 *
 * Spec §6.2. Pure store-bound (no IPC). Renders the full list of known
 * tabs (sortable), per-row visibility checkbox, a "wartet auf Artefakt"
 * pill for tabs whose `requiresPresence` artifact is missing, and footer
 * actions for "Als Default speichern" / "Reset" / "Schließen".
 */
import { useEffect, useMemo, type CSSProperties } from "react";
import { X, GripVertical } from "lucide-react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSettingsStore, normalizeProjectKey } from "../../store/settingsStore";
import { type PresenceMap, type TabId } from "../../store/tabConfig";
import { CONFIG_TABS_BY_ID, meetsPresence, type ConfigTab } from "./configPanelShared";

interface TabConfigDialogProps {
  folder: string;
  presence: PresenceMap | null;
  onClose: () => void;
}

export function TabConfigDialog({ folder, presence, onClose }: TabConfigDialogProps) {
  const defaultTabConfig = useSettingsStore((s) => s.defaultTabConfig);
  const projectTabOverrides = useSettingsStore((s) => s.projectTabOverrides);
  const setDefaultTabConfig = useSettingsStore((s) => s.setDefaultTabConfig);
  const setProjectTabOverride = useSettingsStore((s) => s.setProjectTabOverride);
  const resetProjectTabOverride = useSettingsStore((s) => s.resetProjectTabOverride);

  const overrideKey = normalizeProjectKey(folder);
  const hasOverride = overrideKey in projectTabOverrides;

  // Effective config for THIS project — the dialog edits this view.
  const effective = useMemo(() => {
    const override = projectTabOverrides[overrideKey] ?? {};
    return {
      order: [...(override.order ?? defaultTabConfig.order)] as TabId[],
      hidden: [...(override.hidden ?? defaultTabConfig.hidden)] as TabId[],
    };
  }, [overrideKey, projectTabOverrides, defaultTabConfig]);

  // ESC + click-outside to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = effective.order.indexOf(active.id as TabId);
    const newIndex = effective.order.indexOf(over.id as TabId);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(effective.order, oldIndex, newIndex);
    setProjectTabOverride(folder, { order: next });
  };

  const handleToggleVisibility = (tabId: TabId) => {
    const currentlyHidden = effective.hidden.includes(tabId);
    const nextHidden = currentlyHidden
      ? effective.hidden.filter((id) => id !== tabId)
      : [...effective.hidden, tabId];
    setProjectTabOverride(folder, { hidden: nextHidden });
  };

  const handleSaveAsDefault = () => {
    setDefaultTabConfig({ order: effective.order, hidden: effective.hidden });
  };

  const handleResetOverride = () => {
    resetProjectTabOverride(folder);
  };

  // Count tabs that ARE visible (not in hidden). Constraint: ≥ 1 visible.
  const visibleCount = effective.order.filter((id) => !effective.hidden.includes(id)).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Tab-Leiste konfigurieren"
    >
      <div className="bg-neutral-900 border border-neutral-700 w-[480px] max-h-[80vh] flex flex-col">
        {/* Header — main padding */}
        <div className="px-4 py-3 border-b border-neutral-700 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-300">
            Tab-Leiste konfigurieren
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-200 transition-colors"
            aria-label="Schliessen"
            title="Schliessen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sortable list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={effective.order} strategy={verticalListSortingStrategy}>
              {effective.order.map((tabId) => {
                const tab = CONFIG_TABS_BY_ID[tabId];
                if (!tab) return null;
                const isHidden = effective.hidden.includes(tabId);
                const isLastVisible = !isHidden && visibleCount === 1;
                const artifactMissing = !meetsPresence(tab, presence);
                return (
                  <SortableTabRow
                    key={tabId}
                    tab={tab}
                    tabId={tabId}
                    isHidden={isHidden}
                    isLastVisible={isLastVisible}
                    artifactMissing={artifactMissing}
                    onToggleVisibility={() => handleToggleVisibility(tabId)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-neutral-700 flex items-center justify-end gap-2">
          <button
            onClick={handleSaveAsDefault}
            className="px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-a10 border border-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Als Default speichern
          </button>
          <button
            onClick={handleResetOverride}
            disabled={!hasOverride}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-hover-overlay border border-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={hasOverride ? "Projekt-Override löschen" : "Kein Projekt-Override vorhanden"}
          >
            Override zurücksetzen
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-hover-overlay border border-neutral-700 transition-colors"
          >
            Schliessen
          </button>
        </div>
      </div>
    </div>
  );
}

interface SortableTabRowProps {
  tab: ConfigTab;
  tabId: TabId;
  isHidden: boolean;
  isLastVisible: boolean;
  artifactMissing: boolean;
  onToggleVisibility: () => void;
}

function SortableTabRow({
  tab,
  tabId,
  isHidden,
  isLastVisible,
  artifactMissing,
  onToggleVisibility,
}: SortableTabRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tabId });
  const Icon = tab.icon;
  const checkboxDisabled = isLastVisible && !isHidden;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-2 hover:bg-hover-overlay border border-transparent hover:border-neutral-700 transition-colors"
      data-tab-row={tabId}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-neutral-500 hover:text-neutral-300 cursor-grab active:cursor-grabbing"
        aria-label={`${tab.label} verschieben`}
        title="Ziehen, um zu verschieben"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Icon className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
      <span className="text-xs text-neutral-200 flex-1">{tab.label}</span>
      {artifactMissing && (
        <span
          className="text-[10px] uppercase tracking-wide text-neutral-400 px-1.5 py-0.5 border border-neutral-700"
          title="Artefakt fehlt im Projekt"
        >
          wartet auf Artefakt
        </span>
      )}
      <label
        className={`flex items-center gap-1.5 text-xs ${
          checkboxDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
        }`}
        title={checkboxDisabled ? "Mindestens ein Tab muss sichtbar bleiben" : undefined}
      >
        <input
          type="checkbox"
          checked={!isHidden}
          disabled={checkboxDisabled}
          onChange={onToggleVisibility}
          aria-label={`${tab.label} ${isHidden ? "einblenden" : "verstecken"}`}
        />
        <span className="text-neutral-400">Sichtbar</span>
      </label>
    </div>
  );
}
