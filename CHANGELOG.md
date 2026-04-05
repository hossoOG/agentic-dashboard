# Changelog

Alle relevanten Änderungen an AgenticExplorer werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).





## [1.4.1] — 2026-04-04

### Features
- In-App Markdown-Editor mit CodeMirror (#68) — CLAUDE.md, Skills, Hooks direkt im Dashboard bearbeiten
- Zentrales Input-Validierungs-Modul fuer konsistente Security

### Security
- Path-Traversal-Protection gehaertet (safe_resolve auch fuer nicht-existente Pfade) + Tests
- DOMPurify-Config gehaertet (ALLOWED_ATTR/FORBID_ATTR explizit) + XSS-Prevention-Tests

### Refactoring
- `rawLogs` aus `logParser` und `pipelineStore` entfernt (#85)
- DashboardMap Legacy-Code + dead components entfernt

### Docs
- arc42 v2.1 Spezifikation hinzugefuegt
- Sprint-Plan v1.5–v2.0 dokumentiert
- Sprint-Review-Skill (`/sprint-review`) dokumentiert

## [1.4.0] — 2026-04-03

### Features
- Agent-Detection-Rewrite: Claude-Code-spezifische Regex-Patterns (Unicode ●■□✓✗), Hierarchie-Tracking, Token-Erfassung (36 Rust-Tests)
- Task-Tree-Visualisierung (`TaskTreeView` + `TaskTreeNode`) ersetzt DashboardMap in der Pipeline-View
- AgentMetricsPanel erweitert (Token-Card), AgentBottomPanel mit Hierarchie-Darstellung
- Neue Events: `agent-status-update`, `task-summary`

### Coverage & QA
- Coverage-Schwellen hochgezogen (24/32/58/24)
- Pure-Function-Tests (pathUtils, parseSkillFrontmatter, statusConfig, activityLevel)
- Store-Tests: errorLogger, agentStore, sessionHistoryStore, libraryStore, workflowStore
- perfLogger mit 24 Instrumentierungs-Punkten

## [1.3.0] — 2026-04-01

### Features
- Kanban-Board-Integration (GitHub Projects) — im Dashboard und pro Session (#17, #24)
- Split-View: Terminal + Kontext-Panel (#28), Config-Tabs neben Terminal (#42)
- Library als eigener SideNav-Tab (#11)
- Pipeline-View mit echten Daten: Agenten + Worktrees aus `agentStore` (#12)
- Workflow-Erkennung aus Projekt-Konfiguration (#13)
- Session-History pro Projekt (#29)

### Bug Fixes
- Log-Anzeige: Zeiten korrigiert (#40), Backend-Log-Errors behoben (#41)
- Log-Ansicht als eigenes Fenster (#26)
- Settings-Persistenz: Datenverlust bei App-Start/Update verhindert (#23) — Backup-Rotation, Atomic Write, Schema-Version

### Security (v1.3.1-Milestone, in v1.3.0 Release gebundelt)
- Shell-Injection in Session-Resume validiert (#55)
- CSP-Policy gehaertet — `unsafe-eval` entfernt (#56)
- Subprocess-Timeouts fuer gh/git/claude Commands (#64)
- Pre-Commit-Hooks via Husky + lint-staged (#61, #70)
- CI Coverage Gate aktiviert (#71)

## [1.2.5] — 2026-03-28

### Features
- Library: Config-Erkennung aus Favoriten-Projekten + globale Settings (#35)
- Worktree-Übersicht als neuer Config-Tab (#22)
- Pipeline-View mit Adapter, Workflow-Erkennung und Metriken (#12, #13)
- Library als eigener SideNav-Tab (#11)
- Auto-Update Notification verbessert

### Fixes
- Session-Liste Scroll-Bug behoben — min-h-0 auf Flex-Container (#25)

### Verbesserungen
- Rebranding auf AgenticExplorer abgeschlossen (#27)
- Pipeline-View: Empty State und Idle-Anzeige poliert (#12)
- README.md hinzugefügt
- CI-Pipeline verschlankt (ESLint/Prettier/cargo check/build-check entfernt)
- Rust-Formatierung vereinheitlicht (cargo fmt)

## [1.2.4] — 2026-03-27

### Fixes
- standardize error handling in session manager (#8)

### Sonstiges
- Merge branch 'master' of https://github.com/hossoOG/agentic-dashboard
- perf(tauri): compile agent detector regex patterns once via OnceLock (#10)
- perf(store): use useShallow for agent/worktree selector stability (#7)
- perf(ui): lazy-load config viewers and stabilize tab change handler (#5)
- Merge branch 'master' of https://github.com/hossoOG/agentic-dashboard
- chore(config): remove unused tauri-plugin-notification dependency (#9)
- perf(ui): shared timer hook + SessionCard memoization (#6)
- perf(config): add Vite manual chunks to split vendor bundles (#4)

## [1.2.3] — 2026-03-27

### Features
- persist notes and favorites as separate files in Documents/AgenticExplorer/
- persist settings via Tauri to Documents/AgenticExplorer/
- versioned deploy with running-app check
- add Log Viewer as dedicated SideNav tab
- add agent detection, library system, and enhanced content tabs
- allow browsing project notes without active session
- add theming system, changelog dialog, notes panel, and UI polish

### Sonstiges
- chore(config): rename app to AgenticExplorer
- chore(config): migrate sprint backlog to GitHub Projects
- chore(config): add version bump script to deploy pipeline
- chore(config): consolidation sprint — remove dead code, update process docs

## [1.2.2] — 2026-03-27

### Features
- versioned deploy with running-app check
- add Log Viewer as dedicated SideNav tab
- add agent detection, library system, and enhanced content tabs
- allow browsing project notes without active session
- add theming system, changelog dialog, notes panel, and UI polish

### Sonstiges
- chore(config): rename app to AgenticExplorer
- chore(config): migrate sprint backlog to GitHub Projects
- chore(config): add version bump script to deploy pipeline
- chore(config): consolidation sprint — remove dead code, update process docs

## [1.2.1] — 2026-03-27

### Features
- versioned deploy with running-app check
- add Log Viewer as dedicated SideNav tab
- add agent detection, library system, and enhanced content tabs
- allow browsing project notes without active session
- add theming system, changelog dialog, notes panel, and UI polish

### Sonstiges
- chore(config): rename app to AgenticExplorer
- chore(config): migrate sprint backlog to GitHub Projects
- chore(config): add version bump script to deploy pipeline
- chore(config): consolidation sprint — remove dead code, update process docs

## [1.2.0] — 2026-03-17

GitHub-Integration: Git- und GitHub-Status direkt im Session-View.

### Features
- **GitHub Tab**: Neuer Content-Tab mit Branch, letztem Commit, PRs und Issues
- **Git Info**: Aktueller Branch + letzter Commit pro Projekt (US-G3)
- **Pull Requests**: Offene PRs mit Titel, Autor, Review-Status und Link (US-G1)
- **Issues**: Offene Issues mit Labels, Assignee und Link (US-G2)
- **Fehlerbehandlung**: Graceful Fallback wenn gh CLI nicht installiert oder kein Git-Repo

### Backend
- Neue Tauri-Commands: `get_git_info`, `get_github_prs`, `get_github_issues`
- Nutzt `git` CLI fuer lokale Daten, `gh` CLI fuer GitHub API

## [1.1.0] — 2026-03-17

Agenten-Transparenz: Projekt-Konfiguration direkt im Session-View einsehen.

### Features
- **Content-Tabs**: Tab-Leiste ueber dem Terminal (Terminal / CLAUDE.md / Skills / Hooks)
- **CLAUDE.md Viewer**: Projekt-CLAUDE.md direkt im Dashboard lesen (US-A1)
- **Skills Viewer**: .claude/skills/*.md auflisten und Inhalt anzeigen (US-A2)
- **Hooks Viewer**: .claude/settings.json Hooks strukturiert oder als Raw JSON (US-A3)
- **Activity Indicator**: Session-Dots zeigen aktiv (gruen) vs. denkend (blau) Status
- **Header Redesign**: Session-Kontext + globale Notizen statt Pipeline-Controls
- **Dynamische Version**: Versionsnummer aus package.json statt hardcoded

### Backend
- Neue Tauri-Commands: `read_project_file`, `list_project_dir` mit Path-Traversal-Schutz

## [1.0.0] — 2026-03-17

Erste stable Release. Claude Session Manager ist produktiv im Einsatz.

### Features
- **Claude Session Manager**: Mehrere Claude CLI Sessions in einem Fenster verwalten
- **Session-Tabs**: Sessions erstellen, umbenennen, wechseln und schließen
- **Folder Actions**: Projektordner auswählen und zuweisen
- **Isometrische Dashboard-Map**: 2.5D-Visualisierung der Pipeline
- **Grid Highlight**: Visuelle Hervorhebung aktiver Grid-Elemente
- **Tauri v2 Desktop-App**: Native Windows-App mit NSIS-Installer
- **Pipeline Mock-Modus**: Simulierte Pipeline für Entwicklung und Demo
- **Log-Parser**: Regex-basierter Demultiplexer für Claude CLI Output
- **Zustand State Management**: Zentraler Store für Pipeline-State
