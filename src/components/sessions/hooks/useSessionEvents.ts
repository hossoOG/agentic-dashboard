import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { createEventTracker } from "../../../utils/perfLogger";
import { useSessionStore } from "../../../store/sessionStore";
import { logError } from "../../../utils/errorLogger";

const trackSessionOutput = createEventTracker("session-output");

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
