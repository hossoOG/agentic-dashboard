import { lazy, Suspense } from "react";
import { X, FileText, Puzzle, Webhook, Github, GitBranch } from "lucide-react";
import { useUIStore, type ConfigSubTab } from "../../store/uiStore";

const ClaudeMdViewer = lazy(() => import("./ClaudeMdViewer").then(m => ({ default: m.ClaudeMdViewer })));
const SkillsViewer = lazy(() => import("./SkillsViewer").then(m => ({ default: m.SkillsViewer })));
const HooksViewer = lazy(() => import("./HooksViewer").then(m => ({ default: m.HooksViewer })));
const GitHubViewer = lazy(() => import("./GitHubViewer").then(m => ({ default: m.GitHubViewer })));
const WorktreeViewer = lazy(() => import("./WorktreeViewer").then(m => ({ default: m.WorktreeViewer })));

const configTabs: { id: ConfigSubTab; label: string; icon: typeof FileText }[] = [
  { id: "claude-md", label: "CLAUDE.md", icon: FileText },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "hooks", label: "Hooks", icon: Webhook },
  { id: "github", label: "GitHub", icon: Github },
  { id: "worktrees", label: "Worktrees", icon: GitBranch },
];

interface ConfigPanelProps {
  folder: string;
}

export function ConfigPanel({ folder }: ConfigPanelProps) {
  const configSubTab = useUIStore((s) => s.configSubTab);
  const setConfigSubTab = useUIStore((s) => s.setConfigSubTab);
  const setConfigPanelOpen = useUIStore((s) => s.setConfigPanelOpen);

  return (
    <div className="w-[400px] min-w-[300px] border-l border-neutral-700 flex flex-col min-h-0">
      {/* Tab header */}
      <div className="flex items-center h-9 bg-surface-raised border-b border-neutral-700 shrink-0">
        <div className="flex items-center flex-1 gap-0 px-1 overflow-x-auto">
          {configTabs.map((tab) => {
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
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-neutral-500 py-8">
              Laden...
            </div>
          }
        >
          {configSubTab === "claude-md" ? (
            <ClaudeMdViewer folder={folder} />
          ) : configSubTab === "skills" ? (
            <SkillsViewer folder={folder} />
          ) : configSubTab === "hooks" ? (
            <HooksViewer folder={folder} />
          ) : configSubTab === "github" ? (
            <GitHubViewer folder={folder} />
          ) : configSubTab === "worktrees" ? (
            <WorktreeViewer folder={folder} />
          ) : null}
        </Suspense>
      </div>
    </div>
  );
}
