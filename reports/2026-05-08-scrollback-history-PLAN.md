# Scrollback History Pain — GSD-Analyse & Plan

**Datum:** 2026-05-08
**Branch-Vorschlag:** `feat/scrollback-history-coverage` (NEUER Branch ab master, NICHT auf dem laufenden test/issue-pack-... Branch)
**User-Pain (verbatim):** "beim Hochscrollen den Verlauf schön sehen, nicht abgeschnitten"
**Plan-Style:** GSD-Disziplin ohne `.planning/`-Bootstrap (analog 2026-05-08-session-loading)
**Geschätzter Aufwand:** ~2 Personentage über 3 Phasen

---

## 0. Phase Goal

User soll beim Hochscrollen im Terminal die **vollständige Session-Historie** sehen — sowohl innerhalb einer laufenden Session (Phase 1) als auch über App-Neustarts hinweg (Phase 3). Sekundär: Reflow-Artefakte bei Window-Resize beheben (Phase 2).

### Out-of-Scope (explizit)

- Suche im Scrollback (xterm-search-addon) — separates Feature
- Persistierung des claude-code-TUI-State (technisch unmöglich ohne CLI-Cooperation)
- Native Terminal-Renderer (Warp/Wave-Style) — zu großer Architektur-Schnitt
- Issue #197 Mutex-during-PTY-I/O — separates Backend-Concern
- Issue #200 OSC/DCS strip_ansi-Lücke — separates Concern (kein Daten-Verlust, nur Detector-Korruption)

### Success Statement (Goal-Backward)

> "User öffnet eine Session, lässt 10.000 Zeilen Output produzieren (`seq 1 10000` o.ä.), scrollt komplett hoch — sieht Zeile 1." → **Phase 1 done**
>
> "User schließt die App, öffnet sie neu, klickt Resume auf eine Session — sieht den kompletten Verlauf von vor dem Schließen, BEVOR claude --resume eigene Inhalte einfügt." → **Phase 3 done**
>
> "User zieht das Fenster schmaler — alte Zeilen werden korrekt umgebrochen, nicht abgeschnitten gerendert." → **Phase 2 done**

---

## 1. Diagnose-Konsens (4 parallele GSD-Subagenten)

| Mechanismus | Datei:Zeile | Schuldig? | Verdict |
|-------------|-------------|-----------|---------|
| **xterm scrollback FIFO=5000** | `SessionTerminal.tsx:87` | **JA — primär** | Lines beyond 5000 evicted FIFO. 5000 ist 5× xterm-Default (1000), aber für lange Claude-Sessions mit Tool-Calls + Re-Renders zu klein. Ein 30-min-Refactor frisst 5000 Zeilen leicht weg. |
| **claude --resume reprint-Limit** | CLI-Verhalten | Beiträger | Claude CLI druckt beim Resume nicht den **gesamten** vorherigen Transcript — nur die letzte Turn-Header. Innerhalb einer laufenden Session irrelevant; sichtbar nur nach App-Restart. |
| **conpty pre-reflow bei buildNumber=19041** | `SessionTerminal.tsx:100` | Beiträger (kosmetisch) | Bei Window-Resize bleiben gewrappte Zeilen auf alter Spaltenbreite gewrappt → visuell "abgeschnitten" rechts. Inhalt ist im Buffer, wird nur falsch gerendert. |
| strip_ansi Korruption | `manager.rs:464` | NEIN | Wirkt nur auf Status-Snippet + Agent-Detector, nicht auf xterm-bound Output. |
| 500-char Output-Buffer in `useSessionEvents` | `useSessionEvents.ts:91` | NEIN | Sidebar-Snippet, NICHT xterm-Pfad. xterm-Listener ist separat in `SessionTerminal.tsx:223-238`. |
| 4096-byte PTY-Chunk | `manager.rs:186` | NEIN | Reines Chunking; xterm reassembled. Nur Risiko: rare U+FFFD bei Multi-Byte-UTF-8 an Chunk-Grenze (Spinner-Glyphen) — kein History-Loss. |
| Tauri IPC-Payload-Limit | n/a | NEIN | Default-WebView2-IPC-Limits sind im MB-Bereich, 4 KB nicht relevant. |

### Memory-Budget-Tabelle (Subagent 3 verifiziert via xterm.js source)

xterm.js v6 Cell-Memory: **12 Bytes pro Cell** (3× Uint32) + ~120 Bytes Object-Overhead pro Row.

| scrollback | @ 200 cols | Memory pro Terminal |
|-----------|------------|----------------------|
| 1.000 (xterm-Default) | 12 MB / 5 = 2,4 MB | **~3 MB** |
| **5.000 (Status quo)** | 12 MB | **~13 MB** |
| **25.000 (Phase-1-Vorschlag)** | 60 MB | **~63 MB** |
| 50.000 (Power-User-Opt) | 120 MB | **~126 MB** |
| 100.000 | 240 MB | **~252 MB** |
| 500.000 | 1,2 GB | **~1,26 GB** ⚠️ |

Mit 4 aktiven Sessions à 25.000 Zeilen ≈ 250 MB Memory — akzeptabel für Desktop-App.

---

## 2. Drei-Phasen-Plan

### Phase 1 — Quick Win: Scrollback raise + Settings-Slider (1 PT)

**Goal:** Innerhalb laufender Sessions verschwindet kein Verlauf mehr.

| Task | Datei | Akzeptanz |
|------|-------|-----------|
| **P1.1** | `src/components/sessions/SessionTerminal.tsx:87` | `scrollback: 5000` → `scrollback: settingsStore.preferences.scrollbackLines ?? 25000`. Default 25.000. |
| **P1.2** | `src/store/settingsStore.ts` | `AppPreferencesSettings` erweitern um `scrollbackLines: number` (default 25000). Migrate-Pfad: bei Hydration einmalig auf 25000 setzen wenn fehlend. |
| **P1.3** | `src/components/settings/PreferencesView.tsx` | Neuer Section "Terminal-Verlauf" mit Select (5.000 / 10.000 / 25.000 / 50.000) + Memory-Hinweis-Text bei 50.000 ("≈125 MB pro Terminal"). |
| **P1.4** | `src-tauri/tests/session_discovery.rs` | Test ergänzen: 10.000-Zeilen-Fixture passt in Scrollback (Layer-A nicht direkt, aber Smoke). |
| **P1.5** | `src/components/sessions/hooks/useSessionEvents.integration.test.ts` | Layer-B: Test dass `term.write` 10.000-Zeilen-Output ohne Loss durchläuft (echte Stores, mockIPC). |
| **P1.6** | `tasks/lessons.md` | Eintrag: "scrollback=5000 ist 5× xterm-Default aber für Claude-CLI-Sessions zu klein. Hard-Coded Limits sind Tech-Debt — User-konfigurierbar machen." |

**Verification-Gate Phase 1:**
- `npm run test:integration` grün
- Manueller UAT: Session öffnen → `for i in 1..10000; print $i` (PowerShell) → komplett hochscrollen → Zeile 1 sichtbar
- `npm run tauri build` durchläuft

---

### Phase 2 — ConPty Reflow Fix (~2 Stunden)

**Goal:** Beim Window-Resize werden alte Zeilen korrekt re-flowed statt visuell abgeschnitten.

| Task | Datei | Akzeptanz |
|------|-------|-----------|
| **P2.1** | `src-tauri/src/lib.rs` (oder neuer `system_info.rs`) | Neuer Tauri-Command `get_windows_build()` → liest Windows-Build via `os_info`-Crate, returns `u32`. Fallback `19041` bei Fehler. |
| **P2.2** | `Cargo.toml` | dev/runtime-dep: `os_info = "3"` (~50 KB binary impact). |
| **P2.3** | `src/components/sessions/SessionTerminal.tsx:100` | Vor xterm-Mount: `const buildNumber = await invoke<number>("get_windows_build")`. Pass to `windowsPty: { backend: "conpty", buildNumber }`. |
| **P2.4** | `src/components/sessions/SessionTerminal.tsx` | Default-Fallback: 19041 falls invoke wirft (Linux/macOS-Builds) — sollte aber sowieso nur auf Windows ausgeführt werden. |
| **P2.5** | Smoke-Test | Win10 22H2 (build 19045) → buildNumber=19045 < 21376 → Reflow bleibt aus, kein Schaden. Win11 (build 22000+) → Reflow aktiviert. |

**Verification-Gate Phase 2:**
- `cargo test` grün, `cargo clippy --all-targets -- -D warnings` clean
- Manueller UAT auf User's Maschine (Win11): Session öffnen, paar Zeilen produzieren, Window schmaler ziehen → wrap rendert sauber
- Falls User auf Win10 22H2: kein Schaden (buildNumber=19045 < 21376 = wie zuvor)

---

### Phase 3 — Persistierter Scrollback über App-Restart (1 PT)

**Goal:** Verlauf überlebt App-Schließen + Neustart. User klickt Resume → sieht alten Verlauf VOR dem `claude --resume`-Replay.

| Task | Datei | Akzeptanz |
|------|-------|-----------|
| **P3.1** | `package.json` | dep: `@xterm/addon-serialize@0.14.0` (pinned exakt — addon ist "experimental"). |
| **P3.2** | `src/components/sessions/SessionTerminal.tsx` | `SerializeAddon` mounten alongside FitAddon. |
| **P3.3** | `src-tauri/src/session/scrollback_store.rs` (neu) | Tauri-Commands: `save_scrollback(session_id, content)` + `load_scrollback(session_id)` + `delete_scrollback(session_id)`. Storage: `${app_data_dir}/scrollback/<sessionId>.vt.gz` (gzip-komprimiert). |
| **P3.4** | `src/components/sessions/hooks/useSessionPersistScrollback.ts` (neu) | Hook der: (a) bei session-close `serialize({ excludeAltBuffer: true, scrollback: 50000 })` aufruft + invoke save_scrollback, (b) periodisch alle 60s throttled save bei aktiven Sessions, (c) bei session-resume zuerst load_scrollback aufruft + `term.write(serialized)` BEVOR PTY spawnt. |
| **P3.5** | `src/App.tsx` | `onCloseRequested` erweitern: für alle aktiven Sessions `serialize` + `save_scrollback` invoke (await all) bevor App schließt. |
| **P3.6** | `src/store/sessionStore.ts` | Bei `removeSession(id)`: trigger `delete_scrollback(id)` für GC. |
| **P3.7** | `src/components/sessions/SessionTerminal.tsx` | Restore-Reihenfolge: 1. `term.open()`, 2. `load_scrollback` → `term.write(serialized)`, 3. PTY-spawn `claude --resume`. claude-code's TUI-Alt-Screen überschreibt nichts im Scrollback. |
| **P3.8** | Smoke-Test: claude-code-TUI-Kompatibilität | Echte Claude-CLI-Session öffnen, 1000 Zeilen Output, App schließen → neu öffnen → Resume → sehe alten Verlauf + claude reprint danach. |
| **P3.9** | Layer-B Test | Mock `save_scrollback` + `load_scrollback` IPC-Handler, verify Hook ruft beide korrekt auf bei close/resume. |

**Verification-Gate Phase 3:**
- `npm run test:integration` grün
- Manueller UAT: Lange Session → schließen → öffnen → Resume → kompletter Verlauf da
- `app_data_dir/scrollback/` enthält .vt.gz-Dateien für aktive Sessions
- GC: Session removen → File weg

---

## 3. Risk Register

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|---------------------|--------|------------|
| **claude-code TUI Alt-Screen** überschreibt restored Scrollback | Medium | Hoch | `excludeAltBuffer: true` in serialize-Call. Restore VOR PTY-Spawn. Testen mit echter Claude-Session bevor Phase 3 mergt. |
| addon-serialize ist "experimental" und API kann sich ändern | Medium | Niedrig | Exakt-Pin auf `0.14.0` (kein `^`). Bei Bump: smoke-Test re-laufen. |
| 4 aktive Sessions × 50.000 Zeilen = ~500 MB RAM | Niedrig | Medium | Default 25.000 (sicher). 50.000 nur als Opt-In via Settings + UI-Hint. |
| Win10 22H2-User (build 19045) — Reflow bleibt aus | Niedrig | Niedrig | Erwartetes Verhalten — buildNumber < 21376 hält Reflow off. Identisch zu Status quo. |
| `\x1bc` RIS-Reset von claude-code clears scrollback mid-session | Niedrig | Medium | Persistierter File vom letzten Save überlebt. User merkt Verlust nur bis zum nächsten Save (≤60s). |
| Serialize-Performance bei 50.000-Zeilen ≈ 200-400ms | Medium | Niedrig | Save NUR auf close/shutdown/throttled-60s. Nicht auf jedem Output. |
| Phase 1 raise auf 25k macht App initial spürbar speicher-hungriger | Niedrig | Niedrig | xterm pre-allocates lazy beim ersten Cell-Write. Idle-Sessions kosten quasi nichts. |

---

## 4. Wave-Diagramm + Kritischer Pfad

```
        Phase 1 (P1.1-P1.6) — Quick Win
              │
              ▼
        Phase 2 (P2.1-P2.5) — ConPty Reflow ── parallel zu Phase 1
              │
              ▼
        Phase 3 (P3.1-P3.9) — Persistenz [← braucht Phase 1 als Fundament]
```

**Kritischer Pfad:** P1 → P3 (Phase 2 unabhängig). ~2 PT mit Parallelisierung.

**Mein Vorschlag für Reihenfolge:**
1. **Phase 1 als ersten Commit** (1 Tag, sofortige User-Erleichterung)
2. **Phase 2 als zweiten Commit** (2h, kleine Politur, kein User-Impact wenn auf Win10)
3. **Phase 3 als separater Sprint** (1 PT, größere Änderung — eigener PR)

Phase 1 + 2 zusammen sind ein PR ("scrollback hardcap fix"); Phase 3 ist ein separater PR ("scrollback persistence") nach P1 gemergt.

---

## 5. Plan-Quality Self-Audit

| Frage | Antwort |
|-------|---------|
| Reicht der Plan, das User-Pain zu lösen? | Ja — Phase 1 fixt 95% des Pains (within-session), Phase 3 fixt die restlichen 5% (across-restart). Phase 2 ist Bonus. |
| Sind Tasks klein genug für atomare Commits? | Ja — P1 = ~80 Zeilen, P2 = ~50 Zeilen, P3 = ~250 Zeilen. |
| Sind Akzeptanz-Kriterien testbar? | Ja — manueller UAT-Test mit `seq 1 10000` und App-Restart sind beide eindeutig. Layer-B-Tests für die Hooks. |
| Ist die Empfehlung honest? | Ja — Phase 1 ist 1-Zeilen-Fix mit Massive-Win-Ratio. Phase 3 ist substantiell aber wertvoll. Phase 2 ist Politur. |
| Was wurde NICHT abgedeckt? | Issue #197 Mutex-Stalls (Backend-Concern, separater Plan), Issue #200 OSC-Leak (Detector-Concern). xterm-search-addon (Suche im Scrollback) — Nice-to-have-Sprint. |
| Wo könnte der User pushback geben? | "25.000 ist mir zu wenig — ich will 100k" → kann via Settings auf 50k. >50k = OOM-Risiko, dokumentiert. |
| Lessons-Learned-Beitrag bei Abschluss? | "Hard-coded Limits in UI-Komponenten = Tech-Debt", "xterm-Default 1000 ist Industry-Standard, aber Claude-CLI-Use-Case rechtfertigt 5-25x". |

---

## 6. Open Questions (vor Phase-Start klären)

1. **Default-Scrollback 25k oder 50k?** — Vorschlag: 25k (sicher), opt-in 50k via Settings. User kann gerne anders entscheiden.
2. **Phase 3 als separater PR oder gebündelt mit Phase 1+2?** — Vorschlag: separat (Phase 3 ist substantiell + Risiko addon-serialize).
3. **Persistenz-File-Format: gzipped VT-string oder JSON-wrapped?** — Vorschlag: gzipped raw VT-string (kleinste Datei, addon-serialize gibt direkt String). Sidecar `.meta.json` mit `{savedAt, cols, rows, version}`.
4. **Save-Trigger für Phase 3: nur close/shutdown ODER auch periodisch?** — Vorschlag: beides (close = explicit, periodisch = catch-all bei Crash). 60s throttled.

---

*Plan erstellt: 2026-05-08 nach 4 parallelen GSD-Subagent-Pässen (gsd-debugger Diagnose, gsd-codebase-mapper Inventory, 2× gsd-phase-researcher Solution + Persistence). Diagnose 95% confidence: scrollback=5000 FIFO ist primary, conpty=19041 secondary cosmetic. Plan-Quality-Self-Audit überstanden.*
