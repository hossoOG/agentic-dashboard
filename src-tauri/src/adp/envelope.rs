use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// The outer envelope for every ADP message.
/// Mirrors `ADPEnvelope<T>` from `schema.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ADPEnvelope {
    /// Protocol version (Semantic Versioning)
    pub version: String,

    /// Unique message ID (UUID v4) for idempotency
    pub id: String,

    /// ISO-8601 creation timestamp
    pub timestamp: String,

    /// Message source
    pub source: ADPSource,

    /// Message target (None = broadcast)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<ADPTarget>,

    /// Event type — determines payload structure
    #[serde(rename = "type")]
    pub event_type: ADPEventType,

    /// Correlation ID for request/response chains
    #[serde(rename = "correlationId")]
    pub correlation_id: Option<String>,

    /// Sequence number for ordering within a correlation
    pub sequence: u32,

    /// The actual payload (kept as serde_json::Value for flexibility)
    pub payload: serde_json::Value,

    /// Metadata for debugging and monitoring
    pub meta: ADPMeta,
}

impl ADPEnvelope {
    /// Create a new envelope with auto-generated id and timestamp.
    pub fn new<T: Serialize>(
        event_type: ADPEventType,
        source: ADPSource,
        payload: &T,
    ) -> Result<Self, serde_json::Error> {
        let now: DateTime<Utc> = Utc::now();
        Ok(Self {
            version: "1.0.0".to_string(),
            id: Uuid::new_v4().to_string(),
            timestamp: now.to_rfc3339(),
            source,
            target: None,
            event_type,
            correlation_id: None,
            sequence: 0,
            payload: serde_json::to_value(payload)?,
            meta: ADPMeta::default(),
        })
    }

    /// Builder: set the target.
    pub fn with_target(mut self, target: ADPTarget) -> Self {
        self.target = Some(target);
        self
    }

    /// Builder: set the correlation ID.
    pub fn with_correlation(mut self, correlation_id: impl Into<String>) -> Self {
        self.correlation_id = Some(correlation_id.into());
        self
    }

    /// Builder: set the sequence number.
    pub fn with_sequence(mut self, seq: u32) -> Self {
        self.sequence = seq;
        self
    }
}

// ─── Source ──────────────────────────────────────────────────────────────────

/// Who sent the message. Mirrors `ADPSource` from `schema.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ADPSource {
    #[serde(rename = "tauri-backend")]
    TauriBackend,

    #[serde(rename = "react-frontend")]
    ReactFrontend,

    #[serde(rename = "claude-cli")]
    ClaudeCli {
        #[serde(rename = "sessionId")]
        session_id: String,
    },

    #[serde(rename = "terminal")]
    Terminal {
        #[serde(rename = "terminalId")]
        terminal_id: String,
    },

    #[serde(rename = "external-service")]
    ExternalService {
        service: String,
        #[serde(rename = "instanceId", skip_serializing_if = "Option::is_none")]
        instance_id: Option<String>,
    },
}

// ─── Target ──────────────────────────────────────────────────────────────────

/// Who should receive the message. Mirrors `ADPTarget` from `schema.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum ADPTarget {
    #[serde(rename = "tauri-backend")]
    TauriBackend,

    #[serde(rename = "react-frontend")]
    ReactFrontend,

    #[serde(rename = "claude-cli")]
    ClaudeCli {
        #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
        session_id: Option<String>,
    },

    #[serde(rename = "terminal")]
    Terminal {
        #[serde(rename = "terminalId")]
        terminal_id: String,
    },

    #[serde(rename = "external-service")]
    ExternalService {
        service: String,
        #[serde(rename = "instanceId", skip_serializing_if = "Option::is_none")]
        instance_id: Option<String>,
    },

    #[serde(rename = "broadcast")]
    Broadcast,
}

// ─── Event Types ─────────────────────────────────────────────────────────────

/// All 26 event types from the ADP schema.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ADPEventType {
    // Pipeline
    #[serde(rename = "pipeline.start")]
    PipelineStart,
    #[serde(rename = "pipeline.stop")]
    PipelineStop,
    #[serde(rename = "pipeline.status")]
    PipelineStatus,
    #[serde(rename = "pipeline.error")]
    PipelineError,

    // Orchestrator
    #[serde(rename = "orchestrator.status-change")]
    OrchestratorStatusChange,
    #[serde(rename = "orchestrator.log")]
    OrchestratorLog,
    #[serde(rename = "orchestrator.manifest-generated")]
    OrchestratorManifestGenerated,

    // Worktree
    #[serde(rename = "worktree.spawn")]
    WorktreeSpawn,
    #[serde(rename = "worktree.step-change")]
    WorktreeStepChange,
    #[serde(rename = "worktree.status-change")]
    WorktreeStatusChange,
    #[serde(rename = "worktree.log")]
    WorktreeLog,
    #[serde(rename = "worktree.progress")]
    WorktreeProgress,

    // QA Gate
    #[serde(rename = "qa.check-update")]
    QaCheckUpdate,
    #[serde(rename = "qa.overall-status")]
    QaOverallStatus,
    #[serde(rename = "qa.report")]
    QaReport,

    // Terminal
    #[serde(rename = "terminal.spawn")]
    TerminalSpawn,
    #[serde(rename = "terminal.input")]
    TerminalInput,
    #[serde(rename = "terminal.output")]
    TerminalOutput,
    #[serde(rename = "terminal.exit")]
    TerminalExit,

    // External Services
    #[serde(rename = "service.request")]
    ServiceRequest,
    #[serde(rename = "service.response")]
    ServiceResponse,
    #[serde(rename = "service.auth")]
    ServiceAuth,
    #[serde(rename = "service.cost-update")]
    ServiceCostUpdate,

    // System
    #[serde(rename = "system.heartbeat")]
    SystemHeartbeat,
    #[serde(rename = "system.error")]
    SystemError,
    #[serde(rename = "system.config-change")]
    SystemConfigChange,
}

// ─── Meta ────────────────────────────────────────────────────────────────────

/// Metadata for debugging and monitoring. Mirrors `ADPMeta` from `schema.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ADPMeta {
    /// Retry counter (0 = first attempt)
    #[serde(rename = "retryCount")]
    pub retry_count: u32,

    /// Execution environment
    pub environment: String,

    /// Trace ID for distributed tracing
    #[serde(rename = "traceId", skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,

    /// Schema version of the payload (for forward compatibility)
    #[serde(rename = "payloadVersion", skip_serializing_if = "Option::is_none")]
    pub payload_version: Option<String>,
}

impl Default for ADPMeta {
    fn default() -> Self {
        Self {
            retry_count: 0,
            environment: if cfg!(debug_assertions) {
                "development".to_string()
            } else {
                "production".to_string()
            },
            trace_id: None,
            payload_version: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_new_creates_valid_envelope() {
        let payload = serde_json::json!({ "projectPath": "/tmp/test", "mode": "mock" });
        let env = ADPEnvelope::new(
            ADPEventType::PipelineStart,
            ADPSource::TauriBackend,
            &payload,
        )
        .unwrap();

        assert_eq!(env.version, "1.0.0");
        assert!(!env.id.is_empty());
        assert!(env.target.is_none());
        assert_eq!(env.event_type, ADPEventType::PipelineStart);
        assert_eq!(env.sequence, 0);
    }

    #[test]
    fn builder_methods_work() {
        let payload = serde_json::json!({});
        let env = ADPEnvelope::new(
            ADPEventType::SystemHeartbeat,
            ADPSource::TauriBackend,
            &payload,
        )
        .unwrap()
        .with_target(ADPTarget::Broadcast)
        .with_correlation("corr-123".to_string())
        .with_sequence(5);

        assert!(env.target.is_some());
        assert_eq!(env.correlation_id.as_deref(), Some("corr-123"));
        assert_eq!(env.sequence, 5);
    }

    #[test]
    fn event_type_serializes_with_dot_notation() {
        let json = serde_json::to_string(&ADPEventType::WorktreeStepChange).unwrap();
        assert_eq!(json, "\"worktree.step-change\"");
    }

    #[test]
    fn source_serializes_tagged() {
        let src = ADPSource::ClaudeCli {
            session_id: "s-123".to_string(),
        };
        let json = serde_json::to_string(&src).unwrap();
        assert!(json.contains("\"kind\":\"claude-cli\""));
        assert!(json.contains("\"sessionId\":\"s-123\""));
    }
}
