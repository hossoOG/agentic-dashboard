import { useEffect, useRef, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  RefreshCw,
  Trash2,
  ArrowDownToLine,
  Search,
} from "lucide-react";
import {
  useLogViewerStore,
  parseBackendLogLine,
  type LogSeverity,
  type LogSource,
} from "../../store/logViewerStore";
import { getRecentLogs, subscribeToLogs } from "../../utils/errorLogger";
import { LogEntryRow } from "./LogEntry";

const SEVERITY_OPTIONS: { key: LogSeverity; label: string; color: string }[] = [
  { key: "error", label: "Error", color: "bg-red-400/20 text-red-400 border-red-400/40" },
  { key: "warn", label: "Warn", color: "bg-yellow-400/20 text-yellow-400 border-yellow-400/40" },
  { key: "info", label: "Info", color: "bg-blue-400/20 text-blue-400 border-blue-400/40" },
];

const SOURCE_OPTIONS: { key: LogSource; label: string; color: string }[] = [
  { key: "frontend", label: "Frontend", color: "bg-purple-400/20 text-purple-400 border-purple-400/40" },
  { key: "backend", label: "Backend", color: "bg-emerald-400/20 text-emerald-400 border-emerald-400/40" },
  { key: "pipeline", label: "Pipeline", color: "bg-orange-400/20 text-orange-400 border-orange-400/40" },
];

export function LogViewer() {
  const {
    entries,
    severityFilter,
    sourceFilter,
    searchText,
    liveTail,
    addEntries,
    clearEntries,
    setSeverityFilter,
    setSourceFilter,
    setSearchText,
    toggleLiveTail,
  } = useLogViewerStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load backend logs + existing frontend logs on mount
  const loadBackendLogs = useCallback(() => {
    invoke<string[]>("read_backend_log", { maxLines: 500 })
      .then((lines) => {
        const parsed = lines
          .map(parseBackendLogLine)
          .filter((e): e is NonNullable<typeof e> => e !== null);
        if (parsed.length > 0) addEntries(parsed);
      })
      .catch((err) => console.error("[LogViewer] Failed to read backend log:", err));
  }, [addEntries]);

  useEffect(() => {
    // Load existing frontend logs
    const existing = getRecentLogs();
    if (existing.length > 0) {
      addEntries(
        existing.map((e) => ({
          timestamp: e.timestamp,
          severity: e.severity,
          source: "frontend" as const,
          module: e.source,
          message: e.message,
          stack: e.stack,
        }))
      );
    }

    // Load backend logs
    loadBackendLogs();

    // Subscribe to live frontend logs
    const unsub = subscribeToLogs((entry) => {
      addEntries([
        {
          timestamp: entry.timestamp,
          severity: entry.severity,
          source: "frontend",
          module: entry.source,
          message: entry.message,
          stack: entry.stack,
        },
      ]);
    });

    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll when liveTail is on
  useEffect(() => {
    if (liveTail && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, liveTail]);

  // Filter entries
  const filtered = useMemo(() => {
    const lowerSearch = searchText.toLowerCase();
    return entries.filter((e) => {
      if (!severityFilter.has(e.severity)) return false;
      if (!sourceFilter.has(e.source)) return false;
      if (lowerSearch && !e.message.toLowerCase().includes(lowerSearch)) return false;
      return true;
    });
  }, [entries, severityFilter, sourceFilter, searchText]);

  const toggleSeverity = (key: LogSeverity) => {
    const next = new Set(severityFilter);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSeverityFilter(next);
  };

  const toggleSource = (key: LogSource) => {
    const next = new Set(sourceFilter);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSourceFilter(next);
  };

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-700 bg-surface-raised flex-wrap">
        {/* Severity filters */}
        <div className="flex gap-1">
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => toggleSeverity(opt.key)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-all ${
                severityFilter.has(opt.key)
                  ? opt.color
                  : "bg-transparent text-neutral-500 border-neutral-700 opacity-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-neutral-700" />

        {/* Source filters */}
        <div className="flex gap-1">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => toggleSource(opt.key)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-all ${
                sourceFilter.has(opt.key)
                  ? opt.color
                  : "bg-transparent text-neutral-500 border-neutral-700 opacity-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-neutral-700" />

        {/* Search */}
        <div className="relative flex-1 min-w-[140px] max-w-[300px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Suchen..."
            className="w-full pl-7 pr-2 py-1 text-xs bg-surface-base border border-neutral-700 rounded text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex gap-1">
          <button
            onClick={toggleLiveTail}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-all ${
              liveTail
                ? "bg-accent-a10 text-accent"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
            title="Live-Tail"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Live
          </button>

          <button
            onClick={loadBackendLogs}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-200 rounded transition-all"
            title="Backend-Logs aktualisieren"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={clearEntries}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-neutral-400 hover:text-red-400 rounded transition-all"
            title="Logs leeren"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Entry count */}
      <div className="flex items-center justify-between px-4 py-1 text-[10px] text-neutral-500 border-b border-neutral-800">
        <span>
          {filtered.length} von {entries.length} Einträgen
        </span>
      </div>

      {/* Log list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-neutral-500 text-sm">
            Keine Logs vorhanden
          </div>
        ) : (
          filtered.map((entry) => <LogEntryRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
