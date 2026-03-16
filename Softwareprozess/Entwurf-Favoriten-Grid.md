# Entwurf: Favoriten / Schnellstart + Grid-Layout

**Datum:** 2026-03-16
**Phase:** Entwurf
**Status:** Draft
**Basis:** `Entwurf-SessionManager.md` (bestehender MVP)

---

## Inhaltsverzeichnis

1. [Feature 1: Favoriten / Schnellstart](#1-feature-1-favoriten--schnellstart)
2. [Feature 2: Grid-Layout fuer mehrere Terminals](#2-feature-2-grid-layout-fuer-mehrere-terminals)
3. [Store-Aenderungen](#3-store-aenderungen)
4. [Implementierungsreihenfolge](#4-implementierungsreihenfolge)
5. [Edge Cases](#5-edge-cases)
6. [Aufwandschaetzung](#6-aufwandschaetzung)

---

## 1. Feature 1: Favoriten / Schnellstart

### 1.1 Konzept

Haeufig genutzte Projektordner koennen als Favoriten gespeichert werden. Ein Klick auf den Play-Button startet sofort eine neue Session (PowerShell, keine Dialoge). Die Favoriten-Liste erscheint **oberhalb** der aktiven Sessions in der linken Sidebar.

### 1.2 Wireframe: SessionList mit Favoriten

```
┌─ Session-Liste (280px) ──────────────┐
│                                       │
│  [+ NEUE SESSION]                     │
│                                       │
│  ── FAVORITEN ─────────────── [+] ── │  ← Sektion-Header mit "Ordner hinzufuegen"
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ▶  my-app                    ✕ │  │  ← Play-Button, Label, Remove-Button
│  │    ~/Projects/my-app            │  │  ← Pfad (gekuerzt)
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ▶  api-server                 ✕ │  │
│  │    ~/Projects/api-server        │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ▶  docs                       ✕ │  │
│  │    ~/Work/documentation         │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ── SESSIONS ──────────────────────  │  ← Sektion-Header
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ● my-app                     ✕ │  │  ← Bestehende SessionCard
│  │   ~/Projects/my-app             │  │
│  │   Laeuft seit 3:42              │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ ✓ docs                       ✕ │  │
│  │   ~/Work/documentation          │  │
│  │   Fertig (1:15)                 │  │
│  └─────────────────────────────────┘  │
│                                       │
│  Keine weiteren Sessions              │
└───────────────────────────────────────┘
```

### 1.3 Wireframe: FavoriteCard (Detail)

```
Normal-Zustand:
┌─────────────────────────────────────┐
│ ▶  my-app                        ✕ │
│    C:/Projects/my-app               │
└─────────────────────────────────────┘

Hover-Zustand:
┌─────────────────────────────────────┐
│ ▶  my-app                        ✕ │  ← Play + Remove sichtbar
│    C:/Projects/my-app               │     Play: neon-green Glow
└─────────────────────────────────────┘     Remove: nur bei Hover sichtbar

Klick auf ▶:
→ Sofortiger invoke("create_session", { id, folder, title, shell: "powershell" })
→ Session erscheint in Session-Liste darunter
→ Terminal wechselt zur neuen Session
→ lastUsedAt im Favorit wird aktualisiert
```

### 1.4 Wireframe: Favorit hinzufuegen

```
Klick auf [+] im Favoriten-Header:
→ Tauri Ordner-Picker (open({ directory: true }))
→ Ordner gewaehlt: Favorit wird sofort erstellt
  - label = letzter Ordnername (z.B. "my-app")
  - shell = "powershell" (Default)
  - id = generierte UUID
→ Favorit erscheint in der Liste
→ Kein Dialog, kein Formular — minimale Friktion
```

### 1.5 Komponenten

#### `FavoritesList.tsx`

```typescript
// Eingebettet in SessionList.tsx, oberhalb der Session-Cards

interface FavoritesListProps {
  onQuickStart: (favorite: FavoriteFolder) => void;
}

// Rendert:
// - Sektion-Header "FAVORITEN" mit [+]-Button
// - Liste der FavoriteCard-Komponenten
// - Leerer Zustand: "Noch keine Favoriten" (dezenter Hinweis)

// Liest aus: useSettingsStore((s) => s.favorites)
// Sortierung: nach lastUsedAt (neueste zuerst), dann alphabetisch
```

#### `FavoriteCard.tsx`

```typescript
interface FavoriteCardProps {
  favorite: FavoriteFolder;
  onStart: () => void;     // Play-Button → Session sofort starten
  onRemove: () => void;    // X-Button → Favorit entfernen
}

// Styling:
// - bg-surface-raised, border-l-2 border-transparent
// - Hover: border-l-accent, bg-white/5
// - Play-Button: neon-green, nur Icon (Play aus lucide)
// - Remove-Button: opacity-0 → group-hover:opacity-100 (wie SessionCard Close)
// - Pfad: text-xs text-neutral-500 truncate, shortenPath() wiederverwenden
// - Label: text-sm text-neutral-200 font-bold truncate
```

### 1.6 Datenfluss: Schnellstart

```
User klickt ▶ auf FavoriteCard
  → FavoritesList.onQuickStart(favorite)
    → SessionManagerView: handleQuickStart(favorite)
      → const id = generateSessionId()
      → invoke("create_session", { id, folder: favorite.path, title: favorite.label, shell: favorite.shell })
      → sessionStore.addSession({ id, title, folder, shell })
      → settingsStore.updateFavoriteLastUsed(favorite.id)
      → Terminal wechselt automatisch (addSession setzt activeSessionId)
```

---

## 2. Feature 2: Grid-Layout fuer mehrere Terminals

### 2.1 Konzept

Statt nur ein Terminal rechts zu zeigen, kann der User in einen Grid-Modus wechseln. Mehrere Terminals werden gleichzeitig angezeigt. Das Grid passt sich automatisch an die Anzahl der sichtbaren Sessions an.

### 2.2 Wireframe: Toggle-Button in Toolbar

```
┌─ Session-Liste ──┐  ┌─ Terminal-Header ──────────────────────────────────┐
│                   │  │  my-app                          [≡] [⊞] [—]     │
│                   │  │                                   │    │    │      │
│                   │  │                              Single Grid Max      │
│                   │  └───────────────────────────────────────────────────┘
```

Der Toggle sitzt in einer neuen **Terminal-Toolbar** oberhalb des Terminal-Bereichs:
- `[≡]` = Single-Modus (aktuelles Verhalten, Default)
- `[⊞]` = Grid-Modus (mehrere Terminals)
- `[—]` = Maximieren (Sidebar ausblenden, nur Terminal)

### 2.3 Wireframe: Single-Modus (bestehend)

```
┌─ Liste (280px) ─┐ ┌─ Terminal ──────────────────────────────────────────┐
│                  │ │ ┌─ Toolbar ──────────────────────── [≡] [⊞] [—] ┐ │
│  ● my-app        │ │ │  ● my-app  ~/Projects/my-app                   │ │
│  ● api-server    │ │ └─────────────────────────────────────────────────┘ │
│  ✓ docs          │ │                                                     │
│                  │ │  $ claude --dangerously-skip-permissions             │
│                  │ │  I'll help you with...                               │
│                  │ │                                                     │
│                  │ │  > What changes would you like?                      │
│                  │ │  █                                                   │
│                  │ │                                                     │
└──────────────────┘ └─────────────────────────────────────────────────────┘
```

### 2.4 Wireframe: Grid-Modus (2 Sessions → 1x2)

```
┌─ Liste (280px) ─┐ ┌─ Grid ─────────────────────────────────────────────┐
│                  │ │ ┌─ Toolbar ──────────────────────── [≡] [⊞] [—] ┐ │
│  ● my-app  ◆     │ │ │  Grid (2 Sessions)                              │ │
│  ● api-server ◆  │ │ └─────────────────────────────────────────────────┘ │
│  ✓ docs          │ │                                                     │
│                  │ │ ┌─ my-app ─────────────────────────────────────────┐│
│ ◆ = im Grid     │ │ │ ● my-app                              [↗] [✕] ││
│                  │ │ │                                                  ││
│                  │ │ │ $ claude --dangerously-skip-permissions          ││
│                  │ │ │ I'll help you with the refactoring...            ││
│                  │ │ │ █                                                ││
│                  │ │ └──────────────────────────────────────────────────┘│
│                  │ │                                                     │
│                  │ │ ┌─ api-server ─────────────────────────────────────┐│
│                  │ │ │ ● api-server                          [↗] [✕] ││
│                  │ │ │                                                  ││
│                  │ │ │ $ claude --dangerously-skip-permissions          ││
│                  │ │ │ Creating new endpoints for...                    ││
│                  │ │ │ █                                                ││
│                  │ │ └──────────────────────────────────────────────────┘│
│                  │ │                                                     │
└──────────────────┘ └─────────────────────────────────────────────────────┘

[↗] = Maximieren (zurueck zu Single mit dieser Session)
[✕] = Aus Grid entfernen (Session laeuft weiter)
```

### 2.5 Wireframe: Grid-Modus (3-4 Sessions → 2x2)

```
┌─ Liste (280px) ─┐ ┌─ Grid ─────────────────────────────────────────────┐
│                  │ │ ┌─ Toolbar ──────────────────────── [≡] [⊞] [—] ┐ │
│  ● my-app  ◆     │ │ │  Grid (4 Sessions)                              │ │
│  ● api ◆         │ │ └─────────────────────────────────────────────────┘ │
│  ● docs ◆        │ │                                                     │
│  ● tests ◆       │ │ ┌─ my-app ──────────────┐ ┌─ api ────────────────┐│
│                  │ │ │ ● my-app     [↗] [✕] │ │ ● api      [↗] [✕] ││
│                  │ │ │                        │ │                       ││
│                  │ │ │ $ claude ...            │ │ $ claude ...          ││
│                  │ │ │ Refactoring...          │ │ Creating...           ││
│                  │ │ │ █                       │ │ █                     ││
│                  │ │ └────────────────────────┘ └───────────────────────┘│
│                  │ │                                                     │
│                  │ │ ┌─ docs ─────────────────┐ ┌─ tests ──────────────┐│
│                  │ │ │ ● docs      [↗] [✕] │ │ ● tests    [↗] [✕] ││
│                  │ │ │                        │ │                       ││
│                  │ │ │ $ claude ...            │ │ $ claude ...          ││
│                  │ │ │ Writing docs...         │ │ Running tests...      ││
│                  │ │ │ █                       │ │ █                     ││
│                  │ │ └────────────────────────┘ └───────────────────────┘│
│                  │ │                                                     │
└──────────────────┘ └─────────────────────────────────────────────────────┘
```

### 2.6 Wireframe: Grid-Zelle fokussiert

```
┌─ my-app ─────────────────────────────┐
│ ● my-app                   [↗] [✕] │  ← Title-Bar: StatusDot + Name + Aktionen
│─────────────────────────────────────│
│                                      │  ← xterm.js Terminal
│ $ claude --dangerously-skip-perm...  │
│ I'll help you with the refactoring   │
│ of the authentication module...      │
│                                      │
│ > What specific files should I       │
│   focus on?                          │
│ █                                    │
│                                      │
└──────────────────────────────────────┘

Fokussiert (Klick auf Zelle):
  → Border: 2px solid accent (neon-blue / accent)
  → Title-Bar: bg-accent-subtle
  → Keyboard-Input geht an diese Session

Unfokussiert:
  → Border: 1px solid dark-border
  → Title-Bar: bg-surface-raised
  → Kein Keyboard-Input
```

### 2.7 Grid-Layout-Logik (CSS Grid)

```
Anzahl Sessions im Grid → CSS Grid Template:

1 Session:   grid-template: "a" 1fr / 1fr
             (identisch zu Single-Modus)

2 Sessions:  grid-template: "a" 1fr "b" 1fr / 1fr
             (2 Zeilen, 1 Spalte — uebereinander)

3 Sessions:  grid-template: "a b" 1fr "c c" 1fr / 1fr 1fr
             (oben 2, unten 1 zentriert)

4 Sessions:  grid-template: "a b" 1fr "c d" 1fr / 1fr 1fr
             (2x2 perfektes Raster)

5+ Sessions: Auf 4 begrenzen, Rest nur in der Liste.
             Hinweis: "Max. 4 Sessions im Grid"
```

### 2.8 Komponenten

#### `TerminalToolbar.tsx`

```typescript
interface TerminalToolbarProps {
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  activeSessionTitle?: string;
  gridCount: number;
}

// Rendert:
// - Links: Session-Titel (Single) oder "Grid (N Sessions)" (Grid)
// - Rechts: Layout-Toggle-Buttons [≡] [⊞] + Maximize [—]
// - Buttons: lucide Icons — LayoutList (Single), LayoutGrid (Grid), Maximize2
// - Aktiver Modus: accent-Farbe, andere: neutral-500
```

#### `SessionGrid.tsx`

```typescript
interface SessionGridProps {
  sessionIds: string[];
  focusedSessionId: string | null;
  onFocusSession: (id: string) => void;
  onMaximizeSession: (id: string) => void;
  onRemoveFromGrid: (id: string) => void;
}

// Rendert:
// - CSS Grid Container mit dynamischem Template (s.o.)
// - Fuer jede sessionId: GridCell mit SessionTerminal
// - Gap: 2px (minimal, kein Platz verschwenden)

// KRITISCH: SessionTerminal-Instanzen duerfen NICHT unmounten
// wenn zwischen Single/Grid gewechselt wird.
// Loesung: Alle Terminals rendern, per CSS visibility/display steuern,
// ODER key={sessionId} beibehalten und Terminal-State im Ref halten.
```

#### `GridCell.tsx`

```typescript
interface GridCellProps {
  sessionId: string;
  isFocused: boolean;
  onFocus: () => void;
  onMaximize: () => void;
  onRemove: () => void;
}

// Rendert:
// - Aeusserer Container: border, click → onFocus
// - Title-Bar: StatusDot + Titel + [↗] [✕] Buttons
// - Body: SessionTerminal (sessionId)
// - Fokussiert: border-accent, glow-accent
// - Unfokussiert: border-dark-border
```

### 2.9 Session-Zuweisung zum Grid

Beim Wechsel in den Grid-Modus:
1. Alle aktuell **aktiven/wartenden** Sessions werden automatisch ins Grid gelegt
2. Maximal 4 Sessions
3. User kann manuell Sessions aus dem Grid entfernen ([✕] in der Zelle)
4. In der SessionList: Sessions im Grid bekommen ein ◆-Icon

Beim Klick auf eine Session in der Liste (im Grid-Modus):
- Wenn Session schon im Grid → fokussiere sie
- Wenn Session nicht im Grid und Grid < 4 → fuege sie zum Grid hinzu + fokussiere
- Wenn Grid voll (4) → Wechsel zu Single-Modus mit dieser Session

---

## 3. Store-Aenderungen

### 3.1 `settingsStore.ts` — Favoriten (persistiert)

```typescript
// Neues Interface
export interface FavoriteFolder {
  id: string;             // Generierte UUID
  path: string;           // Absoluter Pfad zum Ordner
  label: string;          // Anzeigename (Default: Ordnername)
  shell: SessionShell;    // Standard-Shell (Default: "powershell")
  lastUsedAt: number;     // Timestamp des letzten Schnellstarts
}

// Neue State-Felder in SettingsState
export interface SettingsState {
  // ... bestehende Felder ...

  favorites: FavoriteFolder[];

  // Neue Actions
  addFavorite: (path: string, label?: string, shell?: SessionShell) => void;
  removeFavorite: (id: string) => void;
  updateFavorite: (id: string, partial: Partial<Omit<FavoriteFolder, "id">>) => void;
  updateFavoriteLastUsed: (id: string) => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;  // Fuer spaeteres Drag-to-Reorder
}
```

**Implementierung der Actions:**

```typescript
favorites: [],

addFavorite: (path, label, shell) =>
  set((state) => {
    // Duplikat-Check: gleicher Pfad existiert schon?
    if (state.favorites.some((f) => f.path === path)) return state;
    const folderName = path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "folder";
    const favorite: FavoriteFolder = {
      id: `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path,
      label: label ?? folderName,
      shell: shell ?? "powershell",
      lastUsedAt: 0,
    };
    return { favorites: [...state.favorites, favorite] };
  }),

removeFavorite: (id) =>
  set((state) => ({
    favorites: state.favorites.filter((f) => f.id !== id),
  })),

updateFavorite: (id, partial) =>
  set((state) => ({
    favorites: state.favorites.map((f) =>
      f.id === id ? { ...f, ...partial } : f
    ),
  })),

updateFavoriteLastUsed: (id) =>
  set((state) => ({
    favorites: state.favorites.map((f) =>
      f.id === id ? { ...f, lastUsedAt: Date.now() } : f
    ),
  })),

reorderFavorites: (fromIndex, toIndex) =>
  set((state) => {
    const newFavorites = [...state.favorites];
    const [moved] = newFavorites.splice(fromIndex, 1);
    newFavorites.splice(toIndex, 0, moved);
    return { favorites: newFavorites };
  }),
```

**Persistierung:** Favoriten werden automatisch ueber die bestehende `persist`-Middleware in `localStorage` gespeichert. Kein zusaetzlicher Aufwand — die `persist`-Config `{ name: "agentic-dashboard-settings" }` erfasst alle State-Felder.

### 3.2 `sessionStore.ts` — Layout-State (NICHT persistiert)

```typescript
// Neue Types
export type LayoutMode = "single" | "grid";

// Neue State-Felder in SessionState
export interface SessionState {
  // ... bestehende Felder ...

  layoutMode: LayoutMode;
  gridSessionIds: string[];          // IDs der Sessions im Grid (max 4)
  focusedGridSessionId: string | null; // Fokussierte Zelle im Grid

  // Neue Actions
  setLayoutMode: (mode: LayoutMode) => void;
  addToGrid: (id: string) => void;
  removeFromGrid: (id: string) => void;
  setFocusedGridSession: (id: string | null) => void;
  maximizeGridSession: (id: string) => void;  // Grid → Single mit dieser Session
}
```

**Implementierung der Actions:**

```typescript
layoutMode: "single",
gridSessionIds: [],
focusedGridSessionId: null,

setLayoutMode: (mode) =>
  set((state) => {
    if (mode === "grid") {
      // Automatisch aktive/wartende Sessions ins Grid legen
      const activeIds = state.sessions
        .filter((s) => s.status === "running" || s.status === "waiting" || s.status === "starting")
        .slice(0, 4)
        .map((s) => s.id);
      return {
        layoutMode: mode,
        gridSessionIds: activeIds.length > 0 ? activeIds : state.activeSessionId ? [state.activeSessionId] : [],
        focusedGridSessionId: activeIds[0] ?? state.activeSessionId,
      };
    }
    return { layoutMode: mode };
  }),

addToGrid: (id) =>
  set((state) => {
    if (state.gridSessionIds.length >= 4) return state;
    if (state.gridSessionIds.includes(id)) return state;
    return {
      gridSessionIds: [...state.gridSessionIds, id],
      focusedGridSessionId: id,
    };
  }),

removeFromGrid: (id) =>
  set((state) => {
    const newIds = state.gridSessionIds.filter((gid) => gid !== id);
    return {
      gridSessionIds: newIds,
      focusedGridSessionId:
        state.focusedGridSessionId === id
          ? (newIds[0] ?? null)
          : state.focusedGridSessionId,
      // Wenn Grid leer → zurueck zu Single
      layoutMode: newIds.length === 0 ? "single" : state.layoutMode,
    };
  }),

setFocusedGridSession: (id) =>
  set({ focusedGridSessionId: id }),

maximizeGridSession: (id) =>
  set({
    layoutMode: "single",
    activeSessionId: id,
  }),
```

**Warum NICHT persistiert?** Grid-State ist transient — beim Neustart der App sollen keine alten Grid-Konfigurationen wiederhergestellt werden, da die Sessions selbst nicht persistiert sind.

### 3.3 Aenderungen an bestehenden Komponenten

#### `SessionManagerView.tsx`

```typescript
// Neue Imports
import { TerminalToolbar } from "./TerminalToolbar";
import { SessionGrid } from "./SessionGrid";

// Neuer State aus Store
const layoutMode = useSessionStore((s) => s.layoutMode);
const gridSessionIds = useSessionStore((s) => s.gridSessionIds);
const focusedGridSessionId = useSessionStore((s) => s.focusedGridSessionId);

// Render-Logik fuer rechte Seite:
{layoutMode === "single" ? (
  // Bestehend: einzelnes Terminal oder EmptyState
  activeSessionId ? (
    <SessionTerminal sessionId={activeSessionId} />
  ) : (
    <EmptyState onNewSession={() => setShowNewDialog(true)} />
  )
) : (
  // Neu: Grid-Ansicht
  <SessionGrid
    sessionIds={gridSessionIds}
    focusedSessionId={focusedGridSessionId}
    onFocusSession={setFocusedGridSession}
    onMaximizeSession={maximizeGridSession}
    onRemoveFromGrid={removeFromGrid}
  />
)}

// TerminalToolbar wird ueber dem Terminal-Bereich eingefuegt
```

#### `SessionList.tsx`

```typescript
// Neue Imports
import { FavoritesList } from "./FavoritesList";

// Props erweitern
interface SessionListProps {
  onNewSession: () => void;
  onQuickStart: (favorite: FavoriteFolder) => void;  // NEU
}

// Render: FavoritesList oberhalb der Session-Cards einfuegen
<div className="flex-1 overflow-y-auto">
  <FavoritesList onQuickStart={onQuickStart} />
  {/* Sektion-Header "SESSIONS" wenn Favoriten existieren */}
  {favorites.length > 0 && (
    <div className="px-3 py-1.5 text-xs text-neutral-500 tracking-widest border-b border-dark-border">
      SESSIONS
    </div>
  )}
  {sorted.map((session) => (
    <SessionCard ... />
  ))}
</div>
```

#### `SessionCard.tsx`

```typescript
// Kleine Erweiterung: Grid-Indikator
// Wenn Session im Grid ist → kleines ◆ Icon neben dem Titel

interface SessionCardProps {
  // ... bestehend ...
  isInGrid?: boolean;  // NEU
}
```

#### `SessionTerminal.tsx`

```typescript
// KEINE Aenderung am Interface.
// ABER: Wichtiger Hinweis fuer Grid-Integration:
//
// Problem: Wenn SessionTerminal unmountet, wird term.dispose() aufgerufen.
//          Der gesamte Terminal-State (Scrollback, Cursor-Position) geht verloren.
//
// Loesung fuer Grid: SessionTerminal-Instanzen mit stabilen Keys rendern.
//          Im Grid-Modus alle Grid-Sessions gleichzeitig mounten.
//          Beim Wechsel Single→Grid NICHT unmounten, sondern per CSS umordnen.
//
// Konkret: TerminalPool-Pattern verwenden:
//   - Alle aktiven SessionTerminals in einem unsichtbaren Container rendern
//   - Per React Portal in die jeweilige Grid-Zelle oder den Single-Container projizieren
//   - Alternative (einfacher): key={sessionId} stabil halten, xterm-State geht
//     trotzdem verloren bei Unmount → akzeptabel fuer MVP, da Backend-PTY weiterlaeuft
//     und bei Re-Mount kein neuer Output verloren geht (nur Scrollback-History)
```

---

## 4. Implementierungsreihenfolge

### Phase 1: Favoriten (Feature 1) — zuerst

**Begruendung:** Favoriten sind ein isoliertes Feature mit minimalem Einfluss auf bestehende Komponenten. Sie erfordern nur Aenderungen an `settingsStore.ts` (neue Felder) und `SessionList.tsx` (neue Sektion). Kein Risiko fuer bestehende Funktionalitaet.

**Schritte:**

```
1.1  settingsStore.ts erweitern
     → FavoriteFolder Interface
     → favorites: FavoriteFolder[] State-Feld
     → CRUD Actions (add, remove, update, updateLastUsed)
     → Verify: npx tsc --noEmit

1.2  FavoriteCard.tsx erstellen
     → Props: favorite, onStart, onRemove
     → Styling: konsistent mit SessionCard
     → Play-Button (lucide Play), Remove-Button (lucide X)
     → shortenPath() aus SessionCard extrahieren in shared util
     → Verify: npx tsc --noEmit

1.3  FavoritesList.tsx erstellen
     → Props: onQuickStart
     → Sektion-Header "FAVORITEN" mit [+]-Button
     → Ordner-Picker via open({ directory: true })
     → Liste der FavoriteCards
     → Leerer Zustand (kein Favorit vorhanden → nichts anzeigen)
     → Verify: npx tsc --noEmit

1.4  SessionList.tsx anpassen
     → FavoritesList einbetten (oberhalb Sessions)
     → Props erweitern: onQuickStart
     → "SESSIONS" Sektion-Header wenn Favoriten existieren
     → Verify: npx tsc --noEmit

1.5  SessionManagerView.tsx anpassen
     → handleQuickStart-Funktion: invoke + addSession + updateFavoriteLastUsed
     → onQuickStart an SessionList durchreichen
     → Verify: npx tsc --noEmit && npm run build

1.6  Manueller Test
     → npm run tauri dev
     → Favorit hinzufuegen (Ordner-Picker)
     → Favorit erscheint in der Liste
     → Play-Button → Session startet sofort
     → App neustarten → Favoriten sind noch da (Persistierung)
     → Favorit entfernen → verschwindet
```

### Phase 2: Grid-Layout (Feature 2) — danach

**Begruendung:** Grid-Layout erfordert tiefere Aenderungen am Layout-System und betrifft das Terminal-Lifecycle-Management. Komplexer, mehr Risiko. Sollte auf funktionierenden Favoriten aufbauen.

**Schritte:**

```
2.1  sessionStore.ts erweitern
     → LayoutMode Type
     → layoutMode, gridSessionIds, focusedGridSessionId State
     → setLayoutMode, addToGrid, removeFromGrid, setFocusedGridSession, maximizeGridSession Actions
     → Verify: npx tsc --noEmit

2.2  TerminalToolbar.tsx erstellen
     → Layout-Toggle Buttons (Single, Grid)
     → Session-Titel oder Grid-Counter
     → Styling: konsistent mit Projekt-Design
     → Verify: npx tsc --noEmit

2.3  GridCell.tsx erstellen
     → Title-Bar mit StatusDot, Titel, Maximize, Remove Buttons
     → SessionTerminal einbetten
     → Fokus-Styling (border-accent vs border-dark-border)
     → Click-Handler fuer Fokus
     → Verify: npx tsc --noEmit

2.4  SessionGrid.tsx erstellen
     → CSS Grid Container
     → Dynamische grid-template basierend auf sessionIds.length
     → GridCell fuer jede Session
     → gap: 2px
     → Verify: npx tsc --noEmit

2.5  SessionManagerView.tsx anpassen
     → TerminalToolbar einfuegen
     → Bedingte Anzeige: Single → SessionTerminal, Grid → SessionGrid
     → Verify: npx tsc --noEmit && npm run build

2.6  SessionList.tsx anpassen (optional)
     → Grid-Indikator (◆) an Sessions im Grid
     → Klick-Verhalten im Grid-Modus anpassen
     → Verify: npx tsc --noEmit

2.7  Performance-Test
     → 4 Sessions gleichzeitig im Grid starten
     → Memory-Verbrauch pruefen (4x xterm.js Instanzen)
     → Resize-Verhalten testen
     → Terminal-Input in fokussierter Zelle testen

2.8  Manueller Test
     → npm run tauri dev
     → 2+ Sessions starten
     → Grid-Toggle → 2 Terminals nebeneinander
     → Klick auf Zelle → Fokus wechselt
     → Maximize → zurueck zu Single
     → Session aus Grid entfernen
     → Letzte Session entfernen → automatisch zurueck zu Single
```

---

## 5. Edge Cases

### 5.1 Favoriten

| Edge Case | Behandlung |
|-----------|-----------|
| **Ordner existiert nicht mehr** | Beim Schnellstart: `invoke` schlaegt fehl → Fehlermeldung als Toast. Favorit bleibt erhalten (User kann ihn manuell entfernen). |
| **Doppelter Favorit (gleicher Pfad)** | `addFavorite` prueft auf Duplikate via `path`-Vergleich. Wird verhindert. |
| **Sehr langer Pfad** | `shortenPath()` kuerzt auf letzte 2 Segmente. Tooltip mit vollem Pfad (`title`-Attribut). |
| **Favorit-Shell nicht verfuegbar** | Shell-Default ist "powershell" — auf Windows immer vorhanden. Falls andere Shell konfiguriert und nicht vorhanden: Backend gibt Fehler zurueck → Toast. |
| **Max Sessions erreicht (8)** | `addSession` im sessionStore gibt Warnung aus und verhindert Erstellung. Play-Button sollte disabled werden wenn `sessions.length >= MAX_SESSIONS`. |
| **Persistierung korrupt** | `zustand/persist` hat `onRehydrateStorage`-Callback. Bei Parse-Fehler: `favorites` auf `[]` zuruecksetzen. |
| **Schnellstart waehrend Session laeuft im selben Ordner** | Erlaubt — mehrere Sessions im selben Ordner sind valide (parallele Claude-Instanzen). |
| **0 Favoriten** | FavoritesList-Sektion wird nicht gerendert. Kein Header, kein Platzhalter. Nur der [+]-Button im Header bleibt (als Teil des "NEUE SESSION"-Bereichs oder als eigener "Ordner merken"-Flow). |

### 5.2 Grid-Layout

| Edge Case | Behandlung |
|-----------|-----------|
| **Session beendet sich im Grid** | GridCell bleibt bestehen, StatusDot wechselt zu Done/Error. User kann manuell entfernen. |
| **Session wird per X in SessionList entfernt** | `removeSession` muss auch `gridSessionIds` bereinigen. Ergaenzung in `removeSession`: `gridSessionIds: state.gridSessionIds.filter(id => id !== removedId)`. |
| **Alle Grid-Sessions entfernt** | `removeFromGrid` erkennt `newIds.length === 0` → automatisch `layoutMode: "single"`. |
| **Grid mit 1 Session** | Funktioniert: `grid-template: "a" 1fr / 1fr` → Vollbild. Kein Unterschied zu Single, aber konsistent. |
| **Window Resize** | xterm.js `FitAddon` reagiert ueber `ResizeObserver` auf Container-Groessenaenderungen. Funktioniert auch in Grid-Zellen. |
| **5+ Sessions aktiv** | Grid zeigt max. 4. Weitere Sessions nur in der Liste sichtbar. Hinweis im Grid: "Max. 4 Sessions im Grid. Weitere Sessions in der Liste." |
| **Memory bei 4x xterm.js** | Jede xterm.js Instanz ~5-15 MB (abhaengig von Scrollback). 4 Instanzen = ~60 MB. Akzeptabel fuer Desktop-App. Scrollback-Limit: 1000 Zeilen (Default). |
| **Keyboard-Input bei mehreren Terminals** | Nur die fokussierte Grid-Zelle empfaengt Keyboard-Input. xterm.js `term.focus()` wird bei Zellen-Klick aufgerufen. Alle anderen Terminals sind `term.blur()`. |
| **Terminal-State bei Layout-Wechsel** | MVP-Akzeptanz: Terminal-Scrollback geht verloren bei Unmount. Backend-PTY laeuft weiter. Neuer Output erscheint nach Re-Mount. Fuer Post-MVP: Portal-Pattern evaluieren. |
| **Grid + Maximieren + Grid** | Maximieren → Single-Modus mit gewaehlter Session. Grid-Button → zurueck zum Grid mit denselben Sessions (gridSessionIds bleibt erhalten). |

---

## 6. Aufwandschaetzung

### Feature 1: Favoriten / Schnellstart

| Teilaufgabe | Aufwand | Komplexitaet |
|-------------|---------|-------------|
| `settingsStore.ts` erweitern (Interface + Actions) | 30 min | Niedrig |
| `FavoriteCard.tsx` erstellen | 45 min | Niedrig |
| `FavoritesList.tsx` erstellen (inkl. Ordner-Picker) | 60 min | Mittel |
| `SessionList.tsx` anpassen (Integration) | 30 min | Niedrig |
| `SessionManagerView.tsx` anpassen (Quick-Start-Flow) | 30 min | Niedrig |
| `shortenPath()` in Shared Util extrahieren | 15 min | Niedrig |
| Manueller Test + Bugfixes | 45 min | — |
| **Gesamt Feature 1** | **~4 Stunden** | **Niedrig-Mittel** |

### Feature 2: Grid-Layout

| Teilaufgabe | Aufwand | Komplexitaet |
|-------------|---------|-------------|
| `sessionStore.ts` erweitern (Layout-State + Actions) | 45 min | Mittel |
| `TerminalToolbar.tsx` erstellen | 30 min | Niedrig |
| `GridCell.tsx` erstellen | 60 min | Mittel |
| `SessionGrid.tsx` erstellen (CSS Grid + dynamische Templates) | 90 min | Mittel-Hoch |
| `SessionManagerView.tsx` anpassen (Layout-Switch) | 45 min | Mittel |
| `SessionList.tsx` anpassen (Grid-Indikatoren) | 20 min | Niedrig |
| `removeSession` Grid-Cleanup | 15 min | Niedrig |
| Terminal-Lifecycle-Management (Focus/Blur, Resize) | 60 min | Hoch |
| Performance-Test (4x xterm.js) | 30 min | — |
| Manueller Test + Bugfixes | 60 min | — |
| **Gesamt Feature 2** | **~7.5 Stunden** | **Mittel-Hoch** |

### Gesamt

| | Aufwand |
|---|---------|
| Feature 1: Favoriten | ~4h |
| Feature 2: Grid-Layout | ~7.5h |
| **Gesamt beide Features** | **~11.5 Stunden** |

**Empfehlung:** Feature 1 zuerst implementieren (geringeres Risiko, sofortiger Nutzen). Feature 2 kann auch als separater PR kommen. Zwischen den Features: Build verifizieren, manuell testen, dann erst Feature 2 beginnen.

---

## Anhang: Neue Dateien (Zusammenfassung)

```
src/
  components/
    sessions/
      FavoritesList.tsx       ← NEU (Feature 1)
      FavoriteCard.tsx        ← NEU (Feature 1)
      TerminalToolbar.tsx     ← NEU (Feature 2)
      SessionGrid.tsx         ← NEU (Feature 2)
      GridCell.tsx            ← NEU (Feature 2)
  store/
    sessionStore.ts           ← GEAENDERT (Feature 2: Layout-State)
    settingsStore.ts          ← GEAENDERT (Feature 1: Favorites)
  utils/
    paths.ts                  ← NEU (shortenPath extrahiert)
```
