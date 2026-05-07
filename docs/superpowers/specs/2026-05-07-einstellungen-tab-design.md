# Einstellungen-Tab — Design Spec

**Datum**: 2026-05-07
**Status**: Approved (Brainstorming → direkte Implementation auf `master`)
**Scope**: Neuer globaler Settings-Tab mit Logging-Toggles, Session-Defaults, Sidebar-Toggle für Protokolle.

## Ziele

1. **Performance-Gewinn im Daily-Use** — Logging-Buffer, File-IO und perf-Profiler standardmäßig aus.
2. **Komfort-Gewinn** — `+ Neue Session` startet ohne Dialog mit gespeicherten Defaults.
3. **UI-Aufräumen** — `Protokolle`-Tab versteckbar, Anzeige nur bei Bedarf.

Goals von User: UI-Aufräumen, Memory sparen, Disk sparen, mehr Kontrolle.

## Nicht-Ziele

- Kein Toggle für Kanban/Bibliothek/Editor/Pipeline (YAGNI, später nachreichbar).
- Keine Profile/Templates für Sessions.
- Kein Drag-and-Drop-Reorder der SideNav.
- Keine i18n der neuen Strings (Deutsch only, passt zu `locale` default).
- Kein "Logs jetzt löschen"-Button im Logging-Panel.

## Architektur-Überblick

### Neue Dateien

```
src/components/settings/
├── PreferencesView.tsx              Top-Level View
├── PreferencesView.test.tsx
├── NewSessionDefaultsPanel.tsx      Panel 1
├── NewSessionDefaultsPanel.test.tsx
├── DebugLoggingPanel.tsx            Panel 2
├── DebugLoggingPanel.test.tsx
├── SidebarTogglesPanel.tsx          Panel 3
└── SidebarTogglesPanel.test.tsx
```

### Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/store/settingsStore.ts` | 4 neue Felder + Setter, Migration v2 → v3 |
| `src/utils/errorLogger.ts` | Frühausstieg in `addEntry()` wenn `frontendLogging=false` |
| `src/utils/perfLogger.ts` | Frühausstieg wenn `performanceProfiler=false` |
| `src/components/layout/SideNav.tsx` | Filter `showProtokolleTab`, neuer `settings`-Tab |
| `src/components/layout/AppShell.tsx` | Routing-Switch erweitert + activeTab-Fallback |
| `src/components/sessions/SessionList.tsx` | `+ Neue Session` → Quick-Start-Handler statt Modal |
| `src-tauri/src/lib.rs` | Tauri-Command `set_file_logging_enabled` + `LOGGING_ENABLED: AtomicBool` |
| `src-tauri/src/main.rs` (oder setup-Hook) | Initial-Wert beim Startup einlesen |
| `CHANGELOG.md` | Eintrag unter `[Unreleased]` |

### NewSessionDialog-Schicksal

Bleibt erhalten als optionaler "Erweiterte Session"-Override (Sekundär-Button neben Ein-Klick). Kein Code-Aufwand, gibt Edge-Case-Override ohne Re-Implementation.

## Store-Erweiterungen

```ts
interface SettingsState {
  // Bestehend (jetzt aktiv genutzt):
  defaultShell: "auto" | "powershell" | "bash" | "cmd" | "zsh";
  defaultProjectPath: string;

  // NEU:
  frontendLogging: boolean;       // Default: false
  backendFileLogging: boolean;    // Default: false
  performanceProfiler: boolean;   // Default: false
  showProtokolleTab: boolean;     // Default: false

  // NEU Setter:
  setFrontendLogging: (v: boolean) => void;
  setBackendFileLogging: (v: boolean) => void;   // ruft Tauri-Command synchron
  setPerformanceProfiler: (v: boolean) => void;
  setShowProtokolleTab: (v: boolean) => void;
}
```

`partialize`-Liste um die 4 neuen Felder erweitern. `migrate`-Funktion: für `version < 3` setzt sie alle 4 auf `false`.

## UI-Layout

Single-Scroll mit drei gestapelten Panels (UPPERCASE-Header, design-system-konform):

```
┌─ EINSTELLUNGEN ──────────────────────────┐
│                                          │
│ ┌─ NEUE SESSION ──────────────────────┐  │
│ │ Standard-Shell    [PowerShell  ▾]   │  │
│ │ Standard-Ordner   C:/Projects/...   │  │
│ │                   [ Wählen... ]     │  │
│ └─────────────────────────────────────┘  │
│                                          │
│ ┌─ DEBUG-LOGGING ─────────────────────┐  │
│ │ ◯ Komplett aus (empfohlen)          │  │
│ │ ◉ Aktiviert                         │  │
│ │   ☑ Frontend-Errors                 │  │
│ │   ☑ Backend-Log-Files               │  │
│ │   ☐ Performance-Profiler            │  │
│ └─────────────────────────────────────┘  │
│                                          │
│ ┌─ SIDEBAR ───────────────────────────┐  │
│ │ ☑ Protokolle-Tab anzeigen           │  │
│ └─────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

Panel-Header-Padding: `main` (= `px-4 py-3`), Sub-Sections falls nötig: `compact` (= `px-3 py-2`). Headlines: UPPERCASE, `tracking-widest`. Keine Toggles, keine Spinner — Standard-Form-Controls (Radio, Checkbox, Input, Button).

## Verhaltensänderungen

### Ein-Klick-Session

`+ Neue Session`-Button (in `SessionList.tsx`) bekommt einen neuen Click-Handler:

```ts
async function handleQuickStartSession() {
  const { defaultShell, defaultProjectPath, setDefaultProjectPath } = useSettingsStore.getState();
  const { addToast } = useUIStore.getState();
  const addSession = useSessionStore.getState().addSession;

  let folder = defaultProjectPath;
  if (!folder) {
    const picked = await open({ directory: true, multiple: false, title: "Arbeitsordner wählen" });
    if (!picked || typeof picked !== "string") return;
    folder = picked;
    addToast({
      type: "info",
      title: "Diesen Ordner als Default speichern?",
      action: { label: "Speichern", onClick: () => setDefaultProjectPath(folder) },
      duration: 6000,
    });
  }

  const shell = resolveShellForPlatform(defaultShell); // "auto" → powershell auf Windows
  const title = extractFolderName(folder);
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await invoke("create_session", { id, folder, title, shell });
  addSession({ id, title, folder, shell });
}
```

`extractFolderName` und `resolveShellForPlatform` wandern in `src/utils/sessionDefaults.ts` (neu) — wiederverwendbar zwischen `SessionList` und dem alten `NewSessionDialog`.

### Logger-Gating

`src/utils/errorLogger.ts`, `addEntry()`:
```ts
function addEntry(entry: LogEntry): void {
  if (!useSettingsStore.getState().frontendLogging) return;
  logBuffer.push(entry);
  // ... rest unverändert
}
```

`src/utils/perfLogger.ts`: gleiches Pattern in der Push-Funktion.

**Garantie**: `globalErrorHandler.ts:27` ruft `logError()` UND `addToast()` separat auf. Toast bleibt unabhängig vom Buffer.

### Backend-File-Logging

`src-tauri/src/lib.rs`:
```rust
use std::sync::atomic::{AtomicBool, Ordering};

pub static LOGGING_ENABLED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
async fn set_file_logging_enabled(enabled: bool) -> Result<(), String> {
    LOGGING_ENABLED.store(enabled, Ordering::Relaxed);
    Ok(())
}
```

Der File-Appender-Layer prüft `LOGGING_ENABLED.load(Ordering::Relaxed)` vor jedem Write. Bei `false` wird der Event verworfen, ohne Subscriber-Rebuild.

Beim `setup`-Hook in `lib.rs`/`main.rs`: initial-Wert aus dem persistierten Settings-Store einlesen (über existing `read_settings_file`-Mechanik, siehe `tauriStorage.ts`).

### SideNav-Filter

`src/components/layout/SideNav.tsx:51-58`:
```ts
const showProtokolleTab = useSettingsStore((s) => s.showProtokolleTab);

const allTabs = [
  { id: "sessions",  label: "Sitzungen", ..., visible: true },
  { id: "kanban",    label: "Kanban",    ..., visible: true },
  { id: "library",   label: "Bibliothek",..., visible: true },
  { id: "editor",    label: "Editor",    ..., visible: true },
  { id: "logs",      label: "Protokolle",..., visible: showProtokolleTab },
  { id: "settings",  label: "Einstellungen", icon: Settings, visible: true },
];
const tabs = allTabs.filter((t) => t.visible);
```

`AppShell.tsx`: useEffect, der `activeTab` auf `"sessions"` setzt wenn der aktive Tab unsichtbar wurde.

## Tests

| Test-Datei | Coverage |
|---|---|
| `PreferencesView.test.tsx` | Rendert alle 3 Panels |
| `NewSessionDefaultsPanel.test.tsx` | Shell-Wahl persistiert · Folder-Picker schreibt Default |
| `DebugLoggingPanel.test.tsx` | Master-Off deaktiviert Sub-Checkboxen · Sub-Checkbox-Toggle persistiert |
| `SidebarTogglesPanel.test.tsx` | Toggle versteckt Protokolle-Tab |
| `errorLogger.test.ts` (erweitert) | Buffer leer wenn Logging off · Toast trotzdem ausgelöst |
| `SessionList.test.tsx` (erweitert) | Quick-Start mit Default · Quick-Start ohne Default → Picker + Toast |
| Migration-Test in `settingsStore.test.ts` (falls vorhanden) | v2-Daten → v3 mit 4 neuen Defaults |

## Quality Gates

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `cd src-tauri && cargo check`
- [ ] `cd src-tauri && cargo clippy -- -D warnings`
- [ ] `npm run test`
- [ ] Visual: Tab erreichbar, alle 3 Panels rendern, Toggles persistieren über App-Restart
- [ ] CHANGELOG-Eintrag

## Migration-Hinweis für CHANGELOG

> **Breaking (Default-Wechsel)**: Logging und der `Protokolle`-Tab sind nach dem Update standardmäßig deaktiviert. Power-User aktivieren beides wieder unter `Einstellungen → Debug-Logging` bzw. `Einstellungen → Sidebar`.

## Annahmen / Offene Punkte

- `addToast`-API hat ein optionales `action`-Feld (Label + onClick). Falls noch nicht vorhanden, wird es in `uiStore.ts` ergänzt — ist Teil des UI-Patterns laut bestehender ToastContainer-Komponente.
- `tracing`-Subscriber-Layout im Backend ist mir nicht im Detail bekannt; Implementation prüft, ob ein `Layer`-basiertes Setup existiert oder die einfachere "AtomicBool im File-Appender"-Variante reicht.
