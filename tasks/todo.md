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

## Aktueller Sprint: v1.4.2 — Kompass (Doku-Housekeeping)

> **Ziel:** Doku-Drift beheben, Navigation wiederherstellen. Kein neues Feature.
> **Plan:** Nach User-Feedback 2026-04-05, Details siehe Commit `chore(docs): v1.4.2 housekeeping`.
> **Folge-Sprint:** v1.5 "Kompass II" bringt MD-Pinning im Config-Panel.

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

### Stage 2 Follow-ups (Backlog)

- [ ] Pin umbenennen per Context-Menu / Inline-Edit (`renamePinnedDoc` existiert, UI fehlt)
- [ ] Pin-Reordering per Drag & Drop
- [ ] Unsaved-Changes-Warnung wenn Pin-Tab gewechselt wird
- [ ] Komponenten-Tests fuer ConfigPanel (Pin hinzufuegen/entfernen, Pin-Tab-Switch)
- [ ] Dead-Code-Audit: `ContentTabs.tsx` pruefen — wird nirgends importiert (vermutlich orphan)

## Backlog (Future)

- [x] **DEBT-04**: Store-Deduplizierung agentStore vs pipelineStore (#85) — rawLogs entfernt, agentId Cross-Ref, Log-Flow 3→2
- [ ] **US-P3**: Session-Start nach erkanntem Workflow (abhaengig von US-P2)
- [ ] refactor(ui): SessionManagerView zerlegen (#62)
- [ ] refactor(tauri): ADPError in Tauri-Commands deployen (#63)
- [ ] refactor(ui): Component-Library formalisieren (#65)
- [x] feat: In-App Markdown-Editor mit Speicherfunktion (#68) — Core implementiert + QA-Haertung
- [ ] feat(editor): Unsaved-Changes-Warnung bei Tab-Wechsel/Close/Datei-Oeffnen (#68 follow-up)
- [ ] feat(editor): Projekt-Dateibrowser fuer .md Dateien (#68 follow-up)
- [ ] feat(editor): Library-Integration (Klick auf Datei → Editor oeffnet) (#68 follow-up)
- [ ] perf(editor): @codemirror/language-data auf ~20 Sprachen reduzieren (#68 follow-up)
- [ ] test(editor): Komponenten-Tests (EditorToolbar, MarkdownPreview XSS, MarkdownEditorView) (#68 follow-up)
- [ ] test(all): Test-Coverage auf 75%+ erhoehen (#66)
- [ ] Gamification-System (#15)

---

*Format: `- [ ] Task (#issue)` — Items auf GitHub Board tracken.*
