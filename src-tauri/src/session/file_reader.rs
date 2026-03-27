// src-tauri/src/session/file_reader.rs

use std::path::PathBuf;

/// Canonicalize and validate that resolved_path is inside base_folder.
fn safe_resolve(folder: &str, relative_path: &str) -> Result<PathBuf, String> {
    let base = PathBuf::from(folder);
    if !base.is_dir() {
        return Err(format!("Failed to resolve path: folder does not exist: {}", folder));
    }

    let target = base.join(relative_path);

    // Canonicalize base; target may not exist yet so we canonicalize its parent
    let canon_base = base
        .canonicalize()
        .map_err(|e| format!("Failed to resolve base folder '{}': {}", folder, e))?;

    // For the target, check if it exists first
    if target.exists() {
        let canon_target = target
            .canonicalize()
            .map_err(|e| format!("Failed to resolve target path '{}': {}", relative_path, e))?;

        if !canon_target.starts_with(&canon_base) {
            return Err("Path traversal detected: target is outside project folder".to_string());
        }
        Ok(canon_target)
    } else {
        // File doesn't exist — that's okay, caller handles empty result
        Ok(target)
    }
}

// Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn read_project_file(folder: String, relative_path: String) -> Result<String, String> {
        let path = safe_resolve(&folder, &relative_path)?;

        if !path.exists() || !path.is_file() {
            return Ok(String::new());
        }

        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file '{}': {}", relative_path, e))
    }

    #[tauri::command]
    pub async fn list_project_dir(folder: String, relative_path: String) -> Result<Vec<String>, String> {
        let path = safe_resolve(&folder, &relative_path)?;

        if !path.exists() || !path.is_dir() {
            return Ok(Vec::new());
        }

        let mut entries = Vec::new();
        let read_dir = std::fs::read_dir(&path)
            .map_err(|e| format!("Failed to read directory '{}': {}", relative_path, e))?;

        for entry in read_dir {
            if let Ok(entry) = entry {
                if let Some(name) = entry.file_name().to_str() {
                    entries.push(name.to_string());
                }
            }
        }

        entries.sort();
        Ok(entries)
    }
}
