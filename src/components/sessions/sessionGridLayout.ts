/**
 * Layout-Helper für das Session-Grid.
 *
 * Liefert `grid-template`-CSS und die Area-Namen für 1..4 Sessions.
 * Wurde aus `SessionGrid.tsx` extrahiert, damit `SessionManagerView.tsx`
 * alle SessionTerminal-Instanzen in EINEM stabilen JSX-Baum rendern kann
 * (kein Remount bei Layout-Switch → xterm-Scrollback bleibt erhalten).
 */

import type { CSSProperties } from "react";

export const GRID_AREAS = ["a", "b", "c", "d"] as const;

/**
 * Liefert ein `gridTemplate`-CSS-Fragment für eine gegebene Session-Anzahl.
 *
 * - 1 Session → full-width/height Single-Zelle (area "a").
 * - 2 Sessions → vertikal gestapelt ("a" oben, "b" unten).
 * - 3 Sessions → obere Reihe zweigeteilt, untere Reihe voll ("c c").
 * - 4 Sessions → 2x2 Grid.
 *
 * Fällt bei count>=4 oder <=0 auf das 4er-Template zurück.
 */
export function getGridStyle(count: number): CSSProperties {
  switch (count) {
    case 1:
      return { gridTemplate: '"a" 1fr / 1fr' };
    case 2:
      return { gridTemplate: '"a" 1fr "b" 1fr / 1fr' };
    case 3:
      return { gridTemplate: '"a b" 1fr "c c" 1fr / 1fr 1fr' };
    case 4:
    default:
      return { gridTemplate: '"a b" 1fr "c d" 1fr / 1fr 1fr' };
  }
}

/**
 * Single-Layout-Template: eine Zelle "a" nimmt den gesamten Raum ein.
 * Wird für den Single-Modus verwendet, damit das Grid-Layout identisch
 * zu `getGridStyle(1)` ist — die Grid-Struktur ändert sich nicht
 * zwischen Single und Grid(1), nur die Sichtbarkeit der Wrapper-Divs.
 */
export const SINGLE_LAYOUT_STYLE: CSSProperties = {
  gridTemplate: '"a" 1fr / 1fr',
};
