/**
 * Centralized status configuration — single source of truth.
 *
 * All status-to-color/icon mappings live here.
 * Components import from this file instead of defining their own maps.
 */

import {
  Brain, Zap, CheckCircle2, Circle, Clock, Loader2, XCircle,
  AlertTriangle, ShieldCheck, ShieldAlert, GitBranch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  OrchestratorStatus,
  WorktreeStatus,
  QACheckStatus,
  WorktreeStep,
} from "../store/pipelineStore";

/* ── Color tokens (Tailwind classes) ── */
export const STATUS_STYLES = {
  idle:     { text: "text-neutral-500",  border: "border-neutral-700", bg: "bg-neutral-500",   dot: "bg-neutral-500" },
  active:   { text: "text-accent",       border: "border-accent",      bg: "bg-accent",        dot: "bg-accent" },
  running:  { text: "text-accent",       border: "border-accent",      bg: "bg-accent",        dot: "bg-accent" },
  done:     { text: "text-success",      border: "border-success",     bg: "bg-success",       dot: "bg-success" },
  pass:     { text: "text-success",      border: "border-success",     bg: "bg-success",       dot: "bg-success" },
  error:    { text: "text-error",        border: "border-error",       bg: "bg-error",         dot: "bg-error" },
  fail:     { text: "text-error",        border: "border-error",       bg: "bg-error",         dot: "bg-error" },
  blocked:  { text: "text-warning",      border: "border-warning",     bg: "bg-warning",       dot: "bg-warning" },
  waiting:  { text: "text-warning",      border: "border-warning",     bg: "bg-warning",       dot: "bg-warning" },
  pending:  { text: "text-neutral-500",  border: "border-neutral-700", bg: "bg-neutral-500",   dot: "bg-neutral-500" },
  skipped:  { text: "text-neutral-400",  border: "border-neutral-600", bg: "bg-neutral-400",   dot: "bg-neutral-400" },
  planning: { text: "text-accent",       border: "border-accent",      bg: "bg-accent",        dot: "bg-accent" },
  generated_manifest: { text: "text-success", border: "border-success", bg: "bg-success",      dot: "bg-success" },
  waiting_for_input:  { text: "text-warning", border: "border-warning", bg: "bg-warning",      dot: "bg-warning" },
} as const;

export type StatusKey = keyof typeof STATUS_STYLES;

/** Get styles for any status string, with fallback to idle */
export function getStatusStyle(status: string) {
  return STATUS_STYLES[status as StatusKey] ?? STATUS_STYLES.idle;
}

/** Statuses that should pulse their indicator dot */
export const PULSE_STATUSES = new Set<string>(["active", "running", "planning"]);

/* ── Orchestrator Config ── */
export const ORCHESTRATOR_CONFIG: Record<OrchestratorStatus, {
  icon: LucideIcon;
  label: string;
}> = {
  idle:                { icon: Brain,        label: "IDLE" },
  planning:            { icon: Zap,          label: "PLANNING" },
  generated_manifest:  { icon: CheckCircle2, label: "MANIFEST READY" },
};

/* ── Worktree Config ── */
export const WORKTREE_STEPS: WorktreeStep[] = [
  "setup", "plan", "validate", "code", "review", "self_verify", "draft_pr",
];

export const STEP_LABELS: Record<WorktreeStep, string> = {
  setup:       "Setup",
  plan:        "Plan",
  validate:    "Validate",
  code:        "Code",
  review:      "Review",
  self_verify: "Self-Verify",
  draft_pr:    "Draft PR",
};

export function getWorktreeIcon(status: WorktreeStatus): LucideIcon {
  if (status === "blocked" || status === "error") return AlertTriangle;
  if (status === "done") return CheckCircle2;
  return GitBranch;
}

export function getStepIcon(step: WorktreeStep, completedSteps: WorktreeStep[], currentStep: WorktreeStep | null): {
  icon: LucideIcon;
  spinning: boolean;
} {
  if (completedSteps.includes(step)) return { icon: CheckCircle2, spinning: false };
  if (currentStep === step) return { icon: Loader2, spinning: true };
  return { icon: Circle, spinning: false };
}

/* ── QA Gate Config ── */
export const QA_CHECK_LABELS = {
  unitTests: "Unit Tests",
  typeCheck: "TypeCheck",
  lint: "ESLint",
  build: "Build",
  e2e: "E2E Tests",
} as const;

export const QA_STATUS_ICONS: Record<QACheckStatus, LucideIcon> = {
  pending: Clock,
  running: Loader2,
  pass: CheckCircle2,
  fail: XCircle,
};

export function getQAShieldIcon(status: string): LucideIcon {
  return status === "pass" ? ShieldCheck : ShieldAlert;
}
