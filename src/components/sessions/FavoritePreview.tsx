import { useState } from "react";
import { X, FolderOpen } from "lucide-react";
import type { ConfigSubTab } from "../../store/uiStore";
import { CONFIG_TABS, ConfigPanelContent } from "./configPanelShared";

interface FavoritePreviewProps {
  folder: string;
  onClose: () => void;
  onResumeSession?: (sessionId: string, cwd: string) => void;
}

export function FavoritePreview({ folder, onClose, onResumeSession }: FavoritePreviewProps) {
  const [activeTab, setActiveTab] = useState<ConfigSubTab>("claude-md");

  const projectName = folder.split(/[/\\]/).filter(Boolean).pop() ?? folder;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center h-10 px-4 border-b border-neutral-700 shrink-0 bg-surface-raised">
        <FolderOpen className="w-3.5 h-3.5 text-accent mr-2 shrink-0" />
        <span className="text-sm font-bold text-neutral-200 truncate mr-3">{projectName}</span>
        <span className="text-[11px] text-neutral-500 truncate mr-auto" title={folder}>{folder}</span>

        {/* Tabs */}
        <div className="flex items-center gap-0 mx-4">
          {CONFIG_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-sm whitespace-nowrap transition-colors ${
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
          onClick={onClose}
          className="p-1.5 text-neutral-500 hover:text-neutral-300 transition-colors ml-2"
          title="Preview schliessen"
          aria-label="Preview schliessen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <ConfigPanelContent folder={folder} activeTab={activeTab} onResumeSession={onResumeSession} />
      </div>
    </div>
  );
}
