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
