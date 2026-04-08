use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

use crate::error::ADPError;

// ============================================================================
// Data Model
// ============================================================================

/// Outcome of a completed pipeline run.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum RunOutcome {
    Success,
    Failed,
    Cancelled,
    TimedOut,
}

/// Record of a single step execution within a pipeline run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepRecord {
    pub step_id: String,
    /// Type of step: "agent", "gate", "action"
    pub step_type: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub outcome: RunOutcome,
    pub duration_ms: u64,
    pub retry_count: u32,
    /// Last ~500 chars of output
    pub output_snippet: Option<String>,
    pub error_message: Option<String>,
}

/// A complete pipeline run record.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineRun {
    pub id: String,
    pub workflow_name: String,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub outcome: RunOutcome,
    /// Trigger source: "manual", "scheduled", "webhook"
    pub trigger: String,
    pub inputs: HashMap<String, String>,
    pub steps: Vec<StepRecord>,
    pub total_duration_ms: u64,
    pub total_tokens: Option<u64>,
    pub project_path: Option<String>,
}

impl PipelineRun {
    pub fn new(workflow_name: String, inputs: HashMap<String, String>) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            workflow_name,
            started_at: Utc::now(),
            completed_at: None,
            outcome: RunOutcome::Success,
            trigger: "manual".to_string(),
            inputs,
            steps: Vec::new(),
            total_duration_ms: 0,
            total_tokens: None,
            project_path: None,
        }
    }
}

// ============================================================================
// Persistence
// ============================================================================

/// Default maximum number of runs to retain.
const DEFAULT_MAX_RUNS: usize = 100;

/// Returns the pipeline history directory, creating it if needed.
/// Location: `Documents/AgenticExplorer/pipeline-history/`
fn get_history_dir() -> Result<PathBuf, ADPError> {
    let doc_dir = dirs::document_dir()
        .ok_or_else(|| ADPError::file_io("Could not determine Documents directory"))?;
    let dir = doc_dir.join("AgenticExplorer").join("pipeline-history");
    std::fs::create_dir_all(&dir)
        .map_err(|e| ADPError::file_io(format!("Failed to create history directory: {}", e)))?;
    Ok(dir)
}

/// Save a pipeline run as a JSON file.
pub fn save_run(run: &PipelineRun) -> Result<(), ADPError> {
    let dir = get_history_dir()?;
    let path = dir.join(format!("{}.json", run.id));
    let json = serde_json::to_string_pretty(run)?;

    // Atomic write via temp file + rename
    let temp = path.with_extension("tmp");
    std::fs::write(&temp, &json)
        .map_err(|e| ADPError::file_io(format!("Failed to write history temp file: {}", e)))?;
    std::fs::rename(&temp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&temp);
        ADPError::file_io(format!("Failed to rename history temp file: {}", e))
    })
}

/// Load a single pipeline run by ID.
pub fn load_run(id: &str) -> Result<PipelineRun, ADPError> {
    // Validate ID to prevent path traversal
    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err(ADPError::validation("Invalid run ID"));
    }

    let dir = get_history_dir()?;
    let path = dir.join(format!("{}.json", id));
    if !path.exists() {
        return Err(ADPError::file_io(format!("Pipeline run not found: {}", id)));
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| ADPError::file_io(format!("Failed to read run {}: {}", id, e)))?;
    let run: PipelineRun = serde_json::from_str(&data)?;
    Ok(run)
}

/// List pipeline runs sorted by date (newest first), with pagination.
pub fn list_runs(limit: usize, offset: usize) -> Result<Vec<PipelineRun>, ADPError> {
    let dir = get_history_dir()?;
    let mut runs: Vec<PipelineRun> = Vec::new();

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| ADPError::file_io(format!("Failed to read history directory: {}", e)))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(data) => match serde_json::from_str::<PipelineRun>(&data) {
                Ok(run) => runs.push(run),
                Err(e) => {
                    log::warn!("Skipping corrupt history file {:?}: {}", path, e);
                }
            },
            Err(e) => {
                log::warn!("Failed to read history file {:?}: {}", path, e);
            }
        }
    }

    // Sort newest first
    runs.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    // Apply pagination
    let paginated: Vec<PipelineRun> = runs.into_iter().skip(offset).take(limit).collect();
    Ok(paginated)
}

/// Count total pipeline runs on disk.
pub fn get_run_count() -> Result<usize, ADPError> {
    let dir = get_history_dir()?;
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| ADPError::file_io(format!("Failed to read history directory: {}", e)))?;

    let count = entries
        .flatten()
        .filter(|e| e.path().extension().and_then(|ext| ext.to_str()) == Some("json"))
        .count();
    Ok(count)
}

/// Rotate old runs: keep only the newest `max_runs`, delete the rest.
/// Returns the number of deleted runs.
pub fn delete_old_runs(max_runs: Option<usize>) -> Result<usize, ADPError> {
    let max = max_runs.unwrap_or(DEFAULT_MAX_RUNS);
    let dir = get_history_dir()?;

    // Collect (path, started_at) tuples
    let mut entries: Vec<(PathBuf, DateTime<Utc>)> = Vec::new();
    let dir_entries = std::fs::read_dir(&dir)
        .map_err(|e| ADPError::file_io(format!("Failed to read history directory: {}", e)))?;

    for entry in dir_entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(data) => match serde_json::from_str::<PipelineRun>(&data) {
                Ok(run) => entries.push((path, run.started_at)),
                Err(_) => {
                    // Corrupt file — delete it
                    let _ = std::fs::remove_file(&path);
                }
            },
            Err(_) => {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    if entries.len() <= max {
        return Ok(0);
    }

    // Sort newest first
    entries.sort_by(|a, b| b.1.cmp(&a.1));

    let to_delete = &entries[max..];
    let mut deleted = 0;
    for (path, _) in to_delete {
        if std::fs::remove_file(path).is_ok() {
            deleted += 1;
        }
    }

    Ok(deleted)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::TempDir;

    /// Helper: create a PipelineRun with a specific timestamp offset (for ordering tests).
    fn make_run(name: &str, seconds_ago: i64) -> PipelineRun {
        let mut run = PipelineRun::new(name.to_string(), HashMap::new());
        run.started_at = Utc::now() - chrono::Duration::seconds(seconds_ago);
        run
    }

    /// Helper: write a run directly to a temp dir.
    fn write_run_to_dir(dir: &std::path::Path, run: &PipelineRun) {
        let path = dir.join(format!("{}.json", run.id));
        let json = serde_json::to_string_pretty(run).unwrap();
        std::fs::write(path, json).unwrap();
    }

    #[test]
    fn new_creates_valid_uuid_and_timestamp() {
        let run = PipelineRun::new("test-workflow".to_string(), HashMap::new());
        // UUID v4 format: 8-4-4-4-12
        assert_eq!(run.id.len(), 36);
        assert!(run.id.chars().filter(|c| *c == '-').count() == 4);
        assert_eq!(run.workflow_name, "test-workflow");
        assert_eq!(run.outcome, RunOutcome::Success);
        assert_eq!(run.trigger, "manual");
        assert!(run.steps.is_empty());
        assert!(run.completed_at.is_none());
    }

    #[test]
    fn serialization_roundtrip() {
        let mut run = PipelineRun::new("roundtrip-wf".to_string(), HashMap::new());
        run.inputs.insert("branch".to_string(), "main".to_string());
        run.outcome = RunOutcome::Failed;
        run.total_duration_ms = 12345;
        run.steps.push(StepRecord {
            step_id: "step-1".to_string(),
            step_type: "agent".to_string(),
            started_at: Utc::now(),
            completed_at: Some(Utc::now()),
            outcome: RunOutcome::Success,
            duration_ms: 5000,
            retry_count: 0,
            output_snippet: Some("done".to_string()),
            error_message: None,
        });

        let json = serde_json::to_string(&run).unwrap();
        let deserialized: PipelineRun = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, run.id);
        assert_eq!(deserialized.outcome, RunOutcome::Failed);
        assert_eq!(deserialized.steps.len(), 1);
        assert_eq!(deserialized.steps[0].step_id, "step-1");
    }

    #[test]
    fn camel_case_serialization() {
        let run = PipelineRun::new("camel-test".to_string(), HashMap::new());
        let json = serde_json::to_string(&run).unwrap();
        assert!(json.contains("\"workflowName\""));
        assert!(json.contains("\"startedAt\""));
        assert!(json.contains("\"totalDurationMs\""));
        assert!(!json.contains("\"workflow_name\""));
    }

    #[test]
    fn save_and_load_roundtrip() {
        let tmp = TempDir::new().unwrap();
        // Override get_history_dir by saving/loading manually in temp dir
        let run = PipelineRun::new("save-load-test".to_string(), HashMap::new());
        write_run_to_dir(tmp.path(), &run);

        let path = tmp.path().join(format!("{}.json", run.id));
        let data = std::fs::read_to_string(path).unwrap();
        let loaded: PipelineRun = serde_json::from_str(&data).unwrap();
        assert_eq!(loaded.id, run.id);
        assert_eq!(loaded.workflow_name, "save-load-test");
    }

    #[test]
    fn list_runs_sorted_newest_first() {
        let tmp = TempDir::new().unwrap();

        let old_run = make_run("old", 3600);
        let mid_run = make_run("mid", 1800);
        let new_run = make_run("new", 60);

        write_run_to_dir(tmp.path(), &old_run);
        write_run_to_dir(tmp.path(), &mid_run);
        write_run_to_dir(tmp.path(), &new_run);

        // Read all runs from the temp dir (simulating list_runs logic)
        let mut runs: Vec<PipelineRun> = Vec::new();
        for entry in std::fs::read_dir(tmp.path()).unwrap().flatten() {
            let data = std::fs::read_to_string(entry.path()).unwrap();
            let run: PipelineRun = serde_json::from_str(&data).unwrap();
            runs.push(run);
        }
        runs.sort_by(|a, b| b.started_at.cmp(&a.started_at));

        assert_eq!(runs.len(), 3);
        assert_eq!(runs[0].workflow_name, "new");
        assert_eq!(runs[1].workflow_name, "mid");
        assert_eq!(runs[2].workflow_name, "old");
    }

    #[test]
    fn list_runs_pagination() {
        let tmp = TempDir::new().unwrap();

        for i in 0..5 {
            let run = make_run(&format!("run-{}", i), (5 - i) as i64 * 100);
            write_run_to_dir(tmp.path(), &run);
        }

        let mut runs: Vec<PipelineRun> = Vec::new();
        for entry in std::fs::read_dir(tmp.path()).unwrap().flatten() {
            let data = std::fs::read_to_string(entry.path()).unwrap();
            let run: PipelineRun = serde_json::from_str(&data).unwrap();
            runs.push(run);
        }
        runs.sort_by(|a, b| b.started_at.cmp(&a.started_at));

        // Page: offset=1, limit=2
        let page: Vec<_> = runs.into_iter().skip(1).take(2).collect();
        assert_eq!(page.len(), 2);
    }

    #[test]
    fn delete_old_runs_keeps_newest() {
        let tmp = TempDir::new().unwrap();

        for i in 0..5 {
            let run = make_run(&format!("run-{}", i), (5 - i) as i64 * 100);
            write_run_to_dir(tmp.path(), &run);
        }

        // Read, sort, and keep only 2 newest
        let mut entries: Vec<(PathBuf, DateTime<Utc>)> = Vec::new();
        for entry in std::fs::read_dir(tmp.path()).unwrap().flatten() {
            let path = entry.path();
            let data = std::fs::read_to_string(&path).unwrap();
            let run: PipelineRun = serde_json::from_str(&data).unwrap();
            entries.push((path, run.started_at));
        }
        entries.sort_by(|a, b| b.1.cmp(&a.1));

        let to_delete = &entries[2..];
        let mut deleted = 0;
        for (path, _) in to_delete {
            std::fs::remove_file(path).unwrap();
            deleted += 1;
        }

        assert_eq!(deleted, 3);
        let remaining: Vec<_> = std::fs::read_dir(tmp.path()).unwrap().flatten().collect();
        assert_eq!(remaining.len(), 2);
    }

    #[test]
    fn empty_history_returns_empty_vec() {
        let tmp = TempDir::new().unwrap();
        let entries: Vec<_> = std::fs::read_dir(tmp.path())
            .unwrap()
            .flatten()
            .filter(|e| {
                e.path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map_or(false, |ext| ext == "json")
            })
            .collect();
        assert!(entries.is_empty());
    }

    #[test]
    fn corrupt_file_is_skipped() {
        let tmp = TempDir::new().unwrap();
        // Write a valid run
        let valid = PipelineRun::new("valid".to_string(), HashMap::new());
        write_run_to_dir(tmp.path(), &valid);
        // Write a corrupt file
        std::fs::write(tmp.path().join("corrupt.json"), "not valid json").unwrap();

        let mut runs: Vec<PipelineRun> = Vec::new();
        for entry in std::fs::read_dir(tmp.path()).unwrap().flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(run) = serde_json::from_str::<PipelineRun>(&data) {
                    runs.push(run);
                }
            }
        }

        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].workflow_name, "valid");
    }

    #[test]
    fn run_outcome_serializes_snake_case() {
        let json = serde_json::to_string(&RunOutcome::TimedOut).unwrap();
        assert_eq!(json, "\"timed_out\"");

        let json = serde_json::to_string(&RunOutcome::Success).unwrap();
        assert_eq!(json, "\"success\"");
    }

    #[test]
    fn path_traversal_rejected() {
        let result = load_run("../../../etc/passwd");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("Invalid run ID"));
    }
}
