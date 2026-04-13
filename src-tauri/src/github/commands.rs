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
pub struct KanbanIssue {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub labels: Vec<KanbanLabel>,
    pub assignee: String,
    pub url: String,
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

/// Lane labels used for Kanban classification.
const LANE_LABELS: &[&str] = &[
    "backlog",
    "todo",
    "to do",
    "in-progress",
    "in progress",
    "sprint",
    "done",
];

fn run_command(folder: &str, program: &str, args: &[&str]) -> Result<String, ADPError> {
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

fn is_command_available(cmd_name: &str) -> bool {
    let check_cmd = if cfg!(windows) { "where" } else { "which" };
    let mut cmd = silent_command(check_cmd);
    cmd.arg(cmd_name);
    crate::util::timed_output(cmd, std::time::Duration::from_secs(5))
        .map(|o| o.status.success())
        .unwrap_or(false)
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

/// Extract the first assignee login (for KanbanIssue / GithubIssue which show only one).
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

    #[tauri::command]
    pub async fn get_kanban_issues(folder: String) -> Result<Vec<KanbanIssue>, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found. Install from https://cli.github.com",
            ));
        }

        // Fetch open and closed issues in parallel
        let open_output = run_command(
            &folder,
            "gh",
            &[
                "issue",
                "list",
                "--state",
                "all",
                "--json",
                "number,title,state,labels,assignees,url",
                "--limit",
                "50",
            ],
        )?;

        if open_output.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: Vec<serde_json::Value> = serde_json::from_str(&open_output)
            .map_err(|e| ADPError::parse(format!("Failed to parse gh output: {}", e)))?;

        let issues = parsed
            .iter()
            .map(|issue| {
                let labels = issue["labels"]
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

                let assignee = issue["assignees"]
                    .as_array()
                    .and_then(|arr| arr.first())
                    .and_then(|a| a["login"].as_str())
                    .unwrap_or("")
                    .to_string();

                KanbanIssue {
                    number: issue["number"].as_u64().unwrap_or(0),
                    title: issue["title"].as_str().unwrap_or("").to_string(),
                    state: issue["state"].as_str().unwrap_or("OPEN").to_string(),
                    labels,
                    assignee,
                    url: issue["url"].as_str().unwrap_or("").to_string(),
                }
            })
            .collect();

        Ok(issues)
    }

    #[tauri::command]
    pub async fn get_issue_detail(folder: String, number: u64) -> Result<IssueDetail, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found",
            ));
        }

        let output = run_command(
            &folder,
            "gh",
            &[
                "issue",
                "view",
                &number.to_string(),
                "--json",
                "number,title,body,state,author,createdAt,updatedAt,closedAt,labels,assignees,milestone,url,comments",
            ],
        )?;

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

    #[tauri::command]
    pub async fn get_issue_checks(folder: String, number: u64) -> Result<Vec<LinkedPR>, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found",
            ));
        }

        // Search for PRs that reference this issue number
        let search_query = format!("#{}", number);
        let output = run_command(
            &folder,
            "gh",
            &[
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
            ],
        )?;

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
    /// Security: body is passed as a CLI argument (not shell-interpolated), so injection is not
    /// possible. Input is validated for emptiness before invoking gh.
    #[tauri::command]
    pub async fn post_issue_comment(
        folder: String,
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
        let num_str = number.to_string();
        run_command(
            &folder,
            "gh",
            &["issue", "comment", &num_str, "--body", &body],
        )?;
        Ok(())
    }

    #[tauri::command]
    pub async fn move_issue_lane(
        folder: String,
        number: u64,
        target_lane: String,
    ) -> Result<(), ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found",
            ));
        }

        let num_str = number.to_string();

        // Remove all existing lane labels
        let output = run_command(
            &folder,
            "gh",
            &["issue", "view", &num_str, "--json", "labels,state"],
        )?;

        let val: serde_json::Value = serde_json::from_str(&output)
            .map_err(|e| ADPError::parse(format!("Failed to parse issue: {}", e)))?;

        let current_state = val["state"].as_str().unwrap_or("OPEN");

        // Collect lane labels to remove
        let labels_to_remove: Vec<String> = val["labels"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|l| {
                        let name = l["name"].as_str()?;
                        if LANE_LABELS.contains(&name.to_lowercase().as_str()) {
                            Some(name.to_string())
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Remove old lane labels
        for label in &labels_to_remove {
            let _ = run_command(
                &folder,
                "gh",
                &["issue", "edit", &num_str, "--remove-label", label],
            );
        }

        // Handle state transitions and add new label
        match target_lane.as_str() {
            "done" => {
                // Close the issue if open
                if current_state == "OPEN" {
                    run_command(&folder, "gh", &["issue", "close", &num_str])?;
                }
            }
            lane => {
                // Reopen if closed
                if current_state == "CLOSED" {
                    run_command(&folder, "gh", &["issue", "reopen", &num_str])?;
                }

                // Add the target lane label
                let label_name = match lane {
                    "in-progress" => "in-progress",
                    "todo" => "todo",
                    _ => "backlog",
                };
                run_command(
                    &folder,
                    "gh",
                    &["issue", "edit", &num_str, "--add-label", label_name],
                )?;
            }
        }

        Ok(())
    }
}
