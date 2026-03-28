import { useState, useEffect, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SessionList } from "./SessionList";
import { SessionTerminal } from "./SessionTerminal";
import { SessionGrid } from "./SessionGrid";
import { TerminalToolbar } from "./TerminalToolbar";
import { NewSessionDialog } from "./NewSessionDialog";
import { SessionStatusBar } from "./SessionStatusBar";
import { EmptyState } from "./EmptyState";
import { ContentTabs, type PrimaryTab, type ConfigSubTab } from "./ContentTabs";
import { AgentBottomPanel } from "./AgentBottomPanel";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useUIStore } from "../../store/uiStore";
import { useAgentStore } from "../../store/agentStore";
import type { FavoriteFolder } from "../../store/settingsStore";
import type { SessionShell } from "../../store/sessionStore";

const ClaudeMdViewer = lazy(() => import("./ClaudeMdViewer").then(m => ({ default: m.ClaudeMdViewer })));
const SkillsViewer = lazy(() => import("./SkillsViewer").then(m => ({ default: m.SkillsViewer })));
const HooksViewer = lazy(() => import("./HooksViewer").then(m => ({ default: m.HooksViewer })));
const GitHubViewer = lazy(() => import("./GitHubViewer").then(m => ({ default: m.GitHubViewer })));
const WorktreeViewer = lazy(() => import("./WorktreeViewer").then(m => ({ default: m.WorktreeViewer })));

export function SessionManagerView() {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("terminal");
  const configSubTab = useUIStore((s) => s.configSubTab);
  const setConfigSubTab = useUIStore((s) => s.setConfigSubTab);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = useSessionStore(selectActiveSession);
  const layoutMode = useSessionStore((s) => s.layoutMode);
  const gridSessionIds = useSessionStore((s) => s.gridSessionIds);
  const focusedGridSessionId = useSessionStore((s) => s.focusedGridSessionId);
  const setLayoutMode = useSessionStore((s) => s.setLayoutMode);
  const setFocusedGridSession = useSessionStore((s) => s.setFocusedGridSession);
  const maximizeGridSession = useSessionStore((s) => s.maximizeGridSession);
  const removeFromGrid = useSessionStore((s) => s.removeFromGrid);

  const handleTabChange = (primary: PrimaryTab, configSub?: ConfigSubTab) => {
    setPrimaryTab(primary);
    if (configSub) {
      setConfigSubTab(configSub);
    }
  };

  // Reset to terminal tab when switching sessions
  useEffect(() => {
    setPrimaryTab("terminal");
  }, [activeSessionId]);

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
          console.error("[SessionManagerView] session-output handler error:", err);
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
          console.error("[SessionManagerView] session-exit handler error:", err);
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
          console.error("[SessionManagerView] session-status handler error:", err);
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
          console.error("[SessionManagerView] agent-detected handler error:", err);
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
          console.error("[SessionManagerView] agent-completed handler error:", err);
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
          console.error("[SessionManagerView] worktree-detected handler error:", err);
        }
      })
    );

    return () => {
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()).catch(console.error));
    };
  }, []);

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
      console.error("[SessionManagerView] Quick start failed:", err);
    }
  }

  // Determine what content to show
  const showConfig = primaryTab === "config";

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        {/* Left column: Session list */}
        <div className="w-[280px] min-w-[280px] border-r border-neutral-700 flex flex-col">
          <SessionList onNewSession={() => setShowNewDialog(true)} onQuickStart={handleQuickStart} />
        </div>

        {/* Right column: Terminal or Empty State */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Terminal Toolbar — only shown when a session exists */}
          {(activeSessionId || gridSessionIds.length > 0) && (
            <TerminalToolbar
              layoutMode={layoutMode}
              onLayoutChange={setLayoutMode}
              activeSessionTitle={activeSession?.title}
              gridCount={gridSessionIds.length}
            />
          )}

          {/* Content tabs — only in single mode with active session */}
          {layoutMode === "single" && activeSessionId && (
            <ContentTabs
              activeTab={primaryTab}
              configSubTab={configSubTab}
              onTabChange={handleTabChange}
            />
          )}

          {/* Content area */}
          <div className="flex-1 min-h-0">
            {layoutMode === "single" ? (
              activeSessionId ? (
                showConfig ? (
                  <Suspense fallback={<div className="flex-1 flex items-center justify-center text-neutral-500">Laden...</div>}>
                    {configSubTab === "claude-md" ? (
                      <ClaudeMdViewer folder={activeSession?.folder ?? ""} />
                    ) : configSubTab === "skills" ? (
                      <SkillsViewer folder={activeSession?.folder ?? ""} />
                    ) : configSubTab === "hooks" ? (
                      <HooksViewer folder={activeSession?.folder ?? ""} />
                    ) : configSubTab === "github" ? (
                      <GitHubViewer folder={activeSession?.folder ?? ""} />
                    ) : configSubTab === "worktrees" ? (
                      <WorktreeViewer folder={activeSession?.folder ?? ""} />
                    ) : null}
                  </Suspense>
                ) : (
                  <div className="flex flex-col h-full">
                    <div className="flex-1 min-h-0">
                      <SessionTerminal sessionId={activeSessionId} />
                    </div>
                    <AgentBottomPanel sessionId={activeSessionId} />
                  </div>
                )
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
