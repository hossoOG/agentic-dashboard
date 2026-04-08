/**
 * TypeScript interfaces matching the Rust pipeline history structs.
 * Field names use camelCase (matching `serde(rename_all = "camelCase")`).
 */

/** Outcome of a completed pipeline run. */
export type RunOutcome = "success" | "failed" | "cancelled" | "timed_out";

/** Record of a single step execution within a pipeline run. */
export interface StepRecord {
  /** Unique identifier for the step. */
  stepId: string;
  /** Type of step: "agent", "gate", "action". */
  stepType: string;
  /** ISO 8601 timestamp when the step started. */
  startedAt: string;
  /** ISO 8601 timestamp when the step completed, or null if still running. */
  completedAt: string | null;
  /** Outcome of this step. */
  outcome: RunOutcome;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Number of retries attempted. */
  retryCount: number;
  /** Last ~500 chars of output. */
  outputSnippet: string | null;
  /** Error message if the step failed. */
  errorMessage: string | null;
}

/** A complete pipeline run record. */
export interface PipelineRun {
  /** UUID of this run. */
  id: string;
  /** Name of the workflow that was executed. */
  workflowName: string;
  /** ISO 8601 timestamp when the run started. */
  startedAt: string;
  /** ISO 8601 timestamp when the run completed, or null if still running. */
  completedAt: string | null;
  /** Final outcome of the run. */
  outcome: RunOutcome;
  /** How the run was triggered: "manual", "scheduled", "webhook". */
  trigger: string;
  /** Input parameters for the run. */
  inputs: Record<string, string>;
  /** Step execution records in order. */
  steps: StepRecord[];
  /** Total wall-clock duration in milliseconds. */
  totalDurationMs: number;
  /** Total tokens consumed across all steps. */
  totalTokens: number | null;
  /** Path to the project this run was executed against. */
  projectPath: string | null;
}
