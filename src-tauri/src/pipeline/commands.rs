use std::io::{BufRead, BufReader};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::adp::{ADPEmitter, ADPEventType};
use crate::error::{ADPError, ADPErrorCode};
use crate::util::silent_command;
use crate::{LogEvent, PipelineState};

/// Spawn a thread that reads lines from a stream and emits both legacy
/// `pipeline-log` events and ADP `orchestrator.log` envelopes.
fn spawn_stream_reader(
    app: AppHandle,
    reader: impl std::io::Read + Send + 'static,
    stream_type: &'static str,
    adp_level: &'static str,
) {
    thread::spawn(move || {
        let buf = BufReader::new(reader);
        let emitter = ADPEmitter::new(app.clone());
        for line in buf.lines() {
            match line {
                Ok(l) => {
                    // Legacy event (backward compatibility)
                    let event = LogEvent {
                        line: l.clone(),
                        stream: stream_type.to_string(),
                        worktree_id: None,
                    };
                    if let Err(e) = app.emit("pipeline-log", event) {
                        log::error!("Failed to emit pipeline-log ({}): {}", stream_type, e);
                    }

                    // ADP event
                    let payload = serde_json::json!({
                        "_type": "orchestrator.log",
                        "level": adp_level,
                        "message": l
                    });
                    if let Err(e) =
                        emitter.emit_from_backend(ADPEventType::OrchestratorLog, &payload)
                    {
                        log::error!(
                            "Failed to emit ADP orchestrator.log ({}): {}",
                            stream_type,
                            e
                        );
                    }
                }
                Err(e) => {
                    log::warn!("Pipeline {} reader ended: {}", stream_type, e);
                    break;
                }
            }
        }
        log::info!("Pipeline {} reader thread exiting", stream_type);
    });
}

/// Start the Claude CLI pipeline for the given project path.
///
/// Spawns `claude m` as a child process, streams stdout/stderr as both
/// legacy `pipeline-log` events and new ADP `adp-event` envelopes (dual-write).
#[tauri::command]
pub async fn start_pipeline(
    app: AppHandle,
    project_path: String,
    state: tauri::State<'_, Arc<Mutex<PipelineState>>>,
) -> Result<(), ADPError> {
    let path = std::path::Path::new(&project_path);
    if !path.exists() {
        return Err(ADPError::new(
            ADPErrorCode::PipelineSpawnFailed,
            format!(
                "Failed to start pipeline: project path does not exist: {}",
                project_path
            ),
        ));
    }

    {
        let mut s = state
            .lock()
            .map_err(|e| ADPError::internal(e.to_string()))?;
        s.child_pid = None;
    }

    // Emit ADP pipeline.start event
    let emitter = ADPEmitter::new(app.clone());
    let start_payload = serde_json::json!({
        "_type": "pipeline.start",
        "projectPath": project_path,
        "mode": "real"
    });
    if let Err(e) = emitter.emit_from_backend(ADPEventType::PipelineStart, &start_payload) {
        log::error!("Failed to emit pipeline.start ADP event: {}", e);
    }

    // Validate that claude CLI is available before spawning
    let mut version_cmd = silent_command("claude");
    version_cmd.arg("--version");
    let claude_check = crate::util::timed_output(version_cmd, std::time::Duration::from_secs(10));
    match claude_check {
        Ok(output) if output.status.success() => {
            log::info!("Claude CLI found, version check passed");
        }
        Ok(output) => {
            let stderr_msg = String::from_utf8_lossy(&output.stderr);
            log::warn!(
                "Claude CLI found but version check returned non-zero: {}",
                stderr_msg
            );
            // Continue anyway — `claude m` may still work
        }
        Err(e) => {
            log::error!("Claude CLI check failed: {}", e);
            return Err(ADPError::new(
                ADPErrorCode::PipelineSpawnFailed,
                format!("Claude CLI check failed: {}", e),
            ));
        }
    }

    log::info!("Starting pipeline in project path: {}", project_path);

    let mut child = silent_command("claude")
        .arg("m")
        .current_dir(&project_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            log::error!("Failed to spawn claude process for pipeline: {}", e);
            ADPError::new(
                ADPErrorCode::PipelineSpawnFailed,
                format!("Failed to spawn claude process for pipeline: {}", e),
            )
        })?;

    let pid = child.id();
    {
        let mut s = state
            .lock()
            .map_err(|e| ADPError::internal(e.to_string()))?;
        s.child_pid = Some(pid);
    }

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin.write_all(b"/orchestrate-issues\n").map_err(|e| {
            ADPError::new(
                ADPErrorCode::PipelineSpawnFailed,
                format!("Failed to write to pipeline stdin: {}", e),
            )
        })?;
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ADPError::internal("Failed to capture stdout for pipeline process"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| ADPError::internal("Failed to capture stderr for pipeline process"))?;

    // Stream reader threads — dual-write: legacy + ADP
    spawn_stream_reader(app.clone(), stdout, "stdout", "info");
    spawn_stream_reader(app.clone(), stderr, "stderr", "error");

    // Wait for child process in background
    thread::spawn(move || match child.wait() {
        Ok(status) => log::info!("Pipeline child process exited with status: {}", status),
        Err(e) => log::error!("Failed to wait for pipeline child process: {}", e),
    });

    Ok(())
}

/// Stop the running pipeline by killing the child process.
///
/// Emits both legacy `pipeline-stopped` and ADP `pipeline.stop` events.
#[tauri::command]
pub async fn stop_pipeline(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<PipelineState>>>,
) -> Result<(), ADPError> {
    let pid = {
        let mut s = state
            .lock()
            .map_err(|e| ADPError::internal(e.to_string()))?;
        s.child_pid.take()
    };

    if let Some(pid) = pid {
        #[cfg(unix)]
        silent_command("kill")
            .args(["-TERM", &pid.to_string()])
            .spawn()
            .map_err(|e| {
                ADPError::command_failed(format!(
                    "Failed to send SIGTERM to pipeline process {}: {}",
                    pid, e
                ))
            })?
            .wait()
            .map_err(|e| {
                ADPError::command_failed(format!(
                    "Failed to wait for kill of pipeline process {}: {}",
                    pid, e
                ))
            })?;
        #[cfg(windows)]
        silent_command("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .spawn()
            .map_err(|e| {
                ADPError::command_failed(format!("Failed to kill pipeline process {}: {}", pid, e))
            })?
            .wait()
            .map_err(|e| {
                ADPError::command_failed(format!(
                    "Failed to wait for kill of pipeline process {}: {}",
                    pid, e
                ))
            })?;
    }

    log::info!("Pipeline stopped (pid: {:?})", pid);

    // Legacy event (backward compatibility)
    if let Err(e) = app.emit("pipeline-stopped", ()) {
        log::error!("Failed to emit pipeline-stopped event: {}", e);
    }

    // ADP event
    let emitter = ADPEmitter::new(app);
    let stop_payload = serde_json::json!({
        "_type": "pipeline.stop",
        "reason": "user-initiated"
    });
    if let Err(e) = emitter.emit_from_backend(ADPEventType::PipelineStop, &stop_payload) {
        log::error!("Failed to emit ADP pipeline.stop event: {}", e);
    }

    Ok(())
}

// ============================================================================
// Workflow Commands
// ============================================================================

/// Summary of a discovered workflow file for listing in the UI.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowSummary {
    /// Workflow name from YAML
    pub name: String,
    /// Workflow description from YAML
    pub description: String,
    /// Absolute file path
    pub file_path: String,
}

/// Load and validate a single workflow from a YAML file.
#[tauri::command]
pub async fn load_workflow(path: String) -> Result<super::schema::WorkflowDefinition, ADPError> {
    let p = std::path::Path::new(&path);
    let workflow = super::parser::parse_workflow_file(p)?;
    super::parser::validate_workflow(&workflow)?;
    Ok(workflow)
}

/// List all workflow files in `{project_path}/.claude/workflows/` and
/// `{project_path}/workflows/`, returning a summary for each valid file.
#[tauri::command]
pub async fn list_workflows(project_path: String) -> Result<Vec<WorkflowSummary>, ADPError> {
    crate::validation::validate_folder(&project_path)?;
    let base = std::path::Path::new(&project_path);

    let search_dirs = [
        base.join(".claude").join("workflows"),
        base.join("workflows"),
    ];

    let mut summaries = Vec::new();
    for dir in &search_dirs {
        let files = super::parser::list_workflow_files(dir)?;
        for file in files {
            match super::parser::parse_workflow_file(&file) {
                Ok(wf) => {
                    summaries.push(WorkflowSummary {
                        name: wf.name,
                        description: wf.description,
                        file_path: file.to_string_lossy().to_string(),
                    });
                }
                Err(e) => {
                    log::warn!("Skipping invalid workflow {}: {}", file.display(), e);
                }
            }
        }
    }

    Ok(summaries)
}

// ============================================================================
// Pipeline History Commands
// ============================================================================

/// List pipeline runs with optional pagination. Returns newest first.
#[tauri::command]
pub async fn list_pipeline_runs(
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<super::history::PipelineRun>, ADPError> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    super::history::list_runs(limit, offset)
}

/// Get a single pipeline run by ID.
#[tauri::command]
pub async fn get_pipeline_run(id: String) -> Result<super::history::PipelineRun, ADPError> {
    super::history::load_run(&id)
}

/// Open a native folder picker dialog and return the selected path.
#[tauri::command]
pub async fn pick_project_folder(app: AppHandle) -> Result<Option<String>, ADPError> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_title("Select Project Folder")
        .blocking_pick_folder();

    Ok(path.map(|p| p.to_string()))
}
