import { useState, useEffect } from "react";
import { CheckCircle, Download, RefreshCw, RotateCcw, X, AlertCircle } from "lucide-react";
import { type UpdateState } from "../../hooks/useAutoUpdate";

interface Props extends UpdateState {
  onUpdate: () => void;
  onRelaunch: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

export function UpdateNotification({
  status,
  progress,
  error,
  newVersion,
  onUpdate,
  onRelaunch,
  onRetry,
  onDismiss,
}: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (status === "upToDate") {
      setVisible(true);
      const timer = setTimeout(() => {
        onDismiss();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [status, onDismiss]);

  if (status === "idle" || status === "checking") {
    return null;
  }

  if (status === "upToDate" && !visible) {
    return null;
  }

  const borderColor =
    status === "upToDate"
      ? "border-emerald-400/40 bg-emerald-400/10"
      : status === "error"
        ? "border-red-400/40 bg-red-400/10"
        : "border-accent/40 bg-accent/10";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-xs border ${borderColor} px-3 py-1.5 rounded-sm animate-in fade-in`}
    >
      {status === "upToDate" && (
        <>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-emerald-400">Aktuell</span>
        </>
      )}

      {status === "available" && (
        <>
          <Download className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-neutral-200">v{newVersion} verfügbar</span>
          <button
            onClick={onUpdate}
            className="text-accent hover:text-accent/80 font-bold ml-1 transition-colors"
          >
            Jetzt updaten
          </button>
          <button
            onClick={onDismiss}
            className="text-neutral-500 hover:text-neutral-300 ml-1 transition-colors"
            title="Später"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {status === "downloading" && (
        <>
          <RefreshCw className="w-3.5 h-3.5 text-accent shrink-0 animate-spin" />
          <span className="text-neutral-200">Lade Update... {progress}%</span>
          <div className="w-20 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      )}

      {status === "ready" && (
        <>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-neutral-200">Update bereit</span>
          <button
            onClick={onRelaunch}
            className="text-accent hover:text-accent/80 font-bold ml-1 transition-colors"
          >
            Jetzt neu starten
          </button>
        </>
      )}

      {status === "error" && (
        <>
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-red-400 truncate max-w-[200px]" title={error ?? ""}>
            Update-Fehler: {error}
          </span>
          <button
            onClick={onRetry}
            className="text-accent hover:text-accent/80 ml-1 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 inline mr-0.5" />
            Erneut prüfen
          </button>
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
