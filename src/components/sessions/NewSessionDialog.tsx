import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FolderOpen, Play } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useSessionStore } from "../../store/sessionStore";
import type { SessionShell } from "../../store/sessionStore";

interface NewSessionDialogProps {
  onClose: () => void;
}

const SHELL_OPTIONS: { value: SessionShell; label: string }[] = [
  { value: "powershell", label: "PowerShell (Standard)" },
  { value: "cmd", label: "CMD" },
  { value: "gitbash", label: "Git Bash" },
];

function extractFolderName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "session";
}

export function NewSessionDialog({ onClose }: NewSessionDialogProps) {
  const [folder, setFolder] = useState("");
  const [title, setTitle] = useState("");
  const [selectedShell, setSelectedShell] = useState<SessionShell>("powershell");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const addSession = useSessionStore((s) => s.addSession);

  async function handlePickFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Arbeitsordner waehlen",
      });
      if (selected && typeof selected === "string") {
        setFolder(selected);
        if (!title) {
          setTitle(extractFolderName(selected));
        }
      }
    } catch (err) {
      console.error("[NewSessionDialog] Folder picker error:", err);
    }
  }

  async function handleCreate() {
    if (!folder) return;
    setIsCreating(true);
    setCreateError(null);

    const sessionTitle = title || extractFolderName(folder);
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const result = await invoke<{ id: string; title: string; folder: string; shell: string }>("create_session", {
        id,
        folder,
        title: sessionTitle,
        shell: selectedShell,
      });

      // Use the ID returned by the backend to ensure frontend/backend stay in sync
      const sessionId = result?.id ?? id;
      addSession({
        id: sessionId,
        title: result?.title ?? sessionTitle,
        folder: result?.folder ?? folder,
        shell: (result?.shell ?? selectedShell) as SessionShell,
      });
      onClose();
    } catch (err) {
      console.error("[NewSessionDialog] create_session error:", err);
      const message = err instanceof Error ? err.message : String(err ?? "Unbekannter Fehler");
      setCreateError(`Session konnte nicht erstellt werden: ${message}`);
      setIsCreating(false);
    }
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        onClick={onClose}
      >
        {/* Overlay */}
        <motion.div
          className="absolute inset-0 bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Dialog */}
        <motion.div
          className="relative w-full max-w-md bg-dark-card border-2 border-dark-border p-6"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-neon-green font-bold text-sm tracking-widest">
              NEUE CLAUDE SESSION
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Folder Picker */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1.5 tracking-wide">
              Ordner:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folder}
                readOnly
                placeholder="Ordner waehlen..."
                className="flex-1 bg-dark-bg border border-dark-border px-3 py-2 text-sm text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-neon-green/50"
              />
              <button
                onClick={handlePickFolder}
                className="flex items-center gap-1.5 px-3 py-2 bg-dark-bg border border-dark-border text-gray-400 hover:text-neon-green hover:border-neon-green/50 transition-colors text-xs"
              >
                <FolderOpen className="w-4 h-4" />
                Waehlen
              </button>
            </div>
          </div>

          {/* Title Input */}
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1.5 tracking-wide">
              Titel (optional):
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={folder ? extractFolderName(folder) : "Session-Titel"}
              className="w-full bg-dark-bg border border-dark-border px-3 py-2 text-sm text-gray-300 font-mono placeholder:text-gray-600 focus:outline-none focus:border-neon-green/50"
            />
          </div>

          {/* Shell Selection */}
          <div className="mb-6">
            <label className="block text-xs text-gray-400 mb-2 tracking-wide">
              Shell:
            </label>
            <div className="space-y-2">
              {SHELL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer group"
                  onClick={() => setSelectedShell(opt.value)}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                      selectedShell === opt.value
                        ? "border-neon-green"
                        : "border-gray-600 group-hover:border-gray-400"
                    }`}
                  >
                    {selectedShell === opt.value && (
                      <span className="w-2 h-2 rounded-full bg-neon-green" />
                    )}
                  </span>
                  <span
                    className={`text-sm ${
                      selectedShell === opt.value ? "text-gray-200" : "text-gray-500"
                    }`}
                  >
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Error message */}
          {createError && (
            <div className="mb-4 px-3 py-2 bg-red-900/20 border border-red-700 text-red-400 text-xs font-mono">
              {createError}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-gray-400 hover:text-gray-200 border border-dark-border hover:border-gray-500 transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleCreate}
              disabled={!folder || isCreating}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider bg-neon-green/10 border border-neon-green text-neon-green hover:bg-neon-green/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
              {isCreating ? "STARTET..." : "STARTEN"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
