import { useState } from "react";
import { FolderOpen, Play } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getErrorMessage } from "../../utils/adpError";
import { useSessionStore } from "../../store/sessionStore";
import { logError } from "../../utils/errorLogger";
import { Modal, Button, Input } from "../ui";
import type { SessionShell } from "../../store/sessionStore";

interface NewSessionDialogProps {
  open: boolean;
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

export function NewSessionDialog({ open: isOpen, onClose }: NewSessionDialogProps) {
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
        title: "Arbeitsordner wählen",
      });
      if (selected && typeof selected === "string") {
        setFolder(selected);
        if (!title) {
          setTitle(extractFolderName(selected));
        }
      }
    } catch (err) {
      logError("NewSessionDialog.folderPicker", err);
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
      logError("NewSessionDialog.createSession", err);
      const message = getErrorMessage(err);
      setCreateError(`Session konnte nicht erstellt werden: ${message}`);
      setIsCreating(false);
    }
  }

  const headerTitle = (
    <h2 className="text-neon-green font-bold text-sm uppercase tracking-widest">
      NEUE CLAUDE SESSION
    </h2>
  );

  return (
    <Modal open={isOpen} onClose={onClose} title={headerTitle} size="md">
      <div className="p-6 space-y-4">
        {/* Folder Picker */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input
              label="Ordner:"
              value={folder}
              readOnly
              placeholder="Ordner wählen..."
            />
          </div>
          <Button
            variant="secondary"
            size="md"
            icon={<FolderOpen className="w-4 h-4" />}
            onClick={handlePickFolder}
            className="bg-surface-base hover:text-accent hover:border-accent"
          >
            Wählen
          </Button>
        </div>

        {/* Title Input */}
        <Input
          label="Titel (optional):"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={folder ? extractFolderName(folder) : "Session-Titel"}
        />

        {/* Shell Selection */}
        <div>
          <span className="text-xs text-neutral-400 tracking-wide">Shell:</span>
          <div className="space-y-2 mt-2">
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
                      : "border-neutral-600 group-hover:border-neutral-400"
                  }`}
                >
                  {selectedShell === opt.value && (
                    <span className="w-2 h-2 rounded-full bg-neon-green" />
                  )}
                </span>
                <span
                  className={`text-sm ${
                    selectedShell === opt.value ? "text-neutral-200" : "text-neutral-500"
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
          <div className="px-3 py-2 bg-red-900/20 border border-red-700 text-error text-xs font-mono">
            {createError}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={!folder || isCreating}
            loading={isCreating}
            icon={!isCreating ? <Play className="w-3.5 h-3.5" /> : undefined}
          >
            {isCreating ? "STARTET..." : "STARTEN"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
