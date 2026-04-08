# /requirements-workshop — Requirements Engineering & Sprint-Planung

> **Zweck:** Strukturierte Anforderungserfassung und Dokumentations-Synchronisation.
> Zwei Modi: Sprint-Retrospektive (nach Sprint) und Feature-Workshop (vor Implementation).

## Aufruf

```
/requirements-workshop              → Sprint-Modus (Default)
/requirements-workshop sprint       → Sprint-Retrospektive + naechster Sprint planen
/requirements-workshop [feature]    → Feature-Workshop fuer einzelnes Feature
```

---

## Phase 0: Kontext-Inventur

> Beide Modi starten hier. Projektstand erfassen bevor Spezialisten arbeiten.

**Inputs lesen:**
- `tasks/lessons.md` — relevante Patterns pruefen
- `tasks/todo.md` — aktueller Sprint-Status
- `tasks/ideas.md` — offene Ideen
- `Softwareprozess/arc42-specification.md` — Architektur-Stand (Version, Roadmap Kap. 4.3, Risiken Kap. 11)
- `tasks/sprint-plan-v1.5-v2.0.md` — Forecast
- `CHANGELOG.md` — letzte 2-3 Releases
- GitHub: `gh issue list --state open` + `gh issue list --state closed --limit 20`

**Kontext-Zusammenfassung erstellen:**
- Aktuelle App-Version
- Abgeschlossene / offene Items
- Test-Stand (Tests + Coverage)
- Offene Ideas und Lessons

**Modus-Dispatch:** Basierend auf `$ARGUMENTS`:
- Leer oder "sprint" → **Sprint-Modus** (Phase S1)
- Alles andere → **Feature-Modus** (Phase F1) mit Feature-Name = Argument

---

# SPRINT-MODUS

## Phase S1: 3 parallele Spezialisten-Analysen

Starte 3 Subagenten **parallel** (`run_in_background: true`):

### Agent 1: Delivery-Analyst
- **subagent_type:** Explore
- **Aufgabe:** Sprint-Ergebnis analysieren
- **Inputs:** git log seit letztem Release-Tag, geschlossene Issues, Sprint-Plan
- **Liefert (max 500 Woerter):**
  - Was wurde geliefert vs. geplant?
  - Velocity-Trend (mehr/weniger als geschaetzt?)
  - Unerledigte Items + Gruende
  - 2-3 Empfehlungen fuer naechsten Sprint

### Agent 2: Tech-Debt-Reviewer
- **subagent_type:** Explore
- **Aufgabe:** Code-Qualitaet und technische Schulden bewerten
- **Inputs:** vitest.config.ts, cargo clippy, arc42 Kap. 11 (Risiken/Schulden), lessons.md
- **Liefert (max 500 Woerter):**
  - Coverage-Trend (gestiegen/gefallen?)
  - Neue technische Schulden identifiziert?
  - Abgebaute Schulden seit letztem Sprint
  - 2-3 Tech-Debt-Items fuer naechsten Sprint

### Agent 3: Product-Strategist
- **subagent_type:** Explore
- **Aufgabe:** Roadmap-Alignment und Feature-Vollstaendigkeit
- **Inputs:** arc42 Kap. 4.3 (Roadmap), ideas.md, offene GitHub Issues
- **Liefert (max 500 Woerter):**
  - Sind wir on-track fuer die naechste Major-Version?
  - Welche Features aus der Roadmap sind reif?
  - Welche Ideas sollten aufgenommen werden?
  - 2-3 Feature-Vorschlaege fuer naechsten Sprint

**Warte bis alle 3 Agenten fertig sind.**

---

## Phase S2: Synthese + Sprint-Vorschlag

**Agent:** Hauptagent (kein Subagent)

Konsolidiere die 3 Reports:
1. Duplikate eliminieren
2. Priorisierung nach Projekt-Kriterien (aus CLAUDE.md): Persistenz-Verlust > Security > UI-Regression > Store-Logik
3. Kapazitaets-Schaetzung: Solo-Dev, ~2 Wochen Sprint, realistisch 5-8 Issues
4. Widersprueche identifizieren (z.B. Strategist will Feature X, Debt-Reviewer warnt vor Complexity)

**Erstelle Sprint-Vorschlag:**
- Sprint-Ziel (1 Satz)
- Priorisierte Issue-Liste (Titel, Scope, Schaetzung S/M/L)
- Welche Ideas aus ideas.md aufgenommen werden
- Was bewusst verschoben wird
- Offene Fragen / Widersprueche

---

## Phase S3: STOPP — User-Review

Praesentiere dem User:

```
## Sprint [X] Abschluss-Zusammenfassung
[Metriken: Tests, Coverage, Issues geschlossen, Releases]

## Vorschlag: Sprint [X+1]
**Ziel:** [1 Satz]

### Issues (priorisiert)
1. [Titel] — [S/M/L] — [Begruendung]
2. ...

### Aus Ideas aufgenommen
- [Idee] → Vorgeschlagen als [Issue-Titel]

### Bewusst verschoben
- [Item] — Grund: [...]

### Offene Fragen
1. [Frage] — Gestellt von: [Agent]
2. ...

### Widersprueche
- [Agent A] empfiehlt X, [Agent B] warnt vor Y. Vorschlag: Z.
  → Was bevorzugst du?
```

**STOPP.** Warten auf User-Input. Keine automatische Weiterarbeit.
User kann: Items hinzufuegen/entfernen, Prios aendern, Fragen beantworten.

---

## Phase S4: Dokument-Aktualisierung

**WICHTIG: Nur Edit, nie Write. Nur Sektionen aendern die sich tatsaechlich geaendert haben.**

1. **`Softwareprozess/arc42-specification.md`** aktualisieren:
   - Titelseite: Version + Stand + App-Version
   - Kap. 4.3 Roadmap: Erreichte Milestones als "ABGESCHLOSSEN" markieren
   - Kap. 10: Test-Pyramide mit aktuellen Zahlen
   - Kap. 11: Geloeste Schulden durchstreichen, neue ergaenzen

2. **`tasks/sprint-plan-v1.5-v2.0.md`** aktualisieren:
   - Abschluss-Report des alten Sprints mit Metriken
   - Neuer Sprint mit Gantt-Diagramm (Mermaid)
   - Kanban-Board aktualisieren

3. **`tasks/todo.md`** aktualisieren:
   - Abgeschlossene Items archivieren
   - Neue Sprint-Items eintragen

4. **`tasks/ideas.md`** aktualisieren:
   - Aufgenommene Ideas als "in Sprint vX.Y uebernommen" markieren

---

## Phase S5: GitHub-Issues erstellen

Fuer jedes Sprint-Item ein GitHub Issue erstellen:

```bash
gh issue create \
  --title "[Titel]" \
  --body "$(cat <<'EOF'
## Beschreibung
[Aus Sprint-Vorschlag]

## Akzeptanzkriterien
- [ ] AC 1
- [ ] AC 2

## Aufwand: [S/M/L]
## Sprint-Ziel: [Sprint-Ziel-Referenz]

Umsetzung via `/implement #<issue-number>`
EOF
)" \
  --milestone "v[X.Y]" \
  --label "[labels]"
```

**Output:** Liste aller erstellten Issues mit URLs.

**Abschluss-Meldung:** Zusammenfassung was aktualisiert wurde + naechste Schritte.

---

# FEATURE-MODUS

## Phase F1: 3 parallele Feature-Analysen

Starte 3 Subagenten **parallel** (`run_in_background: true`):

### Agent 1: UX-Analyst
- **subagent_type:** Explore
- **Aufgabe:** Feature aus User-Perspektive durchleuchten
- **Inputs:** Feature-Name, bestehende UI-Komponenten (src/components/), aehnliche Features
- **Liefert (max 400 Woerter):**
  - 2-4 User Stories: "Als [Rolle] moechte ich [Aktion], damit [Nutzen]"
  - Interaktionsfluss (Schritt-fuer-Schritt)
  - Edge Cases aus Nutzersicht
  - UI-Komponenten die betroffen/neu sind

### Agent 2: Architektur-Analyst
- **subagent_type:** Explore
- **Aufgabe:** Technische Machbarkeit und Architektur-Impact
- **Inputs:** Feature-Name, src/store/, src-tauri/src/, arc42 Kap. 5 (Bausteine)
- **Liefert (max 400 Woerter):**
  - Betroffene Dateien/Module
  - Neue vs. geaenderte Komponenten
  - Abhaengigkeiten zu anderen Features
  - Aufwands-Schaetzung (S/M/L/XL) mit Begruendung
  - Risiken

### Agent 3: QA-Analyst
- **subagent_type:** Explore
- **Aufgabe:** Testbarkeit und Akzeptanzkriterien
- **Inputs:** Feature-Name, bestehende Tests, vitest.config.ts
- **Liefert (max 400 Woerter):**
  - 4-6 Akzeptanzkriterien (testbar formuliert)
  - Kritische Testfaelle
  - Regressions-Risiken
  - Security-Aspekte (Tauri 5-Fragen-Checkliste falls relevant)

**Warte bis alle 3 Agenten fertig sind.**

---

## Phase F2: Deliberation + Konsens

**Agent:** Hauptagent (kein Subagent)

1. User Stories konsolidieren (UX-Report als Basis)
2. Architektur-Constraints einarbeiten (ggf. Stories anpassen wenn technisch nicht machbar)
3. Akzeptanzkriterien aus QA-Report den Stories zuordnen
4. Widersprueche identifizieren und markieren
5. Confidence-Score pro Requirement (0-100%):
   - 90-100%: Alle 3 Agenten einig
   - 60-89%: Mehrheit einig, Minor-Widersprueche
   - <60%: Offene Debatte, User muss entscheiden

**Erstelle Feature-Spec-Entwurf:**
- Titel + Kurzbeschreibung
- User Stories mit Akzeptanzkriterien
- Technischer Ansatz (betroffene Dateien, neues vs. geaendertes)
- Aufwandsschaetzung (S/M/L/XL)
- Offene Fragen / Widersprueche mit Confidence-Score

---

## Phase F3: STOPP — User-Review

Praesentiere dem User:

```
## Feature-Spec: [Feature-Name]

### User Stories
1. **US-1:** Als [Rolle] moechte ich [Aktion], damit [Nutzen]
   - AC: [Kriterium 1], [Kriterium 2]
   - Confidence: [X]%

### Technischer Ansatz
- Betroffene Dateien: [Liste]
- Neue Komponenten: [Liste]
- Aufwand: [S/M/L/XL]
- Risiken: [Liste]

### Offene Fragen
1. [Frage] — Confidence: [X]%

### Widersprueche
- [Agent A] sagt X, [Agent B] sagt Y. Vorschlag: Z.

### Empfehlung
Dieses Feature ist [S/M/L/XL], empfohlen fuer Sprint v[X.Y].
```

**STOPP.** Warten auf User-Feedback.
User kann: Stories aendern, ACs anpassen, Scope reduzieren, Fragen beantworten.

---

## Phase F4: Dokument-Integration

**Nur bei User-Go. Nur Edit, nie Write.**

1. **`Softwareprozess/arc42-specification.md`** — Feature in Roadmap eintragen (Kap. 4.3) falls noch nicht vorhanden
2. **`tasks/todo.md`** — Sprint-Item eintragen (falls Sprint zugeordnet)
3. **`tasks/ideas.md`** — Idee als "Workshop durchgefuehrt, siehe Issue #X" markieren (falls aus ideas.md)

---

## Phase F5: GitHub-Issue erstellen

Ein Issue mit vollstaendiger Spec erstellen:

```bash
gh issue create \
  --title "[Feature-Titel]" \
  --body "$(cat <<'EOF'
## Beschreibung
[Aus Feature-Spec]

## User Stories
- [ ] US-1: Als [Rolle] moechte ich [Aktion], damit [Nutzen]
- [ ] US-2: ...

## Akzeptanzkriterien
- [ ] AC-1: [Kriterium]
- [ ] AC-2: [Kriterium]
- [ ] AC-3: [Kriterium]

## Technischer Ansatz
[Betroffene Dateien, Architektur-Hinweise]

## Aufwand: [S/M/L/XL]
## Abhaengigkeiten: [#issue-refs]

---
Generiert via `/requirements-workshop`
Umsetzung via `/implement #<issue-number>`
EOF
)" \
  --milestone "v[X.Y]" \
  --label "[labels]"
```

**Output:** Issue-URL + Hinweis: "Umsetzung starten mit `/implement #<issue-number>`"

---

# REGELN

1. **Alle Diagramme als Mermaid** — kein ASCII-Art
2. **Docs aktualisieren = Edit** — nie ganze Dateien ueberschreiben
3. **STOPP-Punkte einhalten** — Phase S3 / F3 sind STOPP. Nicht weiterarbeiten ohne User-Input
4. **Lessons pruefen** — Phase 0 immer lessons.md lesen, relevante Patterns beachten
5. **Keine Code-Aenderungen** — dieser Skill aendert nur Docs und erstellt Issues
6. **Coverage pruefen** — in S1 immer aktuellen Coverage-Stand mit `npm run test:coverage` ermitteln
7. **GitHub als Source of Truth** — Issue-Status immer via `gh issue list` pruefen, nicht aus todo.md ableiten
