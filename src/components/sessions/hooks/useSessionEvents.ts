import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { createEventTracker } from "../../../utils/perfLogger";
import { useSessionStore } from "../../../store/sessionStore";
import { useSettingsStore } from "../../../store/settingsStore";
import { logError, logWarn } from "../../../utils/errorLogger";

const trackSessionOutput = createEventTracker("session-output");

// Private type — backend already sends started_at, only the TS type was missing
interface ClaudeHistoryEntry {
  session_id: string;
  started_at: string; // ISO-8601, e.g. "2026-04-13T10:05:00.000Z"
}

const DISCOVERY_MAX_RETRIES = 5;
const DISCOVERY_RETRY_DELAY_MS = 3_000;
// 10s covers the gap between React session creation (Date.now()) and the moment
// Claude CLI writes started_at to its session file, plus any clock skew
const DISCOVERY_TIMESTAMP_TOLERANCE_MS = 10_000;

/**
 * Registers Tauri event listeners for core session lifecycle:
 * session-output, session-exit, session-status.
 *
 * Agent/pipeline events (agent-detected, agent-completed, etc.) are
 * disabled — the pipeline feature is not production-ready.
 */
export function useSessionEvents(): void {
  const lastOutputTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const outputBuffers = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];
    const timers = lastOutputTimers.current;
    const buffers = outputBuffers.current;

    // session-output -> update lastOutput in store
    unlisteners.push(
      listen<{ id: string; data: string }>("session-output", (event) => {
        try {
          trackSessionOutput();
          const id = event?.payload?.id;
          const data = event?.payload?.data;
          if (typeof id !== "string" || typeof data !== "string") return;

          let currentBuf = buffers.get(id) || "";
          currentBuf += data;
          if (currentBuf.length > 500) currentBuf = currentBuf.slice(-500);
          buffers.set(id, currentBuf);

          if (!timers.has(id)) {
            timers.set(
              id,
              setTimeout(() => {
                const snippet = buffers.get(id)?.slice(-200) ?? "";
                useSessionStore.getState().updateLastOutput(id, snippet);
                timers.delete(id);
              }, 300),
            );
          }
        } catch (err) {
          logError("useSessionEvents.sessionOutput", err);
        }
      }),
    );

    // session-exit -> set exit code
    unlisteners.push(
      listen<{ id: string; exit_code: number }>("session-exit", (event) => {
        try {
          const id = event?.payload?.id;
          const exitCode = event?.payload?.exit_code;
          if (typeof id !== "string" || exitCode == null) return;
          useSessionStore.getState().setExitCode(id, exitCode);
        } catch (err) {
          logError("useSessionEvents.sessionExit", err);
        }
      }),
    );

    // session-status -> update status + detect Claude session ID
    const scannedSessions = new Set<string>();
    // Tracks retry attempts and pending timer IDs per session tab-id
    const retryMap = new Map<string, { count: number; timerId: ReturnType<typeof setTimeout> }>();
    // Tracks claudeSessionIds already claimed by another tab — prevents collision
    const claimedIds = new Set<string>();

    async function discoverClaudeSessionId(id: string, attempt: number): Promise<void> {
      const session = useSessionStore.getState().sessions.find((s) => s.id === id);
      // Abort if session was removed or already has an ID assigned
      if (!session || session.claudeSessionId) return;

      try {
        const history = await invoke<ClaudeHistoryEntry[]>(
          "scan_claude_sessions",
          { folder: session.folder },
        );

        if (history && history.length > 0) {
          // Find the first history entry that:
          // 1. Is not already claimed by another tab
          // 2. Has a valid timestamp at or after this session's creation time (within tolerance)
          const match = history.find((h) => {
            if (claimedIds.has(h.session_id)) return false;
            const historyTs = new Date(h.started_at).getTime();
            if (isNaN(historyTs)) return false;
            return historyTs >= session.createdAt - DISCOVERY_TIMESTAMP_TOLERANCE_MS;
          });

          if (match) {
            claimedIds.add(match.session_id);
            retryMap.delete(id);
            useSessionStore.getState().setClaudeSessionId(id, match.session_id);

            // Only write title override if none exists yet — never overwrite a
            // user-set override with an auto-discovered default title (bug fix)
            const overrides = useSettingsStore.getState().sessionTitleOverrides;
            // Re-fetch session after setClaudeSessionId in case it was updated
            const refreshedSession = useSessionStore.getState().sessions.find((s) => s.id === id);
            if (refreshedSession?.title?.trim() && !overrides[match.session_id]) {
              useSettingsStore.getState().setSessionTitleOverride(match.session_id, refreshedSession.title);
            }
            return;
          }
        }
      } catch {
        logWarn(
          "useSessionEvents",
          `Claude-Session-ID für "${session.folder}" nicht ermittelt (Versuch ${attempt})`,
        );
      }

      // No match found — retry up to DISCOVERY_MAX_RETRIES times
      const nextAttempt = attempt + 1;
      if (nextAttempt <= DISCOVERY_MAX_RETRIES) {
        const timerId = setTimeout(() => {
          discoverClaudeSessionId(id, nextAttempt).catch((e) =>
            logError("useSessionEvents.discovery.retry", e),
          );
        }, DISCOVERY_RETRY_DELAY_MS);
        retryMap.set(id, { count: nextAttempt, timerId });
      } else {
        retryMap.delete(id);
        logWarn(
          "useSessionEvents",
          `Discovery für "${session.folder}" nach ${DISCOVERY_MAX_RETRIES} Versuchen aufgegeben`,
        );
      }
    }

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
          // Once a session is running, detect its Claude CLI session ID
          if (status === "running" && !scannedSessions.has(id)) {
            scannedSessions.add(id);
            const session = useSessionStore.getState().sessions.find((s) => s.id === id);
            if (session && !session.claudeSessionId) {
              // Delay to let Claude CLI create its session file, then start discovery
              const timerId = setTimeout(() => {
                discoverClaudeSessionId(id, 1).catch((e) =>
                  logError("useSessionEvents.discovery", e),
                );
              }, DISCOVERY_RETRY_DELAY_MS);
              retryMap.set(id, { count: 1, timerId });
            }
          }
        } catch (err) {
          logError("useSessionEvents.sessionStatus", err);
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
      buffers.clear();
      // Cancel any pending discovery retries to prevent stale callbacks after unmount
      retryMap.forEach(({ timerId }) => clearTimeout(timerId));
      retryMap.clear();
      scannedSessions.clear();
    };
  }, []);
}
