import { ExternalLink } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { logWarn } from "../../utils/errorLogger";

export interface KanbanLabel {
  name: string;
  color: string;
}

export interface KanbanIssue {
  number: number;
  title: string;
  state: string;
  labels: KanbanLabel[];
  assignee: string;
  url: string;
}

interface KanbanCardProps {
  issue: KanbanIssue;
  onClick?: () => void;
  onDragStart?: () => void;
}

function labelStyle(color: string): React.CSSProperties {
  const hex = color.startsWith("#") ? color : `#${color}`;
  return {
    backgroundColor: `${hex}20`,
    color: hex,
    borderColor: `${hex}40`,
  };
}

async function openUrl(url: string) {
  try {
    await open(url);
  } catch {
    logWarn("KanbanCard", `shell.open failed for: ${url}`);
  }
}

export function KanbanCard({ issue, onClick, onDragStart }: KanbanCardProps) {
  return (
    <div
      className="group bg-surface-base border border-neutral-700 rounded-sm p-3 hover:border-neutral-500 transition-colors cursor-pointer"
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(issue.number));
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
    >
      {/* Header: number + external link */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-mono text-neutral-500">#{issue.number}</span>
        {issue.url && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openUrl(issue.url);
            }}
            className="p-0.5 text-neutral-600 hover:text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Im Browser öffnen"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Title */}
      <div className="text-xs text-neutral-200 leading-snug mb-2 line-clamp-2">
        {issue.title}
      </div>

      {/* Labels + Assignee */}
      <div className="flex flex-wrap items-center gap-1">
        {issue.labels.map((label) => (
          <span
            key={label.name}
            className="text-[10px] px-1.5 py-0.5 rounded-sm border font-medium"
            style={labelStyle(label.color)}
          >
            {label.name}
          </span>
        ))}
        {issue.assignee && (
          <span className="text-[10px] text-neutral-500 ml-auto">
            {issue.assignee}
          </span>
        )}
      </div>
    </div>
  );
}
