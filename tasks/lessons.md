# Lessons Learned

> Nach jeder Session / Sprint: Was lief gut, was schlecht, was aendern?
> Format: Datum, Kontext, Erkenntnis, Regel fuer die Zukunft.

---

## 2026-04-17 — Design-System-Intake

### Eingehende Style-Contracts gegen Ist-Stand diffen, nicht blind uebernehmen
**Kontext:** Anleitung zum Design-System-Intake verlangte "Token-Reconcile" via Copy aus `colors_and_type.css`. Tatsaechlich hatte `src/index.css` alle Tokens (Durations, Easings, Spacing, Alpha-Varianten, Glows) bereits — die eingehende CSS war ein Snapshot AUS dem Repo.
**Erkenntnis:** Wenn ein externes Design-System aus dem eigenen Code extrahiert wurde, ist `src/index.css` die Source of Truth. Einseitig kopieren ueberschreibt moeglicherweise bereits weitergepflegte Werte.
**Regel:** Tokens aus externer CSS immer gegen `src/index.css` diffen und explizit Delta-Listen erstellen. `src/index.css` niemals durch "Paket-CSS" ueberschreiben.

### Scope-Disziplin bei Drift-Audits
**Kontext:** Drift-Scan fand 4 harte `rounded-md/lg`-Violations, aber dazu ~25 `rounded-full`-Pills die streng genommen auch gegen "full = nur Status-Dots" verstossen.
**Erkenntnis:** Ein Audit-Ticket eskaliert schnell von "6 Findings" zu "jede Pille prüfen", was zu unreviewbaren PRs und potentiellen Regressions fuehrt.
**Regel:** Im Plan definierte Drift-Liste strikt abarbeiten. Graubereiche (hier: Pill-Shapes) als Follow-up-Issues dokumentieren, nicht in laufenden PR aufblaehen.

### Vite-Public vs src/assets fuer Favicons
**Kontext:** Anleitung schlug `<link rel="icon" href="/src/assets/logo.svg">` vor — das funktioniert in Vite nicht ohne Bundler-Hook (nur `public/*` wird als URL-Root gemountet).
**Erkenntnis:** Generische Design-System-Anleitungen uebersehen oft Framework-Spezifika.
**Regel:** Statisches Favicon → `public/<file>` + absoluter Pfad `/<file>` im `<link>`. `/src/...` nur via bundler-imports.

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

## 2026-04-06 — Issue-Status nie aus Gedaechtnis, immer aus GitHub

### Stale Context fuehrt zu falschen Empfehlungen
**Kontext:** Mehrfach Issues (#62, #63, #65) als "offen" behandelt und zur Parallel-Implementierung vorgeschlagen, obwohl sie laengst CLOSED waren. Ursache: Aus dem Conversation-Context oder der todo.md gelesen statt aus der Single Source of Truth (GitHub API).
**Erkenntnis:** todo.md driftet, Conversation-Context ist nach Compaction unzuverlaessig. Nur `gh issue list --state all` ist die Wahrheit.
**Regel:** Vor JEDER Empfehlung die auf Issue-Status basiert: `gh issue list` oder `gh issue view` ausfuehren. Nie aus Gedaechtnis oder todo.md den Status ableiten. Gilt besonders bei Sprint-Planung, Parallel-Implement-Analyse und Cleanup-Phasen.

## 2026-04-06 — ADPError-Migration (#63)

### Review-Agent MUSS vor PR abgeschlossen sein �� nie parallel zum PR starten
**Kontext:** Bei Issue #63 wurde der Code-Quality-Review-Agent im Hintergrund gestartet, waehrend gleichzeitig der PR erstellt wurde. Der Abschluss-Report sagte "PR wartet auf User-Merge". Der User hat gemerged. Dann kam der Review zurueck mit Findings (falscher Error-Code in `folder_actions.rs`). Die Fixes konnten nur noch als separater Commit nachgeschoben werden — der PR war bereits gemerged mit bekanntem Fehler.
**Erkenntnis:** Die /implement Skill-Pipeline definiert Phase 5 (Review) → Phase 6 (PR) als sequentielle Schritte. Background-Agents fuer Reviews zu starten und parallel den PR zu erstellen bricht diese Sequenz. Das "Done"-Signal an den User kommt bevor die Qualitaet tatsaechlich geprueft ist.
**Regel:** Review-Agents (code-quality, security-reviewer) MUESSEN abgeschlossen sein und ihre Findings verarbeitet sein BEVOR Phase 6 (Commit & PR) startet. Nie einen Review-Agent `run_in_background` starten und gleichzeitig den PR erstellen. Die Reihenfolge ist: Review starten → Review-Ergebnis abwarten → Findings fixen → DANN erst PR.

---

## 2026-04-06 — Sprint v1.6.0 Abschluss-Session (Mega-Session)

### Worktree-Agents verlieren package.json-Änderungen beim Squash-Merge
**Kontext:** Issue #136 (Log-Virtualisierung) hat `@tanstack/react-virtual` als Dependency hinzugefügt. Der Subagent hat `npm install` im Worktree ausgeführt — package.json wurde geändert, aber beim `git add` wurden nur die Source-Dateien explizit hinzugefügt, nicht package.json/package-lock.json. Beim Squash-Merge fehlte die Dependency. Der Build-Engineer im Verifikations-Team hat den Fehler aufgedeckt.
**Erkenntnis:** `npm install <package>` ändert package.json + package-lock.json. Wenn der Subagent nur Source-Dateien staged (`git add src/...`), gehen Dependency-Änderungen verloren. Das ist besonders tückisch weil der Build im Worktree funktioniert (node_modules existiert lokal).
**Regel:** Bei jedem `npm install <neues-paket>` im Subagent-Prompt explizit fordern: "Nach npm install MÜSSEN package.json und package-lock.json mit-committet werden." In Subagent-Prompts: `git add package.json package-lock.json src/...` statt nur `git add src/...`.

### Parallele Batch-Arbeit mit 6+ Agents skaliert — aber Merge-Reihenfolge ist kritisch
**Kontext:** 8 Frontend-Review Issues (#132-#139) wurden in 6 parallelen Work-Units abgearbeitet. 5 Units mergten konfliktfrei, Unit 6 (Umlaute, 45 Dateien) brauchte einen Rebase mit 2 Konflikten (EditorToolbar.tsx, MarkdownEditorView.tsx). Die Konflikte waren trivial aufzulösen weil sie additive Änderungen auf verschiedenen Ebenen waren (Umlaute = Textinhalt, A11y = Attribute, CTA = Komponenten-Wrapper).
**Erkenntnis:** Die breiteste Änderung (die meisten Dateien berührt) MUSS zuletzt gemergt werden. Das minimiert Rebase-Aufwand: nur der letzte PR muss rebasen, nicht alle anderen.
**Regel:** Bei parallelen Batches: Merge-Reihenfolge = aufsteigend nach Datei-Count. Isolierteste PRs zuerst, breiteste zuletzt.

### Verifikations-Team vor Release deckt Probleme auf die CI nicht fängt
**Kontext:** CI war grün für alle 6 PRs. Aber nach dem Merge aller PRs auf master fehlte `@tanstack/react-virtual` in node_modules (lokaler State). Der Build-Engineer-Agent hat das sofort gefunden. Ohne das Team hätte der User einen broken Build vorgefunden.
**Erkenntnis:** CI prüft jeden PR isoliert auf seinem Branch. Nach dem Merge aller PRs auf master kann der lokale Zustand divergieren (node_modules stale, neue Dependencies nicht installiert). Ein finaler Verifikations-Durchlauf auf dem gemergten master ist Pflicht vor einem Release.
**Regel:** Vor jedem Release: `npm install` + komplettes Verifikations-Team (Build, Tests, Rust, Quality) auf dem finalen master-Stand laufen lassen. Nicht davon ausgehen dass "CI war grün" = "lokaler Build funktioniert".

### 241 Tests in einer Session via 6 parallele Batch-Workers — Test-Coverage von 47% auf 83%
**Kontext:** Issues #90 und #66 (Coverage-Schwellen erhöhen) wurden mit 6 parallelen Test-Workers abgearbeitet. Jeder Worker hat 16-66 Tests für sein Modul geschrieben (Shared, Sessions, Viewers, Kanban, Stores/Hooks, Layout). Alle 6 PRs mergten konfliktfrei weil sie nur neue Test-Dateien hinzufügten.
**Erkenntnis:** Test-Writing ist ideal für Parallelisierung: jeder Worker schreibt neue .test.tsx-Dateien neben den Source-Dateien, es gibt keine Merge-Konflikte weil keine Source-Dateien geändert werden. Die Coverage-Projektion (47% → ~77%) war konservativ — tatsächlich erreicht: 83%.
**Regel:** Für Coverage-Sprints: immer /batch mit einem Worker pro Modul. Keine Source-Änderungen, nur Test-Dateien. Threshold-Bump als separaten letzten PR nach allen Test-PRs.

### Frontend-Review mit 5 KI-Experten-Personas liefert systematische, priorisierte Findings
**Kontext:** Statt eines einzelnen "schau mal drüber" wurden 5 spezialisierte Personas parallel eingesetzt (UX, Design, A11y, Performance, Copy). Jede Persona hat unabhängig analysiert, dann hat ein Moderator-Agent die Findings konsolidiert, Konsens identifiziert und priorisiert.
**Erkenntnis:** Der Konsens-Mechanismus (3+ Experten einig = High-Confidence) filtert Rauschen effektiv. Einzelne Experten-Meinungen können subjektiv sein, aber wenn UX + Design + A11y alle dasselbe Problem sehen (z.B. "SideNav braucht Labels"), ist es ein echtes Problem. Die Priorisierung (P0-P3) nach Impact × Aufwand macht die Findings direkt actionable.
**Regel:** Bei UI-Reviews: /frontend-review Skill nutzen. 5 Personas parallel, Moderator-Synthese, dann Issues erstellen. Nicht "einer schaut drüber" — das findet nur die offensichtlichen Probleme.

---

## 2026-04-09 — Library-View zeigt keine Inhalte (Regression)

### Hardcodierte Pfade brechen bei neuen Quellen
**Kontext:** `SkillCard` Loader hatte `commands/${dirName}/SKILL.md` hardcodiert fuer ALLE globalen Skills. Als `~/.claude/skills/` als zweite Quelle hinzugefuegt wurde, zeigten Skills aus `skills/` "Kein Inhalt" — weil der Loader am falschen Pfad suchte, obwohl `skill.body` den korrekten Content bereits hatte.
**Erkenntnis:** Wenn Daten bereits waehrend Discovery geladen werden, darf die Anzeige-Komponente sie nicht nochmal von einem hardcodierten Pfad nachzuladen versuchen. Das ist fragil und bricht bei jeder neuen Quelle.
**Regel:** Content der bei Discovery schon geladen wird, direkt aus dem Model (`skill.body`) verwenden — nicht aus einem hardcodierten Pfad re-fetchen. Single Source of Truth gilt auch fuer UI-Loader.

### Neue Scopes brauchen vollstaendige Discovery
**Kontext:** `discoverGlobal` lud Settings, Commands, Skills, Agents und Memory — aber NICHT die globale `~/.claude/CLAUDE.md`. Der "CLAUDE.md"-Section im Global-Scope blieb unsichtbar, weil `config.claudeMd` immer `""` war.
**Erkenntnis:** Wenn ein neuer Scope oder eine neue Quelle hinzugefuegt wird, muessen ALLE Content-Typen des Scopes geprueft werden — nicht nur die neu hinzugefuegten. Luecken in der Discovery fallen nicht sofort auf, weil die UI fehlende Daten einfach nicht anzeigt (kein Error, nur leere Sections).
**Regel:** Bei Erweiterung von Discovery-Funktionen: Checkliste aller ScopeConfig-Felder durchgehen (skills, agents, hooks, settingsRaw, claudeMd, memoryFiles). Jedes Feld muss fuer den Scope geladen werden oder explizit als "nicht relevant" markiert sein.

---

## 2026-05-08 — Session-Loading Real-Test-Plan (Wave 0)

### Mehrstufige Pure-Function-Refactors lassen Wrapper transitiv tot werden
**Kontext:** Im Wave-0-Refactor von `file_reader.rs` wurden drei verschachtelte Funktionen pure-extrahiert: `parse_session_jsonl` → `parse_session_jsonl_str`, `find_project_dir` → `find_project_dir_in`, `scan_sessions_for_project` → `scan_sessions_for_project_in`. Der Plan sagte "Wrapper-API unveraendert lassen", aber: weil `scan_sessions_for_project` so umgeschrieben wurde, dass er direkt `scan_sessions_for_project_in` aufruft (statt durch beide Wrapper-Pärchen zu gehen), bekam `find_project_dir` (Wrapper) keinen Caller mehr. `cargo check` warf eine `dead_code`-Warning, `cargo clippy -- -D warnings` waere blockiert worden.
**Erkenntnis:** Bei nested-pure-Refactors (A ruft B → beide werden pure-extrahiert) gilt: der innere Wrapper wird transitiv tot, weil der aeussere Wrapper jetzt direkt zur pure Variante des inneren springt. Pre-Refactor-Plan muss das antizipieren — sonst entsteht im Verifikations-Gate ein "ueberraschender" Cleanup-Schritt, der nicht im Plan steht.
**Regel:** Vor jedem Pure-Refactor mit verschachtelten Funktionen: Caller-Graph zeichnen. Pro Wrapper-Funktion pruefen "Hat der nach dem Refactor noch Caller?". Wrapper ohne Caller im selben Commit loeschen, nicht spaeter aufraeumen. Plan-Dokument muss "Wrapper-Lifecycle" pro Funktion explizit machen: keep / collapse / delete.

### Refactor-Verification ohne Function-Tests fuehlt sich gruen an, ist aber blind
**Kontext:** Wave 0 Refactor (3 Funktionen pure-extrahiert) lief mit 1146 Frontend + 300 Rust = 1446 Tests gruen durch. Aber: KEINE dieser Tests deckt die drei refactorten Funktionen direkt ab — `parse_session_jsonl`, `find_project_dir`, `scan_sessions_for_project` haben keine Unit-Tests, nur Tauri-Command-Boundary-Tests. "Tests gruen" hat hier nur "kompiliert + bricht keine bestehenden Tests" verifiziert, nicht "Verhalten unveraendert".
**Erkenntnis:** Bei Refactors von ungetesteter Logik gibt "alle Tests gruen" nur Build-Confidence, keine Behavior-Confidence. Der Fix war ein zusaetzlicher Layer: Code-Review-Subagent mit explizitem Auftrag "behavior-equivalence Zeile-fuer-Zeile pruefen". Das ist die einzige nicht-mockup-Verteidigung gegen "kompiliert, aber tut was anderes".
**Regel:** Refactor-Verification-Gate hat zwei Stufen: (1) Build/Test-Suite gruen, (2) Behavior-Equivalence-Review (entweder per Subagent oder per neuem Test der die alte UND neue Implementation gleich behandelt). Stufe 2 ist nicht optional, wenn die refactorten Funktionen keine eigenen Tests haben.

### `pub` als Sichtbarkeits-Erhoehung fuer Tests ist OK, aber im Plan dokumentieren
**Kontext:** Die drei pure-extrahierten Funktionen wurden `pub` deklariert, weil Layer-A Integration-Tests in `src-tauri/tests/` ein **separates Crate** sind und `pub(crate)` daher nicht reicht. Der Plan hatte "API unveraendert" gesagt, aber API-Surface ist bewusst gewachsen.
**Erkenntnis:** "Wrapper-API unveraendert" und "Pure-Variante neu sichtbar" sind zwei verschiedene Dinge. Beim Plan zur Test-Coverage muss die Sichtbarkeits-Erhoehung explizit als Akzeptanz-Kriterium genannt werden, sonst entsteht der Eindruck eines stillen API-Bruchs.
**Regel:** Test-Enabler-Refactor-Plaene listen pro neue pure Funktion ihre **Sichtbarkeit** (`pub` / `pub(crate)`) und ihre **Test-Begruendung** ("warum reicht pub(crate) nicht?"). Kein implizites pub-Hinzufuegen.

### Sparse-Files via `set_len` schlagen Real-Writes fuer Size-Cap-Tests
**Kontext:** Wave 1 brauchte einen Test, der eine 100MB+1-Datei erzeugt um den `MAX_JSONL_SIZE_BYTES`-Cap zu verifizieren. Real 100MB schreiben dauert auf einem normalen System 5-30 Sekunden, was Test-Suites unbrauchbar macht. `std::fs::File::create + set_len(101 * 1024 * 1024)` erzeugt eine sparse File in <1ms — `metadata.len()` returnt die logische Groesse korrekt, der Cap-Check greift, kein Disk-Druck.
**Erkenntnis:** Sparse-Files sind das richtige Werkzeug fuer "is the size-check working?"-Tests. Der Filesystem-Layer simuliert dem Caller eine grosse File ohne reale Bytes. Funktioniert auf NTFS, ext4, APFS, tmpfs — also auf allen Test-Hosts ohne Aenderung.
**Regel:** Bei Tests fuer Size-/Length-Limit-Checks: `File::create(...) + set_len(LIMIT + 1)`. Niemals real-write. Test-Laufzeit muss unter 100ms bleiben damit die Suite < 1s gesamt bleibt.

### Integration-Tests in `tests/`-Dir muessen `pub`-API nutzen, nicht inline
**Kontext:** Wave 1 hat `src-tauri/tests/session_discovery.rs` neu angelegt. Erste Iteration scheiterte mental am Sichtbarkeits-Modell: `tests/`-Dateien sind ein **separates Crate**, ihr `use agenticexplorer_lib::...` greift nur auf `pub` Items. Inline-`#[cfg(test)] mod tests` koennen `super::*` verwenden und auch private Items sehen. Plan muss klarstellen: was ist Inline-Test (private Helpers OK), was ist Integration-Test (nur public-API).
**Erkenntnis:** Test-Layer-Position ist eine API-Surface-Entscheidung, keine Datei-Layout-Entscheidung. Wenn ein Test in `tests/` landet, muss die getestete Funktion `pub` sein. Wenn sie privat bleiben soll, gehoert der Test ins gleiche File.
**Regel:** Layer-A-Plaene listen pro Test seinen Layer-Position (`inline` / `tests/`) und die Sichtbarkeit der Production-Funktion. Bei `tests/`-Position: explizite `pub`-Akzeptanz im Plan-Dokument, sodass der Surface-Bruch sichtbar ist.

### Erste Iteration vom Plan ist eine Schaetzung — Reviewer-Pass deckt Coverage-Loecher auf
**Kontext:** Wave 1 Plan listete 15 Tests (parse:6 / find:4 / scan:3 / m2:1 / size-cap:1) als "alle 16 Tests gruen". Erste Iteration lieferte alle 15 + 3 Smoke-Tests = 18 gruen. Reviewer-Subagent fand nach Code-Read 12 zusaetzliche Findings: ungetestete `is_uuid_like`-Filter-Branch, ungetestete nested `<uuid>/<uuid>.jsonl`-Layout (mit subagent-counting), tool-result-Array-Branch, sidechain-Filter, missing-timestamp-Pfad, cwd/gitBranch-Extraction, fixture-builder-JSON-safety, MB/MiB-doc-drift, oversized-Test-passt-silent-bei-Cap-Bypass. Nach Adressierung: 21 Tests, alle 12 Items adressiert.
**Erkenntnis:** Plan-Dokumente listen "die offensichtlichen" Test-Cases aus der Bird's-Eye-View. Reviewer mit Code-in-der-Hand findet die nicht-offensichtlichen Branch-Edges. Ohne Reviewer-Pass haette der erste Wave-1-Commit eine Suite produziert die **drei kritische Branches komplett ungetestet** liess (uuid-Filter, nested-Layout, tool-result-Array). Diese drei Branches sind Production-Logik mit echten Failure-Modes (App ingestiert beliebige .jsonl-Dateien / subagent_count immer 0 / tool_result als user-turn gezaehlt → Title-Korruption).
**Regel:** Test-Plan-Disziplin: erste Plan-Iteration produziert Skeleton (~70% Coverage), zweite Iteration nach Reviewer-Pass produziert Production-Coverage. **Kein Layer-A/B/C Plan ist "fertig" ohne Reviewer-Round** — sonst entsteht eine Suite die "100% des Plans" abdeckt und 30% des Codes. Plan-Phase muss explizit eine "Reviewer-Iteration" als Pflicht-Step zwischen "Tests geschrieben" und "Tests committed" enthalten.

### Sparse-File + Valid-JSON-Prefix = robuster Size-Cap-Test
**Kontext:** Erste Version von `oversized_jsonl_is_skipped` schrieb eine 101-MiB-Sparse-File (alle NUL) + eine kleine valid JSONL. Reviewer-Argument: Wenn Cap auf 1 TB gebumpt wird, wird oversized File trotzdem gelesen → 101 MiB NUL = "ein big line that's not valid JSON" → 0 user_turns → result.len() bleibt 1 → Test passt silent durch obwohl der Cap nicht firet.
**Erkenntnis:** Size-Cap-Tests muessen so konstruiert sein dass ein Bypass eine **andere Anzahl** Resultate produziert, nicht "kein Resultat". Sparse-File mit valid-JSON-Prefix loest das: Cap firet → 1 result. Cap bypass → 2 results. Differential-Diagnose statt Single-Outcome.
**Regel:** Limit-Check-Tests immer als Differential-Test bauen: write das, was den Limit verletzt UND was bei Bypass valides Verhalten triggert. Nur dann ist ein Bypass detektierbar. "Limit firet → no result" ist die schwaechste Form, weil sie auch passt wenn das Bypass-Verhalten degeneriert ist.

### Vitest-Config-Split fuer "echte" vs. "schnelle" Tests
**Kontext:** Wave 2 brauchte einen Test-Layer ohne globale `vi.mock("@tauri-apps/api/event")`-Shim. Loesung: zweite Config `vitest.config.integration.ts` mit eigenem `setup.integration.ts`. Naming-Konvention: `*.integration.test.ts` statt `*.test.ts`. KRITISCH: das `**/*.{test,spec}.{ts,tsx}`-Glob der Original-Config matcht ALLE Dateien die mit `.test.ts` enden — also auch `*.integration.test.ts`. Ohne explizites `exclude` haetten die neuen Tests **doppelt** gelaufen, einmal mit globaler Mock-Verkabelung (kaputt) und einmal ohne (richtig). Erste Iteration hatte exakt das Problem: 18 vorbestehende `sessionStore.integration.test.ts` Tests liefen unter beiden Configs.
**Erkenntnis:** Naming-Konventionen mit Doppel-Punkt-Suffix (`.integration.test.ts`) sind beim Test-Layering trickreich, weil Glob-Patterns sie als beide Suffixe matchen. Ohne explizites `exclude` produziert man Doppel-Runs mit divergenten Setups, was Tests die unter einer Config gruen sind unter der anderen brechen laesst — und beide Reports gemischt sind.
**Regel:** Bei Vitest-Config-Splits IMMER beide Seiten symmetrisch konfigurieren: die spezifische Config hat `include`-Pattern, die generische Config hat `exclude`-Pattern fuer dasselbe. Test-Setup-Doku muss klar sagen welche Config welche Tests laeuft, sonst entsteht Mock-Drift.

### Tauri-Event-Mock vs. Production-Code-Mock — die richtige Boundary
**Kontext:** Wave 2 musste entscheiden: ist `vi.mock("@tauri-apps/api/event")` ein Production-Code-Mock (User: VERBOTEN) oder ein Runtime-Boundary-Shim (User: erlaubt)? Tauri laeuft in jsdom nicht — es gibt keinen echten Event-Bus. Ohne Shim wuerde `listen()` mit `__TAURI_INTERNALS__ undefined` werfen, jeder Hook-Test waere unmoeglich. Mit Shim koennen Tests Events synthetisch ausloesen via `emitTauriEvent()`. Production-Hooks rufen `listen()` exakt wie in Production — nur die "andere Seite" der Wire ist gestubt.
**Erkenntnis:** "Module mock" und "Runtime shim" sind nicht dasselbe, auch wenn beide `vi.mock` benutzen. Modul-Mock ersetzt Production-Logik (verboten). Runtime-Shim ersetzt eine Laufzeit-Schnittstelle die im Test-Env nicht verfuegbar ist (notwendig). Die Boundary ist klar: was IM SOURCE-VERZEICHNIS liegt darf nicht gemockt werden, was nur als RUNTIME existiert (Tauri-Bridge, native APIs, OS-Events) muss geshimt werden.
**Regel:** Bei Test-Setup-Plaenen pro `vi.mock`-Aufruf explizit dokumentieren: ist das ein Production-Code-Mock (verboten) oder Runtime-Boundary-Shim (akzeptiert)? Source-Code-Mocks haben eine eindeutige Begruendung warum sie unvermeidbar sind, oder werden gestrichen. Runtime-Shims werden mit Kommentar verzeichnet: "Tauri runs not available in jsdom — shim provides routable bus".

### JS-Reimplementation von Rust-Logik: Drift-Risiko explizit mit Layer-A-Anker absichern
**Kontext:** `buildScanClaudeSessionsHandler` in Wave 2 ist eine JS-Reimplementation von `scan_sessions_for_project` aus `file_reader.rs`. Frontend-Tests benutzen die JS-Version, Backend-Tests (Layer A) die Rust-Version. Wenn die Rust-Logik kuenftig aendert (z.B. neuer Field-Parser, andere Sort-Order), driftet die JS-Reimplementation lautlos und Frontend-Tests bestaetigen Verhalten das in Production gar nicht mehr existiert. Mitigation: jede JS-handler-Funktion hat einen DOC-COMMENT der auf die analoge Rust-Funktion verweist + ein Layer-A-Test der dasselbe Fixture gegen die echte Rust-Version laufen laesst.
**Erkenntnis:** Cross-Language-Reimplementations koennen niemals "fertig" sein, sie sind kontinuierliche Pflege. Der Drift ist unvermeidbar; die einzige Verteidigung ist DUAL-COVERAGE: gleiche Fixtures gegen JS UND Rust (Layer A + Layer B), und ein Contract-Test der die Output-Shapes beider Sites vergleicht.
**Regel:** Pro JS-Reimplementation einer Backend-Funktion: (1) DOC-Comment mit File:Line auf die Rust-Source. (2) Mindestens ein Layer-A-Test mit gleichem Fixture-Shape wie die Layer-B-Tests. (3) Optional: Snapshot-File geteilt zwischen Rust und JS — beide schreiben/lesen die Snapshot, CI-Diff bricht bei Drift.

---

## 2026-05-08 — Wave 3+4 Layer-B Tests + Bug-Fixes

### Vitest-fake-timers + libuv-FS = unbestimmte Async-Race
**Kontext:** B3.2 Test (useSessionEvents) nutzte `vi.useFakeTimers()` + `buildScanClaudeSessionsHandler(projectsRoot)` mit echter `fs.promises.readFile`. Erste Iteration: 3 von 5 Tests rot, alle mit `claudeSessionId === undefined`. Ursache: `vi.advanceTimersByTimeAsync(3000)` fired den Discovery-Timer und drained Microtasks, ABER `await fs.readFile(path)` resolved via libuv I/O — **nicht** Microtask. Selbst mit `realSetImmediate` als zusätzlicher Yield reichte die Synchronisation nicht stabil. Echte FS-Reads in fake-timer-Tests sind **fundamentell unbestimmt**.
**Erkenntnis:** Test-Layer-Scope-Disziplin ist wichtiger als Test-Wirklichkeitsnähe. Wenn Layer-B die *Discovery-Logik* testet (closest-timestamp, claim-Set, Retry-Cadence), gehört der FS-Read NICHT in den Test-Scope — der wird in Layer-A (Rust integration) abgedeckt. Canned-Data-Handler statt Real-FS ist sauberer Layer-Cut.
**Regel:** In Layer-B-Tests mit `vi.useFakeTimers()` NIEMALS Real-FS-Operations in IPC-Handler. Stattdessen Canned-Data-Map: `{ folder → entries[] }`. Real-FS gehört in Layer-A oder Tests ohne fake-timers. Mischung beider Welten produziert flaky Tests die "manchmal" passen.

### Vitest-Config-Splits brauchen Build-Constants explizit
**Kontext:** Wave 3 B3.6 (App.tsx integration) crashte mit `ReferenceError: __GIT_HASH__ is not defined`. Der ChangelogDialog rendert das. `vite.config.ts:15-18` definiert das via `define: { __GIT_HASH__: JSON.stringify(getGitHash()) }`. Die separate `vitest.config.integration.ts` erbte das **nicht** — `define` ist eine Vite-spezifische Build-Time-Substitution, kein zur Compile-Time geerbtes Modul. Nach Hinzufügen einer `define`-Section landete der nächste Crash auf `__BUILD_DATE__`.
**Erkenntnis:** Vitest-Configs müssen ALLE Vite-Build-Constants spiegeln, die in der Render-Tree-Tiefe vorkommen können. Nicht nur die "offensichtlichen" — `__BUILD_DATE__` war kein Front-of-Mind, aber er wurde in einem komplett anderen Modul verwendet.
**Regel:** Bei Vitest-Config-Splits eine `define`-Section anlegen die alle `vite.config.ts` define-Werte 1:1 spiegelt (mit Test-Stub-Werten). Cross-Reference-Comment auf vite.config.ts:N damit Drift bei vite-config-Änderungen sichtbar ist.

### Zustand-Persist: Validation gehört in onRehydrateStorage, NICHT nur in migrate
**Kontext:** Wave 4 F4.2 sollte UUID-Validation für `claudeSessionId` in der Settings-Migration anwenden (Issue #209). Erste Iteration: Validation in `migrate()` Funktion gepackt — Tests blieben rot. Ursache: `migrate` wird nur aufgerufen wenn die persistierte Schema-Version vom aktuellen Schema abweicht. Test seedet mit `version: 3, state: {...}`, aktuelles Schema ist auch `version: 3` → KEIN migrate-Call → KEINE Validation.
**Erkenntnis:** `migrate` ist für Schema-Änderungen, NICHT für Content-Validation. Content-Validation muss bei JEDER Hydration laufen, nicht nur bei Schema-Bump. Der richtige Hook ist `onRehydrateStorage` der zustand-persist-Middleware.
**Regel:** Bei Zustand-Persist-Stores: Schema-Migrations in `migrate`, Content-Validation in `onRehydrateStorage`. Beide rufen denselben pure-validation-Helper auf (defense-in-depth: schema-bump + content-fix bei jedem Load).

### Skip-mit-TODO ist besser als flaky Tests
**Kontext:** B3.6 (App.tsx integration) test rechnete mit `vi.mock("@tauri-apps/api/window")` + dynamic `import()` interaction in jsdom. Spy wurde 0× getroffen statt 1×. Ursache vermutet: jsdom + vitest-fake-timers + dynamic-import + microtask-flushing geht in eine unbestimmte Race-Condition. Production-Fix (App.tsx:64 `return` keyword) ist verifiziert korrekt; der Test-Harness ist das Problem.
**Erkenntnis:** Hartnäckige flaky Tests sind schlechter als ein dokumentierter Skip. Ein flaky Test trainiert das Team Failures zu ignorieren ("der ist halt manchmal rot"). Ein Skip mit klarem TODO ist ehrlich: "wir wissen, was hier fehlt, hier ist der Plan."
**Regel:** Wenn ein Test nach 30 Min Debugging immer noch unbestimmt ist: skip mit `it.skip("TODO[Wave-X.5]: <reason>")`. Production-Fix stand-alone validieren (Code-Review, manuell, Layer-A-Pattern-Test). Niemals committen "test runs sometimes" — das ist Lüge.

### 6 parallele Subagenten für Test-Files: 4 grün, 2 brauchen Triage
**Kontext:** Wave 3 dispatchte 6 Subagenten parallel (B3.1-B3.6). Output: 34 Tests. Bei Verifikation: 4 Files vollständig grün (B3.3 useSessionCreation 7/7, B3.4 useSessionRestore 7/7, plus die existing 18 + 13 smoke), 2 Files brauchten Triage:
- **B3.1** sessionRestoreSync: 5/7 — die 2 RED waren die Issue-#215-TDD-Tests, korrekt rot bis Wave 4
- **B3.5** settingsStore.migration: 2/5 — die 3 RED waren Issue-#209-TDD-Tests, korrekt rot bis Wave 4
- **B3.2** useSessionEvents: 2/5 — fake-timer + libuv-collision (siehe oben, fixiert via canned-data)
- **B3.6** App.integration: 0/3 — Vite-Build-Constants + jsdom-flakiness (define + skip)
**Erkenntnis:** Parallel-Subagenten produzieren unterschiedliche Qualitätsstufen abhängig von Test-Komplexität. Einfache Test-Files (lokale State-Manipulation, einfache Mocks) klappen verlässlich. Komplexe Test-Setups (fake-timers + I/O, dynamic imports + jsdom) brauchen menschliche Triage.
**Regel:** Subagenten-Briefs für Test-Files explizit kategorisieren: "EINFACH" (lokale State, wenige Dependencies) vs. "KOMPLEX" (timer-control, dynamic import, full-app render). Bei KOMPLEX: Subagent-Output IMMER vom Orchestrator vor Commit verifizieren + Reserve-Zeit für Triage einplanen (~30% der Subagent-Zeit).

---

## 2026-05-08 — Scrollback-History Phase 1 (xterm scrollback hardcap fix)

### Hard-Coded UI-Limits sind versteckter Tech-Debt
**Kontext:** `SessionTerminal.tsx:87` hatte `scrollback: 5000` als Konstante. xterm-Default ist 1000, das Repo war 5× erhöht — galt als "großzügig". Tatsache: Claude-CLI-Sessions (Tool-Calls + TUI-Repaints + Status-Bar-Refreshes) verbrauchen 5-10× den Output normaler Shells. 5000 reicht für ~30 Min, dann fängt FIFO-Eviction an. User-Pain: "beim Hochscrollen ist Verlauf abgeschnitten."
**Erkenntnis:** Numerische Limits in UI-Komponenten sind nicht "Defaults" — sie sind ungeschriebene Architektur-Entscheidungen, die User-Pain verursachen ohne dass der Code es sagt. xterm-Default 1000 ist für Standard-Shells optimiert (kurze CLI-Outputs), nicht für TUI-heavy Tools wie Claude-CLI. Use-Case-spezifische Defaults gehören in Settings, nicht in Source.
**Regel:** Jedes hard-coded numeric Limit in einer UI-Komponente ist ein Settings-Kandidat. Bei Discovery (z.B. via Bug-Report): NICHT die Konstante erhöhen, sondern in `settingsStore` ziehen + Sanitize-Helper + UI-Slider mit Memory-Hint. Default = das Limit das den dominanten Use-Case happy macht (hier: 25k = 5× das alte Hard-Code-Limit, gerechnet auf typische Claude-Session).

### Pre-Existing Tests mit hard-coded Type-Shapes brechen bei Type-Erweiterung
**Kontext:** Hinzufügen eines required Fields `scrollbackLines: number` zu `AppPreferencesSettings` brach 10 Test-Files die das Type explizit konstruieren (`{ frontendLogging: false, backendFileLogging: false, performanceProfiler: false, showProtokolleTab: false }` ← jetzt unvollständig). TSC fängt das, aber jeder Test musste manuell erweitert werden.
**Erkenntnis:** Tests die einen Production-Type explizit konstruieren statt einen Builder-Helper zu verwenden, koppeln sich tief an die Type-Shape. Bei jeder Schema-Erweiterung: 10× Edit. Builder-Helper (`buildPreferences({ frontendLogging: true })`) wäre wartungsärmer aber keiner hat das von Anfang an gemacht.
**Regel:** Bei Hinzufügen eines required Fields zu Production-Types: TSC laufen lassen, ALLE betroffenen Tests im selben Commit anpassen. Optional Tech-Debt-Eintrag: einen `buildPreferences(partial)`-Helper anlegen sodass künftige Erweiterungen nur den Helper anfassen statt 10 Tests.

### Sanitize-Helper für persistierte numeric Settings ist Defense-in-Depth
**Kontext:** `scrollbackLines` ist `number` in `AppPreferencesSettings`. Settings-UI gibt nur Presets (5k/10k/25k/50k), aber persistierter State auf Disk könnte korrupt sein (manuelle Edit, alter Schema-Bug, Migration-Drift). Ohne Clamp könnte `scrollbackLines: 999_999_999` durchrutschen → 12 GB Memory pro Terminal → OOM.
**Erkenntnis:** Bei numeric Settings die in Production-Code als Limit verwendet werden (Memory, Disk, Timeout): IMMER Sanitize-Helper am Use-Site. Hard-Ceiling weit über UI-Maximum (hier: UI-Max 50k, Sanitize-Ceiling 100k) als Safety-Net gegen tampering oder Migration-Drift. Floor ebenfalls (1k) damit absurd kleine Werte nicht xterm crashen.
**Regel:** Pro persistiertem numeric Setting: Sanitize-Funktion exportiert (pure, testbar) die min/max clampt + non-numeric/NaN/Infinity zu Default fällt. Use-Sites rufen Sanitize, nicht direkt das Setting. UI-Selector nutzt nur freigegebene Presets, aber Sanitize bewacht den gesamten Pfad.
