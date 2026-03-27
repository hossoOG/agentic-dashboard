import { create } from "zustand";

export type LogSeverity = "error" | "warn" | "info";
export type LogSource = "frontend" | "backend" | "pipeline";

export interface UnifiedLogEntry {
  id: number;
  timestamp: string;
  severity: LogSeverity;
  source: LogSource;
  module?: string;
  message: string;
  stack?: string;
}

const MAX_ENTRIES = 1000;
let entryCounter = 0;

interface LogViewerState {
  entries: UnifiedLogEntry[];
  severityFilter: Set<LogSeverity>;
  sourceFilter: Set<LogSource>;
  searchText: string;
  liveTail: boolean;

  addEntries: (entries: Omit<UnifiedLogEntry, "id">[]) => void;
  clearEntries: () => void;
  setSeverityFilter: (filter: Set<LogSeverity>) => void;
  setSourceFilter: (filter: Set<LogSource>) => void;
  setSearchText: (text: string) => void;
  toggleLiveTail: () => void;
}

export const useLogViewerStore = create<LogViewerState>((set) => ({
  entries: [],
  severityFilter: new Set<LogSeverity>(["error", "warn", "info"]),
  sourceFilter: new Set<LogSource>(["frontend", "backend", "pipeline"]),
  searchText: "",
  liveTail: true,

  addEntries: (newEntries) =>
    set((state) => {
      const withIds = newEntries.map((e) => ({ ...e, id: ++entryCounter }));
      const merged = [...state.entries, ...withIds];
      return { entries: merged.slice(-MAX_ENTRIES) };
    }),

  clearEntries: () => set({ entries: [] }),

  setSeverityFilter: (filter) => set({ severityFilter: filter }),
  setSourceFilter: (filter) => set({ sourceFilter: filter }),
  setSearchText: (text) => set({ searchText: text }),
  toggleLiveTail: () => set((state) => ({ liveTail: !state.liveTail })),
}));

/** Parse a Rust backend log line into a UnifiedLogEntry (without id) */
export function parseBackendLogLine(
  line: string
): Omit<UnifiedLogEntry, "id"> | null {
  const match = line.match(
    /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\] \[(\w+)\] \[([^\]]+)\] (.*)$/
  );
  if (!match) return null;

  const [, timestamp, level, module, message] = match;
  const severityMap: Record<string, LogSeverity> = {
    ERROR: "error",
    WARN: "warn",
    INFO: "info",
    DEBUG: "info",
    TRACE: "info",
  };

  return {
    timestamp: timestamp.replace(" ", "T") + "Z",
    severity: severityMap[level] ?? "info",
    source: "backend",
    module,
    message,
  };
}
