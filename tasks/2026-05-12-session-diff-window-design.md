# Session-Diff-Window — Design-Spec

**Datum:** 2026-05-12
**Status:** Design genehmigt — Implementation-Plan ausstehend
**Bezug:** Brainstorming-Skill, Conversation 2026-05-12

## Motivation

Claude-CLI-Sessions aendern Dateien im Working-Tree. Aktuell sind diese Aenderungen nur als Text-Output im Terminal (xterm.js) sichtbar — schwer zu reviewen, kein Syntax-Highlighting, kein Vergleich. Der User will Aenderungen pro Session **lesbar reviewen** koennen, vergleichbar mit VSCode-Diff-View.

**Killer-Aspekt:** Pro-Session-Attribution. Klassische Git-GUIs zeigen "alle Aenderungen seit HEAD" — sie wissen nicht, *welche Session* welche Aenderung gemacht hat. Eine Agentic-IDE kann das, weil sie den Snapshot-Zeitpunkt selbst kontrolliert.

## Scope

**In-Scope:**
- Diff-Anzeige fuer Aenderungen seit Session-Start, pro Session
- Eigenes Tauri-WebviewWindow pro Session, Label `diff-<sessionId>`
- Side-by-Side- und Inline-View, Toggle pro Fenster
- Manual-Refresh + Auto-Refresh-on-Focus
- Robust gegen `git gc`, Session-Close, fehlendes Git-Repo

**Out-of-Scope (Phase 1, ggf. Phase 2 oder Backlog):**
- Hunk-Level-Attribution (welcher Edit-Tool-Call hat welchen Hunk erzeugt) — Backlog (JSONL-Parser-Erweiterung)
- Diff-Akzeptieren/Rejecting im UI — eigenes Feature
- Multi-Session-Vergleich (Session A vs. Session B) — Backlog
- Cross-Repo-Diffs — Worktree-Viewer hat das schon teilweise
- FS-Watcher / Live-Updates — Auto-on-Focus reicht
- In-Diff-Search — Nice-to-have, nicht Muss

## Architektur

### Komponenten-Diagramm

```
+--------------------------------------------------------------+
| Haupt-Fenster (index.html)                                   |
|   SessionCard / FavoriteCard / GridCell                      |
|   [Diff][Folder][Term][Close] --invoke--+                    |
+-----------------------------------------+--------------------+
                                          |
                                          v
                  +----------------------------------+
                  | Tauri Backend (Rust)             |
                  |   open_session_diff_window(id)   |
                  |   get_session_diff(id)           |
                  |   create_session (erweitert):    |
                  |     - is_git_repo + snapshot-ref |
                  |   close_session (erweitert):     |
                  |     - delete snapshot-ref        |
                  +-----------------+----------------+
                                    |
                                    | spawns WebviewWindow
                                    v
+--------------------------------------------------------------+
| Diff-Fenster (index.html?view=diff&sessionId=<id>)           |
|  +- FilesList -----+ +- CodeMirrorMerge (Side-by-Side) ----+ |
|  | src/bar.ts  M   | | Original (snapshot) | Current        | |
|  | src/baz.ts  M   | |  function load() {  | function load{ | |
|  | src/new.ts  A   | | -  cache.get(id)    | + cache.get(k) | |
|  +-----------------+ +-------------------------------------+ |
|  Footer: Refresh   Snapshot 14:02   38 ms   [Side | Inline]  |
+--------------------------------------------------------------+
```

### Window-Modell

- **Eine WebviewWindow pro Session**, Label `diff-<sessionId>`.
- Identisches `index.html` wie Haupt-App. Routing via Query-Param `?view=diff&sessionId=<id>`.
- Re-Click bei bereits offenem Fenster: `WebviewWindow::set_focus()` — klont log-viewer-Pattern aus `src-tauri/src/lib.rs:142-152`.
- Initial-Groesse: 1200x800. Resizable. Window-Position/-Size in zukuenftiger Phase persistieren (Backlog).

### Snapshot-Mechanik

**Trigger:** Im bestehenden `create_session`-Command, nach PTY-Spawn, vor Event-Emit:

1. `git -C <workdir> rev-parse --is-inside-work-tree` → bool `is_git_repo`.
2. Wenn Repo:
   - `git -C <workdir> stash create` → liefert Commit-Hash *oder* leeren String wenn Working-Tree clean.
   - Wenn leerer String: fallback auf `git rev-parse HEAD` (Snapshot = aktueller HEAD).
   - `git -C <workdir> update-ref refs/agentic-explorer/session-<id> <hash>` — gc-safe.
3. Werte (`is_git_repo`, `snapshot_commit`, `snapshot_at`) in der Session-Struktur speichern.

**Edge-Cases:**
- **Detached HEAD:** OK, `rev-parse HEAD` funktioniert.
- **Merge/Rebase im Gange:** `git stash create` failed evtl. → fallback `rev-parse HEAD`, UI-Footer-Hinweis "Snapshot ohne Working-Tree-Aenderungen".
- **Empty repo (kein Commit):** `is_git_repo=false` setzen, kein Diff-Button.
- **Submodules:** Nicht in Phase 1 — Spec dokumentiert "Submodule-Aenderungen werden ignoriert".

**Cleanup:** `close_session` macht `git update-ref -d refs/agentic-explorer/session-<id>`. Falls Ref fehlt, einmal `tracing::warn`, kein Hard-Fail.

### Diff-Computation

Neuer Rust-Command `get_session_diff(sessionId) -> SessionDiff`:

```rust
struct SessionDiff {
    snapshot_commit: String,
    snapshot_at: DateTime<Utc>,
    computed_at: DateTime<Utc>,
    compute_ms: u64,
    files: Vec<DiffFile>,
    truncated: bool,        // true wenn ueber Performance-Budget
}
struct DiffFile {
    path: String,
    status: FileStatus,     // Modified | Added | Deleted | Renamed
    additions: u32,
    deletions: u32,
    old_content: Option<String>,   // None bei Added oder oversize
    new_content: Option<String>,   // None bei Deleted oder oversize
    oversize: bool,         // true wenn File > 500 KB — Content ausgelassen
}
```

**Implementation:** `git diff --name-status <ref> -- .` fuer File-Liste, `git diff --numstat <ref> -- .` fuer Counts, `git show <ref>:<path>` fuer `old_content`, `std::fs::read_to_string` fuer `new_content`. Parsing/Aggregation im Rust statt im Frontend (deterministisch, testbar).

**Performance-Budget:** Annahme < 50 Files / Session, < 500 KB pro File. Bei Ueberschreitung: einzelne grosse Files werden mit `old_content=None`/`new_content=None` + Hinweis-Flag geliefert. Hard-Stop ab 5 MB Total, `truncated=true`.

### Frontend

**Action-Bar-Button (3 Files):**

In folgenden Components vor dem bestehenden FolderOpen-Button einfuegen:
- `src/components/sessions/SessionCard.tsx` (vor Zeile 132)
- `src/components/sessions/FavoriteCard.tsx` (analog)
- `src/components/sessions/GridCell.tsx` (analog)

JSX-Skeleton:
```tsx
{session.isGitRepo && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      invoke("open_session_diff_window", { sessionId: session.id });
    }}
    className={hoverActionBarBtn}
    title="Diff anzeigen"
    aria-label="Aenderungen dieser Session anzeigen"
  >
    <Diff className="w-3.5 h-3.5" />
  </button>
)}
```

**Diff-Fenster (neue Components):**

- `src/views/DiffWindowView.tsx` — Top-Level, gewaehlt wenn `?view=diff`
- `src/components/diff/DiffFileList.tsx` — Linke Datei-Liste mit Status-Indikator
- `src/components/diff/DiffMergeView.tsx` — CodeMirror-Merge-Wrapper
- `src/components/diff/DiffWindowFooter.tsx` — Refresh + Toggle (Side/Inline) + Stats

**Routing-Pivot in `src/main.tsx` (oder Top-Level-`App.tsx`):**

```tsx
const params = new URLSearchParams(window.location.search);
if (params.get("view") === "diff") {
  const sessionId = params.get("sessionId");
  return <DiffWindowView sessionId={sessionId} />;
}
return <AppShell />;
```

Diese Route-Verzweigung passiert *vor* dem Mounten der Zustand-Stores des Haupt-Fensters, damit das Diff-Fenster keinen unnoetigen State-Bootstrap zieht.

**State:**

- Kein Zustand-Store-Share zum Haupt-Fenster — Diff-Fenster hat separaten JS-Context.
- Diff-Fenster haelt lokalen State (`useState`) fuer `SessionDiff`, `selectedFileIndex`, `viewMode` (Side/Inline), `refreshStatus`.
- `viewMode`-Preference wird via Tauri-Event `diff-settings-update` an den `settingsStore` im Haupt-Fenster gesendet → cross-window persistiert.

**Lifecycle:**

- Mount: parse URL, `invoke("get_session_diff", { sessionId })`, render.
- Auto-Refresh: Tauri-Event `tauri://focus` lauschen. Wenn `auto_refresh_on_focus` in Settings an: re-invoke.
- Session-Close: Tauri-Event `session-deleted/<id>` empfangen → Banner "Session beendet — Diff eingefroren" einblenden, Refresh-Button disablen.
- Failure: `invoke` failed → Error-Banner mit Re-Try-Button, kein White-Screen.

### Design-System-Compliance

- Sharp corners (radius 0) ueberall — keine Ausnahme im Diff-Fenster.
- `neonEditorTheme` aus `src/components/editor/editorTheme.ts` fuer CodeMirror-Merge wiederverwenden. Diff-spezifische Klassen (`cm-deletedChunk`, `cm-insertedChunk` etc.) ggf. ergaenzen.
- Akzent (cyan-teal hue 190) fuer Selected-File-Highlight. Additionen in `text-success`, Deletionen in `text-danger` (bestehende Tokens aus `src/index.css`).
- Lucide-`Diff`-Icon, 2px stroke, `currentColor`. In `src/utils/icons.ts` als `ICONS.DIFF` ergaenzen.
- Panel-Header in Diff-Window: UPPERCASE + `tracking-widest`. "DATEIEN", "AENDERUNGEN" als Headings.
- Inline-Klassen direkt in JSX, kein generisches `<Panel>`-Component.
- Pronouns-Regel: Title="Diff anzeigen", nicht "Zeige Sie das Diff an".

## Phasen

**Phase 1 — Rust-Backend (aktive Phase, separater Branch):**
1. `create_session` erweitern: `is_git_repo`-Check, Snapshot-Ref anlegen.
2. `close_session` erweitern: Snapshot-Ref loeschen.
3. `get_session_diff`-Command implementieren.
4. `open_session_diff_window`-Command implementieren.
5. Rust-Integration-Tests fuer Snapshot-Lifecycle.

**Phase 2 — Frontend (naechste Phase):**
1. URL-Routing-Pivot in `main.tsx`/`App.tsx`.
2. `DiffWindowView` + Children-Components.
3. `@codemirror/merge` installieren + integrieren.
4. Action-Bar-Button in `SessionCard.tsx`, `FavoriteCard.tsx`, `GridCell.tsx`.
5. Session-Close-Event-Wiring + Banner.
6. Vitest-Tests pro Component + Integration.

**Backlog (out-of-current-roadmap):**
- Hunk-Level-Attribution via JSONL-Tool-Use-Events.
- Diff-Search.
- Multi-Session-Vergleich.
- Window-Position/-Size persistieren.
- Submodule-Support.
- FS-Watcher fuer echte Live-Updates.

## Testing

**Rust (`src-tauri/tests/session_diff.rs`, neue Datei):**
- Snapshot-bei-clean-repo: nach `create_session` ist Ref vorhanden, deren Commit == HEAD-Commit.
- Snapshot-bei-dirty-repo: Snapshot-Commit != HEAD, enthaelt working-tree-state.
- Snapshot-bei-non-repo: `is_git_repo=false`, kein Ref angelegt.
- Ref-Cleanup-bei-close: `update-ref -d` wird aufgerufen, Ref weg.
- gc-Safety: `git gc --prune=now --aggressive` zwischen create und get_session_diff — Diff bleibt verfuegbar.
- Detached-HEAD-Case: fallback funktioniert.

**Frontend (Vitest):**
- `DiffWindowView.test.tsx` — `mockIPC` fuer `get_session_diff`, verschiedene Payload-Shapes (leer / 1 File / 50 Files / truncated).
- `SessionCard.test.tsx` — Button rendert nur wenn `isGitRepo=true`.
- `DiffMergeView.test.tsx` — Sprache wird per File-Extension korrekt geladen.
- `App.integration.test.tsx` — URL-Routing-Pivot fuer `?view=diff`.

## Risiken & offene Punkte

1. **`@codemirror/merge` Theme-Coverage:** Validieren, dass `neonEditorTheme` die Merge-Klassen abdeckt. Falls nicht: gezielte Theme-Erweiterung in `editorTheme.ts`. Mitigation: in Phase 2 Step 3 als erstes klaeren.
2. **Snapshot-Latenz bei grossen Repos:** `git stash create` kann bei mehreren GB Working-Tree Sekunden dauern. Async im Rust-Command + Spinner-State im Card-UI ("Initialisiere Diff...").
3. **`?view=`-Routing-Kollision:** Muss in `main.tsx` *vor* dem Zustand-Store-Hydration abgefangen werden, sonst zieht das Diff-Fenster unnoetig den Haupt-State.
4. **Window-Bootstrap-Race:** Wenn Session waehrend Window-Open-IPC geloescht wird, muss Diff-Fenster mit Error-Banner statt White-Screen rendern.
5. **CSP fuer Diff-Fenster:** Eintrag in `tauri.conf.json` pruefen — sollte via `'self'` schon abgedeckt sein, da gleiches `index.html`.

## Quality Gates (vor "Done" pro Phase)

- [ ] `npx tsc --noEmit && npm run build` gruen.
- [ ] `cd src-tauri && cargo check && cargo clippy -- -D warnings` gruen.
- [ ] Mind. 1 Happy-Path + 1 Edge-Case-Test pro neuer Komponente/Command (Test-Datei im selben Commit).
- [ ] Visueller Smoke-Test: Diff-Fenster mit echter Session geoeffnet, Diff sichtbar, Refresh klappt.
- [ ] Design-System-Check: sharp corners, Cyan-Akzent, Lucide-Icons mit 2px stroke, Panel-Header UPPERCASE.
- [ ] `git update-ref -d` wird bei Session-Close ausgefuehrt (cargo-Test verifiziert).
- [ ] Lessons-Learned-Eintrag falls Edge-Cases unterwegs aufgedeckt wurden.
