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
    #[serde(rename = "SESSION_NOT_FOUND")]
    SessionNotFound,
    #[serde(rename = "SERVICE_AUTH_FAILED")]
    ServiceAuthFailed,
    #[serde(rename = "SERVICE_REQUEST_FAILED")]
    ServiceRequestFailed,
    #[serde(rename = "SERVICE_RATE_LIMITED")]
    ServiceRateLimited,
    #[serde(rename = "SERVICE_TIMEOUT")]
    ServiceTimeout,
    #[serde(rename = "FILE_IO_ERROR")]
    FileIoError,
    #[serde(rename = "COMMAND_EXECUTION_FAILED")]
    CommandExecutionFailed,
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
///
/// Tauri v2 serializes the error type as JSON when a command returns `Err`.
/// `rename_all = "camelCase"` ensures field names match the TypeScript interface
/// (e.g. `retryAfterMs` instead of `retry_after_ms`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

    /// Shorthand for a non-retryable internal error.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ADPErrorCode::InternalError, message)
    }

    /// Shorthand for a file I/O error.
    pub fn file_io(message: impl Into<String>) -> Self {
        Self::new(ADPErrorCode::FileIoError, message)
    }

    /// Shorthand for a validation error.
    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(ADPErrorCode::SchemaValidationFailed, message)
    }

    /// Shorthand for a command execution failure.
    pub fn command_failed(message: impl Into<String>) -> Self {
        Self::new(ADPErrorCode::CommandExecutionFailed, message)
    }

    /// Shorthand for a parse error.
    pub fn parse(message: impl Into<String>) -> Self {
        Self::new(ADPErrorCode::ParseError, message)
    }
}

impl From<std::io::Error> for ADPError {
    fn from(err: std::io::Error) -> Self {
        Self::file_io(err.to_string())
    }
}

impl From<serde_json::Error> for ADPError {
    fn from(err: serde_json::Error) -> Self {
        Self::parse(err.to_string())
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
    fn new_error_codes_serialize_correctly() {
        assert_eq!(
            serde_json::to_string(&ADPErrorCode::SessionNotFound).unwrap(),
            "\"SESSION_NOT_FOUND\""
        );
        assert_eq!(
            serde_json::to_string(&ADPErrorCode::FileIoError).unwrap(),
            "\"FILE_IO_ERROR\""
        );
        assert_eq!(
            serde_json::to_string(&ADPErrorCode::CommandExecutionFailed).unwrap(),
            "\"COMMAND_EXECUTION_FAILED\""
        );
    }

    #[test]
    fn error_display_includes_code_and_message() {
        let err = ADPError::new(ADPErrorCode::InternalError, "something broke");
        let display = format!("{}", err);
        assert!(display.contains("INTERNAL_ERROR"));
        assert!(display.contains("something broke"));
    }

    #[test]
    fn retryable_error_has_retry_fields() {
        let err = ADPError::retryable(ADPErrorCode::ServiceRateLimited, "slow down", 5000);
        assert!(err.retryable);
        assert_eq!(err.retry_after_ms, Some(5000));
    }

    #[test]
    fn error_serializes_with_camel_case_fields() {
        let err = ADPError::retryable(ADPErrorCode::ServiceRateLimited, "slow down", 5000);
        let json = serde_json::to_string(&err).unwrap();
        // Must use camelCase field names to match TypeScript ADPError interface
        assert!(
            json.contains("\"retryAfterMs\""),
            "expected camelCase retryAfterMs, got: {json}"
        );
        assert!(json.contains("\"retryable\""));
        assert!(
            !json.contains("\"retry_after_ms\""),
            "must not use snake_case"
        );
    }

    #[test]
    fn convenience_constructors() {
        let err = ADPError::internal("boom");
        assert_eq!(err.code, ADPErrorCode::InternalError);

        let err = ADPError::file_io("disk full");
        assert_eq!(err.code, ADPErrorCode::FileIoError);

        let err = ADPError::validation("bad input");
        assert_eq!(err.code, ADPErrorCode::SchemaValidationFailed);

        let err = ADPError::command_failed("git died");
        assert_eq!(err.code, ADPErrorCode::CommandExecutionFailed);

        let err = ADPError::parse("invalid json");
        assert_eq!(err.code, ADPErrorCode::ParseError);
    }

    #[test]
    fn from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let adp_err: ADPError = io_err.into();
        assert_eq!(adp_err.code, ADPErrorCode::FileIoError);
        assert!(adp_err.message.contains("file missing"));
    }

    #[test]
    fn from_serde_json_error() {
        let json_err = serde_json::from_str::<serde_json::Value>("not json").unwrap_err();
        let adp_err: ADPError = json_err.into();
        assert_eq!(adp_err.code, ADPErrorCode::ParseError);
    }
}
