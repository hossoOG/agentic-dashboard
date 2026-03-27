import { GripVertical, ExternalLink } from "lucide-react";
import type { KanbanItem } from "../../store/kanbanStore";

interface KanbanCardProps {
  item: KanbanItem;
}

const TYPE_BADGES: Record<string, { label: string; className: string }> = {
  Issue: { label: "Issue", className: "bg-green-900/30 text-green-400" },
  PullRequest: { label: "PR", className: "bg-purple-900/30 text-purple-400" },
  DraftIssue: { label: "Draft", className: "bg-neutral-700/50 text-neutral-400" },
};

const LABEL_COLORS: Record<string, string> = {
  bug: "bg-red-900/40 text-red-300",
  enhancement: "bg-blue-900/40 text-blue-300",
  feature: "bg-green-900/40 text-green-300",
  documentation: "bg-yellow-900/40 text-yellow-300",
  "good first issue": "bg-purple-900/40 text-purple-300",
};

function labelClass(label: string): string {
  return LABEL_COLORS[label.toLowerCase()] ?? "bg-neutral-700/60 text-neutral-300";
}

export function KanbanCard({ item }: KanbanCardProps) {
  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
  }

  const typeBadge = TYPE_BADGES[item.item_type];

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      className="group bg-surface-base border border-neutral-700 rounded px-3 py-2 cursor-grab
                 hover:border-neutral-500 hover:bg-hover-overlay transition-colors active:cursor-grabbing"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <GripVertical className="w-3 h-3 text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        {typeBadge && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeBadge.className}`}>
            {typeBadge.label}
          </span>
        )}
        {item.number != null && (
          <span className="text-[10px] text-neutral-500 font-mono">
            #{item.number}
          </span>
        )}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="ml-auto opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-300 transition-opacity"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <p className="text-xs text-neutral-200 line-clamp-2 leading-relaxed">
        {item.title}
      </p>

      {item.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {item.labels.map((label) => (
            <span
              key={label}
              className={`text-[10px] px-1.5 py-0.5 rounded ${labelClass(label)}`}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {item.assignees.length > 0 && (
        <div className="flex items-center gap-1 mt-1.5">
          {item.assignees.map((a) => (
            <span
              key={a}
              className="text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded"
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
