import { useState, useEffect } from "react";
import { markRender } from "../../utils/perfLogger";
import { SessionList } from "./SessionList";
import { SessionTerminal } from "./SessionTerminal";
import { GridCellChrome } from "./GridCell";
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
import { GRID_AREAS, getGridStyle, SINGLE_LAYOUT_STYLE } from "./sessionGridLayout";

export function SessionManagerView() {
  const renderDone = markRender("SessionManagerView");
  useEffect(() => { renderDone.done(); });

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const configPanelOpen = useUIStore((s) => s.configPanelOpen);
  const toggleConfigPanel = useUIStore((s) => s.toggleConfigPanel);
  const sessions = useSessionStore((s) => s.sessions);
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
  const previewFolder = useUIStore((s) => s.previewFolder);
  const closePreview = useUIStore((s) => s.closePreview);

  const { containerRef, handleResizeStart } = useResizeHandle();
  useSessionEvents();
  const { handleResumeSession, handleQuickStart } = useSessionCreation();

  // ─────────────────────────────────────────────────────────────────
  // Einheitlicher Render-Baum (Scroll-Bug-Fix, Option B).
  //
  // Alle SessionTerminals leben in EINEM stabilen JSX-Baum, egal ob
  // Single- oder Grid-Modus. Der Layout-Modus steuert nur noch
  // `grid-template` und die Sichtbarkeit der Wrapper-Divs (display).
  //
  // Frühere Implementation hatte einen Ternary `layoutMode === "single"
  // ? <single-tree> : <grid-tree>` — bei jedem Layout-Switch wurden die
  // xterm-Instanzen remountet und der Scrollback-Puffer ging verloren.
  // ─────────────────────────────────────────────────────────────────
  const isGrid = layoutMode === "grid";
  const hasAnySession = sessions.length > 0;
  const showTerminals = isGrid ? gridSessionIds.length > 0 : hasAnySession && !!activeSessionId;
  const showEmptyState = !showTerminals && !(previewFolder && !isGrid);

  // FavoritePreview (nur im Single-Modus relevant) — bei aktivem Preview
  // wird der Terminal-Baum ausgeblendet, bleibt aber gemountet, damit
  // die xterm-Instanzen beim Schliessen des Previews erhalten bleiben.
  const showPreview = !isGrid && !!previewFolder;

  const gridTemplateStyle = isGrid
    ? getGridStyle(Math.min(Math.max(gridSessionIds.length, 1), 4))
    : SINGLE_LAYOUT_STYLE;

  // Im Single-Modus bekommt die aktive Session immer "a" als grid-area.
  // Im Grid-Modus folgt der Index der Session-Reihenfolge in gridSessionIds.
  function resolveGridArea(sessionId: string): string | undefined {
    if (isGrid) {
      const idx = gridSessionIds.indexOf(sessionId);
      return idx >= 0 ? GRID_AREAS[idx] : undefined;
    }
    return sessionId === activeSessionId ? "a" : undefined;
  }

  function isVisible(sessionId: string): boolean {
    if (showPreview) return false;
    if (isGrid) return gridSessionIds.includes(sessionId);
    return sessionId === activeSessionId;
  }

  // ConfigPanel (nur Single-Modus mit aktiver Session) bzw. Preview-Panel (Grid+Single)
  const showConfigPanelSingle = !isGrid && !showPreview && configPanelOpen && !!activeSession;
  const showPreviewPanelGrid = isGrid && !!previewFolder;

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
              folder={isGrid ? undefined : activeSession?.folder}
              gridCount={gridSessionIds.length}
              configPanelOpen={configPanelOpen}
              onToggleConfigPanel={activeSessionId ? toggleConfigPanel : undefined}
            />
          )}

          {/* Content area */}
          <div className="flex-1 min-h-0">
            {/* FavoritePreview overrides the terminal view (single-mode only).
                Sessions remain mounted in a hidden sibling so xterm state is preserved. */}
            {showPreview && (
              <FavoritePreview
                key={previewFolder}
                folder={previewFolder!}
                onClose={closePreview}
                onResumeSession={handleResumeSession}
              />
            )}

            {/* EmptyState — only when no sessions AND no preview to show */}
            {!showPreview && showEmptyState && (
              <EmptyState onNewSession={() => setShowNewDialog(true)} />
            )}

            {/* Unified terminal tree — ALL sessions stay mounted regardless of layout.
                Visibility is controlled via `display: none` on the wrapper div.
                Layout-switches (single ↔ grid) do NOT remount SessionTerminal,
                so xterm's scrollback buffer survives. */}
            <div
              className="flex flex-row h-full"
              ref={containerRef}
              style={{ display: showPreview ? "none" : undefined }}
            >
              <div className="flex-1 min-w-0 flex flex-col">
                <div
                  className="flex-1 min-h-0 grid"
                  style={{
                    ...gridTemplateStyle,
                    gap: isGrid ? "2px" : undefined,
                    display: hasAnySession ? "grid" : "none",
                  }}
                  data-testid="session-terminal-root"
                >
                  {sessions.map((session) => {
                    const visible = isVisible(session.id);
                    const gridArea = resolveGridArea(session.id);
                    const isGridMember = isGrid && gridSessionIds.includes(session.id);
                    const isCellFocused = isGridMember && session.id === focusedGridSessionId;

                    return (
                      <div
                        key={session.id}
                        data-session-wrapper={session.id}
                        style={{
                          display: visible ? "flex" : "none",
                          flexDirection: "column",
                          minHeight: 0,
                          minWidth: 0,
                          gridArea,
                        }}
                        className={
                          isGridMember
                            ? `rounded-sm overflow-hidden ${isCellFocused ? "border-2 border-accent glow-accent" : "border border-neutral-700"}`
                            : undefined
                        }
                      >
                        {isGridMember && (
                          <GridCellChrome
                            sessionId={session.id}
                            isFocused={isCellFocused}
                            onFocus={() => setFocusedGridSession(session.id)}
                            onMaximize={() => maximizeGridSession(session.id)}
                            onRemove={() => removeFromGrid(session.id)}
                          />
                        )}
                        <div className="flex-1 min-h-0">
                          <SessionTerminal sessionId={session.id} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resize handle + ConfigPanel (single-mode, active session) */}
              {showConfigPanelSingle && (
                <>
                  <div
                    onMouseDown={handleResizeStart}
                    className="w-1 cursor-col-resize bg-neutral-700 hover:bg-accent transition-colors shrink-0"
                    title="Breite anpassen"
                  />
                  <ConfigPanel
                    folder={activeSession?.folder ?? ""}
                    width={configPanelWidth}
                    onResumeSession={handleResumeSession}
                  />
                </>
              )}

              {/* Preview panel (grid-mode) */}
              {showPreviewPanelGrid && (
                <>
                  <div
                    onMouseDown={handleResizeStart}
                    className="w-1 cursor-col-resize bg-neutral-700 hover:bg-accent transition-colors shrink-0"
                    title="Breite anpassen"
                  />
                  <ConfigPanel
                    folder={previewFolder!}
                    width={configPanelWidth}
                    onResumeSession={handleResumeSession}
                    onClose={closePreview}
                  />
                </>
              )}
            </div>
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
