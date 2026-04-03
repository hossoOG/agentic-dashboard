import { X } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
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
