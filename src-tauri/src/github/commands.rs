use crate::error::{ADPError, ADPErrorCode};
use crate::util::silent_command;
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct GitCommitInfo {
    pub hash: String,
    pub message: String,
    pub date: String,
}

#[derive(Serialize, Clone)]
pub struct GitInfo {
    pub branch: String,
    pub last_commit: Option<GitCommitInfo>,
    pub remote_url: String,
}

#[derive(Serialize, Clone)]
pub struct GithubPR {
    pub number: u64,
    pub title: String,
    pub author: String,
    pub status: String,
    pub url: String,
}

#[derive(Serialize, Clone)]
pub struct GithubIssue {
    pub number: u64,
    pub title: String,
    pub labels: Vec<String>,
    pub assignee: String,
    pub url: String,
}

#[derive(Serialize, Clone)]
pub struct KanbanLabel {
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone)]
pub struct IssueComment {
    pub author: String,
    pub body: String,
    pub created_at: String,
}

#[derive(Serialize, Clone)]
pub struct IssueDetail {
    pub number: u64,
    pub title: String,
    pub body: String,
    pub state: String,
    pub author: String,
    pub created_at: String,
    pub updated_at: String,
    pub closed_at: String,
    pub labels: Vec<KanbanLabel>,
    pub assignees: Vec<String>,
    pub milestone: Option<String>,
    pub url: String,
    pub comments: Vec<IssueComment>,
}

#[derive(Serialize, Clone)]
pub struct CheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: String,
}

#[derive(Serialize, Clone)]
pub struct LinkedPR {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub checks: Vec<CheckRun>,
}

/// Returns the directory to use as `cwd` for subprocess calls.
/// Falls back to `std::env::temp_dir()` when no folder is provided —
/// `gh api graphql` and `gh project` commands are not git-directory-sensitive.
pub(crate) fn effective_cwd(folder: Option<&str>) -> std::path::PathBuf {
    folder
        .map(std::path::PathBuf::from)
        .filter(|p| p.exists())
        .unwrap_or_else(std::env::temp_dir)
}

pub(crate) fn run_command(folder: &str, program: &str, args: &[&str]) -> Result<String, ADPError> {
    let mut cmd = silent_command(program);
    cmd.args(args).current_dir(folder);
    let output = crate::util::timed_output(cmd, crate::util::DEFAULT_COMMAND_TIMEOUT)?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(ADPError::command_failed(format!(
            "{} failed: {}",
            program, stderr
        )))
    }
}

pub(crate) fn is_command_available(cmd_name: &str) -> bool {
    let check_cmd = if cfg!(windows) { "where" } else { "which" };
    let mut cmd = silent_command(check_cmd);
    cmd.arg(cmd_name);
    crate::util::timed_output(cmd, std::time::Duration::from_secs(5))
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Validates a `owner/name` repository slug to prevent shell injection.
/// Allows alphanumeric characters, hyphens, underscores, dots, and exactly one slash.
pub(crate) fn validate_repo(repo: &str) -> Result<(), ADPError> {
    let valid_chars = repo
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '/');
    let single_slash = repo.matches('/').count() == 1;
    let no_leading_trailing = !repo.starts_with('/') && !repo.ends_with('/');
    if valid_chars && single_slash && no_leading_trailing {
        Ok(())
    } else {
        Err(ADPError::validation(format!(
            "Invalid repository format '{}': expected owner/name",
            repo
        )))
    }
}

/// Extract label names from a GitHub JSON value containing a "labels" array.
fn parse_labels(value: &serde_json::Value) -> Vec<String> {
    value["labels"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|l| l["name"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// Extract all assignee logins from a GitHub JSON value containing an "assignees" array.
fn parse_assignees(value: &serde_json::Value) -> Vec<String> {
    value["assignees"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| a["login"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Extract the first assignee login from a GitHub JSON value.
fn parse_assignee(value: &serde_json::Value) -> String {
    value["assignees"]
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|a| a["login"].as_str())
        .unwrap_or("")
        .to_string()
}

/// Extract the milestone title from a GitHub JSON value, if present.
fn parse_milestone(value: &serde_json::Value) -> Option<String> {
    value["milestone"]["title"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(String::from)
}

// Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
#[allow(clippy::module_inception)]
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn get_git_info(folder: String) -> Result<GitInfo, ADPError> {
        let folder_path = std::path::Path::new(&folder);
        if !folder_path.join(".git").exists() {
            return Err(ADPError::validation("Not a git repository"));
        }

        let branch =
            run_command(&folder, "git", &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();

        let last_commit = run_command(&folder, "git", &["log", "-1", "--format=%H%n%s%n%ci"])
            .ok()
            .and_then(|output| {
                let lines: Vec<&str> = output.lines().collect();
                if lines.len() >= 3 {
                    Some(GitCommitInfo {
                        hash: lines[0][..7.min(lines[0].len())].to_string(),
                        message: lines[1].to_string(),
                        date: lines[2].to_string(),
                    })
                } else {
                    None
                }
            });

        let remote_url =
            run_command(&folder, "git", &["remote", "get-url", "origin"]).unwrap_or_default();

        Ok(GitInfo {
            branch,
            last_commit,
            remote_url,
        })
    }

    #[tauri::command]
    pub async fn get_github_prs(folder: String) -> Result<Vec<GithubPR>, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found. Install from https://cli.github.com",
            ));
        }

        let output = run_command(
            &folder,
            "gh",
            &[
                "pr",
                "list",
                "--state",
                "open",
                "--json",
                "number,title,author,reviewDecision,url",
                "--limit",
                "20",
            ],
        )?;

        if output.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: Vec<serde_json::Value> = serde_json::from_str(&output)
            .map_err(|e| ADPError::parse(format!("Failed to parse gh output: {}", e)))?;

        let prs = parsed
            .iter()
            .map(|pr| GithubPR {
                number: pr["number"].as_u64().unwrap_or(0),
                title: pr["title"].as_str().unwrap_or("").to_string(),
                author: pr["author"]["login"].as_str().unwrap_or("").to_string(),
                status: pr["reviewDecision"]
                    .as_str()
                    .unwrap_or("PENDING")
                    .to_string(),
                url: pr["url"].as_str().unwrap_or("").to_string(),
            })
            .collect();

        Ok(prs)
    }

    #[tauri::command]
    pub async fn get_github_issues(folder: String) -> Result<Vec<GithubIssue>, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found. Install from https://cli.github.com",
            ));
        }

        let output = run_command(
            &folder,
            "gh",
            &[
                "issue",
                "list",
                "--state",
                "open",
                "--json",
                "number,title,labels,assignees,url",
                "--limit",
                "20",
            ],
        )?;

        if output.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: Vec<serde_json::Value> = serde_json::from_str(&output)
            .map_err(|e| ADPError::parse(format!("Failed to parse gh output: {}", e)))?;

        let issues = parsed
            .iter()
            .map(|issue| GithubIssue {
                number: issue["number"].as_u64().unwrap_or(0),
                title: issue["title"].as_str().unwrap_or("").to_string(),
                labels: parse_labels(issue),
                assignee: parse_assignee(issue),
                url: issue["url"].as_str().unwrap_or("").to_string(),
            })
            .collect();

        Ok(issues)
    }

    /// Fetches full issue details including comments.
    ///
    /// `repo` (optional) specifies the repository as `owner/name`. When provided,
    /// `gh issue view --repo <repo>` is used — required for cross-repo issues in
    /// a global Project v2 board. When omitted, the gh CLI auto-detects the repo
    /// from the `folder` git remote (folder-mode behaviour).
    #[tauri::command]
    pub async fn get_issue_detail(
        folder: Option<String>,
        repo: Option<String>,
        number: u64,
    ) -> Result<IssueDetail, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found",
            ));
        }

        let cwd = effective_cwd(folder.as_deref());
        let cwd_str = cwd.to_string_lossy().to_string();

        if let Some(ref r) = repo {
            validate_repo(r)?;
        }

        let num_str = number.to_string();
        let json_fields =
            "number,title,body,state,author,createdAt,updatedAt,closedAt,labels,assignees,milestone,url,comments";
        let mut args = vec!["issue", "view", &num_str, "--json", json_fields];
        if let Some(ref r) = repo {
            args.extend_from_slice(&["--repo", r]);
        }

        let output = run_command(&cwd_str, "gh", &args)?;

        if output.is_empty() {
            return Err(ADPError::parse("Empty response from gh"));
        }

        let val: serde_json::Value = serde_json::from_str(&output)
            .map_err(|e| ADPError::parse(format!("Failed to parse gh output: {}", e)))?;

        let labels = val["labels"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|l| KanbanLabel {
                        name: l["name"].as_str().unwrap_or("").to_string(),
                        color: l["color"].as_str().unwrap_or("333333").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        let comments = val["comments"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|c| IssueComment {
                        author: c["author"]["login"].as_str().unwrap_or("").to_string(),
                        body: c["body"].as_str().unwrap_or("").to_string(),
                        created_at: c["createdAt"].as_str().unwrap_or("").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(IssueDetail {
            number: val["number"].as_u64().unwrap_or(number),
            title: val["title"].as_str().unwrap_or("").to_string(),
            body: val["body"].as_str().unwrap_or("").to_string(),
            state: val["state"].as_str().unwrap_or("OPEN").to_string(),
            author: val["author"]["login"].as_str().unwrap_or("").to_string(),
            created_at: val["createdAt"].as_str().unwrap_or("").to_string(),
            updated_at: val["updatedAt"].as_str().unwrap_or("").to_string(),
            closed_at: val["closedAt"].as_str().unwrap_or("").to_string(),
            labels,
            assignees: parse_assignees(&val),
            milestone: parse_milestone(&val),
            url: val["url"].as_str().unwrap_or("").to_string(),
            comments,
        })
    }

    /// Searches for PRs that reference this issue, including their CI check results.
    ///
    /// `repo` (optional) scopes the search to a specific repository (`owner/name`).
    /// Required when the issue belongs to a different repo than the current folder.
    #[tauri::command]
    pub async fn get_issue_checks(
        folder: Option<String>,
        repo: Option<String>,
        number: u64,
    ) -> Result<Vec<LinkedPR>, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found",
            ));
        }

        let cwd = effective_cwd(folder.as_deref());
        let cwd_str = cwd.to_string_lossy().to_string();

        if let Some(ref r) = repo {
            validate_repo(r)?;
        }

        // Search for PRs that reference this issue number
        let search_query = format!("#{}", number);
        let mut args = vec![
            "pr",
            "list",
            "--search",
            &search_query,
            "--state",
            "all",
            "--json",
            "number,title,state,url,statusCheckRollup",
            "--limit",
            "5",
        ];
        if let Some(ref r) = repo {
            args.extend_from_slice(&["--repo", r]);
        }

        let output = run_command(&cwd_str, "gh", &args)?;

        if output.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: Vec<serde_json::Value> = serde_json::from_str(&output)
            .map_err(|e| ADPError::parse(format!("Failed to parse gh output: {}", e)))?;

        let prs = parsed
            .iter()
            .map(|pr| {
                let checks = pr["statusCheckRollup"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .map(|c| {
                                let typename = c["__typename"].as_str().unwrap_or("");
                                let (name, status, conclusion) = if typename == "CheckRun" {
                                    (
                                        c["name"].as_str().unwrap_or("").to_string(),
                                        c["status"].as_str().unwrap_or("").to_string(),
                                        c["conclusion"].as_str().unwrap_or("").to_string(),
                                    )
                                } else {
                                    // StatusContext
                                    (
                                        c["context"].as_str().unwrap_or("").to_string(),
                                        c["state"].as_str().unwrap_or("").to_string(),
                                        c["state"].as_str().unwrap_or("").to_string(),
                                    )
                                };
                                CheckRun {
                                    name,
                                    status,
                                    conclusion,
                                }
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                LinkedPR {
                    number: pr["number"].as_u64().unwrap_or(0),
                    title: pr["title"].as_str().unwrap_or("").to_string(),
                    state: pr["state"].as_str().unwrap_or("").to_string(),
                    url: pr["url"].as_str().unwrap_or("").to_string(),
                    checks,
                }
            })
            .collect();

        Ok(prs)
    }

    /// Post a new comment on a GitHub issue via gh CLI.
    ///
    /// `repo` (optional) specifies `owner/name` for cross-repo issues in global mode.
    /// Security: body is passed as a CLI argument (not shell-interpolated), so injection
    /// is not possible. Input is validated for emptiness before invoking gh.
    #[tauri::command]
    pub async fn post_issue_comment(
        folder: Option<String>,
        repo: Option<String>,
        number: u64,
        body: String,
    ) -> Result<(), ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found",
            ));
        }
        if body.trim().is_empty() {
            return Err(ADPError::validation("Comment body cannot be empty"));
        }
        if let Some(ref r) = repo {
            validate_repo(r)?;
        }

        let cwd = effective_cwd(folder.as_deref());
        let cwd_str = cwd.to_string_lossy().to_string();
        let num_str = number.to_string();
        let mut args = vec!["issue", "comment", &num_str, "--body", &body];
        if let Some(ref r) = repo {
            args.extend_from_slice(&["--repo", r]);
        }
        run_command(&cwd_str, "gh", &args)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effective_cwd_some_valid_path_returns_it() {
        let tmp = std::env::temp_dir();
        let path = effective_cwd(Some(tmp.to_str().unwrap()));
        assert_eq!(path, tmp);
    }

    #[test]
    fn effective_cwd_none_returns_existing_dir() {
        let path = effective_cwd(None);
        assert!(
            path.exists(),
            "effective_cwd(None) must return an existing directory, got: {:?}",
            path
        );
    }

    #[test]
    fn effective_cwd_nonexistent_path_falls_back_to_temp() {
        let path = effective_cwd(Some("/this/path/does/not/exist/ever"));
        assert!(
            path.exists(),
            "should fall back to temp_dir when path does not exist"
        );
    }
}
