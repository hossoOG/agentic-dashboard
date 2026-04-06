// src-tauri/src/session/file_reader.rs

use crate::error::ADPError;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Shared path-traversal protection: resolve `sub` inside `base` and verify
/// the result stays within `base` after canonicalization.
fn safe_resolve_with_base(base: &Path, sub: &str) -> Result<PathBuf, ADPError> {
    let target = base.join(sub);

    let canon_base = base.canonicalize().map_err(|e| {
        ADPError::file_io(format!(
            "Failed to resolve base '{}': {}",
            base.display(),
            e
        ))
    })?;

    if target.exists() {
        let canon_target = target
            .canonicalize()
            .map_err(|e| ADPError::file_io(format!("Failed to resolve target '{}': {}", sub, e)))?;

        if !canon_target.starts_with(&canon_base) {
            return Err(ADPError::validation(format!(
                "Path traversal detected: target is outside {}",
                base.display()
            )));
        }
        Ok(canon_target)
    } else {
        // File doesn't exist yet — canonicalize parent + append filename
        // to prevent symlink attacks (TOCTOU) on write operations
        if let Some(parent) = target.parent() {
            if parent.exists() {
                let canon_parent = parent.canonicalize().map_err(|e| {
                    ADPError::file_io(format!(
                        "Failed to resolve parent '{}': {}",
                        parent.display(),
                        e
                    ))
                })?;
                if !canon_parent.starts_with(&canon_base) {
                    return Err(ADPError::validation(format!(
                        "Path traversal detected: target is outside {}",
                        base.display()
                    )));
                }
                let file_name = target
                    .file_name()
                    .ok_or_else(|| ADPError::validation("Invalid file name"))?;
                Ok(canon_parent.join(file_name))
            } else {
                // Parent doesn't exist either — validate by collapsing components
                let mut resolved = canon_base.clone();
                for component in std::path::Path::new(sub).components() {
                    match component {
                        std::path::Component::Normal(c) => resolved.push(c),
                        std::path::Component::ParentDir => {
                            resolved.pop();
                            if !resolved.starts_with(&canon_base) {
                                return Err(ADPError::validation(format!(
                                    "Path traversal detected: target is outside {}",
                                    base.display()
                                )));
                            }
                        }
                        std::path::Component::CurDir => {}
                        _ => {
                            return Err(ADPError::validation("Invalid path component"));
                        }
                    }
                }
                if !resolved.starts_with(&canon_base) {
                    return Err(ADPError::validation(format!(
                        "Path traversal detected: target is outside {}",
                        base.display()
                    )));
                }
                Ok(resolved)
            }
        } else {
            Err(ADPError::validation("Invalid path: no parent directory"))
        }
    }
}

/// Canonicalize and validate that resolved_path is inside base_folder.
fn safe_resolve(folder: &str, relative_path: &str) -> Result<PathBuf, ADPError> {
    let base = PathBuf::from(folder);
    if !base.is_dir() {
        return Err(ADPError::file_io(format!(
            "Failed to resolve path: folder does not exist: {}",
            folder
        )));
    }
    safe_resolve_with_base(&base, relative_path)
}

/// Resolve a path inside ~/.claude/ with traversal protection.
fn safe_resolve_user_claude(relative_path: &str) -> Result<PathBuf, ADPError> {
    // Reject traversal attempts even before checking directory existence
    if relative_path.contains("..") {
        return Err(ADPError::validation(
            "Path traversal detected: '..' not allowed in relative path",
        ));
    }

    let home =
        dirs::home_dir().ok_or_else(|| ADPError::file_io("Cannot determine home directory"))?;
    let claude_dir = home.join(".claude");

    if !claude_dir.is_dir() {
        // ~/.claude/ doesn't exist — return non-existent path, caller handles empty result
        // Still validate: only allow simple relative paths (no traversal)
        return Ok(claude_dir.join(relative_path));
    }
    safe_resolve_with_base(&claude_dir, relative_path)
}

/// Entry for a skill directory containing a SKILL.md file.
#[derive(serde::Serialize)]
pub struct SkillDirEntry {
    pub dir_name: String,
    pub content: String,
    pub has_reference_dir: bool,
}

// ============================================================================
// Claude Session History Scanner
// ============================================================================

/// Summary of a single Claude CLI session, extracted from JSONL files.
#[derive(Serialize, Clone)]
pub struct ClaudeSessionSummary {
    pub session_id: String,
    pub title: String,
    pub started_at: String,
    pub ended_at: String,
    pub model: String,
    pub user_turns: u32,
    pub total_messages: u32,
    pub subagent_count: u32,
    pub git_branch: String,
    pub cwd: String,
}

/// Convert a folder path to the Claude projects directory name.
/// E.g. `C:\Projects\agentic-dashboard` → `C--Projects-agentic-dashboard`
fn folder_to_project_dir_name(folder: &str) -> String {
    folder
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

/// Find the matching project directory inside ~/.claude/projects/ (case-insensitive).
fn find_project_dir(folder: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let projects_dir = home.join(".claude").join("projects");
    if !projects_dir.is_dir() {
        return None;
    }

    let expected = folder_to_project_dir_name(folder).to_lowercase();

    let read_dir = std::fs::read_dir(&projects_dir).ok()?;
    for entry in read_dir.flatten() {
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            if let Some(name) = entry.file_name().to_str() {
                if name.to_lowercase() == expected {
                    return Some(entry.path());
                }
            }
        }
    }
    None
}

/// Check if a string looks like a UUID (simple heuristic).
fn is_uuid_like(s: &str) -> bool {
    s.len() == 36
        && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
        && s.matches('-').count() == 4
}

/// Parse a single JSONL session file and extract a summary.
fn parse_session_jsonl(path: &std::path::Path, session_id: &str) -> Option<ClaudeSessionSummary> {
    let content = std::fs::read_to_string(path).ok()?;
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return None;
    }

    let mut title = String::new();
    let mut started_at = String::new();
    let mut ended_at = String::new();
    let mut model = String::new();
    let mut user_turns: u32 = 0;
    let mut total_messages: u32 = 0;
    let mut git_branch = String::new();
    let mut cwd = String::new();

    for line in &lines {
        let val: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        total_messages += 1;

        // Extract timestamp from any message
        if let Some(ts) = val.get("timestamp").and_then(|v| v.as_str()) {
            if started_at.is_empty() {
                started_at = ts.to_string();
            }
            ended_at = ts.to_string();
        }

        // Extract git branch and cwd from first message that has them
        if git_branch.is_empty() {
            if let Some(branch) = val.get("gitBranch").and_then(|v| v.as_str()) {
                git_branch = branch.to_string();
            }
        }
        if cwd.is_empty() {
            if let Some(c) = val.get("cwd").and_then(|v| v.as_str()) {
                cwd = c.to_string();
            }
        }

        let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let is_sidechain = val
            .get("isSidechain")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let is_meta = val.get("isMeta").and_then(|v| v.as_bool()).unwrap_or(false);

        // Count user turns (non-sidechain, non-meta user messages that aren't tool results)
        if msg_type == "user" && !is_sidechain && !is_meta {
            if let Some(content) = val.get("message").and_then(|m| m.get("content")) {
                match content {
                    Value::String(s) => {
                        user_turns += 1;
                        // Use first user prompt as title
                        if title.is_empty() {
                            let truncated: String = s.chars().take(120).collect();
                            title = truncated.replace('\n', " ").trim().to_string();
                        }
                    }
                    Value::Array(arr) => {
                        // Tool result arrays don't count as user turns
                        let is_tool_result = arr.iter().any(|item| {
                            item.get("type")
                                .and_then(|t| t.as_str())
                                .map(|t| t == "tool_result")
                                .unwrap_or(false)
                        });
                        if !is_tool_result {
                            user_turns += 1;
                        }
                    }
                    _ => {}
                }
            }
        }

        // Extract model from assistant messages
        if msg_type == "assistant" && model.is_empty() {
            if let Some(m) = val
                .get("message")
                .and_then(|m| m.get("model"))
                .and_then(|v| v.as_str())
            {
                model = m.to_string();
            }
        }
    }

    // Skip sessions with no real content
    if user_turns == 0 && title.is_empty() {
        return None;
    }

    if title.is_empty() {
        title = "(Kein Prompt)".to_string();
    }

    Some(ClaudeSessionSummary {
        session_id: session_id.to_string(),
        title,
        started_at,
        ended_at,
        model,
        user_turns,
        total_messages,
        subagent_count: 0, // Will be set by caller
        git_branch,
        cwd,
    })
}

/// Scan a project's Claude session history from ~/.claude/projects/.
fn scan_sessions_for_project(folder: &str) -> Result<Vec<ClaudeSessionSummary>, ADPError> {
    let project_dir = match find_project_dir(folder) {
        Some(dir) => dir,
        None => return Ok(Vec::new()),
    };

    let mut sessions: Vec<ClaudeSessionSummary> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();

    let read_dir = std::fs::read_dir(&project_dir)
        .map_err(|e| ADPError::file_io(format!("Failed to read project directory: {}", e)))?;

    for entry in read_dir.flatten() {
        let name = match entry.file_name().to_str() {
            Some(n) => n.to_string(),
            None => continue,
        };

        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        if ft.is_dir() {
            // Check for [uuid]/[uuid].jsonl
            if is_uuid_like(&name) && !seen_ids.contains(&name) {
                let jsonl_path = entry.path().join(format!("{}.jsonl", name));
                if jsonl_path.is_file() {
                    // Count subagents
                    let subagent_count = entry
                        .path()
                        .join("subagents")
                        .read_dir()
                        .map(|rd| {
                            rd.flatten()
                                .filter(|e| {
                                    e.file_name()
                                        .to_str()
                                        .map(|n| n.ends_with(".meta.json"))
                                        .unwrap_or(false)
                                })
                                .count() as u32
                        })
                        .unwrap_or(0);

                    if let Some(mut summary) = parse_session_jsonl(&jsonl_path, &name) {
                        summary.subagent_count = subagent_count;
                        sessions.push(summary);
                        seen_ids.insert(name);
                    }
                }
            }
        } else if ft.is_file() && name.ends_with(".jsonl") {
            // Top-level [uuid].jsonl
            let session_id = name.trim_end_matches(".jsonl");
            if is_uuid_like(session_id) && !seen_ids.contains(session_id) {
                if let Some(summary) = parse_session_jsonl(&entry.path(), session_id) {
                    sessions.push(summary);
                    seen_ids.insert(session_id.to_string());
                }
            }
        }
    }

    // Sort by started_at descending (newest first)
    sessions.sort_by(|a, b| b.started_at.cmp(&a.started_at));

    Ok(sessions)
}

// Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
#[allow(clippy::module_inception)]
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn read_project_file(
        folder: String,
        relative_path: String,
    ) -> Result<String, ADPError> {
        let path = safe_resolve(&folder, &relative_path)?;

        if !path.exists() || !path.is_file() {
            return Ok(String::new());
        }

        std::fs::read_to_string(&path).map_err(|e| {
            ADPError::file_io(format!("Failed to read file '{}': {}", relative_path, e))
        })
    }

    /// Max file size for write operations (10 MB)
    const MAX_WRITE_SIZE: usize = 10 * 1024 * 1024;

    #[tauri::command]
    pub async fn write_project_file(
        folder: String,
        relative_path: String,
        content: String,
    ) -> Result<(), ADPError> {
        // Size limit to prevent OOM / disk exhaustion
        if content.len() > MAX_WRITE_SIZE {
            return Err(ADPError::validation(format!(
                "File too large: {}MB exceeds {}MB limit",
                content.len() / (1024 * 1024),
                MAX_WRITE_SIZE / (1024 * 1024)
            )));
        }

        // Reject null bytes (binary content)
        if content.contains('\0') {
            return Err(ADPError::validation(
                "File contains null bytes — binary files are not supported",
            ));
        }

        let path = safe_resolve(&folder, &relative_path)?;

        if path.is_dir() {
            return Err(ADPError::validation(format!(
                "Cannot write to directory: {}",
                relative_path
            )));
        }

        if let Some(parent) = path.parent() {
            if !parent.exists() {
                log::warn!("Creating directory for write: {}", parent.display());
                std::fs::create_dir_all(parent)
                    .map_err(|e| ADPError::file_io(format!("Failed to create directory: {}", e)))?;
            }
        }

        std::fs::write(&path, content).map_err(|e| {
            ADPError::file_io(format!("Failed to write file '{}': {}", relative_path, e))
        })
    }

    #[tauri::command]
    pub async fn list_project_dir(
        folder: String,
        relative_path: String,
    ) -> Result<Vec<String>, ADPError> {
        let path = safe_resolve(&folder, &relative_path)?;

        if !path.exists() || !path.is_dir() {
            return Ok(Vec::new());
        }

        let mut entries = Vec::new();
        let read_dir = std::fs::read_dir(&path).map_err(|e| {
            ADPError::file_io(format!(
                "Failed to read directory '{}': {}",
                relative_path, e
            ))
        })?;

        for entry in read_dir.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                entries.push(name.to_string());
            }
        }

        entries.sort();
        Ok(entries)
    }

    /// Scan Claude CLI session history from ~/.claude/projects/ for a given project folder.
    #[tauri::command]
    pub async fn scan_claude_sessions(
        folder: String,
    ) -> Result<Vec<ClaudeSessionSummary>, ADPError> {
        scan_sessions_for_project(&folder)
    }

    /// Read a file from the user's ~/.claude/ directory.
    #[tauri::command]
    pub async fn read_user_claude_file(relative_path: String) -> Result<String, ADPError> {
        let path = safe_resolve_user_claude(&relative_path)?;

        if !path.exists() || !path.is_file() {
            return Ok(String::new());
        }

        std::fs::read_to_string(&path)
            .map_err(|e| ADPError::file_io(format!("Failed to read file: {}", e)))
    }

    /// List entries in a subdirectory under ~/.claude/.
    /// Returns file/dir names sorted alphabetically.
    #[tauri::command]
    pub async fn list_user_claude_dir(relative_path: String) -> Result<Vec<String>, ADPError> {
        let path = safe_resolve_user_claude(&relative_path)?;

        if !path.exists() || !path.is_dir() {
            return Ok(Vec::new());
        }

        let mut entries = Vec::new();
        let read_dir = std::fs::read_dir(&path).map_err(|e| {
            ADPError::file_io(format!(
                "Failed to read directory '{}': {}",
                relative_path, e
            ))
        })?;

        for entry in read_dir.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                entries.push(name.to_string());
            }
        }

        entries.sort();
        Ok(entries)
    }

    /// List all skill directories under .claude/skills/, returning each skill's
    /// SKILL.md content and whether it has a reference/ subdirectory.
    /// This batches N+1 IPC calls into a single round-trip.
    #[tauri::command]
    pub async fn list_skill_dirs(folder: String) -> Result<Vec<SkillDirEntry>, ADPError> {
        let path = safe_resolve(&folder, ".claude/skills")?;

        if !path.exists() || !path.is_dir() {
            return Ok(Vec::new());
        }

        let mut skills = Vec::new();
        let read_dir = std::fs::read_dir(&path)
            .map_err(|e| ADPError::file_io(format!("Failed to read skills directory: {}", e)))?;

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

// ============================================================================
// Tests — Path Traversal Prevention
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("Failed to create temp dir")
    }

    // --- safe_resolve_with_base tests ---

    #[test]
    fn test_safe_resolve_normal_existing_file() {
        let tmp = setup_temp_dir();
        let base = tmp.path();
        fs::write(base.join("hello.txt"), "content").unwrap();

        let result = safe_resolve_with_base(base, "hello.txt");
        assert!(result.is_ok());
        assert!(result.unwrap().ends_with("hello.txt"));
    }

    #[test]
    fn test_safe_resolve_blocks_parent_traversal() {
        let tmp = setup_temp_dir();
        let base = tmp.path();

        let result = safe_resolve_with_base(base, "../../../etc/passwd");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.message.contains("Path traversal detected"));
    }

    #[test]
    fn test_safe_resolve_blocks_dotdot_in_middle() {
        let tmp = setup_temp_dir();
        let base = tmp.path();
        fs::create_dir_all(base.join("subdir")).unwrap();

        let result = safe_resolve_with_base(base, "subdir/../../etc/passwd");
        assert!(result.is_err());
    }

    #[test]
    fn test_safe_resolve_allows_nonexistent_file() {
        let tmp = setup_temp_dir();
        let base = tmp.path();

        let result = safe_resolve_with_base(base, "new-file.txt");
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert!(resolved.starts_with(base.canonicalize().unwrap()));
    }

    #[test]
    fn test_safe_resolve_allows_nested_nonexistent() {
        let tmp = setup_temp_dir();
        let base = tmp.path();

        let result = safe_resolve_with_base(base, "new-dir/new-file.txt");
        assert!(result.is_ok());
    }

    #[test]
    fn test_safe_resolve_blocks_traversal_in_nonexistent_path() {
        let tmp = setup_temp_dir();
        let base = tmp.path();

        let result = safe_resolve_with_base(base, "foo/../../secret.txt");
        assert!(result.is_err());
    }

    #[test]
    fn test_safe_resolve_curdir_is_harmless() {
        let tmp = setup_temp_dir();
        let base = tmp.path();
        fs::write(base.join("test.txt"), "data").unwrap();

        let result = safe_resolve_with_base(base, "./test.txt");
        assert!(result.is_ok());
    }

    // --- safe_resolve_user_claude tests ---

    #[test]
    fn test_user_claude_blocks_traversal() {
        let result = safe_resolve_user_claude("../../etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("traversal"));
    }

    #[test]
    fn test_user_claude_allows_simple_path() {
        let result = safe_resolve_user_claude("settings.json");
        // Should succeed (even if ~/.claude doesn't exist — returns non-existent path)
        assert!(result.is_ok());
    }

    // ========================================================================
    // Tauri Command Integration Tests (Issue #91 / QA-16)
    // ========================================================================
    //
    // Tests the 3 public Tauri commands via `super::commands::*`:
    //   - read_project_file
    //   - write_project_file
    //   - list_project_dir
    //
    // Uses tauri::async_runtime::block_on (Option A) to drive the async fns
    // without requiring a tokio dev-dependency.
    mod command_tests {
        use super::super::commands::{list_project_dir, read_project_file, write_project_file};
        use std::fs;
        use tempfile::TempDir;

        fn setup() -> TempDir {
            TempDir::new().expect("create tempdir")
        }

        fn base_of(tmp: &TempDir) -> String {
            tmp.path().to_string_lossy().to_string()
        }

        // --- read_project_file (6 tests) ---

        #[test]
        fn test_read_project_file_roundtrip() {
            let tmp = setup();
            fs::write(tmp.path().join("test.md"), "hello world").expect("write fixture");

            let result = tauri::async_runtime::block_on(read_project_file(
                base_of(&tmp),
                "test.md".to_string(),
            ));

            assert_eq!(result.expect("read should succeed"), "hello world");
        }

        #[test]
        fn test_read_project_file_nonexistent_returns_empty() {
            // Contract: missing file → Ok("") (callers depend on this to handle
            // missing CLAUDE.md, hooks.json etc. without error plumbing).
            let tmp = setup();

            let result = tauri::async_runtime::block_on(read_project_file(
                base_of(&tmp),
                "does-not-exist.md".to_string(),
            ));

            assert_eq!(result.expect("missing file must yield Ok"), "");
        }

        #[test]
        fn test_read_project_file_blocks_traversal() {
            let tmp = setup();

            let result = tauri::async_runtime::block_on(read_project_file(
                base_of(&tmp),
                "../../etc/passwd".to_string(),
            ));

            let err = result.unwrap_err();
            assert!(
                err.message.contains("Path traversal detected"),
                "expected traversal error, got: {}",
                err.message
            );
        }

        #[test]
        fn test_read_project_file_utf8_bom() {
            let tmp = setup();
            let bom_content = "\u{FEFF}hello";
            fs::write(tmp.path().join("bom.txt"), bom_content).expect("write fixture");

            let result = tauri::async_runtime::block_on(read_project_file(
                base_of(&tmp),
                "bom.txt".to_string(),
            ));

            let out = result.expect("read should succeed");
            assert_eq!(out, bom_content);
            assert!(out.starts_with('\u{FEFF}'), "BOM must be preserved");
        }

        #[test]
        fn test_read_project_file_utf8_multibyte() {
            let tmp = setup();
            let content = "Schöne Grüße 🚀";
            fs::write(tmp.path().join("utf8.txt"), content).expect("write fixture");

            let result = tauri::async_runtime::block_on(read_project_file(
                base_of(&tmp),
                "utf8.txt".to_string(),
            ));

            assert_eq!(result.expect("read should succeed"), content);
        }

        #[test]
        fn test_read_project_file_invalid_utf8_fails_gracefully() {
            let tmp = setup();
            // Invalid UTF-8: lone high bytes that don't form valid sequences.
            let raw: [u8; 4] = [0xFF, 0xFE, 0x00, 0xFF];
            fs::write(tmp.path().join("binary.bin"), raw).expect("write fixture");

            let result = tauri::async_runtime::block_on(read_project_file(
                base_of(&tmp),
                "binary.bin".to_string(),
            ));

            // Must return Err (not panic). read_to_string fails on non-UTF-8.
            let err = result.unwrap_err();
            assert!(
                err.message.contains("Failed to read file"),
                "expected structured read error, got: {}",
                err.message
            );
        }

        // --- write_project_file (6 tests) ---

        #[test]
        fn test_write_project_file_creates_parent_dirs() {
            let tmp = setup();

            let result = tauri::async_runtime::block_on(write_project_file(
                base_of(&tmp),
                "new/nested/deep/file.md".to_string(),
                "content".to_string(),
            ));

            result.expect("write should succeed");
            let target = tmp.path().join("new/nested/deep/file.md");
            assert!(target.is_file(), "target file must exist");
            assert_eq!(
                fs::read_to_string(&target).expect("read back written file"),
                "content"
            );
        }

        #[test]
        fn test_write_project_file_overwrites_existing() {
            let tmp = setup();
            fs::write(tmp.path().join("file.md"), "first").expect("write fixture");

            let result = tauri::async_runtime::block_on(write_project_file(
                base_of(&tmp),
                "file.md".to_string(),
                "second".to_string(),
            ));

            result.expect("overwrite should succeed");
            assert_eq!(
                fs::read_to_string(tmp.path().join("file.md")).expect("read back overwritten file"),
                "second"
            );
            // No backup file created
            assert!(!tmp.path().join("file.md.bak").exists());
        }

        #[test]
        fn test_write_project_file_rejects_oversized() {
            let tmp = setup();
            // MAX_WRITE_SIZE = 10 MB → 10 * 1024 * 1024 + 1 byte
            let oversized = "a".repeat(10 * 1024 * 1024 + 1);

            let result = tauri::async_runtime::block_on(write_project_file(
                base_of(&tmp),
                "big.txt".to_string(),
                oversized,
            ));

            let err = result.unwrap_err();
            assert!(
                err.message.contains("File too large"),
                "expected size-limit error, got: {}",
                err.message
            );
            assert!(
                !tmp.path().join("big.txt").exists(),
                "oversized file must not be written"
            );
        }

        #[test]
        fn test_write_project_file_rejects_null_bytes() {
            let tmp = setup();

            let result = tauri::async_runtime::block_on(write_project_file(
                base_of(&tmp),
                "null.txt".to_string(),
                "hello\0world".to_string(),
            ));

            let err = result.unwrap_err();
            assert!(
                err.message.contains("null bytes"),
                "expected null-byte rejection, got: {}",
                err.message
            );
            assert!(
                !tmp.path().join("null.txt").exists(),
                "file with null bytes must not be written"
            );
        }

        #[test]
        fn test_write_project_file_rejects_directory_target() {
            let tmp = setup();
            fs::create_dir(tmp.path().join("somedir")).expect("create dir");

            let result = tauri::async_runtime::block_on(write_project_file(
                base_of(&tmp),
                "somedir".to_string(),
                "content".to_string(),
            ));

            let err = result.unwrap_err();
            assert!(
                err.message.contains("Cannot write to directory"),
                "expected directory-target rejection, got: {}",
                err.message
            );
        }

        #[test]
        fn test_write_project_file_blocks_traversal() {
            let tmp = setup();
            // Outer directory (parent of tmp) - we verify nothing escapes into here.
            let parent_dir = tmp
                .path()
                .parent()
                .expect("tempdir has parent")
                .to_path_buf();
            // Unique filename per run to avoid false positives from previous
            // runs that left state behind (Windows AV-lock race).
            let unique = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let escape_name = format!("escape-test-qa16-{unique}.txt");
            let escape_target = parent_dir.join(&escape_name);

            let result = tauri::async_runtime::block_on(write_project_file(
                base_of(&tmp),
                format!("../{escape_name}"),
                "pwned".to_string(),
            ));

            let err = result.unwrap_err();
            assert!(
                err.message.contains("Path traversal detected"),
                "expected traversal error, got: {}",
                err.message
            );
            assert!(
                !escape_target.exists(),
                "file must NOT have been written outside tmp: {}",
                escape_target.display()
            );
        }

        #[test]
        fn test_write_project_file_blocks_absolute_windows_path() {
            // Absolute path as relative_path arg: PathBuf::join replaces base
            // when rhs is absolute. safe_resolve_with_base canonicalizes and
            // verifies starts_with(base) — must reject.
            let tmp = setup();

            // Target must NOT resolve inside tmp. Use a path guaranteed outside.
            let absolute_rhs = if cfg!(windows) {
                "C:\\Windows\\System32\\drivers\\etc\\hosts"
            } else {
                "/etc/passwd"
            };

            let result = tauri::async_runtime::block_on(write_project_file(
                base_of(&tmp),
                absolute_rhs.to_string(),
                "pwned".to_string(),
            ));

            // Must fail — either as traversal, or as write error, but NEVER succeed.
            assert!(
                result.is_err(),
                "absolute path as relative_path must be rejected, got: {result:?}"
            );
        }

        #[test]
        fn test_write_project_file_rejects_null_byte_in_path() {
            // Null byte in relative_path: Rust's OS layer rejects via InvalidInput.
            // Test locks that contract — no panic, structured error, no file written.
            let tmp = setup();

            let result = tauri::async_runtime::block_on(write_project_file(
                base_of(&tmp),
                "foo\0bar.txt".to_string(),
                "content".to_string(),
            ));

            assert!(
                result.is_err(),
                "null-byte in relative_path must be rejected, got: {result:?}"
            );
            // No file of any variation should exist
            assert!(
                tmp.path().read_dir().expect("read tmp").next().is_none(),
                "tmp dir must remain empty after null-byte rejection"
            );
        }

        // --- list_project_dir (3 tests) ---

        #[test]
        fn test_list_project_dir_sorted() {
            let tmp = setup();
            fs::write(tmp.path().join("c.txt"), "").expect("write c");
            fs::write(tmp.path().join("a.txt"), "").expect("write a");
            fs::write(tmp.path().join("b.txt"), "").expect("write b");

            let result =
                tauri::async_runtime::block_on(list_project_dir(base_of(&tmp), ".".to_string()));

            let entries = result.expect("list should succeed");
            assert_eq!(entries, vec!["a.txt", "b.txt", "c.txt"]);
        }

        #[test]
        fn test_list_project_dir_nonexistent_returns_empty() {
            // Contract: missing dir → Ok(vec![]) (callers depend on this for
            // optional directories like .claude/skills).
            let tmp = setup();

            let result = tauri::async_runtime::block_on(list_project_dir(
                base_of(&tmp),
                "no-such-subdir".to_string(),
            ));

            assert_eq!(
                result.expect("missing dir must yield Ok"),
                Vec::<String>::new()
            );
        }

        #[test]
        fn test_list_project_dir_blocks_traversal() {
            let tmp = setup();

            let result =
                tauri::async_runtime::block_on(list_project_dir(base_of(&tmp), "../".to_string()));

            let err = result.unwrap_err();
            assert!(
                err.message.contains("Path traversal detected"),
                "expected traversal error, got: {}",
                err.message
            );
        }
    }
}
