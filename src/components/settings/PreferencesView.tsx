import { ICONS, ICON_SIZE } from "../../utils/icons";
import { NewSessionDefaultsPanel } from "./NewSessionDefaultsPanel";
import { DebugLoggingPanel } from "./DebugLoggingPanel";
import { SidebarTogglesPanel } from "./SidebarTogglesPanel";
import { TerminalScrollbackPanel } from "./TerminalScrollbackPanel";

const SettingsIcon = ICONS.nav.settings;

export function PreferencesView() {
  return (
    <div className="flex flex-col h-full bg-surface-base overflow-hidden">
      <header className="px-4 py-3 border-b border-neutral-700 flex items-center gap-2 shrink-0">
        <SettingsIcon className={`${ICON_SIZE.nav} text-neutral-400`} aria-hidden="true" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-200">
          Einstellungen
        </h2>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <NewSessionDefaultsPanel />
          <TerminalScrollbackPanel />
          <DebugLoggingPanel />
          <SidebarTogglesPanel />
        </div>
      </div>
    </div>
  );
}
