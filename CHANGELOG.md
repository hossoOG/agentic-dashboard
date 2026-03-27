# Changelog

Alle relevanten Änderungen an AgenticExplorer werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

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
