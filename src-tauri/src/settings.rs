use std::path::PathBuf;

/// Settings directory: Documents/AgenticExplorer/
fn settings_dir() -> Result<PathBuf, String> {
    let doc_dir = dirs::document_dir()
        .ok_or_else(|| "Could not determine Documents directory".to_string())?;
    let dir = doc_dir.join("AgenticExplorer");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    Ok(dir)
}

fn settings_path() -> Result<PathBuf, String> {
    Ok(settings_dir()?.join("settings.json"))
}

pub mod commands {
    use super::*;

    /// Load settings JSON from Documents/AgenticExplorer/settings.json
    /// Returns empty string if file doesn't exist yet (first run).
    #[tauri::command]
    pub async fn load_user_settings() -> Result<String, String> {
        let path = settings_path()?;
        if !path.exists() {
            return Ok(String::new());
        }
        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read settings: {}", e))
    }

    /// Save settings JSON to Documents/AgenticExplorer/settings.json
    #[tauri::command]
    pub async fn save_user_settings(data: String) -> Result<(), String> {
        let path = settings_path()?;
        std::fs::write(&path, data)
            .map_err(|e| format!("Failed to write settings: {}", e))
    }
}
