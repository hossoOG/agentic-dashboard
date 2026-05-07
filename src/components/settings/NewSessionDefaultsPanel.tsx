import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore, type SettingsState } from "../../store/settingsStore";
import { logError } from "../../utils/errorLogger";
import { Button } from "../ui";

const SHELL_OPTIONS: { value: SettingsState["defaultShell"]; label: string }[] = [
  { value: "auto", label: "Auto (Plattform-Default)" },
  { value: "powershell", label: "PowerShell" },
  { value: "cmd", label: "CMD" },
  { value: "bash", label: "Bash" },
  { value: "zsh", label: "Zsh" },
];

export function NewSessionDefaultsPanel() {
  const defaultShell = useSettingsStore((s) => s.defaultShell);
  const defaultProjectPath = useSettingsStore((s) => s.defaultProjectPath);
  const setDefaultShell = useSettingsStore((s) => s.setDefaultShell);
  const setDefaultProjectPath = useSettingsStore((s) => s.setDefaultProjectPath);
  const [picking, setPicking] = useState(false);

  async function handlePickFolder() {
    setPicking(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Standard-Projektordner wählen",
      });
      if (selected && typeof selected === "string") {
        setDefaultProjectPath(selected);
      }
    } catch (err) {
      logError("NewSessionDefaultsPanel.pickFolder", err);
    } finally {
      setPicking(false);
    }
  }

  return (
    <section className="border border-neutral-700 bg-surface-raised">
      <header className="px-4 py-3 border-b border-neutral-700">
        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">
          Neue Session
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Diese Werte starten beim Klick auf <span className="text-neutral-300">+ Neue Session</span> sofort eine Sitzung.
        </p>
      </header>

      <div className="px-4 py-4 space-y-4">
        <div>
          <label
            htmlFor="default-shell"
            className="block text-xs text-neutral-400 mb-1.5 tracking-wide"
          >
            Standard-Shell
          </label>
          <select
            id="default-shell"
            value={defaultShell}
            onChange={(e) => setDefaultShell(e.target.value as SettingsState["defaultShell"])}
            className="w-full bg-surface-base border border-neutral-700 text-neutral-200 text-sm px-3 py-2 rounded-none focus:outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            {SHELL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-neutral-400 mb-1.5 tracking-wide">
            Standard-Projektordner
          </label>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 min-w-0 bg-surface-base border border-neutral-700 text-neutral-300 text-xs px-3 py-2 truncate font-mono"
              title={defaultProjectPath || "Kein Ordner gesetzt"}
            >
              {defaultProjectPath || (
                <span className="text-neutral-500 italic">Kein Ordner gesetzt</span>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePickFolder}
              disabled={picking}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Wählen</span>
            </Button>
            {defaultProjectPath && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDefaultProjectPath("")}
                title="Default zurücksetzen"
              >
                Leeren
              </Button>
            )}
          </div>
          {!defaultProjectPath && (
            <p className="text-xs text-neutral-500 mt-1.5">
              Ohne Default öffnet der Button beim ersten Klick einen Ordner-Picker.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
