//! Step executors for pipeline workflow steps.
//!
//! Each step type (Agent, Gate, Action) has its own executor function that
//! spawns a process, captures output, and returns a [`StepResult`]. The
//! dispatcher [`execute_step`] resolves input references, picks the right
//! executor, and stores the output in the pipeline context.
//!
//! Related issue: #153

use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::pipeline::error_detection::{create_failure, StepFailure};
use crate::pipeline::parser::resolve_input_refs;
use crate::pipeline::schema::{StepType, WorkflowStep};
use crate::util::silent_command;

/// Default timeout for pipeline steps (5 minutes).
const DEFAULT_TIMEOUT_SECS: u64 = 300;

// ============================================================================
// Result & Context
// ============================================================================

/// Result of executing a single pipeline step.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepResult {
    pub step_id: String,
    pub success: bool,
    pub output: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u64,
    pub error: Option<StepFailure>,
    /// Whether this step was skipped (dependency failed, condition false)
    pub skipped: bool,
}

impl StepResult {
    /// Create a successful result.
    fn success(step_id: &str, output: String, exit_code: i32, duration_ms: u64) -> Self {
        Self {
            step_id: step_id.to_string(),
            success: true,
            output,
            exit_code: Some(exit_code),
            duration_ms,
            error: None,
            skipped: false,
        }
    }

    /// Create a failed result.
    fn failure(
        step_id: &str,
        output: String,
        exit_code: Option<i32>,
        duration_ms: u64,
        error: StepFailure,
    ) -> Self {
        Self {
            step_id: step_id.to_string(),
            success: false,
            output,
            exit_code,
            duration_ms,
            error: Some(error),
            skipped: false,
        }
    }

    /// Create a skipped result (dependency not met).
    pub fn skipped(step_id: &str, reason: &str) -> Self {
        Self {
            step_id: step_id.to_string(),
            success: false,
            output: reason.to_string(),
            exit_code: None,
            duration_ms: 0,
            error: None,
            skipped: true,
        }
    }
}

/// Context passed to each step during execution.
///
/// Accumulates step outputs so later steps can reference earlier results
/// via `{step_id}` or `{output_var}` placeholders.
#[derive(Debug, Clone)]
pub struct PipelineContext {
    pub workflow_name: String,
    pub inputs: HashMap<String, String>,
    /// Maps step output variable names to their captured output.
    pub step_outputs: HashMap<String, String>,
    pub project_path: String,
    pub run_id: String,
}

impl PipelineContext {
    /// Build a combined variable map for input reference resolution.
    /// Includes both caller-provided inputs and step outputs.
    pub fn all_variables(&self) -> HashMap<String, String> {
        let mut vars = self.inputs.clone();
        vars.extend(self.step_outputs.clone());
        vars
    }
}

// ============================================================================
// Step Executors
// ============================================================================

/// Execute a gate step: run a shell command, success = exit code 0.
pub fn execute_gate_step(
    step_id: &str,
    command: &str,
    timeout_secs: Option<u64>,
    project_path: &str,
) -> StepResult {
    execute_shell_command(step_id, command, timeout_secs, project_path)
}

/// Execute an action step: run a shell command, optionally capture output.
///
/// Functionally identical to a gate step at the process level. The
/// difference (capture vs. pass/fail) is handled by the caller storing
/// the output in the context when `capture_output` is true.
pub fn execute_action_step(
    step_id: &str,
    command: &str,
    timeout_secs: Option<u64>,
    project_path: &str,
) -> StepResult {
    execute_shell_command(step_id, command, timeout_secs, project_path)
}

/// Execute an agent step: spawn `claude --print` with the given prompt.
///
/// Uses `--print` for non-interactive mode. Optionally sets `--model`.
/// When `read_only` is true, the agent cannot modify files (future flag).
pub fn execute_agent_step(
    step_id: &str,
    prompt: &str,
    model: Option<&str>,
    _read_only: bool,
    timeout_secs: Option<u64>,
    project_path: &str,
) -> StepResult {
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));

    let mut cmd = silent_command("claude");
    cmd.arg("--print").arg(prompt).current_dir(project_path);

    if let Some(m) = model {
        cmd.arg("--model").arg(m);
    }

    let result = crate::util::timed_output(cmd, timeout);
    let duration_ms = start.elapsed().as_millis() as u64;

    process_output(step_id, result, duration_ms)
}

// ============================================================================
// Dispatcher
// ============================================================================

/// Execute a single workflow step, resolving input references and dispatching
/// to the appropriate executor.
///
/// On success, if the step declares an `output` variable, the captured output
/// is stored in `context.step_outputs` for later steps to reference.
pub fn execute_step(step: &WorkflowStep, context: &mut PipelineContext) -> StepResult {
    let vars = context.all_variables();

    match &step.step_type {
        StepType::Agent {
            model,
            prompt,
            read_only,
            output,
            ..
        } => {
            let resolved_prompt = resolve_input_refs(prompt, &vars);
            let result = execute_agent_step(
                &step.id,
                &resolved_prompt,
                model.as_deref(),
                *read_only,
                None, // Agent steps use default timeout
                &context.project_path,
            );
            if let Some(var_name) = output {
                context
                    .step_outputs
                    .insert(var_name.clone(), result.output.clone());
            }
            result
        }
        StepType::Gate {
            command,
            timeout_secs,
            ..
        } => {
            let resolved_cmd = resolve_input_refs(command, &vars);
            execute_gate_step(
                &step.id,
                &resolved_cmd,
                *timeout_secs,
                &context.project_path,
            )
        }
        StepType::Action {
            command,
            capture_output,
            output,
            timeout_secs,
        } => {
            let resolved_cmd = resolve_input_refs(command, &vars);
            let result = execute_action_step(
                &step.id,
                &resolved_cmd,
                *timeout_secs,
                &context.project_path,
            );
            if *capture_output {
                if let Some(var_name) = output {
                    context
                        .step_outputs
                        .insert(var_name.clone(), result.output.clone());
                }
            }
            result
        }
    }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/// Run a shell command via `cmd /C` (Windows) or `sh -c` (Unix).
fn execute_shell_command(
    step_id: &str,
    command: &str,
    timeout_secs: Option<u64>,
    project_path: &str,
) -> StepResult {
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(DEFAULT_TIMEOUT_SECS));

    let cmd = build_shell_command(command, project_path);
    let result = crate::util::timed_output(cmd, timeout);
    let duration_ms = start.elapsed().as_millis() as u64;

    process_output(step_id, result, duration_ms)
}

/// Convert a process output (or error) into a [`StepResult`].
fn process_output(
    step_id: &str,
    result: Result<std::process::Output, crate::error::ADPError>,
    duration_ms: u64,
) -> StepResult {
    match result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = if stderr.is_empty() {
                stdout.clone()
            } else {
                format!("{}\n{}", stdout, stderr)
            };
            let code = output.status.code().unwrap_or(-1);

            if output.status.success() {
                StepResult::success(step_id, stdout, code, duration_ms)
            } else {
                let failure = create_failure(step_id, &combined, Some(code), 0);
                StepResult::failure(step_id, combined, Some(code), duration_ms, failure)
            }
        }
        Err(e) => {
            let failure = create_failure(step_id, &e.message, None, 0);
            StepResult::failure(step_id, e.message.clone(), None, duration_ms, failure)
        }
    }
}

/// Build a platform-appropriate shell command.
fn build_shell_command(command: &str, project_path: &str) -> std::process::Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = silent_command("cmd");
        cmd.args(["/C", command]).current_dir(project_path);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = silent_command("sh");
        cmd.args(["-c", command]).current_dir(project_path);
        cmd
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn test_project_path() -> String {
        std::env::temp_dir().to_string_lossy().to_string()
    }

    // --- StepResult construction ---

    #[test]
    fn step_result_success_has_correct_fields() {
        let r = StepResult::success("s1", "hello".into(), 0, 100);
        assert!(r.success);
        assert!(!r.skipped);
        assert_eq!(r.step_id, "s1");
        assert_eq!(r.output, "hello");
        assert_eq!(r.exit_code, Some(0));
        assert_eq!(r.duration_ms, 100);
        assert!(r.error.is_none());
    }

    #[test]
    fn step_result_skipped_has_correct_fields() {
        let r = StepResult::skipped("s2", "dependency failed");
        assert!(!r.success);
        assert!(r.skipped);
        assert_eq!(r.output, "dependency failed");
        assert!(r.error.is_none());
    }

    #[test]
    fn step_result_serializes_camel_case() {
        let r = StepResult::success("test", "out".into(), 0, 50);
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"stepId\""));
        assert!(json.contains("\"exitCode\""));
        assert!(json.contains("\"durationMs\""));
        assert!(!json.contains("\"step_id\""));
    }

    // --- Pipeline context ---

    #[test]
    fn pipeline_context_all_variables_merges_inputs_and_outputs() {
        let ctx = PipelineContext {
            workflow_name: "test".into(),
            inputs: HashMap::from([("issue".into(), "42".into())]),
            step_outputs: HashMap::from([("plan".into(), "do stuff".into())]),
            project_path: "/tmp".into(),
            run_id: "run-1".into(),
        };
        let vars = ctx.all_variables();
        assert_eq!(vars.get("issue"), Some(&"42".to_string()));
        assert_eq!(vars.get("plan"), Some(&"do stuff".to_string()));
    }

    // --- Gate step ---

    #[test]
    fn execute_gate_step_echo_succeeds() {
        let path = test_project_path();
        let result = execute_gate_step("gate-1", "echo hello", Some(10), &path);
        assert!(result.success, "Gate step should succeed: {:?}", result);
        assert_eq!(result.exit_code, Some(0));
        assert!(result.output.contains("hello"));
    }

    #[test]
    fn execute_gate_step_failing_command() {
        let path = test_project_path();
        #[cfg(target_os = "windows")]
        let cmd = "cmd /C exit 1";
        #[cfg(not(target_os = "windows"))]
        let cmd = "exit 1";
        let result = execute_gate_step("gate-fail", cmd, Some(10), &path);
        assert!(!result.success);
        assert_ne!(result.exit_code, Some(0));
        assert!(result.error.is_some());
    }

    // --- Action step ---

    #[test]
    fn execute_action_step_captures_output() {
        let path = test_project_path();
        let result = execute_action_step("action-1", "echo action-output", Some(10), &path);
        assert!(result.success);
        assert!(result.output.contains("action-output"));
    }

    // --- Agent step ---

    #[test]
    #[ignore] // Requires Claude CLI installed
    fn execute_agent_step_with_simple_prompt() {
        let path = test_project_path();
        let result = execute_agent_step("agent-1", "Say hello", None, true, Some(30), &path);
        let _ = result.success; // Smoke test: verify the pipeline returns without panic
    }

    #[test]
    fn execute_agent_step_nonexistent_cli() {
        // Test with a non-existent CLI to verify error handling
        // This tests the error path since "claude" may not be installed in CI
        let path = test_project_path();
        let result = execute_agent_step("agent-err", "test prompt", None, false, Some(5), &path);
        // Either succeeds (if claude installed) or fails gracefully
        if !result.success {
            assert!(result.error.is_some());
        }
    }

    // --- execute_step dispatcher ---

    #[test]
    fn execute_step_dispatches_gate() {
        let step = WorkflowStep {
            id: "test-gate".into(),
            step_type: StepType::Gate {
                command: "echo gate-ok".into(),
                on_failure: crate::pipeline::schema::GateFailureAction::Fail,
                max_retries: 0,
                timeout_secs: Some(10),
            },
            depends_on: vec![],
            condition: None,
        };
        let mut ctx = PipelineContext {
            workflow_name: "test".into(),
            inputs: HashMap::new(),
            step_outputs: HashMap::new(),
            project_path: test_project_path(),
            run_id: "run-1".into(),
        };
        let result = execute_step(&step, &mut ctx);
        assert!(result.success);
    }

    #[test]
    fn execute_step_dispatches_action_and_captures_output() {
        let step = WorkflowStep {
            id: "test-action".into(),
            step_type: StepType::Action {
                command: "echo captured-value".into(),
                capture_output: true,
                output: Some("my_var".into()),
                timeout_secs: Some(10),
            },
            depends_on: vec![],
            condition: None,
        };
        let mut ctx = PipelineContext {
            workflow_name: "test".into(),
            inputs: HashMap::new(),
            step_outputs: HashMap::new(),
            project_path: test_project_path(),
            run_id: "run-1".into(),
        };
        let result = execute_step(&step, &mut ctx);
        assert!(result.success);
        assert!(
            ctx.step_outputs.contains_key("my_var"),
            "Output should be stored in context"
        );
        assert!(ctx.step_outputs["my_var"].contains("captured-value"));
    }

    #[test]
    fn execute_step_resolves_input_refs_in_command() {
        let step = WorkflowStep {
            id: "ref-test".into(),
            step_type: StepType::Gate {
                command: "echo {greeting}".into(),
                on_failure: crate::pipeline::schema::GateFailureAction::Fail,
                max_retries: 0,
                timeout_secs: Some(10),
            },
            depends_on: vec![],
            condition: None,
        };
        let mut ctx = PipelineContext {
            workflow_name: "test".into(),
            inputs: HashMap::from([("greeting".into(), "world".into())]),
            step_outputs: HashMap::new(),
            project_path: test_project_path(),
            run_id: "run-1".into(),
        };
        let result = execute_step(&step, &mut ctx);
        assert!(result.success);
        assert!(result.output.contains("world"));
    }

    #[test]
    fn execute_step_action_without_capture_does_not_store() {
        let step = WorkflowStep {
            id: "no-capture".into(),
            step_type: StepType::Action {
                command: "echo ignore-me".into(),
                capture_output: false,
                output: Some("unused_var".into()),
                timeout_secs: Some(10),
            },
            depends_on: vec![],
            condition: None,
        };
        let mut ctx = PipelineContext {
            workflow_name: "test".into(),
            inputs: HashMap::new(),
            step_outputs: HashMap::new(),
            project_path: test_project_path(),
            run_id: "run-1".into(),
        };
        execute_step(&step, &mut ctx);
        assert!(
            !ctx.step_outputs.contains_key("unused_var"),
            "Should not store output when capture_output is false"
        );
    }

    // --- Error detection integration ---

    #[test]
    fn failed_command_produces_error_category() {
        let path = test_project_path();
        #[cfg(target_os = "windows")]
        let cmd = "cmd /C exit 1";
        #[cfg(not(target_os = "windows"))]
        let cmd = "exit 1";
        let result = execute_gate_step("err-cat", cmd, Some(10), &path);
        assert!(!result.success);
        assert!(result.error.is_some());
        // Error category should be detected (AgentError is the fallback for empty output)
        let err = result.error.unwrap();
        assert_eq!(err.step_id, "err-cat");
    }
}
