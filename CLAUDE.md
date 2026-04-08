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
npm run test             # Alle Tests ausfuehren (vitest run)
npm run test:watch       # Tests im Watch-Modus (vitest)
npm run test:coverage    # Tests mit Coverage-Report (vitest run --coverage)
npm run lint             # ESLint ausfuehren
npm run format:check     # Prettier Format pruefen
```

> **Tooling**: ESLint 9 + Prettier 3 + Vitest 2.1.9 konfiguriert. ESLint laeuft in CI (GitHub Actions), nicht im Build. Pre-Commit Hooks via Husky + lint-staged.

## Architecture

**Frontend** (`src/`): React-Komponenten. Session Manager als Hauptansicht. Zustand-Stores fuer State-Management. Pipeline-View (isometrisch) als Sekundaeransicht.

**Backend** (`src-tauri/`): Rust/Tauri verwaltet PTY-Sessions (Claude CLI), liest Projektdateien, ruft GitHub-Daten via `gh` CLI ab.

**Datenfluss Sessions**: User → Session erstellen → Rust spawnt PTY → `session-output` Events → xterm.js Terminal

**Schluessel-Dateien**:
- `src/store/sessionStore.ts` — Session-Management (ephemerer State)
- `src/store/settingsStore.ts` — Persistierter State (Favorites, Notes, Theme)
- `src/store/uiStore.ts` — UI-State (Tabs, Toasts)
- `src/store/agentStore.ts` — Agent-Detection-State (erkannte Agents, Tasks, Worktrees)
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

## Testing & Quality Gates

Vier Gates sichern Qualitaet. Gates 1-2 sind automatisiert/blockierend. Gates 3-4 sind Pflicht-Checklisten vor "Done".

### Gate 1: Pre-Commit (automatisch, blockierend)

- **Husky + lint-staged**: Bei jedem Commit laufen automatisch:
  - `.ts`/`.tsx` Dateien: `tsc --noEmit` + `eslint --max-warnings=0`
  - `.rs` Dateien: `cargo fmt --check` + `cargo check --quiet`
- Konfiguration in `package.json` (`lint-staged`) und `.husky/pre-commit`
- **Regel: CI/Local-Paritaet** — jede Pruefung die in CI laeuft, MUSS auch lokal im Hook laufen

### Gate 2: CI (automatisch, blockierend)

- `npm run test:coverage` — Coverage-Schwellen aus `vitest.config.ts` werden erzwungen (Ratchet-Prinzip: Schwellen duerfen nicht sinken)
- Rust: `cargo test` + `cargo clippy` + `cargo fmt --check`
- CI-Workflows: `.github/workflows/ci.yml` + `release.yml`

### Gate 3: Feature-Checkliste (vor "Done")

- [ ] Mindestens **1 Happy-Path-Test** + **1 Error-/Edge-Case-Test** pro Feature
- [ ] Test-Datei im **selben Commit** wie Feature (kein "testen spaeter")
- [ ] Alle bestehenden Tests gruen (`npm run test` + `cargo test`)
- [ ] `npx tsc --noEmit && npm run build` erfolgreich
- [ ] Visuelle Pruefung im Dev-Modus (`npm run tauri dev`) bei UI-Aenderungen
- **Tests nach Risiko priorisieren**: Persistenz-Verlust > Security > UI-Regression > Store-Logik. Teuerste Failures zuerst.

### Gate 4: Tauri-Command Security (5-Fragen-Checkliste)

Pflicht-Review fuer jeden neuen Tauri-Command:
- [ ] Input validiert?
- [ ] Path Traversal geprueft?
- [ ] Shell-Injection moeglich?
- [ ] Timeout vorhanden?
- [ ] Fehler strukturiert?

### Testing-Konventionen

- **Framework**: Vitest 2.1.9 + jsdom + @testing-library/react (Frontend), `#[cfg(test)]` (Rust)
- **Test-Dateien**: neben Source-Datei (`foo.ts` → `foo.test.ts`), Setup in `src/test/setup.ts`
- **Live-Status**: aktuelle Testzahl und Coverage via `npm run test` bzw. `npm run test:coverage` — **keine fixen Zahlen in dieser Datei** (driften sonst)
- **Coverage-Schwellen**: in `vitest.config.ts` (Ratchet — werden schrittweise erhoeht)
- **Archiv-Referenz**: historischer QA-Plan mit Test-Patterns und Pipeline-Rewrite-Kontext: `Softwareprozess/history/testing-spec-v1.3.1.md`

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
- **Protokoll-Schema**: `src/protocols/schema.ts` definiert das ADP-Protokoll und wird von `adpError.ts` aktiv importiert (`ADPError`). Nicht loeschen.

## Agent-Pipeline Skills

| Skill | Beschreibung | Phasen |
|-------|-------------|--------|
| `/implement` | Issue → PR Workflow | Lessons → Analyse → Implement → Test → QA → Review → PR |
| `/parallel-implement` | 2-3 Issues gleichzeitig in Worktrees | Pre-Flight → Worktree-Setup → N Subagents parallel → Summary-Report |
| `/bugfix` | Bug Investigation + Fix | Lessons → Investigate → Regression-Test → Fix → QA → PR |
| `/review` | Code Review | Lessons → Changes → Security → Quality → Conventions → Coverage |
| `/sprint-review` | Sprint-Review PPTX generieren | Sprint ID → Daten sammeln → Aufbereiten → STOPP → PPTX generieren |
| `/release` | Release-Pipeline mit allen Gates | Lessons → Pre-Flight → Quality Gates → Version-Bump → CHANGELOG → Archiv-Check → STOPP → Tag+Push → GitHub Release |
| `/frontend-review` | Visueller Frontend-Review mit Playwright MCP | App starten → Screenshots → 5 Experten parallel (UX/Design/A11y/Perf/Copy) → Diskussion → Fazit + Issues |
| `/requirements-workshop` | Requirements Engineering + Sprint-Planung | Kontext → 3 Spezialisten parallel → Synthese → STOPP (User) → Docs aktualisieren → Issues erstellen. Zwei Modi: `sprint` (Retro + Plan) und `[feature]` (Feature-Workshop) |

### Agents

| Agent | Modell | Rolle |
|-------|--------|-------|
| architect | Opus | Issue-Analyse, Implementierungsplan (READ-ONLY) |
| test-engineer | Sonnet | Tests schreiben nach Projekt-Patterns |
| security-reviewer | Opus | Tauri 5-Fragen-Checkliste + Frontend Security (READ-ONLY) |
| code-quality | Sonnet | DRY, Performance, Null-Safety (READ-ONLY) |
| git-workflow | Sonnet | Commits, PRs nach Conventions |

### Hooks

| Event | Hook | Beschreibung |
|-------|------|-------------|
| PreToolUse (Bash) | `safe-guard.mjs` | Blockiert gefaehrliche Commands (rm -rf, force-push, publish) |
| PostToolUse (Edit/Write) | tsc --noEmit | TypeScript-Check nach jeder Dateiaenderung |

## Prozess-Dokumentation

### Aktive Prozess-Dokumente (Single Source of Truth je Thema)

- `Softwareprozess/arc42-specification.md` — **Master-Spec**: Architektur, Roadmap, User Stories. Wird nach jedem Sprint-Review erweitert.
- `CHANGELOG.md` — Release-Historie (Keep-a-Changelog-Format)
- `tasks/todo.md` — Operativer Sprint-Backlog (aktueller Sprint + Abgeschlossen-Historie)
- `tasks/docs-inventory.md` — Inventar aller aktiven Projekt-Dokumente (bei Orientierungsverlust zuerst hier schauen)
- `tasks/lessons.md` — Aktuelle Lessons Learned (ab 2026-03-25)
- `tasks/ideas.md` — Ideen-Sammlung (roh, kein Filter)
- `tasks/user-stories-pipeline.md` — User Stories US-P1 bis US-P5 (Pipeline-Feature)
- `tasks/sprint-plan-v1.5-v2.0.md` — Forecast fuer v1.5 bis v2.0 (wird nach v2.0-Sprint archiviert)
- `Softwareprozess/Protokoll-Design.md` — ADP-Protokoll-Details

### Archiviert (historische Artefakte)

- `Softwareprozess/history/Phase.txt` — alte Roadmap + 7-Phasen-Modell (ersetzt durch arc42, 2026-04-05)
- `Softwareprozess/history/testing-spec-v1.3.1.md` — QA-Sprint-Plan v1.3.1 (abgeschlossen)
- `Softwareprozess/history/lessons-learned.md` — Historische Lessons bis 2026-03-16 (Inhalt in `tasks/lessons.md` migriert)
- `Softwareprozess/Anforderungsanalyse.md` — [ARCHIVED] Urspruengliche Anforderungen
- `Softwareprozess/Planung.md` — [ARCHIVED] Urspruenglicher Sprint-Plan

### Archivierungs-Regel

> Sprint-Plan-Dokumente (`sprint-plan-vX.md`, `testing-spec.md`, Sprint-Retros etc.) sind **Artefakte**. Nach Sprint-Abschluss wandern sie in `Softwareprozess/history/`. **Zeitlose Regeln/Patterns werden VORHER** nach CLAUDE.md oder arc42 migriert — sie duerfen nicht im Archiv versanden.
