import { motion } from "framer-motion";
import type { WorktreeStatus } from "../../store/pipelineStore";

type AvatarSize = "sm" | "md" | "lg";
type AgentType = "orchestrator" | "worker" | "qa";

interface Props {
  agentId: string;
  size?: AvatarSize;
  status?: WorktreeStatus;
  type?: AgentType;
}

const SIZE_PX: Record<AvatarSize, number> = {
  sm: 24,
  md: 32,
  lg: 48,
};

const STATUS_GLOW: Record<WorktreeStatus, string> = {
  idle: "rgba(107,114,128,0.0)",
  active: "rgba(0,212,255,0.6)",
  blocked: "rgba(255,68,68,0.6)",
  waiting_for_input: "rgba(255,107,0,0.6)",
  done: "rgba(0,255,136,0.6)",
  error: "rgba(255,68,68,0.6)",
};

const TYPE_BASE_HUE: Record<AgentType, number> = {
  orchestrator: 260, // purple
  worker: 170,       // cyan-ish
  qa: 30,            // orange
};

/** Simple string hash for deterministic avatar generation */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Generate a palette of HSL colors from a hash */
function generatePalette(hash: number, type: AgentType) {
  const baseHue = TYPE_BASE_HUE[type];
  const hueShift = (hash % 60) - 30; // -30 to +30 variation
  const hue = (baseHue + hueShift + 360) % 360;
  const sat = 70 + (hash % 20); // 70-90
  const light1 = 45 + ((hash >> 4) % 15); // 45-60
  const light2 = 55 + ((hash >> 8) % 15); // 55-70

  return {
    primary: `hsl(${hue}, ${sat}%, ${light1}%)`,
    secondary: `hsl(${(hue + 40) % 360}, ${sat - 10}%, ${light2}%)`,
    accent: `hsl(${(hue + 180) % 360}, ${sat - 20}%, ${light1 + 10}%)`,
  };
}

/** Deterministic shape pattern from hash */
function generateShape(hash: number, size: number) {
  const shapes: React.ReactNode[] = [];
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;

  // Pick a shape variant (0-3)
  const variant = hash % 4;

  if (variant === 0) {
    // Hexagon
    const points = Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(" ");
    shapes.push(<polygon key="hex" points={points} />);
  } else if (variant === 1) {
    // Diamond + inner circle
    const dr = r * 0.9;
    shapes.push(
      <polygon
        key="diamond"
        points={`${cx},${cy - dr} ${cx + dr},${cy} ${cx},${cy + dr} ${cx - dr},${cy}`}
      />
    );
    shapes.push(<circle key="inner" cx={cx} cy={cy} r={r * 0.35} />);
  } else if (variant === 2) {
    // Rounded square
    const halfSide = r * 0.75;
    shapes.push(
      <rect
        key="sq"
        x={cx - halfSide}
        y={cy - halfSide}
        width={halfSide * 2}
        height={halfSide * 2}
        rx={halfSide * 0.25}
      />
    );
  } else {
    // Circle + cross lines
    shapes.push(<circle key="circ" cx={cx} cy={cy} r={r * 0.7} />);
    const lineLen = r * 0.4;
    shapes.push(
      <line key="h" x1={cx - lineLen} y1={cy} x2={cx + lineLen} y2={cy} strokeWidth={1.5} />,
      <line key="v" x1={cx} y1={cy - lineLen} x2={cx} y2={cy + lineLen} strokeWidth={1.5} />
    );
  }

  // Decorative dots based on hash bits
  const dotCount = 2 + ((hash >> 12) % 3);
  for (let i = 0; i < dotCount; i++) {
    const angle = ((hash >> (16 + i * 4)) % 360) * (Math.PI / 180);
    const dist = r * (0.6 + ((hash >> (20 + i)) % 30) / 100);
    shapes.push(
      <circle
        key={`dot-${i}`}
        cx={cx + dist * Math.cos(angle)}
        cy={cy + dist * Math.sin(angle)}
        r={size * 0.04}
        opacity={0.6}
      />
    );
  }

  return shapes;
}

export function AgentAvatar({ agentId, size = "md", status = "idle", type = "worker" }: Props) {
  const px = SIZE_PX[size];
  const hash = hashString(agentId);
  const palette = generatePalette(hash, type);
  const shapes = generateShape(hash, px);

  const isActive = status === "active";
  const isError = status === "error";
  const glowColor = STATUS_GLOW[status];

  return (
    <motion.div
      animate={
        isError
          ? { scale: [1, 1.06, 1] }
          : isActive
          ? { scale: [1, 1.03, 1] }
          : { scale: [1, 1.015, 1] }
      }
      transition={{
        duration: isError ? 0.8 : isActive ? 2 : 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
      style={{
        width: px,
        height: px,
        filter: status !== "idle" ? `drop-shadow(0 0 ${isError ? 6 : 4}px ${glowColor})` : undefined,
      }}
    >
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background circle */}
        <circle
          cx={px / 2}
          cy={px / 2}
          r={px / 2 - 1}
          fill="oklch(15% 0.012 250)"
          stroke={isError ? "oklch(62% 0.22 25)" : palette.primary}
          strokeWidth={1.5}
          opacity={0.9}
        />

        {/* Shape group */}
        <g
          fill={palette.primary}
          stroke={palette.secondary}
          strokeWidth={1}
          opacity={0.85}
        >
          {shapes}
        </g>

        {/* Type indicator dot at bottom */}
        <circle
          cx={px / 2}
          cy={px - 3}
          r={px * 0.06}
          fill={palette.accent}
        />
      </svg>
    </motion.div>
  );
}
