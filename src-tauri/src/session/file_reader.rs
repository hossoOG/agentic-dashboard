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

/// Resolve a path inside ~/.claude/ with traversal protection.
fn safe_resolve_user_claude(relative_path: &str) -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;
    let claude_dir = home.join(".claude");

    if !claude_dir.is_dir() {
        // ~/.claude/ doesn't exist — return non-existent path, caller handles empty result
        return Ok(claude_dir.join(relative_path));
    }

    let target = claude_dir.join(relative_path);

    let canon_base = claude_dir
        .canonicalize()
        .map_err(|e| format!("Cannot resolve ~/.claude: {}", e))?;

    if target.exists() {
        let canon_target = target
            .canonicalize()
            .map_err(|e| format!("Cannot resolve target: {}", e))?;
        if !canon_target.starts_with(&canon_base) {
            return Err("Path traversal detected: target is outside ~/.claude".to_string());
        }
        Ok(canon_target)
    } else {
        Ok(target)
    }
}

/// Entry for a skill directory containing a SKILL.md file.
#[derive(serde::Serialize)]
pub struct SkillDirEntry {
    pub dir_name: String,
    pub content: String,
    pub has_reference_dir: bool,
}

// Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
#[allow(clippy::module_inception)]
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

        for entry in read_dir.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                entries.push(name.to_string());
            }
        }

        entries.sort();
        Ok(entries)
    }

    /// Read a file from the user's ~/.claude/ directory.
    #[tauri::command]
    pub async fn read_user_claude_file(relative_path: String) -> Result<String, String> {
        let path = safe_resolve_user_claude(&relative_path)?;

        if !path.exists() || !path.is_file() {
            return Ok(String::new());
        }

        std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file: {}", e))
    }

    /// List all skill directories under .claude/skills/, returning each skill's
    /// SKILL.md content and whether it has a reference/ subdirectory.
    /// This batches N+1 IPC calls into a single round-trip.
    #[tauri::command]
    pub async fn list_skill_dirs(folder: String) -> Result<Vec<SkillDirEntry>, String> {
        let path = safe_resolve(&folder, ".claude/skills")?;

        if !path.exists() || !path.is_dir() {
            return Ok(Vec::new());
        }

        let mut skills = Vec::new();
        let read_dir = std::fs::read_dir(&path)
            .map_err(|e| format!("Failed to read skills directory: {}", e))?;

        for entry in read_dir {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let entry_path = entry.path();
            if !entry_path.is_dir() {
                continue;
            }

            let dir_name = match entry.file_name().to_str() {
                Some(name) => name.to_string(),
                None => continue,
            };

            // Look for SKILL.md in the subdirectory
            let skill_md = entry_path.join("SKILL.md");
            let content = if skill_md.is_file() {
                std::fs::read_to_string(&skill_md).unwrap_or_default()
            } else {
                // Also try lowercase skill.md
                let skill_md_lower = entry_path.join("skill.md");
                if skill_md_lower.is_file() {
                    std::fs::read_to_string(&skill_md_lower).unwrap_or_default()
                } else {
                    String::new()
                }
            };

            let has_reference_dir = entry_path.join("reference").is_dir();

            skills.push(SkillDirEntry {
                dir_name,
                content,
                has_reference_dir,
            });
        }

        skills.sort_by(|a, b| a.dir_name.cmp(&b.dir_name));
        Ok(skills)
    }
}
