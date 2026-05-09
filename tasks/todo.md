# AgenticExplorer — Sprint Backlog

> **Kanban Board**: https://github.com/users/hossoOG/projects/3
> **Langfristige Roadmap**: `Softwareprozess/arc42-specification.md`, Abschnitt 1.1 "Roadmap-Vision"
> **Release-Historie**: `CHANGELOG.md` (alle Releases bis v1.6.26)
> **Doku-Orientierung**: `tasks/docs-inventory.md`
> Alle neuen Tasks werden als GitHub Issues erfasst und ueber das Board getrackt.

## Aktuelle Phase: History-Delete (2026-05-09)

**Ziel**: User kann einzelne Claude-CLI-Chat-Sessions aus dem History-Tab im
Config-Panel loeschen, ohne Datenverlust ohne OS-Recovery-Pfad.

### Storage-Modell-Befund (validiert via VS-Code-Source-Vergleich)
- Sessions: `~/.claude/projects/<slug>/<uuid>/<uuid>.jsonl` plus optional `subagents/`
- Memory: `~/.claude/projects/<slug>/memory/MEMORY.md` plus Einzeldateien — projektweit, NICHT pro Session
- Folge: "Session loeschen" entfernt nur das `<uuid>/`-Verzeichnis. Memory bleibt; Hygiene ueber Library-Viewer separat.

### Architektur-Entscheidungen
1. **OS-Trash statt Hard-Delete** — `trash` Crate. Recovery via Windows-Papierkorb.
2. **Kein Confirm-Dialog** — Trash macht Aktion reversibel, OS-Trash ist genug Friction.
3. **Optimistic Removal** — Liste sofort aktualisieren, bei Fehler State zurueckrollen.
4. **Cross-State-Cleanup** — `sessionTitleOverrides` plus `sessionRestore.sessions[]` aufraeumen, sonst Karteileichen.
5. **Memory-Review als Toast-Action** — Button "Memory pruefen" springt in Library-Tab, dort vorhandenes UI nutzen.

### Tasks
- [ ] `trash = "5"` in `src-tauri/Cargo.toml`
- [ ] Tauri-Command `delete_claude_session(folder, session_id)` in `src-tauri/src/session/file_reader.rs`
  - UUID-Validation via `is_uuid_like`
  - Pfad-Resolution gegen `~/.claude/projects/<slug>/<uuid>/`
  - `trash::delete()` auf Folder-Ebene (subagents/ wandern automatisch mit)
  - Idempotenz: NotFound = `Ok(())`
- [ ] Command in `tauri::generate_handler!` (`lib.rs`) registrieren
- [ ] Frontend: Trash-Icon-Button in `SessionHistoryViewer.tsx` neben Resume-Play-Button
- [ ] Frontend: `removeRestorableSessionByClaudeId` plus `clearSessionTitleOverride`-Aufruf in `settingsStore.ts`
- [ ] Frontend: Optimistic-Removal plus Rollback bei Fehler
- [ ] Frontend: Toast mit Action "Memory pruefen" → `setActiveTab("library")`
- [ ] Tests Rust: Roundtrip mit `tempfile::TempDir`, Idempotenz, UUID-Validation, Path-Traversal
- [ ] Tests Frontend: Optimistic-Update, Rollback, Action-Trigger

### Out of Scope (v1)
- Bulk-Delete / Multi-Select
- Archive-Feature
- Inline-Memory-Review-Modal (nur Library-Sprung)
- Empty-Trash-Action

## Laufend: Design-System-Intake (2026-04-17, #232)

> Externes Design-System-Paket (cyan-teal, sharp corners, expo easing) ins Repo
> eingepflegt. Plan: `reports/hier-ist-eine-anleitung-polished-meadow.md`.

- [ ] Verify: `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run build`
- [ ] PR erstellen, mergen, Board-Lane auf "Done"
- [ ] Follow-up-Issue: Echtes Logo + Tauri-Icon-Set

## Backlog v1.6.27

- [ ] **Design-System-Intake nachziehen**: Commits 5a34876, ab48cc9, 0c8f020, 982d481,
      92371fd, c3ea26f, a31791e, 3431f0a, 42d7c07, da53c3f, 412e129 aus
      `backup/origin-master-snapshot` selektiv cherry-picken. Enthaelt: semantische
      `.ae-*`-Classes, icon-registry, 3D-Hover-Pattern, UPPERCASE-Panel-Titles,
      number-format-Standards, Rust-Toolchain 1.95 Pin.

## Backlog (v2.x — Editor)

- [ ] feat(editor): Unsaved-Changes-Warnung bei Tab-Wechsel/Close/Datei-Oeffnen (#68 follow-up)
- [ ] feat(editor): Projekt-Dateibrowser fuer .md Dateien (#68 follow-up)
- [ ] feat(editor): Library-Integration (Klick auf Datei → Editor oeffnet) (#68 follow-up)

## Backlog (v3.0+ — Session Manager Feature-Freeze)

> Session Manager ist ab v1.6.0 feature-frozen. Nur Bugfixes erlaubt.

- [ ] Node/Graph-basierte Session-Visualisierung (#14)
- [ ] Gamification-System (#15)
- [ ] Pin-Reordering per Drag & Drop

---

*Format: `- [ ] Task (#issue)` — Items auf GitHub Board tracken.*
*Historische Sprints (v1.3.0 bis v1.6.26) liegen in `CHANGELOG.md` und git-history.*
