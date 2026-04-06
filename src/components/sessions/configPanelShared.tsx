import { lazy, Suspense } from "react";
import { FileText, Puzzle, Webhook, Github, GitBranch, Columns3, Clock } from "lucide-react";
import type { ConfigSubTab } from "../../store/uiStore";
import { isPinTab, getPinIdFromTab } from "../../store/uiStore";

export const ClaudeMdViewer = lazy(() => import("./ClaudeMdViewer").then(m => ({ default: m.ClaudeMdViewer })));
export const SkillsViewer = lazy(() => import("./SkillsViewer").then(m => ({ default: m.SkillsViewer })));
export const HooksViewer = lazy(() => import("./HooksViewer").then(m => ({ default: m.HooksViewer })));
export const GitHubViewer = lazy(() => import("./GitHubViewer").then(m => ({ default: m.GitHubViewer })));
export const WorktreeViewer = lazy(() => import("./WorktreeViewer").then(m => ({ default: m.WorktreeViewer })));
export const KanbanBoard = lazy(() => import("../kanban/KanbanBoard").then(m => ({ default: m.KanbanBoard })));
export const SessionHistoryViewer = lazy(() => import("./SessionHistoryViewer"));
export const PinnedDocViewer = lazy(() => import("./PinnedDocViewer").then(m => ({ default: m.PinnedDocViewer })));

export type TabGroup = "context" | "project" | "history";

export interface ConfigTab {
  id: ConfigSubTab;
  label: string;
  icon: typeof FileText;
  group: TabGroup;
}

// eslint-disable-next-line react-refresh/only-export-components
export const CONFIG_TABS: ConfigTab[] = [
  { id: "claude-md", label: "CLAUDE.md", icon: FileText, group: "context" },
  { id: "skills", label: "Skills", icon: Puzzle, group: "context" },
  { id: "hooks", label: "Hooks", icon: Webhook, group: "context" },
  { id: "github", label: "GitHub", icon: Github, group: "project" },
  { id: "worktrees", label: "Worktrees", icon: GitBranch, group: "project" },
  { id: "kanban", label: "Kanban", icon: Columns3, group: "project" },
  { id: "history", label: "History", icon: Clock, group: "history" },
];

interface ConfigPanelContentProps {
  folder: string;
  activeTab: ConfigSubTab;
  onResumeSession?: (sessionId: string, cwd: string) => void;
}

export function ConfigPanelContent({ folder, activeTab, onResumeSession }: ConfigPanelContentProps) {
  const pinId = isPinTab(activeTab) ? getPinIdFromTab(activeTab) : null;

  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center text-neutral-500 py-8">
          Laden...
        </div>
      }
    >
      {pinId !== null ? (
        <PinnedDocViewer folder={folder} pinId={pinId} />
      ) : activeTab === "claude-md" ? (
        <ClaudeMdViewer folder={folder} />
      ) : activeTab === "skills" ? (
        <SkillsViewer folder={folder} />
      ) : activeTab === "hooks" ? (
        <HooksViewer folder={folder} />
      ) : activeTab === "github" ? (
        <GitHubViewer folder={folder} />
      ) : activeTab === "worktrees" ? (
        <WorktreeViewer folder={folder} />
      ) : activeTab === "kanban" ? (
        <KanbanBoard folder={folder} />
      ) : activeTab === "history" ? (
        <SessionHistoryViewer folder={folder} onResumeSession={onResumeSession} />
      ) : null}
    </Suspense>
  );
}
