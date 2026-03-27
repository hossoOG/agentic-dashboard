import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useState, useEffect, useCallback } from "react";

const isTauri = "__TAURI_INTERNALS__" in window;

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "upToDate"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  progress: number;
  error: string | null;
  newVersion: string | null;
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

export function useAutoUpdate() {
  const [state, setState] = useState<UpdateState>({
    status: "idle",
    progress: 0,
    error: null,
    newVersion: null,
  });
  const [update, setUpdate] = useState<Update | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (!isTauri) return;
    setState((s) => ({ ...s, status: "checking", error: null }));
    try {
      const result = await check();
      if (result) {
        setUpdate(result);
        setState((s) => ({
          ...s,
          status: "available",
          newVersion: result.version,
        }));
      } else {
        setState((s) => ({ ...s, status: "upToDate" }));
      }
    } catch (err) {
      // Network errors / 404 (no release yet) → treat as up-to-date, not error
      const msg = err instanceof Error ? err.message : String(err);
      const isNetworkOrNotFound =
        /network|fetch|404|not found|could not determine/i.test(msg);
      if (isNetworkOrNotFound) {
        setState((s) => ({ ...s, status: "upToDate" }));
      } else {
        setState((s) => ({ ...s, status: "error", error: msg }));
      }
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!update) return;
    setState((s) => ({ ...s, status: "downloading", progress: 0 }));
    try {
      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalBytes = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          const pct =
            totalBytes > 0
              ? Math.round((downloadedBytes / totalBytes) * 100)
              : 0;
          setState((s) => ({ ...s, progress: pct }));
        } else if (event.event === "Finished") {
          setState((s) => ({ ...s, status: "installing", progress: 100 }));
        }
      });
      await relaunch();
    } catch (err) {
      setState((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [update]);

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, status: "idle" }));
    setUpdate(null);
  }, []);

  // Auto-check on mount, then every 30 min
  useEffect(() => {
    if (!isTauri) return;
    checkForUpdate();
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkForUpdate]);

  return { ...state, checkForUpdate, downloadAndInstall, dismiss };
}
