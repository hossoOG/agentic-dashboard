import { X, Plus, Pin } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useUIStore } from "../../store/uiStore";
import { useSettingsStore, normalizeProjectKey } from "../../store/settingsStore";
import { logError } from "../../utils/errorLogger";
import { CONFIG_TABS, ConfigPanelContent } from "./configPanelShared";

interface ConfigPanelProps {
  folder: string;
  width?: number;
  onResumeSession?: (sessionId: string, cwd: string) => void;
}

export function ConfigPanel({ folder, width, onResumeSession }: ConfigPanelProps) {
  const configSubTab = useUIStore((s) => s.configSubTab);
  const setConfigSubTab = useUIStore((s) => s.setConfigSubTab);
  const setConfigPanelOpen = useUIStore((s) => s.setConfigPanelOpen);
  const addToast = useUIStore((s) => s.addToast);

  const pins = useSettingsStore(
    (s) => s.pinnedDocs[normalizeProjectKey(folder)] ?? []
  );
  const addPinnedDoc = useSettingsStore((s) => s.addPinnedDoc);
  const removePinnedDoc = useSettingsStore((s) => s.removePinnedDoc);

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
      logError("ConfigPanel.handleAddPin", e);
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
    <div
      className="border-l border-neutral-700 flex flex-col min-h-0 shrink-0"
      style={{ width: width ?? 400 }}
    >
      {/* Tab header */}
      <div className="flex items-center h-9 bg-surface-raised border-b border-neutral-700 shrink-0">
        <div className="flex items-center flex-1 gap-0 px-1 overflow-x-auto">
          {CONFIG_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = configSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setConfigSubTab(tab.id)}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? "text-accent bg-accent-a10"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay"
                }`}
                title={tab.label}
              >
                <Icon className="w-3 h-3 shrink-0" />
                {tab.label}
              </button>
            );
          })}
          {/* User-pinned docs */}
          {pins.map((pin) => {
            const tabId = `pin:${pin.id}` as const;
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
                  className="flex items-center gap-1 pl-2 py-1 text-[11px] font-medium"
                  title={pin.relativePath}
                >
                  <Pin className="w-3 h-3 shrink-0" />
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
            className="flex items-center gap-1 px-1.5 py-1 text-[11px] rounded-sm whitespace-nowrap text-neutral-500 hover:text-accent hover:bg-accent-a10 transition-colors"
            title="Markdown-Datei anpinnen"
            aria-label="Markdown-Datei anpinnen"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <button
          onClick={() => setConfigPanelOpen(false)}
          className="p-1.5 mr-1 text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Panel schliessen"
          aria-label="Konfig-Panel schliessen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Config viewer content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <ConfigPanelContent folder={folder} activeTab={configSubTab} onResumeSession={onResumeSession} />
      </div>
    </div>
  );
}
