use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Categories of errors that can occur during pipeline step execution.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCategory {
    /// Build/compilation errors (cargo build, npm run build, tsc)
    BuildError,
    /// Test failures (cargo test, npm test, vitest)
    TestError,
    /// Agent errors (Claude CLI crash, unexpected exit, OOM)
    AgentError,
    /// Gate check failures (lint, format, coverage threshold)
    GateError,
    /// Step timed out
    TimeoutError,
    /// Prompt/input errors (invalid template, missing variables)
    PromptError,
}

/// Structured record of a step failure.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepFailure {
    pub step_id: String,
    pub error_category: ErrorCategory,
    pub message: String,
    /// Last ~`max_len` chars of output, trimmed to line boundary.
    pub output_snippet: String,
    pub timestamp: DateTime<Utc>,
    pub retry_count: u32,
    /// What was changed on retry (if any).
    pub resolution: Option<String>,
}

/// Detect the error category from command output and optional exit code.
///
/// Patterns are checked from most-specific to least-specific.  When the output
/// is empty and the exit code is non-zero (or absent), `AgentError` is returned
/// as a safe default.
pub fn detect_error_category(output: &str, _exit_code: Option<i32>) -> ErrorCategory {
    let lower = output.to_lowercase();

    // Timeout — check first because it's unambiguous
    if lower.contains("timed out")
        || lower.contains("sigalrm")
        || lower.contains("deadline exceeded")
    {
        return ErrorCategory::TimeoutError;
    }

    // Prompt / input errors
    if lower.contains("undefined variable")
        || lower.contains("missing input")
        || lower.contains("template error")
    {
        return ErrorCategory::PromptError;
    }

    // Test failures — check before build errors because test output may also
    // contain compiler messages when tests fail to compile.
    if lower.contains("test result: failed")
        || lower.contains("fail src/")
        || lower.contains("tests failed")
        || lower.contains("assertion failed")
        || contains_test_failed_pattern(&lower)
    {
        return ErrorCategory::TestError;
    }

    // Build / compilation errors
    if lower.contains("error[e")
        || lower.contains("build failed")
        || lower.contains("compilation error")
        || lower.contains("tsc: error")
        || lower.contains("npm err!")
        || output.contains("FAILED")
    {
        return ErrorCategory::BuildError;
    }

    // Gate errors (lint, format, coverage)
    if lower.contains("clippy")
        || lower.contains("eslint")
        || (lower.contains("fmt") && lower.contains("check"))
        || (lower.contains("coverage") && lower.contains("below"))
    {
        return ErrorCategory::GateError;
    }

    // Agent errors
    if lower.contains("error: spawn")
        || lower.contains("sigkill")
        || lower.contains("oom")
        || lower.contains("claude")
        || (lower.contains("session") && lower.contains("crash"))
        || lower.contains("unexpected exit")
    {
        return ErrorCategory::AgentError;
    }

    // Fallback — no recognized pattern
    ErrorCategory::AgentError
}

/// Check for patterns like "test ... failed" or "1 failed" in test output.
fn contains_test_failed_pattern(lower: &str) -> bool {
    // Matches lines like "test foo ... FAILED" or "1 failed"
    for line in lower.lines() {
        let trimmed = line.trim();
        if (trimmed.starts_with("test ") && trimmed.ends_with("failed"))
            || trimmed.ends_with(" failed")
                && trimmed
                    .split_whitespace()
                    .next()
                    .is_some_and(|w| w.parse::<u32>().is_ok())
        {
            return true;
        }
    }
    false
}

/// Extract the last `max_len` characters of output, trimmed to a line boundary.
///
/// If the output is shorter than `max_len`, the full output is returned.
pub fn extract_output_snippet(output: &str, max_len: usize) -> String {
    if output.len() <= max_len {
        return output.to_string();
    }

    let start = output.len() - max_len;
    // Find the first newline after the cut point to trim to a clean line boundary.
    let trimmed_start = output[start..]
        .find('\n')
        .map(|pos| start + pos + 1)
        .unwrap_or(start);

    output[trimmed_start..].to_string()
}

/// Determine whether the given error category is worth retrying.
///
/// Deterministic failures (gates, prompt errors) are not retryable because
/// they will produce the same result. Transient failures may succeed on retry.
pub fn is_retryable(category: &ErrorCategory) -> bool {
    !matches!(
        category,
        ErrorCategory::GateError | ErrorCategory::PromptError
    )
}

/// Create a [`StepFailure`] record from raw step output.
pub fn create_failure(
    step_id: &str,
    output: &str,
    exit_code: Option<i32>,
    retry_count: u32,
) -> StepFailure {
    let category = detect_error_category(output, exit_code);
    let snippet = extract_output_snippet(output, 500);
    let message = build_message(&category, output);

    StepFailure {
        step_id: step_id.to_string(),
        error_category: category,
        message,
        output_snippet: snippet,
        timestamp: Utc::now(),
        retry_count,
        resolution: None,
    }
}

/// Build a human-readable summary message for the failure.
fn build_message(category: &ErrorCategory, output: &str) -> String {
    let label = match category {
        ErrorCategory::BuildError => "Build failed",
        ErrorCategory::TestError => "Tests failed",
        ErrorCategory::AgentError => "Agent error",
        ErrorCategory::GateError => "Quality gate failed",
        ErrorCategory::TimeoutError => "Step timed out",
        ErrorCategory::PromptError => "Prompt/input error",
    };

    // Try to extract the first error line as context.
    let first_error_line = output
        .lines()
        .find(|l| {
            let low = l.to_lowercase();
            low.contains("error") || low.contains("failed") || low.contains("fail")
        })
        .map(|l| l.trim());

    match first_error_line {
        Some(line) if line.len() <= 200 => format!("{}: {}", label, line),
        Some(line) => format!("{}: {}...", label, &line[..200]),
        None => label.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- detect_error_category ---

    #[test]
    fn detect_build_error_from_rust_output() {
        let output = "error[E0308]: mismatched types\n  --> src/main.rs:5:10";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::BuildError
        );
    }

    #[test]
    fn detect_build_error_from_npm() {
        let output = "npm ERR! code ELIFECYCLE\nnpm ERR! errno 1";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::BuildError
        );
    }

    #[test]
    fn detect_build_error_from_tsc() {
        let output = "tsc: error TS2345: Argument of type 'string' is not assignable";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::BuildError
        );
    }

    #[test]
    fn detect_test_error_from_cargo_test() {
        let output = "test result: FAILED. 3 passed; 1 failed; 0 ignored";
        assert_eq!(
            detect_error_category(output, Some(101)),
            ErrorCategory::TestError
        );
    }

    #[test]
    fn detect_test_error_from_vitest() {
        let output = " FAIL src/store/sessionStore.test.ts > should reset";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::TestError
        );
    }

    #[test]
    fn detect_agent_error_from_spawn() {
        let output = "Error: spawn claude ENOENT";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::AgentError
        );
    }

    #[test]
    fn detect_agent_error_from_oom() {
        let output = "Process killed: OOM";
        assert_eq!(
            detect_error_category(output, Some(137)),
            ErrorCategory::AgentError
        );
    }

    #[test]
    fn detect_gate_error_from_clippy() {
        let output = "warning: clippy::unwrap_used\n  --> src/lib.rs:42:5";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::GateError
        );
    }

    #[test]
    fn detect_gate_error_from_coverage() {
        let output = "ERROR: coverage below threshold: 65% < 80%";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::GateError
        );
    }

    #[test]
    fn detect_timeout_error() {
        let output = "Error: step timed out after 300s";
        assert_eq!(
            detect_error_category(output, None),
            ErrorCategory::TimeoutError
        );
    }

    #[test]
    fn detect_prompt_error() {
        let output = "template error: undefined variable 'project_name'";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::PromptError
        );
    }

    #[test]
    fn detect_empty_output_defaults_to_agent_error() {
        assert_eq!(
            detect_error_category("", Some(1)),
            ErrorCategory::AgentError
        );
    }

    #[test]
    fn detect_no_exit_code_defaults_to_agent_error() {
        assert_eq!(detect_error_category("", None), ErrorCategory::AgentError);
    }

    #[test]
    fn detect_timeout_takes_precedence_over_build() {
        // Output mentions both build failure and timeout
        let output = "Build failed\nError: deadline exceeded";
        assert_eq!(
            detect_error_category(output, Some(1)),
            ErrorCategory::TimeoutError
        );
    }

    #[test]
    fn detect_test_over_build_when_both_present() {
        // Test failures should win over generic build indicators
        let output = "error[E0599]: no method\ntest result: FAILED. 0 passed; 1 failed";
        assert_eq!(
            detect_error_category(output, Some(101)),
            ErrorCategory::TestError
        );
    }

    // --- extract_output_snippet ---

    #[test]
    fn snippet_returns_full_output_when_short() {
        let output = "hello world";
        assert_eq!(extract_output_snippet(output, 500), "hello world");
    }

    #[test]
    fn snippet_trims_to_line_boundary() {
        let output = "line1\nline2\nline3\nline4\nline5";
        let snippet = extract_output_snippet(output, 15);
        // Should start at a line boundary
        assert!(
            snippet.starts_with("line"),
            "snippet should start at line boundary: '{}'",
            snippet
        );
        assert!(snippet.len() <= 15 || snippet.contains("line5"));
    }

    #[test]
    fn snippet_handles_single_line() {
        let long_line = "x".repeat(1000);
        let snippet = extract_output_snippet(&long_line, 500);
        assert_eq!(snippet.len(), 500);
    }

    // --- is_retryable ---

    #[test]
    fn retryable_categories() {
        assert!(is_retryable(&ErrorCategory::BuildError));
        assert!(is_retryable(&ErrorCategory::TestError));
        assert!(is_retryable(&ErrorCategory::AgentError));
        assert!(is_retryable(&ErrorCategory::TimeoutError));
    }

    #[test]
    fn non_retryable_categories() {
        assert!(!is_retryable(&ErrorCategory::GateError));
        assert!(!is_retryable(&ErrorCategory::PromptError));
    }

    // --- create_failure ---

    #[test]
    fn create_failure_produces_valid_record() {
        let output = "error[E0308]: mismatched types\n  --> src/main.rs:5:10";
        let failure = create_failure("build-step", output, Some(1), 0);

        assert_eq!(failure.step_id, "build-step");
        assert_eq!(failure.error_category, ErrorCategory::BuildError);
        assert!(!failure.message.is_empty());
        assert!(!failure.output_snippet.is_empty());
        assert_eq!(failure.retry_count, 0);
        assert!(failure.resolution.is_none());
    }

    #[test]
    fn create_failure_with_retry_count() {
        let failure = create_failure("test-step", "test result: FAILED", Some(1), 2);
        assert_eq!(failure.retry_count, 2);
        assert_eq!(failure.error_category, ErrorCategory::TestError);
    }

    // --- Serde round-trip ---

    #[test]
    fn error_category_serializes_snake_case() {
        let json = serde_json::to_string(&ErrorCategory::BuildError).unwrap();
        assert_eq!(json, "\"build_error\"");

        let json = serde_json::to_string(&ErrorCategory::TimeoutError).unwrap();
        assert_eq!(json, "\"timeout_error\"");
    }

    #[test]
    fn step_failure_serializes_camel_case() {
        let failure = create_failure("s1", "error[E0308]: bad", Some(1), 0);
        let json = serde_json::to_string(&failure).unwrap();

        assert!(json.contains("\"stepId\""), "expected camelCase stepId");
        assert!(
            json.contains("\"errorCategory\""),
            "expected camelCase errorCategory"
        );
        assert!(
            json.contains("\"outputSnippet\""),
            "expected camelCase outputSnippet"
        );
        assert!(
            json.contains("\"retryCount\""),
            "expected camelCase retryCount"
        );
        assert!(
            !json.contains("\"step_id\""),
            "must not use snake_case step_id"
        );
    }

    #[test]
    fn step_failure_round_trips_through_json() {
        let failure = create_failure("round-trip", "Tests failed", Some(1), 1);
        let json = serde_json::to_string(&failure).unwrap();
        let deserialized: StepFailure = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.step_id, "round-trip");
        assert_eq!(deserialized.error_category, failure.error_category);
        assert_eq!(deserialized.retry_count, 1);
    }
}
