// src-tauri/src/session/agent_detector/events.rs
//
// Event types emitted by the detector, worktree scanning, and related data structures.

// ============================================================================
// Data Model
// ============================================================================

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: Option<String>,
    pub task: Option<String>,
    pub task_number: Option<u32>,
    pub phase_number: Option<u32>,
    pub status: String, // "running" | "completed" | "error" | "pending" | "blocked"
    pub detected_at: i64,
    pub completed_at: Option<i64>,
    pub worktree_path: Option<String>,
    pub parent_agent_id: Option<String>,
    pub depth: u32,
    pub duration_str: Option<String>,
    pub token_count: Option<String>,
    pub blocked_by: Option<u32>,
}

// ============================================================================
// Tauri Event Payloads
// ============================================================================

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentDetectedEvent {
    pub session_id: String,
    pub agent_id: String,
    pub name: Option<String>,
    pub task: Option<String>,
    pub task_number: Option<u32>,
    pub phase_number: Option<u32>,
    pub parent_agent_id: Option<String>,
    pub depth: u32,
    pub detected_at: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentCompletedEvent {
    pub session_id: String,
    pub agent_id: String,
    pub status: String,
    pub completed_at: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentStatusUpdateEvent {
    pub session_id: String,
    pub agent_id: String,
    pub status: String,
    pub duration_str: Option<String>,
    pub token_count: Option<String>,
    pub blocked_by: Option<u32>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct TaskSummaryEvent {
    pub session_id: String,
    pub pending_count: u32,
    pub completed_count: u32,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct WorktreeDetectedEvent {
    pub session_id: String,
    pub path: String,
    pub branch: Option<String>,
    pub agent_id: Option<String>,
}

// ============================================================================
// Worktree scan result
// ============================================================================

#[derive(Clone, Debug, serde::Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
}

// ============================================================================
// Event Enum
// ============================================================================

/// Events emitted by the detector after processing a chunk.
#[derive(Clone, Debug)]
pub enum AgentEvent {
    Detected(AgentDetectedEvent),
    Completed(AgentCompletedEvent),
    StatusUpdate(AgentStatusUpdateEvent),
    TaskSummary(TaskSummaryEvent),
    Worktree(WorktreeDetectedEvent),
}

// ============================================================================
// Worktree scanning
// ============================================================================

/// Scan a project folder for git worktrees.
/// Uses `git worktree list --porcelain` for reliable parsing.
pub fn scan_worktrees_in_folder(folder: &str) -> Result<Vec<WorktreeInfo>, crate::error::ADPError> {
    let mut cmd = crate::util::silent_command("git");
    cmd.args(["worktree", "list", "--porcelain"])
        .current_dir(folder);
    let output = crate::util::timed_output(cmd, crate::util::DEFAULT_COMMAND_TIMEOUT)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::ADPError::command_failed(format!(
            "git worktree list failed: {}",
            stderr.trim()
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut is_bare = false;

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("worktree ") {
            if let Some(path) = current_path.take() {
                if !is_bare {
                    worktrees.push(WorktreeInfo {
                        path,
                        branch: current_branch.take(),
                        is_main: worktrees.is_empty(),
                    });
                }
            }
            current_path = Some(rest.to_string());
            current_branch = None;
            is_bare = false;
        } else if let Some(rest) = line.strip_prefix("branch ") {
            let branch = rest.to_string();
            current_branch = Some(branch.replace("refs/heads/", ""));
        } else if line == "bare" {
            is_bare = true;
        }
    }

    if let Some(path) = current_path {
        if !is_bare {
            worktrees.push(WorktreeInfo {
                path,
                branch: current_branch,
                is_main: worktrees.is_empty(),
            });
        }
    }

    Ok(worktrees)
}
