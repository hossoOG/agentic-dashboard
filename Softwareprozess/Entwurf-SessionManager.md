# Entwurf: Claude Session Manager (MVP)

**Datum:** 2026-03-15
**Phase:** Entwurf (ersetzt `Planung.md` als aktiven Plan)
**Status:** Draft
**Kontext:** Pivot von isometrischer Pipeline-Visualisierung zu pragmatischem Session-Manager

---

## Inhaltsverzeichnis

1. [MVP-Scope](#1-mvp-scope)
2. [UI-Entwurf](#2-ui-entwurf)
3. [Technischer Entwurf](#3-technischer-entwurf)
4. [Implementierungsplan](#4-implementierungsplan)
5. [Abgrenzung zu bestehenden Tools](#5-abgrenzung-zu-bestehenden-tools)
6. [Technische Risiken](#6-technische-risiken)

---

## 1. MVP-Scope

### Was wird gebaut

Ein **Claude Session Manager** — eine native Windows-Desktop-App (Tauri v2) zum Verwalten mehrerer paralleler `claude`-CLI-Sessions:

- Ordner auswaehlen, Klick auf "Start" → `claude --dangerously-skip-permissions` wird in einem PTY-Prozess gestartet
- Alle laufenden Sessions auf einen Blick mit farbcodierten Status-Indikatoren
- Live-Terminal-Output mit ANSI-Farben (xterm.js)
- Direkte interaktive Eingabe in jede Session
- Windows-Benachrichtigungen bei Session-Ende oder wenn Claude eine Frage stellt
- Session-Titel (automatisch aus Ordnername oder manuell vergeben)

### Was wird NICHT gebaut (explizite Abgrenzung)

| Feature | Status | Begruendung |
|---------|--------|-------------|
| Isometrische 3D-Karte (`DashboardMap`) | Code bleibt, nicht Default-Ansicht | Kein Kernbedarf fuer Session-Management |
| AI-Hub / Chat-Panel / Widgets | Nicht im MVP | Persona-C-Features, spaetere Phase |
| API-Key-Management / Kosten-Tracking | Nicht im MVP | Kein direkter Bezug zum Session-Workflow |
| ADP-Protokoll-Migration | Nicht im MVP | Over-Engineering fuer einfachen PTY-Stream |
| Orchestrator / Pipeline-Logik | Code bleibt, nicht aktiv | Session Manager ersetzt diesen Workflow |
| OAuth / Service-Adapter | Nicht im MVP | Spaetere Phase |
| macOS-Support | Nicht im MVP | Windows-Fokus, macOS spaeter |
| Settings-Seite | Minimal (Shell-Auswahl) | Kein umfangreiches Settings-System noetig |

### User Flow (Schritt fuer Schritt)

```
1. App starten
   → Session Manager wird als Default-Ansicht angezeigt
   → Linke Seite: leere Session-Liste mit "Neue Session"-Button
   → Rechte Seite: leerer Terminal-Bereich mit Hinweis "Keine Session ausgewaehlt"

2. "Neue Session" klicken
   → Dialog oeffnet sich:
     - Ordner-Picker (Tauri native Dialog)
     - Optionales Titel-Feld (Default: Ordnername)
     - Shell-Auswahl: PowerShell | CMD | Git Bash (Default: PowerShell)
     - "Starten"-Button

3. Session starten
   → PTY-Prozess wird im Backend gespawnt
   → `claude --dangerously-skip-permissions` wird im gewaehlten Ordner ausgefuehrt
   → Session erscheint in der Liste mit gruener Status-Dot
   → Terminal-Panel zeigt Live-Output der neuen Session

4. Mit Session interagieren
   → Klick auf Session in der Liste → Terminal wechselt zu dieser Session
   → Direkt tippen → Input wird an den PTY-Prozess gesendet
   → ANSI-Farben, Cursor-Bewegungen, Clear-Screen funktionieren nativ

5. Session beobachten
   → Gruen pulsierend = laeuft aktiv (Output kommt)
   → Gelb = wartet auf Input (Claude stellt eine Frage)
   → Gruen mit Checkmark = fertig (Prozess beendet, Exit-Code 0)
   → Rot = Fehler (Exit-Code != 0)

6. Benachrichtigungen
   → Windows Toast wenn Session fertig wird
   → Windows Toast wenn Claude eine Frage stellt (App nicht im Fokus)

7. Session beenden
   → "X"-Button an der Session oder Ctrl+C im Terminal
   → Beendete Sessions bleiben in der Liste (ausgegraut), koennen geschlossen werden
```

---

## 2. UI-Entwurf

### 2.1 Haupt-Layout (ASCII-Wireframe)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌──┐                    Claude Session Manager              _ □ X  │
│ │SM│ ──────────────────────────────────────────────────────────────│
│ │  │                                                               │
│ │PP│  ┌─ Session-Liste (280px) ──┐  ┌─ Terminal-Panel ──────────┐ │
│ │  │  │                          │  │                            │ │
│ │  │  │  [+ Neue Session]        │  │  ~/projects/my-app $      │ │
│ │  │  │                          │  │                            │ │
│ │──│  │  ● my-app                │  │  claude --dangerously-     │ │
│ │  │  │    ~/projects/my-app     │  │  skip-permissions          │ │
│ │ST│  │    Laeuft seit 5:23      │  │                            │ │
│ │  │  │                          │  │  I'll help you with...     │ │
│ │  │  │  ◉ api-server         ←──│──│──(ausgewaehlt)             │ │
│ │  │  │    ~/projects/api        │  │                            │ │
│ │  │  │    Wartet auf Input      │  │  > What would you like     │ │
│ │  │  │                          │  │    me to do?               │ │
│ │  │  │  ✓ docs-update           │  │                            │ │
│ │  │  │    ~/projects/docs       │  │  █ (Cursor — bereit fuer   │ │
│ │  │  │    Fertig (2:15)         │  │     Eingabe)               │ │
│ │  │  │                          │  │                            │ │
│ │  │  │  ✗ broken-build          │  │                            │ │
│ │  │  │    ~/projects/broken     │  │                            │ │
│ │  │  │    Fehler (Exit 1)       │  │                            │ │
│ │  │  │                          │  │                            │ │
│ │  │  └──────────────────────────┘  └────────────────────────────┘ │
│ │  │                                                               │
│ └──┘  ┌─ Status-Leiste ──────────────────────────────────────────┐ │
│       │ 1 aktiv · 1 wartend · 1 fertig · 1 Fehler    │ PowerShell│ │
│       └──────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘

Legende SideNav:
  SM = Session Manager (Standard, aktiver Tab)
  PP = Pipeline (bestehend, optional)
  ST = Settings (minimal)
```

### 2.2 Session-Liste (linkes Panel)

Jede Session-Card zeigt:

```
┌──────────────────────────────┐
│ ● Titel                   ✗ │  ← Status-Dot + Titel + Close-Button
│   ~/pfad/zum/ordner          │  ← Arbeitsverzeichnis (gekuerzt)
│   Laeuft seit 5:23           │  ← Zeitanzeige (kontextabhaengig)
└──────────────────────────────┘
```

**Status-Dots:**
- `●` Gruen pulsierend — Prozess laeuft, Output kommt
- `●` Gelb pulsierend — Wartet auf Input (Claude fragt)
- `✓` Gruen statisch — Fertig (Exit 0)
- `✗` Rot statisch — Fehler (Exit != 0)

**Zeitanzeige:**
- Running: "Laeuft seit M:SS" (Live-Timer)
- Waiting: "Wartet auf Input"
- Done: "Fertig (Dauer M:SS)"
- Error: "Fehler (Exit Code N)"

**Sortierung:** Aktive/wartende oben, fertige/fehlerhafte unten. Innerhalb: nach Erstellungszeit.

### 2.3 "Neue Session"-Dialog

```
┌─────────────────────────────────────────┐
│  Neue Claude Session                  X │
│─────────────────────────────────────────│
│                                         │
│  Ordner:                                │
│  ┌───────────────────────────┐ [Waehlen]│
│  │ C:\Projects\my-app        │          │
│  └───────────────────────────┘          │
│                                         │
│  Titel (optional):                      │
│  ┌───────────────────────────┐          │
│  │ my-app                    │ ← Auto   │
│  └───────────────────────────┘          │
│                                         │
│  Shell:                                 │
│  ○ PowerShell (Standard)                │
│  ○ CMD                                  │
│  ○ Git Bash                             │
│                                         │
│           [Abbrechen]  [Starten]        │
└─────────────────────────────────────────┘
```

### 2.4 Status-Leiste

Am unteren Rand, eine Zeile:

```
┌──────────────────────────────────────────────────────────────────┐
│ ● 2 aktiv · ● 1 wartend · ✓ 3 fertig · ✗ 1 Fehler  │ PowerShell │
└──────────────────────────────────────────────────────────────────┘
```

### 2.5 SideNav-Anpassung

Die bestehende `SideNav` wird erweitert:

| Tab | Icon | Default? | Beschreibung |
|-----|------|----------|-------------|
| `sessions` | `Monitor` (lucide) | **JA** (neuer Default) | Session Manager — Hauptansicht |
| `pipeline` | `Activity` | Nein | Bestehende Pipeline-Map (bleibt, sekundaer) |
| `settings` | `Settings` | Nein | Minimale Einstellungen (Shell-Default) |

**Entfernt aus SideNav:** `hub` (nicht im MVP), `terminal` (wird durch `sessions` ersetzt).

### 2.6 Leerer Zustand (Empty State)

Wenn keine Sessions existieren:

```
┌─ Terminal-Panel ─────────────────────────────────────────────┐
│                                                              │
│                                                              │
│              ┌──────────────────────────┐                    │
│              │   + Neue Session starten │                    │
│              └──────────────────────────┘                    │
│                                                              │
│       Waehle einen Ordner und starte eine Claude Session.    │
│       Der Output erscheint hier in Echtzeit.                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Technischer Entwurf

### 3.1 Frontend (React / TypeScript)

#### Neue Komponenten

| Datei | Beschreibung | Eltern |
|-------|-------------|--------|
| `src/components/sessions/SessionManagerView.tsx` | Hauptansicht: Split-Layout (Liste + Terminal) | `AppShell` |
| `src/components/sessions/SessionList.tsx` | Scrollbare Liste aller Sessions + "Neue Session"-Button | `SessionManagerView` |
| `src/components/sessions/SessionCard.tsx` | Einzelne Session-Karte mit Status, Titel, Timer | `SessionList` |
| `src/components/sessions/SessionTerminal.tsx` | xterm.js Wrapper fuer eine einzelne Session | `SessionManagerView` |
| `src/components/sessions/NewSessionDialog.tsx` | Modal-Dialog: Ordner-Picker, Titel, Shell-Auswahl | `SessionManagerView` |
| `src/components/sessions/SessionStatusBar.tsx` | Untere Statusleiste mit Zaehler | `SessionManagerView` |
| `src/components/sessions/EmptyState.tsx` | Leerer Zustand wenn keine Sessions | `SessionManagerView` |

#### Komponenten-Hierarchie

```
AppShell
├── SideNav (angepasst: sessions als Default-Tab)
├── Header (ungeaendert)
└── main
    └── SessionManagerView
        ├── SessionList
        │   ├── "Neue Session"-Button → oeffnet NewSessionDialog
        │   └── SessionCard[] (je Session)
        ├── SessionTerminal (fuer aktive Session) / EmptyState
        ├── NewSessionDialog (Modal, bedingt)
        └── SessionStatusBar
```

#### Bestehende Komponenten — Anpassungen

| Datei | Aenderung |
|-------|-----------|
| `src/store/uiStore.ts` | `ActiveTab`: `"sessions"` hinzufuegen, Default aendern auf `"sessions"` |
| `src/components/layout/SideNav.tsx` | `"sessions"` als ersten Tab, `"hub"` und `"terminal"` entfernen |
| `src/components/layout/AppShell.tsx` | `case "sessions"` → `<SessionManagerView />`, Default-Case auf `sessions` |
| `src/components/Header.tsx` | Titel dynamisch: "Claude Session Manager" statt bisheriger Titel |

#### Bestehende Komponenten — NICHT mehr als Default

| Datei | Status |
|-------|--------|
| `src/components/DashboardMap.tsx` | Bleibt im Code, nur ueber `pipeline`-Tab erreichbar |
| `src/components/layout/placeholders.tsx` | `HubPlaceholder` entfaellt (kein Hub-Tab), `TerminalPlaceholder` entfaellt |

#### SessionManagerView.tsx — Struktur

```tsx
// src/components/sessions/SessionManagerView.tsx
import { useState } from "react";
import { SessionList } from "./SessionList";
import { SessionTerminal } from "./SessionTerminal";
import { NewSessionDialog } from "./NewSessionDialog";
import { SessionStatusBar } from "./SessionStatusBar";
import { EmptyState } from "./EmptyState";
import { useSessionStore } from "../../store/sessionStore";

export function SessionManagerView() {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const sessionCount = useSessionStore((s) => s.sessions.length);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        {/* Linke Spalte: Session-Liste */}
        <div className="w-[280px] min-w-[280px] border-r border-dark-border flex flex-col">
          <SessionList onNewSession={() => setShowNewDialog(true)} />
        </div>

        {/* Rechte Spalte: Terminal */}
        <div className="flex-1 min-w-0">
          {activeSessionId ? (
            <SessionTerminal sessionId={activeSessionId} />
          ) : (
            <EmptyState onNewSession={() => setShowNewDialog(true)} />
          )}
        </div>
      </div>

      {/* Unten: Statusleiste */}
      <SessionStatusBar />

      {/* Modal */}
      {showNewDialog && (
        <NewSessionDialog onClose={() => setShowNewDialog(false)} />
      )}
    </div>
  );
}
```

#### SessionCard.tsx — Props-Interface

```tsx
interface SessionCardProps {
  session: ClaudeSession;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
}
```

#### SessionTerminal.tsx — xterm.js Integration

```tsx
// src/components/sessions/SessionTerminal.tsx
import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface SessionTerminalProps {
  sessionId: string;
}

export function SessionTerminal({ sessionId }: SessionTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#00ff88",
        selectionBackground: "#264f78",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Input: User tippt → sende an Backend
    term.onData((data) => {
      invoke("write_session", { id: sessionId, data });
    });

    // Output: Backend PTY-Output → xterm
    const unlistenPromise = listen<{ id: string; data: string }>(
      "session-output",
      (event) => {
        if (event.payload.id === sessionId) {
          term.write(event.payload.data);
        }
      }
    );

    // Resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      invoke("resize_session", { id: sessionId, cols, rows });
    });
    resizeObserver.observe(containerRef.current);

    // Initiale Groesse melden
    setTimeout(() => {
      fitAddon.fit();
      invoke("resize_session", {
        id: sessionId,
        cols: term.cols,
        rows: term.rows,
      });
    }, 50);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#0d1117]"
      style={{ padding: "4px" }}
    />
  );
}
```

#### Store: Neuer `sessionStore.ts`

Der bestehende `terminalStore.ts` wird **nicht erweitert**, sondern ein neuer `sessionStore.ts` erstellt. Gruende:
- `terminalStore` modelliert generische Shell-Sessions
- `sessionStore` modelliert spezifisch Claude-Sessions mit Status-Heuristik und Notifications
- Spaeter koennte `terminalStore` fuer reine Shell-Tabs wiederverwendet werden

```typescript
// src/store/sessionStore.ts
import { create } from "zustand";

// ============================================================================
// Types
// ============================================================================

export type SessionShell = "powershell" | "cmd" | "gitbash";

export type SessionStatus =
  | "starting"     // PTY wird gespawnt
  | "running"      // Claude laeuft, Output kommt
  | "waiting"      // Claude wartet auf User-Input (Heuristik)
  | "done"         // Prozess beendet, Exit-Code 0
  | "error";       // Prozess beendet, Exit-Code != 0

export interface ClaudeSession {
  id: string;
  title: string;
  folder: string;
  shell: SessionShell;
  status: SessionStatus;
  createdAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  lastOutputAt: number;          // Fuer "wartet"-Heuristik
  lastOutputSnippet: string;     // Letzte ~200 Zeichen fuer Status-Anzeige
}

// ============================================================================
// Constants
// ============================================================================

const MAX_SESSIONS = 8;

// ============================================================================
// State Interface
// ============================================================================

export interface SessionState {
  sessions: ClaudeSession[];
  activeSessionId: string | null;

  // Actions
  addSession: (params: {
    id: string;
    title: string;
    folder: string;
    shell: SessionShell;
  }) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  updateStatus: (id: string, status: SessionStatus) => void;
  setExitCode: (id: string, exitCode: number) => void;
  updateLastOutput: (id: string, snippet: string) => void;
}

// ============================================================================
// Store
// ============================================================================

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,

  addSession: (params) =>
    set((state) => {
      if (state.sessions.length >= MAX_SESSIONS) {
        console.warn(`[sessionStore] Max sessions (${MAX_SESSIONS}) erreicht.`);
        return state;
      }
      const session: ClaudeSession = {
        id: params.id,
        title: params.title,
        folder: params.folder,
        shell: params.shell,
        status: "starting",
        createdAt: Date.now(),
        finishedAt: null,
        exitCode: null,
        lastOutputAt: Date.now(),
        lastOutputSnippet: "",
      };
      return {
        sessions: [...state.sessions, session],
        activeSessionId: params.id,
      };
    }),

  removeSession: (id) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: remaining,
        activeSessionId:
          state.activeSessionId === id
            ? (remaining[remaining.length - 1]?.id ?? null)
            : state.activeSessionId,
      };
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateStatus: (id, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id
          ? {
              ...s,
              status,
              finishedAt:
                status === "done" || status === "error" ? Date.now() : s.finishedAt,
            }
          : s
      ),
    })),

  setExitCode: (id, exitCode) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id
          ? {
              ...s,
              exitCode,
              status: exitCode === 0 ? "done" : "error",
              finishedAt: Date.now(),
            }
          : s
      ),
    })),

  updateLastOutput: (id, snippet) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id
          ? { ...s, lastOutputAt: Date.now(), lastOutputSnippet: snippet }
          : s
      ),
    })),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectActiveSession = (state: SessionState) =>
  state.sessions.find((s) => s.id === state.activeSessionId);

export const selectSessionCounts = (state: SessionState) => ({
  active: state.sessions.filter((s) => s.status === "running").length,
  waiting: state.sessions.filter((s) => s.status === "waiting").length,
  done: state.sessions.filter((s) => s.status === "done").length,
  error: state.sessions.filter((s) => s.status === "error").length,
  total: state.sessions.length,
});
```

#### Frontend-Dependencies (npm)

```bash
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
```

Versionen (zum Zeitpunkt des Entwurfs):
- `@xterm/xterm` ^5.5.0
- `@xterm/addon-fit` ^0.10.0
- `@xterm/addon-web-links` ^0.11.0

### 3.2 Backend (Rust / Tauri v2)

#### PTY-Architektur

`portable-pty` wird verwendet um `claude --dangerously-skip-permissions` als echten PTY-Prozess zu starten. Das ist zwingend noetig fuer:
- ANSI-Escape-Sequenzen (Farben, Cursor)
- Interaktive Eingabe (Claude's Prompts)
- Ctrl+C / Signal-Handling
- Terminal-Resize (SIGWINCH-Equivalent)

#### Neue Cargo Dependencies

```toml
# In src-tauri/Cargo.toml [dependencies] hinzufuegen:
portable-pty = "0.8"
tauri-plugin-notification = "2"
```

#### Rust-Modul: `src-tauri/src/session/`

Neue Dateien:

```
src-tauri/src/
├── lib.rs              (angepasst: session-Modul registrieren)
├── session/
│   ├── mod.rs          (pub mod manager; pub mod commands;)
│   ├── manager.rs      (SessionManager struct)
│   └── commands.rs     (Tauri Commands)
└── ...
```

#### `session/manager.rs` — Kern-Struct

```rust
// src-tauri/src/session/manager.rs

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub folder: String,
    pub shell: String,
    pub status: String,       // "running" | "done" | "error"
    pub exit_code: Option<i32>,
}

#[derive(Clone, serde::Serialize)]
pub struct SessionOutputEvent {
    pub id: String,
    pub data: String,
}

#[derive(Clone, serde::Serialize)]
pub struct SessionExitEvent {
    pub id: String,
    pub exit_code: i32,
}

#[derive(Clone, serde::Serialize)]
pub struct SessionStatusEvent {
    pub id: String,
    pub status: String,
    pub snippet: String,
}

struct SessionHandle {
    info: SessionInfo,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, SessionHandle>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Spawnt eine neue Claude-Session in einem PTY.
    ///
    /// Bestimmt den Shell-Befehl anhand des `shell`-Parameters:
    /// - "powershell" → `powershell.exe -NoExit -Command claude --dangerously-skip-permissions`
    /// - "cmd" → `cmd.exe /K claude --dangerously-skip-permissions`
    /// - "gitbash" → `bash.exe -c "claude --dangerously-skip-permissions"`
    pub fn create_session(
        &self,
        app: AppHandle,
        id: String,
        title: String,
        folder: String,
        shell: String,
    ) -> Result<SessionInfo, String> {
        let pty_system = native_pty_system();

        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("PTY open failed: {e}"))?;

        let mut cmd = CommandBuilder::new(Self::shell_executable(&shell));
        for arg in Self::shell_args(&shell) {
            cmd.arg(arg);
        }
        cmd.cwd(&folder);

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Spawn failed: {e}"))?;

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Writer failed: {e}"))?;

        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Reader failed: {e}"))?;

        let info = SessionInfo {
            id: id.clone(),
            title,
            folder,
            shell,
            status: "running".to_string(),
            exit_code: None,
        };

        {
            let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
            sessions.insert(
                id.clone(),
                SessionHandle {
                    info: info.clone(),
                    writer,
                    master: pty_pair.master,
                },
            );
        }

        // Reader-Thread: liest PTY-Output und emittiert Events
        let read_id = id.clone();
        let read_app = app.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,       // EOF
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();

                        // Output-Event an Frontend
                        let _ = read_app.emit("session-output", SessionOutputEvent {
                            id: read_id.clone(),
                            data: data.clone(),
                        });

                        // Status-Heuristik: letzte Zeile pruefen
                        let snippet = if data.len() > 200 {
                            data[data.len() - 200..].to_string()
                        } else {
                            data.clone()
                        };

                        let status = Self::detect_status(&snippet);
                        let _ = read_app.emit("session-status", SessionStatusEvent {
                            id: read_id.clone(),
                            status,
                            snippet,
                        });
                    }
                    Err(_) => break,
                }
            }
        });

        // Waiter-Thread: wartet auf Prozess-Ende
        let wait_id = id.clone();
        let wait_app = app;
        thread::spawn(move || {
            let result = child
                .into_inner()
                .wait()
                .map(|status| {
                    status
                        .exit_code()
                        .unwrap_or(-1) as i32
                })
                .unwrap_or(-1);

            let _ = wait_app.emit("session-exit", SessionExitEvent {
                id: wait_id,
                exit_code: result,
            });
        });

        Ok(info)
    }

    /// Sendet Daten (User-Input) an eine laufende Session.
    pub fn write_to_session(&self, id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| format!("Session {id} nicht gefunden"))?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Write failed: {e}"))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Flush failed: {e}"))?;
        Ok(())
    }

    /// Aendert die Terminal-Groesse einer Session.
    pub fn resize_session(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(id)
            .ok_or_else(|| format!("Session {id} nicht gefunden"))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize failed: {e}"))
    }

    /// Schliesst eine Session (killt den Prozess).
    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        // Drop entfernt den MasterPty, was den Child-Prozess signalisiert
        sessions
            .remove(id)
            .ok_or_else(|| format!("Session {id} nicht gefunden"))?;
        Ok(())
    }

    /// Gibt alle aktiven Sessions zurueck.
    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.values().map(|s| s.info.clone()).collect()
    }

    // --- Private Helpers ---

    fn shell_executable(shell: &str) -> &'static str {
        match shell {
            "powershell" => "powershell.exe",
            "cmd" => "cmd.exe",
            "gitbash" => "bash.exe",
            _ => "powershell.exe",
        }
    }

    fn shell_args(shell: &str) -> Vec<&'static str> {
        match shell {
            "powershell" => vec![
                "-NoExit",
                "-Command",
                "claude --dangerously-skip-permissions",
            ],
            "cmd" => vec!["/K", "claude --dangerously-skip-permissions"],
            "gitbash" => vec!["-c", "claude --dangerously-skip-permissions"],
            _ => vec![
                "-NoExit",
                "-Command",
                "claude --dangerously-skip-permissions",
            ],
        }
    }

    /// Heuristik: erkennt ob Claude auf Input wartet.
    ///
    /// Prueft den letzten Output-Snippet auf typische Prompt-Muster:
    /// - Endet mit "> " oder "? " (Claude's interaktive Prompts)
    /// - Endet mit "..." gefolgt von Newline (Denkpause)
    /// - Enthaelt "(y/n)" oder "[Y/n]" (Ja/Nein-Frage)
    fn detect_status(snippet: &str) -> String {
        let trimmed = snippet.trim_end();
        if trimmed.ends_with("> ")
            || trimmed.ends_with("? ")
            || trimmed.ends_with("(y/n)")
            || trimmed.ends_with("[Y/n]")
            || trimmed.ends_with("[y/N]")
        {
            "waiting".to_string()
        } else {
            "running".to_string()
        }
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}
```

#### `session/commands.rs` — Tauri Commands

```rust
// src-tauri/src/session/commands.rs

use super::manager::SessionManager;
use std::sync::Arc;
use tauri::{AppHandle, State};

// Alle Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn create_session(
        app: AppHandle,
        manager: State<'_, Arc<SessionManager>>,
        folder: String,
        title: Option<String>,
        shell: Option<String>,
    ) -> Result<super::super::manager::SessionInfo, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let title = title.unwrap_or_else(|| {
            std::path::Path::new(&folder)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Session".to_string())
        });
        let shell = shell.unwrap_or_else(|| "powershell".to_string());

        manager.create_session(app, id, title, folder, shell)
    }

    #[tauri::command]
    pub async fn write_session(
        manager: State<'_, Arc<SessionManager>>,
        id: String,
        data: String,
    ) -> Result<(), String> {
        manager.write_to_session(&id, &data)
    }

    #[tauri::command]
    pub async fn resize_session(
        manager: State<'_, Arc<SessionManager>>,
        id: String,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        manager.resize_session(&id, cols, rows)
    }

    #[tauri::command]
    pub async fn close_session(
        manager: State<'_, Arc<SessionManager>>,
        id: String,
    ) -> Result<(), String> {
        manager.close_session(&id)
    }

    #[tauri::command]
    pub async fn list_sessions(
        manager: State<'_, Arc<SessionManager>>,
    ) -> Result<Vec<super::super::manager::SessionInfo>, String> {
        Ok(manager.list_sessions())
    }
}
```

#### `lib.rs` — Anpassung

```rust
// src-tauri/src/lib.rs (angepasst)

use std::sync::{Arc, Mutex};

pub mod adp;
pub mod error;
pub mod pipeline;
pub mod session;  // NEU

// ... bestehende Structs bleiben ...

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pipeline_state = Arc::new(Mutex::new(PipelineState::default()));
    let session_manager = Arc::new(session::manager::SessionManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())  // NEU
        .manage(pipeline_state)
        .manage(session_manager)                     // NEU
        .invoke_handler(tauri::generate_handler![
            // Bestehend
            pipeline::commands::start_pipeline,
            pipeline::commands::stop_pipeline,
            pipeline::commands::pick_project_folder,
            // NEU
            session::commands::commands::create_session,
            session::commands::commands::write_session,
            session::commands::commands::resize_session,
            session::commands::commands::close_session,
            session::commands::commands::list_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### Tauri Commands — Zusammenfassung

| Command | Parameter | Return | Beschreibung |
|---------|-----------|--------|-------------|
| `create_session` | `folder: String, title?: String, shell?: String` | `SessionInfo` | Spawnt PTY mit `claude --dangerously-skip-permissions` |
| `write_session` | `id: String, data: String` | `()` | Sendet User-Input an Session |
| `resize_session` | `id: String, cols: u16, rows: u16` | `()` | Terminal-Groesse aendern |
| `close_session` | `id: String` | `()` | Session beenden (kill) |
| `list_sessions` | — | `Vec<SessionInfo>` | Alle Sessions mit Status |

#### Tauri Events (Backend → Frontend)

| Event | Payload | Beschreibung |
|-------|---------|-------------|
| `session-output` | `{ id: String, data: String }` | PTY-Output (roh, inkl. ANSI) |
| `session-exit` | `{ id: String, exit_code: i32 }` | Prozess beendet |
| `session-status` | `{ id: String, status: String, snippet: String }` | Status-Heuristik-Update |

### 3.3 Status-Erkennung: "Wartet auf Input"

Dies ist die schwierigste Heuristik. Strategie mit drei Ebenen:

**Ebene 1 — Prompt-Pattern-Matching (im Rust-Backend, `detect_status`):**
```
Erkannte Patterns im letzten Output-Chunk:
- Endet mit "> "                  → Claude's Standard-Input-Prompt
- Endet mit "? "                  → Claude stellt eine Frage
- Enthaelt "(y/n)" oder "[Y/n]"  → Ja/Nein-Frage
- Enthaelt "Do you want to"      → Bestaetigungs-Prompt
```

**Ebene 2 — Inaktivitaets-Timer (im Frontend):**
```
Wenn seit > 5 Sekunden kein Output kam UND der Prozess laeuft
→ Status wechselt von "running" zu "waiting"
→ Wird zurueckgesetzt sobald neuer Output kommt
```

**Ebene 3 — Kombiniert (Frontend-Logik in SessionManagerView):**
```typescript
// In einem useEffect der session-status Events abhoert:
listen<SessionStatusEvent>("session-status", (event) => {
  const { id, status, snippet } = event.payload;
  const store = useSessionStore.getState();

  if (status === "waiting") {
    store.updateStatus(id, "waiting");
    // Windows-Notification senden (wenn App nicht im Fokus)
    sendNotification(id, "Claude wartet auf Eingabe", snippet);
  } else {
    store.updateStatus(id, "running");
  }

  store.updateLastOutput(id, snippet);
});
```

### 3.4 Notifications

**Technologie:** `tauri-plugin-notification` (bereits in Tauri v2 verfuegbar).

**Frontend-Integration:**

```typescript
// src/lib/notifications.ts
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export async function notifySessionEvent(
  title: string,
  body: string
): Promise<void> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  if (granted) {
    sendNotification({ title, body });
  }
}
```

**Trigger-Punkte:**

| Event | Notification-Titel | Body |
|-------|-------------------|------|
| Session beendet (Exit 0) | "Session fertig: {title}" | "Claude hat die Arbeit in {ordner} abgeschlossen." |
| Session Fehler (Exit != 0) | "Session fehlgeschlagen: {title}" | "Exit-Code {code} in {ordner}" |
| Wartet auf Input | "Claude wartet: {title}" | Letzte Output-Zeile (gekuerzt) |

**Bedingung:** Notifications werden NUR gesendet wenn die App NICHT im Vordergrund ist (Tauri Window-Focus-Check).

### 3.5 tauri.conf.json — Anpassungen

Notwendige Aenderungen:
- `tauri-plugin-notification` in `plugins` registrieren
- Permissions fuer Notification-Plugin in `capabilities/`

### 3.6 Was passiert mit bestehendem Code?

| Modul | Aktion |
|-------|--------|
| `pipeline/` (Rust) | Bleibt unveraendert, Commands bleiben registriert |
| `pipelineStore.ts` | Bleibt, wird ueber `pipeline`-Tab genutzt |
| `terminalStore.ts` | Bleibt als Referenz, wird nicht aktiv genutzt im MVP |
| `logParser.ts` | Bleibt, nur relevant fuer Pipeline-Tab |
| `DashboardMap.tsx` | Bleibt, ueber Pipeline-Tab erreichbar |
| `mockPipeline.ts` | Bleibt, startet nur im Pipeline-Tab |
| `protocols/schema.ts` | Bleibt, nicht MVP-relevant |

---

## 4. Implementierungsplan

### Sprint 1: PTY-Backend + Basis-UI (3-5 Tage)

| Tag | Task | Dateien | DoD |
|-----|------|---------|-----|
| 1 | `portable-pty` + `tauri-plugin-notification` in `Cargo.toml`, `session/mod.rs` + `manager.rs` Grundgeruest | `Cargo.toml`, `session/` | `cargo check` gruen |
| 2 | `SessionManager::create_session` + Reader-Thread, `session/commands.rs` mit `create_session` + `write_session` | `session/manager.rs`, `session/commands.rs` | PTY spawnt, Output kommt als Event |
| 3 | `resize_session` + `close_session` + `list_sessions`, `lib.rs` anpassen | `session/commands.rs`, `lib.rs` | Alle 5 Commands funktional, `cargo check` gruen |
| 4 | Frontend: `sessionStore.ts`, `SessionManagerView.tsx`, `SessionList.tsx`, `SessionCard.tsx`, `EmptyState.tsx` | `src/store/`, `src/components/sessions/` | UI rendert, Session-Liste zeigt Eintraege |
| 5 | Frontend: `SessionTerminal.tsx` (xterm.js), `NewSessionDialog.tsx`, `SideNav` + `AppShell` + `uiStore` anpassen | `src/components/sessions/`, `src/components/layout/` | Vollstaendiger Flow: Dialog → Session → Output sichtbar |

**Sprint 1 Definition of Done:**
- [ ] `claude --dangerously-skip-permissions` laeuft als PTY-Prozess
- [ ] Output erscheint in Echtzeit im xterm.js Terminal
- [ ] Mehrere Sessions parallel moeglich
- [ ] `npx tsc --noEmit && npm run build` gruen
- [ ] `cd src-tauri && cargo check` gruen

### Sprint 2: Interaktiver Input + Status + Notifications (3-5 Tage)

| Tag | Task | Dateien | DoD |
|-----|------|---------|-----|
| 1 | Input: `term.onData` → `write_session` durchgaengig testen, Ctrl+C handling | `SessionTerminal.tsx` | User kann tippen und Claude antwortet |
| 2 | Status-Erkennung: `detect_status` in Rust, `session-status` Event, Frontend-Verarbeitung | `session/manager.rs`, `SessionManagerView.tsx` | Status-Dots wechseln korrekt |
| 3 | Inaktivitaets-Timer im Frontend, kombinierte Heuristik | `sessionStore.ts`, `SessionManagerView.tsx` | "Wartet auf Input" wird nach 5s erkannt |
| 4 | Notifications: `tauri-plugin-notification` Setup, `notifications.ts` Wrapper, Trigger bei Exit + Waiting | `notifications.ts`, `tauri.conf.json`, Capabilities | Windows Toast erscheint |
| 5 | `SessionStatusBar.tsx`, Live-Timer in `SessionCard`, Polish | `SessionStatusBar.tsx`, `SessionCard.tsx` | Statusleiste zeigt korrekte Zaehler |

**Sprint 2 Definition of Done:**
- [ ] Interaktive Kommunikation mit Claude funktioniert (tippen + antworten)
- [ ] Status-Dots zeigen korrekt: laufend (gruen), wartend (gelb), fertig (gruen+check), fehler (rot)
- [ ] Windows Toast Notification bei Session-Ende und bei Wartet-auf-Input
- [ ] Statusleiste zeigt aggregierte Zaehler
- [ ] `npx tsc --noEmit && npm run build` gruen
- [ ] `cd src-tauri && cargo check` gruen

### Sprint 3: Polish + Installer (2-3 Tage)

| Tag | Task | Dateien | DoD |
|-----|------|---------|-----|
| 1 | Session-Sortierung (aktive oben), Session-Close bestaetigen, Keyboard-Shortcuts (Ctrl+N = neue Session) | `SessionList.tsx`, `SessionManagerView.tsx` | UX polish |
| 2 | NSIS Windows-Installer testen, App-Icon, Bundle-Groesse pruefen | `tauri.conf.json`, Icons | `npm run tauri build` erzeugt Installer |
| 3 | Edge-Cases: Session-Limit erreicht, PTY-Spawn-Fehler, sehr langer Output (Performance) | Diverse | Keine Crashes bei Edge-Cases |

**Sprint 3 Definition of Done:**
- [ ] Windows-Installer funktioniert
- [ ] App startet in < 2 Sekunden
- [ ] Kein Performance-Einbruch bei 5+ Sessions mit langem Output
- [ ] Alle Edge-Cases behandelt

### Gesamtzeitplan

```
Sprint 1: Tag 1-5   ████████████████████  PTY + Basis-UI
Sprint 2: Tag 6-10  ████████████████████  Input + Status + Notifications
Sprint 3: Tag 11-13 ████████████████      Polish + Installer
                                          ─────────────────
                                          ~13 Arbeitstage (2.5 Wochen)
```

---

## 5. Abgrenzung zu bestehenden Tools

| Kriterium | **Claude Session Manager** | **amux** | **claude-orchestra** | **Mission Control / claude-squad** |
|-----------|---------------------------|----------|---------------------|------------------------------------|
| **Plattform** | Native Windows Desktop (Tauri) | CLI (tmux-basiert) | CLI / Python | Web / CLI |
| **Windows-Support** | Erstklassig (ConPTY) | Schlecht (tmux auf Windows problematisch) | Abhaengig | Variiert |
| **Installation** | Ein-Klick NSIS-Installer | `pip install` + tmux noetig | `pip install` | Variiert |
| **Interaktivitaet** | Volles xterm.js Terminal | tmux-Panes | Kein interaktives Terminal | Begrenzt |
| **Multi-Session** | Ja, mit visueller Liste | Ja (tmux-Panes) | Ja (orchestriert) | Ja |
| **Status-Erkennung** | Automatisch (Heuristik) | Manuell (tmux beobachten) | Log-basiert | Variiert |
| **Notifications** | Native Windows Toast | Keine | Keine | Teilweise |
| **Ordner-Auswahl** | GUI Folder-Picker | CLI-Parameter | Config-Datei | CLI/Config |
| **Zielgruppe** | Windows-Entwickler die GUI bevorzugen | Unix-Power-User | Pipeline-Orchestrierung | Teams |

**Kern-Differenzierung:** Native Desktop-App, Windows-first, kein tmux/WSL noetig, Ein-Klick-Start, visuelle Session-Verwaltung mit automatischer Status-Erkennung.

---

## 6. Technische Risiken

### Risiko 1: PTY auf Windows (ConPTY) — HOCH

**Problem:** `portable-pty` nutzt auf Windows die ConPTY-API. Diese ist weniger ausgereift als Unix-PTY und hat bekannte Eigenheiten:
- Manche ANSI-Sequenzen werden nicht korrekt weitergeleitet
- Resize kann Artefakte erzeugen
- `portable-pty` 0.8 hat sporadische Panics bei schnellem Close+Reopen

**Mitigation:**
- Frueh testen (Sprint 1, Tag 1-2), bei Problemen auf `conpty` Crate als Alternative ausweichen
- Resize mit Debounce (100ms) um Race Conditions zu vermeiden
- Session-Close mit Grace-Period (500ms warten, dann kill)
- Fallback: Wenn ConPTY nicht funktioniert, `std::process::Command` mit Pipe-basiertem I/O (verliert ANSI aber funktioniert)

**Puffer:** +1-2 Tage in Sprint 1

### Risiko 2: Status-Erkennung "Wartet auf Input" — MITTEL

**Problem:** Es gibt keine offizielle API um zu erkennen ob Claude auf Input wartet. Die Heuristik basiert auf Output-Pattern-Matching und Inaktivitaets-Timern.

**Bekannte Schwaechen:**
- Claude's Prompt-Format kann sich mit Updates aendern
- Lange Denkphasen koennten faelschlich als "wartend" erkannt werden
- Manche Plugins/Tools erzeugen aehnliche Patterns

**Mitigation:**
- Pattern-Matching als erste Heuristik (erkennt 80%+ der Faelle)
- Inaktivitaets-Timer (5s) als zweite Schicht
- Patterns konfigurierbar machen (Settings-Store, spaetere Phase)
- Status "wartend" ist immer nur ein Hinweis, nie eine Garantie — UI zeigt "Moeglicherweise wartend"
- Bei False-Positives: Notification wird trotzdem gesendet, schadet nicht

**Puffer:** +1 Tag in Sprint 2

### Risiko 3: xterm.js Performance bei langem Output — MITTEL

**Problem:** Stundenlange Claude-Sessions erzeugen megabytes an Terminal-Output. xterm.js hat einen Scrollback-Buffer der RAM verbraucht.

**Mitigation:**
- xterm.js `scrollback`-Option auf 10.000 Zeilen begrenzen (Default: 1000)
- `sessionStore.lastOutputSnippet` speichert nur die letzten 200 Zeichen (nicht den vollen Output)
- Kein Output-Buffer im Frontend-Store — xterm.js IS der Buffer
- Bei Memory-Problemen: `term.clear()` + Benachrichtigung "Buffer wurde geleert"

**Puffer:** 0.5 Tage in Sprint 3

### Risiko 4: `portable-pty` Child-Process Cleanup — MITTEL

**Problem:** Wenn die Tauri-App crashed oder per Task-Manager gekillt wird, bleiben orphaned `claude`-Prozesse zurueck.

**Mitigation:**
- Tauri `on_window_close_requested` Hook: Alle Sessions sauber schliessen
- Windows Job Objects: Child-Prozesse an den Parent binden (automatisches Kill bei Parent-Tod)
- `SessionManager::drop` Implementierung die alle Sessions schliesst

**Puffer:** In Sprint 3 Edge-Cases behandeln

### Risiko-Matrix

| Risiko | Eintrittswahrscheinlichkeit | Auswirkung | Puffer |
|--------|----------------------------|------------|--------|
| ConPTY-Probleme | 40% | Hoch (Kernfunktion) | +2 Tage |
| Status-Heuristik falsch | 60% (minor) | Niedrig (Notification-Spam) | +1 Tag |
| xterm.js Memory | 20% | Mittel (Performance) | +0.5 Tage |
| Orphaned Processes | 30% | Mittel (User-Aerger) | +0.5 Tage |

**Gesamt-Puffer:** 4 Tage → eingerechnet im Zeitplan (13 Tage + 4 = 17 Tage Worst Case)

---

## Anhang A: Tauri Permissions / Capabilities

Fuer den Session Manager muessen folgende Capabilities in `src-tauri/capabilities/` konfiguriert werden:

```json
{
  "identifier": "session-manager",
  "description": "Claude Session Manager Capabilities",
  "permissions": [
    "dialog:allow-open",
    "notification:default",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "notification:allow-notify"
  ]
}
```

## Anhang B: npm-Dependencies Aenderungen

```json
{
  "dependencies": {
    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "@tauri-apps/plugin-notification": "^2.2.0"
  }
}
```

## Anhang C: Datei-Checkliste fuer Implementierung

**Neue Dateien (Rust):**
- [ ] `src-tauri/src/session/mod.rs`
- [ ] `src-tauri/src/session/manager.rs`
- [ ] `src-tauri/src/session/commands.rs`

**Neue Dateien (Frontend):**
- [ ] `src/store/sessionStore.ts`
- [ ] `src/components/sessions/SessionManagerView.tsx`
- [ ] `src/components/sessions/SessionList.tsx`
- [ ] `src/components/sessions/SessionCard.tsx`
- [ ] `src/components/sessions/SessionTerminal.tsx`
- [ ] `src/components/sessions/NewSessionDialog.tsx`
- [ ] `src/components/sessions/SessionStatusBar.tsx`
- [ ] `src/components/sessions/EmptyState.tsx`
- [ ] `src/lib/notifications.ts`

**Geaenderte Dateien:**
- [ ] `src-tauri/Cargo.toml` — neue Dependencies
- [ ] `src-tauri/src/lib.rs` — Session-Modul + Plugin registrieren
- [ ] `src/store/uiStore.ts` — `ActiveTab` erweitern, Default aendern
- [ ] `src/components/layout/SideNav.tsx` — Tabs anpassen
- [ ] `src/components/layout/AppShell.tsx` — Session-View einbinden
- [ ] `package.json` — xterm.js + Notification Plugin
