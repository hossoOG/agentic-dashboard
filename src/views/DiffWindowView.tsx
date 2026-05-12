import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DiffFileList } from "../components/diff/DiffFileList";
import { DiffMergeView } from "../components/diff/DiffMergeView";
import { DiffWindowFooter } from "../components/diff/DiffWindowFooter";
import type { DiffViewMode, SessionDiff } from "../components/diff/types";
import { logError } from "../utils/errorLogger";

interface DiffWindowViewProps {
  sessionId: string | null;
}

/**
 * Top-Level-View des Session-Diff-Windows.
 *
 * Lifecycle:
 *  - Mount: invoke `get_session_diff` mit der URL-Session-ID, lokalen State setzen.
 *  - Auto-Refresh-on-Focus: Listener auf `tauri://focus` → refresh, ausser frozen.
 *  - Session-Close: Listener auf `session-deleted/<id>` → frozen-Banner anzeigen.
 *
 * State bleibt komplett lokal — das Diff-Window haengt nicht am Haupt-Fenster-Zustand,
 * weil es eine eigene WebviewWindow ist und der `?view=diff`-Pivot in main.tsx
 * den Store-Bootstrap ueberspringt.
 */
export function DiffWindowView({ sessionId }: DiffWindowViewProps) {
  const [diff, setDiff] = useState<SessionDiff | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [viewMode, setViewMode] = useState<DiffViewMode>("side");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const frozenRef = useRef(false);

  const loadDiff = useCallback(async () => {
    if (!sessionId) {
      setError("Keine Session-ID in URL — Diff-Window kann nicht laden.");
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const next = await invoke<SessionDiff>("get_session_diff", { sessionId });
      setDiff(next);
      setSelectedFileIndex((prev) => {
        if (!next.files.length) return 0;
        return Math.min(prev, next.files.length - 1);
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      setError(msg);
      logError("DiffWindowView.loadDiff", err);
    } finally {
      setRefreshing(false);
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    loadDiff().catch((e) => logError("DiffWindowView.initial", e));
  }, [loadDiff]);

  // session-deleted event → freeze
  useEffect(() => {
    if (!sessionId) return;
    let unlistenFn: (() => void) | null = null;
    listen<unknown>(`session-deleted/${sessionId}`, () => {
      frozenRef.current = true;
      setFrozen(true);
    })
      .then((u) => {
        unlistenFn = u;
      })
      .catch((err) => logError("DiffWindowView.sessionDeleted", err));
    return () => {
      unlistenFn?.();
    };
  }, [sessionId]);

  // Auto-Refresh-on-Focus — Tauri emit `tauri://focus` when window regains focus.
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    listen<unknown>("tauri://focus", () => {
      if (frozenRef.current) return;
      loadDiff().catch((e) => logError("DiffWindowView.onFocus", e));
    })
      .then((u) => {
        unlistenFn = u;
      })
      .catch((err) => logError("DiffWindowView.focusListener", err));
    return () => {
      unlistenFn?.();
    };
  }, [loadDiff]);

  const selectedFile = diff?.files[selectedFileIndex] ?? null;

  return (
    <div className="flex flex-col h-screen w-screen bg-surface-base text-neutral-200">
      <div className="px-4 py-3 border-b border-neutral-700 flex items-center gap-2">
        <h1 className="text-xs font-bold uppercase tracking-widest text-neutral-300">
          Session-Diff
        </h1>
        {sessionId && (
          <span className="font-mono text-[10px] text-neutral-500 truncate">
            {sessionId}
          </span>
        )}
      </div>

      {frozen && (
        <div
          role="status"
          className="px-4 py-2 border-b border-warning bg-warning-a10 text-xs text-warning"
        >
          Session beendet — Diff eingefroren. Refresh deaktiviert.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="px-4 py-3 border-b border-error bg-error-a05 text-xs flex items-center gap-3"
        >
          <span className="text-error">{error}</span>
          <button
            type="button"
            onClick={() => loadDiff().catch((e) => logError("DiffWindowView.retry", e))}
            disabled={refreshing}
            className="px-2 py-1 border border-neutral-700 hover:bg-hover-overlay text-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Erneut versuchen
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-72 border-r border-neutral-700 shrink-0">
          <DiffFileList
            files={diff?.files ?? []}
            selectedIndex={selectedFileIndex}
            onSelect={setSelectedFileIndex}
          />
        </div>
        <div className="flex-1 min-w-0">
          {selectedFile ? (
            <DiffMergeView file={selectedFile} mode={viewMode} />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-neutral-400">
              {refreshing ? "Lade Diff..." : "Keine Auswahl."}
            </div>
          )}
        </div>
      </div>

      <DiffWindowFooter
        diff={diff}
        mode={viewMode}
        onModeChange={setViewMode}
        onRefresh={() => loadDiff().catch((e) => logError("DiffWindowView.refresh", e))}
        refreshing={refreshing}
        frozen={frozen}
      />
    </div>
  );
}
