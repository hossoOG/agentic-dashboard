import { X, Plus, Pin } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useUIStore, type ConfigSubTab } from "../../store/uiStore";
import { useSettingsStore, normalizeProjectKey } from "../../store/settingsStore";
import { logError } from "../../utils/errorLogger";
import { CONFIG_TABS } from "./configPanelShared";

interface ConfigPanelTabListProps {
  folder: string;
  /** Tab size variant — ConfigPanel uses "md", FavoritePreview uses "sm" */
  size?: "sm" | "md";
}

/**
 * Renders the tab buttons (fixed tabs + user pins + add-pin button) shared
 * between ConfigPanel (split-view) and FavoritePreview (favorite preview).
 *
 * Uses `uiStore.configSubTab` so tab selection stays consistent across views.
 * File-picking, pin add/remove and toasts are handled here.
 */
export function ConfigPanelTabList({ folder, size = "md" }: ConfigPanelTabListProps) {
  const configSubTab = useUIStore((s) => s.configSubTab);
  const setConfigSubTab = useUIStore((s) => s.setConfigSubTab);
  const addToast = useUIStore((s) => s.addToast);

  const pins = useSettingsStore(
    (s) => s.pinnedDocs[normalizeProjectKey(folder)] ?? []
  );
  const addPinnedDoc = useSettingsStore((s) => s.addPinnedDoc);
  const removePinnedDoc = useSettingsStore((s) => s.removePinnedDoc);

  const buttonPadding = size === "sm" ? "px-2.5 py-1" : "px-2 py-1";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3 h-3";
  const textSize = "text-[11px]";

  const handleAddPin = async () => {
    try {
      const filePath = await open({
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        multiple: false,
        defaultPath: folder,
        title: "Markdown-Datei zum Anpinnen auswaehlen",
      });
      if (!filePath || typeof filePath !== "string") return;

      // Derive relativePath by stripping folder prefix
      const normalizedFile = filePath.replace(/\\/g, "/");
      const normalizedFolder = folder.replace(/\\/g, "/").replace(/\/+$/, "");
      if (!normalizedFile.toLowerCase().startsWith(normalizedFolder.toLowerCase() + "/")) {
        addToast({
          type: "error",
          title: "Datei ausserhalb des Projekts",
          message: "Nur Dateien innerhalb des Projektordners koennen angepinnt werden.",
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
      const updated = useSettingsStore.getState().pinnedDocs[normalizeProjectKey(folder)] ?? [];
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
    // If the removed pin was active, switch back to CLAUDE.md
    if (configSubTab === `pin:${pinId}`) {
      setConfigSubTab("claude-md");
    }
    addToast({ type: "info", title: "Pin entfernt", message: label });
  };

  return (
    <>
      {CONFIG_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = configSubTab === tab.id;
        return (
          <button
            key={tab.id}
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
        );
      })}

      {/* User-pinned docs */}
      {pins.map((pin) => {
        const tabId: ConfigSubTab = `pin:${pin.id}`;
        const isActive = configSubTab === tabId;
        return (
          <div
            key={pin.id}
            className={`group flex items-center gap-0.5 rounded-sm whitespace-nowrap transition-colors ${
              isActive
                ? "text-accent bg-accent-a10"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay"
            }`}
          >
            <button
              onClick={() => setConfigSubTab(tabId)}
              className={`flex items-center gap-1 pl-2 py-1 ${textSize} font-medium`}
              title={pin.relativePath}
            >
              <Pin className={`${iconSize} shrink-0`} />
              {pin.label}
            </button>
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
    </>
  );
}
