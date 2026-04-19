import { FolderPlus, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../store/settingsStore";
import { logError } from "../../utils/errorLogger";
import { FavoriteCard } from "./FavoriteCard";
import type { FavoriteFolder } from "../../store/settingsStore";

interface FavoritesListProps {
  onQuickStart: (favorite: FavoriteFolder) => void;
}

export function FavoritesList({ onQuickStart }: FavoritesListProps) {
  const [expanded, setExpanded] = useState(true);
  const favorites = useSettingsStore((s) => s.favorites);
  const addFavorite = useSettingsStore((s) => s.addFavorite);
  const removeFavorite = useSettingsStore((s) => s.removeFavorite);

  // Sort by lastUsedAt (most recent first), then alphabetically
  const sorted = [...favorites].sort((a, b) => {
    if (a.lastUsedAt !== b.lastUsedAt) return b.lastUsedAt - a.lastUsedAt;
    return a.label.localeCompare(b.label);
  });

  async function handleAddFavorite() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Ordner als Favorit hinzufügen",
      });
      if (selected && typeof selected === "string") {
        addFavorite(selected);
      }
    } catch (err) {
      logError("FavoritesList.folderPicker", err);
    }
  }

  return (
    <div>
      {/* Section header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-neutral-700 cursor-pointer hover:bg-hover-overlay transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-1.5">
          {expanded ? <ChevronDown className="w-3 h-3 text-neutral-500" /> : <ChevronRight className="w-3 h-3 text-neutral-500" />}
          <span className="text-xs text-neutral-500 uppercase tracking-widest">FAVORITEN</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleAddFavorite(); }}
          className="text-neutral-500 hover:text-accent transition-colors"
          aria-label="Ordner als Favorit hinzufügen"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Favorites list */}
      {expanded && (
        <>
          <AnimatePresence>
            {sorted.map((fav) => (
              <FavoriteCard
                key={fav.id}
                favorite={fav}
                onStart={() => onQuickStart(fav)}
                onRemove={() => removeFavorite(fav.id)}
              />
            ))}
          </AnimatePresence>

          {/* Empty state */}
          {favorites.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-600">
              Ordner hinzufügen für Schnellstart
            </div>
          )}
        </>
      )}
    </div>
  );
}
