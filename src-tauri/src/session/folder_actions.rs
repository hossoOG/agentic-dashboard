// src-tauri/src/session/folder_actions.rs

use std::process::Command;

// Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn open_folder_in_explorer(path: String) -> Result<(), String> {
        let folder = std::path::Path::new(&path);
        if !folder.exists() {
            return Err(format!("Path does not exist: {}", path));
        }

        #[cfg(target_os = "windows")]
        {
            Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open Explorer: {}", e))?;
        }
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open Finder: {}", e))?;
        }
        #[cfg(target_os = "linux")]
        {
            Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }

        log::info!("Opened folder in explorer: {}", path);
        Ok(())
    }

    #[tauri::command]
    pub async fn open_terminal_in_folder(path: String) -> Result<(), String> {
        let folder = std::path::Path::new(&path);
        if !folder.exists() {
            return Err(format!("Path does not exist: {}", path));
        }
        if !folder.is_dir() {
            return Err(format!("Path is not a directory: {}", path));
        }

        #[cfg(target_os = "windows")]
        {
            Command::new("cmd")
                .args(["/C", "start", "", "cmd", "/K", &format!("cd /d \"{}\"", path)])
                .current_dir(&path)
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
        }
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .args(["-a", "Terminal", &path])
                .spawn()
                .map_err(|e| format!("Failed to open Terminal: {}", e))?;
        }
        #[cfg(target_os = "linux")]
        {
            Command::new("x-terminal-emulator")
                .current_dir(&path)
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
        }

        log::info!("Opened terminal in folder: {}", path);
        Ok(())
    }
}
