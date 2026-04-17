/**
 * Motion Design Tokens — based on Impeccable motion-design principles.
 *
 * Rules:
 * - Only animate `transform` and `opacity`
 * - Use exponential easing (ease-out-expo), never bounce/elastic
 * - Exit animations = 75% of enter duration
 * - Respect `prefers-reduced-motion` (handled in CSS)
 */

import type { BezierDefinition } from "framer-motion";

/* ── Durations (100/300/500 rule) ── */
export const DURATION = {
  /** Instant feedback: button press, toggle, color change */
  instant: 0.1,
  /** State changes: menu open, tooltip, hover */
  fast: 0.2,
  /** Layout changes: accordion, modal, drawer */
  base: 0.3,
  /** Entrance animations: page load, card reveals */
  slow: 0.5,
  /** Ambient effects: scan lines, background loops */
  ambient: 8,
} as const;

/* ── Easing curves (exponential, no bounce) ── */
export const EASE: Record<"out" | "in" | "inOut", BezierDefinition> = {
  /** Elements entering — smooth deceleration (default) */
  out: [0.16, 1, 0.3, 1],
  /** Elements leaving — smooth acceleration */
  in: [0.7, 0, 0.84, 0],
  /** State toggles — symmetric */
  inOut: [0.65, 0, 0.35, 1],
};

/* ── Reusable animation variants ── */
export const VARIANTS = {
  /** Subtle breathing pulse for active elements */
  breathe: (active: boolean) => ({
    scale: active ? [1, 1.015, 1] : 1,
  }),

  /** Continuous rotation for loading indicators */
  spin: (active: boolean) => ({
    rotate: active ? 360 : 0,
  }),

  /** Status dot pulse */
  dotPulse: (active: boolean) => ({
    opacity: active ? [1, 0.3, 1] : 0.4,
  }),

  /** Fade in from left (list items) */
  fadeInLeft: {
    initial: { opacity: 0, x: -8 },
    animate: { opacity: 1, x: 0 },
  },

  /** Slide in from right (panels) */
  slideInRight: {
    initial: { x: "100%" },
    animate: { x: 0 },
    exit: { x: "100%" },
  },

  /** Collapse/expand */
  collapse: {
    initial: { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1 },
    exit: { height: 0, opacity: 0 },
  },
} as const;

/* ── Stagger delay ── */
export const staggerDelay = (index: number, perItem = 0.08) =>
  Math.min(index * perItem, 0.5); // Cap at 500ms total
