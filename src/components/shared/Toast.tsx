import { useEffect } from "react";
import { motion } from "framer-motion";
import { X, CheckCircle2, AlertTriangle, Trophy, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`w-80 rounded-none border-2 ${config.border} bg-surface-raised pointer-events-auto`}
      style={{ boxShadow: config.glow }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={`w-5 h-5 ${config.text} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold tracking-wide ${config.text}`}>
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              {toast.message}
            </p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
