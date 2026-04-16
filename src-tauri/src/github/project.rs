use crate::error::{ADPError, ADPErrorCode};
use serde::Serialize;

use super::commands::{effective_cwd, is_command_available, run_command};

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
    /// First assignee login — kept for frontend backwards compatibility.
    pub assignee: String,
    pub labels: Vec<ProjectLabel>,
    pub url: String,
    pub state: String,
    pub current_lane_option_id: Option<String>,
    /// `"owner/name"` of the source repository. `None` for Draft issues.
    /// Populated from GraphQL `repository { nameWithOwner }`.
    pub repository: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ProjectBoard {
    pub project_id: String,
    pub status_field_id: String,
    pub lanes: Vec<ProjectLane>,
    pub items: Vec<ProjectItem>,
}

// ── GraphQL query ─────────────────────────────────────────────────────

/// Single-call GraphQL query for the board.
///
/// Fetches in one round trip:
/// - Status single-select field (id + options → lanes)
/// - All items with their current Status option id
/// - Per-item Issue content: number, title, url, state, repository,
///   labels (with hex color), assignees
///
/// Variables: `$number: Int!`, `$cursor: String` (optional, for paging).
/// Uses `viewer` so no login parameter is needed — the `gh` CLI auth
/// context supplies the authenticated user automatically.
const PROJECT_BOARD_QUERY: &str = r#"query($number: Int!, $cursor: String) { viewer { projectV2(number: $number) { id field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } } items(first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id fieldValues(first: 20) { nodes { __typename ... on ProjectV2ItemFieldSingleSelectValue { optionId field { ... on ProjectV2FieldCommon { name } } } } } content { __typename ... on Issue { number title url state repository { nameWithOwner } labels(first: 10) { nodes { name color } } assignees(first: 5) { nodes { login } } } } } } } } }"#;

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

// ── Pagination constants ─────────────────────────────────────────────

/// Maximum number of pages fetched in a single board load.
///
/// At 100 items/page this caps at 10 000 items — more than any real project
/// board is expected to contain. The guard exists solely to abort on malformed
/// GitHub API responses where `hasNextPage == true` but `endCursor` is `null`,
/// which would otherwise cause an infinite loop.
pub(crate) const MAX_PAGES: usize = 100;

/// Holds pagination state extracted from a single GraphQL response page.
#[derive(Debug, PartialEq)]
pub(crate) struct PageInfo {
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

/// Extracts `pageInfo` from `items.pageInfo` inside a GraphQL `projectV2` node.
///
/// Returns `None` only when the `items` key is absent entirely (parse error
/// path). `hasNextPage` defaults to `false` when missing/non-bool so the loop
/// terminates safely.
pub(crate) fn parse_page_info(items: &serde_json::Value) -> PageInfo {
    let has_next_page = items["pageInfo"]["hasNextPage"].as_bool().unwrap_or(false);
    let end_cursor = items["pageInfo"]["endCursor"].as_str().map(String::from);
    PageInfo {
        has_next_page,
        end_cursor,
    }
}

// ── Parsing helpers ──────────────────────────────────────────────────

/// Extracts the Status single-select field id and lane definitions from a
/// GraphQL `projectV2` response node.
fn parse_status_field(project: &serde_json::Value) -> Result<(String, Vec<ProjectLane>), ADPError> {
    let field = &project["field"];

    let field_id = field["id"].as_str().ok_or_else(|| {
        ADPError::command_failed(
            "Project has no 'Status' single-select field. \
             Add one on github.com \u{2192} Project settings \u{2192} Fields."
                .to_string(),
        )
    })?;

    let empty_opts = vec![];
    let options = field["options"].as_array().unwrap_or(&empty_opts);

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

    Ok((field_id.to_string(), lanes))
}

/// Parses board items from a GraphQL `items.nodes` array.
///
/// Skips PRs, DraftIssues, and REDACTED items — only GitHub Issues are shown.
/// Labels and assignees are read directly from the GraphQL response, so
/// cross-repo items receive correct metadata without a second request.
fn parse_items_from_graphql(
    nodes: &[serde_json::Value],
    lanes: &[ProjectLane],
) -> Vec<ProjectItem> {
    nodes
        .iter()
        .filter_map(|node| {
            let content = &node["content"];
            if content["__typename"].as_str()? != "Issue" {
                return None;
            }

            let item_id = node["id"].as_str()?.to_string();
            let issue_number = content["number"].as_u64()?;
            let title = content["title"].as_str().unwrap_or("").to_string();
            let url = content["url"].as_str().unwrap_or("").to_string();
            let state = content["state"].as_str().unwrap_or("OPEN").to_string();
            let repository = content["repository"]["nameWithOwner"]
                .as_str()
                .map(String::from);

            let labels: Vec<ProjectLabel> = content["labels"]["nodes"]
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

            // First assignee login kept for frontend backwards compatibility.
            let assignee = content["assignees"]["nodes"]
                .as_array()
                .and_then(|arr| arr.first())
                .and_then(|a| a["login"].as_str())
                .unwrap_or("")
                .to_string();

            // Find the Status option_id from fieldValues — look for the
            // ProjectV2ItemFieldSingleSelectValue whose field name is "Status".
            let current_lane_option_id = node["fieldValues"]["nodes"]
                .as_array()
                .and_then(|fvs| {
                    fvs.iter().find(|fv| {
                        fv["__typename"].as_str() == Some("ProjectV2ItemFieldSingleSelectValue")
                            && fv["field"]["name"].as_str() == Some("Status")
                    })
                })
                .and_then(|fv| fv["optionId"].as_str())
                .and_then(|option_id| {
                    // Verify the option_id exists in our lanes so we never
                    // produce a dangling reference.
                    lanes
                        .iter()
                        .find(|l| l.option_id == option_id)
                        .map(|l| l.option_id.clone())
                });

            Some(ProjectItem {
                item_id,
                issue_number,
                title,
                assignee,
                labels,
                url,
                state,
                current_lane_option_id,
                repository,
            })
        })
        .collect()
}

// ── Tauri Commands ───────────────────────────────────────────────────

#[allow(clippy::module_inception)]
pub mod commands {
    use super::*;

    /// Returns all GitHub Projects (v2) owned by the authenticated user.
    ///
    /// `folder` is used as the working directory for the `gh` subprocess.
    /// Passing `None` is safe — `gh project list` does not require a git
    /// repository and falls back to `std::env::temp_dir()`.
    #[tauri::command]
    pub async fn list_user_projects(
        folder: Option<String>,
    ) -> Result<Vec<ProjectSummary>, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found. Install from https://cli.github.com",
            ));
        }

        let cwd = effective_cwd(folder.as_deref());
        let cwd_str = cwd.to_string_lossy().to_string();

        let output = run_command(
            &cwd_str,
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
    /// Uses a single `gh api graphql` call per page instead of the former
    /// three parallel CLI calls. This fixes cross-repo label/assignee enrichment:
    /// all metadata is read directly from the GraphQL response regardless of which
    /// repository each issue belongs to.
    ///
    /// Paginates automatically — boards with more than 100 items require
    /// multiple round trips (GitHub caps `items(first:)` at 100).
    ///
    /// Required `gh` auth scope: `read:project` (for read) or `project` (for
    /// write). If missing: `gh auth refresh -s project,read:project`.
    #[tauri::command]
    pub async fn get_project_board(
        project_number: u32,
        project_id: String,
        folder: Option<String>,
    ) -> Result<ProjectBoard, ADPError> {
        if !is_command_available("gh") {
            return Err(ADPError::new(
                ADPErrorCode::ServiceRequestFailed,
                "gh CLI not found. Install from https://cli.github.com",
            ));
        }

        validate_id(&project_id)?;

        let cwd = effective_cwd(folder.as_deref());
        let cwd_str = cwd.to_string_lossy().to_string();
        let query_arg = format!("query={}", PROJECT_BOARD_QUERY);
        let number_arg = format!("number={}", project_number);

        let mut all_nodes: Vec<serde_json::Value> = Vec::new();
        let mut status_field_id = String::new();
        let mut lanes: Vec<ProjectLane> = Vec::new();
        let mut cursor: Option<String> = None;
        let mut first_page = true;
        let mut pages_fetched: usize = 0;

        loop {
            // Guard: abort on unexpectedly large or malformed paginated responses.
            pages_fetched += 1;
            if pages_fetched > MAX_PAGES {
                log::warn!(
                    "Pagination exceeded MAX_PAGES ({}) for project #{} — \
                     possible API malformation or unexpectedly large project; aborting.",
                    MAX_PAGES,
                    project_number
                );
                break;
            }

            let response = if let Some(ref c) = cursor {
                let cursor_arg = format!("cursor={}", c);
                run_command(
                    &cwd_str,
                    "gh",
                    &[
                        "api",
                        "graphql",
                        "-f",
                        &query_arg,
                        "-F",
                        &number_arg,
                        "-f",
                        &cursor_arg,
                    ],
                )?
            } else {
                run_command(
                    &cwd_str,
                    "gh",
                    &["api", "graphql", "-f", &query_arg, "-F", &number_arg],
                )?
            };

            let val: serde_json::Value = serde_json::from_str(&response)
                .map_err(|e| ADPError::parse(format!("Failed to parse GraphQL response: {}", e)))?;

            // Surface GraphQL-level errors (auth, scope, not found).
            if let Some(errors) = val["errors"].as_array() {
                let msg = errors
                    .first()
                    .and_then(|e| e["message"].as_str())
                    .unwrap_or("Unknown GraphQL error");
                return Err(ADPError::command_failed(format!(
                    "GitHub API error: {}",
                    msg
                )));
            }

            let project = &val["data"]["viewer"]["projectV2"];

            // Parse Status field on the first page only — options don't change.
            if first_page {
                let (fid, ls) = parse_status_field(project)?;
                status_field_id = fid;
                lanes = ls;
                first_page = false;
            }

            let items = &project["items"];
            let empty = vec![];
            let nodes = items["nodes"].as_array().unwrap_or(&empty);
            all_nodes.extend(nodes.iter().cloned());

            let page_info = parse_page_info(items);
            if !page_info.has_next_page {
                break;
            }
            match page_info.end_cursor {
                Some(c) => cursor = Some(c),
                None => {
                    // Malformed response: hasNextPage is true but endCursor is null.
                    // Continuing would repeat the current page forever — abort.
                    log::warn!(
                        "GitHub API returned hasNextPage=true but endCursor=null for project #{} \
                         (page {}). This is a malformed response; aborting pagination to prevent \
                         an infinite loop.",
                        project_number,
                        pages_fetched
                    );
                    break;
                }
            }
        }

        let items = parse_items_from_graphql(&all_nodes, &lanes);

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
        folder: Option<String>,
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

        let cwd = effective_cwd(folder.as_deref());
        let cwd_str = cwd.to_string_lossy().to_string();

        run_command(
            &cwd_str,
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

    // ── validate_id ───────────────────────────────────────────────────

    #[test]
    fn validate_id_accepts_valid_ids() {
        assert!(validate_id("PVT_abc123-XY").is_ok());
        assert!(validate_id("PVTSSF_abc123").is_ok());
        assert!(validate_id("PVTI_issue1").is_ok());
    }

    #[test]
    fn validate_id_rejects_shell_chars() {
        assert!(validate_id("").is_err());
        assert!(validate_id("abc; rm -rf /").is_err());
        assert!(validate_id("abc$(whoami)").is_err());
        assert!(validate_id("../etc/passwd").is_err());
    }

    // ── parse_status_field ────────────────────────────────────────────

    fn make_graphql_project_node() -> serde_json::Value {
        serde_json::json!({
            "id": "PVT_kwABC",
            "field": {
                "id": "PVTSSF_abc123",
                "options": [
                    {"id": "opt_backlog", "name": "Backlog"},
                    {"id": "opt_ready",   "name": "Ready"},
                    {"id": "opt_done",    "name": "Done"}
                ]
            }
        })
    }

    #[test]
    fn parse_status_field_extracts_lanes() {
        let project = make_graphql_project_node();
        let (field_id, lanes) = parse_status_field(&project).unwrap();
        assert_eq!(field_id, "PVTSSF_abc123");
        assert_eq!(lanes.len(), 3);
        assert_eq!(lanes[0].option_id, "opt_backlog");
        assert_eq!(lanes[1].name, "Ready");
        assert_eq!(lanes[2].order, 2);
    }

    #[test]
    fn parse_status_field_missing_returns_error() {
        let project = serde_json::json!({"id": "PVT_kwABC", "field": {}});
        assert!(parse_status_field(&project).is_err());
    }

    // ── parse_items_from_graphql ──────────────────────────────────────

    fn make_lanes() -> Vec<ProjectLane> {
        vec![
            ProjectLane {
                option_id: "opt_todo".to_string(),
                name: "Todo".to_string(),
                order: 0,
            },
            ProjectLane {
                option_id: "opt_done".to_string(),
                name: "Done".to_string(),
                order: 1,
            },
        ]
    }

    #[test]
    fn parse_items_filters_non_issues() {
        let lanes = make_lanes();
        let nodes = vec![
            serde_json::json!({
                "id": "PVTI_issue1",
                "fieldValues": {
                    "nodes": [{
                        "__typename": "ProjectV2ItemFieldSingleSelectValue",
                        "optionId": "opt_done",
                        "field": {"name": "Status"}
                    }]
                },
                "content": {
                    "__typename": "Issue",
                    "number": 42,
                    "title": "Fix bug",
                    "url": "https://github.com/owner/repo/issues/42",
                    "state": "OPEN",
                    "repository": {"nameWithOwner": "owner/repo"},
                    "labels": {"nodes": [{"name": "bug", "color": "d73a4a"}]},
                    "assignees": {"nodes": [{"login": "alice"}]}
                }
            }),
            serde_json::json!({
                "id": "PVTI_pr1",
                "fieldValues": {"nodes": []},
                "content": {
                    "__typename": "PullRequest",
                    "number": 43,
                    "url": "https://github.com/owner/repo/pull/43",
                    "state": "OPEN"
                }
            }),
        ];
        let items = parse_items_from_graphql(&nodes, &lanes);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].issue_number, 42);
        assert_eq!(
            items[0].current_lane_option_id,
            Some("opt_done".to_string())
        );
        assert_eq!(items[0].repository, Some("owner/repo".to_string()));
        assert_eq!(items[0].labels[0].name, "bug");
        assert_eq!(items[0].assignee, "alice");
    }

    #[test]
    fn parse_items_cross_repo_has_correct_metadata() {
        let lanes = make_lanes();
        let nodes = vec![
            serde_json::json!({
                "id": "PVTI_a",
                "fieldValues": {
                    "nodes": [{
                        "__typename": "ProjectV2ItemFieldSingleSelectValue",
                        "optionId": "opt_todo",
                        "field": {"name": "Status"}
                    }]
                },
                "content": {
                    "__typename": "Issue",
                    "number": 10,
                    "title": "Issue from repo-a",
                    "url": "https://github.com/org/repo-a/issues/10",
                    "state": "OPEN",
                    "repository": {"nameWithOwner": "org/repo-a"},
                    "labels": {"nodes": [{"name": "enhancement", "color": "84b6eb"}]},
                    "assignees": {"nodes": []}
                }
            }),
            serde_json::json!({
                "id": "PVTI_b",
                "fieldValues": {
                    "nodes": [{
                        "__typename": "ProjectV2ItemFieldSingleSelectValue",
                        "optionId": "opt_done",
                        "field": {"name": "Status"}
                    }]
                },
                "content": {
                    "__typename": "Issue",
                    "number": 55,
                    "title": "Issue from repo-b",
                    "url": "https://github.com/org/repo-b/issues/55",
                    "state": "CLOSED",
                    "repository": {"nameWithOwner": "org/repo-b"},
                    "labels": {"nodes": [{"name": "bug", "color": "d73a4a"}]},
                    "assignees": {"nodes": [{"login": "bob"}]}
                }
            }),
        ];
        let items = parse_items_from_graphql(&nodes, &lanes);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].repository, Some("org/repo-a".to_string()));
        assert_eq!(items[0].labels[0].name, "enhancement");
        assert_eq!(items[1].repository, Some("org/repo-b".to_string()));
        assert_eq!(items[1].assignee, "bob");
        assert_eq!(
            items[1].current_lane_option_id,
            Some("opt_done".to_string())
        );
    }

    #[test]
    fn parse_items_no_status_gives_none() {
        let nodes = vec![serde_json::json!({
            "id": "PVTI_no_status",
            "fieldValues": {"nodes": []},
            "content": {
                "__typename": "Issue",
                "number": 99,
                "title": "Triage me",
                "url": "",
                "state": "OPEN",
                "repository": {"nameWithOwner": "owner/repo"},
                "labels": {"nodes": []},
                "assignees": {"nodes": []}
            }
        })];
        let items = parse_items_from_graphql(&nodes, &[]);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].current_lane_option_id, None);
    }

    #[test]
    fn parse_items_draft_issue_is_skipped() {
        let nodes = vec![serde_json::json!({
            "id": "PVTI_draft",
            "fieldValues": {"nodes": []},
            "content": {
                "__typename": "DraftIssue",
                "title": "Draft item"
            }
        })];
        let items = parse_items_from_graphql(&nodes, &[]);
        assert_eq!(items.len(), 0);
    }

    // ── parse_page_info ───────────────────────────────────────────────

    #[test]
    fn parse_page_info_normal_next_page() {
        let items = serde_json::json!({
            "pageInfo": {
                "hasNextPage": true,
                "endCursor": "Y3Vyc29yOnYyOpHOABCD"
            }
        });
        let info = parse_page_info(&items);
        assert!(info.has_next_page);
        assert_eq!(info.end_cursor, Some("Y3Vyc29yOnYyOpHOABCD".to_string()));
    }

    #[test]
    fn parse_page_info_last_page() {
        let items = serde_json::json!({
            "pageInfo": {
                "hasNextPage": false,
                "endCursor": "Y3Vyc29yOnYyOpHOABCD"
            }
        });
        let info = parse_page_info(&items);
        assert!(!info.has_next_page);
        // endCursor is present but irrelevant when hasNextPage is false.
        assert!(info.end_cursor.is_some());
    }

    /// Regression: malformed API response — hasNextPage true but endCursor null.
    /// `parse_page_info` must surface this so the caller can abort instead of
    /// looping forever on the first page.
    #[test]
    fn parse_page_info_malformed_has_next_but_null_cursor() {
        let items = serde_json::json!({
            "pageInfo": {
                "hasNextPage": true,
                "endCursor": null
            }
        });
        let info = parse_page_info(&items);
        assert!(info.has_next_page, "has_next_page must be true");
        assert_eq!(
            info.end_cursor, None,
            "end_cursor must be None for null endCursor"
        );
        // The caller detects (has_next_page && end_cursor.is_none()) and breaks.
    }

    #[test]
    fn parse_page_info_missing_page_info_key_defaults_to_no_next() {
        // Completely absent pageInfo — defaults to no further pages.
        let items = serde_json::json!({"nodes": []});
        let info = parse_page_info(&items);
        assert!(!info.has_next_page);
        assert_eq!(info.end_cursor, None);
    }

    /// MAX_PAGES constant must stay at 100 — changing it accidentally would
    /// either allow runaway loops or break large legitimate boards.
    #[test]
    fn max_pages_constant_is_100() {
        assert_eq!(MAX_PAGES, 100);
    }
}
