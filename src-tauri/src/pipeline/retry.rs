//! Retry logic for failed pipeline steps.
//!
//! Provides retry policies, decision-making, delay calculation, and prompt
//! augmentation for intelligent retries. This module is self-contained and
//! does not depend on the step executor — it can be integrated later.
//!
//! Related issues: #157 (retry), #156 (error detection)

use serde::{Deserialize, Serialize};

use super::error_detection::{extract_output_snippet, is_retryable, ErrorCategory};

/// Maximum delay cap in milliseconds (30 seconds).
const MAX_DELAY_MS: u64 = 30_000;

/// Maximum characters of error output included in retry prompts.
const MAX_ERROR_SNIPPET_CHARS: usize = 300;

// ============================================================================
// Types
// ============================================================================

/// Configuration for retry behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryPolicy {
    /// Maximum number of retry attempts (0 = no retries).
    pub max_retries: u32,
    /// Delay between retries in milliseconds.
    pub delay_ms: u64,
    /// Whether to use exponential backoff (delay * 2^attempt).
    pub exponential_backoff: bool,
    /// Whether to inject error context into retry prompt (for agent steps).
    pub inject_error_context: bool,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_retries: 2,
            delay_ms: 1000,
            exponential_backoff: false,
            inject_error_context: true,
        }
    }
}

/// Result of a retry-aware execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryResult {
    /// Whether the step eventually succeeded.
    pub success: bool,
    /// Total number of attempts (1 = no retries were needed).
    pub attempts: u32,
    /// Output from the last attempt.
    pub last_output: String,
    /// Exit code from the last attempt.
    pub last_exit_code: Option<i32>,
    /// Error category from the last attempt (None if successful).
    pub last_error_category: Option<ErrorCategory>,
    /// Total wall-clock duration across all attempts in milliseconds.
    pub total_duration_ms: u64,
}

/// Outcome of checking whether a retry should happen.
#[derive(Debug, Clone, PartialEq)]
pub enum RetryDecision {
    /// Don't retry — error is not retryable or max retries exceeded.
    NoRetry { reason: String },
    /// Retry with the same input.
    RetrySimple,
    /// Retry with error context injected (for agent steps).
    RetryWithContext { error_context: String },
}

// ============================================================================
// Core functions
// ============================================================================

/// Decide whether a failed step should be retried.
///
/// Returns [`RetryDecision::NoRetry`] if the error category is not retryable
/// or the maximum number of retries has been exceeded. Otherwise returns
/// [`RetryDecision::RetrySimple`] or [`RetryDecision::RetryWithContext`]
/// depending on the policy.
pub fn should_retry(
    error_category: &ErrorCategory,
    attempt: u32,
    policy: &RetryPolicy,
) -> RetryDecision {
    if !is_retryable(error_category) {
        return RetryDecision::NoRetry {
            reason: format!("{:?} is not retryable", error_category),
        };
    }

    if attempt >= policy.max_retries {
        return RetryDecision::NoRetry {
            reason: format!("max retries exceeded ({}/{})", attempt, policy.max_retries),
        };
    }

    if policy.inject_error_context {
        RetryDecision::RetryWithContext {
            error_context: format!("{:?}", error_category),
        }
    } else {
        RetryDecision::RetrySimple
    }
}

/// Calculate the delay before the next retry attempt.
///
/// With exponential backoff enabled the delay doubles on each attempt:
/// `delay_ms * 2^attempt`. The result is capped at [`MAX_DELAY_MS`] (30 s).
pub fn calculate_delay(attempt: u32, policy: &RetryPolicy) -> u64 {
    let delay = if policy.exponential_backoff {
        policy.delay_ms.saturating_mul(1u64 << attempt)
    } else {
        policy.delay_ms
    };

    delay.min(MAX_DELAY_MS)
}

/// Build an augmented prompt for agent retries that includes error context.
///
/// The error output is truncated to the last [`MAX_ERROR_SNIPPET_CHARS`]
/// characters so the prompt stays manageable.
pub fn build_retry_prompt(
    original_prompt: &str,
    error_output: &str,
    error_category: &ErrorCategory,
    attempt: u32,
) -> String {
    let snippet = extract_output_snippet(error_output, MAX_ERROR_SNIPPET_CHARS);

    format!(
        "[RETRY {attempt}] Previous attempt failed with {category:?}.\n\
         Error output:\n\
         ```\n\
         {snippet}\n\
         ```\n\
         \n\
         Please fix the issue and try again.\n\
         \n\
         Original task:\n\
         {original_prompt}",
        attempt = attempt,
        category = error_category,
        snippet = snippet,
        original_prompt = original_prompt,
    )
}

/// Return a sensible [`RetryPolicy`] for the given step type.
///
/// Step types:
/// - `"gate"` — simple retry, no error context injection
/// - `"agent"` — retry with error context and exponential backoff
/// - `"action"` — no retry by default (max_retries = 0)
///
/// An explicit `max_retries` override takes precedence over the default.
pub fn policy_for_step_type(step_type: &str, max_retries: Option<u32>) -> RetryPolicy {
    match step_type {
        "gate" => RetryPolicy {
            max_retries: max_retries.unwrap_or(2),
            delay_ms: 1000,
            exponential_backoff: false,
            inject_error_context: false,
        },
        "agent" => RetryPolicy {
            max_retries: max_retries.unwrap_or(2),
            delay_ms: 2000,
            exponential_backoff: true,
            inject_error_context: true,
        },
        "action" => RetryPolicy {
            max_retries: max_retries.unwrap_or(0),
            delay_ms: 1000,
            exponential_backoff: false,
            inject_error_context: false,
        },
        _ => {
            let mut policy = RetryPolicy::default();
            if let Some(mr) = max_retries {
                policy.max_retries = mr;
            }
            policy
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // --- should_retry ---

    #[test]
    fn no_retry_for_gate_error() {
        let policy = RetryPolicy::default();
        let decision = should_retry(&ErrorCategory::GateError, 0, &policy);
        assert!(matches!(decision, RetryDecision::NoRetry { .. }));
    }

    #[test]
    fn no_retry_for_prompt_error() {
        let policy = RetryPolicy::default();
        let decision = should_retry(&ErrorCategory::PromptError, 0, &policy);
        assert!(matches!(decision, RetryDecision::NoRetry { .. }));
    }

    #[test]
    fn retry_simple_for_build_error_without_context() {
        let policy = RetryPolicy {
            inject_error_context: false,
            ..RetryPolicy::default()
        };
        let decision = should_retry(&ErrorCategory::BuildError, 0, &policy);
        assert_eq!(decision, RetryDecision::RetrySimple);
    }

    #[test]
    fn retry_with_context_for_build_error() {
        let policy = RetryPolicy::default(); // inject_error_context = true
        let decision = should_retry(&ErrorCategory::BuildError, 0, &policy);
        assert!(matches!(decision, RetryDecision::RetryWithContext { .. }));
    }

    #[test]
    fn retry_with_context_for_test_error() {
        let policy = RetryPolicy::default();
        let decision = should_retry(&ErrorCategory::TestError, 0, &policy);
        assert!(matches!(decision, RetryDecision::RetryWithContext { .. }));
    }

    #[test]
    fn retry_with_context_for_agent_error() {
        let policy = RetryPolicy::default();
        let decision = should_retry(&ErrorCategory::AgentError, 0, &policy);
        assert!(matches!(decision, RetryDecision::RetryWithContext { .. }));
    }

    #[test]
    fn retry_with_context_for_timeout_error() {
        let policy = RetryPolicy::default();
        let decision = should_retry(&ErrorCategory::TimeoutError, 0, &policy);
        assert!(matches!(decision, RetryDecision::RetryWithContext { .. }));
    }

    #[test]
    fn no_retry_when_max_retries_exceeded() {
        let policy = RetryPolicy {
            max_retries: 2,
            ..RetryPolicy::default()
        };
        let decision = should_retry(&ErrorCategory::BuildError, 2, &policy);
        assert!(matches!(decision, RetryDecision::NoRetry { .. }));
    }

    #[test]
    fn no_retry_when_max_retries_zero() {
        let policy = RetryPolicy {
            max_retries: 0,
            ..RetryPolicy::default()
        };
        let decision = should_retry(&ErrorCategory::BuildError, 0, &policy);
        assert!(matches!(decision, RetryDecision::NoRetry { .. }));
    }

    #[test]
    fn retry_allowed_when_under_max() {
        let policy = RetryPolicy {
            max_retries: 3,
            ..RetryPolicy::default()
        };
        let decision = should_retry(&ErrorCategory::BuildError, 2, &policy);
        assert!(matches!(decision, RetryDecision::RetryWithContext { .. }));
    }

    // --- calculate_delay ---

    #[test]
    fn flat_delay() {
        let policy = RetryPolicy {
            delay_ms: 1000,
            exponential_backoff: false,
            ..RetryPolicy::default()
        };
        assert_eq!(calculate_delay(0, &policy), 1000);
        assert_eq!(calculate_delay(1, &policy), 1000);
        assert_eq!(calculate_delay(5, &policy), 1000);
    }

    #[test]
    fn exponential_backoff() {
        let policy = RetryPolicy {
            delay_ms: 1000,
            exponential_backoff: true,
            ..RetryPolicy::default()
        };
        assert_eq!(calculate_delay(0, &policy), 1000); // 1000 * 2^0
        assert_eq!(calculate_delay(1, &policy), 2000); // 1000 * 2^1
        assert_eq!(calculate_delay(2, &policy), 4000); // 1000 * 2^2
        assert_eq!(calculate_delay(3, &policy), 8000); // 1000 * 2^3
    }

    #[test]
    fn delay_caps_at_30_seconds() {
        let policy = RetryPolicy {
            delay_ms: 10_000,
            exponential_backoff: true,
            ..RetryPolicy::default()
        };
        // 10_000 * 2^2 = 40_000, should be capped to 30_000
        assert_eq!(calculate_delay(2, &policy), MAX_DELAY_MS);
    }

    #[test]
    fn delay_caps_flat_at_30_seconds() {
        let policy = RetryPolicy {
            delay_ms: 50_000,
            exponential_backoff: false,
            ..RetryPolicy::default()
        };
        assert_eq!(calculate_delay(0, &policy), MAX_DELAY_MS);
    }

    // --- build_retry_prompt ---

    #[test]
    fn retry_prompt_contains_all_parts() {
        let prompt = build_retry_prompt(
            "Fix the build",
            "error[E0308]: mismatched types",
            &ErrorCategory::BuildError,
            1,
        );
        assert!(prompt.contains("[RETRY 1]"));
        assert!(prompt.contains("BuildError"));
        assert!(prompt.contains("error[E0308]: mismatched types"));
        assert!(prompt.contains("Fix the build"));
        assert!(prompt.contains("Please fix the issue"));
    }

    #[test]
    fn retry_prompt_truncates_long_error_output() {
        let long_output = "x".repeat(1000);
        let prompt = build_retry_prompt("Do something", &long_output, &ErrorCategory::TestError, 2);
        // The snippet in the prompt should be at most MAX_ERROR_SNIPPET_CHARS
        // The full 1000-char output should NOT appear
        assert!(!prompt.contains(&long_output));
        // But the last 300 chars should be there
        let expected_snippet = &long_output[long_output.len() - MAX_ERROR_SNIPPET_CHARS..];
        assert!(prompt.contains(expected_snippet));
    }

    #[test]
    fn retry_prompt_keeps_short_output_intact() {
        let short_output = "short error";
        let prompt = build_retry_prompt("task", short_output, &ErrorCategory::AgentError, 1);
        assert!(prompt.contains("short error"));
    }

    // --- policy_for_step_type ---

    #[test]
    fn policy_for_gate_step() {
        let policy = policy_for_step_type("gate", None);
        assert_eq!(policy.max_retries, 2);
        assert!(!policy.exponential_backoff);
        assert!(!policy.inject_error_context);
    }

    #[test]
    fn policy_for_agent_step() {
        let policy = policy_for_step_type("agent", None);
        assert_eq!(policy.max_retries, 2);
        assert!(policy.exponential_backoff);
        assert!(policy.inject_error_context);
    }

    #[test]
    fn policy_for_action_step() {
        let policy = policy_for_step_type("action", None);
        assert_eq!(policy.max_retries, 0);
        assert!(!policy.exponential_backoff);
        assert!(!policy.inject_error_context);
    }

    #[test]
    fn policy_for_unknown_step_uses_defaults() {
        let policy = policy_for_step_type("unknown", None);
        assert_eq!(policy.max_retries, 2); // default
        assert!(policy.inject_error_context); // default
    }

    #[test]
    fn policy_max_retries_override() {
        let policy = policy_for_step_type("action", Some(5));
        assert_eq!(policy.max_retries, 5);

        let policy = policy_for_step_type("gate", Some(10));
        assert_eq!(policy.max_retries, 10);
    }

    // --- Default + Serde ---

    #[test]
    fn default_retry_policy_values() {
        let policy = RetryPolicy::default();
        assert_eq!(policy.max_retries, 2);
        assert_eq!(policy.delay_ms, 1000);
        assert!(!policy.exponential_backoff);
        assert!(policy.inject_error_context);
    }

    #[test]
    fn retry_policy_serializes_camel_case() {
        let policy = RetryPolicy::default();
        let json = serde_json::to_string(&policy).unwrap();
        assert!(json.contains("\"maxRetries\""));
        assert!(json.contains("\"delayMs\""));
        assert!(json.contains("\"exponentialBackoff\""));
        assert!(json.contains("\"injectErrorContext\""));
        assert!(!json.contains("\"max_retries\""));
    }

    #[test]
    fn retry_result_serializes_camel_case() {
        let result = RetryResult {
            success: true,
            attempts: 2,
            last_output: "ok".to_string(),
            last_exit_code: Some(0),
            last_error_category: None,
            total_duration_ms: 5000,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"lastOutput\""));
        assert!(json.contains("\"lastExitCode\""));
        assert!(json.contains("\"totalDurationMs\""));
        assert!(!json.contains("\"last_output\""));
    }

    #[test]
    fn retry_result_round_trips_through_json() {
        let result = RetryResult {
            success: false,
            attempts: 3,
            last_output: "error[E0308]".to_string(),
            last_exit_code: Some(1),
            last_error_category: Some(ErrorCategory::BuildError),
            total_duration_ms: 12345,
        };
        let json = serde_json::to_string(&result).unwrap();
        let deserialized: RetryResult = serde_json::from_str(&json).unwrap();
        assert!(!deserialized.success);
        assert_eq!(deserialized.attempts, 3);
        assert_eq!(deserialized.last_output, "error[E0308]");
        assert_eq!(deserialized.last_exit_code, Some(1));
        assert_eq!(
            deserialized.last_error_category,
            Some(ErrorCategory::BuildError)
        );
        assert_eq!(deserialized.total_duration_ms, 12345);
    }
}
