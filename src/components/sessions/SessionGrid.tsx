import { GridCell } from "./GridCell";

interface SessionGridProps {
  sessionIds: string[];
  focusedSessionId: string | null;
  onFocusSession: (id: string) => void;
  onMaximizeSession: (id: string) => void;
  onRemoveFromGrid: (id: string) => void;
}

function getGridStyle(count: number): React.CSSProperties {
  switch (count) {
    case 1:
      return {
        gridTemplate: '"a" 1fr / 1fr',
      };
    case 2:
      return {
        gridTemplate: '"a" 1fr "b" 1fr / 1fr',
      };
    case 3:
      return {
        gridTemplate: '"a b" 1fr "c c" 1fr / 1fr 1fr',
      };
    case 4:
    default:
      return {
        gridTemplate: '"a b" 1fr "c d" 1fr / 1fr 1fr',
      };
  }
}

const GRID_AREAS = ["a", "b", "c", "d"];

export function SessionGrid({
  sessionIds,
  focusedSessionId,
  onFocusSession,
  onMaximizeSession,
  onRemoveFromGrid,
}: SessionGridProps) {
  if (sessionIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Keine Sessions im Grid
      </div>
    );
  }

  return (
    <div
      className="h-full w-full"
      style={{
        display: "grid",
        gap: "2px",
        ...getGridStyle(sessionIds.length),
      }}
    >
      {sessionIds.map((id, index) => (
        <div key={id} style={{ gridArea: GRID_AREAS[index], minHeight: 0, minWidth: 0 }}>
          <GridCell
            sessionId={id}
            isFocused={id === focusedSessionId}
            onFocus={() => onFocusSession(id)}
            onMaximize={() => onMaximizeSession(id)}
            onRemove={() => onRemoveFromGrid(id)}
          />
        </div>
      ))}
    </div>
  );
}
