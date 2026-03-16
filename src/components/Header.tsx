import { useState } from "react";
import { Play, Square, FolderOpen, Cpu, Wifi } from "lucide-react";
import { usePipelineStore } from "../store/pipelineStore";
import { startMockPipeline } from "../store/mockPipeline";

export function Header() {
  const { isRunning, projectPath, setProjectPath, reset } = usePipelineStore();
  const [localPath, setLocalPath] = useState(projectPath || "/my/project");

  const handleStart = async () => {
    try {
      if (isRunning) {
        reset();
      } else {
        await startMockPipeline();
      }
    } catch (err) {
      console.error("[Header] handleStart failed:", err);
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b-2 border-neutral-700 bg-surface-raised retro-terminal">
      <div className="flex items-center gap-3">
        <Cpu className="w-6 h-6 text-accent" />
        <span className="text-accent font-bold text-lg tracking-wider font-display">
          AGENTIC DASHBOARD
        </span>
        <span className="text-xs text-neutral-400 border border-gray-700 px-2 py-0.5 rounded-none">
          v0.1.0
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Project path input */}
        <div className="flex items-center gap-2 bg-surface-base border-2 border-neutral-700 rounded-none px-3 py-1.5">
          <FolderOpen className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            onBlur={() => setProjectPath(localPath)}
            className="bg-transparent text-sm text-neutral-200 outline-none w-64"
            placeholder="/path/to/project"
            aria-label="Projektpfad"
          />
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <Wifi
            className={`w-4 h-4 ${isRunning ? "text-success animate-pulse" : "text-neutral-400"}`}
          />
          <span className={`text-xs ${isRunning ? "text-success" : "text-neutral-400"}`}>
            {isRunning ? "LIVE" : "IDLE"}
          </span>
        </div>

        {/* Start/Stop button */}
        <button
          onClick={handleStart}
          className={`flex items-center gap-2 px-4 py-2 rounded-none font-medium text-sm transition-all ${
            isRunning
              ? "bg-error/10 border border-error text-error hover:bg-red-900/50"
              : "bg-success/10 border border-success text-success hover:bg-success/20 glow-success"
          }`}
        >
          {isRunning ? (
            <>
              <Square className="w-4 h-4" /> STOP
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> START PIPELINE
            </>
          )}
        </button>
      </div>
    </header>
  );
}
