use crate::error::ADPError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// ── Types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum LibraryItemType {
    Skill,
    AgentProfile,
    Hook,
    Template,
    Prompt,
    #[default]
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryItemMeta {
    pub id: String,
    pub name: String,
    pub item_type: LibraryItemType,
    pub tags: Vec<String>,
    pub description: String,
    pub created: String,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryItemFull {
    pub meta: LibraryItemMeta,
    pub content: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LibraryIndex {
    pub items: Vec<LibraryItemMeta>,
    pub usage: HashMap<String, Vec<String>>,
    pub built_at: u64,
}

// ── Helpers ────────────────────────────────────────────────────────────

fn library_dir() -> Result<PathBuf, ADPError> {
    let home =
        dirs::home_dir().ok_or_else(|| ADPError::file_io("Cannot determine home directory"))?;
    let dir = home.join(".claude").join("library").join("items");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| ADPError::file_io(format!("Failed to create library dir: {}", e)))?;
    }
    Ok(dir)
}

fn index_path() -> Result<PathBuf, ADPError> {
    let home =
        dirs::home_dir().ok_or_else(|| ADPError::file_io("Cannot determine home directory"))?;
    let dir = home.join(".claude").join("library");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| ADPError::file_io(format!("Failed to create library dir: {}", e)))?;
    }
    Ok(dir.join("index.json"))
}

fn read_index() -> Result<LibraryIndex, ADPError> {
    let path = index_path()?;
    if !path.exists() {
        return Ok(LibraryIndex::default());
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| ADPError::file_io(format!("Failed to read index: {}", e)))?;
    serde_json::from_str(&data)
        .map_err(|e| ADPError::parse(format!("Failed to parse index: {}", e)))
}

fn write_index(index: &LibraryIndex) -> Result<(), ADPError> {
    let path = index_path()?;
    let data = serde_json::to_string_pretty(index)
        .map_err(|e| ADPError::parse(format!("Failed to serialize index: {}", e)))?;
    std::fs::write(&path, data)
        .map_err(|e| ADPError::file_io(format!("Failed to write index: {}", e)))
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

/// Parse YAML-style frontmatter from `---` delimited block.
/// Handles simple key: value pairs and tags: [a, b, c] arrays.
fn parse_frontmatter(content: &str, file_name: &str) -> LibraryItemMeta {
    let id = file_name
        .strip_suffix(".md")
        .unwrap_or(file_name)
        .to_string();

    let mut meta = LibraryItemMeta {
        id: id.clone(),
        name: id.clone(),
        item_type: LibraryItemType::default(),
        tags: Vec::new(),
        description: String::new(),
        created: String::new(),
        file_name: file_name.to_string(),
    };

    // Find frontmatter between first two "---" lines
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() || lines[0].trim() != "---" {
        return meta;
    }

    let end = lines[1..]
        .iter()
        .position(|l| l.trim() == "---")
        .map(|p| p + 1);

    let Some(end) = end else {
        return meta;
    };

    for line in &lines[1..end] {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();

        match key {
            "name" => meta.name = value.to_string(),
            "type" => {
                meta.item_type = match value {
                    "skill" => LibraryItemType::Skill,
                    "agent-profile" => LibraryItemType::AgentProfile,
                    "hook" => LibraryItemType::Hook,
                    "template" => LibraryItemType::Template,
                    "prompt" => LibraryItemType::Prompt,
                    _ => LibraryItemType::Other,
                };
            }
            "description" => meta.description = value.to_string(),
            "created" => meta.created = value.to_string(),
            "tags" => {
                // Parse [tag1, tag2, tag3] format
                let inner = value.trim_start_matches('[').trim_end_matches(']');
                meta.tags = inner
                    .split(',')
                    .map(|t| t.trim().to_string())
                    .filter(|t| !t.is_empty())
                    .collect();
            }
            _ => {}
        }
    }

    meta
}

/// Extract body content after frontmatter.
fn extract_body(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() || lines[0].trim() != "---" {
        return content.to_string();
    }

    let end = lines[1..]
        .iter()
        .position(|l| l.trim() == "---")
        .map(|p| p + 1);

    match end {
        Some(end) => {
            let body_start = end + 1;
            if body_start < lines.len() {
                lines[body_start..].join("\n").trim_start().to_string()
            } else {
                String::new()
            }
        }
        None => content.to_string(),
    }
}

/// Scan all .md files in library/items/ and build a fresh index,
/// preserving existing usage data.
fn build_index_from_disk() -> Result<LibraryIndex, ADPError> {
    let dir = library_dir()?;
    let existing = read_index().unwrap_or_default();

    let mut items = Vec::new();

    if dir.exists() && dir.is_dir() {
        let entries = std::fs::read_dir(&dir)
            .map_err(|e| ADPError::file_io(format!("Failed to read library dir: {}", e)))?;

        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let file_name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            let content = match std::fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            items.push(parse_frontmatter(&content, &file_name));
        }
    }

    items.sort_by_key(|i| i.name.to_lowercase());

    Ok(LibraryIndex {
        items,
        usage: existing.usage,
        built_at: now_epoch(),
    })
}

// ── Tauri Commands ─────────────────────────────────────────────────────

#[allow(clippy::module_inception)]
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn list_library_items() -> Result<Vec<LibraryItemMeta>, ADPError> {
        let index = read_index()?;
        if index.items.is_empty() && index.built_at == 0 {
            // First run or empty index — try to build from disk
            let fresh = build_index_from_disk()?;
            if !fresh.items.is_empty() {
                write_index(&fresh)?;
                return Ok(fresh.items);
            }
        }
        Ok(index.items)
    }

    #[tauri::command]
    pub async fn read_library_item(id: String) -> Result<LibraryItemFull, ADPError> {
        crate::validation::validate_library_id(&id)?;
        let dir = library_dir()?;
        let file_name = format!("{}.md", id);
        let path = dir.join(&file_name);

        if !path.exists() || !path.is_file() {
            return Err(ADPError::file_io(format!("Library item not found: {}", id)));
        }

        let content = std::fs::read_to_string(&path)
            .map_err(|e| ADPError::file_io(format!("Failed to read item: {}", e)))?;

        let meta = parse_frontmatter(&content, &file_name);
        let body = extract_body(&content);

        Ok(LibraryItemFull {
            meta,
            content,
            body,
        })
    }

    #[tauri::command]
    pub async fn save_library_item(
        id: String,
        content: String,
    ) -> Result<LibraryItemMeta, ADPError> {
        crate::validation::validate_library_id(&id)?;
        let dir = library_dir()?;
        let file_name = format!("{}.md", id);
        let path = dir.join(&file_name);

        std::fs::write(&path, &content)
            .map_err(|e| ADPError::file_io(format!("Failed to write item: {}", e)))?;

        let meta = parse_frontmatter(&content, &file_name);

        // Update index
        let mut index = read_index()?;
        if let Some(existing) = index.items.iter_mut().find(|i| i.id == id) {
            *existing = meta.clone();
        } else {
            index.items.push(meta.clone());
            index.items.sort_by_key(|i| i.name.to_lowercase());
        }
        index.built_at = now_epoch();
        write_index(&index)?;

        Ok(meta)
    }

    #[tauri::command]
    pub async fn delete_library_item(id: String) -> Result<(), ADPError> {
        crate::validation::validate_library_id(&id)?;
        let dir = library_dir()?;
        let path = dir.join(format!("{}.md", id));

        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| ADPError::file_io(format!("Failed to delete item: {}", e)))?;
        }

        let mut index = read_index()?;
        index.items.retain(|i| i.id != id);
        index.usage.remove(&id);
        index.built_at = now_epoch();
        write_index(&index)?;

        Ok(())
    }

    #[tauri::command]
    pub async fn rebuild_library_index() -> Result<LibraryIndex, ADPError> {
        let index = build_index_from_disk()?;
        write_index(&index)?;
        Ok(index)
    }

    #[tauri::command]
    pub async fn attach_library_item(id: String, project_path: String) -> Result<(), ADPError> {
        crate::validation::validate_library_id(&id)?;
        let normalized = normalize_path(&project_path);
        let mut index = read_index()?;

        let entry = index.usage.entry(id).or_default();
        if !entry.contains(&normalized) {
            entry.push(normalized);
        }

        write_index(&index)?;
        Ok(())
    }

    #[tauri::command]
    pub async fn detach_library_item(id: String, project_path: String) -> Result<(), ADPError> {
        crate::validation::validate_library_id(&id)?;
        let normalized = normalize_path(&project_path);
        let mut index = read_index()?;

        if let Some(entry) = index.usage.get_mut(&id) {
            entry.retain(|p| p != &normalized);
            if entry.is_empty() {
                index.usage.remove(&id);
            }
        }

        write_index(&index)?;
        Ok(())
    }

    #[tauri::command]
    pub async fn get_library_item_path(id: String) -> Result<String, ADPError> {
        crate::validation::validate_library_id(&id)?;
        let dir = library_dir()?;
        let path = dir.join(format!("{}.md", id));
        Ok(path.to_string_lossy().to_string())
    }
}
