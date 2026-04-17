# Design-System-Intake (AgenticExplorer)

## Context

Ein externes Design-System-Paket wurde als Zip in `docs/design-system.zip` abgelegt. Es enthält die kanonischen Regeln (README), eine portable Skill-Definition (SKILL.md), CSS-Tokens, ~30 Preview-HTMLs und ein Referenz-React-Kit.

**Motivation:** Visuelle Konsistenz zementieren bevor die Pipeline-Engine-Arbeit (v2.0) startet. Future Claude-Sessions sollen das System automatisch laden (via CLAUDE.md-Hinweis) und neue Komponenten dagegen auditieren können.

**Intended outcome:** Design-Regeln im Repo eingepflegt, CLAUDE.md verweist darauf, bekannte Drift-Stellen (6 Findings) repariert, Sprint-Backlog/GitHub-Board aktualisiert.

## Executive Summary

Die mitgelieferte Anleitung (Schritte A–H) geht von 4 Annahmen aus, die für dieses Repo **nicht** mehr gelten:

1. **Schritt C (Token-Reconcile) ist bereits erledigt.** `src/index.css` hat schon alle `--duration-*`, `--ease-*`, `--space-*`, `--accent-a0X` und `glow-*`-Werte. → **NO-OP**, wird nur dokumentiert.
2. **Schritt E (Komponenten-Audit) ist deutlich kleiner** als die Anleitung andeutet. Drift-Scan (siehe unten) findet nur 6 Fundstellen — keine 10 separaten PRs nötig.
3. **Schritt F (Logo-Replacement)** bleibt per User-Entscheidung ein Placeholder, d.h. kein Blocker — aber ein separates Follow-up-Issue wird angelegt.
4. **Schritt G (Audit per Claude-Session)** wird hier vorweggenommen (s. Drift-Tabelle).

**PR-Schnitt:** Eine gebündelte Branch `feat/design-system` mit allen Änderungen. GitHub-Issue als Tracker (S:M, Label `chore`+`design`, kein `ready` bis Plan akzeptiert).

## Drift-Befund (aus Explore-Scan)

| Komponente | Drift | Maßnahme |
|---|---|---|
| `src/components/ui/Button.tsx` | none | — |
| `src/components/ui/Input.tsx` | none | — |
| `src/components/ui/Modal.tsx` | none | — |
| `src/components/shared/Panel.tsx` | none | — |
| `src/components/shared/StatusBadge.tsx` | none | — |
| `src/components/shared/Toast.tsx` | **moderate** | Framer-Motion-Spring (`stiffness: 400, damping: 30`) → auf Expo-Easing umstellen. `ease` aus `src/utils/motion.ts` (`EASE.out`) + `DURATION.base` (0.3s) verwenden. |
| `src/components/sessions/SessionCard.tsx` | none | — |
| `src/components/kanban/KanbanCard.tsx` | minor | `rounded-sm` → prüfen dass tatsächlich 2px; andernfalls `rounded-[2px]` explizit. |
| `src/components/layout/SideNav.tsx` | none | — |
| `src/utils/motion.ts` | minor | SPRING-Preset existiert — kommentieren "nur für Toast-Fallback-Ausnahme, sonst nicht verwenden" oder entfernen falls unbenutzt. |

**`rounded-*`-Violations (nicht-Kanban):**

- `src/components/kanban/KanbanDetailModal.tsx:161` → `rounded-md` → `rounded-none`
- `src/components/library/LibraryDetailModal.tsx:60` → `rounded-md` → `rounded-none`
- `src/components/library/LibraryView.tsx:299` → `rounded-lg` → `rounded-none`
- `src/components/sessions/SessionHistoryViewer.tsx:170` → `rounded-md` → `rounded-none`

**Emoji-Hits:**

- `src/components/sessions/PinnedDocViewer.tsx:175` → `📌` → Lucide `Pin`-Icon (`w-3.5 h-3.5`, `currentColor`).

## Plan

### Schritt 0 — Issue anlegen (vor allem anderen)

Issue auf Board #4 (Swimlane "Todo"):

- Titel: `chore(design): Design-System-Intake + Drift-Fix`
- Labels: `chore`, `P2`, `S:M`
- **Kein** `ready`-Label bis Plan akzeptiert
- Body: verweist auf diesen Plan und listet die Drift-Fixes als Checklist
- Nach `gh issue create` sofort: `gh project item-add 4 --owner hossoOG --url <url>`

### Schritt 1 — Zip entpacken (Anleitung A + B)

Branch anlegen: `git checkout -b feat/design-system`.

```
docs/design-system.zip  →  entpacken nach  docs/design-system/
```

**Mapping:**

| Zip-Datei | Ziel | Notiz |
|---|---|---|
| `README.md` | `docs/design-system/README.md` | Style-Contract |
| `SKILL.md` | `docs/design-system/SKILL.md` | Future-Session-Trigger |
| `colors_and_type.css` | **nicht kopieren** | `src/index.css` ist Source of Truth |
| `preview/` | `docs/design-system/preview/` | Visuelle Referenzkarten |
| `ui_kits/agentic-explorer/` | `docs/design-system/ui-kit/` | Reference, kein Prod-Code |
| `assets/logo-placeholder.svg` | `docs/design-system/assets/logo-placeholder.svg` | Per User-Entscheidung temporär übernommen |

**Nach Extract:** `docs/design-system.zip` löschen (in Git nicht tracken; ersetzt durch entpackten Ordner).

**Hilfs-Workflow:**

```bash
unzip -o docs/design-system.zip -d docs/design-system/
rm docs/design-system.zip
```

### Schritt 2 — Token-Reconcile (Anleitung C)

**NO-OP.** `src/index.css` hat Stand `2026-04-17` bereits:

- `--duration-instant/fast/base/slow` (Zeile 66–69)
- `--ease-out/in/in-out` (Zeile 70–72)
- `--space-xs/sm/md/lg/xl/2xl/3xl` (Zeile 75–81)
- `--accent-a05/a10/a15/a30/a40` (Zeile 43–47, 116–120 dark)
- `.glow-accent/success/error/warning` (Zeile 223–234)

Diff-Vergleich gegen `docs/design-system/colors_and_type.css` manuell durchführen (Checkliste im Issue-Body) — erwartet: keine fehlenden Werte. Falls doch: ergänzen.

### Schritt 3 — `CLAUDE.md` ergänzen (Anleitung D)

In `C:\Projects\agentic-dashboard\CLAUDE.md` nach "Coding Conventions" einen neuen Abschnitt anhängen:

```markdown
## Design System

Kanonische Regeln: `docs/design-system/README.md`. Skill-Hinweis: `docs/design-system/SKILL.md`.

Non-negotiable:
- Sharp corners (radius 0) außer Kanban-Cards (2px) und Status-Dots (full-round).
- Ein Akzent (cyan-teal, hue 190) — keine weiteren einführen.
- Deutsche UI-Copy, englische Code-Identifier. Kein Emoji. Kein Unicode-as-Icon.
- Lucide-Icons only, 2px stroke, `currentColor`.
- Exponential Easing `cubic-bezier(0.16, 1, 0.3, 1)`, Durations 100/200/300/500ms, keine Springs/Bounce.
- Flache Surfaces — keine Gradients, Blur, Glassmorphism, Illustrations.
- Panel-Header: UPPERCASE, `tracking-widest` (≥ 0.12em).

Bei neuen Komponenten: gegen Preview-HTMLs in `docs/design-system/preview/` abgleichen.
```

### Schritt 4 — Drift-Fixes (Anleitung E konsolidiert)

**Alles in einem Commit-Block, Reihenfolge egal:**

1. `src/components/shared/Toast.tsx` — Framer-Motion-Spring auf Expo-Easing umstellen. Imports aus `src/utils/motion.ts` verwenden (`EASE.out`, `DURATION.base`).
2. `src/components/kanban/KanbanDetailModal.tsx:161` — `rounded-md` → `rounded-none`.
3. `src/components/library/LibraryDetailModal.tsx:60` — `rounded-md` → `rounded-none`.
4. `src/components/library/LibraryView.tsx:299` — `rounded-lg` → `rounded-none`.
5. `src/components/sessions/SessionHistoryViewer.tsx:170` — `rounded-md` → `rounded-none`.
6. `src/components/sessions/PinnedDocViewer.tsx:175` — Emoji `📌` → `import { Pin } from "lucide-react"` mit `className="w-3.5 h-3.5"` und `currentColor` (via Tailwind text-*).
7. `src/components/kanban/KanbanCard.tsx` — prüfen dass `rounded-sm` in Tailwind = 2px (Default ja, aber falls `tailwind.config.js` override existiert, explizit `rounded-[2px]`).
8. `src/utils/motion.ts` — SPRING-Preset kommentieren oder entfernen (Grep: `grep -rn "SPRING" src/` zuerst; wenn unbenutzt → löschen).

**Kein Snapshot-Test-Regen.** Betroffene Test-Files mitanpassen (`Toast.test.tsx`, `PinnedDocViewer.test.tsx` falls Emoji geprüft).

### Schritt 5 — Logo (Anleitung F)

**Per User-Entscheidung:** Placeholder aus Zip wird übernommen.

- `docs/design-system/assets/logo-placeholder.svg` bleibt als Referenz
- `src/assets/` existiert nicht → anlegen, Placeholder als `src/assets/logo.svg` kopieren
- `index.html`: `<link rel="icon">` auf `/src/assets/logo.svg` zeigen (aktuell noch `/vite.svg`)
- `src-tauri/icons/` **nicht anfassen** — existierende PNG/ICO/ICNS-Set bleibt bis echtes Logo designed ist
- Separates Follow-up-Issue anlegen: `design: Echtes Logo + Tauri-Icons` (Labels `design`, `P2`, `S:M`, kein `ready`)

### Schritt 6 — `tasks/todo.md` + `tasks/lessons.md` aktualisieren

Per CLAUDE.md-Konvention:

- `tasks/todo.md` — Sprint-Item "Design-System-Intake" hinzufügen oder abhaken
- `tasks/lessons.md` — Lesson: "Token-Reconciliation muss `src/index.css` gegen eingehende CSS prüfen, nicht umgekehrt kopieren. Regel: index.css bleibt SoT."

### Schritt 7 — Verify (Anleitung H)

```bash
npx tsc --noEmit           # Type-Check
npm run lint               # ESLint
npm run test               # Vitest
npm run build              # Vite Build
cd src-tauri && cargo check # Rust unverändert — smoke check
```

**Drift-Greps (müssen leer sein):**

```bash
grep -rn "rounded-md\|rounded-lg\|rounded-xl" src/ | grep -v "KanbanCard"
grep -rEn "[🔥✨🚀💯🎉📌]" src/
```

**Visueller Smoke:** `npm run tauri dev`, Dark+Light Mode durchklicken (Sessions, Kanban, Library, Logs), gegen `docs/design-system/preview/*.html` bei gleichem Zoom vergleichen.

### Schritt 8 — Commit + PR

Conventional Commits in dieser Reihenfolge (atomar):

1. `chore(docs): design-system intake (zip → docs/design-system/)`
2. `docs: CLAUDE.md design-system section`
3. `fix(ui): sharp corners in modals + library views`
4. `fix(ui): replace emoji with Lucide Pin in PinnedDocViewer`
5. `refactor(ui): Toast easing from spring to exponential`
6. `chore(assets): placeholder logo for index.html`
7. `chore(tasks): todo + lessons update`

PR-Titel: `chore(design): Design-System-Intake + Drift-Fix (closes #<issue>)`. Squash-merge.

### Schritt 9 — Cleanup Plan-Scratch

`reports/.tmp-ds-README.md` und `reports/.tmp-ds-SKILL.md` löschen (wurden für Plan-Analyse temporär extrahiert).

## Kritische Dateien

**Zu ändern:**

- `CLAUDE.md` — Design-System-Abschnitt anhängen
- `src/components/shared/Toast.tsx` — Easing-Umstellung
- `src/components/kanban/KanbanDetailModal.tsx:161`
- `src/components/library/LibraryDetailModal.tsx:60`
- `src/components/library/LibraryView.tsx:299`
- `src/components/sessions/SessionHistoryViewer.tsx:170`
- `src/components/sessions/PinnedDocViewer.tsx:175`
- `src/components/kanban/KanbanCard.tsx` (nur falls `rounded-sm` ≠ 2px)
- `src/utils/motion.ts` (SPRING kommentieren/entfernen)
- `index.html` — Favicon-Link
- `tasks/todo.md`, `tasks/lessons.md`

**Zu erstellen:**

- `docs/design-system/` (entpackter Ordner)
- `src/assets/logo.svg` (Placeholder-Kopie)

**Zu prüfen (kein Edit erwartet):**

- `src/index.css` — Diff gegen `colors_and_type.css`, erwartet: kein Delta
- `tailwind.config.js` — ist `rounded-sm` wirklich 2px?

## Wiederverwendete Utilities (kein Neu-Code)

- `src/utils/motion.ts` → `EASE.out`, `DURATION.base` (für Toast-Refactor)
- `lucide-react` → `Pin` (ersetzt Emoji)
- `src/index.css` → bestehende `glow-*` Klassen, `accent-a*` Variablen, `--duration-*` Tokens bleiben unverändert

## Out of Scope (bewusst ausgeschlossen)

- Separate PR pro Komponente (Anleitung E "one PR per file") — bei 6 Fundstellen Overkill.
- Echtes Logo-Design — eigenes Issue.
- Tauri-Icons (`src-tauri/icons/`) — bleibt beim bestehenden Set bis echtes Logo kommt.
- Light-Mode Touch-Ups (Anleitung H) — nur wenn visueller Smoke Drift zeigt; ansonsten eigenes Folge-Issue.
- Übernahme von `ui_kits/agentic-explorer/*.jsx` in Prod-Code — explizit "Reference, not prod".

## Verification Checklist

- [ ] `npx tsc --noEmit` grün
- [ ] `npm run lint` 0 Warnings
- [ ] `npm run test` alle grün (Toast-Test angepasst, PinnedDocViewer-Test angepasst)
- [ ] `npm run build` grün
- [ ] `cd src-tauri && cargo check` grün
- [ ] `grep -rn "rounded-md\|rounded-lg\|rounded-xl" src/` → nur Kanban-Treffer
- [ ] `grep -rEn "[🔥✨🚀💯🎉📌]" src/` → leer
- [ ] Tauri-App im Dark Mode: alle Views flat, sharp, accent cyan-teal
- [ ] Tauri-App im Light Mode: gleiches Bild, weichere Glows
- [ ] GitHub-Board: Issue in "Done"-Lane nach Merge
- [ ] Follow-up-Issue "Logo + Tauri-Icons" angelegt, Lane "Todo"
