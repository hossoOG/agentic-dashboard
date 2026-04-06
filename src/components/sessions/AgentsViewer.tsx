import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Bot } from "lucide-react";
import {
  parseAgentFrontmatter,
  type ParsedAgent,
} from "../../utils/parseAgentFrontmatter";

interface AgentsViewerProps {
  folder: string;
}

interface AgentEntry {
  id: string;
  fileName: string;
  parsed: ParsedAgent;
}

export function AgentsViewer({ folder }: AgentsViewerProps) {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadAgents = async () => {
    setLoading(true);
    try {
      const files = await invoke<string[]>("list_project_dir", {
        folder,
        relativePath: ".claude/agents",
      });
      const mdFiles = files.filter((f) => f.endsWith(".md"));

      const entries: AgentEntry[] = [];
      for (const name of mdFiles) {
        try {
          const content = await invoke<string>("read_project_file", {
            folder,
            relativePath: `.claude/agents/${name}`,
          });
          const parsed = parseAgentFrontmatter(content, name);
          entries.push({ id: name, fileName: name, parsed });
        } catch {
          // Skip unreadable files
        }
      }

      setAgents(entries);
      if (entries.length > 0 && !selectedId) {
        setSelectedId(entries[0].id);
      }
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedId(null);
    setSearch("");
    loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only on folder change
  }, [folder]);

  const filteredAgents = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.parsed.metadata.name.toLowerCase().includes(q) ||
        a.parsed.metadata.description.toLowerCase().includes(q) ||
        a.parsed.metadata.model.toLowerCase().includes(q),
    );
  }, [agents, search]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedId) ?? null,
    [agents, selectedId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Agents...
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <Bot className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Keine Agents in diesem Projekt konfiguriert</span>
        <span className="text-xs text-neutral-600">.claude/agents/</span>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left column — agent list */}
      <div className="w-64 min-w-[256px] border-r border-neutral-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 shrink-0">
          <span className="text-xs text-neutral-400 font-medium">
            Agents ({agents.length})
          </span>
          <button
            onClick={loadAgents}
            className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Neu laden"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-neutral-700 shrink-0">
          <input
            type="text"
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-base border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
          />
        </div>

        {/* Agent cards */}
        <div className="flex-1 overflow-auto">
          {filteredAgents.length === 0 ? (
            <div className="px-3 py-4 text-xs text-neutral-500 text-center">
              Keine Agents gefunden
            </div>
          ) : (
            filteredAgents.map((entry) => {
              const { metadata } = entry.parsed;
              const isActive = selectedId === entry.id;
              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={`w-full text-left px-3 py-2 transition-colors border-l-2 ${
                    isActive
                      ? "border-accent bg-accent-a10"
                      : "border-transparent hover:bg-hover-overlay"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold truncate ${
                        isActive ? "text-accent" : "text-neutral-200"
                      }`}
                    >
                      {metadata.name}
                    </span>
                  </div>
                  {metadata.description && (
                    <div className="text-xs text-neutral-400 truncate mt-0.5">
                      {metadata.description}
                    </div>
                  )}
                  {metadata.model && (
                    <div className="mt-1">
                      <span className="inline-block px-1.5 py-0 text-[10px] rounded-full bg-neutral-800 text-neutral-500">
                        {metadata.model}
                      </span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right column — detail */}
      <div className="flex-1 overflow-auto p-4">
        {selectedAgent ? (
          <AgentDetail entry={selectedAgent} />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            Agent auswählen
          </div>
        )}
      </div>
    </div>
  );
}

function AgentDetail({ entry }: { entry: AgentEntry }) {
  const { metadata, body } = entry.parsed;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-neutral-200">
            {metadata.name}
          </h2>
          {metadata.model && (
            <span className="inline-block px-1.5 py-0 text-[10px] rounded-full bg-neutral-800 text-neutral-400">
              {metadata.model}
            </span>
          )}
        </div>
        {metadata.description && (
          <p className="text-sm text-neutral-400">{metadata.description}</p>
        )}
      </div>

      {/* Metadata fields */}
      <div className="grid grid-cols-2 gap-2">
        {metadata.maxTurns !== null && (
          <div className="bg-surface-raised rounded px-3 py-2">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
              Max Turns
            </span>
            <div className="text-xs text-neutral-200 font-mono mt-0.5">
              {metadata.maxTurns}
            </div>
          </div>
        )}
        <div className="bg-surface-raised rounded px-3 py-2">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
            Datei
          </span>
          <div className="text-xs text-neutral-200 font-mono mt-0.5 truncate">
            .claude/agents/{entry.fileName}
          </div>
        </div>
      </div>

      {/* Allowed Tools */}
      {metadata.allowedTools.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Erlaubte Tools
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {metadata.allowedTools.map((tool) => (
              <span
                key={tool}
                className="inline-block px-2 py-0.5 text-xs rounded-full bg-surface-raised text-neutral-300 font-mono"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      {body && (
        <div>
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Inhalt
          </h3>
          <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed bg-surface-raised rounded p-3">
            {body}
          </pre>
        </div>
      )}
    </div>
  );
}
