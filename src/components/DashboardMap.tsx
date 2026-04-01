import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { OrchestratorNode } from "./OrchestratorNode";
import { WorktreeNode } from "./WorktreeNode";
import { QAGateNode } from "./QAGateNode";
import { ConnectionLines } from "./ConnectionLines";
import { useAdaptedPipelineData } from "../store/pipelineAdapter";
import { DURATION } from "../utils/motion";
import { Search } from "lucide-react";

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="w-16 h-16 rounded-full border-2 border-neutral-700 flex items-center justify-center">
          <Search className="w-7 h-7 text-neutral-500" />
        </div>
        <h2 className="text-lg font-display font-bold text-neutral-300 tracking-wider">
          Keine Agenten erkannt
        </h2>
        <p className="text-sm text-neutral-500 max-w-md leading-relaxed">
          Starte eine Session mit Claude CLI um Agenten in der Pipeline-Ansicht zu sehen.
          Sub-Agents werden automatisch erkannt.
        </p>
      </motion.div>
    </div>
  );
}

export function DashboardMap() {
  const adapted = useAdaptedPipelineData();
  const { hasAgents, worktrees, orchestratorStatus, orchestratorLog, qaGate } = adapted;
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const debouncedUpdate = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(update, 150);
    };

    update(); // initial measurement
    window.addEventListener("resize", debouncedUpdate);
    return () => {
      window.removeEventListener("resize", debouncedUpdate);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Empty state when no agents detected
  if (!hasAgents) {
    return (
      <div ref={containerRef} className="perspective-container bg-surface-base">
        <EmptyState />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="perspective-container bg-surface-base">
      {/* SVG connection lines layer (outside the isometric board to stay flat) */}
      <ConnectionLines
        worktreeCount={worktrees.length}
        dimensions={dimensions}
        orchestratorStatus={orchestratorStatus}
        qaStatus={qaGate.overallStatus}
        worktrees={worktrees}
      />

      <div className="isometric-board">
        {/* Orchestrator - Top Center */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 isometric-node">
          <OrchestratorNode
            orchestratorStatus={orchestratorStatus}
            orchestratorLog={orchestratorLog}
            summary={adapted.summary}
          />
        </div>

        {/* Worktrees - Middle */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 z-10 max-h-[60%] overflow-y-auto">
          <div className="flex justify-center gap-6 px-8 flex-wrap">
            {worktrees.map((wt, index) => (
              <motion.div
                key={wt.id}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: index * 0.15, type: "spring", stiffness: 200 }}
                className="isometric-node"
              >
                <WorktreeNode worktree={wt} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* QA Gate - Bottom Center */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 isometric-node">
          <QAGateNode qaGate={qaGate} />
        </div>

        {/* Ambient scan line effect */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
          <motion.div
            className="absolute w-full h-px bg-gradient-to-r from-transparent via-accent to-transparent"
            animate={{ y: [0, dimensions.height] }}
            transition={{ duration: DURATION.ambient, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </div>
    </div>
  );
}
