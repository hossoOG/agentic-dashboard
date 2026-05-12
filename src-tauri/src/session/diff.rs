// src-tauri/src/session/diff.rs
//
// Session-Diff: per-session git snapshot mechanism + diff computation.
//
// Snapshot model (siehe `tasks/2026-05-12-session-diff-window-design.md`):
// 1. Beim Session-Start (in `create_session`) wird ein gc-sicherer Snapshot
//    angelegt — entweder via `git stash create` (Working-Tree mit eingefrorenem
//    Stand) oder als Fallback der aktuelle HEAD. Der Snapshot landet als
//    Ref unter `refs/agentic-explorer/session-<id>`.
// 2. Beim Session-Close wird der Ref geloescht (`git update-ref -d`).
// 3. `get_session_diff` vergleicht den Snapshot mit dem aktuellen Working-Tree
//    und liefert ein deterministisches `SessionDiff`-Struct.
//
// Performance-Budget: `MAX_FILE_BYTES` (500 KB pro File) + `MAX_TOTAL_BYTES`
// (5 MB Total). Oversize-Files werden ohne Content geliefert, das Top-Total-Limit
// triggert `truncated=true`.

use crate::error::{ADPError, ADPErrorCode};
use crate::util::{silent_command, timed_output, DEFAULT_COMMAND_TIMEOUT};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Instant;

/// Per-file Performance-Budget: ueberschreitet ein einzelnes File diese Groesse,
/// wird `oversize=true` gesetzt und beide Contents leer gelassen — der User
/// sieht den Status und kann externen Tools nachgehen.
pub const MAX_FILE_BYTES: u64 = 500 * 1024;

/// Diff-weites Performance-Budget. Total bezieht sich auf Summe aller
/// `old_content` + `new_content`. Wird das Limit erreicht, wird der Rest
/// der Files mit `oversize=true` angereichert und `truncated=true` gesetzt.
pub const MAX_TOTAL_BYTES: usize = 5 * 1024 * 1024;

/// Status eines Files im Diff (an Git `--name-status` orientiert).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Modified,
    Added,
    Deleted,
    Renamed,
    Untracked,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    pub path: String,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_content: Option<String>,
    /// True wenn File ueber `MAX_FILE_BYTES` liegt oder Total-Budget
    /// erschoepft ist. Frontend zeigt dann nur den Status, keinen Inhalt.
    pub oversize: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDiff {
    pub session_id: String,
    pub snapshot_commit: String,
    pub snapshot_at: DateTime<Utc>,
    pub computed_at: DateTime<Utc>,
    pub compute_ms: u64,
    pub files: Vec<DiffFile>,
    /// True wenn Total-Performance-Budget (5 MB) erreicht wurde.
    pub truncated: bool,
}

/// Result eines erfolgreichen Session-Start-Snapshots — gespeichert
/// auf der Session-Struktur und im Diff-Window angezeigt.
#[derive(Debug, Clone)]
pub struct SnapshotResult {
    pub commit: String,
    pub created_at: DateTime<Utc>,
}

/// Prueft, ob der angegebene Pfad innerhalb eines Git-Working-Tree liegt.
/// False bei nicht-Repos, bare-Repos und I/O-Fehlern.
pub fn is_git_repo(folder: &Path) -> bool {
    let mut cmd = silent_command("git");
    cmd.arg("-C")
        .arg(folder)
        .arg("rev-parse")
        .arg("--is-inside-work-tree");
    match timed_output(cmd, DEFAULT_COMMAND_TIMEOUT) {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            stdout == "true"
        }
        _ => false,
    }
}

/// Legt fuer `session_id` einen Snapshot-Ref unter
/// `refs/agentic-explorer/session-<id>` an.
///
/// Ablauf:
/// 1. `git stash create` — liefert einen Commit, der Working-Tree + Index
///    eingefroren enthaelt. Bei cleanem Tree leerer Output.
/// 2. Fallback auf `git rev-parse HEAD`, wenn `stash create` nichts produziert
///    hat oder fehlgeschlagen ist (Empty-Repo erkennt das auch).
/// 3. `git update-ref` registriert den Commit gc-sicher.
///
/// Die `session_id` MUSS bereits validiert sein (alphanumerisch + `-`/`_`).
pub fn create_session_snapshot(
    folder: &Path,
    session_id: &str,
) -> Result<SnapshotResult, ADPError> {
    debug_assert!(
        session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
        "create_session_snapshot: session_id contained invalid characters"
    );

    // Step 1: stash create — produziert einen Commit auch ohne stash push.
    let mut stash_cmd = silent_command("git");
    stash_cmd.arg("-C").arg(folder).arg("stash").arg("create");
    let stash_commit = match timed_output(stash_cmd, DEFAULT_COMMAND_TIMEOUT) {
        Ok(out) if out.status.success() => {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        }
        _ => None,
    };

    // Step 2: Fallback auf HEAD-Commit bei cleanem Tree, Merge-State o.ae.
    let commit = match stash_commit {
        Some(c) => c,
        None => {
            let mut head_cmd = silent_command("git");
            head_cmd.arg("-C").arg(folder).arg("rev-parse").arg("HEAD");
            let out = timed_output(head_cmd, DEFAULT_COMMAND_TIMEOUT).map_err(|e| {
                ADPError::command_failed(format!("git rev-parse HEAD failed: {}", e))
            })?;
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
                return Err(ADPError::new(
                    ADPErrorCode::CommandExecutionFailed,
                    format!("git rev-parse HEAD failed: {}", stderr.trim()),
                ));
            }
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
    };

    if commit.is_empty() {
        return Err(ADPError::new(
            ADPErrorCode::CommandExecutionFailed,
            "Snapshot creation produced empty commit hash",
        ));
    }

    // Step 3: gc-sichere Persistenz via update-ref.
    let ref_name = ref_name_for_session(session_id);
    let mut update_cmd = silent_command("git");
    update_cmd
        .arg("-C")
        .arg(folder)
        .arg("update-ref")
        .arg(&ref_name)
        .arg(&commit);
    let out = timed_output(update_cmd, DEFAULT_COMMAND_TIMEOUT)
        .map_err(|e| ADPError::command_failed(format!("git update-ref failed: {}", e)))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
        return Err(ADPError::new(
            ADPErrorCode::CommandExecutionFailed,
            format!("git update-ref failed: {}", stderr.trim()),
        ));
    }

    Ok(SnapshotResult {
        commit,
        created_at: Utc::now(),
    })
}

/// Loescht den Snapshot-Ref fuer eine Session. Fehlt der Ref bereits
/// (z. B. weil das Repo manuell geputzt wurde), wird `Ok(())` zurueckgegeben
/// — wir wollen Session-Close nicht haerter machen als noetig.
pub fn delete_session_snapshot(folder: &Path, session_id: &str) -> Result<(), ADPError> {
    let ref_name = ref_name_for_session(session_id);
    let mut cmd = silent_command("git");
    cmd.arg("-C")
        .arg(folder)
        .arg("update-ref")
        .arg("-d")
        .arg(&ref_name);
    match timed_output(cmd, DEFAULT_COMMAND_TIMEOUT) {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            log::warn!(
                "delete_session_snapshot: ref {} could not be removed: {}",
                ref_name,
                stderr.trim()
            );
            Ok(())
        }
        Err(e) => {
            log::warn!("delete_session_snapshot: {}", e);
            Ok(())
        }
    }
}

/// Berechnet das `SessionDiff` zwischen Snapshot und aktuellem Working-Tree.
pub fn compute_session_diff(
    folder: &Path,
    session_id: &str,
    snapshot_commit: &str,
    snapshot_at: DateTime<Utc>,
) -> Result<SessionDiff, ADPError> {
    let started = Instant::now();

    // 1) `git diff --name-status` — Status pro File.
    let mut status_cmd = silent_command("git");
    status_cmd
        .arg("-C")
        .arg(folder)
        .arg("diff")
        .arg("--name-status")
        .arg(snapshot_commit)
        .arg("--")
        .arg(".");
    let status_out = timed_output(status_cmd, DEFAULT_COMMAND_TIMEOUT)
        .map_err(|e| ADPError::command_failed(format!("git diff --name-status failed: {}", e)))?;
    if !status_out.status.success() {
        let stderr = String::from_utf8_lossy(&status_out.stderr).into_owned();
        return Err(ADPError::new(
            ADPErrorCode::CommandExecutionFailed,
            format!("git diff --name-status failed: {}", stderr.trim()),
        ));
    }
    let mut entries = parse_name_status(&String::from_utf8_lossy(&status_out.stdout));

    // 2) Untracked Files dazumischen — `git diff` ignoriert sie.
    let mut untracked_cmd = silent_command("git");
    untracked_cmd
        .arg("-C")
        .arg(folder)
        .arg("ls-files")
        .arg("--others")
        .arg("--exclude-standard");
    if let Ok(out) = timed_output(untracked_cmd, DEFAULT_COMMAND_TIMEOUT) {
        if out.status.success() {
            for line in String::from_utf8_lossy(&out.stdout).lines() {
                let path = line.trim();
                if path.is_empty() {
                    continue;
                }
                if entries.iter().any(|(p, _)| p == path) {
                    continue;
                }
                entries.push((path.to_string(), FileStatus::Untracked));
            }
        }
    }

    // 3) `git diff --numstat` — Additionen/Deletionen pro File.
    let mut numstat_cmd = silent_command("git");
    numstat_cmd
        .arg("-C")
        .arg(folder)
        .arg("diff")
        .arg("--numstat")
        .arg(snapshot_commit)
        .arg("--")
        .arg(".");
    let numstats: std::collections::HashMap<String, (u32, u32)> =
        match timed_output(numstat_cmd, DEFAULT_COMMAND_TIMEOUT) {
            Ok(out) if out.status.success() => parse_numstat(&String::from_utf8_lossy(&out.stdout)),
            _ => std::collections::HashMap::new(),
        };

    // 4) Pro File Contents nachladen, dabei Budget-Tracking.
    let mut files: Vec<DiffFile> = Vec::with_capacity(entries.len());
    let mut total_bytes: usize = 0;
    let mut truncated = false;

    for (path, status) in entries {
        let (additions, deletions) = numstats.get(&path).copied().unwrap_or((0, 0));
        let mut file = DiffFile {
            path: path.clone(),
            status: status.clone(),
            additions,
            deletions,
            old_content: None,
            new_content: None,
            oversize: false,
        };

        if truncated {
            // Total-Budget bereits ueberschritten — Rest oversize markieren.
            file.oversize = true;
            files.push(file);
            continue;
        }

        // old_content (aus Snapshot lesen, ausser bei Added/Untracked).
        let want_old = !matches!(status, FileStatus::Added | FileStatus::Untracked);
        let want_new = !matches!(status, FileStatus::Deleted);

        let old_size = if want_old {
            file_size_in_commit(folder, snapshot_commit, &path).unwrap_or(0)
        } else {
            0
        };
        let new_size = if want_new {
            let p = folder.join(&path);
            std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };
        let largest = old_size.max(new_size);

        if largest > MAX_FILE_BYTES {
            file.oversize = true;
            files.push(file);
            continue;
        }

        if want_old {
            file.old_content = read_file_from_commit(folder, snapshot_commit, &path).ok();
        }
        if want_new {
            let p = folder.join(&path);
            file.new_content = std::fs::read_to_string(&p).ok();
        }

        let consumed = file.old_content.as_ref().map(|s| s.len()).unwrap_or(0)
            + file.new_content.as_ref().map(|s| s.len()).unwrap_or(0);

        if total_bytes.saturating_add(consumed) > MAX_TOTAL_BYTES {
            file.old_content = None;
            file.new_content = None;
            file.oversize = true;
            truncated = true;
        } else {
            total_bytes = total_bytes.saturating_add(consumed);
        }

        files.push(file);
    }

    let compute_ms = started.elapsed().as_millis().min(u64::MAX as u128) as u64;

    Ok(SessionDiff {
        session_id: session_id.to_string(),
        snapshot_commit: snapshot_commit.to_string(),
        snapshot_at,
        computed_at: Utc::now(),
        compute_ms,
        files,
        truncated,
    })
}

fn ref_name_for_session(session_id: &str) -> String {
    format!("refs/agentic-explorer/session-{}", session_id)
}

fn parse_name_status(out: &str) -> Vec<(String, FileStatus)> {
    let mut result = Vec::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let Some(status_str) = parts.next() else {
            continue;
        };
        let status_char = status_str.chars().next().unwrap_or('M');
        let status = match status_char {
            'A' => FileStatus::Added,
            'D' => FileStatus::Deleted,
            'R' => FileStatus::Renamed,
            _ => FileStatus::Modified,
        };

        // Renamed-Zeilen haben drei Tab-getrennte Felder (`R100<TAB>old<TAB>new`).
        // Wir zeigen den neuen Pfad.
        let path = match status {
            FileStatus::Renamed => parts.nth(1).unwrap_or("").to_string(),
            _ => parts.next().unwrap_or("").to_string(),
        };

        if path.is_empty() {
            continue;
        }
        result.push((path, status));
    }
    result
}

fn parse_numstat(out: &str) -> std::collections::HashMap<String, (u32, u32)> {
    let mut map = std::collections::HashMap::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }
        let additions: u32 = parts[0].parse().unwrap_or(0);
        let deletions: u32 = parts[1].parse().unwrap_or(0);
        // Binaere Files liefern "-\t-\tpath", parse() failt → 0/0 ist ok.
        let path = parts[2].to_string();
        map.insert(path, (additions, deletions));
    }
    map
}

fn file_size_in_commit(folder: &Path, commit: &str, path: &str) -> Result<u64, ADPError> {
    let mut cmd = silent_command("git");
    cmd.arg("-C")
        .arg(folder)
        .arg("cat-file")
        .arg("-s")
        .arg(format!("{}:{}", commit, path));
    let out = timed_output(cmd, DEFAULT_COMMAND_TIMEOUT)
        .map_err(|e| ADPError::command_failed(format!("git cat-file -s failed: {}", e)))?;
    if !out.status.success() {
        return Ok(0);
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok(s.parse::<u64>().unwrap_or(0))
}

fn read_file_from_commit(folder: &Path, commit: &str, path: &str) -> Result<String, ADPError> {
    let mut cmd = silent_command("git");
    cmd.arg("-C")
        .arg(folder)
        .arg("show")
        .arg(format!("{}:{}", commit, path));
    let out = timed_output(cmd, DEFAULT_COMMAND_TIMEOUT)
        .map_err(|e| ADPError::command_failed(format!("git show failed: {}", e)))?;
    if !out.status.success() {
        return Err(ADPError::new(
            ADPErrorCode::FileIoError,
            format!("git show {}:{} not found", commit, path),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_name_status_handles_basic_statuses() {
        let out = "M\tsrc/foo.rs\nA\tsrc/new.rs\nD\tsrc/old.rs\n";
        let parsed = parse_name_status(out);
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0], ("src/foo.rs".to_string(), FileStatus::Modified));
        assert_eq!(parsed[1], ("src/new.rs".to_string(), FileStatus::Added));
        assert_eq!(parsed[2], ("src/old.rs".to_string(), FileStatus::Deleted));
    }

    #[test]
    fn parse_name_status_handles_renamed() {
        // Renamed-Zeilen aus `git diff --name-status` haben 3 Felder.
        let out = "R100\told/path.rs\tnew/path.rs\n";
        let parsed = parse_name_status(out);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0], ("new/path.rs".to_string(), FileStatus::Renamed));
    }

    #[test]
    fn parse_numstat_skips_binary_and_empty() {
        let out = "5\t2\tfoo.rs\n-\t-\tbinary.png\n\n";
        let map = parse_numstat(out);
        assert_eq!(map.get("foo.rs"), Some(&(5u32, 2u32)));
        // Binary-File: parse() failt -> 0/0
        assert_eq!(map.get("binary.png"), Some(&(0u32, 0u32)));
    }

    #[test]
    fn ref_name_for_session_uses_namespace() {
        assert_eq!(
            ref_name_for_session("abc-123"),
            "refs/agentic-explorer/session-abc-123"
        );
    }
}
