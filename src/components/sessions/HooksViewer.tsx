import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Webhook, Code2 } from "lucide-react";
import { logError } from "../../utils/errorLogger";

interface HooksViewerProps {
  folder: string;
}

interface NestedHookDef {
  type?: string;
  command: string;
  timeout?: number;
}

interface HookEntry {
  matcher?: string;
  command?: string;
  hooks?: NestedHookDef[];
}

type HookSource = "project" | "project-local" | "user";

interface ResolvedHook {
  matcher?: string;
  command: string;
  timeout?: number;
  source: HookSource;
}

interface EventGroup {
  eventName: string;
  hooks: ResolvedHook[];
}

const HOOK_SOURCES: HookSource[] = ["project", "project-local", "user"];

const SOURCE_META: Record<
  HookSource,
  { label: string; color: string; dot: string; path: string }
> = {
  project: {
    label: "Projekt",
    color: "bg-accent/15 text-accent",
    dot: "bg-accent",
    path: ".claude/settings.json",
  },
  "project-local": {
    label: "Lokal",
    color: "bg-yellow-500/15 text-yellow-400",
    dot: "bg-yellow-500",
    path: ".claude/settings.local.json",
  },
  user: {
    label: "User",
    color: "bg-purple-400/15 text-purple-300",
    dot: "bg-purple-400",
    path: "~/.claude/settings.json",
  },
};

function parseHooks(raw: string): Record<string, HookEntry[]> | null {
  try {
    const parsed = JSON.parse(raw);
    const hooks = parsed?.hooks;
    if (!hooks || typeof hooks !== "object") return null;
    return hooks as Record<string, HookEntry[]>;
  } catch {
    return null;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildEventGroups(raws: Record<HookSource, string>): EventGroup[] {
  const eventMap = new Map<string, ResolvedHook[]>();

  for (const source of HOOK_SOURCES) {
    const raw = raws[source];
    if (!raw) continue;
    const parsed = parseHooks(raw);
    if (!parsed) continue;

    for (const [eventName, hooks] of Object.entries(parsed)) {
      const existing = eventMap.get(eventName) ?? [];
      for (const entry of Array.isArray(hooks) ? hooks : []) {
        if (entry.hooks && Array.isArray(entry.hooks)) {
          // Nested format: { matcher, hooks: [{ type, command, timeout }] }
          for (const nested of entry.hooks) {
            existing.push({
              matcher: entry.matcher,
              command: nested.command,
              timeout: nested.timeout,
              source,
            });
          }
        } else if (entry.command) {
          // Flat format: { matcher, command }
          existing.push({
            matcher: entry.matcher,
            command: entry.command,
            source,
          });
        }
      }
      eventMap.set(eventName, existing);
    }
  }

  return Array.from(eventMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([eventName, hooks]) => ({ eventName, hooks }));
}

export function HooksViewer({ folder }: HooksViewerProps) {
  const [raws, setRaws] = useState<Record<HookSource, string>>({
    project: "",
    "project-local": "",
    user: "",
  });
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        invoke<string>("read_project_file", {
          folder,
          relativePath: ".claude/settings.json",
        }),
        invoke<string>("read_project_file", {
          folder,
          relativePath: ".claude/settings.local.json",
        }),
        invoke<string>("read_user_claude_file", {
          relativePath: "settings.json",
        }),
      ]);

      const values = results.map((r) =>
        r.status === "fulfilled" ? (r.value ?? "") : "",
      );

      setRaws({
        project: values[0],
        "project-local": values[1],
        user: values[2],
      });
    } catch (err) {
      logError("HooksViewer.load", err);
      setRaws({ project: "", "project-local": "", user: "" });
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    load();
  }, [load]);

  const eventGroups = useMemo(() => buildEventGroups(raws), [raws]);

  const visibleSources = useMemo(
    () => new Set(eventGroups.flatMap((g) => g.hooks.map((h) => h.source))),
    [eventGroups],
  );

  const activeSources = useMemo(() => {
    const sources: { source: HookSource; raw: string }[] = [];
    for (const s of HOOK_SOURCES) {
      if (raws[s]) sources.push({ source: s, raw: raws[s] });
    }
    return sources;
  }, [raws]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Hooks...
      </div>
    );
  }

  if (eventGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500 px-6">
        <Webhook className="w-10 h-10 text-neutral-600" />
        <span className="text-sm font-medium">Keine Hooks konfiguriert</span>
        <p className="text-xs text-neutral-600 text-center max-w-xs leading-relaxed">
          Hooks reagieren auf Events wie{" "}
          <code className="text-neutral-400">PreToolUse</code> oder{" "}
          <code className="text-neutral-400">PostToolUse</code>. Konfiguriere
          sie in <code className="text-neutral-400">.claude/settings.json</code>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700 shrink-0">
        <div className="flex items-center gap-3">
          <span className="ae-body-sm font-medium">
            {eventGroups.length}{" "}
            {eventGroups.length === 1 ? "Event" : "Events"}
          </span>
          {/* Source legend */}
          <div className="flex items-center gap-2">
            {HOOK_SOURCES.map((s) => {
                const meta = SOURCE_META[s];
                if (!visibleSources.has(s)) return null;
                return (
                  <div
                    key={s}
                    className="flex items-center gap-1"
                    title={meta.path}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}
                    />
                    <span className="text-[10px] text-neutral-500">
                      {meta.label}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`p-1 transition-colors rounded-sm ${
              showRaw
                ? "text-accent bg-accent-a10"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
            title={showRaw ? "Strukturierte Ansicht" : "Raw JSON"}
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={load}
            className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Neu laden"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {showRaw ? (
          <div className="space-y-3">
            {activeSources.map(({ source, raw }) => (
              <div key={source}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${SOURCE_META[source].dot}`}
                  />
                  <span className="text-xs text-neutral-400 font-medium">
                    {SOURCE_META[source].label}
                  </span>
                  <span className="text-[10px] text-neutral-600">
                    {SOURCE_META[source].path}
                  </span>
                </div>
                <pre className="text-xs text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed bg-surface-raised rounded-sm p-3 border border-neutral-700">
                  {raw}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {eventGroups.map((group) => (
              <EventGroupCard key={group.eventName} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: HookSource }) {
  const meta = SOURCE_META[source];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-sm ${meta.color}`}
      title={meta.path}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/** Extract a short display name from a command string (e.g. last path segment or first token). */
// eslint-disable-next-line react-refresh/only-export-components
export function extractHookName(command: string): string {
  const trimmed = command.trim();
  // Try to find a file path (e.g. "node .claude/hooks/safe-guard.mjs" → "safe-guard.mjs")
  const parts = trimmed.split(/\s+/);
  for (const part of parts) {
    const match = part.match(/[/\\]([^/\\]+)$/);
    if (match) return match[1];
  }
  // Fallback: return the whole command if short, or first meaningful token
  return trimmed.length <= 30 ? trimmed : parts.slice(0, 2).join(" ");
}

function EventGroupCard({ group }: { group: EventGroup }) {
  return (
    <div>
      <div className="text-xs text-accent font-bold mb-2">
        {group.eventName}
      </div>
      <div className="space-y-2">
        {group.hooks.map((hook, i) => (
          <div
            key={i}
            className="bg-surface-raised border border-neutral-700 rounded-sm px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <SourceBadge source={hook.source} />
                <span className="text-xs text-neutral-200 font-semibold">
                  {extractHookName(hook.command)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {hook.timeout != null && (
                  <span className="text-[10px] text-neutral-600">
                    {(hook.timeout / 1000).toFixed(0)}s
                  </span>
                )}
                {hook.matcher && (
                  <span className="text-[11px] text-neutral-500">
                    Matcher:{" "}
                    <code className="text-neutral-300 font-mono">
                      {hook.matcher}
                    </code>
                  </span>
                )}
              </div>
            </div>
            <div className="bg-neutral-900 font-mono text-xs px-3 py-2 rounded-sm text-neutral-200">
              {hook.command}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
