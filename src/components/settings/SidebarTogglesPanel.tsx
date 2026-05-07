import { useSettingsStore } from "../../store/settingsStore";

export function SidebarTogglesPanel() {
  const showProtokolleTab = useSettingsStore((s) => s.preferences.showProtokolleTab);
  const setPreferences = useSettingsStore((s) => s.setPreferences);

  return (
    <section className="border border-neutral-700 bg-surface-raised">
      <header className="px-3 py-2 border-b border-neutral-700">
        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">
          Sidebar
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Tabs in der linken Navigation an- oder ausblenden.
        </p>
      </header>

      <div className="px-4 py-4 space-y-3">
        <label className="flex items-start gap-2 cursor-pointer text-sm text-neutral-200">
          <input
            type="checkbox"
            checked={showProtokolleTab}
            onChange={(e) => setPreferences({ showProtokolleTab: e.target.checked })}
            className="mt-0.5 accent-accent"
          />
          <span>
            <span className="block">Protokolle-Tab anzeigen</span>
            <span className="block text-xs text-neutral-500">
              Zeigt die Live-Log-Ansicht in der Seitennavigation. Standardmäßig versteckt, wenn Logging aus ist.
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
