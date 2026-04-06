import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  Puzzle,
  Webhook,
  Layers,
  Play,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { getErrorMessage } from "../../utils/adpError";
import { logError } from "../../utils/errorLogger";
import { useWorkflowStore, selectWorkflowsForFolder } from "../../store/workflowStore";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useUIStore } from "../../store/uiStore";
import type { DetectedWorkflow, WorkflowType } from "../../store/workflowStore";
import type { SessionShell } from "../../store/sessionStore";
import { DURATION, EASE, staggerDelay } from "../../utils/motion";

// ============================================================================
// Constants
// ============================================================================

const TYPE_CONFIG: Record<WorkflowType, { icon: typeof Puzzle; label: string; color: string; bg: string }> = {
  skill: {
    icon: Puzzle,
    label: "Skill",
    color: "text-accent",
    bg: "bg-accent-a10",
  },
  hook: {
    icon: Webhook,
    label: "Hook",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
  },
  composite: {
    icon: Layers,
    label: "Composite",
    color: "text-purple-400",
    bg: "bg-purple-400/10",
  },
};

// ============================================================================
// WorkflowCard
// ============================================================================

function WorkflowCard({
  workflow,
  index,
  onLaunch,
}: {
  workflow: DetectedWorkflow;
  index: number;
  onLaunch: (workflow: DetectedWorkflow) => void;
}) {
  const config = TYPE_CONFIG[workflow.type];
  const Icon = config.icon;
  const canLaunch = workflow.type === "skill" || workflow.type === "composite";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: DURATION.fast,
        delay: staggerDelay(index),
        ease: EASE.out,
      }}
      className="bg-surface-raised border border-neutral-700 rounded-sm p-3 flex flex-col gap-2 min-w-[200px]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`w-4 h-4 ${config.color} shrink-0`} />
          <span className="text-sm font-semibold text-neutral-200 truncate">
            {workflow.name}
          </span>
        </div>
        <span
          className={`px-1.5 py-0.5 text-[10px] rounded-full shrink-0 ${config.bg} ${config.color}`}
        >
          {config.label}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
        {workflow.description}
      </p>

      {/* Source info */}
      <div className="text-[10px] text-neutral-600 truncate">
        {workflow.source.join(", ")}
      </div>

      {/* Launch button */}
      {canLaunch && workflow.trigger && (
        <button
          onClick={() => onLaunch(workflow)}
          className="mt-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm bg-accent-a10 text-accent hover:bg-accent-a20 transition-colors"
        >
          <Play className="w-3 h-3" />
          Starten
        </button>
      )}
    </motion.div>
  );
}

// ============================================================================
// WorkflowLauncher
// ============================================================================

export function WorkflowLauncher() {
  const activeSession = useSessionStore(selectActiveSession);
  const folder = activeSession?.folder ?? "";
  const workflows = useWorkflowStore(selectWorkflowsForFolder(folder));
  const loading = useWorkflowStore((s) => s.loading);
  const error = useWorkflowStore((s) => s.error);
  const launchError = useWorkflowStore((s) => s.launchError);
  const detectWorkflows = useWorkflowStore((s) => s.detectWorkflows);
  const setLaunchError = useWorkflowStore((s) => s.setLaunchError);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  // Detect workflows when folder changes
  useEffect(() => {
    if (folder) {
      detectWorkflows(folder);
    }
  }, [folder, detectWorkflows]);

  const handleRefresh = useCallback(() => {
    if (folder) {
      detectWorkflows(folder);
    }
  }, [folder, detectWorkflows]);

  const handleLaunch = useCallback(
    async (workflow: DetectedWorkflow) => {
      if (!folder) return;

      const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const title = `${workflow.name}`;
      const shell: SessionShell = "powershell";

      try {
        const result = await invoke<{
          id: string;
          title: string;
          folder: string;
          shell: string;
        }>("create_session", {
          id,
          folder,
          title,
          shell,
        });

        const sessionId = result?.id ?? id;
        useSessionStore.getState().addSession({
          id: sessionId,
          title: result?.title ?? title,
          folder: result?.folder ?? folder,
          shell: (result?.shell ?? shell) as SessionShell,
        });

        // Write the trigger command to the session with retry to handle PTY init timing
        if (workflow.trigger) {
          const prompt = `${workflow.trigger}\n`;
          const writeWithRetry = async (retriesLeft: number, delayMs: number) => {
            try {
              await invoke("write_session", { id: sessionId, data: prompt });
            } catch (err) {
              if (retriesLeft > 0) {
                await new Promise((r) => setTimeout(r, delayMs));
                await writeWithRetry(retriesLeft - 1, delayMs * 1.5);
              } else {
                logError("WorkflowLauncher.writeSession", err);
              }
            }
          };
          // Initial delay for PTY setup, then retry with backoff
          setTimeout(() => {
            writeWithRetry(3, 500);
          }, 800);
        }

        // Switch to sessions tab
        setActiveTab("sessions");
      } catch (err) {
        const message = getErrorMessage(err);
        useWorkflowStore.getState().setLaunchError(
          `Workflow "${workflow.name}" konnte nicht gestartet werden: ${message}`
        );
      }
    },
    [folder, setActiveTab]
  );

  // Empty state: no active session
  if (!folder) {
    return (
      <div className="border-b border-neutral-700 px-4 py-4">
        <div className="flex items-center gap-2 text-neutral-500 text-sm">
          <Puzzle className="w-4 h-4" />
          <span>Wähle ein Projekt um Workflows zu erkennen</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-neutral-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-neutral-400" />
          <span className="text-xs font-medium text-neutral-300 tracking-wider uppercase">
            Erkannte Workflows
          </span>
          {workflows.length > 0 && (
            <span className="text-xs text-neutral-500">
              ({workflows.length})
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors disabled:opacity-50"
          title="Workflows neu erkennen"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-3">
        {/* Loading */}
        {loading && workflows.length === 0 && (
          <div className="flex items-center gap-2 text-neutral-500 text-xs py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Workflows werden erkannt...
          </div>
        )}

        {/* Detection error */}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-xs py-2">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}

        {/* Launch error */}
        {launchError && (
          <div className="flex items-center gap-2 text-red-400 text-xs py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{launchError}</span>
            <button
              onClick={() => setLaunchError(null)}
              className="text-red-400 hover:text-red-300 text-xs underline shrink-0"
            >
              Schliessen
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && workflows.length === 0 && (
          <div className="text-xs text-neutral-500 py-2">
            Kein Workflow konfiguriert — keine Skills oder Hooks im Projekt gefunden.
          </div>
        )}

        {/* Workflow cards */}
        {workflows.length > 0 && (
          <AnimatePresence>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {workflows.map((wf, i) => (
                <WorkflowCard
                  key={wf.id}
                  workflow={wf}
                  index={i}
                  onLaunch={handleLaunch}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
