import { useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  Users,
  GitBranch,
  Check,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  useAgentStore,
  selectAgentsForSession,
  selectWorktreesForSession,
  type DetectedAgent,
  type DetectedWorktree,
} from "../../store/agentStore";

interface AgentBottomPanelProps {
  sessionId: string;
}

export function AgentBottomPanel({ sessionId }: AgentBottomPanelProps) {
  const agents = useAgentStore(useShallow(selectAgentsForSession(sessionId)));
  const worktrees = useAgentStore(useShallow(selectWorktreesForSession(sessionId)));
  const collapsed = useAgentStore((s) => s.bottomPanelCollapsed);
  const setCollapsed = useAgentStore((s) => s.setBottomPanelCollapsed);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);

  const activeCount = useMemo(
    () => agents.filter((a) => a.status === "running").length,
    [agents]
  );

  // Don't render if no agents or worktrees
  if (agents.length === 0 && worktrees.length === 0) {
    return null;
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  return (
    <div className="border-t border-neutral-700 bg-surface-base shrink-0">
      {/* Summary strip / toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-hover-overlay transition-colors"
      >
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-300">
            <Users className="w-3.5 h-3.5" />
            <span>
              {agents.length} {agents.length === 1 ? "Agent" : "Agenten"}
            </span>
            {activeCount > 0 && (
              <span className="text-success">({activeCount} aktiv)</span>
            )}
          </div>
          {worktrees.length > 0 && (
            <div className="flex items-center gap-1.5 text-neutral-400">
              <GitBranch className="w-3.5 h-3.5" />
              <span>{worktrees.length} Worktrees</span>
            </div>
          )}
        </div>
        {collapsed ? (
          <ChevronUp className="w-3.5 h-3.5 text-neutral-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
        )}
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div className="flex border-t border-neutral-700 h-48 max-h-48">
          {/* Left: Tree view */}
          <div className="w-56 min-w-[224px] border-r border-neutral-700 overflow-auto">
            {agents.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] text-neutral-500 uppercase tracking-wider">
                  Agenten
                </div>
                {agents.map((agent) => (
                  <AgentTreeNode
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgentId === agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                  />
                ))}
              </div>
            )}
            {worktrees.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] text-neutral-500 uppercase tracking-wider">
                  Worktrees
                </div>
                {worktrees.map((wt) => (
                  <WorktreeTreeNode key={wt.path} worktree={wt} />
                ))}
              </div>
            )}
          </div>

          {/* Right: Detail card */}
          <div className="flex-1 overflow-auto p-3">
            {selectedAgent ? (
              <AgentDetailCard agent={selectedAgent} worktrees={worktrees} />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-neutral-500">
                Agent auswaehlen fuer Details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function AgentStatusIcon({ status }: { status: DetectedAgent["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="w-3 h-3 text-success animate-spin shrink-0" />;
    case "completed":
      return <Check className="w-3 h-3 text-success shrink-0" />;
    case "error":
      return <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />;
  }
}

function AgentTreeNode({
  agent,
  isSelected,
  onClick,
}: {
  agent: DetectedAgent;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
        isSelected
          ? "bg-accent-a10 text-accent"
          : "text-neutral-300 hover:bg-hover-overlay"
      }`}
    >
      <AgentStatusIcon status={agent.status} />
      <span className="text-xs truncate">
        {agent.name ?? agent.task ?? agent.id}
      </span>
    </button>
  );
}

function WorktreeTreeNode({ worktree }: { worktree: DetectedWorktree }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-neutral-400">
      <GitBranch className="w-3 h-3 shrink-0" />
      <span className="text-xs truncate">
        {worktree.branch ?? worktree.path}
      </span>
      {worktree.active && (
        <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
      )}
    </div>
  );
}

function AgentDetailCard({
  agent,
  worktrees,
}: {
  agent: DetectedAgent;
  worktrees: DetectedWorktree[];
}) {
  const linkedWorktree = worktrees.find((w) => w.agentId === agent.id);
  const duration = agent.completedAt
    ? agent.completedAt - agent.detectedAt
    : Date.now() - agent.detectedAt;
  const durationSec = Math.floor(duration / 1000);
  const durationMin = Math.floor(durationSec / 60);
  const durationStr =
    durationMin > 0
      ? `${durationMin}m ${durationSec % 60}s`
      : `${durationSec}s`;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <AgentStatusIcon status={agent.status} />
        <span className="text-sm font-semibold text-neutral-200">
          {agent.name ?? agent.task ?? "Agent"}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            agent.status === "running"
              ? "bg-success/10 text-success"
              : agent.status === "completed"
                ? "bg-neutral-800 text-neutral-400"
                : "bg-red-900/30 text-red-400"
          }`}
        >
          {agent.status === "running"
            ? "Aktiv"
            : agent.status === "completed"
              ? "Fertig"
              : "Fehler"}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-xs">
        {agent.task && (
          <div className="flex gap-2">
            <span className="text-neutral-500 shrink-0">Task:</span>
            <span className="text-neutral-300">{agent.task}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-neutral-500 shrink-0">Dauer:</span>
          <span className="text-neutral-300">{durationStr}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-neutral-500 shrink-0">ID:</span>
          <span className="text-neutral-500 font-mono">{agent.id}</span>
        </div>
        {linkedWorktree && (
          <div className="flex gap-2">
            <span className="text-neutral-500 shrink-0">Worktree:</span>
            <span className="text-neutral-300 flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              {linkedWorktree.branch ?? linkedWorktree.path}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
