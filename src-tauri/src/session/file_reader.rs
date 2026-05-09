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
///
/// `pub` so integration tests in `src-tauri/tests/` can use the SAME slug
/// logic when constructing fixture directories — closes the silent-drift
/// contract where a fixture-builder reimplementation could go out of sync
/// with production.
pub fn folder_to_project_dir_name(folder: &str) -> String {
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

/// Find the matching project directory inside the given Claude projects root
/// (case-insensitive slug match).
///
/// Pure function with explicit root parameter — the path-resolving wrapper
/// `find_project_dir` injects `~/.claude/projects/` from `dirs::home_dir()`.
/// Tests pass a tempdir-based root.
pub fn find_project_dir_in(claude_projects_root: &Path, folder: &str) -> Option<PathBuf> {
    if !claude_projects_root.is_dir() {
        return None;
    }

    let expected = folder_to_project_dir_name(folder).to_lowercase();

    let read_dir = std::fs::read_dir(claude_projects_root).ok()?;
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

/// Parse JSONL session content (already loaded into memory) and extract a summary.
///
/// Pure function: no I/O, no filesystem access. Tests can pass arbitrary
/// fixture strings without needing tempfiles. The path-based wrapper
/// `parse_session_jsonl` handles the read_to_string boundary.
///
/// **Precondition:** Caller is responsible for bounding `content` size —
/// this function allocates per-line and parses each as JSON. Production callers
/// read from disk, where session files are typically <10MB; if you call this
/// with untrusted/unbounded input, add a size guard upstream.
pub fn parse_session_jsonl_str(content: &str, session_id: &str) -> Option<ClaudeSessionSummary> {
    // Defense-in-depth: even if a public caller bypasses the path-based
    // wrapper's MAX_JSONL_SIZE_BYTES cap, this hard limit short-circuits
    // before we allocate a Vec<&str> spanning the whole content.
    if content.len() > PARSE_HARD_LIMIT_BYTES {
        log::warn!(
            "parse_session_jsonl_str: content exceeds hard limit ({} bytes > {} bytes), skipping session_id={}",
            content.len(),
            PARSE_HARD_LIMIT_BYTES,
            session_id
        );
        return None;
    }
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

/// Maximum size of a JSONL session file we are willing to load into memory.
/// 100 MiB (104,857,600 bytes) is roughly an order of magnitude above the
/// largest realistic session transcript Claude CLI produces; anything larger
/// is treated as corrupt-or-malicious and silently skipped to protect against
/// OOM. Note: this is mebibytes (1024²), not megabytes (10⁶).
const MAX_JSONL_SIZE_BYTES: u64 = 100 * 1024 * 1024;

/// Hard upper bound for `parse_session_jsonl_str` content, applied as
/// defense-in-depth even when callers bypass the path-based wrapper.
/// Set 2× the wrapper cap so legitimate edge cases (BOM, near-cap files
/// expanded by `read_to_string` UTF-8 decoding) still pass; truly absurd
/// inputs short-circuit before per-line allocation.
const PARSE_HARD_LIMIT_BYTES: usize = 200 * 1024 * 1024;

/// Parse a single JSONL session file and extract a summary.
///
/// Thin wrapper around `parse_session_jsonl_str` that handles the
/// `read_to_string` boundary AND enforces a size cap so the pure parser
/// never sees an unbounded allocation. Returns `None` on:
/// - file metadata unavailable (permission denied, missing)
/// - file size > `MAX_JSONL_SIZE_BYTES`
/// - read failure (mid-read I/O error, non-UTF8 content)
/// - empty content
fn parse_session_jsonl(path: &std::path::Path, session_id: &str) -> Option<ClaudeSessionSummary> {
    let metadata = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(e) => {
            log::warn!(
                "parse_session_jsonl: cannot stat {} ({}), skipping",
                path.display(),
                e
            );
            return None;
        }
    };
    if metadata.len() > MAX_JSONL_SIZE_BYTES {
        log::warn!(
            "Skipping oversized JSONL session file ({} bytes > {} bytes cap): {}",
            metadata.len(),
            MAX_JSONL_SIZE_BYTES,
            path.display()
        );
        return None;
    }
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            log::warn!(
                "parse_session_jsonl: read failed for {} ({}), skipping",
                path.display(),
                e
            );
            return None;
        }
    };
    parse_session_jsonl_str(&content, session_id)
}

/// Scan a project's Claude session history from the given Claude projects root.
///
/// Pure function with explicit `claude_projects_root` parameter — tests pass a
/// tempdir-based root, production calls `scan_sessions_for_project` which
/// resolves `~/.claude/projects/`. Returns sessions sorted DESC by `started_at`.
pub fn scan_sessions_for_project_in(
    claude_projects_root: &Path,
    folder: &str,
) -> Result<Vec<ClaudeSessionSummary>, ADPError> {
    let project_dir = match find_project_dir_in(claude_projects_root, folder) {
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

/// Snapshot all Claude session UUIDs currently visible for a project folder.
///
/// Inspects `~/.claude/projects/<slug>/` and returns the set of UUIDs found
/// via either layout the scanner recognises (nested `<uuid>/<uuid>.jsonl`,
/// flat `<uuid>.jsonl`).
///
/// Pure function with explicit `claude_projects_root` parameter so tests
/// can pass a tempdir-based root. Returns an EMPTY set (not an error) when
/// the project dir does not exist yet — that case happens on first-ever
/// Claude session for a folder and is not exceptional.
///
/// Used by the deterministic claude-id discovery path: snapshot BEFORE
/// `claude` spawn, snapshot again once the first output event arrives, then
/// `diff_uuid_snapshots` yields the new session's UUID without any started_at
/// heuristic matching.
pub fn snapshot_session_uuids_in(
    claude_projects_root: &Path,
    folder: &str,
) -> std::collections::HashSet<String> {
    let mut uuids = std::collections::HashSet::new();

    let project_dir = match find_project_dir_in(claude_projects_root, folder) {
        Some(dir) => dir,
        None => return uuids,
    };

    let read_dir = match std::fs::read_dir(&project_dir) {
        Ok(rd) => rd,
        Err(_) => return uuids,
    };

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
            if is_uuid_like(&name) {
                let jsonl_path = entry.path().join(format!("{}.jsonl", name));
                if jsonl_path.is_file() {
                    uuids.insert(name);
                }
            }
        } else if ft.is_file() && name.ends_with(".jsonl") {
            let session_id = name.trim_end_matches(".jsonl");
            if is_uuid_like(session_id) {
                uuids.insert(session_id.to_string());
            }
        }
    }

    uuids
}

/// Pure: return UUIDs present in `after` but not in `before`.
///
/// Companion to `snapshot_session_uuids_in`. The single new UUID is the
/// freshly-spawned Claude session — used by the deterministic discovery
/// path to replace the fragile started_at proximity heuristic.
pub fn diff_uuid_snapshots(
    before: &std::collections::HashSet<String>,
    after: &std::collections::HashSet<String>,
) -> Vec<String> {
    after.difference(before).cloned().collect()
}

/// Block the calling thread polling `~/.claude/projects/<slug>/` until a
/// brand-new session UUID appears (relative to `seen_uuids`) or `timeout`
/// elapses. Returns the new UUID or `None` on timeout.
///
/// Designed to be invoked from a background thread spawned RIGHT AFTER
/// `claude` is spawned: pass the snapshot taken BEFORE the spawn as
/// `seen_uuids`, then the first new UUID we observe IS the spawned
/// session — no started_at proximity matching needed.
///
/// **Synchronous on purpose**: avoids a `tokio` feature-bump
/// (`rt` is the only enabled feature at this commit) and keeps the
/// blocking nature explicit at the call site.
pub fn wait_for_new_session_uuid(
    claude_projects_root: &Path,
    folder: &str,
    seen_uuids: &std::collections::HashSet<String>,
    timeout: std::time::Duration,
    poll_interval: std::time::Duration,
) -> Option<String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let current = snapshot_session_uuids_in(claude_projects_root, folder);
        if let Some(new_id) = current.difference(seen_uuids).next() {
            return Some(new_id.clone());
        }
        if std::time::Instant::now() >= deadline {
            return None;
        }
        std::thread::sleep(poll_interval);
    }
}

/// Scan a project's Claude session history from `~/.claude/projects/`.
///
/// Production wrapper around `scan_sessions_for_project_in` that resolves the
/// home directory at call time. Returns an empty Vec if the home directory
/// cannot be determined.
fn scan_sessions_for_project(folder: &str) -> Result<Vec<ClaudeSessionSummary>, ADPError> {
    let claude_projects_root = match dirs::home_dir() {
        Some(home) => home.join(".claude").join("projects"),
        None => return Ok(Vec::new()),
    };
    scan_sessions_for_project_in(&claude_projects_root, folder)
}

/// Move a Claude CLI session to the OS trash.
///
/// Handles both layouts the scanner recognises:
/// - Directory layout: `<slug>/<uuid>/` (with `<uuid>.jsonl` inside, plus
///   optional `subagents/`-folder — wandert komplett mit, weil wir auf
///   Folder-Ebene loeschen).
/// - Flat layout: `<slug>/<uuid>.jsonl` top-level.
///
/// Pure function with explicit `claude_projects_root` parameter — production
/// wrapper `delete_claude_session` injects `~/.claude/projects/`. Tests pass
/// a tempdir-based root.
///
/// **Idempotent**: Returns `Ok(())` when no slug-dir matches the folder OR
/// when the session is not found at either layout. The session-id is
/// UUID-validated up-front so a malformed id can never reach `trash::delete`
/// and never escape into another part of the user's home directory.
pub fn delete_claude_session_in(
    claude_projects_root: &Path,
    folder: &str,
    session_id: &str,
) -> Result<(), ADPError> {
    if !is_uuid_like(session_id) {
        return Err(ADPError::validation(format!(
            "Invalid session_id (must be UUID): '{}'",
            session_id
        )));
    }

    let slug_dir = match find_project_dir_in(claude_projects_root, folder) {
        Some(dir) => dir,
        None => return Ok(()), // No matching slug — idempotent
    };

    // Defense-in-depth: even though `is_uuid_like` rejects path separators
    // and `..`, run both candidate paths through the canonicalize-based
    // traversal guard so any future relaxation of UUID validation cannot
    // turn into an escape.
    let dir_target = safe_resolve_with_base(&slug_dir, session_id)?;
    let file_target = safe_resolve_with_base(&slug_dir, &format!("{}.jsonl", session_id))?;

    if dir_target.is_dir() {
        trash::delete(&dir_target).map_err(|e| {
            ADPError::file_io(format!("Failed to move session directory to trash: {}", e))
        })?;
        return Ok(());
    }

    if file_target.is_file() {
        trash::delete(&file_target).map_err(|e| {
            ADPError::file_io(format!("Failed to move session file to trash: {}", e))
        })?;
        return Ok(());
    }

    // Idempotent — session not found at either layout
    Ok(())
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

    /// Move a Claude CLI session to the OS trash. Removes the entire session
    /// directory (`<slug>/<uuid>/`, including any `subagents/` subfolder) or
    /// the flat `<slug>/<uuid>.jsonl` file when the session uses the older
    /// layout. Idempotent: returns `Ok(())` when nothing matches, so the
    /// frontend can call this even if the list is stale.
    #[tauri::command]
    pub async fn delete_claude_session(folder: String, session_id: String) -> Result<(), ADPError> {
        let claude_projects_root = match dirs::home_dir() {
            Some(home) => home.join(".claude").join("projects"),
            None => return Ok(()),
        };
        super::delete_claude_session_in(&claude_projects_root, &folder, &session_id)
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
            let dir_name = match entry.file_name().to_str() {
                Some(name) => name.to_string(),
                None => continue,
            };

            if entry_path.is_file() {
                // Simple .md skill file — read content directly
                if !dir_name.ends_with(".md") {
                    continue;
                }
                let content = std::fs::read_to_string(&entry_path).unwrap_or_default();
                skills.push(SkillDirEntry {
                    dir_name,
                    content,
                    has_reference_dir: false,
                });
                continue;
            }

            if !entry_path.is_dir() {
                continue;
            }

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

    /// Resolve the main working tree root for a folder that may be inside a git worktree.
    ///
    /// In a linked worktree, `session.folder` points to the worktree path. CLAUDE.md
    /// should be read from the main working tree so the user always sees the project's
    /// canonical config file, not a branch-specific (possibly outdated or missing) copy.
    ///
    /// Uses `git worktree list --porcelain` — the first `worktree <path>` line is
    /// always the main working tree, regardless of where the command is run from.
    /// Falls back to the original folder on any error (non-git dirs, no git installed, etc.).
    #[tauri::command]
    pub async fn resolve_project_root(folder: String) -> Result<String, ADPError> {
        match crate::github::commands::run_command(
            &folder,
            "git",
            &["worktree", "list", "--porcelain"],
        ) {
            Ok(output) => {
                for line in output.lines() {
                    if let Some(path) = line.strip_prefix("worktree ") {
                        return Ok(path.to_string());
                    }
                }
                Ok(folder)
            }
            // Not a git repo or git not available — silently fall back to the original path
            Err(_) => Ok(folder),
        }
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

    // --- Wave 0 sanity: pure-function early-return paths ---

    #[test]
    fn test_scan_sessions_for_project_in_returns_empty_for_nonexistent_root() {
        // Locks the early-return contract: when the projects-root does not exist,
        // the pure function returns Ok(empty Vec) — never an error. The Tauri
        // command relies on this so a missing ~/.claude/ on a fresh install
        // surfaces as "no history" instead of a startup error.
        let nonexistent = std::path::Path::new("/this/path/does/not/exist/anywhere");
        let result = scan_sessions_for_project_in(nonexistent, "any-folder");
        assert!(matches!(result, Ok(ref v) if v.is_empty()));
    }

    #[test]
    fn test_find_project_dir_in_returns_none_for_nonexistent_root() {
        let nonexistent = std::path::Path::new("/this/path/does/not/exist/anywhere");
        let result = find_project_dir_in(nonexistent, "any-folder");
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_session_jsonl_str_returns_none_for_empty_content() {
        assert!(parse_session_jsonl_str("", "uuid-xyz").is_none());
    }

    // --- delete_claude_session_in tests ---
    //
    // Tests the pure variant that takes an explicit `claude_projects_root`.
    // Negative-paths (UUID-validation, idempotency on missing root/slug/session)
    // never invoke `trash::delete` and therefore pass even in environments
    // without a Recycle Bin. The three positive-path tests below DO call
    // `trash::delete` against a tempdir-rooted fixture; they assert only that
    // the source path is gone afterwards (not that anything lands in the trash),
    // which holds across Windows / Linux / macOS implementations.

    /// Canonical UUID-shaped string used by the delete tests. Matches the
    /// `is_uuid_like` heuristic (36 chars, hex + 4 dashes).
    const DELETE_TEST_UUID: &str = "12345678-90ab-cdef-1234-567890abcdef";

    #[test]
    fn test_delete_claude_session_in_rejects_non_uuid() {
        let tmp = setup_temp_dir();
        let result = delete_claude_session_in(tmp.path(), "any-folder", "not-a-uuid");
        assert!(result.is_err());
        assert!(
            result.unwrap_err().message.contains("Invalid session_id"),
            "expected validation error for non-uuid"
        );
    }

    #[test]
    fn test_delete_claude_session_in_rejects_traversal_in_session_id() {
        // Even a syntactically-not-a-UUID id with `..` must be rejected at
        // the validation gate, never reaching `safe_resolve_with_base`.
        let tmp = setup_temp_dir();
        let result = delete_claude_session_in(tmp.path(), "any-folder", "../../etc/passwd");
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("Invalid session_id"));
    }

    #[test]
    fn test_delete_claude_session_in_returns_ok_for_nonexistent_root() {
        // Mirrors the scanner contract: a missing ~/.claude/projects/ on
        // a fresh install must NOT surface as an error.
        let nonexistent = std::path::Path::new("/this/path/does/not/exist/anywhere");
        let result = delete_claude_session_in(nonexistent, "any-folder", DELETE_TEST_UUID);
        assert!(result.is_ok());
    }

    #[test]
    fn test_delete_claude_session_in_returns_ok_for_missing_slug() {
        let tmp = setup_temp_dir();
        // Root exists, slug-dir for the project does NOT — idempotent Ok
        let result = delete_claude_session_in(tmp.path(), "C:/Some/Project", DELETE_TEST_UUID);
        assert!(result.is_ok());
    }

    #[test]
    fn test_delete_claude_session_in_returns_ok_for_missing_session() {
        let tmp = setup_temp_dir();
        let folder = "C:/Some/Project";
        let slug_dir = tmp.path().join(folder_to_project_dir_name(folder));
        fs::create_dir_all(&slug_dir).unwrap();
        // Slug exists, session does not — idempotent Ok
        let result = delete_claude_session_in(tmp.path(), folder, DELETE_TEST_UUID);
        assert!(result.is_ok());
    }

    #[test]
    fn test_delete_claude_session_in_removes_directory_layout() {
        let tmp = setup_temp_dir();
        let folder = "C:/Some/Project";
        let slug_dir = tmp.path().join(folder_to_project_dir_name(folder));
        let session_dir = slug_dir.join(DELETE_TEST_UUID);
        fs::create_dir_all(&session_dir).unwrap();
        let jsonl_path = session_dir.join(format!("{}.jsonl", DELETE_TEST_UUID));
        fs::write(&jsonl_path, "{}").unwrap();

        let result = delete_claude_session_in(tmp.path(), folder, DELETE_TEST_UUID);
        assert!(result.is_ok(), "delete failed: {:?}", result);
        assert!(
            !session_dir.exists(),
            "session directory must be gone from source after trash"
        );
    }

    #[test]
    fn test_delete_claude_session_in_removes_flat_layout() {
        let tmp = setup_temp_dir();
        let folder = "C:/Some/Project";
        let slug_dir = tmp.path().join(folder_to_project_dir_name(folder));
        fs::create_dir_all(&slug_dir).unwrap();
        let jsonl_path = slug_dir.join(format!("{}.jsonl", DELETE_TEST_UUID));
        fs::write(&jsonl_path, "{}").unwrap();

        let result = delete_claude_session_in(tmp.path(), folder, DELETE_TEST_UUID);
        assert!(result.is_ok(), "delete failed: {:?}", result);
        assert!(
            !jsonl_path.exists(),
            "flat-layout session file must be gone from source after trash"
        );
    }

    #[test]
    fn test_delete_claude_session_in_takes_subagents_with_dir() {
        // Closes the contract: deleting on folder-level moves the entire
        // session-dir, including a `subagents/`-subfolder. Without this,
        // partial cleanup would leave orphan agent-meta files behind.
        let tmp = setup_temp_dir();
        let folder = "C:/Some/Project";
        let slug_dir = tmp.path().join(folder_to_project_dir_name(folder));
        let session_dir = slug_dir.join(DELETE_TEST_UUID);
        let subagents_dir = session_dir.join("subagents");
        fs::create_dir_all(&subagents_dir).unwrap();
        fs::write(
            session_dir.join(format!("{}.jsonl", DELETE_TEST_UUID)),
            "{}",
        )
        .unwrap();
        fs::write(subagents_dir.join("agent-1.meta.json"), "{}").unwrap();
        fs::write(subagents_dir.join("agent-2.meta.json"), "{}").unwrap();

        let result = delete_claude_session_in(tmp.path(), folder, DELETE_TEST_UUID);
        assert!(result.is_ok(), "delete failed: {:?}", result);
        assert!(
            !session_dir.exists(),
            "session directory and its subagents/ subfolder must be gone"
        );
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

    // ========================================================================
    // UUID-snapshot tests — feed `snapshot_session_uuids_in` and
    // `diff_uuid_snapshots` for the deterministic claude-id discovery path
    // (replaces the started_at proximity heuristic).
    // ========================================================================

    use std::collections::HashSet;

    fn write_flat_jsonl(project_dir: &Path, uuid: &str) {
        std::fs::write(project_dir.join(format!("{}.jsonl", uuid)), b"{}").unwrap();
    }

    fn write_nested_jsonl(project_dir: &Path, uuid: &str) {
        let dir = project_dir.join(uuid);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(format!("{}.jsonl", uuid)), b"{}").unwrap();
    }

    #[test]
    fn diff_uuid_snapshots_returns_only_new_entries() {
        let before: HashSet<String> = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".to_string()]
            .into_iter()
            .collect();
        let after: HashSet<String> = [
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".to_string(),
            "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb".to_string(),
        ]
        .into_iter()
        .collect();

        let new_uuids = diff_uuid_snapshots(&before, &after);
        assert_eq!(
            new_uuids,
            vec!["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb".to_string()]
        );
    }

    #[test]
    fn diff_uuid_snapshots_empty_when_no_new_entries() {
        let same: HashSet<String> = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".to_string()]
            .into_iter()
            .collect();
        assert!(diff_uuid_snapshots(&same, &same).is_empty());
    }

    #[test]
    fn diff_uuid_snapshots_returns_multiple_when_multiple_new() {
        let before: HashSet<String> = HashSet::new();
        let after: HashSet<String> = [
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".to_string(),
            "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb".to_string(),
        ]
        .into_iter()
        .collect();

        let mut new_uuids = diff_uuid_snapshots(&before, &after);
        new_uuids.sort();
        assert_eq!(
            new_uuids,
            vec![
                "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa".to_string(),
                "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb".to_string(),
            ]
        );
    }

    #[test]
    fn snapshot_uuids_returns_empty_when_project_dir_missing() {
        let tmp = setup_temp_dir();
        let root = tmp.path();
        // No project dir created — snapshot must be empty, not error.
        let result = snapshot_session_uuids_in(root, "C:\\does\\not\\exist");
        assert!(result.is_empty());
    }

    #[test]
    fn snapshot_uuids_picks_up_flat_layout() {
        let tmp = setup_temp_dir();
        let root = tmp.path();
        let folder = "C:\\Projects\\agentic-dashboard";
        let project_dir = root.join(folder_to_project_dir_name(folder));
        std::fs::create_dir_all(&project_dir).unwrap();

        write_flat_jsonl(&project_dir, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

        let snap = snapshot_session_uuids_in(root, folder);
        assert!(snap.contains("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
        assert_eq!(snap.len(), 1);
    }

    #[test]
    fn snapshot_uuids_picks_up_nested_layout() {
        let tmp = setup_temp_dir();
        let root = tmp.path();
        let folder = "C:\\Projects\\agentic-dashboard";
        let project_dir = root.join(folder_to_project_dir_name(folder));
        std::fs::create_dir_all(&project_dir).unwrap();

        write_nested_jsonl(&project_dir, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

        let snap = snapshot_session_uuids_in(root, folder);
        assert!(snap.contains("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"));
        assert_eq!(snap.len(), 1);
    }

    #[test]
    fn snapshot_uuids_ignores_non_uuid_directories_and_files() {
        let tmp = setup_temp_dir();
        let root = tmp.path();
        let folder = "C:\\Projects\\agentic-dashboard";
        let project_dir = root.join(folder_to_project_dir_name(folder));
        std::fs::create_dir_all(&project_dir).unwrap();

        // Garbage that the scanner must NOT mistake for a session.
        std::fs::write(project_dir.join("README.md"), b"hi").unwrap();
        std::fs::create_dir_all(project_dir.join("memory")).unwrap();
        std::fs::write(project_dir.join("not-a-uuid.jsonl"), b"{}").unwrap();

        write_flat_jsonl(&project_dir, "cccccccc-cccc-cccc-cccc-cccccccccccc");

        let snap = snapshot_session_uuids_in(root, folder);
        assert_eq!(snap.len(), 1, "only the real UUID file must be counted");
        assert!(snap.contains("cccccccc-cccc-cccc-cccc-cccccccccccc"));
    }

    #[test]
    fn snapshot_diff_simulates_post_spawn_appearance() {
        // Simulates the production sequence: snapshot → spawn claude →
        // wait → snapshot → diff. The single new UUID is the spawned
        // session's id. This is the contract that replaces
        // pickBestHistoryMatch's started_at heuristic.
        let tmp = setup_temp_dir();
        let root = tmp.path();
        let folder = "C:\\Projects\\agentic-dashboard";
        let project_dir = root.join(folder_to_project_dir_name(folder));
        std::fs::create_dir_all(&project_dir).unwrap();

        // Pre-existing transcript from an earlier session.
        write_flat_jsonl(&project_dir, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        let before = snapshot_session_uuids_in(root, folder);

        // Simulate Claude writing the new session's jsonl.
        write_flat_jsonl(&project_dir, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        let after = snapshot_session_uuids_in(root, folder);

        let new_uuids = diff_uuid_snapshots(&before, &after);
        assert_eq!(
            new_uuids,
            vec!["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb".to_string()]
        );
    }
}
