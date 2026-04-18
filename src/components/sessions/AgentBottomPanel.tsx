import { useMemo } from "react";
import {
  ChevronUp,
  ChevronDown,
  Users,
  GitBranch,
  Check,
  AlertTriangle,
  Loader2,
  Clock,
  Coins,
  Lock,
  Pause,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  useAgentStore,
  selectAgentsForSession,
  selectWorktreesForSession,
  type DetectedAgent,
  type DetectedWorktree,
} from "../../store/agentStore";
import { formatElapsed } from "../../utils/format";

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

  if (agents.length === 0 && worktrees.length === 0) {
    return null;
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  // Build tree: root agents have no parent in this session
  const rootAgents = agents.filter(
    (a) => !a.parentAgentId || !agents.some((p) => p.id === a.parentAgentId)
  );

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
                {rootAgents.map((agent) => (
                  <AgentTreeBranch
                    key={agent.id}
                    agent={agent}
                    allAgents={agents}
                    depth={0}
                    isSelected={selectedAgentId === agent.id}
                    selectedAgentId={selectedAgentId}
                    onClick={setSelectedAgent}
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
                Agent auswählen für Details
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
    case "blocked":
      return <Lock className="w-3 h-3 text-yellow-500 shrink-0" />;
    case "pending":
      return <Pause className="w-3 h-3 text-neutral-500 shrink-0" />;
  }
}

function AgentTreeBranch({
  agent,
  allAgents,
  depth,
  isSelected: _isSelected,
  selectedAgentId,
  onClick,
}: {
  agent: DetectedAgent;
  allAgents: DetectedAgent[];
  depth: number;
  isSelected: boolean;
  selectedAgentId: string | null;
  onClick: (id: string) => void;
}) {
  const children = allAgents.filter((a) => a.parentAgentId === agent.id);

  return (
    <>
      <button
        onClick={() => onClick(agent.id)}
        className={`w-full flex items-center gap-2 py-1.5 text-left transition-colors ${
          selectedAgentId === agent.id
            ? "bg-accent-a10 text-accent"
            : "text-neutral-300 hover:bg-hover-overlay"
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "12px" }}
      >
        <AgentStatusIcon status={agent.status} />
        <span className="text-xs truncate">
          {agent.name ?? agent.task ?? agent.id}
        </span>
      </button>
      {children.map((child) => (
        <AgentTreeBranch
          key={child.id}
          agent={child}
          allAgents={allAgents}
          depth={depth + 1}
          isSelected={selectedAgentId === child.id}
          selectedAgentId={selectedAgentId}
          onClick={onClick}
        />
      ))}
    </>
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

  // Use parsed duration from terminal if available, otherwise compute
  const durationStr = (() => {
    if (agent.durationStr) return agent.durationStr;
    const duration = agent.completedAt
      ? agent.completedAt - agent.detectedAt
      : Date.now() - agent.detectedAt;
    return formatElapsed(duration);
  })();

  const statusLabel = {
    running: "Aktiv",
    completed: "Fertig",
    error: "Fehler",
    pending: "Wartend",
    blocked: "Blockiert",
  }[agent.status] ?? agent.status;

  const statusColorClass = {
    running: "bg-success/10 text-success",
    completed: "bg-neutral-800 text-neutral-400",
    error: "bg-red-900/30 text-red-400",
    pending: "bg-neutral-800 text-neutral-500",
    blocked: "bg-yellow-900/30 text-yellow-400",
  }[agent.status] ?? "bg-neutral-800 text-neutral-400";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <AgentStatusIcon status={agent.status} />
        <span className="text-sm font-semibold text-neutral-200">
          {agent.name ?? agent.task ?? "Agent"}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColorClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-xs">
        {agent.task && (
          <DetailRow label="Task" value={agent.task} />
        )}
        {agent.phaseNumber != null && (
          <DetailRow label="Phase" value={`Phase ${agent.phaseNumber}`} />
        )}
        <DetailRow label="Dauer" value={durationStr} icon={<Clock className="w-3 h-3" />} />
        {agent.tokenCount && (
          <DetailRow label="Tokens" value={agent.tokenCount} icon={<Coins className="w-3 h-3" />} />
        )}
        {agent.blockedBy != null && (
          <DetailRow
            label="Blockiert"
            value={`durch Task #${agent.blockedBy}`}
            icon={<Lock className="w-3 h-3 text-yellow-500" />}
          />
        )}
        <DetailRow label="ID" value={agent.id} mono />
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

function DetailRow({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-neutral-500 shrink-0">{label}:</span>
      <span className={`text-neutral-300 flex items-center gap-1 ${mono ? "font-mono text-neutral-500" : ""}`}>
        {icon}
        {value}
      </span>
    </div>
  );
}
