# Changelog

Alle relevanten Änderungen an AgenticExplorer werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [1.6.2] — 2026-04-09 — "Session-Restore & Library-Fix"

> Sessions werden beim App-Start automatisch wiederhergestellt. Library-View
> zeigt jetzt globale Inhalte korrekt an. Pipeline-View und Agent-Events
> entfernt (nicht production-ready). Session-Rename per Doppelklick.

### Features
- **Session-Restore**: Offene Sessions werden beim Schliessen persistiert und beim naechsten Start automatisch wiederhergestellt (Folder, Shell, Layout-Modus)
- **Session-Rename**: Doppelklick auf Session-Titel oeffnet Inline-Edit (Enter/Escape/Blur)
- **Library: Globale CLAUDE.md**: ~/.claude/CLAUDE.md wird jetzt im Global-Scope angezeigt
- **Library: Skills-Verzeichnis**: ~/.claude/skills/ wird neben commands/ gescannt
- **Library: Agent-Descriptions**: ~/.claude/agents/*.md Frontmatter wird geparst und angezeigt

### Fixes
- **Library Skill-Content**: Skills aus ~/.claude/skills/ zeigten "Kein Inhalt" (Loader nutzte falschen Pfad)
- **NotesPanel Position**: Sidebar-Variante oeffnet jetzt nach oben statt nach unten
- **UpdateNotification**: Als Fixed-Toast unten links statt inline im SideNav

### Refactoring
- Pipeline-Tab aus SideNav entfernt
- AgentBottomPanel aus SessionManagerView entfernt
- Agent/Pipeline Event-Listener aus useSessionEvents entfernt (nicht production-ready)
- SideNav-Dialoge aus nav-Element extrahiert (Layout-Verbesserung)

### Docs & Housekeeping
- CLAUDE.md konsolidiert und gestrafft (~95 Zeilen)
- Lessons Learned: Library-View Regression dokumentiert (hardcodierte Pfade, unvollstaendige Discovery)

### Lessons Learned (tasks/lessons.md)
- Pre-loaded Content aus Model verwenden — nicht von hardcodiertem Pfad re-fetchen
- Discovery-Erweiterungen muessen alle ScopeConfig-Felder abdecken


## [1.6.1] — 2026-04-08 — "Pipeline-Entkopplung"

> Pipeline-Engine vom Session-System entkoppelt. Pipeline-View funktioniert jetzt
> ohne aktive Session — Folder-Picker mit Favoriten-Fallback. Agent-Cleanup bei
> Session-Ende und Stale-Agent-Timeout hinzugefügt.

### Features
- **Pipeline Folder-Picker**: Pipeline-View zeigt Dropdown mit aktiver Session + Favoriten — kein Session-Zwang mehr
- **Agent-Cleanup bei Session-Exit**: Running-Agents werden bei Session-Ende automatisch als "completed" markiert
- **Stale-Agent-Timeout**: Agents die >5 Min. ohne Update im "running"-Status stecken werden automatisch abgeschlossen

### Refactoring
- WorkflowLauncher akzeptiert `folder` als Prop statt `activeSession` direkt zu lesen
- PipelineControls nutzt den aufgelösten Folder statt `activeSession.folder`
- Header-Komponente entfernt — Funktionalität in SideNav integriert
- NotesPanel UI-Verbesserungen

### Testing
- Neue Tests: Folder-Picker mit Favoriten, Session-Exit Agent-Cleanup
- Alle 950 Tests grün, tsc + Build fehlerfrei


## [1.6.0] — 2026-04-07 — "Tech-Debt & QA-Härtung"

> Sprint-Ziel: Test-Coverage von Baseline auf 83% heben, DevOps-Infrastruktur härten,
> God-Components entschlacken, UI-Polish aus 5-Experten-Frontend-Review umsetzen.

### Features
- **Library-Ansicht komplett neu**: Übersicht aller Skills, Agents, Hooks und Configs — global + pro Projekt (#110, #111)
- **Error-Grouping + Virtualisierung** in der Log-Ansicht mit React.memo (#136, #144)
- **Favoriten-Klick öffnet Config-Preview** auch bei aktiver Session (#149)

### Fixes
- Session-Status-Farben korrigiert — Idle von Done unterscheidbar (#100, #106)
- Terminal-Scrolling stabilisiert (#101, #107)
- Log-Ansicht: Zeitstempel-Sprünge, Updater-Spam, Exit-Code-Flut behoben (#104, #108, #118, #119)
- Hooks-Reiter zeigt jetzt Hook-Name und Command (#114, #120)
- Library zeigt Favoriten-Projekte (#117, #121)
- Agents aus `.claude/agents/` im Config-Panel sichtbar (#115, #124)
- Projektspezifische Claude-Settings einsehbar (#116, #123)
- Skill-Body in Library korrekt angezeigt statt "Kein Inhalt" (#149)
- Waiting-Detection-Patterns verbessert (#146, #149)
- Echte Umlaute in allen UI-Strings (#132, #145)
- SideNav Labels + Sprachmix bereinigt + Settings ausgeblendet (#133, #137, #138, #141)
- Filled CTA-Buttons für primäre Aktionen (#139, #142)

### Accessibility
- Light-Mode Kontrast auf WCAG AA 4.5:1+ (#135, #140)
- Toast `aria-live` + `aria-hidden` auf dekorativen Icons (#134, #143)

### Performance
- `@codemirror/language-data` auf ~20 Sprachen reduziert — −669 KB (−25%) (#113, #122)

### Refactoring
- SessionManagerView God-Component in Custom Hooks zerlegt (#62, #98)
- Alle Tauri-Commands auf strukturierten ADPError migriert (#63, #99)
- Component-Library formalisiert — Button, Modal, Input (#65, #105)
- Hooks-Reiter und Konfig-Panel überarbeitet (#102, #109)
- Pipeline-Funktionalität evaluiert und bereinigt (#103, #112)

### Testing & QA
- **Test-Coverage von 47% auf 83%** — 241 neue Tests in 39 Dateien (#66, #90, #125–#131)
- Coverage-Schwellen auf 75/75/65/75 hochgezogen (Ratchet-Prinzip)
- 17 Rust Integration Tests für Tauri-Commands (#97)
- Component-Tests: SessionCard, SideNav, Toast, ErrorBoundary, Editor (#95, #96)
- editorStore Tests auf 26 Cases erweitert (#89, #94)

### DevOps
- Wöchentlicher Dependency Audit in CI: `npm audit` + `cargo audit` (#92)
- Release-Workflow in arc42 Kap. 10.3 dokumentiert (#93)


## [1.5.1] — 2026-04-05 — Kompass Aufraeum-Patch

> Nachtrag zu v1.5.0: Follow-ups vom MD-Pinning, Dead-Code entfernt,
> GitHub-Milestones aufgeraeumt.

### Features
- **Pin umbenennen**: Doppelklick auf Pin-Label → Inline-Edit. Enter/Blur
  speichert, Escape bricht ab. Auto-focus beim Edit-Start.
- **Unsaved-Changes-Warnung**: Beim Tab-Wechsel mit ungespeicherten
  Aenderungen im Pin-Editor erscheint ein Bestaetigungsdialog.
- **Release-Skill `/release`**: 9-Phasen-Pipeline (Pre-Flight → Quality
  Gates → Version-Bump → CHANGELOG → Archiv-Check → STOPP → Tag + Push →
  GitHub Release → Post-Release). Codifiziert die Lessons aus v1.5.0.

### Cleanup
- Orphan `ContentTabs.tsx` entfernt (123 Zeilen Dead Code, Relikt aus
  alter Tab-Architektur vor Split-View).

### DevOps / Housekeeping
- GitHub-Milestones aufgeraeumt:
  - v1.5.0 geschlossen (Issues #68 + #85 als erledigt markiert)
  - 11 Tech-Debt/QA-Issues verschoben zu neuem Milestone v1.6.0
  - Neue Milestones: v1.5.1 (dieser Patch) und v1.6.0 (Tech-Debt-Sprint)
- Behebt den Drift zwischen GitHub-Milestones und tatsaechlichen
  Releases.

## [1.5.0] — 2026-04-05 — "Kompass"

> Sprint-Ziel: Orientierung im Projekt wiederherstellen (Doku-Drift beheben)
> + beliebige Markdown-Dateien pro Projekt schnell erreichbar machen.

### Features
- **MD-Pinning im Config-Panel**: Beliebige .md-Dateien aus dem Projekt
  als Tabs anpinnen, inline bearbeiten (CodeMirror + Preview), mit
  Persistenz pro Projekt. "+"-Button oeffnet OS-File-Picker, "x"-Button
  entfernt Pin (on-hover). Zweistufig gegen Path-Traversal abgesichert
  (Store-Ebene + Rust-Command-Ebene).
- Shared Tab-State zwischen Split-View-ConfigPanel und FavoritePreview —
  Tab-Auswahl bleibt jetzt konsistent.

### Refactoring
- Neue Komponente `ConfigPanelTabList` eliminiert Duplikation zwischen
  ConfigPanel und FavoritePreview (beide nutzen jetzt `uiStore.configSubTab`).

### Docs & Housekeeping
- CLAUDE.md auf 4-Gates-Struktur umgestellt (Pre-Commit / CI / Feature /
  Tauri-Security), stale Testzahlen entfernt, Verweise auf `arc42` als
  Master-Spec.
- `Softwareprozess/Phase.txt` → `history/` (ersetzt durch arc42 + CHANGELOG).
- `tasks/testing-spec.md` → `history/testing-spec-v1.3.1.md` (Sprint beendet,
  zeitlose Regeln in CLAUDE.md migriert).
- `Softwareprozess/lessons-learned.md` → `history/lessons-learned.md`
  (Inhalt in `tasks/lessons.md` migriert).
- Neu: `tasks/docs-inventory.md` (Landkarte aller aktiven/archivierten Docs).
- CHANGELOG.md: v1.3.0, v1.4.0, v1.4.1 nachgetragen (waren ungepflegt).

### Lessons Learned (tasks/lessons.md)
- Sprint-Plan-Docs sind Artefakte → Drei-Phasen-Archivierungsregel.
- Hardcodierte Zahlen in Dauer-Docs driften garantiert.
- CHANGELOG-Pflege gehoert in Release-Checkliste.
- Usage-Check vor Komponenten-Aenderung (mehrfach verifiziert durch eigene Fehler).

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
