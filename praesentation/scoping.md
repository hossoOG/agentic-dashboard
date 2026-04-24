# Scoping: Bug-Analyse GitHub-Optionen in Config-View

## Scoping-Block 1 — 2026-04-23

| Feld | Wert |
|------|------|
| Thema | Bug: Config-Ansicht zeigt GitHub-Optionen auch bei Projekten ohne Git/GitHub |
| Typ | Incident / Bug-Report (Phase 1 von 3) |
| Zielgruppe | Projekt-Owner (User selbst) |
| Format | Marp-Deck → .pptx, 30 Slides |
| Sprache | Deutsch |
| Tiefe | Deep-Dive (komplette Root-Cause-Analyse) |
| Theme | neutral (hellen Hintergrund, schwarz/accent) |
| Lesbarkeit | Alles auf sichtbarer Fläche (Body 22px, max 6 Bullets/Slide, Code max 12 Zeilen) |
| Quellen | Codebasis `C:\Projekte\AgentenPipelineDashboard` (Git-Stand master, 2026-04-23) |

## Phasen-Plan

1. **Phase 1 (jetzt):** Multi-Agent-Analyse + 30-Slide-Report
2. **Phase 2:** User-Review → Bug-Fix durch Agent-Team
3. **Phase 3:** User baut neu + verifiziert

## Informationsquellen (Phase 1)

- **Agent 1 (Explore):** Config-View-Komponenten lokalisiert (ConfigPanel, configPanelShared, ConfigPanelTabList, GitHubViewer)
- **Agent 2 (Explore):** GitHub-Detection-Logik (Rust-Backend `get_git_info`, kein zentraler Status-Check)
- **Agent 3 (Explore):** Projekt-Datenmodell (FolderProject, FavoriteFolder, ProjectConfig — kein `hasGithub`-Feld)
- **Agent 4 (Explore):** Rust-Backend-Inventar (11 GitHub/Git-Commands, kein `check_github_status`)
- **Direktes Lesen:** `configPanelShared.tsx`, `ConfigPanel.tsx`, `ConfigPanelTabList.tsx`

## Bug-Beschreibung (User-Original)

> "Wir wollen bei projekten welche kein github initiert haben auch in der konfig ansicht nicht die Optionen sehen!"

→ **Präzisierung:** In der `ConfigPanel`-Tab-Leiste werden die Tabs "GitHub", "Worktrees" und "Kanban" auch dann angezeigt, wenn das aktive Projekt kein Git-Repository (oder kein GitHub-Remote) hat. User will diese Tabs nur sehen, wenn sie auch sinnvoll nutzbar sind.
