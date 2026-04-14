import { useState, useEffect } from "react";
import { markRender } from "../../utils/perfLogger";
import { SessionList } from "./SessionList";
import { SessionTerminal } from "./SessionTerminal";
import { SessionGrid } from "./SessionGrid";
import { TerminalToolbar } from "./TerminalToolbar";
import { NewSessionDialog } from "./NewSessionDialog";
import { SessionStatusBar } from "./SessionStatusBar";
import { EmptyState } from "./EmptyState";
import { ConfigPanel } from "./ConfigPanel";
import { FavoritePreview } from "./FavoritePreview";
import { useSessionStore, selectActiveSession } from "../../store/sessionStore";
import { useUIStore } from "../../store/uiStore";
import { useResizeHandle } from "./hooks/useResizeHandle";
import { useSessionEvents } from "./hooks/useSessionEvents";
import { useSessionCreation } from "./hooks/useSessionCreation";

export function SessionManagerView() {
  const renderDone = markRender("SessionManagerView");
  useEffect(() => { renderDone.done(); });

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const configPanelOpen = useUIStore((s) => s.configPanelOpen);
  const toggleConfigPanel = useUIStore((s) => s.toggleConfigPanel);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeSession = useSessionStore(selectActiveSession);
  const layoutMode = useSessionStore((s) => s.layoutMode);
  const gridSessionIds = useSessionStore((s) => s.gridSessionIds);
  const focusedGridSessionId = useSessionStore((s) => s.focusedGridSessionId);
  const focusedGridSession = useSessionStore((s) =>
    s.sessions.find((sess) => sess.id === s.focusedGridSessionId)
  );
  const setLayoutMode = useSessionStore((s) => s.setLayoutMode);
  const setFocusedGridSession = useSessionStore((s) => s.setFocusedGridSession);
  const maximizeGridSession = useSessionStore((s) => s.maximizeGridSession);
  const removeFromGrid = useSessionStore((s) => s.removeFromGrid);
  const configPanelWidth = useUIStore((s) => s.configPanelWidth);
  const previewFolder = useUIStore((s) => s.previewFolder);
  const closePreview = useUIStore((s) => s.closePreview);

  const { containerRef, handleResizeStart } = useResizeHandle();
  useSessionEvents();
  const { handleResumeSession, handleQuickStart } = useSessionCreation();

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
              folder={layoutMode === "grid" ? focusedGridSession?.folder : activeSession?.folder}
              gridCount={gridSessionIds.length}
              configPanelOpen={configPanelOpen}
              onToggleConfigPanel={activeSessionId ? toggleConfigPanel : undefined}
            />
          )}

          {/* Content area */}
          <div className="flex-1 min-h-0">
            {layoutMode === "single" ? (
              previewFolder ? (
                <FavoritePreview
                  key={previewFolder}
                  folder={previewFolder}
                  onClose={closePreview}
                  onResumeSession={handleResumeSession}
                />
              ) : activeSessionId ? (
                <div className="flex flex-row h-full" ref={containerRef}>
                  {/* Terminal — always rendered, flex-1 */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex-1 min-h-0">
                      <SessionTerminal sessionId={activeSessionId} />
                    </div>
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
              <div className="flex flex-row h-full" ref={containerRef}>
              <div className="flex-1 min-w-0">
                <SessionGrid
                  sessionIds={gridSessionIds}
                  focusedSessionId={focusedGridSessionId}
                  onFocusSession={setFocusedGridSession}
                  onMaximizeSession={maximizeGridSession}
                  onRemoveFromGrid={removeFromGrid}
                />
              </div>
              {previewFolder && (
                <>
                  <div
                    onMouseDown={handleResizeStart}
                    className="w-1 cursor-col-resize bg-neutral-700 hover:bg-accent transition-colors shrink-0"
                    title="Breite anpassen"
                  />
                  <ConfigPanel folder={previewFolder} width={configPanelWidth} onResumeSession={handleResumeSession} onClose={closePreview} />
                </>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Status bar */}
      <SessionStatusBar />

      {/* Modal */}
      <NewSessionDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} />
    </div>
  );
}
