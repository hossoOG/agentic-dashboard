import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { OrchestratorNode } from "./OrchestratorNode";
import { WorktreeNode } from "./WorktreeNode";
import { QAGateNode } from "./QAGateNode";
import { ConnectionLines } from "./ConnectionLines";
import { usePipelineStore } from "../store/pipelineStore";

export function DashboardMap() {
  const { worktrees, orchestratorStatus, qaGate } = usePipelineStore();
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden grid-bg">
      {/* SVG connection lines layer */}
      <ConnectionLines
        worktreeCount={worktrees.length}
        dimensions={dimensions}
        orchestratorStatus={orchestratorStatus}
        qaStatus={qaGate.overallStatus}
        worktrees={worktrees}
      />

      {/* Orchestrator - Top Center */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10">
        <OrchestratorNode />
      </div>

      {/* Worktrees - Middle */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 z-10">
        <div className="flex justify-center gap-6 px-8 flex-wrap">
          {worktrees.map((wt, index) => (
            <motion.div
              key={wt.id}
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: index * 0.15, type: "spring", stiffness: 200 }}
            >
              <WorktreeNode worktree={wt} />
            </motion.div>
          ))}
          {worktrees.length === 0 && (
            <div className="text-gray-600 text-sm italic">
              Waiting for worktrees to spawn...
            </div>
          )}
        </div>
      </div>

      {/* QA Gate - Bottom Center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <QAGateNode />
      </div>

      {/* Ambient scan line effect */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-10">
        <motion.div
          className="absolute w-full h-px bg-gradient-to-r from-transparent via-neon-blue to-transparent"
          animate={{ y: [0, dimensions.height] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
      </div>
    </div>
  );
}
