# Docs Inventory

> **Zweck:** Wenn du den Ueberblick verlierst welche Doku wo lebt — hier zuerst schauen.
> **Pflege:** Nach jedem Sprint-Review aktualisieren (neue Docs eintragen, archivierte verschieben).
> **Letzter Review:** 2026-04-05

---

## Aktive Dokumente

### Prozess & Anweisungen (werden von Claude/Contributors tagtäglich gelebt)

| Datei | Zweck | Pflege-Rhythmus |
|-------|-------|-----------------|
| `CLAUDE.md` | Projekt-Konventionen, Arbeitsweise, 4 Quality-Gates, Agents/Skills/Hooks. Bei jeder Session geladen. | Bei Prozess-Aenderungen |
| `CONTRIBUTING.md` | Contributor-Onboarding (Setup, Code Style, PR-Workflow) | Selten |
| `README.md` | Projekt-Intro, Getting Started, Doku-Uebersicht | Selten |
| `SECURITY.md` | Security Policy (Reporting) | Selten |

### Architektur & Roadmap (Single Source of Truth)

| Datei | Zweck | Pflege-Rhythmus |
|-------|-------|-----------------|
| `Softwareprozess/arc42-specification.md` | **Master-Spec**: Architektur, Roadmap, User Stories, Qualitaets-Ziele, Risiken | Nach jedem Sprint-Review |
| `Softwareprozess/Protokoll-Design.md` | ADP-Protokoll-Details (wird von arc42 referenziert) | Bei Protokoll-Aenderungen |
| `CHANGELOG.md` | Release-Historie (Keep-a-Changelog-Format) | Bei jedem Release |

### Operative Sprint-Docs

| Datei | Zweck | Pflege-Rhythmus |
|-------|-------|-----------------|
| `tasks/todo.md` | Aktueller Sprint-Backlog + Abgeschlossen-Historie | Kontinuierlich |
| `tasks/ideas.md` | Spontane Ideen (roh, kein Filter) | Bei Ideen-Aufkommen |
| `tasks/lessons.md` | Lessons Learned (ab 2026-03-25) | Nach jeder User-Korrektur / jedem Problem |
| `tasks/user-stories-pipeline.md` | User Stories US-P1–US-P5 fuer Pipeline-Feature | Bei Story-Aenderungen |
| `tasks/sprint-plan-v1.5-v2.0.md` | Detaillierter Forecast v1.5–v2.0 (Artefakt, wird nach v2.0 archiviert) | Waehrend v1.5/v2.0 Sprint |
| `tasks/docs-inventory.md` | **Dieses Dokument** | Nach jedem Sprint-Review |

### .claude/ (Claude Code Konfiguration)

| Verzeichnis | Zweck |
|-------------|-------|
| `.claude/agents/*.md` | Agent-Definitionen (architect, test-engineer, security-reviewer, code-quality, git-workflow) |
| `.claude/skills/*/SKILL.md` | Skill-Pipelines (`/implement`, `/bugfix`, `/review`, `/sprint-review`) |
| `.claude/settings.json` | Hooks-Konfiguration (PreToolUse Safe-Guard, PostToolUse tsc) |
| `.claude/hooks/*.mjs` | Hook-Implementierungen |
| `.claude/plans/*.md` | Implementation-Plans (Artefakte, pro Feature) |

---

## Archivierte Dokumente (historische Artefakte)

| Datei | Grund der Archivierung |
|-------|------------------------|
| `Softwareprozess/history/Phase.txt` | 7-Phasen-Modell durch arc42 ersetzt (2026-04-05) |
| `Softwareprozess/history/testing-spec-v1.3.1.md` | QA-Sprint abgeschlossen; 4-Gates-Regeln in CLAUDE.md migriert (2026-04-05) |
| `Softwareprozess/history/lessons-learned.md` | Historische Lessons bis 2026-03-16 (Inhalt in `tasks/lessons.md` migriert, 2026-04-05) |
| `Softwareprozess/Anforderungsanalyse.md` | Vor Pivot zu Session Manager (2026-03-16) |
| `Softwareprozess/Planung.md` | Vor Pivot zu Session Manager (2026-03-16) |

---

## Archivierungs-Regel (siehe CLAUDE.md)

Sprint-Plan-Dokumente (`sprint-plan-vX.md`, `testing-spec.md`, Sprint-Retros) sind **Artefakte**. Nach Sprint-Abschluss wandern sie nach `Softwareprozess/history/`. **Zeitlose Regeln/Patterns werden VORHER** nach CLAUDE.md oder arc42 migriert — sie duerfen nicht im Archiv versanden.

## Typische "Wo finde ich..."-Antworten

| Frage | Antwort |
|-------|---------|
| Was ist der aktuelle Sprint? | `tasks/todo.md` (oberster "Aktueller Sprint"-Block) |
| Wie ist die Gesamt-Roadmap? | `Softwareprozess/arc42-specification.md`, Abschnitt 1.1 "Roadmap-Vision" |
| Welche Release-Notes hat v1.4.0? | `CHANGELOG.md` |
| Welche Regeln gelten fuer Tests? | `CLAUDE.md`, Abschnitt "Testing & Quality Gates" |
| Was haben wir aus Fehlern gelernt? | `tasks/lessons.md` |
| Was ist der aktuelle Testzahl-/Coverage-Stand? | `npm run test` bzw. `npm run test:coverage` (Zahlen bewusst NICHT in MD-Files) |
| Wie funktioniert der `/implement`-Workflow? | `.claude/skills/implement/SKILL.md` |
