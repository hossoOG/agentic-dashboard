import { useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown, Clock, Coins, Lock } from "lucide-react";
import type { TaskTreeNode as TaskTreeNodeType } from "../../store/pipelineAdapter";

// ============================================================================
// Status Icon Config
// ============================================================================

const STATUS_CONFIG: Record<string, { char: string; colorClass: string }> = {
  running:   { char: "■", colorClass: "text-accent" },
  pending:   { char: "□", colorClass: "text-neutral-500" },
  completed: { char: "✓", colorClass: "text-success" },
  error:     { char: "✗", colorClass: "text-red-500" },
  blocked:   { char: "□", colorClass: "text-yellow-500" },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
}

// ============================================================================
// TaskTreeNode Component
// ============================================================================

interface TaskTreeNodeProps {
  node: TaskTreeNodeType;
  depth?: number;
  onSelect?: (agentId: string) => void;
  selectedAgentId?: string | null;
}

export const TaskTreeNode = memo(function TaskTreeNode({
  node,
  depth = 0,
  onSelect,
  selectedAgentId,
}: TaskTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { agent, children } = node;
  const hasChildren = children.length > 0;
  const config = getStatusConfig(agent.status);
  const isSelected = selectedAgentId === agent.id;

  const label = agent.name ?? agent.task ?? `Agent ${agent.id.slice(-6)}`;

  return (
    <div>
      {/* Node row */}
      <div
        className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-colors rounded-sm ${
          isSelected
            ? "bg-accent/10 text-accent"
            : "text-neutral-300 hover:bg-hover-overlay"
        }`}
        style={{ paddingLeft: `${8 + depth * 20}px` }}
        onClick={() => onSelect?.(agent.id)}
      >
        {/* Expand/Collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-neutral-700 rounded shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-neutral-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-neutral-500" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Status icon */}
        <span className={`text-sm font-mono shrink-0 ${config.colorClass}`}>
          {config.char}
        </span>

        {/* Label */}
        <span className="text-xs truncate flex-1 min-w-0">{label}</span>

        {/* Badges (right-aligned) */}
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {/* Blocked badge */}
          {agent.blockedBy != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">
              <Lock className="w-2.5 h-2.5" />
              #{agent.blockedBy}
            </span>
          )}

          {/* Duration badge */}
          {agent.durationStr && (
            <span className="flex items-center gap-0.5 text-[10px] text-neutral-400">
              <Clock className="w-2.5 h-2.5" />
              {agent.durationStr}
            </span>
          )}

          {/* Token badge */}
          {agent.tokenCount && (
            <span className="flex items-center gap-0.5 text-[10px] text-neutral-500">
              <Coins className="w-2.5 h-2.5" />
              {agent.tokenCount}
            </span>
          )}
        </div>
      </div>

      {/* Children (animated expand/collapse) */}
      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* Tree line */}
            <div
              className="border-l border-neutral-700"
              style={{ marginLeft: `${18 + depth * 20}px` }}
            >
              {children.map((child) => (
                <TaskTreeNode
                  key={child.agent.id}
                  node={child}
                  depth={depth + 1}
                  onSelect={onSelect}
                  selectedAgentId={selectedAgentId}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
