# Lessons Learned

> Nach jeder Session / Sprint: Was lief gut, was schlecht, was aendern?
> Format: Datum, Kontext, Erkenntnis, Regel fuer die Zukunft.

---

## 2026-03-25 — Retrospektive & Konsolidierung

### Over-Planning ohne Feedback-Loop
**Kontext:** 3 Phasen (Anforderungsanalyse, Planung, Entwurf) mit 30+ Agenten, dann Pivot zu Session Manager
**Erkenntnis:** Umfangreiche Planung ist wertlos wenn sie nicht am echten User-Bedarf validiert wird
**Regel:** Maximal 1 Phase planen, dann User-Feedback einholen. Lieber 3x kurz planen als 1x lang.

### Monster-Commits vermeiden
**Kontext:** Ein Commit mit 22.003 Zeilen, 115 Dateien (v1.0.0 Session Manager)
**Erkenntnis:** Grosse Commits sind nicht reviewbar und machen Rollbacks unmoeglich
**Regel:** Max 5-10 Dateien pro Commit. Feature in logische Schritte aufteilen.

### Toter Code entsteht durch Richtungswechsel
**Kontext:** 12 Dateien (Pipeline-Komponenten, ADP-Adapter, Stores) nie integriert
**Erkenntnis:** Bei einem Pivot bleibt alter Code liegen. Ohne regelmaessiges Aufraeumen waechst Tech Debt unsichtbar.
**Regel:** Nach jedem Pivot: Dead-Code-Audit. Nicht genutzten Code archivieren oder loeschen.

### Prozess definieren ≠ Prozess leben
**Kontext:** CLAUDE.md definiert tasks/todo.md, STOPP-Punkte, Verification — nichts davon wurde eingehalten
**Erkenntnis:** Ein Prozess den niemand lebt ist schlimmer als kein Prozess (falsche Sicherheit)
**Regel:** Nur Prozesse definieren die man auch wirklich einhalt. Lieber wenige Regeln die gelebt werden.

### Spontane Ideen brauchen ein Auffangbecken
**Kontext:** Waehrend App-Nutzung fallen Verbesserungen auf, die sofort umgesetzt werden statt geplant
**Erkenntnis:** Ohne Capture-Mechanismus werden Ideen entweder vergessen oder brechen den aktuellen Flow
**Regel:** Idee → `tasks/ideas.md` notieren → beim naechsten Sprint-Planning priorisieren.

---

## 2026-03-29 — Cross-Cutting Concerns erkennen

### Pattern in einer Datei gesehen ≠ Problem geloest
**Kontext:** `silent_command()` mit `CREATE_NO_WINDOW` existierte nur in `github/commands.rs`. Vier andere Module nutzten rohes `Command::new()` — auf Windows flashte bei Worktrees, Pipeline und Executable-Checks kurz eine Console. User musste darauf hinweisen.
**Erkenntnis:** Wenn ein Pattern wie Window-Flags, Error-Handling oder Security-Checks in einer Datei existiert, ist das ein Signal fuer ein systemweites Concern. Tunnel-Vision (nur die Dateien lesen die zum aktuellen Task gehoeren) verhindert, dass Inkonsistenzen auffallen.
**Regel:** Bei Cross-Cutting Concerns (OS-Flags, Logging, Security, Error-Handling) sofort codebase-weit pruefen: `grep` nach dem rohen Pattern und alle Stellen auf Konsistenz bringen. Nicht file-by-file denken, sondern: "Wird das ueberall gleich gehandhabt?"

---

## 2026-03-30 — Persistenz-Audit: Safety Features stillschweigend revertiert

### Parallele Sessions ueberschreiben sich gegenseitig
**Kontext:** Issue #23 — Commit `59e3069` (Mar 27) hat Backup-Rotation, JSON-Validierung und Schema-Versioning fuer settings.rs eingebaut (101 Zeilen). 7 Stunden spaeter hat Commit `4232bd4` (Mar 28) Favorites/Notes-Loading hinzugefuegt — aber auf der alten Version von settings.rs gearbeitet. Die gesamte Backup-Infrastruktur wurde stillschweigend entfernt. Ein dritter Commit hat nur kosmetisch `version: 1` zurueckgefuegt, nicht die eigentliche Logik.
**Erkenntnis:** Wenn mehrere Sessions (oder Agents) am selben Issue arbeiten und dieselben Dateien aendern, ueberschreibt die zweite Session die erste — ohne Warnung, ohne Merge-Conflict.
**Regel:** Nach jedem Commit auf geteilten Dateien: `git diff HEAD~1 -- <file>` pruefen ob unbeabsichtigt Zeilen entfernt wurden. Bei parallel arbeitenden Sessions: expliziten Sync-Punkt einbauen.

### Safety-Features brauchen Tests als Wächter
**Kontext:** Backup-Rotation war implementiert, aber ohne Tests. Als der Code stillschweigend revertiert wurde, gab es keinen Alarm.
**Erkenntnis:** Ungetestete Safety-Features sind keine Safety-Features. Sie werden beim naechsten Refactor entfernt und niemand merkt es.
**Regel:** Jedes Safety-Feature (Backup, Validation, Atomic Write) muss mindestens einen Test haben der bricht wenn das Feature entfernt wird.

### Audit-Schuld: Persistenz nie systematisch geprueft
**Kontext:** Die App speichert Favoriten, Notizen und Settings — User-Daten die nie verloren gehen duerfen. Trotzdem gab es bis 2026-03-30 kein systematisches Audit der Persistenz-Schicht. Das Ergebnis: 4 CRITICAL-Schwachstellen (kein Atomic Write, kein Backup, removeItem loescht alles, stille Write-Fehler).
**Erkenntnis:** Persistenz-Code wird als "funktioniert ja" behandelt, aber die Failure-Modes (Crash, Disk-Full, korruptes JSON) werden nie getestet. "Funktioniert im Happy Path" != "Daten sind sicher".
**Regel:** Bei jeder neuen Persistenz-Schicht: Failure-Mode-Analyse durchfuehren. Mindestens pruefen: Was passiert bei Crash waehrend Write? Was bei korruptem File? Was bei Disk-Full?

---

## 2026-04-02 — Warum wir nie ein gelebtes Qualitaetskonzept hatten

### Die bittere Wahrheit: Das Konzept existierte — es wurde nur nie gelebt

**Kontext:** Umfassende Projekt-Analyse mit 10 Spezialisten-Agenten (Architektur, Security, Code Quality, Dependencies, State Management, UI/UX, Build/DevOps, Vision, Rust Backend, Integration) deckt systemische Qualitaetsprobleme auf: 3 kritische Security-Luecken, 0 Component-Tests, Safety-Features stillschweigend revertiert, keine Pre-Commit-Hooks. Dabei existiert in `Planung.md` Sektion 9 eine vollstaendige Testing-Strategie mit Pyramide, Coverage-Zielen und Quality-Gates.

### Ursache 1: Der Pivot hat den Plan begraben
**Was passiert ist:** Die Testing-Strategie lebte in `Planung.md` — einem Dokument das nach dem Pivot zum Session Manager ARCHIVIERT wurde. Die gesamte Qualitaetsstrategie ging mit dem alten Sprint-Plan ins Archiv. Fuer die neue Richtung wurde **nie eine neue Testing-Strategie** erstellt.
**Regel:** Bei einem Pivot: Features duerfen sich aendern, aber Qualitaets-Konzepte muessen MIGRIERT werden, nicht archiviert. Testing-Strategie gehoert in CLAUDE.md (lebendes Dokument), nicht in einen Sprint-Plan.

### Ursache 2: Phase 5 (Test) wurde endlos verschoben
**Was passiert ist:** `Phase.txt` definiert 7 Phasen. Phase 5 ist woertlich "Test: Ueberpruefung und Fehlerbehebung". Stand heute: "Phase 4-7 werden nach Feature-Forward-Sprint geplant." Phase 5 wurde nie erreicht weil immer ein neues Feature wichtiger war — v1.1, v1.2, v1.3, Pipeline-Sprint.
**Regel:** Testing ist keine Phase die "irgendwann" kommt. Testing ist Teil JEDER Phase. Kein Feature ist "fertig" ohne mindestens 1 Test der bricht wenn das Feature entfernt wird. Quality Gates muessen ab Sprint 1 gelten, nicht ab "Phase 5".

### Ursache 3: Feature-Velocity schlug Quality-Discipline
**Was passiert ist:** v1.0 bis v1.3 in 10 Tagen geliefert (Session Manager, Agenten-Transparenz, GitHub-Integration, Bugfixes). Beeindruckende Geschwindigkeit. Aber: Nach den initialen 251 Store-Tests (2026-03-16) wurde KEIN EINZIGER neuer Test geschrieben — fuer keines der 3 Releases danach. Die Test-Suite stagnierte waehrend die Codebase wuchs.
**Regel:** "Wir testen spaeter" ist eine Luege die man sich erzaehlt um schneller zu sein. Testen spaeter ist exponentiell teurer: Man muss den Code erst wieder verstehen, Edge Cases sind vergessen, und Bugs sind bereits eingebaut. Budget fuer Tests in jedem Sprint einplanen — nicht als Bonus, sondern als Pflicht.

### Ursache 4: Kein Enforcement — Prozess ohne Zaehne
**Was passiert ist:** `Planung.md` definierte Quality Gates: "npm run test — blockierend", "Coverage >= 60%", "Neue Logik hat mindestens 1 Test". KEINES davon wurde implementiert. Kein Pre-Commit-Hook, kein CI-Gate das Tests erzwingt, kein PR-Review das auf Tests prueft. Der Prozess war ein Versprechen auf Papier.
**Regel:** Quality Gates die nicht automatisiert sind, existieren nicht. Wenn ein Gate nicht im CI blockiert, wird es uebergangen sobald Zeitdruck entsteht. Mindestens: Pre-Commit-Hook (`tsc --noEmit`), CI-Gate (`npm test` blockierend), Coverage-Schwelle (erzwungen in vitest.config.ts).

### Ursache 5: Security war nie ein First-Class Concern
**Was passiert ist:** Shell-Injection in `manager.rs:376` (resume_session_id direkt in Shell-Command interpoliert), CSP mit `unsafe-eval`, keine Input-Validierung am Rust-Boundary, keine Subprocess-Timeouts. All diese Issues existierten seit Tag 1, wurden aber nie systematisch geprueft. Es gab keinen Security-Review, kein Threat-Modeling, kein OWASP-Checklist.
**Regel:** Security-Review nach jedem neuen Tauri-Command. Checkliste: Input validiert? Path Traversal geprueft? Shell-Injection moeglich? Timeout vorhanden? Fehler strukturiert? 5 Fragen, 5 Minuten — haette alle 3 kritischen Issues verhindert.

### Ursache 6: 251 Tests gaben falsche Sicherheit
**Was passiert ist:** "Wir haben 251 Tests!" klingt beeindruckend. Aber ALLE 251 Tests sind Store-Unit-Tests — sie testen In-Memory-State-Mutations. Kein einziger Test prueft: Rendert die UI korrekt? Funktioniert die Tauri-IPC? Ueberlebt die Persistenz einen Crash? Werden Events korrekt verarbeitet? Die Tests prueften den einfachsten Teil des Systems und liessen den riskantesten Teil ungetestet.
**Regel:** Tests nach Risiko priorisieren, nicht nach Einfachheit. Frage: "Was kostet es wenn DAS kaputt geht?" Persistenz-Verlust > UI-Regression > Store-Logik. Die teuersten Failures zuerst testen — auch wenn die Tests schwerer zu schreiben sind.

### Zusammenfassung: 6 Regeln fuer die Zukunft

1. **Qualitaetskonzept lebt in CLAUDE.md** — nicht in archivierbaren Sprint-Docs
2. **Testing ist Teil jeder Phase** — keine separate "Test-Phase"
3. **Jeder Sprint hat Test-Budget** — Features ohne Tests sind nicht "fertig"
4. **Gates muessen automatisiert sein** — Pre-Commit + CI, sonst existieren sie nicht
5. **Security-Review pro Tauri-Command** — 5-Fragen-Checkliste, 5 Minuten
6. **Tests nach Risiko priorisieren** — teuerste Failures zuerst

---

## 2026-04-03 — v1.4.0 Release

### Rust-Checks nur in CI, nie lokal

**Was passiert ist:** `cargo fmt --check` lief nur in der GitHub Actions Pipeline. Lokal gab es keinen Pre-Commit-Hook fuer Rust-Dateien. Release v1.4.0 wurde gepusht und die CI schlug sofort wegen Formatting-Diffs in `agent_detector.rs`, `commands.rs`, `manager.rs` und `util.rs` fehl. Vermeidbar.
**Regel:** Jede Sprache/jedes Tooling das in CI geprueft wird, MUSS auch lokal im Pre-Commit-Hook laufen. Parität zwischen CI und lokal ist Pflicht. Konkret: lint-staged hat jetzt `*.rs`-Einträge fuer `cargo fmt --check` und `cargo check --quiet`.

---

## 2026-03-16 — Session Manager MVP (aus lessons-learned.md uebernommen)

### Test-First zahlt sich aus
**Kontext:** Senior Test Manager Agent fand 11 echte Bugs, 1 kritischer PTY-Leak
**Regel:** Bei neuen Features: Parallel-Agent fuer Tests mitlaufen lassen.

### CSP-Restriktionen in Tauri
**Kontext:** `'unsafe-eval'` noetig fuer Vite + dynamische Imports
**Regel:** CSP-Config frueh testen, nicht erst beim Release.

### Desktop-Shortcut zeigt auf alte .exe
**Kontext:** Nach Code-Aenderungen `npm run tauri build` vergessen
**Regel:** Nach Aenderungen immer Full-Build, sonst laeuft alte Version.

---

## 2026-04-05 — Doku-Drift & Archivierungs-Regel (Housekeeping v1.4.2)

### Sprint-Plan-Dokumente sind Artefakte, keine Dauer-Dokumente
**Kontext:** `tasks/testing-spec.md` (443 Zeilen, 2026-04-02) war ein konkreter QA-Sprint-Plan fuer v1.3.1. Alle 9 Tickets wurden umgesetzt, aber die Datei blieb im aktiven `tasks/`-Verzeichnis liegen. Die **zeitlos relevanten** Teile (4-Gates-Struktur, dauerhaftes QA-Ritual) lagen ungenutzt im Sprint-Plan — waehrend CLAUDE.md einen aelteren, vageren Testing-Abschnitt behielt. Gleiche Drift bei `Softwareprozess/Phase.txt` (407 Zeilen, klassisches Wasserfall-Modell), das seit arc42 ueberholt war aber weiter in CLAUDE.md/README/CONTRIBUTING referenziert wurde.
**Erkenntnis:** Sprint-Plan-Dokumente haben **drei Lebensphasen**: (1) aktiv waehrend des Sprints, (2) Quelle fuer zeitlose Regeln nach Sprint-Abschluss, (3) Archiv-Artefakt. Ohne Phase 2 versanden gute Regeln im Archiv und werden nie ins lebende Dokument (CLAUDE.md) migriert.
**Regel:** Nach jedem Sprint-Abschluss: (a) Sprint-Plan-Doc auf "zeitlose Regeln" scannen, (b) diese in CLAUDE.md oder arc42 migrieren, (c) dann Sprint-Plan-Doc nach `Softwareprozess/history/` verschieben. Diese Drei-Schritte-Regel ist jetzt auch in CLAUDE.md Abschnitt "Prozess-Dokumentation" verankert.

### Hardcodierte Zahlen in CLAUDE.md driften garantiert
**Kontext:** CLAUDE.md behauptete "281 Tests in 8 Test-Dateien (Sprint v1.3.1)" und "Coverage-Schwellen: 60% Statements/Functions/Lines, 50% Branches". Tatsaechlicher Stand: 474 Tests in 21 Dateien, Coverage-Schwellen 24/32/58/24. Beides war ueber Wochen stale — CLAUDE.md log aktiv jeden Turn.
**Erkenntnis:** Jede fixe Zahl in einem Dauer-Dokument ist eine **Deadline fuer einen Update**, der garantiert verpasst wird. Schlimmer: Stale Zahlen sind **worse than no numbers** — sie erzeugen falsches Vertrauen.
**Regel:** In CLAUDE.md und aehnlichen Dauer-Docs **keine fixen Zahlen** zu Testzahl, Coverage, Issue-Count, Version etc. Stattdessen auf die **Live-Quelle** verweisen ("siehe `npm run test`", "siehe `vitest.config.ts`"). Exakte Zahlen gehoeren in generierte Artefakte (CHANGELOG, Sprint-Review) oder ins Dashboard, nicht in handgepflegte Dauer-Docs.

### CHANGELOG-Pflege wird vergessen wenn sie nicht im Release-Workflow steht
**Kontext:** Beim Housekeeping entdeckt: `CHANGELOG.md` endete bei v1.2.5 (2026-03-28). v1.3.0, v1.4.0, v1.4.1 wurden getaggt und released ohne CHANGELOG-Update. Vier Releases ohne Changelog-Eintraege.
**Erkenntnis:** Changelog-Pflege als separater, menschlich-erinnerter Schritt wird uebersprungen, sobald Druck entsteht. GitHub-Releases mit Notes existieren, aber CHANGELOG.md wird separat gepflegt — doppelter Aufwand, halber Pflege-Rhythmus.
**Regel:** Changelog-Eintrag gehoert in die Release-Checkliste (im `/sprint-review` Skill oder als Pre-Tag-Schritt). Alternativ: CHANGELOG automatisch aus Git-Tags + Conventional-Commits generieren (Tool wie `git-cliff`). Bis das automatisiert ist: **Pflicht vor jedem `git tag`**: "CHANGELOG.md aktualisiert? Wenn nein → nicht taggen."

---

## 2026-04-05 — MD-Pinning Feature (v1.5 Stage 2)

### Vor Code-Aenderung an Komponente: Usage checken
**Kontext:** Beim Feature "MD-Pinning im Config-Panel" habe ich `ContentTabs.tsx` modifiziert (Prop-Type erweitert, neue Icon-Darstellung fuer Pin-Tabs). Erst nach dem Fix eines tsc-Fehlers fiel mir auf: `ContentTabs` wird **nirgendwo importiert** — es ist orphan code aus einer frueheren Iteration. Die Aenderungen waren funktional harmlos, aber sie haben Diff-Umfang produziert ohne Wirkung, und die Fix-Schleife hat Zeit gekostet.
**Erkenntnis:** Bevor man eine Komponente modifiziert, mit einem kurzen `grep -r "import.*Foo"` pruefen, ob sie ueberhaupt angebunden ist. Das kostet 5 Sekunden, spart aber im Zweifel ein Revert + Lesson. Besonders wichtig bei Projekten mit Pivot-Historie (dead code entsteht dort systemisch — siehe Eintrag 2026-03-25).
**Regel:** Bei jeder Komponenten-Aenderung: **erst Usage-Check** (`grep -r "ComponentName"`), dann Aenderung. Wenn `found 1 file` = nur die Komponente selbst = **dead code**: nicht modifizieren, sondern separat als "delete candidate" notieren.

### Usage-Check auch fuer Shared Helper — nicht nur fuer Komponenten
**Kontext:** Nach dem ContentTabs-Fehler (s.o.) habe ich direkt beim naechsten Schritt **denselben Fehler-Typ wiederholt**: Beim MD-Pinning habe ich `configPanelShared.tsx` (Export: `ConfigPanelContent`) modifiziert, ohne zu pruefen WO `ConfigPanelContent` ueberall verwendet wird. Resultat: ein **zweiter Caller** (`FavoritePreview.tsx`) hatte eine eigene Tab-Leiste ohne Pin-Support. Die Inkonsistenz wurde erst sichtbar, als der User die App startete und zwei verschiedene Konfig-Ansichten sah (Bild 1 vs. Bild 2).
**Erkenntnis:** Der Usage-Check gilt **nicht nur fuer Komponenten, die ich direkt modifiziere**, sondern auch fuer **Helper/Shared-Module, deren Exports ich erweitere**. Wenn ich `ConfigPanelContent` um einen neuen Case erweitere, muss ich alle Caller finden und pruefen, ob sie das neue Verhalten auch **triggern koennen** (hier: konnten sie nicht, weil Tab-Leiste fehlte).
**Regel:** **Zwei Grep-Runden vor jeder nicht-trivialen Aenderung:** (1) Wird die Komponente/Funktion genutzt? (2) Wer nutzt die Datei, in der ich arbeite? Beide Listen durchsehen. Kostet 20 Sekunden, verhindert halbe Features, die nur in einer Haelfte der App funktionieren.

### Dead Code ist ein Leck in der Architektur-Intuition
**Kontext:** Ich hatte aus Phase.txt die alte UI-Architektur rekonstruiert ("ContentTabs ueber dem Terminal") und angenommen, dass das die lebendige Struktur ist. Tatsaechlich war es nur ein historisches Artefakt — die aktuelle Architektur verwendet das separate Split-View-ConfigPanel. Durch die (veraltete) Doku bin ich auf die falsche Komponente gestossen.
**Erkenntnis:** Doku kann lügen, Code-Usage nicht. Bei jedem architektonischen "das müsste hier liegen"-Gedanken: Annahme gegen `grep` verifizieren, bevor Code geändert wird.
**Regel:** Bei Unklarheit welche Komponente die aktive ist: `grep -r "<ComponentName"` (JSX-Usage) ist die Wahrheit. Nicht CLAUDE.md, nicht Phase.txt, nicht mein Gedächtnis.

---

## 2026-04-04 — Markdown Editor Feature (#68)

### safe_resolve prueft non-existent Pfade nicht
**Kontext:** `safe_resolve_with_base` gab fuer nicht-existierende Dateien den raw joined Path zurueck — ohne Canonicalization. Bei `write_project_file` ermoeglicht das Path Traversal via `../` und Symlink-Angriffe (TOCTOU).
**Regel:** Jede `safe_resolve`-Aenderung MUSS beide Pfade (existierend + nicht-existierend) absichern. Fuer neue Dateien: Parent canonicalisieren + Filename anhaengen. Fuer fehlenden Parent: Komponenten manuell ausfloesen.

### DOMPurify Default-Config blockiert javascript: nicht
**Kontext:** DOMPurify's Standard-Config laesst `javascript:` und `onerror` in Attributen durch. Markdown-Links wie `[Click](javascript:alert('xss'))` werden zu klickbaren XSS-Vektoren.
**Regel:** Bei jedem `DOMPurify.sanitize()` IMMER explizit `ALLOWED_ATTR` und `FORBID_ATTR` konfigurieren. Nie Default vertrauen.

### Zustand Store-Subscription ohne Selektor = Re-Render bei jedem State-Change
**Kontext:** `useEditorStore()` ohne Selektor abonniert den gesamten Store. EditorToolbar renderte bei jedem Keystroke neu, obwohl nur `openFile.content` sich aenderte.
**Regel:** Immer granulare Selektoren exportieren und nutzen. Nie `const { action1, action2 } = useStore()` — stattdessen `const action1 = useStore(selectAction1)`.

### Feature-Implementierung ohne QA-Phase = versteckte Bugs
**Kontext:** Erste Implementierung hatte 6 Security-Issues, 7 Performance-Probleme, 20 UX-Gaps. Erst das 5-Agenten QA-Review hat das aufgedeckt.
**Regel:** Nach jeder nicht-trivialen Feature-Implementierung: QA-Review mit spezialisierten Agenten (Security, Performance, Testing, UX/A11y, Code Quality) BEVOR das Feature als "done" markiert wird. In die Checkliste aufnehmen.

---

## 2026-04-06 — ADPError-Migration (#63)

### Review-Agent MUSS vor PR abgeschlossen sein �� nie parallel zum PR starten
**Kontext:** Bei Issue #63 wurde der Code-Quality-Review-Agent im Hintergrund gestartet, waehrend gleichzeitig der PR erstellt wurde. Der Abschluss-Report sagte "PR wartet auf User-Merge". Der User hat gemerged. Dann kam der Review zurueck mit Findings (falscher Error-Code in `folder_actions.rs`). Die Fixes konnten nur noch als separater Commit nachgeschoben werden — der PR war bereits gemerged mit bekanntem Fehler.
**Erkenntnis:** Die /implement Skill-Pipeline definiert Phase 5 (Review) → Phase 6 (PR) als sequentielle Schritte. Background-Agents fuer Reviews zu starten und parallel den PR zu erstellen bricht diese Sequenz. Das "Done"-Signal an den User kommt bevor die Qualitaet tatsaechlich geprueft ist.
**Regel:** Review-Agents (code-quality, security-reviewer) MUESSEN abgeschlossen sein und ihre Findings verarbeitet sein BEVOR Phase 6 (Commit & PR) startet. Nie einen Review-Agent `run_in_background` starten und gleichzeitig den PR erstellen. Die Reihenfolge ist: Review starten → Review-Ergebnis abwarten → Findings fixen → DANN erst PR.
