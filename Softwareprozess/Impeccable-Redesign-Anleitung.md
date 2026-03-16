# Impeccable Frontend Redesign — Wiederverwendbare Anleitung

> **Zweck**: Schritt-für-Schritt-Anleitung, um ein bestehendes Frontend-Projekt strategisch mit dem [Impeccable Design System](https://impeccable.style) umzubauen. Kann als Prompt-Vorlage in jedem Projekt verwendet werden.
>
> **Erstellt**: 2026-03-15 | **Projekt**: Agentic Dashboard | **Status**: In Arbeit

---

## Voraussetzungen

- **Impeccable** muss installiert sein: Skills aus `impeccable/dist/claude-code/` nach `.claude/skills/` kopieren
- Frontend-Projekt mit React/Vue/Svelte/Vanilla (framework-agnostisch)
- CSS-Framework (Tailwind, vanilla CSS, etc.)

---

## Phase 1: Installation & Audit

### 1.1 Impeccable Skills installieren

```bash
# Von impeccable dist nach Projekt kopieren
cp -r /pfad/zu/impeccable/dist/claude-code/* .claude/skills/
```

**Ergebnis**: 1 Hauptskill (`frontend-design`) + 17 Command-Skills verfügbar.

### 1.2 Systematisches Audit durchführen

**Prompt-Vorlage** (als Claude Code Prompt verwenden):

```
Führe ein vollständiges Design-Audit meines Frontends durch, basierend auf den
Impeccable Design-Prinzipien. Prüfe systematisch:

1. **Typografie**: Werden generische Fonts verwendet (Inter, Roboto, Arial)?
   Gibt es ein modulares Type-Scale? Fluid Typography mit clamp()?
2. **Farben**: Werden OKLCH-Farben verwendet? Tinted Neutrals statt pure Grays?
   Kontrast WCAG AA (4.5:1)? Neon/Gradient-Overload?
3. **Spacing**: 4pt-System? Asymmetrischer Rhythmus? Oder überall gleiche Padding?
4. **Motion**: Exponential Easing? Bounce/Elastic verboten? prefers-reduced-motion?
   Nur transform+opacity animiert?
5. **Komponenten**: Card-Nesting? Duplizierte Patterns? Konsistente States?
6. **Accessibility**: aria-labels? Focus-Rings? Farbe nie allein als Indikator?
7. **AI Slop Test**: Würde jemand sofort "AI-generiert" sagen?

Für jedes Issue: Datei, Zeile, konkretes Problem, vorgeschlagene Lösung.
```

### 1.3 Audit-Ergebnisse priorisieren

| Priorität | Kategorie | Kriterium |
|-----------|-----------|-----------|
| P0 | Accessibility | WCAG-Fails, fehlende aria-labels |
| P1 | Design-System | Fehlende Tokens, inkonsistente Farben |
| P2 | Anti-Patterns | Neon-Overload, Card-Nesting, Bounce-Easing |
| P3 | Polish | Typografie-Feinschliff, Motion-Timing |

---

## Phase 2: Design-Tokens definieren

### 2.1 Farbpalette (OKLCH)

**Prompt-Vorlage**:

```
Erstelle ein OKLCH-basiertes Farbsystem für mein Projekt. Anforderungen:
- 1 Accent-Farbe (nicht Cyan/Purple — kein AI Slop)
- Tinted Neutrals (Chroma 0.01, Brand-Hue)
- 3 Surface-Level (für Tiefe ohne Schatten)
- 4 semantische Farben (Success, Error, Warning, Info)
- 60-30-10 Regel beachten
- Kein reines Schwarz (#000) oder Weiß (#fff)

Format als CSS Custom Properties in :root.
```

**Impeccable-Regeln** (aus color-and-contrast.md):
- OKLCH statt HSL — perceptually uniform
- Chroma reduzieren bei extremer Lightness (hell/dunkel)
- Gray text auf farbigem BG → dunkleren Shade des BG verwenden
- Alpha/Transparency = Design Smell → explizite Overlay-Farben definieren
- 60% Neutral, 30% Secondary, 10% Accent

**Beispiel**:
```css
:root {
  /* Accent */
  --color-accent: oklch(65% 0.20 180);        /* Teal */
  --color-accent-light: oklch(85% 0.10 180);
  --color-accent-dark: oklch(40% 0.15 180);

  /* Tinted Neutrals (cool) */
  --color-neutral-50: oklch(95% 0.01 250);
  --color-neutral-100: oklch(90% 0.01 250);
  --color-neutral-200: oklch(80% 0.01 250);
  --color-neutral-300: oklch(65% 0.01 250);
  --color-neutral-400: oklch(50% 0.01 250);
  --color-neutral-500: oklch(40% 0.01 250);
  --color-neutral-600: oklch(30% 0.01 250);
  --color-neutral-700: oklch(22% 0.01 250);
  --color-neutral-800: oklch(18% 0.01 250);
  --color-neutral-900: oklch(13% 0.01 250);

  /* Surfaces (Tiefe durch Helligkeit, nicht Schatten) */
  --surface-1: oklch(13% 0.01 250);   /* Tiefste Ebene */
  --surface-2: oklch(18% 0.01 250);   /* Karten */
  --surface-3: oklch(23% 0.01 250);   /* Erhöhte Elemente */

  /* Semantisch */
  --color-success: oklch(70% 0.18 150);
  --color-error: oklch(60% 0.22 25);
  --color-warning: oklch(75% 0.15 85);
  --color-info: oklch(65% 0.15 250);
}
```

### 2.2 Typografie-System

**Impeccable-Regeln** (aus typography.md):
- Keine generischen Fonts (Inter, Roboto, Arial, Open Sans)
- Max 2-3 Font-Familien: Display, Body, Mono
- Modularer Scale: 5 Stufen mit klarem Kontrast (xs, sm, base, lg, xl)
- Fluid Typography mit `clamp()` für Headlines
- Vertical Rhythm: line-height als Basis für alle vertikalen Abstände
- `font-variant-numeric: tabular-nums` für Datentabellen
- Monospace NUR für Code/Terminal, nicht als Default-UI-Font
- `rem/em` für Font-Sizes, nie `px` für Body

**Beispiel**:
```css
:root {
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Instrument Sans', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Modularer Scale (Major Third: 1.25) */
  --text-xs: 0.75rem;     /* 12px - Captions */
  --text-sm: 0.875rem;    /* 14px - Secondary UI */
  --text-base: 1rem;      /* 16px - Body */
  --text-lg: 1.25rem;     /* 20px - Subheadings */
  --text-xl: clamp(1.5rem, 1rem + 2vw, 2.5rem); /* Fluid Headlines */
  --text-2xl: clamp(2rem, 1.5rem + 3vw, 4rem);  /* Hero */

  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75; /* Dark mode: +0.1 */
}
```

### 2.3 Spacing-System

**Impeccable-Regeln** (aus spatial-design.md):
- 4pt Basis (nicht 8pt — zu grob)
- Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96px
- Semantische Token-Namen (`--space-sm`, nicht `--spacing-8`)
- `gap` statt Margins für Geschwister-Spacing
- Asymmetrie erzeugt Rhythmus — nicht überall gleiche Padding

```css
:root {
  --space-xs: 0.25rem;   /* 4px */
  --space-sm: 0.5rem;    /* 8px */
  --space-md: 0.75rem;   /* 12px */
  --space-lg: 1rem;      /* 16px */
  --space-xl: 1.5rem;    /* 24px */
  --space-2xl: 2rem;     /* 32px */
  --space-3xl: 3rem;     /* 48px */
  --space-4xl: 4rem;     /* 64px */
}
```

### 2.4 Motion-Tokens

**Impeccable-Regeln** (aus motion-design.md):
- 100/300/500 Regel: Instant (100-150ms), State (200-300ms), Layout (300-500ms)
- Exit = 75% von Enter-Duration
- Exponential Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo)
- **KEIN Bounce/Elastic** — wirkt dated und amateurhaft
- NUR `transform` + `opacity` animieren
- `prefers-reduced-motion` ist PFLICHT (35% der Erwachsenen 40+ betroffen)
- Height-Animationen: `grid-template-rows: 0fr → 1fr`

```css
:root {
  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-base: 300ms;
  --duration-slow: 500ms;
  --duration-entrance: 600ms;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);    /* Expo out - Default */
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);     /* Für Exits */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1); /* Für Toggles */
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Phase 3: Komponentensystem konsolidieren

### 3.1 Duplikate eliminieren

**Prompt-Vorlage**:

```
Analysiere alle Komponenten und finde duplizierte Patterns:
- Ähnliche Status-Konfigurationen (Farb-Maps, Icon-Maps)
- Wiederholte Animation-Definitionen
- Gleiche Layout-Strukturen (Header + Content + Footer Cards)

Extrahiere gemeinsame Logik in:
1. Shared Color/Status Config → src/utils/statusConfig.ts
2. Motion Constants → src/utils/motion.ts
3. Base Component (wenn 3+ Komponenten gleiche Struktur haben)

Keine Over-Abstraktion — nur extrahieren was wirklich dupliziert ist.
```

### 3.2 Anti-Patterns fixen

| Anti-Pattern | Fix |
|---|---|
| Inline `boxShadow` für Glow | → CSS-Klassen oder Tailwind-Plugin |
| Hardcoded Hex-Farben in JS | → CSS Custom Properties referenzieren |
| Bounce/Elastic Easing (Framer Motion `type: "spring"` mit hoher stiffness) | → Exponential Easing |
| `rounded-none` überall | → Mix aus sharp + subtle radius für Rhythmus |
| Cards in Cards | → Spacing + Dividers für innere Hierarchie |
| Monospace für alles | → Display + Body Font, Mono nur für Terminal |

---

## Phase 4: Responsive & Accessibility

### 4.1 Container Queries statt Viewport

**Impeccable-Regeln** (aus responsive-design.md):
- Container Queries für Komponenten, Viewport Queries für Page Layout
- Mobile-first: Base-Styles für Mobile, `min-width` für Komplexität
- Content-driven Breakpoints (nicht Geräte-Größen)
- Input-Method Detection: `@media (pointer: fine/coarse)` und `@media (hover: hover/none)`

```css
.node-container {
  container-type: inline-size;
}

@container (min-width: 300px) {
  .node-card { /* Erweitertes Layout */ }
}
```

### 4.2 Accessibility Checklist

**Impeccable-Regeln** (aus interaction-design.md + ux-writing.md):

- [ ] `aria-label` auf allen Icon-Only Buttons
- [ ] `:focus-visible` Ring auf allen interaktiven Elementen (nie `outline: none` ohne Ersatz)
- [ ] Touch Targets ≥ 44px (visuell kleiner via Pseudo-Element)
- [ ] Farbe nie alleiniger Informationsträger (+ Icon oder Text)
- [ ] Kontrast ≥ 4.5:1 für Body Text, ≥ 3:1 für Large Text / UI
- [ ] `prefers-reduced-motion` respektiert
- [ ] Keine `user-scalable=no` im Viewport Meta
- [ ] Fehler-Meldungen: Was + Warum + Wie fixen
- [ ] Button-Labels: Verb + Objekt ("Pipeline starten", nicht "OK")
- [ ] Empty States: Acknowledge + Value + Action

---

## Phase 5: Visuelles Redesign

### 5.1 Ästhetische Richtung wählen

**Impeccable Core-Prinzip**: Commit to a BOLD aesthetic direction.

**Prompt-Vorlage**:

```
Wähle eine klare ästhetische Richtung für das Redesign.
Optionen (eine wählen, nicht mischen):
- Technical Editorial (Bloomberg meets Design Magazine)
- Industrial Utilitarian (funktional, informationsdicht, nüchtern)
- Refined Minimalist (viel Whitespace, wenige Akzente, elegant)
- Retro-Futuristic (80s Sci-Fi, aber modern interpretiert)

Kriterien:
- Passt zur Domäne (was macht die App?)
- Besteht den AI Slop Test (nicht generisch)
- Hat ein Alleinstellungsmerkmal (was bleibt im Kopf?)
```

### 5.2 AI Slop Test

Vor jedem Milestone diese Frage stellen:

> "Wenn ich dieses Interface jemandem zeige und sage 'AI hat das gemacht',
> würde die Person es sofort glauben?"
>
> Wenn ja → Redesign nötig. Wenn "Wie wurde das gemacht?" → Gut.

**Die häufigsten AI-Slop-Marker** (Impeccable Anti-Patterns):
1. Cyan-on-Dark mit Neon-Accents
2. Purple-to-Blue Gradients
3. Inter/Roboto überall
4. Card-on-Card Nesting
5. Gray Text auf farbigem BG
6. Bounce/Elastic Animations
7. Hero Metric Template (Big Number + Label + Stats)
8. Glassmorphism als Deko
9. Rounded Rectangles mit Generic Drop Shadows
10. Gradient Text für "Impact"

---

## Phase 6: Verifikation

### 6.1 Technische Checks

```bash
npx tsc --noEmit        # TypeScript fehlerfrei
npm run build            # Build fehlerfrei
# Framework-spezifisch:
cargo check              # Rust/Tauri
```

### 6.2 Design-Qualität

**Prompt-Vorlage** (Post-Redesign):

```
Führe einen finalen Design-Review durch:
1. /audit — Systematischer Check aller Impeccable-Regeln
2. /critique — Subjektive Designqualität bewerten
3. /harden — Accessibility und Edge Cases prüfen
4. AI Slop Test — Würde jemand "AI-generiert" sagen?
5. Squint Test — Blur auf Screenshot: Ist Hierarchie erkennbar?
```

---

## Learnings & Lessons Learned

> Dieser Abschnitt wird während der Umsetzung fortlaufend aktualisiert.

### L1: Impeccable Installation (2026-03-15)
- Skills liegen in `.claude/skills/` des impeccable-Projekts, NICHT in `dist/claude-code/` (letzteres existierte nicht)
- 18 Skills total: 1 Hauptskill (`frontend-design`) + 17 Command-Skills
- Alle Command-Skills sind als User-Invokable Skills nutzbar (`/audit`, `/critique`, etc.)

### L2: OKLCH in Tailwind (2026-03-15, verifiziert)
- Tailwind v3 akzeptiert `oklch()` direkt als String-Wert in `theme.colors` ✓
- `oklch()` funktioniert in allen modernen Browsern (Baseline 2023)
- **Achtung**: Tailwind's `bg-color/opacity` Syntax (z.B. `bg-accent/10`) funktioniert NICHT mit OKLCH-Strings — verwende stattdessen OKLCH mit eingebautem Alpha: `oklch(72% 0.14 190 / 0.1)`
- Legacy-Aliase (z.B. `neon-green` → `oklch(...)`) erlauben schrittweise Migration

### L3: Framer Motion + Impeccable Motion Rules (2026-03-15, verifiziert)
- Framer Motion `type: "spring"` mit `stiffness: 300+` erzeugt sichtbaren Bounce → Anti-Pattern
- Besser: `type: "tween"` mit `ease: [0.16, 1, 0.3, 1]` (Expo Out)
- Oder `type: "spring"` mit `stiffness: 100, damping: 20` (kein sichtbarer Bounce)
- `SPRING.snappy` (300/30) ist OK weil damping hoch genug → kein Overshoot

### L4: Font-Loading in Tauri/Desktop (2026-03-15)
- Google Fonts via `<link>` im `index.html` funktioniert auch in Tauri-Apps (WebView lädt extern)
- `font-display: swap` ist per Default aktiv bei Google Fonts URL
- Space Grotesk (Display) + Instrument Sans (Body) als Impeccable-konforme Alternativen zu JetBrains Mono

### L5: Centralized Status Config Pattern (2026-03-15)
- Ein `statusConfig.ts` für ALLE Status→Farbe/Icon-Mappings spart ~60 Zeilen dupliziertem Code
- Pattern: `getStatusStyle(status)` → `{ text, border, bg, dot }` Tailwind-Klassen
- Neue Glow-Klassen (`glow-accent`, `glow-success`, etc.) in CSS statt inline `boxShadow`
- Eliminiert inkonsistente Farb-Definitionen über 5 verschiedene Dateien

### L6: Design Token Architektur (2026-03-15)
- **Zwei Layer**: CSS Custom Properties (`:root`) + Tailwind Theme Extension
- CSS vars für Werte die in CSS direkt gebraucht werden (Animationen, Scrollbar, etc.)
- Tailwind `theme.extend.colors` für Utility-Klassen in JSX
- Beide referenzieren die gleichen OKLCH-Werte → Single Source of Truth
- `surface-base/raised/overlay` statt `dark-bg/card` — semantische Namen skalen besser

### L7: Nachbereinigung nicht vergessen (2026-03-15)
- Nach den Haupt-Refactors bleiben oft verstreute Dateien mit alten Patterns übrig
- `grep -r "#00ff88\|neon-glow-\|neon-pulse-" src/` nach jedem Refactoring-Durchlauf ausführen
- Typische Überbleibsel: ErrorBoundary, Settings-Store Defaults, Avatar-Komponenten, Utility-Constants
- SVG `fill`/`stroke` Attribute akzeptieren OKLCH-Strings direkt — kein Tailwind nötig

### L8: Subagent-Strategie für Redesign (2026-03-15)
- **Parallelisierung**: Node-Komponenten und Layout-Komponenten sind unabhängig → parallele Subagenten
- **Wichtig**: Shared Dependencies (statusConfig, motion) ZUERST erstellen, DANN Subagenten starten
- Subagenten brauchen explizite Anweisung "Read file BEFORE editing" — sonst editieren sie blind
- Audit-Subagent + Install-Subagent können sofort parallel starten (keine Abhängigkeit)

### L9: Tauri invoke Parameter-Matching ist STRIKT (2026-03-15)
- Frontend `invoke("cmd", { id, folder })` und Rust `fn cmd(folder: String)` → Tauri VERWIRFT den Call oder ignoriert `id`
- **IDs müssen auf beiden Seiten übereinstimmen** — sonst Event-Mismatch (Backend emittet mit ID X, Frontend filtert nach ID Y)
- Symptom: App "crasht" nicht technisch, aber Terminal ist leer/unresponsive → User denkt App ist kaputt
- Fix: Entweder Frontend-ID als Rust-Parameter akzeptieren ODER Backend-Response-ID im Frontend verwenden
- **Immer die Response des Backend-Commands nutzen** (`const result = await invoke<Type>(...)`) statt lokale Werte

### L10: Error Handling Architektur für Tauri-Apps (2026-03-15)
- **3-Schichten-Modell**: ErrorBoundary (React Render) + globale Handler (JS Errors/Promises) + Backend-Logging (Rust log crate)
- ErrorBoundary existierte, wurde aber nie in `main.tsx` um `<App>` gewrappt → weiße Seite bei jedem Render-Fehler
- `window.addEventListener('error')` + `window.addEventListener('unhandledrejection')` sind PFLICHT
- Frontend-Logger: In-Memory Buffer (100 Einträge) + Console — kein Tauri-fs-Plugin nötig
- Backend-Logger: `log` + `env_logger` crate → Datei in AppData (`agentic-dashboard.log`)
- **User-Transparenz**: Jeder gefangene Fehler → Toast mit "Fehler" + Beschreibung (8s Auto-Dismiss)

### L10: Defensive Coding Patterns für Event-basierte Architektur (2026-03-15)
- Tauri `listen()` Callbacks MÜSSEN try/catch haben — ein Fehler im Callback crasht die ganze App
- `event?.payload?.field` mit Optional Chaining — Events können malformed ankommen
- `parseLogLine()` darf NIEMALS werfen — immer `[]` zurückgeben bei Fehler
- `applyParsedEvents()`: Jedes Event einzeln in try/catch — ein kaputtes Event darf nicht die Queue blockieren
- Rust: `let _ = app.emit()` ist VERBOTEN — immer `if let Err(e) = ... { log::error!() }`
- Rust: Vor Child-Process-Spawn immer CLI-Existenz prüfen (`which`/`where`)
- Session-Dialog: `folder` Parameter als existierendes Directory validieren BEVOR PTY erstellt wird

---

## Quick-Reference: Impeccable Prinzipien

| Bereich | DO | DON'T |
|---------|-----|-------|
| **Farbe** | OKLCH, Tinted Neutrals, 60-30-10 | Pure Black/White, Gray auf Color, Neon-Overload |
| **Typo** | Distinctive Fonts, Modular Scale, clamp() | Inter/Roboto, Monospace für alles, feste px |
| **Space** | 4pt System, Asymmetrie, gap | Überall gleiche Padding, nur Margins |
| **Motion** | Expo Easing, transform+opacity, reduced-motion | Bounce/Elastic, Layout-Properties animieren |
| **Layout** | Container Queries, Content-Breakpoints | Card-in-Card, alles zentrieren, gleiche Card-Grids |
| **A11y** | focus-visible, 44px Touch, 4.5:1 Kontrast | outline:none, Farbe allein, user-scalable=no |
| **UX Text** | Verb+Objekt Buttons, spezifische Errors | "OK"/"Submit", "Something went wrong" |

---

## Prompt-Vorlage: Komplettes Redesign (Copy & Paste)

```
Ich möchte mein Frontend-Projekt mit dem Impeccable Design System strategisch
redesignen. Die Impeccable Skills sind bereits in .claude/skills/ installiert.

Bitte führe folgende Schritte aus:

1. **Audit**: Analysiere alle Frontend-Komponenten gegen Impeccable-Prinzipien.
   Prüfe: Typografie, Farben (OKLCH?), Spacing (4pt?), Motion (Expo Easing?),
   Accessibility (WCAG AA), AI Slop Test.

2. **Design Tokens**: Erstelle ein vollständiges Token-System in CSS Custom
   Properties: OKLCH-Farben mit Tinted Neutrals, 3 Surface-Level,
   modularer Type Scale mit clamp(), 4pt Spacing Scale, Motion Tokens
   (100/300/500 Durations, Expo Easing).

3. **Komponentensystem**: Eliminiere Duplikate, extrahiere shared configs,
   erstelle Base-Components wo 3+ Komponenten gleiche Struktur haben.

4. **Anti-Patterns fixen**: Bounce→Expo, Neon-Overload→1 Accent,
   Monospace-für-alles→Font-Hierarchie, Card-in-Card→Spacing+Dividers.

5. **Accessibility**: aria-labels, focus-visible Rings, 44px Touch Targets,
   prefers-reduced-motion, Kontrast-Check.

6. **Verify**: npx tsc --noEmit && npm run build, AI Slop Test, Squint Test.

Ästhetische Richtung: [HIER RICHTUNG EINFÜGEN]
Bestehendes Framework: [React/Vue/Svelte + Tailwind/vanilla CSS/etc.]
```
