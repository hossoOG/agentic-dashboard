import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Webhook } from "lucide-react";

interface HooksViewerProps {
  folder: string;
}

interface HookEntry {
  matcher: string;
  command: string;
}

interface HooksConfig {
  [eventName: string]: HookEntry[];
}

function parseHooks(raw: string): HooksConfig | null {
  try {
    const parsed = JSON.parse(raw);
    const hooks = parsed?.hooks;
    if (!hooks || typeof hooks !== "object") return null;
    return hooks as HooksConfig;
  } catch {
    return null;
  }
}

export function HooksViewer({ folder }: HooksViewerProps) {
  const [projectHooks, setProjectHooks] = useState<HooksConfig | null>(null);
  const [projectRaw, setProjectRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Project-level settings
      const projectText = await invoke<string>("read_project_file", {
        folder,
        relativePath: ".claude/settings.json",
      });
      setProjectRaw(projectText);
      setProjectHooks(projectText ? parseHooks(projectText) : null);
    } catch (err) {
      console.error("[HooksViewer] Failed to load:", err);
      setProjectHooks(null);
      setProjectRaw("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [folder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Hooks...
      </div>
    );
  }

  const hasHooks = projectHooks && Object.keys(projectHooks).length > 0;

  if (!hasHooks && !projectRaw) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <Webhook className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Keine Hooks in diesem Projekt konfiguriert</span>
        <span className="text-xs text-neutral-600">.claude/settings.json</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 shrink-0">
        <span className="text-xs text-neutral-400 font-medium">
          Projekt-Hooks {hasHooks && `(${Object.keys(projectHooks!).length} Events)`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
              showRaw ? "text-accent bg-accent-a10" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {showRaw ? "Strukturiert" : "Raw JSON"}
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

      <div className="flex-1 overflow-auto p-4">
        {showRaw ? (
          <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed">
            {projectRaw}
          </pre>
        ) : hasHooks ? (
          <div className="space-y-4">
            {Object.entries(projectHooks!).map(([eventName, hooks]) => (
              <div key={eventName}>
                <div className="text-xs text-accent font-bold mb-1.5">{eventName}</div>
                <div className="space-y-1.5">
                  {hooks.map((hook, i) => (
                    <div
                      key={i}
                      className="bg-surface-base border border-neutral-700 rounded-sm px-3 py-2"
                    >
                      {hook.matcher && (
                        <div className="text-xs text-neutral-400 mb-1">
                          Matcher: <span className="text-neutral-300">{hook.matcher}</span>
                        </div>
                      )}
                      <code className="text-xs text-neutral-200 font-mono">{hook.command}</code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">
            settings.json vorhanden, aber keine Hooks konfiguriert.
          </div>
        )}
      </div>
    </div>
  );
}
