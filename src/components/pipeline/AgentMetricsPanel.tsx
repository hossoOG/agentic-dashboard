import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
} from "lucide-react";
import { useAgentStore } from "../../store/agentStore";
import type { DetectedAgent, DetectedWorktree } from "../../store/agentStore";
import { formatElapsed } from "../../utils/format";
import { DURATION, EASE } from "../../utils/motion";

interface AgentMetrics {
  total: number;
  running: number;
  completed: number;
  error: number;
  pending: number;
  blocked: number;
  totalDurationMs: number;
  oldestAgentAt: number | null;
  worktreeCount: number;
  agentsWithWorktrees: number;
  tokenAgents: string[];
}

function computeMetrics(
  agents: Record<string, DetectedAgent>,
  worktrees: Record<string, DetectedWorktree>
): AgentMetrics {
  const agentList = Object.values(agents);
  const now = Date.now();

  let running = 0;
  let completed = 0;
  let error = 0;
  let pending = 0;
  let blocked = 0;
  let totalDurationMs = 0;
  let oldestAgentAt: number | null = null;
  let agentsWithWorktrees = 0;
  const tokenAgents: string[] = [];

  for (const agent of agentList) {
    if (agent.status === "running") running++;
    else if (agent.status === "completed") completed++;
    else if (agent.status === "error") error++;
    else if (agent.status === "pending") pending++;
    else if (agent.status === "blocked") blocked++;

    const endTime = agent.completedAt ?? now;
    totalDurationMs += endTime - agent.detectedAt;

    if (oldestAgentAt === null || agent.detectedAt < oldestAgentAt) {
      oldestAgentAt = agent.detectedAt;
    }

    if (agent.worktreePath) {
      agentsWithWorktrees++;
    }

    if (agent.tokenCount) {
      tokenAgents.push(agent.tokenCount);
    }
  }

  return {
    total: agentList.length,
    running,
    completed,
    error,
    pending,
    blocked,
    totalDurationMs,
    oldestAgentAt,
    worktreeCount: Object.keys(worktrees).length,
    agentsWithWorktrees,
    tokenAgents,
  };
}

// ============================================================================
// MetricCard
// ============================================================================

function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-surface-raised border border-neutral-700 rounded-sm px-3 py-2">
      <div className={`${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-neutral-500">{label}</div>
        <div className="text-sm font-bold text-neutral-200">{value}</div>
        {subValue && (
          <div className="text-[10px] text-neutral-500">{subValue}</div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// AgentMetricsPanel
// ============================================================================

interface AgentMetricsPanelProps {
  sessionId?: string | null;
}

export function AgentMetricsPanel({ sessionId }: AgentMetricsPanelProps) {
  const agents = useAgentStore((s) => s.agents);
  const worktrees = useAgentStore((s) => s.worktrees);

  const filteredAgents = useMemo(() => {
    if (!sessionId) return agents;
    const filtered: Record<string, DetectedAgent> = {};
    for (const [id, agent] of Object.entries(agents)) {
      if (agent.sessionId === sessionId) {
        filtered[id] = agent;
      }
    }
    return filtered;
  }, [agents, sessionId]);

  const metrics = useMemo(
    () => computeMetrics(filteredAgents, worktrees),
    [filteredAgents, worktrees]
  );

  const now = Date.now();
  const sessionDuration = metrics.oldestAgentAt
    ? now - metrics.oldestAgentAt
    : 0;

  // Empty state
  if (metrics.total === 0) {
    return (
      <div className="border-t border-neutral-700 px-4 py-3">
        <div className="flex items-center gap-2 text-neutral-500 text-xs">
          <Activity className="w-3.5 h-3.5" />
          <span>Keine Agent-Metriken verfügbar — noch keine Agenten erkannt.</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.fast, ease: EASE.out }}
      className="border-t border-neutral-700"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800">
        <Activity className="w-4 h-4 text-neutral-400" />
        <span className="text-xs font-medium text-neutral-300 tracking-wider uppercase">
          Agent-Metriken
        </span>
      </div>

      {/* Metrics grid */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          icon={Users}
          label="Gesamt"
          value={metrics.total}
          subValue={`${metrics.running} aktiv`}
          color="text-neutral-400"
        />
        <MetricCard
          icon={Activity}
          label="Aktiv"
          value={metrics.running}
          color="text-accent"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Fertig"
          value={metrics.completed}
          color="text-success"
        />
        <MetricCard
          icon={XCircle}
          label="Fehler"
          value={metrics.error}
          color="text-error"
        />
        <MetricCard
          icon={Clock}
          label="Laufzeit"
          value={formatElapsed(sessionDuration)}
          subValue={metrics.total > 1 ? `${formatElapsed(Math.round(metrics.totalDurationMs / metrics.total))} avg` : undefined}
          color="text-neutral-400"
        />
        {metrics.tokenAgents.length > 0 && (
          <MetricCard
            icon={Activity}
            label="Tokens"
            value={metrics.tokenAgents.length}
            subValue={metrics.tokenAgents[0]}
            color="text-neutral-400"
          />
        )}
      </div>

      {/* Worktree usage bar */}
      {metrics.worktreeCount > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <GitBranch className="w-3.5 h-3.5" />
            <span>
              Worktree-Nutzung: {metrics.agentsWithWorktrees} von {metrics.total} Agent(en) nutzen Worktrees
            </span>
            <span className="text-neutral-600">
              ({metrics.worktreeCount} Worktree{metrics.worktreeCount !== 1 ? "s" : ""} erkannt)
            </span>
          </div>
          <div className="mt-1.5 w-full bg-neutral-800 rounded-full h-1.5 max-w-xs">
            <motion.div
              className="h-1.5 rounded-full bg-accent"
              initial={{ width: 0 }}
              animate={{
                width: `${metrics.total > 0 ? (metrics.agentsWithWorktrees / metrics.total) * 100 : 0}%`,
              }}
              transition={{ duration: DURATION.base }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}
