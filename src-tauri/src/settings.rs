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

fn notes_dir() -> Result<PathBuf, String> {
    let dir = settings_dir()?.join("notes");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create notes directory: {}", e))?;
    Ok(dir)
}

/// Sanitize a project folder path into a safe filename
fn sanitize_note_filename(folder_key: &str) -> String {
    folder_key
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
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

    /// Save favorites list as JSON to Documents/AgenticExplorer/favorites.json
    #[tauri::command]
    pub async fn save_favorites_file(data: String) -> Result<(), String> {
        let path = settings_dir()?.join("favorites.json");
        std::fs::write(&path, data)
            .map_err(|e| format!("Failed to write favorites file: {}", e))
    }

    /// Save a note as a .md file in Documents/AgenticExplorer/notes/
    /// `note_key` is "global" for global notes, or the sanitized folder path for project notes.
    #[tauri::command]
    pub async fn save_note_file(note_key: String, content: String) -> Result<(), String> {
        let dir = notes_dir()?;
        let filename = if note_key == "global" {
            "global.md".to_string()
        } else {
            format!("{}.md", sanitize_note_filename(&note_key))
        };
        let path = dir.join(&filename);

        if content.trim().is_empty() {
            // Remove empty note files to keep the directory clean
            if path.exists() {
                std::fs::remove_file(&path)
                    .map_err(|e| format!("Failed to remove empty note file: {}", e))?;
            }
            return Ok(());
        }

        std::fs::write(&path, &content)
            .map_err(|e| format!("Failed to write note file: {}", e))
    }
}
