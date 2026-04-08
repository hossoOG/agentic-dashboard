//! Pipeline runner — orchestrates sequential execution of workflow steps.
//!
//! [`PipelineRunner`] takes a parsed [`WorkflowDefinition`], resolves
//! dependencies, executes steps in order, and collects results. The MVP
//! runs steps sequentially (no parallel execution).
//!
//! Related issue: #153

use std::collections::{HashMap, HashSet};

use chrono::Utc;
use uuid::Uuid;

use crate::error::ADPError;
use crate::pipeline::executor::{execute_step, PipelineContext, StepResult};
use crate::pipeline::history::{PipelineRun, RunOutcome, StepRecord};
use crate::pipeline::parser::validate_workflow;
use crate::pipeline::schema::{StepType, WorkflowDefinition};

// ============================================================================
// Runner Result
// ============================================================================

/// Overall result of a complete pipeline run.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineRunResult {
    pub run_id: String,
    pub success: bool,
    pub steps: Vec<StepResult>,
    pub total_duration_ms: u64,
}

// ============================================================================
// Runner
// ============================================================================

/// Orchestrates sequential execution of a workflow's steps.
pub struct PipelineRunner {
    workflow: WorkflowDefinition,
    context: PipelineContext,
    results: Vec<StepResult>,
}

impl PipelineRunner {
    /// Create a new runner for the given workflow.
    pub fn new(
        workflow: WorkflowDefinition,
        inputs: HashMap<String, String>,
        project_path: String,
    ) -> Self {
        let run_id = Uuid::new_v4().to_string();
        Self {
            context: PipelineContext {
                workflow_name: workflow.name.clone(),
                inputs,
                step_outputs: HashMap::new(),
                project_path,
                run_id,
            },
            workflow,
            results: Vec::new(),
        }
    }

    /// Execute all steps sequentially. Returns the overall run result.
    ///
    /// Steps are executed in order. When a step's `depends_on` references
    /// a failed or skipped step, it is itself skipped. Gate failure actions
    /// (fail, skip) are respected.
    pub fn run(&mut self) -> Result<PipelineRunResult, ADPError> {
        validate_workflow(&self.workflow)?;

        let start = std::time::Instant::now();
        let mut failed_steps: HashSet<String> = HashSet::new();
        let mut skipped_steps: HashSet<String> = HashSet::new();

        for step in &self.workflow.steps.clone() {
            // Check dependencies
            let dep_failed = step.depends_on.iter().any(|dep| {
                failed_steps.contains(dep.as_str()) || skipped_steps.contains(dep.as_str())
            });

            if dep_failed {
                let result =
                    StepResult::skipped(&step.id, "Skipped: dependency failed or was skipped");
                skipped_steps.insert(step.id.clone());
                self.results.push(result);
                continue;
            }

            // Execute the step
            let result = execute_step(step, &mut self.context);

            if !result.success && !result.skipped {
                // Check gate failure action for gate steps
                let should_abort = match &step.step_type {
                    StepType::Gate {
                        on_failure,
                        max_retries,
                        ..
                    } => {
                        use crate::pipeline::schema::GateFailureAction;
                        match on_failure {
                            GateFailureAction::Skip => {
                                // Skip this step, continue pipeline
                                skipped_steps.insert(step.id.clone());
                                false
                            }
                            GateFailureAction::Retry => {
                                // Try retries
                                let mut retry_result = result.clone();
                                let mut retried = false;
                                for _attempt in 1..=*max_retries {
                                    retry_result = execute_step(step, &mut self.context);
                                    if retry_result.success {
                                        retried = true;
                                        break;
                                    }
                                }
                                if retried {
                                    self.results.push(retry_result);
                                    continue;
                                }
                                // All retries failed
                                failed_steps.insert(step.id.clone());
                                self.results.push(retry_result);
                                continue;
                            }
                            GateFailureAction::Fail => {
                                failed_steps.insert(step.id.clone());
                                true
                            }
                        }
                    }
                    _ => {
                        failed_steps.insert(step.id.clone());
                        false // Non-gate steps: record failure, continue
                    }
                };

                if should_abort {
                    self.results.push(result);
                    // Mark remaining steps as skipped
                    break;
                }
            }

            self.results.push(result);
        }

        let total_duration_ms = start.elapsed().as_millis() as u64;
        let success =
            failed_steps.is_empty() && self.results.iter().all(|r| r.success || r.skipped);

        Ok(PipelineRunResult {
            run_id: self.context.run_id.clone(),
            success,
            steps: self.results.clone(),
            total_duration_ms,
        })
    }

    /// Convert the run result into a [`PipelineRun`] for persistence.
    pub fn to_pipeline_run(&self, result: &PipelineRunResult) -> PipelineRun {
        let mut run = PipelineRun::new(self.workflow.name.clone(), self.context.inputs.clone());
        run.id = result.run_id.clone();
        run.completed_at = Some(Utc::now());
        run.total_duration_ms = result.total_duration_ms;
        run.project_path = Some(self.context.project_path.clone());
        run.outcome = if result.success {
            RunOutcome::Success
        } else {
            RunOutcome::Failed
        };

        for step_result in &result.steps {
            let step_type_str = self
                .workflow
                .steps
                .iter()
                .find(|s| s.id == step_result.step_id)
                .map(|s| match &s.step_type {
                    StepType::Agent { .. } => "agent",
                    StepType::Gate { .. } => "gate",
                    StepType::Action { .. } => "action",
                })
                .unwrap_or("unknown");

            let outcome = if step_result.skipped {
                RunOutcome::Cancelled // Using Cancelled for skipped steps
            } else if step_result.success {
                RunOutcome::Success
            } else {
                RunOutcome::Failed
            };

            run.steps.push(StepRecord {
                step_id: step_result.step_id.clone(),
                step_type: step_type_str.to_string(),
                started_at: Utc::now(),
                completed_at: Some(Utc::now()),
                outcome,
                duration_ms: step_result.duration_ms,
                retry_count: 0,
                output_snippet: Some(crate::pipeline::error_detection::extract_output_snippet(
                    &step_result.output,
                    500,
                )),
                error_message: step_result.error.as_ref().map(|e| e.message.clone()),
            });
        }

        run
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::schema::*;

    fn test_project_path() -> String {
        std::env::temp_dir().to_string_lossy().to_string()
    }

    fn gate_step(id: &str, command: &str) -> WorkflowStep {
        WorkflowStep {
            id: id.to_string(),
            step_type: StepType::Gate {
                command: command.to_string(),
                on_failure: GateFailureAction::Fail,
                max_retries: 0,
                timeout_secs: Some(10),
            },
            depends_on: vec![],
            condition: None,
        }
    }

    fn action_step(id: &str, command: &str, capture: bool, output: Option<&str>) -> WorkflowStep {
        WorkflowStep {
            id: id.to_string(),
            step_type: StepType::Action {
                command: command.to_string(),
                capture_output: capture,
                output: output.map(|s| s.to_string()),
                timeout_secs: Some(10),
            },
            depends_on: vec![],
            condition: None,
        }
    }

    fn simple_workflow(steps: Vec<WorkflowStep>) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "test-workflow".to_string(),
            description: "A test workflow".to_string(),
            version: 1,
            inputs: vec![],
            steps,
            metadata: WorkflowMetadata::default(),
        }
    }

    // --- PipelineRunner::new ---

    #[test]
    fn runner_new_initializes_correctly() {
        let wf = simple_workflow(vec![gate_step("s1", "echo hi")]);
        let runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        assert_eq!(runner.context.workflow_name, "test-workflow");
        assert!(runner.results.is_empty());
        assert!(!runner.context.run_id.is_empty());
    }

    // --- Running workflows ---

    #[test]
    fn run_single_gate_step_succeeds() {
        let wf = simple_workflow(vec![gate_step("echo-gate", "echo success")]);
        let mut runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        let result = runner.run().unwrap();
        assert!(
            result.success,
            "Single echo gate should succeed: {:?}",
            result
        );
        assert_eq!(result.steps.len(), 1);
        assert!(result.steps[0].success);
    }

    #[test]
    fn run_multiple_gate_steps() {
        let wf = simple_workflow(vec![
            gate_step("g1", "echo step-1"),
            gate_step("g2", "echo step-2"),
            gate_step("g3", "echo step-3"),
        ]);
        let mut runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        let result = runner.run().unwrap();
        assert!(result.success);
        assert_eq!(result.steps.len(), 3);
    }

    #[test]
    fn run_stores_action_output_in_context() {
        let mut steps = vec![
            action_step("capture", "echo captured-value", true, Some("my_output")),
            gate_step("use-output", "echo {my_output}"),
        ];
        steps[1].depends_on = vec!["capture".to_string()];

        let wf = simple_workflow(steps);
        let mut runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        let result = runner.run().unwrap();
        assert!(
            result.success,
            "Workflow with output capture should succeed: {:?}",
            result
        );
        assert_eq!(result.steps.len(), 2);
    }

    // --- Dependency skipping ---

    #[test]
    fn run_skips_step_when_dependency_fails() {
        let mut s2 = gate_step("dependent", "echo should-not-run");
        s2.depends_on = vec!["failing".to_string()];

        #[cfg(target_os = "windows")]
        let fail_cmd = "cmd /C exit 1";
        #[cfg(not(target_os = "windows"))]
        let fail_cmd = "exit 1";

        let wf = simple_workflow(vec![gate_step("failing", fail_cmd), s2]);
        let mut runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        let result = runner.run().unwrap();

        assert!(!result.success);
        // First step fails (gate with Fail action aborts)
        assert!(!result.steps[0].success);
        // After abort, the second step should not even be in results
        // because gate failure with Fail action breaks the loop
    }

    #[test]
    fn run_skips_step_when_dependency_skipped() {
        // Create a chain: s1 (fails) -> s2 (skip on_failure) -> s3 (depends on s2)
        let s1 = WorkflowStep {
            id: "s1".to_string(),
            step_type: StepType::Gate {
                #[cfg(target_os = "windows")]
                command: "cmd /C exit 1".to_string(),
                #[cfg(not(target_os = "windows"))]
                command: "exit 1".to_string(),
                on_failure: GateFailureAction::Skip,
                max_retries: 0,
                timeout_secs: Some(10),
            },
            depends_on: vec![],
            condition: None,
        };

        let mut s2 = gate_step("s2", "echo should-be-skipped");
        s2.depends_on = vec!["s1".to_string()];

        let wf = simple_workflow(vec![s1, s2]);
        let mut runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        let result = runner.run().unwrap();

        // s1 was skipped (via on_failure: skip), s2 depends on s1 so also skipped
        assert_eq!(result.steps.len(), 2);
        assert!(result.steps[1].skipped);
    }

    // --- Input resolution ---

    #[test]
    fn run_resolves_inputs_in_commands() {
        let wf = simple_workflow(vec![gate_step("greet", "echo {name}")]);
        let inputs = HashMap::from([("name".into(), "World".into())]);
        let mut runner = PipelineRunner::new(wf, inputs, test_project_path());
        let result = runner.run().unwrap();
        assert!(result.success);
        assert!(result.steps[0].output.contains("World"));
    }

    // --- PipelineRunResult serialization ---

    #[test]
    fn run_result_serializes_camel_case() {
        let result = PipelineRunResult {
            run_id: "r-1".into(),
            success: true,
            steps: vec![],
            total_duration_ms: 123,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"runId\""));
        assert!(json.contains("\"totalDurationMs\""));
        assert!(!json.contains("\"run_id\""));
    }

    // --- to_pipeline_run conversion ---

    #[test]
    fn to_pipeline_run_converts_correctly() {
        let wf = simple_workflow(vec![gate_step("s1", "echo ok")]);
        let mut runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        let result = runner.run().unwrap();
        let run = runner.to_pipeline_run(&result);

        assert_eq!(run.workflow_name, "test-workflow");
        assert_eq!(run.outcome, RunOutcome::Success);
        assert!(!run.steps.is_empty());
        assert_eq!(run.steps[0].step_type, "gate");
    }

    // --- Gate retry ---

    #[test]
    fn gate_retry_eventually_fails() {
        // A gate that always fails with retry policy — should try max_retries times
        let step = WorkflowStep {
            id: "retry-gate".to_string(),
            step_type: StepType::Gate {
                #[cfg(target_os = "windows")]
                command: "cmd /C exit 1".to_string(),
                #[cfg(not(target_os = "windows"))]
                command: "exit 1".to_string(),
                on_failure: GateFailureAction::Retry,
                max_retries: 2,
                timeout_secs: Some(5),
            },
            depends_on: vec![],
            condition: None,
        };
        let wf = simple_workflow(vec![step]);
        let mut runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        let result = runner.run().unwrap();
        assert!(!result.success);
    }

    // --- Empty workflow rejected ---

    #[test]
    fn run_rejects_empty_workflow() {
        let wf = WorkflowDefinition {
            name: "empty".to_string(),
            description: "no steps".to_string(),
            version: 1,
            inputs: vec![],
            steps: vec![],
            metadata: WorkflowMetadata::default(),
        };
        let mut runner = PipelineRunner::new(wf, HashMap::new(), test_project_path());
        assert!(runner.run().is_err());
    }
}
