import { LayoutList, LayoutGrid } from "lucide-react";
import type { LayoutMode } from "../../store/sessionStore";

interface TerminalToolbarProps {
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  activeSessionTitle?: string;
  gridCount: number;
}

export function TerminalToolbar({
  layoutMode,
  onLayoutChange,
  activeSessionTitle,
  gridCount,
}: TerminalToolbarProps) {
  return (
    <div className="flex items-center justify-between h-9 px-3 bg-surface-raised border-b border-dark-border shrink-0">
      {/* Left: title or grid info */}
      <span className="text-xs text-neutral-300 truncate">
        {layoutMode === "single"
          ? activeSessionTitle ?? "Kein Terminal"
          : `Grid (${gridCount} Session${gridCount !== 1 ? "s" : ""})`}
      </span>

      {/* Right: layout toggle buttons */}
      <div className="flex items-center gap-1">
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
