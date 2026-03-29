import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, FileText } from "lucide-react";
import { logError } from "../../utils/errorLogger";

interface ClaudeMdViewerProps {
  folder: string;
}

export function ClaudeMdViewer({ folder }: ClaudeMdViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const text = await invoke<string>("read_project_file", {
        folder,
        relativePath: "CLAUDE.md",
      });
      setContent(text || null);
    } catch (err) {
      logError("ClaudeMdViewer", err);
      setContent(null);
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
        Lade CLAUDE.md...
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <FileText className="w-10 h-10 text-neutral-600" />
        <span className="text-sm">Keine CLAUDE.md in diesem Projekt gefunden</span>
        <span className="text-xs text-neutral-600">{folder}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 shrink-0">
        <span className="text-xs text-neutral-400 font-medium">CLAUDE.md</span>
        <button
          onClick={load}
          className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Neu laden"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <pre className="text-sm text-neutral-200 whitespace-pre-wrap font-mono leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
}
