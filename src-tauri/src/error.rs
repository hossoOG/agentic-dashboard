use serde::{Deserialize, Serialize};
use std::fmt;

/// Machine-readable error codes matching the ADP TypeScript schema (ADPErrorCode).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ADPErrorCode {
    #[serde(rename = "PIPELINE_SPAWN_FAILED")]
    PipelineSpawnFailed,
    #[serde(rename = "PIPELINE_ALREADY_RUNNING")]
    PipelineAlreadyRunning,
    #[serde(rename = "PIPELINE_NOT_RUNNING")]
    PipelineNotRunning,
    #[serde(rename = "WORKTREE_NOT_FOUND")]
    WorktreeNotFound,
    #[serde(rename = "WORKTREE_STEP_INVALID")]
    WorktreeStepInvalid,
    #[serde(rename = "QA_CHECK_TIMEOUT")]
    QaCheckTimeout,
    #[serde(rename = "TERMINAL_SPAWN_FAILED")]
    TerminalSpawnFailed,
    #[serde(rename = "TERMINAL_NOT_FOUND")]
    TerminalNotFound,
    #[serde(rename = "SERVICE_AUTH_FAILED")]
    ServiceAuthFailed,
    #[serde(rename = "SERVICE_REQUEST_FAILED")]
    ServiceRequestFailed,
    #[serde(rename = "SERVICE_RATE_LIMITED")]
    ServiceRateLimited,
    #[serde(rename = "SERVICE_TIMEOUT")]
    ServiceTimeout,
    #[serde(rename = "PARSE_ERROR")]
    ParseError,
    #[serde(rename = "SCHEMA_VALIDATION_FAILED")]
    SchemaValidationFailed,
    #[serde(rename = "UNKNOWN_EVENT_TYPE")]
    UnknownEventType,
    #[serde(rename = "INTERNAL_ERROR")]
    InternalError,
}

impl fmt::Display for ADPErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = serde_json::to_value(self)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| format!("{:?}", self));
        write!(f, "{}", s)
    }
}

/// Structured error type for the Agentic Dashboard Protocol.
/// Mirrors the `ADPError` interface from `schema.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ADPError {
    /// Machine-readable error code
    pub code: ADPErrorCode,

    /// Human-readable error description
    pub message: String,

    /// Stack trace or additional details (dev only)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,

    /// Whether the error is recoverable via retry
    pub retryable: bool,

    /// Recommended wait time before retry in milliseconds
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_ms: Option<u64>,
}

impl ADPError {
    /// Create a new non-retryable error.
    pub fn new(code: ADPErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
            retryable: false,
            retry_after_ms: None,
        }
    }

    /// Create a retryable error with a recommended wait time.
    pub fn retryable(code: ADPErrorCode, message: impl Into<String>, retry_after_ms: u64) -> Self {
        Self {
            code,
            message: message.into(),
            details: None,
            retryable: true,
            retry_after_ms: Some(retry_after_ms),
        }
    }

    /// Attach additional details to this error.
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}

impl fmt::Display for ADPError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)?;
        if let Some(ref details) = self.details {
            write!(f, " — {}", details)?;
        }
        Ok(())
    }
}

impl std::error::Error for ADPError {}

/// Converts `ADPError` into a `String` for Tauri command `Result<T, String>`.
impl From<ADPError> for String {
    fn from(err: ADPError) -> Self {
        err.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_code_serializes_to_screaming_snake() {
        let code = ADPErrorCode::PipelineSpawnFailed;
        let json = serde_json::to_string(&code).unwrap();
        assert_eq!(json, "\"PIPELINE_SPAWN_FAILED\"");
    }

    #[test]
    fn error_display_includes_code_and_message() {
        let err = ADPError::new(ADPErrorCode::InternalError, "something broke");
        let display = format!("{}", err);
        assert!(display.contains("INTERNAL_ERROR"));
        assert!(display.contains("something broke"));
    }

    #[test]
    fn error_converts_to_string() {
        let err = ADPError::new(ADPErrorCode::ParseError, "bad input");
        let s: String = err.into();
        assert!(s.contains("PARSE_ERROR"));
    }

    #[test]
    fn retryable_error_has_retry_fields() {
        let err = ADPError::retryable(ADPErrorCode::ServiceRateLimited, "slow down", 5000);
        assert!(err.retryable);
        assert_eq!(err.retry_after_ms, Some(5000));
    }
}
