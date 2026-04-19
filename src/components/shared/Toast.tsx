import { useEffect } from "react";
import { motion } from "framer-motion";
import { X, CheckCircle2, AlertTriangle, Trophy, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DURATION, EASE } from "../../utils/motion";

export interface ToastData {
  id: string;
  type: "success" | "error" | "achievement" | "info";
  title: string;
  message?: string;
  duration?: number;
}

const TOAST_CONFIG: Record<
  ToastData["type"],
  { icon: LucideIcon; border: string; text: string; glow: string }
> = {
  success: {
    icon: CheckCircle2,
    border: "border-success",
    text: "text-success",
    glow: "0 0 8px oklch(72% 0.16 155), 0 0 12px oklch(72% 0.16 155 / 0.2)",
  },
  error: {
    icon: AlertTriangle,
    border: "border-error",
    text: "text-error",
    glow: "0 0 8px oklch(62% 0.22 25), 0 0 12px oklch(62% 0.22 25 / 0.2)",
  },
  achievement: {
    icon: Trophy,
    border: "border-info",
    text: "text-info",
    glow: "0 0 8px oklch(60% 0.20 300), 0 0 12px oklch(60% 0.20 300 / 0.2)",
  },
  info: {
    icon: Info,
    border: "border-accent",
    text: "text-accent",
    glow: "0 0 8px oklch(72% 0.14 190), 0 0 12px oklch(72% 0.14 190 / 0.2)",
  },
};

const DEFAULT_DURATION = 5000;

interface ToastProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const config = TOAST_CONFIG[toast.type];
  const Icon = config.icon;
  const duration = toast.duration ?? DEFAULT_DURATION;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ duration: DURATION.base, ease: EASE.out }}
      className={`w-80 rounded-none border-2 ${config.border} bg-surface-raised pointer-events-auto`}
      style={{ boxShadow: config.glow }}
      role="alert"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={`w-5 h-5 ${config.text} shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold uppercase tracking-widest ${config.text}`}>
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="text-neutral-500 hover:text-neutral-300 transition-colors shrink-0"
          aria-label="Benachrichtigung schließen"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}
