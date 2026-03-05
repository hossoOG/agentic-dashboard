import { useState } from "react";
import { Play, Square, FolderOpen, Cpu, Wifi } from "lucide-react";
import { usePipelineStore } from "../store/pipelineStore";
import { startMockPipeline } from "../store/mockPipeline";

export function Header() {
  const { isRunning, projectPath, setProjectPath, reset } = usePipelineStore();
  const [localPath, setLocalPath] = useState(projectPath || "/my/project");

  const handleStart = async () => {
    if (isRunning) {
      reset();
    } else {
      await startMockPipeline();
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b-2 border-dark-border bg-dark-card retro-terminal">
      <div className="flex items-center gap-3">
        <Cpu className="w-6 h-6 text-neon-blue" />
        <span className="text-neon-blue font-bold text-lg tracking-wider">
          AGENTIC DASHBOARD
        </span>
        <span className="text-xs text-gray-500 border border-gray-700 px-2 py-0.5 rounded-none">
          v0.1.0
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* Project path input */}
        <div className="flex items-center gap-2 bg-dark-bg border-2 border-dark-border rounded-none px-3 py-1.5">
          <FolderOpen className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            onBlur={() => setProjectPath(localPath)}
            className="bg-transparent text-sm text-gray-300 outline-none w-64"
            placeholder="/path/to/project"
          />
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <Wifi
            className={`w-4 h-4 ${isRunning ? "text-neon-green animate-pulse" : "text-gray-500"}`}
          />
          <span className={`text-xs ${isRunning ? "text-neon-green" : "text-gray-500"}`}>
            {isRunning ? "LIVE" : "IDLE"}
          </span>
        </div>

        {/* Start/Stop button */}
        <button
          onClick={handleStart}
          className={`flex items-center gap-2 px-4 py-2 rounded-none font-medium text-sm transition-all ${
            isRunning
              ? "bg-red-900/30 border border-red-700 text-red-400 hover:bg-red-900/50"
              : "bg-neon-green/10 border border-neon-green text-neon-green hover:bg-neon-green/20 neon-glow-green"
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
