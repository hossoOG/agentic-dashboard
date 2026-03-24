import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

export interface ErrorEntry {
  id: string;
  worktreeId: string;
  step: string;
  message: string;
}

interface Props {
  errors: ErrorEntry[];
  onRetry: (worktreeId: string) => void;
  onDismiss: (errorId: string) => void;
}

export function ErrorAlert({ errors, onRetry, onDismiss }: Props) {
  if (errors.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <AnimatePresence>
        {errors.map((error) => (
          <motion.div
            key={error.id}
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex items-center gap-3 px-4 py-2.5 bg-red-950/60 border border-red-500/50 glow-red"
          >
            <AlertTriangle className="w-4 h-4 text-error shrink-0" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-error font-mono tracking-wider">
                  {error.worktreeId}
                </span>
                <span className="text-neutral-500">/</span>
                <span className="text-red-300">{error.step}</span>
              </div>
              <div className="text-xs text-red-200/70 truncate mt-0.5" title={error.message}>
                {error.message}
              </div>
            </div>

            <button
              onClick={() => onRetry(error.worktreeId)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-accent border border-accent-a40 hover:bg-accent-a10 transition-colors tracking-wide"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>

            <button
              onClick={() => onDismiss(error.id)}
              className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
