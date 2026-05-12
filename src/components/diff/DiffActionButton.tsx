import { invoke } from "@tauri-apps/api/core";
import { ICONS, type IconSize, ICON_SIZE } from "../../utils/icons";
import { logError } from "../../utils/errorLogger";

interface DiffActionButtonProps {
  sessionId: string;
  /** Card-Variante: w-3.5 (default). Grid-Variante: w-3. */
  iconSize?: IconSize;
  /** Tailwind-Padding-Klasse — kompakter im Grid, fuller-bleed auf Cards. */
  padding?: "p-1" | "p-1.5";
  /** Source-Tag fuers logError-Channel (z.B. "SessionCard.openDiff"). */
  errorSource: string;
}

/**
 * Shared Diff-Button fuer Session-/Favorite-/Grid-Card-Action-Bars.
 * Zentralisiert die `open_session_diff_window`-Invocation samt
 * Aria-Label/Title — so bleibt die Pronouns-Regel in EINER Datei.
 */
export function DiffActionButton({
  sessionId,
  iconSize = "card",
  padding = "p-1.5",
  errorSource,
}: DiffActionButtonProps) {
  const Icon = ICONS.action.diff;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        invoke("open_session_diff_window", { sessionId }).catch((err: unknown) =>
          logError(errorSource, err),
        );
      }}
      className={`${padding} text-neutral-400 hover:text-accent hover:bg-hover-overlay transition-colors`}
      aria-label="Diff anzeigen"
      title="Diff anzeigen"
    >
      <Icon className={ICON_SIZE[iconSize]} />
    </button>
  );
}
