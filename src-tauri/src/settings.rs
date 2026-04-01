use std::path::{Path, PathBuf};

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

/// Write data to a file atomically via a temp file + rename.
/// This prevents corruption if the app crashes mid-write.
fn atomic_write(path: &Path, data: &str) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    std::fs::write(&temp, data).map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&temp, path).map_err(|e| {
        // Clean up temp file on rename failure
        let _ = std::fs::remove_file(&temp);
        format!("Failed to rename temp to target: {}", e)
    })
}

/// Rotate up to `max_backups` backup copies before overwriting a file.
/// Pattern: file.backup.3.json -> deleted, .2 -> .3, .1 -> .2, original -> .1 (copy).
fn create_backup(path: &Path, max_backups: u32) {
    if !path.exists() {
        return;
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("json");
    let stem = path.with_extension("");

    // Delete the oldest backup if it exists
    let oldest = PathBuf::from(format!("{}.backup.{}.{}", stem.display(), max_backups, ext));
    if oldest.exists() {
        let _ = std::fs::remove_file(&oldest);
    }

    // Shift existing backups up by one slot (N-1 -> N, ... , 1 -> 2)
    for i in (1..max_backups).rev() {
        let from = PathBuf::from(format!("{}.backup.{}.{}", stem.display(), i, ext));
        let to = PathBuf::from(format!("{}.backup.{}.{}", stem.display(), i + 1, ext));
        if from.exists() {
            let _ = std::fs::rename(&from, &to);
        }
    }

    // Copy the current file into backup slot 1 (copy, not move!)
    let first_backup = PathBuf::from(format!("{}.backup.1.{}", stem.display(), ext));
    if let Err(e) = std::fs::copy(path, &first_backup) {
        log::warn!("Failed to create backup of {}: {}", path.display(), e);
    }
}

/// Load a JSON file with fallback to backup copies.
/// If the primary file is missing or contains invalid JSON, tries backup.1, .2, .3.
/// Returns empty string if nothing is recoverable (fresh start).
fn load_with_fallback(path: &Path, label: &str) -> Result<String, String> {
    // Try primary file first
    if path.exists() {
        match std::fs::read_to_string(path) {
            Ok(content) => {
                if serde_json::from_str::<serde_json::Value>(&content).is_ok() {
                    return Ok(content);
                }
                log::warn!("{}: primary file has invalid JSON, trying backups", label);
            }
            Err(e) => {
                log::warn!(
                    "{}: failed to read primary file: {}, trying backups",
                    label,
                    e
                );
            }
        }
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("json");
    let stem = path.with_extension("");

    // Try backup files 1..3
    for i in 1..=3 {
        let backup = PathBuf::from(format!("{}.backup.{}.{}", stem.display(), i, ext));
        if !backup.exists() {
            continue;
        }
        match std::fs::read_to_string(&backup) {
            Ok(content) => {
                if serde_json::from_str::<serde_json::Value>(&content).is_ok() {
                    log::warn!("{}: recovered from backup {}", label, backup.display());
                    return Ok(content);
                }
                log::warn!(
                    "{}: backup {} also has invalid JSON, skipping",
                    label,
                    backup.display()
                );
            }
            Err(e) => {
                log::warn!(
                    "{}: failed to read backup {}: {}",
                    label,
                    backup.display(),
                    e
                );
            }
        }
    }

    log::warn!(
        "{}: all files corrupt or missing, returning empty (fresh start)",
        label
    );
    Ok(String::new())
}

#[allow(clippy::module_inception)]
pub mod commands {
    use super::*;

    /// Load settings JSON from Documents/AgenticExplorer/settings.json
    /// Returns empty string if file doesn't exist yet (first run).
    /// Falls back to backup files if primary is missing or corrupt.
    #[tauri::command]
    pub async fn load_user_settings() -> Result<String, String> {
        let path = settings_path()?;
        load_with_fallback(&path, "settings")
    }

    /// Save settings JSON to Documents/AgenticExplorer/settings.json
    #[tauri::command]
    pub async fn save_user_settings(data: String) -> Result<(), String> {
        let path = settings_path()?;
        create_backup(&path, 3);
        atomic_write(&path, &data)
    }

    /// Load favorites JSON from Documents/AgenticExplorer/favorites.json
    /// Returns empty string if file doesn't exist yet.
    /// Falls back to backup files if primary is missing or corrupt.
    #[tauri::command]
    pub async fn load_favorites_file() -> Result<String, String> {
        let path = settings_dir()?.join("favorites.json");
        load_with_fallback(&path, "favorites")
    }

    /// Save favorites list as JSON to Documents/AgenticExplorer/favorites.json
    #[tauri::command]
    pub async fn save_favorites_file(data: String) -> Result<(), String> {
        let path = settings_dir()?.join("favorites.json");
        create_backup(&path, 3);
        atomic_write(&path, &data)
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
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string();
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read note {}: {}", stem, e))?;
                notes.insert(stem, serde_json::Value::String(content));
            }
        }

        serde_json::to_string(&notes).map_err(|e| format!("Failed to serialize notes: {}", e))
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

        atomic_write(&path, &content)
    }
}
