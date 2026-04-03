import { Play, X, FolderOpen, Terminal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import type { FavoriteFolder } from "../../store/settingsStore";
import { useUIStore } from "../../store/uiStore";
import { shortenPath } from "../../utils/pathUtils";

interface FavoriteCardProps {
  favorite: FavoriteFolder;
  onStart: () => void;
  onRemove: () => void;
}

export function FavoriteCard({ favorite, onStart, onRemove }: FavoriteCardProps) {
  const openPreview = useUIStore((s) => s.openPreview);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="relative group px-3 py-2 cursor-pointer transition-all duration-150 border-l-2 border-l-transparent hover:border-l-accent hover:bg-hover-overlay"
      onClick={() => openPreview(favorite.path)}
    >
      {/* Action buttons — visible on hover */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_folder_in_explorer", { path: favorite.path });
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
          aria-label="Ordner im Explorer oeffnen"
          title="Ordner im Explorer oeffnen"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_terminal_in_folder", { path: favorite.path });
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
          aria-label="Terminal im Ordner oeffnen"
          title="Terminal im Ordner oeffnen"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 text-neutral-600 hover:text-neutral-300"
          aria-label="Favorit entfernen"
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

      {/* Folder path */}
      <div
        className="mt-0.5 pl-[22px] text-xs text-neutral-500 truncate"
        title={favorite.path}
      >
        {shortenPath(favorite.path)}
      </div>
    </motion.div>
  );
}
