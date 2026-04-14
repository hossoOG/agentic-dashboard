import { LayoutList, LayoutGrid, PanelRightOpen, PanelRightClose, GitBranch } from "lucide-react";
import type { LayoutMode } from "../../store/sessionStore";
import { useGitBranch } from "../../hooks/useGitBranch";

interface TerminalToolbarProps {
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  activeSessionTitle?: string;
  folder?: string;
  gridCount: number;
  configPanelOpen?: boolean;
  onToggleConfigPanel?: () => void;
}

export function TerminalToolbar({
  layoutMode,
  onLayoutChange,
  activeSessionTitle,
  folder,
  gridCount,
  configPanelOpen,
  onToggleConfigPanel,
}: TerminalToolbarProps) {
  const branch = useGitBranch(folder);

  return (
    <div className="flex items-center justify-between h-9 px-3 bg-surface-raised border-b border-neutral-700 shrink-0">
      {/* Left: title or grid info */}
      <div className="flex items-center min-w-0">
        <span className="text-xs text-neutral-300 truncate">
          {layoutMode === "single"
            ? activeSessionTitle ?? "Kein Terminal"
            : `Grid (${gridCount} Session${gridCount !== 1 ? "s" : ""})`}
        </span>
        {branch && (
          <span
            data-testid="git-branch-chip"
            title={branch}
            className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-800 text-[10px] text-neutral-400 border border-neutral-700 shrink-0 max-w-[140px]"
          >
            <GitBranch className="w-3 h-3 shrink-0" />
            <span className="truncate">{branch}</span>
          </span>
        )}
      </div>

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
