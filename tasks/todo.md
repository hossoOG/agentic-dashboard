# AgenticExplorer — Sprint Backlog

> **Kanban Board**: https://github.com/users/hossoOG/projects/3
> **Langfristige Roadmap**: `Softwareprozess/arc42-specification.md`, Abschnitt 1.1 "Roadmap-Vision"
> **Release-Historie**: `CHANGELOG.md`
> **Doku-Orientierung**: `tasks/docs-inventory.md`
> Alle neuen Tasks werden als GitHub Issues erfasst und ueber das Board getrackt.

## Abgeschlossen: Konsolidierungs-Sprint (2026-03-25)

- [x] Retrospektive durchfuehren
- [x] Task-Tracking und Idea-Capture einrichten
- [x] Planungsdokumente archivieren + aktuelle Roadmap
- [x] Toten Code aufraeumen (12 Dateien)
- [x] CLAUDE.md an Realitaet anpassen
- [x] Lessons Learned dokumentieren

## Abgeschlossen: Performance & Dependencies (2026-03-27)

- [x] SessionCard Memoization + Shared Timer (#6)
- [x] Zustand Selector Stabilisierung (#7)
- [x] Vite Manual Chunking (#4)
- [x] React.lazy Config Viewers (#5)
- [x] Remove Notification Plugin (#9)
- [x] Agent Detector Regex OnceLock (#10)
- [x] Rust Error Handling Konsistenz (#8)
- [x] Log Viewer als neuer SideNav-Tab

## Abgeschlossen: Feature-Forward (2026-03-27)

- [x] Prozess: User Stories evaluieren (#16) — Ergebnis: `tasks/user-stories-pipeline.md`

## Aktueller Sprint: v1.3.0 — Bugs + Kanban + Split View

> Issues und Fortschritt auf dem [Kanban Board](https://github.com/users/hossoOG/projects/3)

### Bugs (Prio 1) — ERLEDIGT

- [x] Log-Anzeige fehlerhaft — Zeiten stimmen nicht (#40)
- [x] Backend-Logs Errors untersuchen und beheben (#41)
- [x] Log-Ansicht als eigenes Fenster oeffnen funktioniert nicht (#26)
- [x] Settings-Persistenz: Datenverlust bei App-Start/Update verhindern (#23)
- [x] **Update-Prozess killt App ohne Bestätigung** — Download und Install getrennt

### GitHub Kanban (Prio 2) — ERLEDIGT

- [x] Kanban-Board im Dashboard — GitHub Projects Integration (#17)
- [x] Kanban-Board im Session-Fenster neben Konfig platzieren (#24)

### Split View + Config-Tabs (Prio 2) — ERLEDIGT

- [x] Split-View — Terminal links, Kontext-Panel rechts (#28)
- [x] Config-Dateien einzeln als Tabs neben Terminal (#42)

### Offen aus vorherigem Sprint — ERLEDIGT

- [x] Library als eigenen SideNav-Tab (#11)
- [x] **US-P1**: Pipeline-View mit echten agentStore-Daten (#12)
- [x] **US-P2**: Workflow-Erkennung aus Projekt-Konfiguration (#13)
- [x] Session-History pro Projekt (#29)

## Aktueller Sprint: v1.3.0 → ERLEDIGT ✓

## Abgeschlossen: v1.3.1 — Quality & Security Foundation (2026-04-02)

> **Milestone**: https://github.com/hossoOG/agentic-dashboard/milestone/1
> Kein neues Feature. Sicherheit, QA-Infra, kritische Tests, Bugfixes.

### Phase 1: Security Fixes (BLOCKING)

- [x] fix(tauri): Shell-Injection in Session-Resume validieren (#55)
- [x] fix(tauri): CSP-Policy haerten — unsafe-eval entfernen (#56)
- [x] fix(tauri): Subprocess-Timeouts fuer gh/git/claude Commands (#64)

### Phase 2: QA-Infrastruktur

- [x] QA-9: Bestehende Tests stabilisieren & Baseline messen (#69)
- [x] QA-1: Pre-Commit Hook installieren (#70) — zusammen mit #61
- [x] chore(devops): Pre-Commit-Hooks einrichten / husky (#61)
- [x] QA-2: CI Coverage Gate aktivieren (#71)

### Phase 3: Kritische Tests

- [x] QA-4: AgentDetector Tests — Buffer-Trim & Duplikat-Erkennung (#73)
- [x] QA-5: AgentDetector Tests — Name-Matching & Lifecycle (#74)
- [x] QA-6: pipelineAdapter Frontend Tests (#75)
- [x] test(store): Persistence-Layer absichern — tauriStorage + settings.rs (#60)

### Phase 4: Bug Fixes & Quick Wins

- [x] Session-Status-Erkennung bei ultrathink / langen Denkpausen (#67)
- [x] perf(store): updateLastOutput debouncen — UI-Jank eliminieren (#58)
- [x] chore(deps): npm audit Vulnerabilities fixen (#57)

### Phase 5: Dokumentation & Abschluss

- [x] QA-3: CLAUDE.md Testing-Abschnitt ueberarbeiten (#72)
- [x] QA-8: Claude Code Post-Edit Hook einrichten (#77)
- [x] QA-7: Pipeline Component Tests (#76)

## Abgeschlossen: v1.4.0 — Agent Detection & Pipeline Rewrite (2026-04-03)

> **Plan**: `.claude/plans/virtual-sauteeing-barto.md`
> **Bezug**: US-P1 (#59), US-P5, QA-4 (#73), QA-5 (#74), #14
> **Ziel**: Echte Agent-Erkennung + Task-Tree-Visualisierung

### Phase 1: Agent Detector Rewrite (Rust)

- [x] 1.1 Neue Claude Code-spezifische Regex-Patterns (Unicode: ●, ■, □, ✓, ✗)
- [x] 1.2 AgentInfo Datenmodell erweitern (hierarchy, tokens, phases, dependencies)
- [x] 1.3 Neue Event-Typen: `agent-status-update`, `task-summary`
- [x] 1.4 Hierarchie-Tracking: agent_stack + task_agents Map
- [x] 1.5 feed() auf Zeile-fuer-Zeile-Scanning umstellen
- [x] 1.6 Event-Emission in manager.rs erweitern
- [x] 1.7 Rust Unit Tests (36 Tests gruen inkl. false-positive Guards)

### Phase 2: Frontend Data Model Extension

- [x] 2.1 agentStore: Typen + Actions + Selectors erweitern
- [x] 2.2 SessionManagerView: Event-Listener fuer neue Events
- [x] 2.3 pipelineAdapter: useAdaptedTaskTree Hook (Tree statt Flat)
- [x] 2.4 Frontend Tests: 287 Tests gruen, Build gruen

### Phase 3: Pipeline Visualization Redesign

- [x] 3.1 TaskTreeView.tsx (NEU): Ersetzt DashboardMap
- [x] 3.2 TaskTreeNode.tsx (NEU): Rekursiver Baum-Node mit Status-Icons
- [x] 3.3 PipelineView.tsx: DashboardMap → TaskTreeView
- [x] 3.4 AgentMetricsPanel: Token-Card erweitert
- [x] 3.5 AgentBottomPanel: Hierarchie-Darstellung + neue Felder
- [x] 3.6 Legacy-Komponenten entfernt (DashboardMap + dead code in c3982d5)

### Phase 4: Coverage QA + Performance Measurement — ERLEDIGT

> **Plan**: `.claude/plans/synthetic-tickling-hoare.md`

- [x] A0: CI Coverage-Schwellen auf Baseline senken
- [x] A1: Pure Function Tests (pathUtils, parseSkillFrontmatter, statusConfig, activityLevel)
- [x] A2: Error Logger + Log Viewer Store Tests
- [x] A3: Agent Store + Session History Store Tests
- [x] A4: Library Store + Workflow Store Tests
- [x] B1: perfLogger.ts erstellen + Tests
- [x] B2: perfLogger Initialisierung in main.tsx
- [x] B3: IPC/Event/Store/Render Instrumentierung (24 Punkte)
- [x] Coverage-Schwellen hochgezogen (24/32/58/24)

## Abgeschlossen: v1.4.1 — Security, Editor & Cleanup (2026-04-04)

> Release getaggt 2026-04-04, Changelog-Eintrag in `CHANGELOG.md`.

- [x] feat(editor): In-App Markdown-Editor mit CodeMirror (#68)
- [x] fix(security): Path-Traversal-Protection gehaertet (safe_resolve auch fuer non-existente Pfade) + Tests
- [x] fix(security): DOMPurify-Config gehaertet (ALLOWED_ATTR/FORBID_ATTR) + XSS-Prevention-Tests
- [x] feat(security): zentrales Input-Validierungs-Modul
- [x] refactor(store): `rawLogs` aus logParser/pipelineStore entfernt (#85)
- [x] refactor(ui): DashboardMap Legacy-Code entfernt
- [x] docs: arc42 v2.1 + sprint-plan v1.5-v2.0 + sprint-review Skill

## Abgeschlossen: v1.5.0 — "Kompass" (2026-04-05)

> Stage 1 (Housekeeping) + Stage 2 (MD-Pinning) in einer Session gebuendelt.
> Release: https://github.com/hossoOG/agentic-dashboard/releases/tag/v1.5.0

### Post-Release: /release Skill gebaut (2026-04-05)

- [x] `.claude/skills/release/SKILL.md` — 9-Phasen-Pipeline
- [x] CLAUDE.md Skills-Tabelle erweitert
- Erste Nutzung: naechster Release (v1.5.1 oder v1.6.0)

### Stage 1: Doku-Housekeeping (Session 2026-04-05)

- [x] `testing-spec.md` archivieren nach `Softwareprozess/history/` (4-Gates in CLAUDE.md migriert)
- [x] `Phase.txt` archivieren nach `Softwareprozess/history/` (Rolle durch arc42 + CHANGELOG ersetzt)
- [x] CLAUDE.md: Test-Zahlen entfernt, Testing-Abschnitt durch 4-Gates-Struktur ersetzt
- [x] CLAUDE.md: Prozess-Dokumentation-Abschnitt aktualisiert (arc42, docs-inventory ergaenzt)
- [x] CHANGELOG.md: v1.3.0, v1.4.0, v1.4.1 nachgetragen
- [x] `tasks/docs-inventory.md` neu angelegt
- [x] `tasks/todo.md` Roadmap-Verweise auf arc42 + CHANGELOG
- [x] `README.md` + `CONTRIBUTING.md`: Phase.txt-Referenzen durch arc42 + CHANGELOG ersetzt
- [x] `tasks/lessons.md`: neue Lesson zur Sprint-Plan-Archivierungs-Regel

### Stage 2: MD-Pinning im Config-Panel (Session 2026-04-05)

- [x] `settingsStore`: `pinnedDocs: Record<projectPath, PinnedDoc[]>` mit Actions + Persistenz
- [x] `ConfigPanel`: "+" Button fuer neue Pins, X-Button zum Entfernen (on-hover)
- [x] OS File-Picker mit .md/.markdown-Filter + defaultPath=Projektordner
- [x] `PinnedDocViewer`: Read+Edit+Save-Viewer (ClaudeMdViewer-Pattern)
- [x] Tests: 33 neue Tests (validatePinnedPath, normalizeProjectKey, add/remove/rename)
- [x] Path-Traversal-Guard: im Store (validatePinnedPath) + beim Laden (Rust safe_resolve)
- [x] Security-Review: Pfad-Validierung mehrstufig, keine neuen Tauri-Commands, vorhandene Commands wiederverwendet

### Stage 2 Follow-ups (erledigt in v1.5.1)

- [x] Pin umbenennen per Doppelklick/Inline-Edit (v1.5.1)
- [x] Unsaved-Changes-Warnung beim Pin-Tab-Wechsel (v1.5.1)
- [x] Dead-Code-Audit: `ContentTabs.tsx` entfernt (v1.5.1)
- [ ] Pin-Reordering per Drag & Drop → verschoben nach v3.0+
- [x] Komponenten-Tests fuer ConfigPanel — via v1.6.0 QA-Sprint erledigt

## Abgeschlossen: v1.5.1 — Kompass Aufraeum-Patch (2026-04-05)

> Release: https://github.com/hossoOG/agentic-dashboard/releases/tag/v1.5.1
> GitHub-Milestones aufgeraeumt: v1.5.0 geschlossen, 11 Issues → v1.6.0.

## Abgeschlossen: v1.6.0–v1.6.2 — Tech-Debt & QA-Haertung (2026-04-09)

> Release v1.6.2: https://github.com/hossoOG/agentic-dashboard/releases/tag/v1.6.2

> **Milestone**: https://github.com/hossoOG/agentic-dashboard/milestone/5 (11 Issues)
> **Ziel**: Test-Coverage von Baseline auf 60% heben, DevOps-Infrastruktur haerten,
> God-Components entschlacken. Basis fuer v2.0 schaffen.

### Welle 1 — DevOps Quick Wins

- [x] DEVOPS-02 Dependency Audit in CI (#92) — `npm audit` + `cargo audit` als Warn-Job, wochentl. Schedule
- [x] DEVOPS-04 Release-Workflow dokumentieren (#93) — arc42 Kap. 10.3 Gate 4 erweitert

### Welle 2 — Test-Coverage heben (Reihenfolge beachten)

- [x] QA-12 editorStore Tests verifizieren/erweitern (#89) — PR #94 merged, 14 → 26 Tests
- [x] QA-11 Editor-Komponenten Tests — Toolbar/Preview/View (#88) — PR #95 merged, 5+3+5 Tests
- [x] QA-10 Component-Tests fuer Kern-UI (#87) — PR #96 merged, SessionCard/SideNav/Toast/ErrorBoundary
- [x] QA-16 Rust Integration Tests fuer kritische Tauri-Commands (#91) — PR #97 merged, 17 Tests
- [x] QA-15 Coverage-Schwellen auf 75/75/65/75 hochgezogen (#90) — PR #131 merged, 907 Tests, 83% Coverage
- [x] test(all): Test-Coverage auf 83%+ erreicht (#66) — PRs #125-#131, +241 Tests in 39 Dateien

### Welle 3 — Bug Fixes (Prio 1)

- [x] bug(ui): Session-Status-Farben werden nicht korrekt erkannt (#100) — PR #106 merged
- [x] bug(ui): Scrolling in Sessions funktioniert unzuverlaessig (#101) — PR #107 merged
- [x] bug(ui): Log-Ansicht ist verbuggt (#104) — PR #108 merged

### Welle 4 — Refactorings & Reevaluierung

- [x] refactor(ui): Hooks-Reiter und Konfig-Panel ueberarbeiten (#102) — erledigt
- [x] refactor(pipeline): Pipeline-Funktionalitaet neu evaluieren (#103) — PR #112 merged

### Welle 5 — Features

- [x] feat(library): Uebersicht aller Skills, Agents, Hooks, Configs — global + pro Projekt (#110) — PR #111 merged

### Welle 6 — Tech-Debt Refactorings (erledigt)

- [x] refactor(ui): SessionManagerView God-Component zerlegen (#62) — closed
- [x] refactor(tauri): ADPError statt String in Tauri-Commands (#63) — closed
- [x] refactor(ui): Component-Library formalisieren — Button/Modal/Input (#65) — closed

### Welle 7 — Bugs & Verbesserungen (aus manuellem Test 2026-04-06)

- [x] bug(ui): Hooks-Reiter zeigt keine Hook-Details — nur 'Projekt' Label (#114) — PR #120 merged
- [x] bug(ui): Library-Ansicht zeigt nur Global — keine Projekt-Konfigurationen (#117) — PR #121 merged
- [x] bug(ui): Log-Ansicht — Zeitstempel springen, Updater-Spam, Exit-Code-Flut (#118) — PR #119 merged
- [x] perf(editor): @codemirror/language-data auf ~20 Sprachen reduzieren (#113) — PR #122 merged, −669 KB (−25%)
- [x] bug(ui): Agents aus .claude/agents/ werden im Config-Panel nicht angezeigt (#115) — PR #124 merged, 11 Tests
- [x] bug(ui): Projektspezifische Claude-Settings nicht einsehbar (#116) — PR #123 merged, 13 Tests

### Welle 8 — Frontend-Review Fixes (aus 5-Experten-Analyse 2026-04-06)

- [x] fix(ui): echte Umlaute in allen UI-Strings (#132) — PR #145 merged, 45 Dateien
- [x] fix(ui): Sprachmix bereinigen + SideNav Labels + Settings ausblenden (#133, #137, #138) — PR #141 merged
- [x] fix(a11y): Toast aria-live + aria-hidden auf dekorativen Icons (#134) — PR #143 merged
- [x] fix(a11y): Light-Mode Kontrast auf WCAG AA (#135) — PR #140 merged, CSS-Token-Fix
- [x] feat(logs): Error-Grouping + Virtualisierung + React.memo (#136) — PR #144 merged
- [x] fix(ui): Filled CTA-Buttons für primäre Aktionen (#139) — PR #142 merged

### Skill-Infrastruktur (parallel zum Sprint)

- [x] `/implement` Skill: Phase 0.5 Pre-Flight (Working Tree clean) + Phase 7 Post-Merge-Cleanup ergaenzt (2026-04-05)
- [x] `/parallel-implement` Skill **designen + erstellen** (2026-04-05) — `.claude/skills/parallel-implement/SKILL.md`. Orchestrator-Pattern: max 3 Subagents parallel, je in eigenem worktree, inline Mini-Pipeline (Analyse→Impl→Test→QA→PR), JSON-Return pro Agent.
- [x] Alle 6 Skills gehaertet (2026-04-06) — Pre-Edit Usage Check, Cross-Cutting Pre+Post-Scan, Lessons Capture, Merge-Order-Empfehlung, Dead-Code-Check in Review
- [x] `/parallel-implement` Skill **testen** mit 3 gleichzeitigen Issues (2026-04-06) — #114, #117, #118 parallel, alle 3 PR_READY
- [x] `/parallel-implement` 2. Lauf (2026-04-06) — #113, #115, #116 parallel, alle 3 merged inkl. Auto-Merge + Konflikt-Resolution
- [x] `/implement` + `/parallel-implement` Skills: Auto-Merge + Merge-Konflikt-Resolution ergaenzt (2026-04-06)

## Abgeschlossen: v1.6.24 — "Session-Name-Fix" (2026-04-10)

> Release v1.6.24: https://github.com/hossoOG/agentic-dashboard/releases/tag/v1.6.24

- [x] fix(store): Session-Restore Namens-Vertauschung — Folder-Keys statt Array-Indizes
- [x] fix(store): Custom-Namen persistent via sessionTitleOverrides (claudeSessionId)
- [x] fix(ui): SessionHistoryViewer zeigt Override-Namen + gibt sie beim Resume mit
- [x] fix(ui): Resume aus History übernimmt Titel (kein hardcodiertes "Resume Session")

## Backlog (v2.0 — Pipeline Engine)

- [ ] **US-P3**: Session-Start nach erkanntem Workflow (abhaengig von US-P2)
- [ ] feat(editor): Unsaved-Changes-Warnung bei Tab-Wechsel/Close/Datei-Oeffnen (#68 follow-up)
- [ ] feat(editor): Projekt-Dateibrowser fuer .md Dateien (#68 follow-up)
- [ ] feat(editor): Library-Integration (Klick auf Datei → Editor oeffnet) (#68 follow-up)

## Backlog (v3.0+ — Session Manager Feature-Freeze)

> Session Manager ist ab v1.6.0 feature-frozen. Nur Bugfixes erlaubt.

- [x] feat(ui): Sessions umbenennen (#147) — v1.6.2, Doppelklick auf SessionCard
- [ ] Node/Graph-basierte Session-Visualisierung (#14)
- [ ] Gamification-System (#15)
- [ ] Pin-Reordering per Drag & Drop

## Erledigt (Backlog)

- [x] **DEBT-04**: Store-Deduplizierung agentStore vs pipelineStore (#85) — rawLogs entfernt, agentId Cross-Ref, Log-Flow 3→2
- [x] refactor(ui): SessionManagerView zerlegen (#62) — PR #98 merged
- [x] refactor(tauri): ADPError in Tauri-Commands deployen (#63) — PR #99 merged
- [x] refactor(ui): Component-Library formalisieren (#65) — PR #105 merged
- [x] feat: In-App Markdown-Editor mit Speicherfunktion (#68) — Core implementiert + QA-Haertung
- [x] perf(editor): @codemirror/language-data auf ~20 Sprachen reduzieren (#113) — PR #122 merged
- [x] test(editor): Komponenten-Tests (EditorToolbar, MarkdownPreview XSS, MarkdownEditorView) (#68 follow-up) — via #88 PR #95
- [x] test(all): Test-Coverage auf 83%+ erreicht (#66) — via PRs #125-#131

---

*Format: `- [ ] Task (#issue)` — Items auf GitHub Board tracken.*
