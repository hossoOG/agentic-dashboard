import { Plus } from "lucide-react";
import { Button } from "../ui/Button";

interface EmptyStateProps {
  onNewSession: () => void;
}

export function EmptyState({ onNewSession }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-surface-base">
      <Button
        variant="primary"
        size="lg"
        icon={<Plus className="w-5 h-5" />}
        onClick={onNewSession}
        className="tracking-widest"
      >
        NEUE SESSION STARTEN
      </Button>
      <p className="mt-4 text-neutral-500 text-sm text-center max-w-xs">
        Waehle einen Ordner und starte eine Claude Session.
        <br />
        Der Output erscheint hier in Echtzeit.
      </p>
    </div>
  );
}
