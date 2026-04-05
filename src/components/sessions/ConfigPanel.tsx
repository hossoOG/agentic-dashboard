import { X } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { ConfigPanelContent } from "./configPanelShared";
import { ConfigPanelTabList } from "./ConfigPanelTabList";

interface ConfigPanelProps {
  folder: string;
  width?: number;
  onResumeSession?: (sessionId: string, cwd: string) => void;
}

export function ConfigPanel({ folder, width, onResumeSession }: ConfigPanelProps) {
  const configSubTab = useUIStore((s) => s.configSubTab);
  const setConfigPanelOpen = useUIStore((s) => s.setConfigPanelOpen);

  return (
    <div
      className="border-l border-neutral-700 flex flex-col min-h-0 shrink-0"
      style={{ width: width ?? 400 }}
    >
      {/* Tab header */}
      <div className="flex items-center h-9 bg-surface-raised border-b border-neutral-700 shrink-0">
        <div className="flex items-center flex-1 gap-0 px-1 overflow-x-auto">
          <ConfigPanelTabList folder={folder} size="md" />
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
