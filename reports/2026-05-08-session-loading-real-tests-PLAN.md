# Session-Loading Real Test Coverage — PLAN

**Datum:** 2026-05-08
**Branch-Vorschlag:** `test/issue-pack-session-loading-real-coverage`
**Phase-Style:** GSD-Disziplin ohne `.planning/`-Bootstrap (User-Entscheidung 2026-05-08)
**Owner:** hovOG
**Geschätzter Aufwand:** 4-6 Personentage über 2-3 Wellen

---

## 0. Phase Goal

Echte (nicht-mock) Regression-Tests fuer den **gesamten Session-Loading-Pfad** schaffen, sodass die folgenden Bugs **dauerhaft** geloest sind — d.h. ein Test bricht, wenn der Fix entfernt wird, nicht erst bei manueller QA:

| # | Bug | Status | Bewachender Test |
|---|-----|--------|------------------|
| 1 | m2-Ghost-Session Dedup (`#256`, fix `e8f5eea`) | Fix da, Test mock-haltig | `sessionRestoreSync.integration.test.ts` |
| 2 | Discovery-Race Closest-Timestamp (`#257`, fix `b4dc61b`) | Fix da, Test mock-haltig | `useSessionEvents.integration.test.ts` |
| 3 | `handleNewSessionFromDefaults` (Commit `0c48922`) | **Komplett ungetestet** | `useSessionCreation.integration.test.ts` |
| 4 | Issue `#209` claudeSessionId UUID-Validation | Offen | `settingsStore.migration.integration.test.ts` |
| 5 | Issue `#215` sessionRestoreSync layoutMode/gridFolders | Offen | `sessionRestoreSync.integration.test.ts` |
| 6 | `App.tsx:38-45` Promise-Chain-Race | Offen, niedrige Severity | `App.integration.test.ts` |

### Out-of-Scope

- Performance-Tests, Visual-Regression, Coverage-Pyramide-Bump.
- Browser-Fallback-Code-Pfade (User: Desktop-only, kein Browser-Use).
- E2E-Test fuer Pipeline-Engine, Library, Editor (separate Phasen).

### Success Statement (Goal-Backward)

> "Wenn jemand `git revert e8f5eea` ausfuehrt und `npm run test:integration` startet, bricht ein Test in `sessionRestoreSync.integration.test.ts`."
> "Wenn jemand das `dedupRestorableSessions`-Helper kommentiert, bricht der gleiche Test."
> "Wenn jemand `pickBestHistoryMatch` durch `history[0]` ersetzt, bricht ein Test in `useSessionEvents.integration.test.ts`."

Wenn diese drei Aussagen wahr sind, ist die Phase done.

---

## 1. Architektur — Drei-Layer-Test-Pyramide nach Risiko

```
                        ▲ Confidence
                        │
                  ┌─────┴─────┐
                  │   E2E     │   Layer C — Tauri WebDriver + Playwright
                  │  (Wave 5+6)│   gegen die GEBAUTE Desktop-App
                  └───────────┘   Echtes PTY, echte Filesystem-Calls
                  ┌─────────────┐
                  │ Integration │   Layer B — Vitest mit eigener Config
                  │ (Wave 2+3)  │   Echte Zustand-Stores, IPC-Stub via mockIPC,
                  └─────────────┘   gegen Node-fs-backed Tempdir
                ┌─────────────────┐
                │  Rust Integration│  Layer A — cargo test --test session_discovery
                │    (Wave 0+1)    │  Echte Filesystem-Fixtures via tempfile,
                └─────────────────┘  echte JSONL-Files, kein Mock
                        │
                        ▼ Cost
```

### Hard Constraints (User-Vorgabe 2026-05-08)

1. **NIEMALS** `vi.mock("@tauri-apps/api/core")` in neuen Tests
2. **NIEMALS** `vi.mock("../store/sessionStore")` oder analog fuer settingsStore/uiStore
3. **NIEMALS** `vi.mock("@tauri-apps/api/event")` opt-in im neuen Setup-File (alte Tests bleiben mit dem globalen Mock laufen)
4. Real-Stores bedeutet: Tests importieren denselben Singleton wie Production. `beforeEach` muss Store-State explizit zuruecksetzen.
5. IPC-Stub auf `mockIPC`-Ebene ist erlaubt — er ersetzt den Rust-Prozess durch eine Node-Funktion, die echte Filesystem-Operationen ausfuehrt. Damit ist die Test-Boundary die **IPC-Wire**, nicht die JS-Modul-Boundary.

### Cost-vs-Confidence-Matrix

| Layer | Was bewacht | Setup-Kosten | Run-Kosten | Wer-greift-zuerst |
|-------|------------|--------------|------------|-------------------|
| A — Rust | JSONL-Parse, Slug-Encoding, Sort-Order, Edge-Cases (empty, korrupt, gross) | 0.5 PT (Wave 0 Refactor + tempfile-Helper) | <1s pro Suite | Backend-Bugs (#256-Discovery-Layer, Slug-Kollision, OOM-Fix) |
| B — Frontend Integration | End-to-end Restore-Flow, Race-Conditions, Migration, Toast-UX | 1 PT (Wave 2 Setup) | 5-15s | UI-Logic-Bugs (#256/#257-Frontend-Side, #209, #215, handleNewSessionFromDefaults) |
| C — E2E | Realer User-Flow gegen built App, Cross-Window-State, PTY-Spawn | 2-3 PT (tauri-driver-Setup) | 30-90s pro Test | Komposition-Bugs (3 Cards in m2 → 3 echte UUIDs) |

---

## 2. Pattern-Map — Anschluss an bestehenden Code

| Neue Datei/Funktion | Closest analog | Adaption noetig |
|---------------------|----------------|-----------------|
| `src-tauri/tests/session_discovery.rs` | Inline-Tests in `pipeline/parser.rs` (`#[cfg(test)]`) | Erstes File in `tests/`-Dir → Integration-Style |
| `parse_session_jsonl_str(content, sid)` (neu) | `parse_session_jsonl(path, sid)` (existing, line 196) | Pure Variante extrahieren, Wrapper haelt I/O |
| `scan_sessions_for_project_in(root, folder)` | `scan_sessions_for_project(folder)` (line 312) | Inject `claude_projects_root` Param |
| `vitest.config.integration.ts` | `vitest.config.ts` (existing) | Neue Setup-File, andere `include`-Pattern |
| `src/test/setup.integration.ts` | `src/test/setup.ts` (existing) | OHNE `vi.mock("@tauri-apps/api/event")` |
| `src/test/mockTauriIPC.ts` | `tauriStorage.test.ts` line 4-12 (mock-style) | NEU: Real-IPC-Backend-Builder |
| `*.integration.test.ts` | `useSessionEvents.test.ts` (existing) | Suffix-Konvention, andere Setup-File |
| `e2e/playwright.config.ts` | (keine — `@playwright/test` nur installiert) | NEU |
| `e2e/*.spec.ts` | (keine bestehende Test) | NEU mit `tauri-driver` |

`tempfile = "3"` ist bereits dev-dep, `mockIPC` wird in 9 Dateien bereits genutzt, `@playwright/test` ist installiert. **Kein neuer Dependency-Beschluss noetig fuer Layer A+B.** Layer C braucht: `tauri-driver` (Cargo-CLI-Tool).

---

## 3. Task-Breakdown nach Wellen

Tasks sind atomar (1-3 Stunden), commit-pro-Task, mergebar einzeln. Abhaengigkeiten in `[← T-Nr]` notiert.

### Wave 0 — Refactor-Foundation (PFLICHT, blocker fuer Wave 1)

| Task | Datei | Beschreibung | Akzeptanz |
|------|-------|--------------|-----------|
| **R0.1** | `src-tauri/src/session/file_reader.rs` | Extract pure `parse_session_jsonl_str(content: &str, session_id: &str) -> Option<ClaudeSessionSummary>`. Wrapper `parse_session_jsonl(path, sid)` ruft `read_to_string` und delegiert. | `cargo test` gruen (alle bestehenden Tests). Funktion ist `pub(crate)`. |
| **R0.2** | `src-tauri/src/session/file_reader.rs` | Extract pure `find_project_dir_in(claude_projects_root: &Path, folder: &str) -> Option<PathBuf>`. Wrapper bleibt API. | `cargo test` gruen. Wrapper-Diff = nur Aufruf-Zeile. |
| **R0.3** | `src-tauri/src/session/file_reader.rs` | Extract pure `scan_sessions_for_project_in(claude_projects_root: &Path, folder: &str) -> Result<Vec<...>, ADPError>`. Wrapper aktualisiert. | `cargo test` gruen. `scan_claude_sessions`-Tauri-Command unveraendert. |

**Wave 0 Verification-Gate:**
- `cd src-tauri && cargo check && cargo clippy -- -D warnings && cargo test`
- `npm run test` (kein Frontend-Behavior-Change)
- Diff-Review: nur Function-Extraction, kein Logic-Change

---

### Wave 1 — Layer A: Rust Integration Tests [← Wave 0]

| Task | Datei | Beschreibung | Akzeptanz |
|------|-------|--------------|-----------|
| **A1.1** | `src-tauri/tests/session_discovery.rs` (neu) | Test-Scaffold: `setup_fake_projects_root() -> TempDir`, Helper `write_jsonl_fixture(dir, uuid, content) -> PathBuf`, Helper `make_session_line(role, ts, text) -> String` (gibt JSONL-formatierte Linie zurueck). | Datei kompiliert, ein Smoke-Test `creates_temp_projects_root` ist gruen. |
| **A1.2** | `src-tauri/tests/session_discovery.rs` | 6 Tests fuer `parse_session_jsonl_str`: empty, single corrupted line, no user turns, valid timestamp, invalid timestamp, multiple turns mit Title-Extraction. | Alle 6 Tests gruen. Coverage-Befund: alle Branches in `parse_session_jsonl_str` getroffen. |
| **A1.3** | `src-tauri/tests/session_discovery.rs` | 4 Tests fuer `find_project_dir_in`: exakter Slug-Match, case-insensitive Match, Slug nicht gefunden → None, Projects-Dir fehlt → None. | Alle 4 Tests gruen. |
| **A1.4** | `src-tauri/tests/session_discovery.rs` | 3 Tests fuer `scan_sessions_for_project_in`: leeres Dir → empty Vec, drei Sessions mit unterschiedlichen `started_at` → DESC-sortiert, ein gueltiges + ein korruptes JSONL → nur gueltiges in Result. | Alle 3 Tests gruen. |
| **A1.5** | `src-tauri/tests/session_discovery.rs` | **m2-Bug-Repro auf Rust-Layer**: drei Sessions mit `started_at` 100ms/200ms/300ms vor `now`, alle im selben Folder. Verify: alle drei werden zurueckgegeben mit korrekten distinct UUIDs (Discovery-Layer-Korrektheit auf Backend-Seite). | Test gruen. Reproduziert die Datenlage des Original-Bugs ohne JS-Code. |
| **A1.6** | `src-tauri/src/session/file_reader.rs` + `tests/session_discovery.rs` | **JSONL-Size-Cap implementieren** (`metadata.len() > 100_000_000` → return None) UND einen Test mit grosser File (50MB Garbage-Content → schnell None ohne OOM). | Test laeuft <2s, kein OOM. Cap-Konstante als `MAX_JSONL_SIZE_BYTES`. |

**Wave 1 Verification-Gate:**
- `cd src-tauri && cargo test --test session_discovery` → alle 16 Tests gruen
- Wave-Mutator: alle Tests einmalig mit `RUST_BACKTRACE=1` durchlaufen
- **Goal-Backward-Check:** Kommentiere die Closest-Timestamp-Sortierung in `scan_sessions_for_project_in` aus → A1.4 muss brechen.

---

### Wave 2 — Layer B: Vitest Integration Setup (parallel zu Wave 1)

| Task | Datei | Beschreibung | Akzeptanz |
|------|-------|--------------|-----------|
| **B2.1** | `vitest.config.integration.ts` (neu) | Eigene Config: `include: ["src/**/*.integration.test.{ts,tsx}"]`, `setupFiles: ["./src/test/setup.integration.ts"]`, `environment: "jsdom"`. Coverage NICHT erzwingen (separate Suite). | `npm run test:integration` zeigt "no tests" — laeuft also. |
| **B2.2** | `src/test/setup.integration.ts` (neu) | Setup OHNE `vi.mock("@tauri-apps/api/event")`, OHNE `vi.mock("@tauri-apps/api/core")`. Polyfills fuer `crypto.randomUUID` + `PointerEvent` werden uebernommen. | Setup laedt, Errors falls jemand `vi.mock` global anwendet. |
| **B2.3** | `src/test/mockTauriIPC.ts` (neu) | Helper `installRealIPC({ projectsRoot: string })` der `mockIPC` mit einem Handler verkabelt, der `scan_claude_sessions` und `create_session` gegen Node-fs (`fs.promises.readdir/readFile`) auf `projectsRoot` ausfuehrt. Plus `installEventEmitter()` der `emit("session-status", payload)` per Tauri-Event ueber `__TAURI_INTERNALS__.callbacks` triggert. | Helpers exportieren, Smoke-Test in `mockTauriIPC.test.ts`: `installRealIPC` → `invoke("scan_claude_sessions", { folder })` returns Array. |
| **B2.4** | `package.json` | Neuer Script `"test:integration": "vitest run -c vitest.config.integration.ts"` und `"test:all": "npm run test && npm run test:integration"`. | `npm run test:integration` laeuft. |
| **B2.5** | `.husky/pre-commit` (existing) + lint-staged | `*.integration.test.ts` zur Vitest-Pre-Commit-Trigger hinzufuegen. | Edit zu existing `*.test.ts`-Pattern in `lint-staged.config.json` (oder package.json). |

**Wave 2 Verification-Gate:**
- `npm run test:integration` exit 0 (auch wenn keine Tests da)
- `npm run test:all` ruft beide Suites auf
- Pre-commit-Hook updated

---

### Wave 3 — Layer B: Real Tests fuer alle Bugs [← Wave 2]

Reihenfolge nach Risiko-Priorisierung. Jeder Test ist eine eigene Datei, kann parallel implementiert werden.

| Task | Datei (neu) | Was getestet | Akzeptanz |
|------|-------------|--------------|-----------|
| **B3.1** | `src/store/sessionRestoreSync.integration.test.ts` | Realer settingsStore + sessionStore, `initSessionRestoreSync()` aktiv. Bauen drei live Sessions mit gleicher claudeSessionId. Erwartet: nur einer landet im persistierten Snapshot. **Plus** Issue #215-Repro: Aendere `layoutMode` von "single" → "grid" → erwartet Persist-Write triggered. | Beide Tests laufen, beide brechen wenn Fix #256 entfernt wird (m2-Test) bzw. wenn `lastJson` nur `sessions` keyt (Issue #215). |
| **B3.2** | `src/components/sessions/hooks/useSessionEvents.integration.test.ts` | Realer sessionStore. Drive 3 `session-status: "running"` Events fuer drei sessionIds im selben Folder. `mockTauriIPC` returns 3 JSONL-Fixtures mit `started_at` `now-300/now-200/now-100`. Erwartet: 3 distinct claudeSessionIds im Store. | Test gruen. Mutator: ersetze `pickBestHistoryMatch` durch `history[0]` → Test bricht. |
| **B3.3** | `src/components/sessions/hooks/useSessionCreation.integration.test.ts` | Real-Stores. Vier Pfade fuer `handleNewSessionFromDefaults`: (a) defaultProjectPath gesetzt → Spawn mit korrektem Folder/Shell, (b) defaultProjectPath leer → `open()`-Picker (Tauri-Dialog gestubt) returns Pfad → Spawn + Toast-Nudge erscheint, (c) Picker returns null → kein Spawn, (d) `create_session` wirft → Error-Toast in uiStore. | Alle 4 Tests gruen. Mutator: entferne Toast-Nudge → (b) bricht. |
| **B3.4** | `src/hooks/useSessionRestore.integration.test.ts` | Real-Stores. settingsStore mit `sessionRestore: { sessions: [3-Eintraege-mit-derselben-claudeSessionId-aus-stale-Format] }`. Erwartet: Nach `restoreSessions()` sind 3 distinct sessions in sessionStore mit 3 verschiedenen UUIDs (claim-set kickt). | Test gruen. Mutator: entferne `claimedClaudeIds`-Set → Test bricht. |
| **B3.5** | `src/store/settingsStore.migration.integration.test.ts` | Realer settingsStore. Pre-seed localStorage mit Stale-Format-`agenticexplorer-settings` JSON, das `claudeSessionId: "not-a-uuid"` enthaelt. Erwartet: Nach App-Hydration ist die invalide UUID auf `undefined` gesetzt (oder Eintrag entfernt). | Test bricht **vor** Issue #209 Fix, gruen **nach** Fix. |
| **B3.6** | `src/App.integration.test.ts` | Render `<App />`, mocke `@tauri-apps/api/window` so dass `getCurrentWindow().onCloseRequested(...)` lange resolved. Cleanup-Trigger schnell. Erwartet: `unlistenClose` wird trotzdem registriert (kein Race). | Test bricht **vor** Promise-Chain-Fix, gruen **nach** Fix. |

**Wave 3 Verification-Gate:**
- `npm run test:integration` zeigt 6+ neue Test-Dateien, alle gruen
- Mutator-Walk: jeder Bug-Fix einmal lokal entfernen (`git stash`-Trick) und Test muss brechen
- Zahlen-Check: bei m2-Test mit 3 Sessions → 3 verschiedene UUIDs

---

### Wave 4 — Bug Fixes (TDD-style: rot zuerst, gruen danach) [← Wave 3]

| Task | Datei | Was geaendert | Verifizier-Test |
|------|-------|----------------|------------------|
| **F4.1** | `src/store/sessionRestoreSync.ts:79-81` | `lastJson = JSON.stringify({ sessions, layoutMode: state.layoutMode, gridFolders })` | B3.1 (Issue #215-Teil) bricht ohne Fix, gruen mit Fix |
| **F4.2a** | `src/store/settingsStore.ts:609-611` | `validateSessionRestore(p.sessionRestore)`-Helper analog zu `validatePinnedDocs`. Filtert Eintraege wo `claudeSessionId` kein UUID-v4 matcht. | B3.5 bricht ohne Fix, gruen mit Fix |
| **F4.2b** | `src/hooks/useSessionRestore.ts:53-65` | Pre-Invoke-Check: wenn `entry.claudeSessionId` nicht `UUID_V4_RE.test(...)` matcht, `resumeSessionId = undefined` setzen + `logWarn`. | gleicher B3.5-Test, Defense-in-Depth |
| **F4.3** | `src/App.tsx:38-45` | Promise-Chain mit `return getCurrentWindow().onCloseRequested(...).then(...)` — outer Chain awaitet jetzt | B3.6 bricht ohne Fix, gruen mit Fix |

**Wave 4 Verification-Gate:**
- `git stash` jeder Fix einzeln → entsprechender Test in `*.integration.test.ts` ist rot
- `git stash pop` → Test gruen
- `npm run test:all && cd src-tauri && cargo test` → alle gruen
- `npx tsc --noEmit && npm run lint` → keine Warnings

---

### Wave 5 — Layer C: E2E Setup [parallel zu Wave 0-4]

| Task | Datei | Beschreibung | Akzeptanz |
|------|-------|--------------|-----------|
| **E5.1** | `package.json` + `e2e/README.md` | Add `tauri-driver` as devDep (CLI tool), document Edge-WebDriver-Version-Pin in README. | `npm install` ohne Fehler. README erklaert `npm run e2e:driver`. |
| **E5.2** | `playwright.config.ts` (neu, root) | Playwright-Config: WebDriver-Endpoint `http://localhost:4444`, Tauri-App-Path `./src-tauri/target/release/agentic-dashboard.exe`, Test-Match `e2e/**/*.spec.ts`. | `npx playwright test --list` zeigt Tests aus `e2e/`. |
| **E5.3** | `e2e/app-boot.spec.ts` (neu) | Smoke-Test: launches built App, asserts main window visible, asserts SessionList rendert "Neue Session"-Button. | `npm run e2e` (Build → Driver → Tests) gruen. <30s. |

**Wave 5 Verification-Gate:**
- README dokumentiert Setup-Schritte fuer Edge-WebDriver
- Smoke-Test laeuft auf Windows lokal

---

### Wave 6 — Layer C: E2E Critical Paths [← Wave 5]

| Task | Datei | Beschreibung | Akzeptanz |
|------|-------|--------------|-----------|
| **E6.1** | `e2e/session-resume-three.spec.ts` | Set up tempdir mit 3 fake Sessions im selben Folder unter `~/.claude/projects/<test-slug>/`. Boot App → restore-flow laeuft → 3 Cards sichtbar mit 3 distinct claudeSessionIds. | E2E-Repro des m2-Bugs gegen die echte App. <60s. |
| **E6.2** | `e2e/handle-new-session-defaults.spec.ts` | Pre-seed settings.json mit `defaultProjectPath`. App boot → klick "Neue Session" → erwartet 1 Card + Terminal-Toolbar zeigt Pfad. | <30s. |
| **E6.3** | `e2e/settings-corruption.spec.ts` | Pre-seed settings.json mit 3 Eintraegen alle gleicher claudeSessionId AND einer mit invalid UUID-Format. App boot → erwartet 1 valide restored Session, keine Crash. | <30s. Repro fuer Issue #209 + #256-stale-data. |

**Wave 6 Verification-Gate:**
- Alle 3 E2E-Tests gruen lokal
- CI-Workflow `.github/workflows/e2e.yml` (neu) mit Matrix `windows-latest`
- E2E nur in `pre-merge`-Stage, nicht auf jedem Push

---

### Wave 7 — Cleanup [parallel zu Wave 4-6]

| Task | Datei | Beschreibung |
|------|-------|--------------|
| **C7.1** | `src/store/uiStore.ts:8-23` | Drop `makeLocalStorage`-Fallback (Desktop-only Dead-Code). Direkt `localStorage`. |
| **C7.2** | `src/App.tsx:42-44` | Drop `beforeunload`-Catch-Branch (Desktop-only Dead-Code). |
| **C7.3** | `src/utils/ids.ts` (neu) | Extract `generateSessionId()`. Aufrufer in `useSessionRestore.ts:14-16` und `useSessionCreation.ts:11-13` ersetzen. |

**Wave 7 Verification-Gate:**
- `npm run test:all` gruen
- Diff-Review: rein technische Cleanups, kein Behavior-Change

---

### Wave 8 — Documentation [← Wave 4]

| Task | Datei | Inhalt |
|------|-------|--------|
| **D8.1** | `tasks/lessons.md` | Neuer Eintrag `2026-05-08 — Desktop-only Threat-Model + Real-Tests`. Drei Regeln: (1) Lokale Files = Robustheit-Konzern, kein Attack-Vector. (2) `vi.mock("@tauri-apps/api/core")` ist Anti-Pattern fuer Risiko-kritische Pfade. (3) Test-Layer nach Risiko, nicht nach Einfachheit. |
| **D8.2** | `CLAUDE.md` | Neue Sektion "Test-Pyramide" mit Verweisen auf Layer A/B/C, Naming-Konvention `*.integration.test.ts`, npm-Scripts. |
| **D8.3** | `Softwareprozess/history/2026-05-08-session-loading-real-tests-PLAN.md` | Diesen Plan nach Wave-7 Abschluss archivieren. Zeitlose Regeln vorher in CLAUDE.md migriert. |

---

## 4. Wave-Diagramm + Kritischer Pfad

```
        Wave 0 (R0.1-R0.3)
              │
              ▼
   ┌─── Wave 1 (A1.1-A1.6) ─────────────┐
   │                                     │
   ▼                                     │
Wave 2 (B2.1-B2.5)  ◄─── parallel ───────┤
   │                                     │
   ▼                                     │
Wave 3 (B3.1-B3.6)                       │
   │                                     │
   ▼                                     │
Wave 4 (F4.1-F4.3) ───┐                  │
                      │                  │
                      ▼                  │
                  Wave 7 (C7.1-C7.3)  ◄──┘
                      │
                      ▼
                  Wave 8 (D8.1-D8.3)


   Wave 5 (E5.1-E5.3) ─── parallel zu allem oben ───┐
              │                                       │
              ▼                                       │
   Wave 6 (E6.1-E6.3)  ─── kann nach Wave 4 mergen ───┘
```

**Kritischer Pfad** (laengste Sequenz mit Dependencies): R0 → A1 → B3 → F4 → C7 → D8 = ~3 PT
**Parallelisierbar:** B2 + B3.x untereinander, E5 + E6 unabhaengig

---

## 5. Risk Register

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|---------------------|--------|------------|
| `mockTauriIPC` Handler driften vom Rust-Verhalten ab | Medium | Hoch | Pro Handler ein Snapshot-Test der den Handler-Output mit Rust-Side-Fixture (JSON) vergleicht. Alternativ: gleicher JSONL-Fixture-Builder in Rust und JS, Snapshot-File geteilt. |
| `tauri-driver` auf Windows + Edge-Version-Pinning bricht regelmaessig | Hoch | Medium | E2E nur als optional CI-Stage, nicht blocking auf jedem Push. README dokumentiert das Update-Ritual. |
| Wave-0-Refactor aendert versehentlich Verhalten | Niedrig | Hoch | Mutator-Walk: vor Refactor-Commit `cargo test` mit aktuellem Code laufen lassen, Output speichern. Nach Refactor: identischer Output. |
| Real-Stores in Tests bringen Cross-Test-Pollution | Hoch | Medium | `beforeEach` muss `useSessionStore.setState(initial)` + `useSettingsStore.persist.clearStorage()` aufrufen. In `setup.integration.ts` als Helper definieren. |
| Coverage-Schwellen brechen weil neue Code-Pfade in Refactor-Tasks ungetestet sind | Niedrig | Niedrig | Refactor-Tasks behalten reine Function-Extraction; bestehende Tests decken neuen pure-Path automatisch. |
| User-Konflikte in `package.json`/`vitest.config*` zwischen Wellen | Medium | Niedrig | Wave 0/1 → Cargo-only, Wave 2 → ein-PR fuer Vitest-Setup. Klar getrennt nach File-Touch. |
| E2E-Tests sind flaky (Timing-Issues) | Medium | Medium | `await expect(locator).toBeVisible({ timeout: 10000 })` statt fixed sleep. Retry-Strategie in playwright.config.ts. |

---

## 6. Plan-Quality Self-Audit

Selbst-Pruefung nach Goal-Backward (analog `gsd-plan-checker`):

| Frage | Antwort |
|-------|---------|
| Reicht der Plan, das Goal zu erreichen? | Ja — alle 6 nominierten Bugs haben mindestens einen bewachenden Test in Wave 1/3/6. |
| Sind die Tasks klein genug fuer atomare Commits? | Ja — jeder Task touche 1-3 Files, 50-150 Zeilen. |
| Sind Akzeptanzkriterien testbar? | Ja — jeder Task hat `cargo test`/`npm run test:integration`/`npm run e2e` als Gate. |
| Ist der "Mutator-Walk" als Verification ausreichend? | Ja — pro Bug wird der Fix einmal entfernt und der Test MUSS brechen. Das ist der goldene Standard. |
| Gibt es Tasks ohne klare Definition-of-Done? | Nein — alle Akzeptanz-Cells sind binary (gruen/rot). |
| Sind Abhaengigkeiten korrekt? | R0 blockt A1, B2 blockt B3, B3 blockt F4 (TDD-Reihenfolge), C7+D8 koennen jederzeit nach F4 starten. E5+E6 sind komplett parallel. |
| Wurden alle 6 Bugs adressiert? | #256 → B3.1, #257 → B3.2, handleNewSessionFromDefaults → B3.3, #209 → B3.5+F4.2, #215 → B3.1+F4.1, App.tsx-Race → B3.6+F4.3. ✅ |
| Was wurde NICHT abgedeckt, ist das OK? | Slug-Kollision, JSONL-Concurrent-Read, Folder-Rename — sind Tech-Debt-Issues mit niedrigerer Severity, im Review als Follow-up dokumentiert. JSONL-Size-Cap ist im Plan (A1.6). Akzeptiert. |
| Ist der Aufwand realistisch? | 4-6 PT bei Solo-Arbeit. Mit Parallelisierung (E5+E6 + Wave 7 zu Wave 4) auf 3 PT komprimierbar. Realistisch. |
| Wo verstoesst der Plan gegen Lessons-Learned? | Keine Verstoesse erkennbar. Konkret: lessons 2026-04-02 Ursache 6 ("Tests nach Risiko priorisieren") — Plan ist genau das. lessons 2026-04-05 ("Sprint-Plan-Dokumente sind Artefakte") — D8.3 archiviert. lessons 2026-03-30 ("Safety-Features brauchen Tests") — alle Tests sind Mutator-checked. |

---

## 7. Open Questions (vor Wave-Start klaeren)

1. **Soll die JSONL-Size-Cap-Konstante (`MAX_JSONL_SIZE_BYTES`) konfigurierbar sein?** — Vorschlag: hardcoded 100 MB. Begruendung: kein User-Pfad braucht das jemals zu aendern, in 5 Jahren noch nicht relevant.
2. **Brauchen wir `tauri-driver` jetzt oder kann Wave 5+6 in einen separaten Sprint?** — Empfehlung: Wave 5+6 als Bonus-Track. Wave 0-4 + 7 + 8 alleine geben 95% Confidence. E2E ist Polish.
3. **Soll der `mockTauriIPC`-Handler die echte Rust-Implementierung als Reference nutzen (z.B. via `napi`-Binding)?** — Nein. Zu komplex. Snapshot-basierter Contract-Test reicht.
4. **Wo landet `MAX_JSONL_SIZE_BYTES` als Konstante** — `file_reader.rs` oben oder `src-tauri/src/util.rs`? Vorschlag: `file_reader.rs`-lokal.
5. **Welche UUID-v4-Regex fuer Issue #209?** — Strict: `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`. Lower-Case-only weil Claude CLI lower-case schreibt.

---

## 8. Anhang — Beispiel-Test-Code (Konvention)

### Layer A: `src-tauri/tests/session_discovery.rs` (Skeleton)

```rust
// Integration-Test fuer Session-Discovery. Nutzt nur public API von file_reader.

use agentic_dashboard::session::file_reader::{
    parse_session_jsonl_str, scan_sessions_for_project_in,
};
use std::fs;
use tempfile::TempDir;

fn fake_jsonl_with_user_turn(text: &str, started_at: &str) -> String {
    format!(
        r#"{{"role":"user","timestamp":"{}","message":{{"content":[{{"type":"text","text":"{}"}}]}}}}"#,
        started_at, text
    )
}

#[test]
fn parse_session_jsonl_str_returns_none_for_empty() {
    assert!(parse_session_jsonl_str("", "uuid-1").is_none());
}

#[test]
fn parse_session_jsonl_str_skips_corrupted_lines() {
    let content = format!(
        "{}\n{{ this is broken json }}\n{}",
        fake_jsonl_with_user_turn("hi", "2026-05-08T10:00:00Z"),
        fake_jsonl_with_user_turn("bye", "2026-05-08T10:01:00Z"),
    );
    let result = parse_session_jsonl_str(&content, "uuid-1").unwrap();
    assert_eq!(result.user_turns, 2);
}

#[test]
fn scan_sessions_for_project_in_sorts_desc_by_started_at() {
    let tmp = TempDir::new().unwrap();
    let project_dir = tmp.path().join("projects").join("C--test-proj");
    fs::create_dir_all(&project_dir).unwrap();

    fs::write(
        project_dir.join("uuid-old.jsonl"),
        fake_jsonl_with_user_turn("alt", "2026-05-08T08:00:00Z"),
    ).unwrap();
    fs::write(
        project_dir.join("uuid-new.jsonl"),
        fake_jsonl_with_user_turn("neu", "2026-05-08T10:00:00Z"),
    ).unwrap();

    let result = scan_sessions_for_project_in(tmp.path(), r"C:\test\proj").unwrap();
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].session_id, "uuid-new");
    assert_eq!(result[1].session_id, "uuid-old");
}
```

### Layer B: `src/components/sessions/hooks/useSessionEvents.integration.test.ts` (Skeleton)

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useSessionEvents } from "./useSessionEvents";
import { useSessionStore } from "../../../store/sessionStore";
import { installRealIPC, emitTauriEvent, clearMockIPC } from "../../../test/mockTauriIPC";

describe("useSessionEvents — m2-race integration", () => {
  let projectsRoot: string;

  beforeEach(() => {
    // Real tempdir mit 3 fake jsonl files im selben "Folder"
    projectsRoot = mkdtempSync(join(tmpdir(), "claude-projects-"));
    const projectDir = join(projectsRoot, "C--test-m2");
    require("node:fs").mkdirSync(projectDir, { recursive: true });

    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const startedAt = new Date(now - (300 - i * 100)).toISOString();
      writeFileSync(
        join(projectDir, `uuid-${i}.jsonl`),
        JSON.stringify({ role: "user", timestamp: startedAt, message: { content: [{ type: "text", text: "hi" }] } }),
      );
    }

    installRealIPC({ projectsRoot });

    // Reset real stores
    useSessionStore.setState({ sessions: [], activeSessionId: null, gridSessionIds: [], layoutMode: "single" });
  });

  afterEach(() => {
    clearMockIPC();
    rmSync(projectsRoot, { recursive: true, force: true });
  });

  it("assigns 3 distinct claudeSessionIds when 3 sessions spawn in same folder", async () => {
    renderHook(() => useSessionEvents());

    const baseTime = Date.now();
    for (let i = 0; i < 3; i++) {
      useSessionStore.getState().addSession({
        id: `s${i}`,
        title: "m2",
        folder: "C:\\test\\m2",
        shell: "powershell",
        // createdAt closer to uuid-i's started_at than to others
      });
      await emitTauriEvent("session-status", { id: `s${i}`, status: "running" });
    }

    // Wait for discovery loop to complete (3 retries × 3000ms is too long for a test —
    // helper accelerates DISCOVERY_RETRY_DELAY_MS for tests via vi.useFakeTimers())
    await vi.advanceTimersByTimeAsync(15_000);

    const sessions = useSessionStore.getState().sessions;
    const uuids = sessions.map(s => s.claudeSessionId).sort();
    expect(uuids).toEqual(["uuid-0", "uuid-1", "uuid-2"]);
    expect(new Set(uuids).size).toBe(3); // distinct
  });
});
```

---

## 9. Naechster Schritt

Nach Plan-Approval:
1. Branch erstellen: `git checkout -b test/issue-pack-session-loading-real-coverage`
2. **Wave 0** sequentiell (3 Refactor-Commits, jeder mit `cargo test` gruen)
3. **Wave 1** + **Wave 2** parallel — A1-Tasks im Rust-Code, B2-Tasks in Vitest-Config
4. **Wave 3** danach — die 6 Integration-Test-Dateien koennen parallel von 6 Subagenten geschrieben werden (siehe `superpowers:dispatching-parallel-agents`)
5. **Wave 4** TDD-style — F4.x bricht den entsprechenden Test, dann fix, dann gruen
6. **Wave 7** Cleanup-PR (3 Commits)
7. **Wave 8** Doku
8. (Optional, separater Sprint:) **Wave 5** + **Wave 6**

**Empfohlener Modus:** `superpowers:executing-plans` mit Review-Checkpoints am Ende jeder Welle.

---

*Plan erstellt: 2026-05-08 nach intensivem Code-Review (siehe vorhergehende Konversation), 2 GSD-Subagenten (Codepath-Map + Bugfix-Audit), 8 verifizierte Code-Reads. Plan-Quality-Self-Audit ueberstanden.*
