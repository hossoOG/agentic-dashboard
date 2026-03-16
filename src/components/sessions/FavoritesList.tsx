import { FolderPlus } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../store/settingsStore";
import { FavoriteCard } from "./FavoriteCard";
import type { FavoriteFolder } from "../../store/settingsStore";

interface FavoritesListProps {
  onQuickStart: (favorite: FavoriteFolder) => void;
}

export function FavoritesList({ onQuickStart }: FavoritesListProps) {
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
        title: "Ordner als Favorit hinzufuegen",
      });
      if (selected && typeof selected === "string") {
        addFavorite(selected);
      }
    } catch (err) {
      console.error("[FavoritesList] Folder picker error:", err);
    }
  }

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-dark-border">
        <span className="text-xs text-gray-500 tracking-widest">FAVORITEN</span>
        <button
          onClick={handleAddFavorite}
          className="text-gray-500 hover:text-neon-green transition-colors"
          aria-label="Ordner als Favorit hinzufuegen"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Favorites list */}
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
        <div className="px-3 py-2 text-xs text-gray-600">
          Ordner hinzufuegen fuer Schnellstart
        </div>
      )}
    </div>
  );
}
