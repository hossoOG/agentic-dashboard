use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

/// Payload sent to the frontend for each log line
#[derive(Clone, serde::Serialize)]
pub struct LogEvent {
    pub line: String,
    pub stream: String, // "stdout" or "stderr"
    pub worktree_id: Option<String>,
}

/// State for tracking the running process
pub struct PipelineState {
    pub child_pid: Option<u32>,
}

impl Default for PipelineState {
    fn default() -> Self {
        Self { child_pid: None }
    }
}

/// Start the Claude pipeline in the given project directory.
/// Spawns `claude m` and pipes `/orchestrate-issues` to its stdin.
/// Each line of stdout/stderr is emitted as a `pipeline-log` event to the frontend.
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

    // Kill any existing process
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.child_pid = None;
    }

    let mut child = Command::new("claude")
        .arg("m")
        .current_dir(&project_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;

    let pid = child.id();
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.child_pid = Some(pid);
    }

    // Write the orchestrate command to stdin
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(b"/orchestrate-issues\n");
        // stdin is dropped here, closing it
    }

    let stdout = child.stdout.take().ok_or("Could not get stdout")?;
    let stderr = child.stderr.take().ok_or("Could not get stderr")?;

    let app_stdout = app.clone();
    let app_stderr = app.clone();

    // Stream stdout
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let event = LogEvent {
                        line: l,
                        stream: "stdout".to_string(),
                        worktree_id: None,
                    };
                    let _ = app_stdout.emit("pipeline-log", event);
                }
                Err(_) => break,
            }
        }
    });

    // Stream stderr
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let event = LogEvent {
                        line: l,
                        stream: "stderr".to_string(),
                        worktree_id: None,
                    };
                    let _ = app_stderr.emit("pipeline-log", event);
                }
                Err(_) => break,
            }
        }
    });

    // Wait for child in background
    thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

/// Stop the currently running pipeline process
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
        // Kill the process
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .spawn();
        }
    }

    let _ = app.emit("pipeline-stopped", ());
    Ok(())
}

/// Open a native folder picker dialog
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pipeline_state = Arc::new(Mutex::new(PipelineState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(pipeline_state)
        .invoke_handler(tauri::generate_handler![
            start_pipeline,
            stop_pipeline,
            pick_project_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
