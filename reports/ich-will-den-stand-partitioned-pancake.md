# Plan: v1.6.26 via pragmatischem Mittelweg (Weg 3 + WIP-Split)

## Context

Der Rechner zuhause (hossoOG, hovsep.aroyan@outlook.de) hat am 16.04.2026 einen v1.6.25-„Bugfix-Sprint" gemacht: 10 Commits + 1 WIP-Sammelcommit (`dcbb597`). **Nichts gepusht.** Parallel hat derselbe User von der Uni aus (Hovsep Aroyan, wxz171@haw-hamburg.de) 32 Commits auf `origin/master` gepusht (bis 2026-04-19): einen eigenen v1.6.25-Release plus ein großes Design-System-Intake (25 Commits mit semantischen `.ae-*`-Classes, icon-registry, UPPERCASE-Titles, Panel-Header-Unify etc.). Die beiden Stränge divergieren ab `13db6d4`, Tag `v1.6.25` existiert auf beiden Seiten mit unterschiedlichem Target.

Der **lokale Build wurde manuell interaktiv getestet und ist OK**. Der User will einfach Bugfixes machen und v1.6.26 releasen. Die Entscheidung nach Multi-Agent-Analyse:

- **Weg 3 (pragmatisch):** Design-System-Intake verwerfen (später in v1.6.27 nachziehen), **alle 13 wertvollen Remote-Commits (inkl. komplette Kanban-V2-Migration)** und alle lokalen Bugfixes in v1.6.26 integrieren.
- **WIP-Commit splitten** in 5 atomare Feature-Commits. Der Tab-Filter-Teil wird verworfen zugunsten der Remote-Variante `dd755c9`.

Ergebnis: v1.6.26 enthält Kanban-V2 + alle kritischen Bugfixes (lokal + remote) ohne Design-System-Noise. Zeitbudget: ~2,5 h.

## Key Facts

| Eigenschaft | Wert |
|---|---|
| Merge-Base | `13db6d4` |
| Local HEAD | `dcbb597` (master) |
| Local Tag `v1.6.25` | → `67c847c` |
| Remote HEAD | `5a34876` |
| Remote Tag `v1.6.25` | → `feb5c57` |
| Backup-Branch | `backup/local-bugfix-sprint-2026-04-16` → `67c847c` ✅ existiert |
| Reconcile-Branch | `v1.6.26-reconcile` (wird angelegt) |
| Zeitbudget | ~2,5 h |

## Execution Roadmap (5 Phasen)

### Phase E1 — Pre-Flight-Sicherung (~10 min)

Agent **A7 (Pre-Flight-Validator)** verifiziert und erzeugt:

```
git branch backup/pre-v1.6.26-reconcile-$(date +%Y%m%d) master
git branch backup/origin-master-snapshot origin/master
git bundle create reports/origin-master-pre-reconcile.bundle origin/master --tags
git reflog --date=iso > reports/reflog-pre-reconcile.txt
git log origin/master --oneline > reports/remote-commits-discarded.txt
# Working Tree clean prüfen, Stash-List leer, alle 3 Version-Files noch auf 1.6.25
```

**Gate:** Erst weitermachen, wenn Backup-Bundle vorhanden und Working Tree sauber ist.

### Phase E2 — WIP-Split (~35 min)

Agent **A8 (WIP-Splitter)** operiert auf einem Hilfsbranch `local-split`:

```
git checkout -b local-split dcbb597
git reset --soft HEAD~1   # dcbb597 aufbrechen, Changes bleiben staged
git reset HEAD            # unstage, Working Tree behält die 6 modifizierten Files
```

Dann 5 atomare Commits erzeugen (Tab-Filter-Teil wird **nicht** committet):

| # | Commit-Message | Files |
|---|---|---|
| — | **(DROP)** ~~feat(config): #192 leere Kontext-Tabs ausblenden~~ | `src/components/sessions/ConfigPanelTabList.tsx` — wird verworfen (`dd755c9` deckt ab) |
| 1 | `feat(ui): inline Update-Button in Sidebar mit Progress + Relaunch (teilw. #191)` | `src/components/layout/SideNav.tsx` |
| 2 | `feat(status): active/idle-Split via getActivityLevel + useNowTick` | `src/components/sessions/SessionStatusBar.tsx` |
| 3 | `fix(terminal): initial fit erst nach document.fonts.ready` | `src/components/sessions/SessionTerminal.tsx` |
| 4 | `fix(events): rolling 500-Byte Output-Buffer pro Session` | `src/components/sessions/hooks/useSessionEvents.ts` |
| 5 | `refactor(library): scope → scopeId für stabile uiStore-Cache-Keys` | `src/components/library/LibraryView.tsx` |

Die SHAs der 5 neuen Commits werden notiert für Phase E3.

### Phase E3 — Reconcile-Branch & Cherry-Picks (~70 min)

Agent **A9 (Konflikt-Resolver)** baut den Reconcile-Branch auf Merge-Base auf und pickt in genau dieser Reihenfolge:

```
git checkout -b v1.6.26-reconcile 13db6d4
```

**Gruppe 1 — Lokale Infra + Tests (5 Commits, erwartet 0 Konflikte):**
```
git cherry-pick f32e7a1 5fb5eb4 c5e6602 cea3567 5e2a6d9
```
Gate: `npm run build && npm test`

**Gruppe 2 — Lokale Fixes (4 Commits):**
```
git cherry-pick 88277c7   # Konflikt LibraryView.tsx gegen späteren Remote-Merge — zunächst Local nehmen
git cherry-pick 85e06fa   # clean
git cherry-pick d5bc9be   # Konflikt SessionTerminal.tsx — zunächst Local nehmen
git cherry-pick f6119a2   # minimal / auto-merge
```

**Gruppe 3 — 5 Split-WIP-Commits (aus Phase E2):**
```
git cherry-pick <split-1-SideNav> <split-2-StatusBar> <split-3-Terminal-fit> <split-4-Buffer> <split-5-LibraryView-scopeId>
```

**Gruppe 4 — Kanban-V2-Kette (5 Commits, topologisch zusammen):**
```
git cherry-pick b790848   # GitHub Projects v2 Migration — großer Umbau, ~15 min
git cherry-pick ec9c97e   # GraphQL Single-Call Enrichment
git cherry-pick 1ddeb80   # Global Board Mode Cross-Repo
git cherry-pick 0b37f3f   # Follow-up: global store + repo badge
git cherry-pick 4618853   # Follow-up: Rust commands folder-free
```

**Gruppe 5 — Remote Bugfixes & Features (6 Commits):**
```
git cherry-pick 77588a3   # Worktree CLAUDE.md-Resolution
git cherry-pick baecf4f   # Library collapse-by-default
git cherry-pick 86864cd   # #230 Grid-Mode Branch-Chip
git cherry-pick dd755c9   # #192 Tab-Filter (Remote-Variante, gewinnt gegen verworfenen Local-Teil)
git cherry-pick 9cee12b   # xterm Ctrl+V Paste-Collision-Fix
git cherry-pick 4a3c3dd   # #196 Non-Git-Filter + Sky-Blue-Dot + LibraryView Cache-Fix
```

**Gruppe 6 — Performance (2 Commits):**
```
git cherry-pick 4778f17   # useShallow status-bar
git cherry-pick 49350f5   # Agent-Cleanup + useShallow + ActivityDot-Extract
```

**Konflikt-Hotspot-Matrix (Cherry-Pick-Zeitpunkt):**

| Bei Cherry-Pick | Datei | Konflikt | Resolution |
|---|---|---|---|
| `d5bc9be` + `9cee12b` | `SessionTerminal.tsx` | Remote entfernt Ctrl+V-Handler, Local fügt logError auf Handler hinzu | Nur Copy- und Resize-`logError` behalten, Paste-Handler-Teil droppen, Remote-Native-Paste gewinnt |
| `88277c7` + `4a3c3dd` + `baecf4f` + Split-5 | `LibraryView.tsx` | ScopePanel-Signatur (folder vs scopeId), Cache-Keys, defaultOpen | Beide Params in Signatur (`folder, scopeId`), Remote-Cache-Keys `${scope}:${folder}:settings`, `defaultOpen`-Props drop, `scopeId` für uiStore-Hook |
| Split-2 + `49350f5` + `4a3c3dd` | `SessionStatusBar.tsx` | idle-Split (Local) + useShallow (Remote) + sky-blue-Farbe (Remote) | Alle drei zusammen: idle-Split als Struktur, useShallow-Wrapper um Selectoren, sky-blue für idle-Dot |
| `f6119a2` vs `b790848` | `IssueComments.tsx` | Kanban-V2 strukturiert Kommentare neu | IssueComment-`id`-Feld in V2-Typ einpflegen |
| `cea3567` vs `b790848` | `KanbanBoard.tsx` | PointerEvent-Cleanup (Local) + komplette V2-Neuschreibung (Remote) | V2 gewinnt strukturell, PointerEvent-AbortController-Pattern neu auf V2-Code anwenden |
| alle v1.6.25-Commits | `CHANGELOG.md`, `tasks/lessons.md`, `tasks/todo.md` | parallele v1.6.25-Einträge | Union-Merge, Remote-v1.6.25 authoritativ, Local-Inhalte in neuen v1.6.26-Eintrag |

**Gate nach Phase E3:** `npm run build`, `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy -- -D warnings`, `npm run lint`, Playwright-Smoke-Suite.

### Phase E4 — Release v1.6.26 (~25 min)

Agent **A10 (Release-Executor)**:

**Version-Bumps:**
- `package.json:4` → `"version": "1.6.26"`
- `src-tauri/Cargo.toml:3` → `version = "1.6.26"`
- `src-tauri/tauri.conf.json:4` → `"version": "1.6.26"`
- `cargo check --manifest-path src-tauri/Cargo.toml` aktualisiert `Cargo.lock`

**CHANGELOG.md — neuer Eintrag oben, nach Referenzen:**

```markdown
## [1.6.26] — 2026-04-22 — "Kanban v2 + Bugfix-Sprint"

> Reconcile-Release: Kanban-Migration auf GitHub Projects v2 plus der
> komplette v1.6.25-Bugfix-Sprint vom Heim-Rechner, integriert in einen
> Commit-Strang. Design-System-Intake bewusst zurückgestellt auf v1.6.27.

### Added
- Kanban: Migration auf GitHub Projects v2 (ersetzt Label-Pseudo-Kanban)
- Kanban: Global Board Mode mit Cross-Repo-Issue-Details
- Kanban: GraphQL Single-Call Enrichment (Assignees + Labels)
- UI: Grid-Mode Branch-Chip pro Zelle (#230)
- UI: Inline Update-Button in Sidebar mit Download-Progress + Relaunch
- Status: active/idle-Split im StatusBar via getActivityLevel + useNowTick
- Config: #192 leere Kontext-Tabs ausblenden + git-Repo-Detection

### Fixed
- Terminal: xterm Ctrl+V Paste kollidiert nicht mehr mit Custom-Handler
- Terminal: initial fit erst nach document.fonts.ready
- CLAUDE.md: Linked-Worktree Root-Resolution
- Library: ScopePanel/Section Persistenz, Cache-Collision-Fix, Collapse-by-default
- Sessions: Idle-Dot sky-blue, konsistente Error-Surface (Clipboard/Resize)
- Sessions: Rolling 500-Byte Output-Buffer gegen abgehackte Previews
- Kanban: Non-Git-Folder-Filter (#196), PointerEvent-Cleanup bei Unmount, stabile React-Keys
- GitHub: Pagination-Loop max_pages-Guard (Schutz gegen malformed API)
- Store: agentStore räumt selectedAgentId + bottomPanelCollapsed beim Session-Close

### Performance
- useShallow in StatusBar + Session-Counts (verhindert 100/s Re-Renders)
- ActivityDot als separate Komponente extrahiert

### Tests
- E2E-Playwright-Suite mit Tauri-IPC-Mock (6 Specs)
- Cross-Store-Integrationstests (session + agent + ui)
- localStorage-Polyfill für jsdom 25

### Removed / Deferred
- Design-System-Intake (semantische `.ae-*`-Classes, icon-registry, UPPERCASE-Titles,
  Panel-Header-Unify, number-format-Standards, 3D-Hover-Pattern): **nicht in v1.6.26
  enthalten**, wird in v1.6.27 als eigener Zyklus nachgezogen. Quelle: `backup/origin-master-snapshot`.
```

**tasks/todo.md:** v1.6.26-Sektion als abgeschlossen markieren, v1.6.27-Platzhalter mit „Design-System-Intake nachziehen" als erste Aufgabe anlegen.

**Commit + Tag:**
```
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock CHANGELOG.md tasks/todo.md
git commit -m "chore(release): v1.6.26 — Kanban v2 + Bugfix-Sprint"
git tag -a v1.6.26 -m "v1.6.26 — Reconcile Release"
```

### Phase E5 — Push & PR (~15 min)

Weiterhin Agent **A10**:

**Tag-v1.6.25-Kollision:**
```
git tag -d v1.6.25
git fetch origin 'refs/tags/v1.6.25:refs/tags/v1.6.25'
# Lokaler Tag 67c847c bleibt im Backup-Branch konserviert
```

**PR-Route (nicht Force-Push auf master):**
```
git push -u origin v1.6.26-reconcile
gh pr create --base master --head v1.6.26-reconcile \
  --title "v1.6.26 — Rebranch without design intake" \
  --body "Bewusster Rebranch. Design-System-Commits (#233/#239/#240/#247–#254) sind nicht enthalten — werden in v1.6.27 als eigener Zyklus nachgeholt. Enthält: Kanban v2, 10 Local-Bugfixes, 5 Split-WIP-Features, 13 Remote-Fixes und -Features (Grid-Chip, Global-Board, Worktree-Resolve, Paste-Fix, …)."
```

Self-Review auf GitHub, dann **Squash-Merge** via UI. Nach Merge:

```
git checkout master
git fetch origin
git reset --hard origin/master

# Tag v1.6.26 auf den (neuen) Squash-Commit ziehen:
git tag -f v1.6.26 origin/master
git push origin v1.6.26 --force-with-lease
```

CI-Workflow `.github/workflows/release.yml` triggert beim Tag-Push und baut den NSIS-Installer + signiertes `latest.json` → GitHub-Release erscheint automatisch. Tauri-Updater (`useAutoUpdate`, pollt alle 30 min) verteilt v1.6.26 an bestehende Installationen.

### Phase E6 — Cleanup (~5 min)

```
git branch -D v1.6.26-reconcile
git branch -D local-split
# Backup-Branches BEHALTEN mindestens 4 Wochen:
#   backup/local-bugfix-sprint-2026-04-16  (67c847c + 7 Uncommitted-Snapshot)
#   backup/pre-v1.6.26-reconcile-YYYYMMDD   (dcbb597 Snapshot)
#   backup/origin-master-snapshot           (5a34876 Snapshot für v1.6.27 Design-Intake)
# Tickler im Kalender für 2026-05-22 zum Löschen setzen.

# Den anderen Rechner (Uni) informieren: er muss `git fetch && git reset --hard origin/master`
# BEVOR er weiterarbeitet, sonst pusht er ggf. die Design-Commits zurück und Merge-Chaos.
```

## Critical Files

**Cherry-Pick-Hotspots (manuelle Konflikt-Resolution nötig):**
- `C:\Projekte\AgentenPipelineDashboard\src\components\sessions\SessionTerminal.tsx`
- `C:\Projekte\AgentenPipelineDashboard\src\components\library\LibraryView.tsx`
- `C:\Projekte\AgentenPipelineDashboard\src\components\sessions\SessionStatusBar.tsx`
- `C:\Projekte\AgentenPipelineDashboard\src\components\kanban\KanbanBoard.tsx`
- `C:\Projekte\AgentenPipelineDashboard\src\components\kanban\IssueComments.tsx`
- `C:\Projekte\AgentenPipelineDashboard\CHANGELOG.md`
- `C:\Projekte\AgentenPipelineDashboard\tasks\lessons.md`
- `C:\Projekte\AgentenPipelineDashboard\tasks\todo.md`

**Release-Files (Version-Bumps):**
- `C:\Projekte\AgentenPipelineDashboard\package.json` (Zeile 4)
- `C:\Projekte\AgentenPipelineDashboard\src-tauri\Cargo.toml` (Zeile 3)
- `C:\Projekte\AgentenPipelineDashboard\src-tauri\tauri.conf.json` (Zeile 4)
- `C:\Projekte\AgentenPipelineDashboard\src-tauri\Cargo.lock` (via `cargo check` automatisch)

**Wiederzuverwendende Utilities:**
- `src/store/uiStore.ts` — `isPinTab` export (Zeile 40), für `dd755c9` Tab-Filter-Logik
- `src/store/configDiscoveryStore.ts` — `useConfigDiscoveryStore` (Zeile 215), Felder `projectPath`/`projectConfig`/`favoriteConfigs`
- `src/hooks/useNowTick.ts` — `useNowTick` (Zeile 40), für StatusBar active/idle-Tick
- `src/components/sessions/activityLevel.ts` — `getActivityLevel` (Zeile 5), teilt active/idle anhand `lastOutputAt`
- `src/utils/errorLogger.ts` — `logError` für konsistente Error-Surface
- `src/components/sessions/tauri-mock.ts` — Playwright-IPC-Mock aus `c5e6602`

**CI/Updater-Infrastruktur (unverändert):**
- `.github/workflows/release.yml` — triggert auf `v*`-Tag-Push
- `src-tauri/tauri.conf.json:48-55` — Updater-Config mit Pubkey
- `src/hooks/useAutoUpdate.ts` — Update-Polling (15s Delay, 30min Intervall)

## Verification

Nach jeder Phase Build-Gate. Am Ende der Phase E3 und vor Tag:

```
# Frontend
npx tsc --noEmit
npm run lint
npm run test
npm run build

# Backend
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml

# E2E Smoke (wenn Browser/Playwright verfügbar)
npm run test:e2e

# Manual Smoke
npm run tauri dev
#  → prüfen: Kanban-V2-Board (verschiedene Repos), Tab-Filter bei leerem Projekt,
#    inline Update-Button, StatusBar idle/active, Grid-Chip pro Zelle,
#    Terminal-Paste ohne Duplikat, CLAUDE.md in Linked-Worktree
```

**Post-Release-Verifikation:**
- GitHub-Release `v1.6.26` existiert mit NSIS-Installer + `latest.json`
- `useAutoUpdate`-Polling auf einer v1.6.25-Installation zeigt Update-Notification
- Download + Relaunch führt zu v1.6.26 (Signatur-Check läuft grün)

## Rollback

Wenn Phase E3 im Sand verläuft (unlösbare Konflikte, grundlegende Kanban-V2-Fehler):

```
git checkout master
git branch -D v1.6.26-reconcile local-split
# Master ist unverändert — Backup-Branches sind alle da
# Neustart mit Weg 2 (volle Integration) erwägen
```

Wenn v1.6.26 released aber kaputt:
1. `gh release delete v1.6.26 --yes`
2. `git push origin :v1.6.26` (Remote-Tag weg)
3. `git tag -d v1.6.26` (Local-Tag weg)
4. Fix commiten, neu taggen, push

Für den Fall, dass Force-Push auf master (falls doch ohne PR) schiefgeht:
```
git bundle unbundle reports/origin-master-pre-reconcile.bundle
git push --force-with-lease origin <recovered-sha>:master
```

## Agenten-Bilanz

Über alle Phasen (inkl. bereits durchgeführter Analyse):

| Phase | Agent | Zweck |
|---|---|---|
| Phase 1 Analyse | E1 Explore | Kategorisierung der 32 Remote-Commits ✅ |
| Phase 1 Analyse | E2 Explore | Local Release-Readiness ✅ |
| Phase 1 Analyse | E3 Explore | Release-Prozess & Tauri-Updater ✅ |
| Phase 2 Design | P1 Plan | Weg „Verwerfen" ausdesignen ✅ |
| Phase 2 Design | P2 Plan | Weg „Voll-Integration" ausdesignen ✅ |
| Phase 2 Design | P3 Plan | Weg „Pragmatisch" ausdesignen ✅ |
| Exec E1 | A7 general-purpose | Pre-Flight-Validator |
| Exec E2 | A8 general-purpose | WIP-Splitter |
| Exec E3 | A9 general-purpose | Konflikt-Resolver / Cherry-Picker |
| Exec E4–E5 | A10 general-purpose | Release-Executor (Bumps, CHANGELOG, Tag, Push, PR) |

**Gesamt: 10 Agenten.** Die ersten 6 haben die Faktenbasis + drei Pläne geliefert. Die letzten 4 führen den gewählten Weg 3 mit WIP-Split aus.
