use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::adp::{ADPEmitter, ADPEventType};
use crate::{LogEvent, PipelineState};

/// Start the Claude CLI pipeline for the given project path.
///
/// Spawns `claude m` as a child process, streams stdout/stderr as both
/// legacy `pipeline-log` events and new ADP `adp-event` envelopes (dual-write).
#[tauri::command]
pub async fn start_pipeline(
    app: AppHandle,
    project_path: String,
    state: tauri::State<'_, Arc<Mutex<PipelineState>>>,
) -> Result<(), String> {
    let path = std::path::Path::new(&project_path);
    if !path.exists() {
        return Err(format!("Project path does not exist: {}", project_path));
    }

    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
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
    let claude_check = Command::new("claude").arg("--version").output();
    match &claude_check {
        Ok(output) if output.status.success() => {
            log::info!("Claude CLI found, version check passed");
        }
        Ok(output) => {
            let stderr_msg = String::from_utf8_lossy(&output.stderr);
            log::warn!("Claude CLI found but version check returned non-zero: {}", stderr_msg);
            // Continue anyway — `claude m` may still work
        }
        Err(e) => {
            let detail = if e.kind() == std::io::ErrorKind::NotFound {
                "claude CLI not found in PATH. Install it or add it to PATH."
            } else if e.kind() == std::io::ErrorKind::PermissionDenied {
                "claude CLI found but permission denied. Check file permissions."
            } else {
                "Failed to check claude CLI availability."
            };
            log::error!("Claude CLI check failed: {} — {}", detail, e);
            return Err(format!("{} ({})", detail, e));
        }
    }

    log::info!("Starting pipeline in project path: {}", project_path);

    let mut child = Command::new("claude")
        .arg("m")
        .current_dir(&project_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            log::error!("Failed to spawn claude process: {}", e);
            format!("Failed to spawn claude: {}", e)
        })?;

    let pid = child.id();
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.child_pid = Some(pid);
    }

    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        stdin
            .write_all(b"/orchestrate-issues\n")
            .map_err(|e| format!("Failed to write to claude stdin: {}", e))?;
    }

    let stdout = child.stdout.take().ok_or("Could not get stdout")?;
    let stderr = child.stderr.take().ok_or("Could not get stderr")?;

    let app_stdout = app.clone();
    let app_stderr = app.clone();

    // stdout reader thread — dual-write: legacy + ADP
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let emitter = ADPEmitter::new(app_stdout.clone());
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    // Legacy event (backward compatibility)
                    let event = LogEvent {
                        line: l.clone(),
                        stream: "stdout".to_string(),
                        worktree_id: None,
                    };
                    if let Err(e) = app_stdout.emit("pipeline-log", event) {
                        log::error!("Failed to emit pipeline-log (stdout): {}", e);
                    }

                    // ADP event
                    let payload = serde_json::json!({
                        "_type": "orchestrator.log",
                        "level": "info",
                        "message": l
                    });
                    if let Err(e) = emitter.emit_from_backend(ADPEventType::OrchestratorLog, &payload) {
                        log::error!("Failed to emit ADP orchestrator.log (stdout): {}", e);
                    }
                }
                Err(e) => {
                    log::warn!("Pipeline stdout reader ended: {}", e);
                    break;
                }
            }
        }
        log::info!("Pipeline stdout reader thread exiting");
    });

    // stderr reader thread — dual-write: legacy + ADP
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let emitter = ADPEmitter::new(app_stderr.clone());
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    // Legacy event (backward compatibility)
                    let event = LogEvent {
                        line: l.clone(),
                        stream: "stderr".to_string(),
                        worktree_id: None,
                    };
                    if let Err(e) = app_stderr.emit("pipeline-log", event) {
                        log::error!("Failed to emit pipeline-log (stderr): {}", e);
                    }

                    // ADP event
                    let payload = serde_json::json!({
                        "_type": "orchestrator.log",
                        "level": "error",
                        "message": l
                    });
                    if let Err(e) = emitter.emit_from_backend(ADPEventType::OrchestratorLog, &payload) {
                        log::error!("Failed to emit ADP orchestrator.log (stderr): {}", e);
                    }
                }
                Err(e) => {
                    log::warn!("Pipeline stderr reader ended: {}", e);
                    break;
                }
            }
        }
        log::info!("Pipeline stderr reader thread exiting");
    });

    // Wait for child process in background
    thread::spawn(move || {
        match child.wait() {
            Ok(status) => log::info!("Pipeline child process exited with status: {}", status),
            Err(e) => log::error!("Failed to wait for pipeline child process: {}", e),
        }
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
) -> Result<(), String> {
    let pid = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.child_pid.take()
    };

    if let Some(pid) = pid {
        #[cfg(unix)]
        Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .spawn()
            .map_err(|e| format!("Failed to send SIGTERM to pid {}: {}", pid, e))?
            .wait()
            .map_err(|e| format!("Failed to wait for kill command: {}", e))?;
        #[cfg(windows)]
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .spawn()
            .map_err(|e| format!("Failed to taskkill pid {}: {}", pid, e))?
            .wait()
            .map_err(|e| format!("Failed to wait for taskkill: {}", e))?;
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

/// Open a native folder picker dialog and return the selected path.
#[tauri::command]
pub async fn pick_project_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_title("Select Project Folder")
        .blocking_pick_folder();

    Ok(path.map(|p| p.to_string()))
}
