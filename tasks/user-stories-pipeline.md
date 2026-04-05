# User Stories — Pipeline-Ueberwachung

> Erstellt: 2026-03-28 (Issue #16)
> Bezug: `tasks/ideas.md`, `Softwareprozess/arc42-specification.md` (Roadmap-Kapitel)

---

## Analyse bestehender User Stories

### DONE (v1.0.0 — v1.2.0)

| Story  | Titel                              | Status |
|--------|------------------------------------|--------|
| US-S1  | Multi-Session-Verwaltung           | DONE   |
| US-S2  | Session CRUD                       | DONE   |
| US-S3  | Projektordner pro Session          | DONE   |
| US-S4  | Session-Status in Sidebar          | DONE   |
| US-S5  | Globale Notizen                    | DONE   |
| US-S6  | Aktive Session im Header           | DONE   |
| US-A1  | CLAUDE.md Viewer                   | DONE   |
| US-A2  | Skills Viewer                      | DONE   |
| US-A3  | Hooks Viewer                       | DONE   |
| US-G1  | GitHub PRs                         | DONE   |
| US-G2  | GitHub Issues                      | DONE   |
| US-G3  | Branch/Commit Info                 | DONE   |

### Implementiert OHNE User Story

| Feature                          | Wann       | Bemerkung                          |
|----------------------------------|------------|------------------------------------|
| Theming (Dark/Light/Accent)      | 2026-03-24 | settingsStore, komplett funktional |
| Changelog-Dialog                 | 2026-03-24 | UI-Komponente                      |
| Projekt-Notizen ohne Session     | 2026-03-25 | Favoriten-basiert                  |
| Toast-System                     | -          | uiStore                            |
| Error Boundaries                 | -          | React ErrorBoundary                |
| Favoriten-System                 | -          | settingsStore                      |
| Agent-Detection (Rust)           | -          | agent_detector.rs, agentStore.ts   |
| Pipeline-View (Mock-Modus)       | -          | DashboardMap.tsx + Nodes           |
| ADP-Protokoll-Schema             | -          | protocols/schema.ts                |
| Log Viewer Tab                   | 2026-03-27 | SideNav-Tab                        |
| Auto-Update System               | 2026-03-28 | Tauri GitHub Releases              |

### Backlog (noch relevant?)

| Story  | Titel                              | Bewertung                                      |
|--------|------------------------------------|-------------------------------------------------|
| US-C1  | API-Kosten pro Key                 | Noch relevant, aber niedrige Prio              |
| US-C2  | Andere AI-Projekte starten         | Ueberlappt mit Pipeline-Stories, zurueckstellen |
| US-C3  | Externe Anbieter (Kalender etc.)   | Persona C, niedrige Prio                       |
| US-O1  | OAuth Tokens speichern             | Relevant fuer spaetere Integrationen           |
| US-O2  | Pipeline Real-Modus                | Wird durch US-P1 konkretisiert                 |
| US-A4  | Audit-View                         | Relevant, aber abhaengig von US-P2             |

---

## Architektur-Entscheidungen

### Was ist ein "Workflow"?

Ein **Workflow** ist eine erkannte Kombination aus Projekt-Konfiguration (CLAUDE.md, Skills, Hooks)
die einen bestimmten Arbeitsmodus beschreibt. Beispiele:

- **Skill-basierter Workflow**: Projekt hat `/implement`, `/bugfix`, `/review-pr` Skills
  → Dashboard erkennt: "Dieses Projekt nutzt Skill-gesteuerte Entwicklung"
- **Hook-basierter Workflow**: Projekt hat Pre-Commit-Hooks, Post-Session-Hooks
  → Dashboard erkennt: "Dieses Projekt hat automatisierte Qualitaetssicherung"
- **Multi-Agent Workflow**: CLAUDE.md definiert parallele Worktree-Nutzung
  → Dashboard erkennt: "Dieses Projekt nutzt parallele Agenten"

**MVP-Definition**: Ein Workflow ist eine benannte Sammlung von Skills die als Gruppe
ausfuehrbar sind. Keine automatische Ableitung im MVP — manuelle Zuordnung genuegt.

### Manuell vs. Automatisch triggern?

| Aspekt        | MVP (manuell)                      | Future (automatisch)                   |
|---------------|------------------------------------|----------------------------------------|
| Trigger       | User klickt "Starten"              | Event-basiert (z.B. neuer Issue)       |
| Konfiguration | Skill + Ordner auswaehlen          | Regeln in Projekt-Config               |
| Komplexitaet  | Niedrig                            | Hoch (Scheduling, Error-Recovery)      |
| Risiko        | User hat volle Kontrolle           | Unerwuenschte Ausfuehrungen moeglich   |

**Entscheidung**: MVP ist manuell. Automatisches Triggern ist Future-Scope.

### Visualisierung paralleler Agenten

Bestehende Infrastruktur:
- `agentStore.ts`: Tracking von Agenten pro Session (id, status, worktree)
- `agent_detector.rs`: Regex-basierte Erkennung aus PTY-Output
- `pipelineStore.ts`: Worktree-Tracking mit Steps und QA-Gate
- `DashboardMap.tsx`: Isometrische 2.5D-Ansicht (nur Mock-Daten)

**Entscheidung**: Die Pipeline-View (`DashboardMap.tsx`) wird mit echten Daten aus
`agentStore` gespeist. Jeder erkannte Agent wird ein Node. Worktrees werden als
Verbindungen dargestellt. Kein neues Visualisierungs-Framework — bestehende
Isometrie-Komponenten wiederverwenden.

### MVP-Scope vs. Future-Scope

**MVP** (US-P1 + US-P2 + US-P4):
- Pipeline-View zeigt erkannte Agenten und Worktrees aus agentStore
- Skills/Hooks werden gelesen und als "Workflow-Profil" zusammengefasst
- Mehrere parallele Agenten gleichzeitig sichtbar

**Phase 2** (US-P3 + US-P5):
- Session-Start ueber erkannte Workflows
- Agent-Hierarchie (Parent/Child) visualisieren

**Future**:
- Automatisches Triggern von Workflows
- Workflow-Templates (exportieren/importieren)
- Gamification (XP, Achievements basierend auf Agent-Arbeit)

---

## Neue Pipeline User Stories

### US-P1: [OFFEN] Pipeline-View mit echten Daten
Als Entwickler (H) will ich erkannte Agenten und Worktrees in der Pipeline-View
als Nodes sehen, damit ich den aktuellen Stand meiner parallelen Agenten-Arbeit
auf einen Blick erfassen kann.

**Akzeptanzkriterien:**
- [ ] DashboardMap.tsx liest Daten aus `agentStore` statt aus `pipelineStore` Mock-Daten
- [ ] Jeder erkannte Agent wird als Node mit Name, Status und Laufzeit dargestellt
- [ ] Worktrees werden als eigene Nodes mit Branch-Name und Pfad angezeigt
- [ ] Verbindungslinien zeigen welcher Agent zu welchem Worktree gehoert
- [ ] Leerer Zustand: "Keine Agenten erkannt — starte eine Session mit Claude CLI"
- [ ] Status-Updates (running/completed/error) werden live aktualisiert

**Abhaengigkeiten:** agentStore.ts, agent_detector.rs (beide existieren)
**Scope:** MVP
**Issue:** #12

---

### US-P2: [OFFEN] Workflow-Erkennung aus Projekt-Konfiguration
Als Entwickler (H) will ich dass das Dashboard Skills und Hooks eines Projekts
analysiert und als Workflow-Profil zusammenfasst, damit ich sofort sehe welche
Automatisierungen fuer ein Projekt verfuegbar sind.

**Akzeptanzkriterien:**
- [ ] Beim Session-Wechsel werden Skills (.claude/skills/*.md) und Hooks (.claude/settings.json) gelesen
- [ ] Erkannte Skills werden gruppiert angezeigt (z.B. "Entwicklung: /implement, /bugfix", "Review: /review-pr")
- [ ] Erkannte Hooks werden nach Event-Typ kategorisiert (PreCommit, PostSession etc.)
- [ ] Ein "Workflow-Profil" fasst die Konfiguration in einer kompakten Uebersicht zusammen
- [ ] Projekte ohne Skills/Hooks zeigen: "Kein Workflow konfiguriert"
- [ ] Das Profil ist im Library-Tab oder als eigene Ansicht zugaenglich

**Abhaengigkeiten:** Tauri-Commands `read_project_file`, `list_project_dir` (existieren)
**Scope:** MVP
**Issue:** #13

---

### US-P3: [OFFEN] Session-Start nach erkanntem Workflow
Als Entwickler (H) will ich einen erkannten Workflow (Skill) direkt aus dem
Dashboard starten koennen, damit ich nicht manuell in die CLI wechseln muss.

**Akzeptanzkriterien:**
- [ ] In der Workflow-Uebersicht gibt es einen "Starten"-Button pro Skill
- [ ] Klick oeffnet eine neue Session mit dem Projektordner vorausgewaehlt
- [ ] Der Skill-Befehl (z.B. `/implement`) wird als initialer Input ins Terminal geschrieben
- [ ] User kann vor dem Absenden den Befehl anpassen (z.B. Parameter hinzufuegen)
- [ ] Nach Start wechselt die Ansicht zur neuen Session

**Abhaengigkeiten:** US-P2 (Workflow-Erkennung), Session-Manager (existiert)
**Scope:** Phase 2
**Issue:** #13

---

### US-P4: [OFFEN] Paralleles Agent-Tracking
Als Entwickler (H) will ich mehrere parallele Agenten gleichzeitig ueberwachen,
damit ich bei Multi-Agent-Workflows den Ueberblick behalte.

**Akzeptanzkriterien:**
- [ ] Das Agent-Panel (Bottom-Panel oder Pipeline-View) zeigt alle aktiven Agenten aller Sessions
- [ ] Pro Agent sichtbar: Session-Name, Agent-Name/Task, Status, Laufzeit
- [ ] Agenten sind nach Status sortiert: running > error > completed
- [ ] Klick auf einen Agenten wechselt zur zugehoerigen Session
- [ ] Gesamtanzahl aktiver Agenten ist in der SideNav oder StatusBar sichtbar
- [ ] Agent-Events (detected, completed, error) loesen einen Toast aus

**Abhaengigkeiten:** agentStore.ts, agent_detector.rs (existieren)
**Scope:** MVP
**Issue:** Neu (zu erstellen)

---

### US-P5: [OFFEN] Agent-Hierarchie-Darstellung
Als Entwickler (H) will ich sehen welcher Agent welche Sub-Agenten gestartet hat,
damit ich die Arbeitsstruktur bei verschachtelten Agent-Aufrufen nachvollziehen kann.

**Akzeptanzkriterien:**
- [ ] `parentAgentId` in agentStore wird aktiv befuellt (Erkennung aus PTY-Output)
- [ ] In der Pipeline-View werden Parent-Child-Beziehungen als Baumstruktur dargestellt
- [ ] Verbindungslinien zeigen die Hierarchie (Parent → Child)
- [ ] Collapse/Expand fuer Agent-Gruppen wenn mehr als 3 Sub-Agenten
- [ ] Hover auf einen Agenten hebt seinen gesamten Subtree hervor

**Abhaengigkeiten:** US-P1 (Pipeline-View mit echten Daten), agent_detector.rs Erweiterung
**Scope:** Phase 2
**Issue:** Neu (zu erstellen)

---

## Priorisierung

| Prio | Story | Aufwand | Abhaengigkeiten |
|------|-------|---------|-----------------|
| 1    | US-P1 | MITTEL  | Keine           |
| 2    | US-P4 | MITTEL  | Keine           |
| 3    | US-P2 | NIEDRIG | Keine           |
| 4    | US-P3 | MITTEL  | US-P2           |
| 5    | US-P5 | HOCH    | US-P1           |

**Empfehlung**: US-P1 und US-P4 parallel angehen (keine Abhaengigkeiten zueinander),
dann US-P2 als schnellen Win mitnehmen. US-P3 und US-P5 sind Phase 2.
