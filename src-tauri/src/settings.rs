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

    /// Load favorites JSON from Documents/AgenticExplorer/favorites.json
    /// Returns empty string if file doesn't exist yet.
    #[tauri::command]
    pub async fn load_favorites_file() -> Result<String, String> {
        let path = settings_dir()?.join("favorites.json");
        if !path.exists() {
            return Ok(String::new());
        }
        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read favorites file: {}", e))
    }

    /// Save favorites list as JSON to Documents/AgenticExplorer/favorites.json
    #[tauri::command]
    pub async fn save_favorites_file(data: String) -> Result<(), String> {
        let path = settings_dir()?.join("favorites.json");
        std::fs::write(&path, data)
            .map_err(|e| format!("Failed to write favorites file: {}", e))
    }

    /// Load all notes from Documents/AgenticExplorer/notes/
    /// Returns a JSON object: { "global": "...", "c_/projects/foo": "...", ... }
    #[tauri::command]
    pub async fn load_notes() -> Result<String, String> {
        let dir = notes_dir()?;
        let mut notes = serde_json::Map::new();

        let entries = std::fs::read_dir(&dir)
            .map_err(|e| format!("Failed to read notes directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                let stem = path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string();
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read note {}: {}", stem, e))?;
                notes.insert(stem, serde_json::Value::String(content));
            }
        }

        serde_json::to_string(&notes)
            .map_err(|e| format!("Failed to serialize notes: {}", e))
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
