import {
  SCROLLBACK_PRESETS,
  sanitizeScrollbackLines,
  useSettingsStore,
  type ScrollbackPreset,
} from "../../store/settingsStore";

/**
 * Settings-UI for xterm-Scrollback-Limit (Phase 1 of scrollback-history-coverage).
 *
 * Default 25_000 ist 5× xterm.js-Default und 5× das alte Hard-Coded-Limit.
 * Memory-Kosten ≈ 12 Bytes/Cell × cols × scrollback. Bei 200 cols:
 *   - 5_000  ≈  13 MB pro Terminal
 *   - 10_000 ≈  25 MB
 *   - 25_000 ≈  63 MB  (Default)
 *   - 50_000 ≈ 126 MB  (Power-User-Opt)
 *
 * Live-Änderungen wirken auf NEUE Sessions — bestehende Terminals behalten
 * ihren aktuellen Buffer (kein Verlust beim Verkleinern, keine Inflation
 * beim Vergrößern).
 */
export function TerminalScrollbackPanel() {
  const scrollbackLines = useSettingsStore(
    (s) => s.preferences.scrollbackLines,
  );
  const setPreferences = useSettingsStore((s) => s.setPreferences);

  const current = sanitizeScrollbackLines(scrollbackLines);
  const showWarning = current >= 50_000;

  return (
    <section className="border border-neutral-700 bg-surface-raised">
      <header className="px-3 py-2 border-b border-neutral-700">
        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-300">
          Terminal-Verlauf
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Wie viele Zeilen pro Terminal im Speicher gehalten werden.
          Höhere Werte = mehr Verlauf zum Hochscrollen, mehr RAM-Verbrauch.
        </p>
      </header>

      <div className="px-4 py-4 space-y-3">
        <label className="flex flex-col gap-1.5 text-sm text-neutral-200">
          <span className="text-xs uppercase tracking-wider text-neutral-400">
            Scrollback-Zeilen
          </span>
          <select
            value={current}
            onChange={(e) => {
              const next = sanitizeScrollbackLines(Number(e.target.value));
              setPreferences({ scrollbackLines: next });
            }}
            className="w-48 px-3 py-2 bg-neutral-900 border border-neutral-700 text-neutral-100 text-sm focus:border-accent focus:outline-none"
          >
            {SCROLLBACK_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {formatPresetLabel(preset)}
              </option>
            ))}
          </select>
        </label>

        {showWarning && (
          <p className="text-xs text-amber-400 mt-2">
            ⚠ 50 000 Zeilen ≈ 125 MB pro Terminal. Bei mehreren aktiven
            Sessions (4 × 50k ≈ 500 MB) kann der RAM-Verbrauch spürbar sein.
          </p>
        )}

        <p className="text-xs text-neutral-500">
          Änderungen wirken auf neu geöffnete Sessions. Bestehende Terminals
          behalten ihren aktuellen Verlauf.
        </p>
      </div>
    </section>
  );
}

function formatPresetLabel(preset: ScrollbackPreset): string {
  const lines = preset.toLocaleString("de-DE");
  if (preset === 25_000) return `${lines} Zeilen (Standard)`;
  return `${lines} Zeilen`;
}
