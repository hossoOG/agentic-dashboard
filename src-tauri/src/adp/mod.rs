pub mod emitter;
pub mod envelope;

// Re-exports for convenient access
pub use emitter::ADPEmitter;
pub use envelope::{ADPEnvelope, ADPEventType, ADPMeta, ADPSource, ADPTarget};
