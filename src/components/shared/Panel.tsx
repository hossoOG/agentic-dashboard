import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DURATION } from "../../utils/motion";

type SemanticColor = "accent" | "success" | "error" | "warning";

const COLOR_CONFIG: Record<SemanticColor, {
  border: string;
  glow: string;
  text: string;
}> = {
  accent:  { border: "border-accent",  glow: "glow-accent",  text: "text-accent" },
  success: { border: "border-success", glow: "glow-success", text: "text-success" },
  error:   { border: "border-error",   glow: "glow-error",   text: "text-error" },
  warning: { border: "border-warning", glow: "glow-warning", text: "text-warning" },
};

interface PanelProps {
  title?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  neonColor?: SemanticColor;
}

export function Panel({
  title,
  icon: Icon,
  children,
  collapsible = false,
  defaultCollapsed = false,
  className = "",
  neonColor = "accent",
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const colorConfig = COLOR_CONFIG[neonColor];

  return (
    <div
      className={`rounded-none border-2 ${colorConfig.border} ${colorConfig.glow} bg-surface-raised overflow-hidden ${className}`}
    >
      {/* Header */}
      {(title || Icon) && (
        <div
          className={`flex items-center justify-between px-4 py-3 border-b border-neutral-700 ${
            collapsible ? "cursor-pointer select-none" : ""
          }`}
          onClick={collapsible ? () => setCollapsed((prev) => !prev) : undefined}
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className={`w-4 h-4 ${colorConfig.text}`} />}
            {title && (
              <span className={`font-bold text-sm tracking-widest ${colorConfig.text}`}>
                {title.toUpperCase()}
              </span>
            )}
          </div>
          {collapsible && (
            <motion.div
              animate={{ rotate: collapsed ? 0 : 180 }}
              transition={{ duration: DURATION.base }}
            >
              <ChevronDown className={`w-4 h-4 ${colorConfig.text}`} />
            </motion.div>
          )}
        </div>
      )}

      {/* Content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="panel-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION.base, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
