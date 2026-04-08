/**
 * Workflow Definition Types (TypeScript mirror of Rust schema)
 *
 * These types match the Rust structs in `src-tauri/src/pipeline/schema.rs`.
 * Field names use snake_case because they come from Rust via serde.
 *
 * Related issues: #151 (schema), #152 (parser), #153 (executor)
 */

// ============================================================================
// Top-level Workflow
// ============================================================================

/** Top-level workflow definition loaded from YAML. */
export interface WorkflowDefinition {
  /** Human-readable workflow name (e.g. "implement-feature") */
  name: string;

  /** Short description of what the workflow does */
  description: string;

  /** Schema version for forward-compatibility (default: 1) */
  version: number;

  /** Inputs the workflow expects from the caller */
  inputs: WorkflowInput[];

  /** Ordered list of steps to execute */
  steps: WorkflowStep[];

  /** Optional metadata (author, tags, etc.) */
  metadata: WorkflowMetadata;
}

// ============================================================================
// Inputs
// ============================================================================

/** A single input parameter for a workflow. */
export interface WorkflowInput {
  /** Parameter name used in template expressions (e.g. `{issue_id}`) */
  name: string;

  /** Type of the input value */
  type: InputType;

  /** Whether the input must be provided (default: false) */
  required: boolean;

  /** Default value if not provided */
  default?: string | null;

  /** Human-readable description */
  description?: string | null;

  /** Options for select inputs — only used when `type === "select"` */
  options: string[];
}

/** Supported input types. */
export type InputType = "string" | "number" | "boolean" | "select";

// ============================================================================
// Steps
// ============================================================================

/** A single step in the workflow pipeline. */
export interface WorkflowStep {
  /** Unique identifier within the workflow (e.g. "analyze", "test-gate") */
  id: string;

  /** Step type discriminator */
  type: "agent" | "gate" | "action";

  /** IDs of steps that must complete before this one runs */
  depends_on: string[];

  /** Optional condition — step is skipped if it evaluates to false */
  condition?: string | null;

  // --- Agent fields (present when type === "agent") ---

  /** Model to use: "opus", "sonnet", "haiku" */
  model?: string | null;

  /** The prompt template — may contain `{variable}` placeholders */
  prompt?: string;

  /** If true, agent cannot modify files */
  read_only?: boolean;

  /** If true, agent runs in a separate git worktree */
  worktree?: boolean;

  // --- Gate fields (present when type === "gate") ---

  /** Shell command to execute (gate or action) */
  command?: string;

  /** What to do if the gate command fails */
  on_failure?: GateFailureAction;

  /** Maximum number of retries (default: 2) */
  max_retries?: number;

  // --- Action fields (present when type === "action") ---

  /** If true, capture stdout into the output variable */
  capture_output?: boolean;

  // --- Shared optional fields ---

  /** Variable name to store the step's output */
  output?: string | null;

  /** Timeout in seconds */
  timeout_secs?: number | null;
}

/** What happens when a gate command fails. */
export type GateFailureAction = "fail" | "retry" | "skip";

// ============================================================================
// Metadata
// ============================================================================

/** Optional workflow metadata for documentation and tooling. */
export interface WorkflowMetadata {
  /** Who created the workflow */
  author?: string | null;

  /** Tags for categorization/search */
  tags: string[];

  /** Estimated duration in minutes */
  estimated_duration_mins?: number | null;
}
