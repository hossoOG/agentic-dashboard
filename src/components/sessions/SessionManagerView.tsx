import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SessionList } from "./SessionList";
import { SessionTerminal } from "./SessionTerminal";
import { SessionGrid } from "./SessionGrid";
import { TerminalToolbar } from "./TerminalToolbar";
import { NewSessionDialog } from "./NewSessionDialog";
import { SessionStatusBar } from "./SessionStatusBar";
import { EmptyState } from "./EmptyState";
import { ConfigPanel } from "./ConfigPanel";
import { AgentBottomPanel } from "./AgentBottomPanel";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useUIStore } from "../../store/uiStore";
import { useAgentStore } from "../../store/agentStore";
import { logError } from "../../utils/errorLogger";
import type { FavoriteFolder } from "../../store/settingsStore";
import type { SessionShell } from "../../store/sessionStore";

export function SessionManagerView() {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const configPanelOpen = useUIStore((s) => s.configPanelOpen);
  const toggleConfigPanel = useUIStore((s) => s.toggleConfigPanel);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = useSessionStore(selectActiveSession);
  const layoutMode = useSessionStore((s) => s.layoutMode);
  const gridSessionIds = useSessionStore((s) => s.gridSessionIds);
  const focusedGridSessionId = useSessionStore((s) => s.focusedGridSessionId);
  const setLayoutMode = useSessionStore((s) => s.setLayoutMode);
  const setFocusedGridSession = useSessionStore((s) => s.setFocusedGridSession);
  const maximizeGridSession = useSessionStore((s) => s.maximizeGridSession);
  const removeFromGrid = useSessionStore((s) => s.removeFromGrid);
  const configPanelWidth = useUIStore((s) => s.configPanelWidth);
  const setConfigPanelWidth = useUIStore((s) => s.setConfigPanelWidth);

  // --- Resize handle logic ---
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - ev.clientX;
      setConfigPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [setConfigPanelWidth]);

  // Register Tauri event listeners for session lifecycle
  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];

    // session-output → update lastOutput in store
    unlisteners.push(
      listen<{ id: string; data: string }>("session-output", (event) => {
        try {
          const id = event?.payload?.id;
          const data = event?.payload?.data;
          if (typeof id !== "string" || typeof data !== "string") return;
          const snippet = data.slice(-200);
          useSessionStore.getState().updateLastOutput(id, snippet);
        } catch (err) {
          logError("SessionManagerView.sessionOutput", err);
        }
      })
    );

    // session-exit → set exit code
    unlisteners.push(
      listen<{ id: string; exit_code: number }>("session-exit", (event) => {
        try {
          const id = event?.payload?.id;
          const exitCode = event?.payload?.exit_code;
          if (typeof id !== "string" || exitCode == null) return;
          useSessionStore.getState().setExitCode(id, exitCode);
        } catch (err) {
          logError("SessionManagerView.sessionExit", err);
        }
      })
    );

    // session-status → update status
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
          logError("SessionManagerView.sessionStatus", err);
        }
      })
    );

    // agent-detected → add agent to store
    unlisteners.push(
      listen<{
        session_id: string;
        agent_id: string;
        name: string | null;
        task: string | null;
        detected_at: number;
      }>("agent-detected", (event) => {
        try {
          const p = event?.payload;
          if (!p?.session_id || !p?.agent_id) return;
          useAgentStore.getState().addAgent({
            id: p.agent_id,
            sessionId: p.session_id,
            parentAgentId: null,
            name: p.name ?? null,
            task: p.task ?? null,
            status: "running",
            detectedAt: p.detected_at ?? Date.now(),
            completedAt: null,
            worktreePath: null,
          });
        } catch (err) {
          logError("SessionManagerView.agentDetected", err);
        }
      })
    );

    // agent-completed → update agent status
    unlisteners.push(
      listen<{
        session_id: string;
        agent_id: string;
        status: string;
        completed_at: number;
      }>("agent-completed", (event) => {
        try {
          const p = event?.payload;
          if (!p?.agent_id) return;
          const status = p.status === "error" ? "error" : "completed";
          useAgentStore.getState().updateAgentStatus(
            p.agent_id,
            status as "completed" | "error",
            p.completed_at ?? Date.now()
          );
        } catch (err) {
          logError("SessionManagerView.agentCompleted", err);
        }
      })
    );

    // worktree-detected → add worktree to store
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
          logError("SessionManagerView.worktreeDetected", err);
        }
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()).catch((e) => logError("SessionManagerView.cleanup", e)));
    };
  }, []);

  async function handleResumeSession(resumeSessionId: string, cwd: string) {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const title = "Resume Session";
    const shell = "powershell";

    try {
      const result = await invoke<{ id: string; title: string; folder: string; shell: string }>("create_session", {
        id,
        folder: cwd,
        title,
        shell,
        resumeSessionId,
      });

      const sessionId = result?.id ?? id;
      useSessionStore.getState().addSession({
        id: sessionId,
        title: result?.title ?? title,
        folder: result?.folder ?? cwd,
        shell: (result?.shell ?? shell) as SessionShell,
      });
    } catch (err) {
      logError("SessionManagerView.resumeSession", err);
    }
  }

  async function handleQuickStart(favorite: FavoriteFolder) {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const title = favorite.label;
    const folder = favorite.path;
    const shell = favorite.shell;

    try {
      const result = await invoke<{ id: string; title: string; folder: string; shell: string }>("create_session", {
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
      useSettingsStore.getState().updateFavoriteLastUsed(favorite.id);
    } catch (err) {
      logError("SessionManagerView.quickStart", err);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        {/* Left column: Session list (collapsible) */}
        {!sidebarCollapsed && (
          <div className="w-[280px] min-w-[280px] border-r border-neutral-700 flex flex-col min-h-0">
            <SessionList onNewSession={() => setShowNewDialog(true)} onQuickStart={handleQuickStart} />
          </div>
        )}
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="w-5 shrink-0 flex items-center justify-center border-r border-neutral-700 bg-surface-raised hover:bg-hover-overlay text-neutral-500 hover:text-neutral-200 transition-colors"
          title={sidebarCollapsed ? "Sidebar einblenden" : "Sidebar ausblenden"}
        >
          <span className="text-[10px]">{sidebarCollapsed ? "▶" : "◀"}</span>
        </button>

        {/* Right column: Terminal + optional Config panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Terminal Toolbar — only shown when a session exists */}
          {(activeSessionId || gridSessionIds.length > 0) && (
            <TerminalToolbar
              layoutMode={layoutMode}
              onLayoutChange={setLayoutMode}
              activeSessionTitle={activeSession?.title}
              gridCount={gridSessionIds.length}
              configPanelOpen={configPanelOpen}
              onToggleConfigPanel={activeSessionId ? toggleConfigPanel : undefined}
            />
          )}

          {/* Content area */}
          <div className="flex-1 min-h-0">
            {layoutMode === "single" ? (
              activeSessionId ? (
                <div className="flex flex-row h-full" ref={containerRef}>
                  {/* Terminal — always rendered, flex-1 */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex-1 min-h-0">
                      <SessionTerminal sessionId={activeSessionId} />
                    </div>
                    <AgentBottomPanel sessionId={activeSessionId} />
                  </div>

                  {/* Resize handle + Config panel — conditionally shown */}
                  {configPanelOpen && (
                    <>
                      <div
                        onMouseDown={handleResizeStart}
                        className="w-1 cursor-col-resize bg-neutral-700 hover:bg-accent transition-colors shrink-0"
                        title="Breite anpassen"
                      />
                      <ConfigPanel folder={activeSession?.folder ?? ""} width={configPanelWidth} onResumeSession={handleResumeSession} />
                    </>
                  )}
                </div>
              ) : (
                <EmptyState onNewSession={() => setShowNewDialog(true)} />
              )
            ) : (
              <SessionGrid
                sessionIds={gridSessionIds}
                focusedSessionId={focusedGridSessionId}
                onFocusSession={setFocusedGridSession}
                onMaximizeSession={maximizeGridSession}
                onRemoveFromGrid={removeFromGrid}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Status bar */}
      <SessionStatusBar />

      {/* Modal */}
      {showNewDialog && (
        <NewSessionDialog onClose={() => setShowNewDialog(false)} />
      )}
    </div>
  );
}
