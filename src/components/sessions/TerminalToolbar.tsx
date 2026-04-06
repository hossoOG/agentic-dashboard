import { LayoutList, LayoutGrid, PanelRightOpen, PanelRightClose } from "lucide-react";
import type { LayoutMode } from "../../store/sessionStore";

interface TerminalToolbarProps {
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  activeSessionTitle?: string;
  gridCount: number;
  configPanelOpen?: boolean;
  onToggleConfigPanel?: () => void;
}

export function TerminalToolbar({
  layoutMode,
  onLayoutChange,
  activeSessionTitle,
  gridCount,
  configPanelOpen,
  onToggleConfigPanel,
}: TerminalToolbarProps) {
  return (
    <div className="flex items-center justify-between h-9 px-3 bg-surface-raised border-b border-neutral-700 shrink-0">
      {/* Left: title or grid info */}
      <span className="text-xs text-neutral-300 truncate">
        {layoutMode === "single"
          ? activeSessionTitle ?? "Kein Terminal"
          : `Grid (${gridCount} Session${gridCount !== 1 ? "s" : ""})`}
      </span>

      {/* Right: layout toggle buttons */}
      <div className="flex items-center gap-1">
        {/* Config panel toggle — only in single mode */}
        {layoutMode === "single" && onToggleConfigPanel && (
          <button
            onClick={onToggleConfigPanel}
            className={`p-1 rounded transition-colors ${
              configPanelOpen
                ? "text-accent"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
            aria-label={configPanelOpen ? "Konfig-Panel schließen" : "Konfig-Panel öffnen"}
            title={configPanelOpen ? "Konfig-Panel schließen" : "Konfig-Panel öffnen"}
          >
            {configPanelOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>
        )}

        <div className="w-px h-4 bg-neutral-700 mx-0.5" />

        <button
          onClick={() => onLayoutChange("single")}
          className={`p-1 rounded transition-colors ${
            layoutMode === "single"
              ? "text-accent"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
          aria-label="Einzelansicht"
          title="Einzelansicht"
        >
          <LayoutList className="w-4 h-4" />
        </button>
        <button
          onClick={() => onLayoutChange("grid")}
          className={`p-1 rounded transition-colors ${
            layoutMode === "grid"
              ? "text-accent"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
          aria-label="Grid-Ansicht"
          title="Grid-Ansicht"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
