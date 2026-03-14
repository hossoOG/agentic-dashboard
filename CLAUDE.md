# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agentic Dashboard** — Desktop-App zur Echtzeit-Visualisierung einer agentenbasierten Pipeline. Zeigt aktive Agents, Ausführungsschritte, QA-Gate-Status in einer gamifizierten isometrischen 2.5D-Oberfläche. Integriert Anthropic's Claude CLI (`claude m`) mit einem visuellen Monitoring-Dashboard.

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

> **Hinweis**: Kein Linter, Formatter oder Test-Framework konfiguriert. Bei Bedarf einrichten.

## Architecture

**Frontend** (`src/`): React-Komponenten mit isometrischer 3D-Darstellung. Zustand-Store für Pipeline-State. Regex-basierter Log-Parser für Event-Demultiplexing.

**Backend** (`src-tauri/`): Rust/Tauri spawnt `claude m` als Child-Process, streamt stdout/stderr als `pipeline-log` Events an das Frontend.

**Datenfluss**: Claude CLI → Rust (Event-Emitter) → React Listener (`App.tsx`) → Log-Parser → Zustand-Store → UI-Komponenten

**Schlüssel-Dateien**:
- `src/store/pipelineStore.ts` — Zustand Store (Orchestrator, Worktrees, QA-Gate)
- `src/store/logParser.ts` — Regex-basierter Log-Demultiplexer
- `src/store/mockPipeline.ts` — Mock-Daten für Entwicklung (aktuell Standard)
- `src-tauri/src/lib.rs` — Tauri Commands (start/stop pipeline, folder picker)
- `src/components/DashboardMap.tsx` — Isometrische Hauptansicht

**Tailwind Custom Colors**: `neon-green` (#00ff88), `neon-blue` (#00d4ff), `neon-purple` (#b300ff), `neon-orange` (#ff6b00), `dark-bg/card/border`

## Arbeitsweise

- **Plan-First**: Bei nicht-trivialen Tasks (3+ Schritte oder Architektur-Entscheidungen) → Plan Mode. Bei Problemen: STOP → sofort re-planen, nicht weiterpushen.
- **Subagents liberal einsetzen**: Research, Exploration und parallele Analyse an Subagents delegieren. Ein Task pro Subagent. Main Context Window sauber halten.
- **Verification vor Done**: Task erst abgeschlossen wenn bewiesen funktioniert — Tests laufen, Logs geprüft, Diff demonstriert. Maßstab: "Würde ein Staff Engineer das absegnen?"
- **Eleganz (balanciert)**: Bei nicht-trivialen Änderungen hinterfragen: "Gibt es einen eleganteren Weg?" Aber bei einfachen Fixes nicht over-engineeren.
- **Autonomes Bug-Fixing**: Bug-Reports selbstständig lösen. Logs lesen, Fehler finden, Tests fixen — ohne Rückfragen. Zero Context-Switching für den User.
- **Root Causes**: Keine temporären Fixes. Ursachen finden. Senior-Developer-Standard.

## Task Management

- **Planen**: Tasks in `tasks/todo.md` mit checkbaren Items erfassen
- **Tracken**: Items abhaken sobald erledigt, nicht batchen
- **Lernen**: Nach jeder User-Korrektur → `tasks/lessons.md` updaten (Fehler, Korrektur, Regel)
- **Lessons reviewen**: Bei Session-Start `tasks/lessons.md` auf relevante Patterns prüfen

## Kommunikationsregeln

- **Keine unverifizierten Behauptungen:** Lies immer zuerst den Code/Config/Skill, BEVOR du Aussagen machst. Belege mit Dateien und Zeilennummern.
- **Unsicherheit kennzeichnen:** Grobe Zuversicht angeben (z.B. "~70% sicher"), Vermutungen klar markieren.
- **Keine Annahmen über Skills/Configs:** Nie behaupten was ein Skill tut, ohne ihn gelesen zu haben.

## Development Workflow Rules

- Run `npx tsc --noEmit` after modifying .ts/.tsx files
- Run `npm run build` to verify the full build pipeline
- Tauri-Backend testen: `cd src-tauri && cargo check`

## Testing Requirements

- **Build-Verifizierung vor "Done"**: `npx tsc --noEmit && npm run build` müssen grün sein.
- **Visuelles Testen**: Dashboard im Dev-Modus (`npm run tauri dev`) prüfen — Mock-Pipeline startet automatisch.
- **Rust-Änderungen**: `cargo check` im `src-tauri/` Verzeichnis ausführen.

## Workflow Compliance

- **Skill-Pipeline ist ein Vertrag**: Bei `/implement`, `/feature`, `/bugfix` etc. IMMER zuerst die SKILL.md komplett lesen, dann Phase für Phase ausführen. Keine Phase überspringen, nicht "zusammenfassen".
- **STOPP-Punkte einhalten**: Wenn eine Phase "STOPP" sagt → STOPP. Nicht "zur Effizienz" weiter machen.
- **Sub-Agents nutzen wenn vorgeschrieben**: Wenn eine Phase einen Sub-Agent vorschreibt, diesen Agent starten — nicht die Aufgabe selbst übernehmen.

## Code Quality Gates

- **Null-Safety**: Optional chaining (`?.`) und nullish coalescing (`??`) bei Tauri-Events, Store-Zugriffen und User-Input.
- **Signature Changes → Alle Caller updaten**: Nach Änderung einer Funktion/Action-Signatur: Grep nach allen Usages im gesamten Codebase, ALLE updaten. Kein Commit mit broken Callers.
- **Nicht behaupten, verifizieren**: "Funktioniert" erst sagen wenn der Beweis vorliegt (Build-Log, Screenshot). Keine Annahmen über Dev-Server oder Konfiguration.
- **Pre-PR Pflicht**: Vor `gh pr create` MÜSSEN fehlerfrei sein: 1) `npx tsc --noEmit` 2) `npm run build`. Bei Failure → zuerst fixen.

## Coding Conventions

- Conventional Commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- **Scopes**: `ui`, `store`, `parser`, `tauri`, `config`
- **React**: Functional Components, Hooks, kein class-based
- **State**: Zustand — neue State-Slices in `pipelineStore.ts`, keine lokalen useState für shared state
- **Styling**: Tailwind Utility Classes bevorzugen, Custom CSS nur für Animationen/3D-Transforms in `index.css`
- **Rust**: Tauri Commands in `lib.rs` im `mod commands {}` Block (wegen rustc 1.94 E0255 Workaround)

## Parallele Entwicklung

- `.claude/worktrees/` ist in .gitignore — jeder Worktree bekommt eigenen Branch + Arbeitskopie
- Nach Fertigstellung: PR reviewen, Worktree wird automatisch aufgeräumt

## Projekt-spezifische Hinweise

- **Mock vs. Real Mode**: Aktuell läuft das Dashboard im Mock-Modus (`mockPipeline.ts`). Für echten Betrieb muss der START-Button in `Header.tsx` den Tauri-Command `start_pipeline` aufrufen.
- **Log-Parser Regex**: Patterns in `logParser.ts` müssen gegen echte Claude CLI-Ausgabe validiert werden.
- **Worktree-ID**: Kommt immer als `null` vom Rust-Backend — Demultiplexing passiert komplett im JS Log-Parser via Kontext-Tracking.
- **Tauri v2**: API-Imports immer aus `@tauri-apps/api` (v2), nicht v1-Syntax.
