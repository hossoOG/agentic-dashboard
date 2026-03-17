# Changelog

Alle relevanten Änderungen am Agentic Dashboard werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

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
