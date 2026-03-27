use serde::Serialize;

use super::{is_command_available, run_command};

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

// Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn get_git_info(folder: String) -> Result<GitInfo, String> {
        let folder_path = std::path::Path::new(&folder);
        if !folder_path.join(".git").exists() {
            return Err("Not a git repository".to_string());
        }

        let branch = run_command(&folder, "git", &["rev-parse", "--abbrev-ref", "HEAD"])
            .unwrap_or_default();

        let last_commit = run_command(
            &folder,
            "git",
            &["log", "-1", "--format=%H%n%s%n%ci"],
        )
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

        let remote_url = run_command(&folder, "git", &["remote", "get-url", "origin"])
            .unwrap_or_default();

        Ok(GitInfo {
            branch,
            last_commit,
            remote_url,
        })
    }

    #[tauri::command]
    pub async fn get_github_prs(folder: String) -> Result<Vec<GithubPR>, String> {
        if !is_command_available("gh") {
            return Err("gh CLI not found. Install from https://cli.github.com".to_string());
        }

        let output = run_command(
            &folder,
            "gh",
            &[
                "pr", "list",
                "--state", "open",
                "--json", "number,title,author,reviewDecision,url",
                "--limit", "20",
            ],
        )?;

        if output.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: Vec<serde_json::Value> = serde_json::from_str(&output)
            .map_err(|e| format!("Failed to parse gh output: {}", e))?;

        let prs = parsed
            .iter()
            .map(|pr| GithubPR {
                number: pr["number"].as_u64().unwrap_or(0),
                title: pr["title"].as_str().unwrap_or("").to_string(),
                author: pr["author"]["login"].as_str().unwrap_or("").to_string(),
                status: pr["reviewDecision"].as_str().unwrap_or("PENDING").to_string(),
                url: pr["url"].as_str().unwrap_or("").to_string(),
            })
            .collect();

        Ok(prs)
    }

    #[tauri::command]
    pub async fn get_github_issues(folder: String) -> Result<Vec<GithubIssue>, String> {
        if !is_command_available("gh") {
            return Err("gh CLI not found. Install from https://cli.github.com".to_string());
        }

        let output = run_command(
            &folder,
            "gh",
            &[
                "issue", "list",
                "--state", "open",
                "--json", "number,title,labels,assignees,url",
                "--limit", "20",
            ],
        )?;

        if output.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: Vec<serde_json::Value> = serde_json::from_str(&output)
            .map_err(|e| format!("Failed to parse gh output: {}", e))?;

        let issues = parsed
            .iter()
            .map(|issue| {
                let labels = issue["labels"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|l| l["name"].as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();

                let assignee = issue["assignees"]
                    .as_array()
                    .and_then(|arr| arr.first())
                    .and_then(|a| a["login"].as_str())
                    .unwrap_or("")
                    .to_string();

                GithubIssue {
                    number: issue["number"].as_u64().unwrap_or(0),
                    title: issue["title"].as_str().unwrap_or("").to_string(),
                    labels,
                    assignee,
                    url: issue["url"].as_str().unwrap_or("").to_string(),
                }
            })
            .collect();

        Ok(issues)
    }
}
