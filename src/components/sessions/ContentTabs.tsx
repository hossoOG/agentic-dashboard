import { Terminal, FileText, Puzzle, Webhook, Github } from "lucide-react";

export type ContentTab = "terminal" | "claude-md" | "skills" | "hooks" | "github";

interface ContentTabsProps {
  activeTab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
}

const tabs: { id: ContentTab; label: string; icon: typeof Terminal }[] = [
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "claude-md", label: "CLAUDE.md", icon: FileText },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "hooks", label: "Hooks", icon: Webhook },
  { id: "github", label: "GitHub", icon: Github },
];

export function ContentTabs({ activeTab, onTabChange }: ContentTabsProps) {
  return (
    <div className="flex items-center gap-0 h-9 px-2 bg-surface-raised border-b border-neutral-700 shrink-0">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors duration-150 border-b-2 ${
              isActive
                ? "text-accent border-accent bg-accent/5"
                : "text-neutral-400 border-transparent hover:text-neutral-200 hover:bg-white/5"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
