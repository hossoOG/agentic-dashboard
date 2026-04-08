import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
} from "lucide-react";
import type { RunOutcome } from "../../types/pipelineHistory";

/** Visual configuration for each pipeline run outcome. */
export const OUTCOME_CONFIG: Record<
  RunOutcome,
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  success: {
    label: "Erfolg",
    color: "text-green-400",
    bg: "bg-green-400/10",
    icon: CheckCircle2,
  },
  failed: {
    label: "Fehlgeschlagen",
    color: "text-red-400",
    bg: "bg-red-400/10",
    icon: XCircle,
  },
  cancelled: {
    label: "Abgebrochen",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    icon: AlertTriangle,
  },
  timed_out: {
    label: "Timeout",
    color: "text-neutral-400",
    bg: "bg-neutral-400/10",
    icon: Clock,
  },
};

/** Format an ISO date string to a localized German date/time. */
export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
