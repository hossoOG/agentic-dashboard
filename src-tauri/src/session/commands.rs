// src-tauri/src/session/commands.rs

use super::manager::SessionManager;
use std::sync::Arc;
use tauri::{AppHandle, State};

// Alle Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
#[allow(clippy::module_inception)]
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn create_session(
        app: AppHandle,
        manager: State<'_, Arc<SessionManager>>,
        id: String,
        folder: String,
        title: Option<String>,
        shell: Option<String>,
    ) -> Result<super::super::manager::SessionInfo, String> {
        log::debug!("create_session called: id={}, folder={}, shell={:?}", id, folder, shell);

        // Validate that folder exists and is a directory
        let folder_path = std::path::Path::new(&folder);
        if !folder_path.exists() {
            let msg = format!("Failed to create session: folder does not exist: {}", folder);
            log::error!("{}", msg);
            return Err(msg);
        }
        if !folder_path.is_dir() {
            let msg = format!("Failed to create session: path is not a directory: {}", folder);
            log::error!("{}", msg);
            return Err(msg);
        }

        let title = title.unwrap_or_else(|| {
            std::path::Path::new(&folder)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Session".to_string())
        });
        let shell = shell.unwrap_or_else(|| "powershell".to_string());

        manager.create_session(app, id, title, folder, shell)
    }

    #[tauri::command]
    pub async fn write_session(
        manager: State<'_, Arc<SessionManager>>,
        id: String,
        data: String,
    ) -> Result<(), String> {
        log::debug!("write_session called: id={}, data_len={}", id, data.len());
        manager.write_to_session(&id, &data)
    }

    #[tauri::command]
    pub async fn resize_session(
        manager: State<'_, Arc<SessionManager>>,
        id: String,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        log::debug!("resize_session called: id={}, cols={}, rows={}", id, cols, rows);
        manager.resize_session(&id, cols, rows)
    }

    #[tauri::command]
    pub async fn close_session(
        manager: State<'_, Arc<SessionManager>>,
        id: String,
    ) -> Result<(), String> {
        log::info!("close_session called: id={}", id);
        manager.close_session(&id)
    }

    #[tauri::command]
    pub async fn list_sessions(
        manager: State<'_, Arc<SessionManager>>,
    ) -> Result<Vec<super::super::manager::SessionInfo>, String> {
        log::debug!("list_sessions called");
        Ok(manager.list_sessions())
    }

    /// Scan for git worktrees in a project folder.
    #[tauri::command]
    pub async fn scan_worktrees(
        folder: String,
    ) -> Result<Vec<super::super::agent_detector::WorktreeInfo>, String> {
        log::debug!("scan_worktrees called: folder={}", folder);
        super::super::agent_detector::scan_worktrees_in_folder(&folder)
    }
}
