import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Puzzle } from "lucide-react";

interface SkillsViewerProps {
  folder: string;
}

export function SkillsViewer({ folder }: SkillsViewerProps) {
  const [skills, setSkills] = useState<string[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const files = await invoke<string[]>("list_project_dir", {
        folder,
        relativePath: ".claude/skills",
      });
      const mdFiles = files.filter((f) => f.endsWith(".md"));
      setSkills(mdFiles);
      if (mdFiles.length > 0 && !selectedSkill) {
        setSelectedSkill(mdFiles[0]);
      }
    } catch (err) {
      console.error("[SkillsViewer] Failed to list skills:", err);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSkillContent = async (name: string) => {
    try {
      const text = await invoke<string>("read_project_file", {
        folder,
        relativePath: `.claude/skills/${name}`,
      });
      setSkillContent(text);
    } catch (err) {
      console.error("[SkillsViewer] Failed to load skill:", err);
      setSkillContent("");
    }
  };

  useEffect(() => {
    setSelectedSkill(null);
    setSkillContent("");
    loadSkills();
  }, [folder]);

  useEffect(() => {
    if (selectedSkill) {
      loadSkillContent(selectedSkill);
    }
  }, [selectedSkill, folder]);

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
        <span className="text-sm">Keine Skills in diesem Projekt konfiguriert</span>
        <span className="text-xs text-neutral-600">.claude/skills/</span>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Skill list */}
      <div className="w-56 min-w-[224px] border-r border-neutral-700 flex flex-col">
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
        <div className="flex-1 overflow-auto">
          {skills.map((name) => (
            <button
              key={name}
              onClick={() => setSelectedSkill(name)}
              className={`w-full text-left px-3 py-2 text-xs truncate transition-colors ${
                selectedSkill === name
                  ? "text-accent bg-accent/10 border-l-2 border-accent"
                  : "text-neutral-300 hover:bg-white/5 border-l-2 border-transparent"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Skill content */}
      <div className="flex-1 overflow-auto p-4">
        {selectedSkill ? (
          <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed">
            {skillContent}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
            Skill auswaehlen
          </div>
        )}
      </div>
    </div>
  );
}
