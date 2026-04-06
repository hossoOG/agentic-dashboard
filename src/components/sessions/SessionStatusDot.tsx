import { Check, AlertTriangle } from "lucide-react";
import type { SessionStatus } from "../../store/sessionStore";
import type { ActivityLevel } from "./activityLevel";

/**
 * Centralized session status dot — single source of truth for
 * status-to-color mapping across SessionCard, GridCell, and SessionStatusBar.
 *
 * Uses theme tokens (bg-success, bg-warning, bg-error) instead of hardcoded
 * Tailwind colors to stay consistent with the design system.
 */

type DotSize = "sm" | "md";

const SIZE_CLASSES: Record<DotSize, { dot: string; icon: string }> = {
  sm: { dot: "w-2 h-2", icon: "w-3 h-3" },
  md: { dot: "w-2.5 h-2.5", icon: "w-3.5 h-3.5" },
};

interface SessionStatusDotProps {
  status: SessionStatus;
  activityLevel?: ActivityLevel | null;
  size?: DotSize;
  /** Use icon variants (Check/AlertTriangle) for done/error instead of plain dots */
  useIcons?: boolean;
}

export function SessionStatusDot({
  status,
  activityLevel = null,
  size = "md",
  useIcons = false,
}: SessionStatusDotProps) {
  const { dot, icon } = SIZE_CLASSES[size];

  switch (status) {
    case "running":
    case "starting":
      if (activityLevel === "idle") {
        return <span className={`${dot} rounded-full bg-neutral-500 shrink-0`} />;
      }
      if (activityLevel === "thinking") {
        return (
          <span className={`${dot} rounded-full bg-info status-breathe-animation shrink-0`} />
        );
      }
      // active or no activity level — green pulse
      return (
        <span className={`${dot} rounded-full bg-success status-pulse-animation shrink-0`} />
      );

    case "waiting":
      return (
        <span className={`${dot} rounded-full bg-warning status-pulse-animation shrink-0`} />
      );

    case "done":
      return useIcons ? (
        <Check className={`${icon} text-success shrink-0`} />
      ) : (
        <span className={`${dot} rounded-full bg-neutral-500 shrink-0`} />
      );

    case "error":
      return useIcons ? (
        <AlertTriangle className={`${icon} text-error shrink-0`} />
      ) : (
        <span className={`${dot} rounded-full bg-error shrink-0`} />
      );
  }
}
