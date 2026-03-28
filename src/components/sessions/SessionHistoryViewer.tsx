import React, { useMemo } from "react";
import { useSessionHistoryStore, type SessionOutcome } from "../../store/sessionHistoryStore";

// ============================================================================
// Props
// ============================================================================

interface SessionHistoryViewerProps {
  folder: string;
}

// ============================================================================
// Helpers
// ============================================================================

const outcomeConfig: Record<SessionOutcome, { label: string; color: string }> = {
  success: { label: "Erfolg", color: "text-green-400" },
  error: { label: "Fehler", color: "text-red-400" },
  cancelled: { label: "Abgebrochen", color: "text-yellow-400" },
  unknown: { label: "Unbekannt", color: "text-zinc-400" },
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "–";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return `${hours}h ${remainingMin}m`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================================
// Component
// ============================================================================

const SessionHistoryViewer: React.FC<SessionHistoryViewerProps> = ({ folder }) => {
  const entries = useSessionHistoryStore((state) => state.entries);
  const clearForProject = useSessionHistoryStore((state) => state.clearForProject);

  const normalizedFolder = folder.replace(/\\/g, "/").toLowerCase();

  const filteredEntries = useMemo(
    () =>
      entries
        .filter((e) => e.projectFolder === normalizedFolder)
        .sort((a, b) => b.startedAt - a.startedAt),
    [entries, normalizedFolder]
  );

  if (filteredEntries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm py-8">
        Noch keine Sessions aufgezeichnet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 h-full overflow-y-auto">
      {/* Header with clear button */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-400">
          {filteredEntries.length} {filteredEntries.length === 1 ? "Eintrag" : "Einträge"}
        </span>
        <button
          onClick={() => clearForProject(folder)}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-0.5 rounded hover:bg-zinc-800"
        >
          Verlauf löschen
        </button>
      </div>

      {/* Entry list */}
      <div className="flex flex-col gap-1.5">
        {filteredEntries.map((entry) => {
          const outcome = outcomeConfig[entry.outcome];
          return (
            <div
              key={entry.id}
              className="bg-zinc-800/50 border border-zinc-700/50 rounded-md px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-200 font-medium truncate flex-1">
                  {entry.title}
                </span>
                <span className={`text-xs font-medium ${outcome.color} shrink-0`}>
                  {outcome.label}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                <span>{formatDateTime(entry.startedAt)}</span>
                <span>{formatDuration(entry.durationMs)}</span>
                {entry.agentCount > 0 && (
                  <span>
                    {entry.agentCount} {entry.agentCount === 1 ? "Agent" : "Agents"}
                  </span>
                )}
                {entry.exitCode !== null && entry.exitCode !== 0 && (
                  <span className="text-red-500">Exit {entry.exitCode}</span>
                )}
              </div>
              {entry.lastOutputSnippet && (
                <div className="mt-1 text-xs text-zinc-600 truncate">
                  {entry.lastOutputSnippet}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SessionHistoryViewer;
