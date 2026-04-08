//! Workflow Definition Schema for declarative YAML pipelines.
//!
//! Defines the Rust structs that map to YAML workflow files. Each workflow
//! describes a sequence of steps (agent, gate, action) that the pipeline
//! engine executes. This module is pure types + serde — no runtime logic.
//!
//! Related issues: #151 (schema), #152 (parser), #153 (executor)

use serde::{Deserialize, Serialize};

// ============================================================================
// Top-level Workflow
// ============================================================================

/// Top-level workflow definition loaded from YAML.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct WorkflowDefinition {
    /// Human-readable workflow name (e.g. "implement-feature")
    pub name: String,

    /// Short description of what the workflow does
    pub description: String,

    /// Schema version for forward-compatibility
    #[serde(default = "default_version")]
    pub version: u32,

    /// Inputs the workflow expects from the caller
    #[serde(default)]
    pub inputs: Vec<WorkflowInput>,

    /// Ordered list of steps to execute
    pub steps: Vec<WorkflowStep>,

    /// Optional metadata (author, tags, etc.)
    #[serde(default)]
    pub metadata: WorkflowMetadata,
}

fn default_version() -> u32 {
    1
}

// ============================================================================
// Inputs
// ============================================================================

/// A single input parameter for a workflow.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowInput {
    /// Parameter name used in template expressions (e.g. `{issue_id}`)
    pub name: String,

    /// Type of the input value: "string", "number", "boolean", or "select"
    #[serde(rename = "type")]
    pub input_type: InputType,

    /// Whether the input must be provided (default: false)
    #[serde(default)]
    pub required: bool,

    /// Default value if not provided
    pub default: Option<String>,

    /// Human-readable description
    pub description: Option<String>,

    /// Options for select inputs — only used when `type: select`
    #[serde(default)]
    pub options: Vec<String>,
}

/// Supported input types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum InputType {
    String,
    Number,
    Boolean,
    Select,
}

// ============================================================================
// Steps
// ============================================================================

/// A single step in the workflow pipeline.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorkflowStep {
    /// Unique identifier within the workflow (e.g. "analyze", "test-gate")
    pub id: String,

    /// What this step does
    #[serde(flatten)]
    pub step_type: StepType,

    /// IDs of steps that must complete before this one runs
    #[serde(default)]
    pub depends_on: Vec<String>,

    /// Optional condition expression — step is skipped if it evaluates to false
    #[serde(default)]
    pub condition: Option<String>,
}

/// The kind of work a step performs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StepType {
    /// Spawn a Claude CLI agent with a prompt
    Agent {
        /// Model to use: "opus", "sonnet", "haiku" (default: project default)
        model: Option<String>,
        /// The prompt template — may contain `{variable}` placeholders
        prompt: String,
        /// If true, agent cannot modify files
        #[serde(default)]
        read_only: bool,
        /// If true, agent runs in a separate git worktree
        #[serde(default)]
        worktree: bool,
        /// Variable name to store the agent's output
        output: Option<String>,
    },

    /// Run a command and check its exit code (quality gate)
    Gate {
        /// Shell command to execute
        command: String,
        /// What to do if the command fails
        #[serde(default)]
        on_failure: GateFailureAction,
        /// Maximum number of retries (default: 2)
        #[serde(default = "default_max_retries")]
        max_retries: u32,
        /// Timeout in seconds
        timeout_secs: Option<u64>,
    },

    /// Execute a CLI command (e.g. git, gh)
    Action {
        /// Shell command to execute
        command: String,
        /// If true, capture stdout into the output variable
        #[serde(default)]
        capture_output: bool,
        /// Variable name to store captured output
        output: Option<String>,
        /// Timeout in seconds
        timeout_secs: Option<u64>,
    },
}

fn default_max_retries() -> u32 {
    2
}

/// What happens when a gate command fails.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum GateFailureAction {
    /// Abort the workflow
    #[default]
    Fail,
    /// Retry the step up to `max_retries` times
    Retry,
    /// Skip this step and continue
    Skip,
}

// ============================================================================
// Metadata
// ============================================================================

/// Optional workflow metadata for documentation and tooling.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct WorkflowMetadata {
    /// Who created the workflow
    pub author: Option<String>,

    /// Tags for categorization/search
    #[serde(default)]
    pub tags: Vec<String>,

    /// Estimated duration in minutes
    pub estimated_duration_mins: Option<u32>,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_yaml() -> &'static str {
        r#"
name: test-workflow
description: "A test workflow"
steps:
  - id: step1
    type: agent
    prompt: "Do something"
"#
    }

    fn full_yaml() -> &'static str {
        r#"
name: implement-feature
description: "Issue -> Branch -> Implement -> Test -> PR"
version: 2
inputs:
  - name: issue_id
    type: string
    required: true
    description: "GitHub Issue ID"
  - name: branch_prefix
    type: string
    default: "feat"
  - name: priority
    type: select
    options:
      - low
      - medium
      - high
steps:
  - id: analyze
    type: agent
    model: opus
    prompt: "Analysiere Issue #{issue_id}. Erstelle Implementierungsplan."
    read_only: true
    output: plan

  - id: implement
    type: agent
    model: sonnet
    prompt: "Implementiere nach Plan: {plan}"
    worktree: true
    depends_on:
      - analyze

  - id: test-gate
    type: gate
    command: "npm run test"
    on_failure: retry
    max_retries: 3
    timeout_secs: 300
    depends_on:
      - implement

  - id: lint-gate
    type: gate
    command: "npm run lint"
    on_failure: skip
    depends_on:
      - implement

  - id: review
    type: agent
    model: opus
    prompt: "Review der Aenderungen"
    read_only: true
    depends_on:
      - test-gate
      - lint-gate

  - id: create-pr
    type: action
    command: "gh pr create --title '{title}' --body '{summary}'"
    capture_output: true
    output: pr_url
    timeout_secs: 60
    depends_on:
      - review
    condition: "review.approved == true"

metadata:
  author: "hossoOG"
  tags:
    - feature
    - implementation
  estimated_duration_mins: 30
"#
    }

    #[test]
    fn deserialize_minimal_workflow() {
        let wf: WorkflowDefinition = serde_yaml::from_str(minimal_yaml()).unwrap();
        assert_eq!(wf.name, "test-workflow");
        assert_eq!(wf.description, "A test workflow");
        assert_eq!(wf.version, 1); // default
        assert!(wf.inputs.is_empty());
        assert_eq!(wf.steps.len(), 1);
    }

    #[test]
    fn deserialize_full_workflow() {
        let wf: WorkflowDefinition = serde_yaml::from_str(full_yaml()).unwrap();
        assert_eq!(wf.name, "implement-feature");
        assert_eq!(wf.version, 2);
        assert_eq!(wf.inputs.len(), 3);
        assert_eq!(wf.steps.len(), 6);
        assert_eq!(wf.metadata.author, Some("hossoOG".to_string()));
        assert_eq!(wf.metadata.tags.len(), 2);
        assert_eq!(wf.metadata.estimated_duration_mins, Some(30));
    }

    #[test]
    fn deserialize_agent_step() {
        let wf: WorkflowDefinition = serde_yaml::from_str(full_yaml()).unwrap();
        let step = &wf.steps[0];
        assert_eq!(step.id, "analyze");
        match &step.step_type {
            StepType::Agent {
                model,
                prompt,
                read_only,
                worktree,
                output,
            } => {
                assert_eq!(model.as_deref(), Some("opus"));
                assert!(prompt.contains("Analysiere Issue"));
                assert!(*read_only);
                assert!(!*worktree);
                assert_eq!(output.as_deref(), Some("plan"));
            }
            other => panic!("Expected Agent step, got {:?}", other),
        }
    }

    #[test]
    fn deserialize_gate_step() {
        let wf: WorkflowDefinition = serde_yaml::from_str(full_yaml()).unwrap();
        let step = &wf.steps[2];
        assert_eq!(step.id, "test-gate");
        match &step.step_type {
            StepType::Gate {
                command,
                on_failure,
                max_retries,
                timeout_secs,
            } => {
                assert_eq!(command, "npm run test");
                assert_eq!(*on_failure, GateFailureAction::Retry);
                assert_eq!(*max_retries, 3);
                assert_eq!(*timeout_secs, Some(300));
            }
            other => panic!("Expected Gate step, got {:?}", other),
        }
    }

    #[test]
    fn deserialize_action_step() {
        let wf: WorkflowDefinition = serde_yaml::from_str(full_yaml()).unwrap();
        let step = &wf.steps[5];
        assert_eq!(step.id, "create-pr");
        match &step.step_type {
            StepType::Action {
                command,
                capture_output,
                output,
                timeout_secs,
            } => {
                assert!(command.contains("gh pr create"));
                assert!(*capture_output);
                assert_eq!(output.as_deref(), Some("pr_url"));
                assert_eq!(*timeout_secs, Some(60));
            }
            other => panic!("Expected Action step, got {:?}", other),
        }
    }

    #[test]
    fn deserialize_gate_default_values() {
        let yaml = r#"
name: defaults
description: test
steps:
  - id: gate1
    type: gate
    command: "echo ok"
"#;
        let wf: WorkflowDefinition = serde_yaml::from_str(yaml).unwrap();
        match &wf.steps[0].step_type {
            StepType::Gate {
                on_failure,
                max_retries,
                timeout_secs,
                ..
            } => {
                assert_eq!(*on_failure, GateFailureAction::Fail);
                assert_eq!(*max_retries, 2);
                assert_eq!(*timeout_secs, None);
            }
            other => panic!("Expected Gate, got {:?}", other),
        }
    }

    #[test]
    fn deserialize_input_types() {
        let wf: WorkflowDefinition = serde_yaml::from_str(full_yaml()).unwrap();

        // String input
        assert_eq!(wf.inputs[0].input_type, InputType::String);
        assert!(wf.inputs[0].required);
        assert_eq!(wf.inputs[0].default, None);
        assert!(wf.inputs[0].options.is_empty());

        // String with default
        assert_eq!(wf.inputs[1].input_type, InputType::String);
        assert!(!wf.inputs[1].required);
        assert_eq!(wf.inputs[1].default, Some("feat".to_string()));

        // Select input
        assert_eq!(wf.inputs[2].input_type, InputType::Select);
        assert_eq!(wf.inputs[2].options, vec!["low", "medium", "high"]);
    }

    #[test]
    fn deserialize_depends_on_and_condition() {
        let wf: WorkflowDefinition = serde_yaml::from_str(full_yaml()).unwrap();

        // Step with no dependencies
        assert!(wf.steps[0].depends_on.is_empty());
        assert!(wf.steps[0].condition.is_none());

        // Step with dependencies
        assert_eq!(wf.steps[2].depends_on, vec!["implement"]);

        // Step with multiple dependencies
        assert_eq!(wf.steps[4].depends_on, vec!["test-gate", "lint-gate"]);

        // Step with condition
        assert_eq!(
            wf.steps[5].condition.as_deref(),
            Some("review.approved == true")
        );
    }

    #[test]
    fn invalid_yaml_returns_error() {
        let bad_yaml = r#"
name: broken
description: test
steps:
  - id: bad
    type: unknown_type
    foo: bar
"#;
        let result = serde_yaml::from_str::<WorkflowDefinition>(bad_yaml);
        assert!(result.is_err());
    }

    #[test]
    fn missing_required_fields_returns_error() {
        // Missing 'steps' field
        let yaml = r#"
name: incomplete
description: "no steps"
"#;
        let result = serde_yaml::from_str::<WorkflowDefinition>(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn serialize_roundtrip() {
        let wf: WorkflowDefinition = serde_yaml::from_str(full_yaml()).unwrap();
        let serialized = serde_yaml::to_string(&wf).unwrap();
        let deserialized: WorkflowDefinition = serde_yaml::from_str(&serialized).unwrap();
        assert_eq!(wf, deserialized);
    }

    #[test]
    fn empty_steps_list_is_valid() {
        let yaml = r#"
name: empty
description: "no steps"
steps: []
"#;
        let wf: WorkflowDefinition = serde_yaml::from_str(yaml).unwrap();
        assert!(wf.steps.is_empty());
    }

    #[test]
    fn number_and_boolean_input_types() {
        let yaml = r#"
name: typed-inputs
description: test
inputs:
  - name: count
    type: number
    required: true
  - name: dry_run
    type: boolean
    default: "true"
steps: []
"#;
        let wf: WorkflowDefinition = serde_yaml::from_str(yaml).unwrap();
        assert_eq!(wf.inputs[0].input_type, InputType::Number);
        assert_eq!(wf.inputs[1].input_type, InputType::Boolean);
        assert_eq!(wf.inputs[1].default, Some("true".to_string()));
    }
}
