import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { SessionList } from "./SessionList";
import { SessionTerminal } from "./SessionTerminal";
import { SessionGrid } from "./SessionGrid";
import { TerminalToolbar } from "./TerminalToolbar";
import { NewSessionDialog } from "./NewSessionDialog";
import { SessionStatusBar } from "./SessionStatusBar";
import { EmptyState } from "./EmptyState";
import { ContentTabs, type ContentTab } from "./ContentTabs";
import { ClaudeMdViewer } from "./ClaudeMdViewer";
import { SkillsViewer } from "./SkillsViewer";
import { HooksViewer } from "./HooksViewer";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import type { FavoriteFolder } from "../../store/settingsStore";
import type { SessionShell } from "../../store/sessionStore";

export function SessionManagerView() {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [contentTab, setContentTab] = useState<ContentTab>("terminal");
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = useSessionStore(selectActiveSession);
  const layoutMode = useSessionStore((s) => s.layoutMode);
  const gridSessionIds = useSessionStore((s) => s.gridSessionIds);
  const focusedGridSessionId = useSessionStore((s) => s.focusedGridSessionId);
  const setLayoutMode = useSessionStore((s) => s.setLayoutMode);
  const setFocusedGridSession = useSessionStore((s) => s.setFocusedGridSession);
  const maximizeGridSession = useSessionStore((s) => s.maximizeGridSession);
  const removeFromGrid = useSessionStore((s) => s.removeFromGrid);

  // Reset content tab to terminal when switching sessions
  useEffect(() => {
    setContentTab("terminal");
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        {/* Left column: Session list */}
        <div className="w-[280px] min-w-[280px] border-r border-dark-border flex flex-col">
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
            <ContentTabs activeTab={contentTab} onTabChange={setContentTab} />
          )}

          {/* Content area */}
          <div className="flex-1 min-h-0">
            {layoutMode === "single" ? (
              activeSessionId ? (
                contentTab === "terminal" ? (
                  <SessionTerminal sessionId={activeSessionId} />
                ) : contentTab === "claude-md" ? (
                  <ClaudeMdViewer folder={activeSession?.folder ?? ""} />
                ) : contentTab === "skills" ? (
                  <SkillsViewer folder={activeSession?.folder ?? ""} />
                ) : contentTab === "hooks" ? (
                  <HooksViewer folder={activeSession?.folder ?? ""} />
                ) : null
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
