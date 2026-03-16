import { getStatusStyle, PULSE_STATUSES } from "../../utils/statusConfig";

type BadgeStatus =
  | "idle"
  | "active"
  | "blocked"
  | "waiting"
  | "done"
  | "error"
  | "running"
  | "pass"
  | "fail"
  | "pending"
  | "skipped";

type BadgeSize = "sm" | "md" | "lg";

const SIZE_CONFIG: Record<BadgeSize, { dot: string; text: string; gap: string; px: string }> = {
  sm: { dot: "w-1.5 h-1.5", text: "text-xs",   gap: "gap-1",   px: "px-1.5 py-0.5" },
  md: { dot: "w-2 h-2",     text: "text-xs",   gap: "gap-1.5", px: "px-2 py-1" },
  lg: { dot: "w-2.5 h-2.5", text: "text-sm",   gap: "gap-2",   px: "px-3 py-1.5" },
};

interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  size?: BadgeSize;
  pulse?: boolean;
}

export function StatusBadge({
  status,
  label,
  size = "md",
  pulse,
}: StatusBadgeProps) {
  const styles = getStatusStyle(status);
  const sizeConfig = SIZE_CONFIG[size];
  const shouldPulse = pulse ?? PULSE_STATUSES.has(status);

  return (
    <span
      className={`inline-flex items-center ${sizeConfig.gap} ${sizeConfig.px}`}
      aria-label={label ?? status}
    >
      <span
        className={`${sizeConfig.dot} rounded-full ${styles.dot} shrink-0 ${
          shouldPulse ? "status-pulse-animation" : ""
        }`}
      />
      {label && (
        <span className={`${sizeConfig.text} font-medium tracking-wide ${styles.text}`}>
          {label}
        </span>
      )}
    </span>
  );
}
