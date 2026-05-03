# CLAUDE.md

## Project Overview

**AgenticExplorer** — Desktop-App zum Verwalten und Ueberwachen von Claude CLI Sessions. Multi-Session-Terminal mit Projekt-Kontext, Favoriten-System und Notizen. Gebaut mit Tauri v2 + React.

**Tech-Stack**: React 18 + TypeScript + Vite (Frontend), Tauri v2 + Rust (Backend), Zustand (State), Tailwind CSS + Framer Motion (Styling/Animation)

**Language**: UI und Doku auf Deutsch, Code auf Englisch

> **Feature-Freeze (ab v1.6.0):** Session Manager ist feature-complete. Nur Bugfixes. Neue Features → Pipeline-Engine (v2.0).

## Commands

```bash
npm run dev              # Vite Dev-Server (Port 5173)
npm run build            # TypeScript-Check + Vite Production Build
npx tsc --noEmit         # Type-Checking ohne Build
npm run tauri dev        # Tauri Desktop-App im Dev-Modus
npm run tauri build      # Kompletter Desktop-Build
npm run test             # Alle Tests (vitest run)
npm run test:coverage    # Tests mit Coverage-Report
npm run lint             # ESLint
```

## Architecture

**Frontend** (`src/`): React-Komponenten, Zustand-Stores. **Backend** (`src-tauri/`): Rust/Tauri, PTY-Sessions, GitHub via `gh` CLI.

**Datenfluss**: User → Session erstellen → Rust spawnt PTY → `session-output` Events → xterm.js Terminal

**Schluessel-Dateien**:
- `src/store/sessionStore.ts` — Session-Management (ephemer)
- `src/store/settingsStore.ts` — Persistierter State (Favorites, Notes, Theme)
- `src/store/uiStore.ts` — UI-State (Tabs, Toasts)
- `src/store/agentStore.ts` — Agent-Detection-State
- `src-tauri/src/session/` — Rust Session Manager (PTY, Commands)
- `src/components/sessions/SessionManagerView.tsx` — Haupt-View

## Arbeitsweise

- **Plan-First**: Bei 3+ Schritten oder Architektur-Entscheidungen → Plan Mode. Bei Problemen: STOP → re-planen.
- **Subagents liberal einsetzen**: Research und Exploration delegieren. Main Context sauber halten.
- **Verification vor Done**: Build gruen + Diff beweist Funktion. Massstab: Staff-Engineer-Level.
- **Autonomes Bug-Fixing**: Logs lesen, Fehler finden — ohne Rueckfragen.
- **Root Causes**: Keine temporaeren Fixes. Ursachen finden.
- **Kleine Commits**: Max 5-10 Dateien. Features in logische Schritte aufteilen.
- **Lessons Learned pflegen**: Nach jeder User-Korrektur oder Fehler → `tasks/lessons.md` updaten. Format: Fehler → Korrektur → Regel. Kurz, praezise, actionable. Bei Session-Start relevante Lessons pruefen.
- **Sprint-/Implementierungsplaene aktuell halten**: `tasks/todo.md` nach jeder erledigten Aufgabe updaten. Neue Erkenntnisse sofort in Plaene einarbeiten. Plaene muessen den aktuellen Stand widerspiegeln — keine veralteten TODOs stehen lassen.

## Task Management

- `tasks/todo.md` — Sprint-Backlog, Items abhaken sobald erledigt
- `tasks/ideas.md` — Ideen-Sammlung (kein Filter)
- `tasks/lessons.md` — Lessons Learned (Fehler, Korrekturen, Regeln)

## Development Workflow

- `npx tsc --noEmit` nach .ts/.tsx Aenderungen
- `npm run build` vor PRs
- `cd src-tauri && cargo check` fuer Rust-Aenderungen
- **Pre-Commit** (Husky + lint-staged): `tsc --noEmit` + `eslint` fuer TS, `cargo fmt --check` + `cargo check` fuer Rust
- **CI**: `npm run test:coverage` (Ratchet-Schwellen), `cargo test` + `cargo clippy`
- **Null-Safety**: `?.` und `??` bei Tauri-Events, Store-Zugriffen, User-Input
- **Signature Changes**: Grep nach allen Usages, ALLE Caller updaten
- **Nicht behaupten, verifizieren**: Build-Log/Screenshot als Beweis

## Rust Toolchain

- **Autoritativ**: `src-tauri/rust-toolchain.toml` pinnt die Rust-Version (aktuell `1.95.0`) + `rustfmt` + `clippy`. `rustup` installiert beim ersten `cargo`-Aufruf automatisch die richtige Version.
- **CI matcht lokal**: Alle Workflows (`ci.yml`, `release.yml`, `security-audit.yml`) pinnen dieselbe Version via `dtolnay/rust-toolchain@master` mit `toolchain: "1.95.0"`. Bump passiert an beiden Stellen gemeinsam.
- **Bei Clippy-Drift**: `rustup update` + `cargo clean` + `cargo clippy -- -D warnings` lokal laufen lassen, dann push.

## Quality Gates (vor "Done")

- [ ] 1 Happy-Path-Test + 1 Edge-Case-Test pro Feature
- [ ] Test-Datei im selben Commit wie Feature
- [ ] `npx tsc --noEmit && npm run build` erfolgreich
- [ ] Visuelle Pruefung bei UI-Aenderungen
- [ ] Tauri-Commands: Input validiert? Path Traversal? Shell-Injection? Timeout? Fehler strukturiert?

## Coding Conventions

- Conventional Commits: `feat(scope):`, `fix(scope):`, `chore(scope):` — Scopes: `ui`, `store`, `parser`, `tauri`, `config`
- React: Functional Components + Hooks
- State: Zustand — `sessionStore` (ephemer), `settingsStore` (persistiert), `uiStore` (UI)
- Styling: Tailwind bevorzugen, Custom CSS nur fuer Animationen in `index.css`
- Rust: Tauri Commands in `lib.rs` im `mod commands {}` Block
- Tauri v2: Imports aus `@tauri-apps/api` (v2-Syntax)

## Design System

Kanonische Regeln: `docs/design-system/README.md`. Skill-Hinweis: `docs/design-system/SKILL.md`. Preview-Karten: `docs/design-system/preview/*.html`.

Non-negotiable:
- Sharp corners (radius 0) ausser Kanban-Cards (2px) und Status-Dots (full-round).
- Ein Akzent (cyan-teal, hue 190) — keine weiteren einfuehren.
- Deutsche UI-Copy, englische Code-Identifier. Kein Emoji. Kein Unicode-as-Icon.
- Lucide-Icons only, 2px stroke, `currentColor`.
- Icon-Zuordnungen und Groessen aus `src/utils/icons.ts` verwenden (`ICONS.*` + `ICON_SIZE.{inline|card|nav|close}`). Direkte `lucide-react`-Imports in Komponenten vermeiden.
- Exponential Easing `cubic-bezier(0.16, 1, 0.3, 1)`, Durations 100/200/300/500ms, keine Springs/Bounce.
- Flache Surfaces — keine Gradients, Blur, Glassmorphism, Illustrations.
- Panel-Header: UPPERCASE, `tracking-widest` (>= 0.12em).
- Fokus-Ring: `outline: 2px solid var(--color-accent); outline-offset: 2px` auf `:focus-visible` — niemals `outline: none` ohne Ersatz.
- Motion-Tokens aus `src/utils/motion.ts` verwenden (`DURATION`, `EASE`) — kein Spring im Prod-Code.

Content-Regeln (UI-Strings):
- **Pronouns**: Kein `du`/`Sie`/`Ihre`/`Ihnen`. Nur Imperativ/Infinitiv. Beispiel: `Session schliessen` statt `Schliessen Sie die Session`, `Projektordner waehlen` statt `Waehlen Sie Ihren Ordner`.
- **Number-Formatting**: `ms` fuer Durations (`312 ms`), `mm:ss` fuer Elapsed (`2:14`), Exit-Codes verbatim (`Exit 0`, `Exit 1`).
- **Panel-Titel**: UPPERCASE + wide-tracking. Toast-Titel ebenso.

Semantic Type Classes (`.ae-*` in `src/index.css`):
- Optional, nicht verpflichtend. Nutzen, wenn ein Tailwind-String >= 4 Tokens wiederholt auftritt und die Klasse 1:1 den Stil trifft.
- `.ae-h1` — Display-Font, `text-xl`, bold, tight leading, `neutral-100`. Page-/Modal-Heading.
- `.ae-h2` — Display-Font, `1.25rem`, bold, uppercase, `accent`-farbig. Hero/Section-Heading mit Akzent.
- `.ae-h3` — Display-Font, `text-sm`, bold, uppercase, tracking `0.12em`, `neutral-300`. Panel-Heading (strict variant).
- `.ae-body` — Body-Font, `text-sm`, normales Leading, `neutral-200`. Default-Fliesstext.
- `.ae-body-sm` — Body-Font, `text-xs`, `neutral-400`. Sekundaer-Text, Meta, Timestamps.
- `.ae-label` — Body-Font, `text-xs`, Letter-Spacing `0.04em`, `neutral-400`. Form-Labels, Separator-Titel.
- `.ae-mono` — Mono-Font, `text-xs`, `neutral-300`. Inline Pfade/IDs.
- `.ae-code` — Mono-Font, `0.875em`, Success-Farbe auf `neutral-800`. Inline-Code.
- Quelle/Preview: `docs/design-system/colors_and_type.css`.

Interaction-Patterns (Desktop, kein Touch!):
- **Hover**: Text brightens one step (`text-neutral-400 → text-neutral-200`), Background bekommt `hover:bg-hover-overlay`, Border lightens (`border-neutral-700 → border-neutral-500`).
- **Press**: KEIN `scale-*` transform. Dies ist ein Desktop-Tool.
- **Disabled**: IMMER `disabled:opacity-40` + `disabled:cursor-not-allowed` zusammen setzen.
- **Card-Action-Chrome**: `opacity-0 group-hover:opacity-100` (Aktionen nur bei Card-Hover sichtbar).
- **Modal-Backdrop**: `bg-black/70` ohne `backdrop-blur-*`.
- **Active/Selected**: `border-left: 2px solid` in semantischer Farbe + getoenter Background (`bg-accent-a10` / `bg-success-a05`).

Panel-Header-Paddings (2 Varianten):
- **`main`** = `px-4 py-3` — Top-Level-Views, Modal-Header, Config-Panel-Header (ClaudeMd, Settings, Hooks, GitHub, Worktree, Pin, Library, Kanban, Pipeline).
- **`compact`** = `px-3 py-2` — Sub-Panels, Toolbars, Filter-Leisten, Fold-Header, Sekundaer-Rows (Kanban-Spalten, Agents/Skills/Library-Viewer-Sub, Session-Fold, Favorites-Fold, Log-Toolbar, Editor-Toolbar, Pipeline-History/Status/Task-Summary).
- Inline-Klassen direkt in JSX setzen — keine generische `<Panel>`-Komponente; Panel-Header werden kontextsensitiv als Inline-`<div>` gebaut.

Bei neuen Komponenten: gegen Preview-HTMLs in `docs/design-system/preview/` abgleichen.

## Kommunikation

- Code/Config/Skill LESEN bevor Aussagen machen. Belege mit Dateien und Zeilennummern.
- Unsicherheit kennzeichnen (~70% sicher etc.)
- Skills: SKILL.md komplett lesen, Phase fuer Phase ausfuehren, STOPP-Punkte einhalten.

## Prozess-Dokumentation

- `Softwareprozess/arc42-specification.md` — Master-Spec (Architektur, Roadmap)
- `CHANGELOG.md` — Release-Historie
- `tasks/docs-inventory.md` — Inventar aller Dokumente (bei Orientierungsverlust hier starten)
- Sprint-Plan-Dokumente nach Abschluss → `Softwareprozess/history/`. Zeitlose Regeln VORHER nach CLAUDE.md oder arc42 migrieren.
