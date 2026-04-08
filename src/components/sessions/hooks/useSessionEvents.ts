import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { createEventTracker } from "../../../utils/perfLogger";
import { useSessionStore } from "../../../store/sessionStore";
import { useAgentStore, type AgentStatus, type DetectedAgent } from "../../../store/agentStore";
import { logError } from "../../../utils/errorLogger";

const VALID_AGENT_STATUSES = new Set<string>(["running", "completed", "error", "pending", "blocked"]);

const trackSessionOutput = createEventTracker("session-output");

/**
 * Registers all Tauri event listeners for session lifecycle:
 * session-output, session-exit, session-status, agent-detected,
 * agent-completed, agent-status-update, task-summary, worktree-detected
 */
export function useSessionEvents(): void {
  const lastOutputTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];
    const timers = lastOutputTimers.current;

    // session-output -> update lastOutput in store
    unlisteners.push(
      listen<{ id: string; data: string }>("session-output", (event) => {
        try {
          trackSessionOutput();
          const id = event?.payload?.id;
          const data = event?.payload?.data;
          if (typeof id !== "string" || typeof data !== "string") return;
          const snippet = data.slice(-200);
          const existing = timers.get(id);
          if (existing) clearTimeout(existing);
          timers.set(
            id,
            setTimeout(() => {
              useSessionStore.getState().updateLastOutput(id, snippet);
              timers.delete(id);
            }, 300),
          );
        } catch (err) {
          logError("useSessionEvents.sessionOutput", err);
        }
      }),
    );

    // session-exit -> set exit code + mark running agents as completed
    unlisteners.push(
      listen<{ id: string; exit_code: number }>("session-exit", (event) => {
        try {
          const id = event?.payload?.id;
          const exitCode = event?.payload?.exit_code;
          if (typeof id !== "string" || exitCode == null) return;
          useSessionStore.getState().setExitCode(id, exitCode);

          // Mark all running agents for this session as completed
          const agentState = useAgentStore.getState();
          const sessionAgents = Object.values(agentState.agents).filter(
            (a) => a.sessionId === id && a.status === "running",
          );
          for (const agent of sessionAgents) {
            agentState.updateAgentStatus(agent.id, "completed", Date.now());
          }
        } catch (err) {
          logError("useSessionEvents.sessionExit", err);
        }
      }),
    );

    // session-status -> update status
    unlisteners.push(
      listen<{ id: string; status: string }>("session-status", (event) => {
        try {
          const id = event?.payload?.id;
          const status = event?.payload?.status;
          if (typeof id !== "string" || typeof status !== "string") return;
          if (
            status === "starting" ||
            status === "running" ||
            status === "waiting" ||
            status === "done" ||
            status === "error"
          ) {
            useSessionStore.getState().updateStatus(id, status);
          }
        } catch (err) {
          logError("useSessionEvents.sessionStatus", err);
        }
      }),
    );

    // agent-detected -> add agent to store
    unlisteners.push(
      listen<{
        session_id: string;
        agent_id: string;
        name: string | null;
        task: string | null;
        task_number: number | null;
        phase_number: number | null;
        parent_agent_id: string | null;
        depth: number;
        detected_at: number;
      }>("agent-detected", (event) => {
        try {
          const p = event?.payload;
          if (!p?.session_id || !p?.agent_id) return;
          const store = useAgentStore.getState();
          store.addAgent({
            id: p.agent_id,
            sessionId: p.session_id,
            parentAgentId: p.parent_agent_id ?? null,
            childrenIds: [],
            depth: Math.max(0, p.depth ?? 0),
            name: p.name ?? null,
            task: p.task ?? null,
            taskNumber: p.task_number ?? null,
            phaseNumber: p.phase_number ?? null,
            status: "running",
            detectedAt: p.detected_at ?? Date.now(),
            completedAt: null,
            worktreePath: null,
            durationStr: null,
            tokenCount: null,
            blockedBy: null,
            toolUses: null,
          });
          // Mark detection as working for this session
          store.setDetectionQuality(p.session_id, "good");
        } catch (err) {
          logError("useSessionEvents.agentDetected", err);
        }
      }),
    );

    // agent-completed -> update agent status
    unlisteners.push(
      listen<{
        session_id: string;
        agent_id: string;
        status: string;
        completed_at: number;
      }>("agent-completed", (event) => {
        try {
          const p = event?.payload;
          if (!p?.agent_id || !p?.session_id) return;
          const status = p.status === "error" ? "error" : "completed";
          useAgentStore
            .getState()
            .updateAgentStatus(
              p.agent_id,
              status as "completed" | "error",
              p.completed_at ?? Date.now(),
            );
        } catch (err) {
          logError("useSessionEvents.agentCompleted", err);
        }
      }),
    );

    // agent-status-update -> update agent details
    unlisteners.push(
      listen<{
        session_id: string;
        agent_id: string;
        status: string;
        duration_str: string | null;
        token_count: string | null;
        blocked_by: number | null;
      }>("agent-status-update", (event) => {
        try {
          const p = event?.payload;
          if (!p?.agent_id) return;
          // Validate status before applying
          const validatedStatus = VALID_AGENT_STATUSES.has(p.status) ? p.status as AgentStatus : "running";
          const updates: Partial<DetectedAgent> = {
            status: validatedStatus,
          };
          if (p.duration_str) updates.durationStr = p.duration_str;
          if (p.token_count) updates.tokenCount = p.token_count;
          if (p.blocked_by !== null && p.blocked_by !== undefined)
            updates.blockedBy = p.blocked_by;
          if (validatedStatus === "completed" || validatedStatus === "error") {
            updates.completedAt = Date.now();
          }
          useAgentStore.getState().updateAgentDetails(p.agent_id, updates);
        } catch (err) {
          logError("useSessionEvents.agentStatusUpdate", err);
        }
      }),
    );

    // task-summary -> update summary counts
    unlisteners.push(
      listen<{
        session_id: string;
        pending_count: number;
        completed_count: number;
      }>("task-summary", (event) => {
        try {
          const p = event?.payload;
          if (!p) return;
          useAgentStore
            .getState()
            .setTaskSummary(p.pending_count ?? 0, p.completed_count ?? 0);
        } catch (err) {
          logError("useSessionEvents.taskSummary", err);
        }
      }),
    );

    // worktree-detected -> add worktree to store
    unlisteners.push(
      listen<{
        session_id: string;
        path: string;
        branch: string | null;
        agent_id: string | null;
      }>("worktree-detected", (event) => {
        try {
          const p = event?.payload;
          if (!p?.session_id || !p?.path) return;
          useAgentStore.getState().addWorktree({
            path: p.path,
            branch: p.branch ?? null,
            agentId: p.agent_id ?? null,
            sessionId: p.session_id,
            active: true,
          });
        } catch (err) {
          logError("useSessionEvents.worktreeDetected", err);
        }
      }),
    );

    return () => {
      unlisteners.forEach((p) =>
        p
          .then((unlisten) => unlisten())
          .catch((e) => logError("useSessionEvents.cleanup", e)),
      );
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);
}
