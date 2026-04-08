use std::sync::{Arc, Mutex};

pub mod adp;
pub mod error;
pub mod github;
pub mod library;
pub mod log_reader;
pub mod pipeline;
pub mod session;
pub mod settings;
pub mod util;
pub mod validation;

fn init_logging() {
    use env_logger::Builder;
    use log::LevelFilter;
    use std::io::Write;

    // File logger: WARN+ to agentic-explorer.log in current dir (or app data dir)
    let log_path = dirs_next_or_cwd();
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path);

    let mut builder = Builder::new();
    builder
        .format(|buf, record| {
            writeln!(
                buf,
                "[{}] [{}] [{}] {}",
                chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.module_path().unwrap_or("unknown"),
                record.args()
            )
        })
        .filter_level(LevelFilter::Info);

    // In debug/dev builds, log INFO+ to stdout; in release, only WARN+
    if cfg!(debug_assertions) {
        builder.filter_level(LevelFilter::Info);
    } else {
        builder.filter_level(LevelFilter::Warn);
    }

    // If we can open the log file, add it as a target via env_logger's writer
    if let Ok(file) = log_file {
        let file = std::sync::Mutex::new(file);
        builder.format(move |buf, record| {
            let msg = format!(
                "[{}] [{}] [{}] {}",
                chrono::Utc::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.module_path().unwrap_or("unknown"),
                record.args()
            );
            // Write to stderr (default env_logger target)
            writeln!(buf, "{}", msg)?;
            // Also write to file
            if let Ok(mut f) = file.lock() {
                let _ = writeln!(f, "{}", msg);
            }
            Ok(())
        });
    }

    if builder.try_init().is_err() {
        eprintln!("[agentic-explorer] Logger already initialized, skipping.");
    }
}

fn dirs_next_or_cwd() -> std::path::PathBuf {
    // Try to use the app's local data dir, fallback to cwd
    if let Some(data_dir) = std::env::var_os("LOCALAPPDATA") {
        let dir = std::path::PathBuf::from(data_dir).join("agentic-explorer");
        if std::fs::create_dir_all(&dir).is_ok() {
            return dir.join("agentic-explorer.log");
        }
    }
    std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("agentic-explorer.log")
}

#[derive(Clone, serde::Serialize)]
pub struct LogEvent {
    pub line: String,
    pub stream: String,
    pub worktree_id: Option<String>,
}

#[derive(Default)]
pub struct PipelineState {
    pub child_pid: Option<u32>,
}

mod commands {
    use crate::error::ADPError;

    #[tauri::command]
    pub async fn open_log_window(app: tauri::AppHandle) -> Result<(), ADPError> {
        use tauri::{Manager, WebviewWindowBuilder};

        if let Some(win) = app.get_webview_window("log-viewer") {
            let _ = win.set_focus();
            return Ok(());
        }

        WebviewWindowBuilder::new(
            &app,
            "log-viewer",
            tauri::WebviewUrl::App("index.html?view=logs".into()),
        )
        .title("AgenticExplorer — Logs")
        .inner_size(900.0, 600.0)
        .resizable(true)
        .build()
        .map_err(|e| ADPError::internal(format!("Failed to create log window: {}", e)))?;

        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();
    log::info!("Agentic Dashboard starting up");

    let pipeline_state = Arc::new(Mutex::new(PipelineState::default()));
    let session_manager = Arc::new(session::manager::SessionManager::new());
    let session_manager_cleanup = session_manager.clone();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin({
            let mut updater = tauri_plugin_updater::Builder::new();
            match option_env!("UPDATER_GITHUB_TOKEN") {
                Some(token) if !token.is_empty() => {
                    updater = updater
                        .header("Authorization", format!("token {}", token))
                        .expect("invalid Authorization header");
                    log::info!("Auto-updater initialized with auth token");
                }
                _ => {
                    log::info!("Auto-updater initialized without auth token (public repo mode)");
                }
            }
            updater.build()
        })
        .plugin(tauri_plugin_process::init())
        .manage(pipeline_state)
        .manage(session_manager)
        .invoke_handler(tauri::generate_handler![
            commands::open_log_window,
            // Session-Commands
            session::commands::commands::create_session,
            session::commands::commands::write_session,
            session::commands::commands::resize_session,
            session::commands::commands::close_session,
            // Folder actions
            session::folder_actions::commands::open_folder_in_explorer,
            session::folder_actions::commands::open_terminal_in_folder,
            // File reader (Agent Config Viewer)
            session::file_reader::commands::read_project_file,
            session::file_reader::commands::write_project_file,
            session::file_reader::commands::list_project_dir,
            session::file_reader::commands::read_user_claude_file,
            session::file_reader::commands::list_user_claude_dir,
            session::file_reader::commands::list_skill_dirs,
            session::file_reader::commands::scan_claude_sessions,
            // Worktree scanning
            session::commands::commands::scan_worktrees,
            // GitHub integration
            github::commands::commands::get_git_info,
            github::commands::commands::get_github_prs,
            github::commands::commands::get_github_issues,
            github::commands::commands::get_kanban_issues,
            github::commands::commands::get_issue_detail,
            github::commands::commands::get_issue_checks,
            github::commands::commands::move_issue_lane,
            // Library
            library::commands::commands::list_library_items,
            library::commands::commands::read_library_item,
            library::commands::commands::save_library_item,
            library::commands::commands::delete_library_item,
            library::commands::commands::rebuild_library_index,
            library::commands::commands::attach_library_item,
            library::commands::commands::detach_library_item,
            library::commands::commands::get_library_item_path,
            // Pipeline history
            pipeline::commands::list_pipeline_runs,
            pipeline::commands::get_pipeline_run,
            // Pipeline workflow parser
            pipeline::commands::load_workflow,
            pipeline::commands::list_workflows,
            // Log reader
            log_reader::commands::read_backend_log,
            // User settings (Documents/AgenticExplorer/)
            settings::commands::load_user_settings,
            settings::commands::save_user_settings,
            settings::commands::load_favorites_file,
            settings::commands::save_favorites_file,
            settings::commands::load_notes,
            settings::commands::save_note_file,
        ])
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Nur beim Schließen des Hauptfensters alle Sessions beenden
                if window.label() == "main" {
                    let sessions = session_manager_cleanup.list_sessions();
                    for s in &sessions {
                        if let Err(e) = session_manager_cleanup.close_session(&s.id) {
                            log::error!("Failed to close session {} on shutdown: {}", s.id, e);
                        }
                    }
                    if !sessions.is_empty() {
                        log::info!("Closed {} sessions on window close.", sessions.len());
                    }
                }
            }
        })
        .run(tauri::generate_context!());

    match result {
        Ok(()) => log::info!("Agentic Dashboard exited cleanly"),
        Err(e) => {
            log::error!("Tauri application failed to run: {}", e);
            eprintln!("Fatal: Tauri application failed to run: {}", e);
            std::process::exit(1);
        }
    }
}
