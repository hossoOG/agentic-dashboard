import { Plus } from "lucide-react";

interface EmptyStateProps {
  onNewSession: () => void;
}

export function EmptyState({ onNewSession }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-surface-base">
      <button
        onClick={onNewSession}
        className="flex items-center gap-2 px-6 py-3 bg-neon-green/10 border-2 border-neon-green text-neon-green font-bold text-sm tracking-widest hover:bg-neon-green/20 transition-colors"
      >
        <Plus className="w-5 h-5" />
        NEUE SESSION STARTEN
      </button>
      <p className="mt-4 text-neutral-500 text-sm text-center max-w-xs">
        Waehle einen Ordner und starte eine Claude Session.
        <br />
        Der Output erscheint hier in Echtzeit.
      </p>
    </div>
  );
}
