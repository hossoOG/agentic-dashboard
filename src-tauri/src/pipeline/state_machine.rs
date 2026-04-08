//! Pipeline State Machine for lifecycle management.
//!
//! Provides a formal state machine that tracks pipeline execution status
//! and validates state transitions. Emits ADP events on transitions when
//! used through the Tauri command layer.
//!
//! Related issue: #155

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// All possible pipeline lifecycle states.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PipelineStatus {
    Idle,
    Starting,
    Running,
    Paused,
    Completing,
    Completed,
    Failed,
    Cancelled,
}

/// Serializable info returned by `get_pipeline_status`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStatusInfo {
    pub status: PipelineStatus,
    pub workflow_name: Option<String>,
    pub step_index: usize,
    pub total_steps: usize,
    pub elapsed_ms: u64,
    pub error_message: Option<String>,
}

/// State machine tracking pipeline execution lifecycle.
///
/// Thread-safety is achieved via the `Arc<Mutex<PipelineState>>` wrapper
/// in `lib.rs` — this struct itself is not `Sync`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStateMachine {
    status: PipelineStatus,
    workflow_name: Option<String>,
    started_at: Option<DateTime<Utc>>,
    step_index: usize,
    total_steps: usize,
    error_message: Option<String>,
}

impl Default for PipelineStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl PipelineStateMachine {
    /// Create a new state machine in the Idle state.
    pub fn new() -> Self {
        Self {
            status: PipelineStatus::Idle,
            workflow_name: None,
            started_at: None,
            step_index: 0,
            total_steps: 0,
            error_message: None,
        }
    }

    /// Transition: Idle -> Starting -> Running.
    /// Returns error if the machine is not in Idle state.
    pub fn start(&mut self, workflow_name: String, total_steps: usize) -> Result<(), String> {
        if !self.can_start() {
            return Err(format!(
                "Cannot start pipeline: current state is {:?}, expected Idle",
                self.status
            ));
        }
        self.status = PipelineStatus::Starting;
        self.workflow_name = Some(workflow_name);
        self.started_at = Some(Utc::now());
        self.step_index = 0;
        self.total_steps = total_steps;
        self.error_message = None;
        // Immediately transition to Running
        self.status = PipelineStatus::Running;
        Ok(())
    }

    /// Advance to the next step. Only valid when Running.
    pub fn advance_step(&mut self) -> Result<(), String> {
        if self.status != PipelineStatus::Running {
            return Err(format!(
                "Cannot advance step: current state is {:?}, expected Running",
                self.status
            ));
        }
        if self.step_index >= self.total_steps {
            return Err(format!(
                "Cannot advance step: already at step {}/{}",
                self.step_index, self.total_steps
            ));
        }
        self.step_index += 1;
        Ok(())
    }

    /// Transition: Running -> Paused.
    pub fn pause(&mut self) -> Result<(), String> {
        if self.status != PipelineStatus::Running {
            return Err(format!(
                "Cannot pause: current state is {:?}, expected Running",
                self.status
            ));
        }
        self.status = PipelineStatus::Paused;
        Ok(())
    }

    /// Transition: Paused -> Running.
    pub fn resume(&mut self) -> Result<(), String> {
        if self.status != PipelineStatus::Paused {
            return Err(format!(
                "Cannot resume: current state is {:?}, expected Paused",
                self.status
            ));
        }
        self.status = PipelineStatus::Running;
        Ok(())
    }

    /// Transition: Running -> Completing -> Completed.
    pub fn complete(&mut self) -> Result<(), String> {
        if self.status != PipelineStatus::Running {
            return Err(format!(
                "Cannot complete: current state is {:?}, expected Running",
                self.status
            ));
        }
        self.status = PipelineStatus::Completing;
        self.status = PipelineStatus::Completed;
        Ok(())
    }

    /// Transition: any state -> Failed.
    pub fn fail(&mut self, error: String) -> Result<(), String> {
        self.error_message = Some(error);
        self.status = PipelineStatus::Failed;
        Ok(())
    }

    /// Transition: Running | Paused -> Cancelled.
    pub fn cancel(&mut self) -> Result<(), String> {
        match self.status {
            PipelineStatus::Running | PipelineStatus::Paused => {
                self.status = PipelineStatus::Cancelled;
                Ok(())
            }
            _ => Err(format!(
                "Cannot cancel: current state is {:?}, expected Running or Paused",
                self.status
            )),
        }
    }

    /// Transition: terminal state -> Idle. Resets all fields.
    pub fn reset(&mut self) -> Result<(), String> {
        if !self.is_terminal() {
            return Err(format!(
                "Cannot reset: current state {:?} is not terminal (Completed, Failed, or Cancelled)",
                self.status
            ));
        }
        *self = Self::new();
        Ok(())
    }

    /// Current status.
    pub fn status(&self) -> &PipelineStatus {
        &self.status
    }

    /// Whether the pipeline is in a terminal state.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            PipelineStatus::Completed | PipelineStatus::Failed | PipelineStatus::Cancelled
        )
    }

    /// Whether `start()` can be called.
    pub fn can_start(&self) -> bool {
        self.status == PipelineStatus::Idle
    }

    /// Milliseconds elapsed since `started_at`, or 0 if not started.
    pub fn elapsed_ms(&self) -> u64 {
        self.started_at
            .map(|t| {
                let dur = Utc::now().signed_duration_since(t);
                dur.num_milliseconds().max(0) as u64
            })
            .unwrap_or(0)
    }

    /// Build a `PipelineStatusInfo` snapshot for the frontend.
    pub fn info(&self) -> PipelineStatusInfo {
        PipelineStatusInfo {
            status: self.status.clone(),
            workflow_name: self.workflow_name.clone(),
            step_index: self.step_index,
            total_steps: self.total_steps,
            elapsed_ms: self.elapsed_ms(),
            error_message: self.error_message.clone(),
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_state_is_idle() {
        let sm = PipelineStateMachine::new();
        assert_eq!(*sm.status(), PipelineStatus::Idle);
        assert!(sm.can_start());
        assert!(!sm.is_terminal());
    }

    #[test]
    fn start_transitions_to_running() {
        let mut sm = PipelineStateMachine::new();
        sm.start("test-workflow".into(), 5).unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Running);
        assert!(!sm.can_start());
    }

    #[test]
    fn start_when_running_returns_error() {
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 3).unwrap();
        let result = sm.start("wf2".into(), 2);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Running"));
    }

    #[test]
    fn full_lifecycle_idle_to_completed() {
        let mut sm = PipelineStateMachine::new();
        sm.start("deploy".into(), 3).unwrap();
        sm.advance_step().unwrap();
        sm.advance_step().unwrap();
        sm.advance_step().unwrap();
        sm.complete().unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Completed);
        assert!(sm.is_terminal());
    }

    #[test]
    fn advance_step_when_not_running_returns_error() {
        let mut sm = PipelineStateMachine::new();
        let result = sm.advance_step();
        assert!(result.is_err());
    }

    #[test]
    fn advance_step_beyond_total_returns_error() {
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 1).unwrap();
        sm.advance_step().unwrap();
        let result = sm.advance_step();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("already at step"));
    }

    #[test]
    fn pause_and_resume_cycle() {
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 3).unwrap();
        sm.pause().unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Paused);
        sm.resume().unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Running);
    }

    #[test]
    fn pause_when_not_running_returns_error() {
        let sm_idle = PipelineStateMachine::new();
        let mut sm = sm_idle;
        assert!(sm.pause().is_err());
    }

    #[test]
    fn resume_when_not_paused_returns_error() {
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 1).unwrap();
        assert!(sm.resume().is_err());
    }

    #[test]
    fn fail_from_any_state() {
        // Fail from Idle
        let mut sm = PipelineStateMachine::new();
        sm.fail("boom".into()).unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Failed);
        assert!(sm.is_terminal());

        // Fail from Running
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 1).unwrap();
        sm.fail("crash".into()).unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Failed);

        // Fail from Paused
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 1).unwrap();
        sm.pause().unwrap();
        sm.fail("timeout".into()).unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Failed);
    }

    #[test]
    fn cancel_from_running_and_paused() {
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 3).unwrap();
        sm.cancel().unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Cancelled);
        assert!(sm.is_terminal());

        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 3).unwrap();
        sm.pause().unwrap();
        sm.cancel().unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Cancelled);
    }

    #[test]
    fn cancel_from_idle_returns_error() {
        let mut sm = PipelineStateMachine::new();
        assert!(sm.cancel().is_err());
    }

    #[test]
    fn reset_from_terminal_states() {
        // Reset from Completed
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 1).unwrap();
        sm.complete().unwrap();
        sm.reset().unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Idle);
        assert!(sm.can_start());

        // Reset from Failed
        let mut sm = PipelineStateMachine::new();
        sm.fail("err".into()).unwrap();
        sm.reset().unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Idle);

        // Reset from Cancelled
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 1).unwrap();
        sm.cancel().unwrap();
        sm.reset().unwrap();
        assert_eq!(*sm.status(), PipelineStatus::Idle);
    }

    #[test]
    fn reset_from_non_terminal_returns_error() {
        let mut sm = PipelineStateMachine::new();
        assert!(sm.reset().is_err()); // Idle is not terminal

        sm.start("wf".into(), 1).unwrap();
        assert!(sm.reset().is_err()); // Running is not terminal
    }

    #[test]
    fn is_terminal_values() {
        let states_terminal = [
            PipelineStatus::Completed,
            PipelineStatus::Failed,
            PipelineStatus::Cancelled,
        ];
        let states_non_terminal = [
            PipelineStatus::Idle,
            PipelineStatus::Starting,
            PipelineStatus::Running,
            PipelineStatus::Paused,
            PipelineStatus::Completing,
        ];

        for s in &states_terminal {
            let mut sm = PipelineStateMachine::new();
            sm.status = s.clone();
            assert!(sm.is_terminal(), "{:?} should be terminal", s);
        }
        for s in &states_non_terminal {
            let mut sm = PipelineStateMachine::new();
            sm.status = s.clone();
            assert!(!sm.is_terminal(), "{:?} should not be terminal", s);
        }
    }

    #[test]
    fn elapsed_ms_returns_zero_before_start() {
        let sm = PipelineStateMachine::new();
        assert_eq!(sm.elapsed_ms(), 0);
    }

    #[test]
    fn elapsed_ms_returns_positive_after_start() {
        let mut sm = PipelineStateMachine::new();
        sm.start("wf".into(), 1).unwrap();
        // elapsed_ms should be >= 0 (essentially instant in tests)
        assert!(sm.elapsed_ms() < 1000);
    }

    #[test]
    fn info_snapshot_reflects_current_state() {
        let mut sm = PipelineStateMachine::new();
        sm.start("my-workflow".into(), 5).unwrap();
        sm.advance_step().unwrap();

        let info = sm.info();
        assert_eq!(info.status, PipelineStatus::Running);
        assert_eq!(info.workflow_name.as_deref(), Some("my-workflow"));
        assert_eq!(info.step_index, 1);
        assert_eq!(info.total_steps, 5);
        assert!(info.error_message.is_none());
    }

    #[test]
    fn complete_when_not_running_returns_error() {
        let mut sm = PipelineStateMachine::new();
        assert!(sm.complete().is_err()); // Idle

        sm.start("wf".into(), 1).unwrap();
        sm.pause().unwrap();
        assert!(sm.complete().is_err()); // Paused
    }
}
