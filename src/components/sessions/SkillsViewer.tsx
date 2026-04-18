import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Puzzle, FolderOpen } from "lucide-react";
import {
  parseSkillFrontmatter,
  type ParsedSkill,
} from "../../utils/parseSkillFrontmatter";

interface SkillsViewerProps {
  folder: string;
}

interface SkillDirEntry {
  dir_name: string;
  content: string;
  has_reference_dir: boolean;
}

interface SkillEntry {
  id: string;
  parsed: ParsedSkill;
  hasReferenceDir: boolean;
}

type Filter = "alle" | "aufrufbar" | "auto";

export function SkillsViewer({ folder }: SkillsViewerProps) {
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("alle");
  const [search, setSearch] = useState("");

  const loadSkills = async () => {
    setLoading(true);
    try {
      const entries = await loadViaSkillDirs(folder);
      setSkills(entries);
      if (entries.length > 0 && !selectedId) {
        setSelectedId(entries[0].id);
      }
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedId(null);
    setSearch("");
    setFilter("alle");
    loadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only on folder change
  }, [folder]);

  const filteredSkills = useMemo(() => {
    let result = skills;

    if (filter === "aufrufbar") {
      result = result.filter((s) => s.parsed.metadata.userInvokable);
    } else if (filter === "auto") {
      result = result.filter((s) => !s.parsed.metadata.userInvokable);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.parsed.metadata.name.toLowerCase().includes(q) ||
          s.parsed.metadata.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [skills, filter, search]);

  const selectedSkill = useMemo(
    () => skills.find((s) => s.id === selectedId) ?? null,
    [skills, selectedId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Lade Skills...
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <Puzzle className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">
          Keine Skills in diesem Projekt konfiguriert
        </span>
        <span className="text-xs text-neutral-600">.claude/skills/</span>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left column — skill list */}
      <div className="w-64 min-w-[256px] border-r border-neutral-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 shrink-0">
          <span className="text-xs text-neutral-400 font-medium">
            Skills ({skills.length})
          </span>
          <button
            onClick={loadSkills}
            className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Neu laden"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-3 py-2 border-b border-neutral-700 space-y-2 shrink-0">
          <div className="flex gap-1">
            {(["alle", "aufrufbar", "auto"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                  filter === f
                    ? "bg-accent-a10 text-accent"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-hover-overlay"
                }`}
              >
                {f === "alle" ? "Alle" : f === "aufrufbar" ? "Aufrufbar" : "Automatisch"}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-base border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500"
          />
        </div>

        {/* Skill cards */}
        <div className="flex-1 overflow-auto">
          {filteredSkills.length === 0 ? (
            <div className="px-3 py-4 text-xs text-neutral-500 text-center">
              Keine Skills gefunden
            </div>
          ) : (
            filteredSkills.map((entry) => {
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
                    {entry.hasReferenceDir && (
                      <FolderOpen className="w-3 h-3 text-neutral-500 shrink-0" />
                    )}
                  </div>
                  {metadata.description && (
                    <div className="text-xs text-neutral-400 truncate mt-0.5">
                      {metadata.description}
                    </div>
                  )}
                  <div className="mt-1">
                    <span
                      className={`inline-block px-1.5 py-0 text-[10px] rounded-sm ${
                        metadata.userInvokable
                          ? "bg-accent-a10 text-accent"
                          : "bg-neutral-800 text-neutral-500"
                      }`}
                    >
                      {metadata.userInvokable ? "Aufrufbar" : "Auto"}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right column — detail */}
      <div className="flex-1 overflow-auto p-4">
        {selectedSkill ? (
          <SkillDetail entry={selectedSkill} />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            Skill auswählen
          </div>
        )}
      </div>
    </div>
  );
}

function SkillDetail({ entry }: { entry: SkillEntry }) {
  const { metadata, body } = entry.parsed;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-base font-semibold text-neutral-200">
            {metadata.name}
          </h2>
          <span
            className={`inline-block px-1.5 py-0 text-[10px] rounded-sm ${
              metadata.userInvokable
                ? "bg-accent-a10 text-accent"
                : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {metadata.userInvokable ? "Aufrufbar" : "Auto"}
          </span>
          {entry.hasReferenceDir && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0 text-[10px] rounded-sm bg-neutral-800 text-neutral-500">
              <FolderOpen className="w-2.5 h-2.5" />
              Referenzen
            </span>
          )}
        </div>
        {metadata.description && (
          <p className="text-sm text-neutral-400">{metadata.description}</p>
        )}
      </div>

      {/* Args */}
      {metadata.args.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Parameter
          </h3>
          <div className="space-y-1.5">
            {metadata.args.map((arg) => (
              <div
                key={arg.name}
                className="flex items-start gap-2 bg-surface-raised rounded px-3 py-2"
              >
                <code className="text-xs text-accent font-mono shrink-0">
                  {arg.name}
                </code>
                {arg.required && (
                  <span className="text-[10px] text-red-400 shrink-0">
                    *erforderlich
                  </span>
                )}
                <span className="text-xs text-neutral-400">
                  {arg.description}
                </span>
              </div>
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

// --- Data loading ---

async function loadViaSkillDirs(folder: string): Promise<SkillEntry[]> {
  try {
    const dirs = await invoke<SkillDirEntry[]>("list_skill_dirs", { folder });
    if (dirs.length > 0) {
      return dirs.map((d) => ({
        id: d.dir_name,
        parsed: parseSkillFrontmatter(d.content),
        hasReferenceDir: d.has_reference_dir,
      }));
    }
  } catch {
    // list_skill_dirs not available, fall through
  }

  return loadViaLegacy(folder);
}

async function loadViaLegacy(folder: string): Promise<SkillEntry[]> {
  const files = await invoke<string[]>("list_project_dir", {
    folder,
    relativePath: ".claude/skills",
  });
  const mdFiles = files.filter((f) => f.endsWith(".md"));

  const entries: SkillEntry[] = [];
  for (const name of mdFiles) {
    try {
      const content = await invoke<string>("read_project_file", {
        folder,
        relativePath: `.claude/skills/${name}`,
      });
      const parsed = parseSkillFrontmatter(content);
      // Use filename as fallback name if frontmatter has no name
      if (parsed.metadata.name === "Unknown") {
        parsed.metadata.name = name.replace(/\.md$/, "");
      }
      entries.push({ id: name, parsed, hasReferenceDir: false });
    } catch {
      // Skip unreadable files
    }
  }

  return entries;
}
