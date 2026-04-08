import { useEffect } from "react";
import { useAgentStore } from "../../store/agentStore";

const POLL_INTERVAL_MS = 60_000;
const STALE_THRESHOLD_MS = 5 * 60_000;

/**
 * Periodically marks agents stuck in "running" status as "completed"
 * if they haven't received an update within the stale threshold.
 */
export function useStaleAgentCleanup(): void {
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const { agents, updateAgentStatus } = useAgentStore.getState();

      for (const agent of Object.values(agents)) {
        if (agent.status !== "running") continue;
        const lastActivity = agent.detectedAt;
        if (now - lastActivity > STALE_THRESHOLD_MS) {
          updateAgentStatus(agent.id, "completed", now);
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
