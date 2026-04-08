// src-tauri/src/session/agent_detector/mod.rs
//
// Facade module: re-exports all public types so external callers are unaffected.
//
// Internal structure:
//   parser.rs  — Regex patterns, icon mapping, noise filtering, metrics extraction
//   events.rs  — Event types, data model, worktree scanning
//   state.rs   — AgentDetector struct, feed() method, agent lifecycle

pub mod events;
pub mod parser;
pub mod state;

// Re-export public API — callers continue to use `agent_detector::AgentDetector` etc.
pub use events::{
    scan_worktrees_in_folder, AgentCompletedEvent, AgentDetectedEvent, AgentEvent, AgentInfo,
    AgentStatusUpdateEvent, TaskSummaryEvent, WorktreeDetectedEvent, WorktreeInfo,
};
pub use state::AgentDetector;
