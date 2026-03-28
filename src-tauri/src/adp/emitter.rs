use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::envelope::{ADPEnvelope, ADPEventType, ADPSource, ADPTarget};

/// Central emitter for ADP events via Tauri's event system.
///
/// Wraps payloads into `ADPEnvelope` and emits them on the `"adp-event"` channel.
#[derive(Clone)]
pub struct ADPEmitter {
    app: AppHandle,
}

impl ADPEmitter {
    /// Create a new emitter bound to the given Tauri app handle.
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    /// Emit an ADP event with the given type, source, and payload.
    ///
    /// The payload is serialized into a `serde_json::Value` inside the envelope.
    /// Returns the generated envelope ID on success.
    pub fn emit<T: Serialize>(
        &self,
        event_type: ADPEventType,
        source: ADPSource,
        payload: &T,
    ) -> Result<String, String> {
        let envelope = ADPEnvelope::new(event_type, source, payload).map_err(|e| e.to_string())?;

        let id = envelope.id.clone();
        self.app
            .emit("adp-event", &envelope)
            .map_err(|e| format!("Failed to emit ADP event: {}", e))?;

        Ok(id)
    }

    /// Emit an ADP event originating from the Tauri backend.
    ///
    /// Convenience wrapper that sets `source` to `ADPSource::TauriBackend`.
    pub fn emit_from_backend<T: Serialize>(
        &self,
        event_type: ADPEventType,
        payload: &T,
    ) -> Result<String, String> {
        self.emit(event_type, ADPSource::TauriBackend, payload)
    }

    /// Emit an ADP event with a specific target.
    pub fn emit_to<T: Serialize>(
        &self,
        event_type: ADPEventType,
        source: ADPSource,
        target: ADPTarget,
        payload: &T,
    ) -> Result<String, String> {
        let envelope = ADPEnvelope::new(event_type, source, payload)
            .map_err(|e| e.to_string())?
            .with_target(target);

        let id = envelope.id.clone();
        self.app
            .emit("adp-event", &envelope)
            .map_err(|e| format!("Failed to emit ADP event: {}", e))?;

        Ok(id)
    }

    /// Emit an ADP event with correlation tracking.
    pub fn emit_correlated<T: Serialize>(
        &self,
        event_type: ADPEventType,
        source: ADPSource,
        payload: &T,
        correlation_id: impl Into<String>,
        sequence: u32,
    ) -> Result<String, String> {
        let envelope = ADPEnvelope::new(event_type, source, payload)
            .map_err(|e| e.to_string())?
            .with_correlation(correlation_id)
            .with_sequence(sequence);

        let id = envelope.id.clone();
        self.app
            .emit("adp-event", &envelope)
            .map_err(|e| format!("Failed to emit ADP event: {}", e))?;

        Ok(id)
    }
}
