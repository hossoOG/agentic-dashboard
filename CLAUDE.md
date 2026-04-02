# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AgenticExplorer** — Desktop-App zum Verwalten und Ueberwachen von Claude CLI Sessions. Multi-Session-Terminal mit Projekt-Kontext (CLAUDE.md, Skills, Hooks, GitHub), Favoriten-System und Notizen. Gebaut mit Tauri v2 + React.

**Tech-Stack**: React 18 + TypeScript + Vite (Frontend), Tauri v2 + Rust (Backend), Zustand (State), Tailwind CSS + Framer Motion (Styling/Animation)

**Language**: UI und Doku auf Deutsch, Code auf Englisch

## Commands

```bash
npm run dev              # Vite Dev-Server (Port 5173)
npm run build            # TypeScript-Check + Vite Production Build → dist/
npm run preview          # Preview des Production Builds
npx tsc --noEmit         # Type-Checking ohne Build
npm run tauri dev        # Tauri Desktop-App im Dev-Modus (startet auch Vite)
npm run tauri build      # Kompletter Desktop-Build (Frontend + Rust)
```

> **Tooling**: ESLint 9 + Prettier 3 + Vitest konfiguriert. ESLint laeuft in CI (GitHub Actions), nicht im Build.

## Architecture

**Frontend** (`src/`): React-Komponenten. Session Manager als Hauptansicht. Zustand-Stores fuer State-Management. Pipeline-View (isometrisch) als Sekundaeransicht.

**Backend** (`src-tauri/`): Rust/Tauri verwaltet PTY-Sessions (Claude CLI), liest Projektdateien, ruft GitHub-Daten via `gh` CLI ab.

**Datenfluss Sessions**: User → Session erstellen → Rust spawnt PTY → `session-output` Events → xterm.js Terminal

**Schluessel-Dateien**:
- `src/store/sessionStore.ts` — Session-Management (ephemerer State)
- `src/store/settingsStore.ts` — Persistierter State (Favorites, Notes, Theme)
- `src/store/uiStore.ts` — UI-State (Tabs, Toasts)
- `src/store/pipelineStore.ts` — Pipeline-State (Orchestrator, Worktrees, QA-Gate)
- `src-tauri/src/session/` — Rust Session Manager (PTY, Commands)
- `src/components/sessions/SessionManagerView.tsx` — Haupt-View

**Geloeschter Code**: 12 nie integrierte Dateien (Pipeline-Komponenten, ADP-Adapter, serviceStore, terminalStore, logRedactor, constants) wurden am 2026-03-25 nach gruendlichem Audit entfernt. Details in `tasks/lessons.md`.

## Arbeitsweise

- **Plan-First**: Bei nicht-trivialen Tasks (3+ Schritte oder Architektur-Entscheidungen) → Plan Mode. Bei Problemen: STOP → sofort re-planen, nicht weiterpushen.
- **Subagents liberal einsetzen**: Research, Exploration und parallele Analyse an Subagents delegieren. Ein Task pro Subagent. Main Context Window sauber halten.
- **Verification vor Done**: Task erst abgeschlossen wenn bewiesen funktioniert — Build gruen, Diff demonstriert. Massstab: "Wuerde ein Staff Engineer das absegnen?"
- **Eleganz (balanciert)**: Bei nicht-trivialen Aenderungen hinterfragen: "Gibt es einen eleganteren Weg?" Aber bei einfachen Fixes nicht over-engineeren.
- **Autonomes Bug-Fixing**: Bug-Reports selbststaendig loesen. Logs lesen, Fehler finden — ohne Rueckfragen. Zero Context-Switching fuer den User.
- **Root Causes**: Keine temporaeren Fixes. Ursachen finden. Senior-Developer-Standard.
- **Kleine Commits**: Max 5-10 Dateien pro Commit. Features in logische Schritte aufteilen.

## Task Management

- **Planen**: Tasks in `tasks/todo.md` mit checkbaren Items erfassen
- **Tracken**: Items abhaken sobald erledigt, nicht batchen
- **Ideen einfangen**: Spontane Ideen → `tasks/ideas.md` (kein Filter, kein Urteil)
- **Lernen**: Nach jeder User-Korrektur → `tasks/lessons.md` updaten (Fehler, Korrektur, Regel)
- **Lessons reviewen**: Bei Session-Start `tasks/lessons.md` auf relevante Patterns pruefen
- **Sprint-Planung**: Ideen aus `ideas.md` priorisieren → `todo.md` uebernehmen

## Kommunikationsregeln

- **Keine unverifizierten Behauptungen:** Lies immer zuerst den Code/Config/Skill, BEVOR du Aussagen machst. Belege mit Dateien und Zeilennummern.
- **Unsicherheit kennzeichnen:** Grobe Zuversicht angeben (z.B. "~70% sicher"), Vermutungen klar markieren.
- **Keine Annahmen ueber Skills/Configs:** Nie behaupten was ein Skill tut, ohne ihn gelesen zu haben.

## Development Workflow Rules

- Run `npx tsc --noEmit` after modifying .ts/.tsx files
- Run `npm run build` to verify the full build pipeline
- Tauri-Backend testen: `cd src-tauri && cargo check`

## Testing & Quality Requirements

- **Build-Verifizierung vor "Done"**: `npx tsc --noEmit && npm run build` muessen gruen sein.
- **Visuelles Testen**: Dashboard im Dev-Modus (`npm run tauri dev`) pruefen.
- **Rust-Aenderungen**: `cargo check` im `src-tauri/` Verzeichnis ausfuehren.
- **Tests sind Teil jedes Features** — kein Feature ist "fertig" ohne mindestens 1 Test der bricht wenn das Feature entfernt wird. "Wir testen spaeter" ist nicht akzeptabel.
- **Tests nach Risiko priorisieren**: Persistenz-Verlust > Security > UI-Regression > Store-Logik. Teuerste Failures zuerst testen.
- **Security-Review pro neuem Tauri-Command**: 5-Fragen-Checkliste: (1) Input validiert? (2) Path Traversal geprueft? (3) Shell-Injection moeglich? (4) Timeout vorhanden? (5) Fehler strukturiert?

## Workflow Compliance

- **Skill-Pipeline ist ein Vertrag**: Bei `/implement`, `/feature`, `/bugfix` etc. IMMER zuerst die SKILL.md komplett lesen, dann Phase fuer Phase ausfuehren. Keine Phase ueberspringen, nicht "zusammenfassen".
- **STOPP-Punkte einhalten**: Wenn eine Phase "STOPP" sagt → STOPP. Nicht "zur Effizienz" weiter machen.
- **Sub-Agents nutzen wenn vorgeschrieben**: Wenn eine Phase einen Sub-Agent vorschreibt, diesen Agent starten — nicht die Aufgabe selbst uebernehmen.

## Code Quality Gates

- **Null-Safety**: Optional chaining (`?.`) und nullish coalescing (`??`) bei Tauri-Events, Store-Zugriffen und User-Input.
- **Signature Changes → Alle Caller updaten**: Nach Aenderung einer Funktion/Action-Signatur: Grep nach allen Usages im gesamten Codebase, ALLE updaten. Kein Commit mit broken Callers.
- **Nicht behaupten, verifizieren**: "Funktioniert" erst sagen wenn der Beweis vorliegt (Build-Log, Screenshot). Keine Annahmen ueber Dev-Server oder Konfiguration.
- **Pre-PR Pflicht**: Vor `gh pr create` MUESSEN fehlerfrei sein: 1) `npx tsc --noEmit` 2) `npm run build`. Bei Failure → zuerst fixen.

## Coding Conventions

- Conventional Commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- **Scopes**: `ui`, `store`, `parser`, `tauri`, `config`
- **React**: Functional Components, Hooks, kein class-based
- **State**: Zustand — Session-State in `sessionStore.ts`, persistierter State in `settingsStore.ts`, UI-State in `uiStore.ts`
- **Styling**: Tailwind Utility Classes bevorzugen, Custom CSS nur fuer Animationen/3D-Transforms in `index.css`
- **Rust**: Tauri Commands in `lib.rs` im `mod commands {}` Block (wegen rustc 1.94 E0255 Workaround)

## Parallele Entwicklung

- `.claude/worktrees/` ist in .gitignore — jeder Worktree bekommt eigenen Branch + Arbeitskopie
- Nach Fertigstellung: PR reviewen, Worktree wird automatisch aufgeraeumt

## Projekt-spezifische Hinweise

- **Session-basiert**: Die App dreht sich um Claude CLI Sessions mit PTY. Jede Session hat einen Ordner, ein Terminal, und Kontext-Tabs (CLAUDE.md, Skills, Hooks, GitHub).
- **Pipeline-View**: Isometrische 2.5D-Ansicht existiert als Sekundaer-View (`DashboardMap.tsx`). Laeuft nur im Mock-Modus, Real-Modus nicht implementiert.
- **Tauri v2**: API-Imports immer aus `@tauri-apps/api` (v2), nicht v1-Syntax.
- **Protokoll-Schema**: `src/protocols/schema.ts` definiert das ADP-Protokoll und wird von `pipelineStore.ts` aktiv importiert (`ADPError`). Nicht loeschen.

## Prozess-Dokumentation

- `Softwareprozess/Phase.txt` — Aktuelle Roadmap und Release-Status
- `Softwareprozess/lessons-learned.md` — Historische Lessons (bis 2026-03-16)
- `tasks/todo.md` — Sprint-Backlog
- `tasks/ideas.md` — Ideen-Sammlung
- `tasks/lessons.md` — Aktuelle Lessons Learned (ab 2026-03-25)
- `Softwareprozess/Anforderungsanalyse.md` — [ARCHIVED] Urspruengliche Anforderungen
- `Softwareprozess/Planung.md` — [ARCHIVED] Urspruenglicher Sprint-Plan
