use crate::error::{ADPError, ADPErrorCode};
use serde::Serialize;
use std::collections::HashMap;

use super::commands::{is_command_available, run_command};

// ── Types ────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct ProjectSummary {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub items_total: u32,
}

#[derive(Serialize, Clone)]
pub struct ProjectLane {
    pub option_id: String,
    pub name: String,
    pub order: u32,
}

#[derive(Serialize, Clone)]
pub struct ProjectLabel {
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone)]
pub struct ProjectItem {
    pub item_id: String,
    pub issue_number: u64,
    pub title: String,
    pub assignee: String,
    pub labels: Vec<ProjectLabel>,
    pub url: String,
    pub state: String,
    pub current_lane_option_id: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ProjectBoard {
    pub project_id: String,
    pub status_field_id: String,
    pub lanes: Vec<ProjectLane>,
    pub items: Vec<ProjectItem>,
}

// ── Validation ───────────────────────────────────────────────────────

/// Validates that a Projects v2 ID contains only safe characters.
/// Prevents shell injection: IDs must be alphanumeric + underscore + hyphen.
fn validate_id(id: &str) -> Result<(), ADPError> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
    {
        return Err(ADPError::validation(format!("Invalid ID format: '{}'", id)));
    }
    Ok(())
}

// ── Parsing helpers ──────────────────────────────────────────────────

fn parse_lanes(fields_val: &serde_json::Value) -> Result<(String, Vec<ProjectLane>), ADPError> {
    let empty = vec![];
    let fields = fields_val["fields"].as_array().unwrap_or(&empty);

    let status_field = fields
        .iter()
        .find(|f| {
            f["type"].as_str() == Some("ProjectV2SingleSelectField")
                && f["name"].as_str() == Some("Status")
        })
        .ok_or_else(|| {
            ADPError::command_failed(
                "Project has no 'Status' single-select field. \
                 Add one on github.com → Project settings → Fields."
                    .to_string(),
            )
        })?;

    let field_id = status_field["id"].as_str().unwrap_or("").to_string();
    let empty_opts = vec![];
    let options = status_field["options"].as_array().unwrap_or(&empty_opts);

    let lanes: Vec<ProjectLane> = options
        .iter()
        .enumerate()
        .filter_map(|(i, opt)| {
            Some(ProjectLane {
                option_id: opt["id"].as_str()?.to_string(),
                name: opt["name"].as_str()?.to_string(),
                order: i as u32,
            })
        })
        .collect();

    Ok((field_id, lanes))
}

/// Builds a map of issue_number → {labels_with_color, assignee} from gh issue list output.
fn build_issue_meta(issues_val: &serde_json::Value) -> HashMap<u64, (Vec<ProjectLabel>, String)> {
    let mut map = HashMap::new();
    let empty = vec![];
    let issues = issues_val.as_array().unwrap_or(&empty);

    for issue in issues {
        let number = match issue["number"].as_u64() {
            Some(n) => n,
            None => continue,
        };

        let labels: Vec<ProjectLabel> = issue["labels"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|l| {
                        Some(ProjectLabel {
                            name: l["name"].as_str()?.to_string(),
                            color: l["color"].as_str().unwrap_or("6b7280").to_string(),
                        })
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

        map.insert(number, (labels, assignee));
    }
    map
}

fn parse_items(
    items_val: &serde_json::Value,
    lanes: &[ProjectLane],
    issue_meta: &HashMap<u64, (Vec<ProjectLabel>, String)>,
) -> Vec<ProjectItem> {
    let empty = vec![];
    let items = items_val["items"].as_array().unwrap_or(&empty);

    items
        .iter()
        .filter_map(|item| {
            // Only show GitHub Issues — skip PRs and DraftIssues
            if item["content"]["type"].as_str()? != "Issue" {
                return None;
            }
            let issue_number = item["content"]["number"].as_u64()?;
            let item_id = item["id"].as_str()?.to_string();
            let title = item["title"].as_str().unwrap_or("").to_string();
            let url = item["content"]["url"].as_str().unwrap_or("").to_string();
            let state = item["content"]["state"]
                .as_str()
                .unwrap_or("OPEN")
                .to_string();

            // Map status name → option_id for the frontend to use in moves
            let status_name = item["status"].as_str().unwrap_or("");
            let current_lane_option_id = if status_name.is_empty() {
                None
            } else {
                lanes
                    .iter()
                    .find(|l| l.name == status_name)
                    .map(|l| l.option_id.clone())
            };

            // Enrich with labels (+ colors) and assignee from gh issue list data
            let (labels, assignee) = issue_meta.get(&issue_number).cloned().unwrap_or_default();

            Some(ProjectItem {
                item_id,
                issue_number,
                title,
                assignee,
                labels,
                url,
                state,
                current_lane_option_id,
            })
        })
        .collect()
}

// ── Tauri Commands ───────────────────────────────────────────────────

#[allow(clippy::module_inception)]
pub mod commands {
    use super::*;

    /// Returns all GitHub Projects (v2) owned by the authenticated user.
    #[tauri::command]
    pub async fn list_user_projects(folder: String) -> Result<Vec<ProjectSummary>, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found. Install from https://cli.github.com",
            ));
        }

        let output = run_command(
            &folder,
            "gh",
            &["project", "list", "--owner", "@me", "--format", "json"],
        )?;

        if output.is_empty() {
            return Ok(Vec::new());
        }

        let val: serde_json::Value = serde_json::from_str(&output)
            .map_err(|e| ADPError::parse(format!("Failed to parse project list: {}", e)))?;

        let empty = vec![];
        let projects = val["projects"].as_array().unwrap_or(&empty);

        Ok(projects
            .iter()
            .filter_map(|p| {
                Some(ProjectSummary {
                    id: p["id"].as_str()?.to_string(),
                    number: p["number"].as_u64()? as u32,
                    title: p["title"].as_str().unwrap_or("").to_string(),
                    items_total: p["items"]["totalCount"].as_u64().unwrap_or(0) as u32,
                })
            })
            .collect())
    }

    /// Loads the full Kanban board for a GitHub Project v2.
    ///
    /// Makes 3 CLI calls: field-list (lanes), item-list (status), issue-list (label colors + assignees).
    /// Results are merged so each item has complete display data.
    ///
    /// Note: items from repos other than the current folder are excluded since
    /// `gh issue list` only returns issues from the local repo.
    #[tauri::command]
    pub async fn get_project_board(
        project_number: u32,
        project_id: String,
        folder: String,
    ) -> Result<ProjectBoard, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found. Install from https://cli.github.com",
            ));
        }

        validate_id(&project_id)?;
        let num_str = project_number.to_string();

        // 1. Load Status field definition → lanes
        let fields_output = run_command(
            &folder,
            "gh",
            &[
                "project",
                "field-list",
                &num_str,
                "--owner",
                "@me",
                "--format",
                "json",
            ],
        )?;

        let fields_val: serde_json::Value = serde_json::from_str(&fields_output)
            .map_err(|e| ADPError::parse(format!("Failed to parse field list: {}", e)))?;

        let (status_field_id, lanes) = parse_lanes(&fields_val)?;

        // 2. Load project items (item_id, issue_number, current status)
        // Note: --limit 300 covers boards up to 300 items without pagination.
        let items_output = run_command(
            &folder,
            "gh",
            &[
                "project",
                "item-list",
                &num_str,
                "--owner",
                "@me",
                "--format",
                "json",
                "--limit",
                "300",
            ],
        )?;

        let items_val: serde_json::Value = serde_json::from_str(&items_output)
            .map_err(|e| ADPError::parse(format!("Failed to parse item list: {}", e)))?;

        // 3. Load issue metadata for label colors + assignees from current repo
        let issues_output = run_command(
            &folder,
            "gh",
            &[
                "issue",
                "list",
                "--state",
                "all",
                "--json",
                "number,labels,assignees",
                "--limit",
                "300",
            ],
        )?;

        let issues_val: serde_json::Value = serde_json::from_str(&issues_output)
            .map_err(|e| ADPError::parse(format!("Failed to parse issue list: {}", e)))?;

        let issue_meta = build_issue_meta(&issues_val);
        let items = parse_items(&items_val, &lanes, &issue_meta);

        Ok(ProjectBoard {
            project_id,
            status_field_id,
            lanes,
            items,
        })
    }

    /// Moves a project item to a new Status lane.
    ///
    /// Uses `gh project item-edit` — no label manipulation or issue close/reopen.
    /// GitHub Projects v2 is the single source of truth for lane assignment.
    #[tauri::command]
    pub async fn move_project_item(
        project_id: String,
        item_id: String,
        field_id: String,
        option_id: String,
        folder: String,
    ) -> Result<(), ADPError> {
        validate_id(&project_id)?;
        validate_id(&item_id)?;
        validate_id(&field_id)?;
        validate_id(&option_id)?;

        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found",
            ));
        }

        run_command(
            &folder,
            "gh",
            &[
                "project",
                "item-edit",
                "--project-id",
                &project_id,
                "--id",
                &item_id,
                "--field-id",
                &field_id,
                "--single-select-option-id",
                &option_id,
            ],
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_field_list_json() -> serde_json::Value {
        serde_json::json!({
            "fields": [
                {
                    "id": "PVTSSF_abc123",
                    "name": "Status",
                    "type": "ProjectV2SingleSelectField",
                    "options": [
                        {"id": "opt_backlog", "name": "Backlog"},
                        {"id": "opt_ready",   "name": "Ready"},
                        {"id": "opt_done",    "name": "Done"}
                    ]
                },
                {
                    "id": "PVTF_title",
                    "name": "Title",
                    "type": "ProjectV2Field"
                }
            ]
        })
    }

    #[test]
    fn parse_lanes_extracts_status_field() {
        let json = make_field_list_json();
        let (field_id, lanes) = parse_lanes(&json).unwrap();
        assert_eq!(field_id, "PVTSSF_abc123");
        assert_eq!(lanes.len(), 3);
        assert_eq!(lanes[0].option_id, "opt_backlog");
        assert_eq!(lanes[1].name, "Ready");
        assert_eq!(lanes[2].order, 2);
    }

    #[test]
    fn parse_lanes_missing_status_returns_error() {
        let json = serde_json::json!({"fields": []});
        assert!(parse_lanes(&json).is_err());
    }

    #[test]
    fn parse_items_filters_non_issues() {
        let lanes = vec![ProjectLane {
            option_id: "opt_done".to_string(),
            name: "Done".to_string(),
            order: 0,
        }];
        let items_val = serde_json::json!({
            "items": [
                {
                    "id": "PVTI_issue1",
                    "title": "Fix bug",
                    "status": "Done",
                    "content": {"type": "Issue", "number": 42, "url": "https://github.com/x/y/issues/42", "state": "OPEN"}
                },
                {
                    "id": "PVTI_pr1",
                    "title": "Add feature",
                    "status": "Done",
                    "content": {"type": "PullRequest", "number": 43, "url": "https://github.com/x/y/pull/43"}
                }
            ]
        });
        let meta = HashMap::new();
        let items = parse_items(&items_val, &lanes, &meta);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].issue_number, 42);
        assert_eq!(
            items[0].current_lane_option_id,
            Some("opt_done".to_string())
        );
    }

    #[test]
    fn parse_items_no_status_gives_none() {
        let lanes: Vec<ProjectLane> = vec![];
        let items_val = serde_json::json!({
            "items": [{
                "id": "PVTI_no_status",
                "title": "Triage me",
                "status": null,
                "content": {"type": "Issue", "number": 99, "url": "", "state": "OPEN"}
            }]
        });
        let meta = HashMap::new();
        let items = parse_items(&items_val, &lanes, &meta);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].current_lane_option_id, None);
    }

    #[test]
    fn validate_id_rejects_shell_chars() {
        assert!(validate_id("PVT_abc123-XY").is_ok());
        assert!(validate_id("").is_err());
        assert!(validate_id("abc; rm -rf /").is_err());
        assert!(validate_id("abc$(whoami)").is_err());
    }
}
