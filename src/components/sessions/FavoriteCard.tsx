import { Play, X, FolderOpen, Terminal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import type { FavoriteFolder } from "../../store/settingsStore";
import { useUIStore } from "../../store/uiStore";
import { useSessionStore } from "../../store/sessionStore";
import { logError } from "../../utils/errorLogger";
import { DiffActionButton } from "../diff/DiffActionButton";

/**
 * Returns the most recently created live session whose folder matches the
 * favorite, or null. Favorites are folders — the Diff-Button needs a live
 * session to compute a meaningful diff against. When the favorite has no
 * active session, the button is hidden.
 */
function useFavoriteLiveSessionId(path: string): string | null {
  return useSessionStore((s) => {
    const matches = s.sessions
      .filter((sess) => sess.folder === path && sess.isGitRepo)
      .sort((a, b) => b.createdAt - a.createdAt);
    return matches[0]?.id ?? null;
  });
}

interface FavoriteCardProps {
  favorite: FavoriteFolder;
  onStart: () => void;
  onRemove: () => void;
}

export function FavoriteCard({ favorite, onStart, onRemove }: FavoriteCardProps) {
  const openPreview = useUIStore((s) => s.openPreview);
  const liveSessionId = useFavoriteLiveSessionId(favorite.path);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="relative group px-3 py-1.5 cursor-pointer transition-all duration-150 border-l-2 border-l-transparent hover:border-l-accent hover:bg-hover-overlay"
      onClick={() => openPreview(favorite.path)}
      title={favorite.path}
    >
      {/* Backdrop-Bar deckt Card-Text dahinter — sonst Kontrast-Kollision mit Labels. */}
      <div className="absolute top-1.5 right-1.5 flex items-stretch bg-surface-base border border-neutral-700 divide-x divide-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity">
        {liveSessionId && (
          <DiffActionButton sessionId={liveSessionId} errorSource="FavoriteCard.openDiff" />
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_folder_in_explorer", { path: favorite.path }).catch((err: unknown) =>
              logError("FavoriteCard.openFolder", err)
            );
          }}
          className="p-1.5 text-neutral-400 hover:text-accent hover:bg-hover-overlay transition-colors"
          aria-label="Ordner im Explorer öffnen"
          title="Ordner im Explorer öffnen"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_terminal_in_folder", { path: favorite.path }).catch((err: unknown) =>
              logError("FavoriteCard.openTerminal", err)
            );
          }}
          className="p-1.5 text-neutral-400 hover:text-accent hover:bg-hover-overlay transition-colors"
          aria-label="Terminal im Ordner öffnen"
          title="Terminal im Ordner öffnen"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1.5 text-neutral-500 hover:text-error hover:bg-hover-overlay transition-colors"
          aria-label="Favorit entfernen"
          title="Favorit entfernen"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Title row with play button */}
      <div className="flex items-center gap-2 pr-5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
          className="text-green-400 hover:text-accent transition-colors shrink-0"
          aria-label="Session starten"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
        </button>
        <span className="font-bold text-sm text-neutral-200 truncate">
          {favorite.label}
        </span>
      </div>
    </motion.div>
  );
}
