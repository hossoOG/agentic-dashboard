import { Download, RefreshCw, X, AlertCircle } from "lucide-react";
import { type UpdateState } from "../../hooks/useAutoUpdate";

interface Props extends UpdateState {
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdateNotification({
  status,
  progress,
  error,
  newVersion,
  onUpdate,
  onDismiss,
}: Props) {
  if (status === "idle" || status === "checking" || status === "upToDate") {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs border border-accent/40 bg-accent/10 px-3 py-1.5 rounded-sm animate-in fade-in">
      {status === "available" && (
        <>
          <Download className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-neutral-200">
            v{newVersion} verfuegbar
          </span>
          <button
            onClick={onUpdate}
            className="text-accent hover:text-accent/80 font-bold ml-1 transition-colors"
          >
            Jetzt updaten
          </button>
          <button
            onClick={onDismiss}
            className="text-neutral-500 hover:text-neutral-300 ml-1 transition-colors"
            title="Spaeter"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {status === "downloading" && (
        <>
          <RefreshCw className="w-3.5 h-3.5 text-accent shrink-0 animate-spin" />
          <span className="text-neutral-200">
            Lade Update... {progress}%
          </span>
          <div className="w-20 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      )}

      {status === "installing" && (
        <>
          <RefreshCw className="w-3.5 h-3.5 text-accent shrink-0 animate-spin" />
          <span className="text-neutral-200">Installiere... App startet neu</span>
        </>
      )}

      {status === "error" && (
        <>
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-red-400 truncate max-w-[200px]" title={error ?? ""}>
            Update-Fehler: {error}
          </span>
          <button
            onClick={onDismiss}
            className="text-neutral-500 hover:text-neutral-300 ml-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
