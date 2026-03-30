import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Webhook, ChevronDown, ChevronRight } from "lucide-react";
import { logError } from "../../utils/errorLogger";

interface HooksViewerProps {
  folder: string;
}

interface HookEntry {
  matcher?: string;
  command: string;
}

type HookSource = "project" | "project-local" | "user";

interface HookGroup {
  eventName: string;
  hooks: HookEntry[];
  source: HookSource;
}

interface SourceSection {
  source: HookSource;
  label: string;
  path: string;
  borderColor: string;
  dotColor: string;
  groups: HookGroup[];
  raw: string;
  exists: boolean;
}

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

function buildSection(
  source: HookSource,
  label: string,
  path: string,
  borderColor: string,
  dotColor: string,
  raw: string
): SourceSection {
  const exists = raw.length > 0;
  const parsed = exists ? parseHooks(raw) : null;
  const groups: HookGroup[] = parsed
    ? Object.entries(parsed).map(([eventName, hooks]) => ({
        eventName,
        hooks: Array.isArray(hooks) ? hooks : [],
        source,
      }))
    : [];

  return { source, label, path, borderColor, dotColor, groups, raw, exists };
}

const SOURCE_DEFS: {
  source: HookSource;
  label: string;
  path: string;
  borderColor: string;
  dotColor: string;
}[] = [
  {
    source: "project",
    label: "Projekt",
    path: ".claude/settings.json",
    borderColor: "border-l-accent",
    dotColor: "bg-accent",
  },
  {
    source: "project-local",
    label: "Projekt (lokal)",
    path: ".claude/settings.local.json",
    borderColor: "border-l-yellow-500",
    dotColor: "bg-yellow-500",
  },
  {
    source: "user",
    label: "Benutzer",
    path: "~/.claude/settings.json",
    borderColor: "border-l-purple-400",
    dotColor: "bg-purple-400",
  },
];

export function HooksViewer({ folder }: HooksViewerProps) {
  const [sections, setSections] = useState<SourceSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<HookSource, boolean>>({
    project: false,
    "project-local": false,
    user: false,
  });
  const [rawView, setRawView] = useState<Record<HookSource, boolean>>({
    project: false,
    "project-local": false,
    user: false,
  });

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

      const raws = results.map((r) =>
        r.status === "fulfilled" ? (r.value ?? "") : ""
      );

      const built = SOURCE_DEFS.map((def, i) =>
        buildSection(def.source, def.label, def.path, def.borderColor, def.dotColor, raws[i])
      );

      setSections(built);

      // Auto-collapse non-existent sources
      setCollapsed((prev) => {
        const next = { ...prev };
        for (const s of built) {
          if (!s.exists) next[s.source] = true;
        }
        return next;
      });
    } catch (err) {
      logError("HooksViewer.load", err);
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleCollapse = (source: HookSource) => {
    setCollapsed((prev) => ({ ...prev, [source]: !prev[source] }));
  };

  const toggleRaw = (source: HookSource) => {
    setRawView((prev) => ({ ...prev, [source]: !prev[source] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Hooks...
      </div>
    );
  }

  const allEmpty = sections.every((s) => !s.exists || s.groups.length === 0);
  const noneExist = sections.every((s) => !s.exists);

  if (noneExist) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <Webhook className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Keine Hooks konfiguriert</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 shrink-0">
        <span className="text-xs text-neutral-400 font-medium">Hooks</span>
        <button
          onClick={load}
          className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Neu laden"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {allEmpty && !noneExist && (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-neutral-500">
            <Webhook className="w-10 h-10 text-neutral-600" />
            <span className="text-sm">Keine Hooks konfiguriert</span>
          </div>
        )}

        {sections.map((section) => (
          <SourceSectionCard
            key={section.source}
            section={section}
            isCollapsed={collapsed[section.source]}
            isRaw={rawView[section.source]}
            onToggleCollapse={() => toggleCollapse(section.source)}
            onToggleRaw={() => toggleRaw(section.source)}
          />
        ))}
      </div>
    </div>
  );
}

function SourceSectionCard({
  section,
  isCollapsed,
  isRaw,
  onToggleCollapse,
  onToggleRaw,
}: {
  section: SourceSection;
  isCollapsed: boolean;
  isRaw: boolean;
  onToggleCollapse: () => void;
  onToggleRaw: () => void;
}) {
  const eventCount = section.groups.length;
  const ChevronIcon = isCollapsed ? ChevronRight : ChevronDown;

  return (
    <div
      className={`border-l-2 ${section.borderColor} bg-surface-raised rounded-sm border border-neutral-700`}
    >
      {/* Section Header */}
      <button
        onClick={onToggleCollapse}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${section.dotColor}`} />
          <span className="text-sm text-neutral-200 font-medium">
            {section.label}
          </span>
          {section.exists && eventCount > 0 && (
            <span className="text-xs text-neutral-500">
              ({eventCount} {eventCount === 1 ? "Event" : "Events"})
            </span>
          )}
          {!section.exists && (
            <span className="text-xs text-neutral-600">(nicht vorhanden)</span>
          )}
          {section.exists && eventCount === 0 && (
            <span className="text-xs text-neutral-600">
              (keine Hooks konfiguriert)
            </span>
          )}
          <span className="text-xs text-neutral-600 truncate">{section.path}</span>
        </div>
        <ChevronIcon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
      </button>

      {/* Section Body */}
      {!isCollapsed && section.exists && (
        <div className="px-3 pb-3 border-t border-neutral-700/50">
          {/* Raw toggle */}
          {section.raw && (
            <div className="flex justify-end pt-2 pb-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRaw();
                }}
                className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                  isRaw
                    ? "text-accent bg-accent-a10"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {isRaw ? "Strukturiert" : "Raw JSON"}
              </button>
            </div>
          )}

          {isRaw ? (
            <pre className="text-xs text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed">
              {section.raw}
            </pre>
          ) : eventCount > 0 ? (
            <div className="space-y-3 pt-1">
              {section.groups.map((group) => (
                <div key={group.eventName}>
                  <div className="text-xs text-accent font-bold mb-1.5">
                    {group.eventName}
                  </div>
                  <div className="space-y-1.5">
                    {group.hooks.map((hook, i) => (
                      <div
                        key={i}
                        className="bg-surface-base border border-neutral-700 rounded-sm px-3 py-2"
                      >
                        {hook.matcher && (
                          <div className="text-xs text-neutral-400 mb-1">
                            Matcher:{" "}
                            <code className="text-neutral-300 font-mono">
                              {hook.matcher}
                            </code>
                          </div>
                        )}
                        <div className="bg-neutral-900 font-mono text-xs px-3 py-2 rounded-sm text-neutral-200">
                          {hook.command}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-neutral-500 pt-1">
              Keine Hooks konfiguriert.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
