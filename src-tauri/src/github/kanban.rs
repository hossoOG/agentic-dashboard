use serde::{Deserialize, Serialize};

use super::{is_command_available, run_global_command};

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectInfo {
    pub number: u64,
    pub title: String,
    pub id: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectColumn {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectColumnsResult {
    pub field_id: String,
    pub columns: Vec<ProjectColumn>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct KanbanItem {
    pub id: String,
    pub title: String,
    pub number: Option<u64>,
    pub status: String,
    pub labels: Vec<String>,
    pub assignees: Vec<String>,
    pub url: String,
    pub item_type: String,
}

// Commands im mod-Block wegen rustc 1.94 E0255 Workaround (siehe CLAUDE.md)
pub mod commands {
    use super::*;

    #[tauri::command]
    pub async fn get_github_projects(owner: String) -> Result<Vec<ProjectInfo>, String> {
        if !is_command_available("gh") {
            return Err("gh CLI not found. Install from https://cli.github.com".to_string());
        }

        let output = run_global_command(
            "gh",
            &[
                "project", "list",
                "--owner", &owner,
                "--format", "json",
                "--limit", "20",
            ],
        )?;

        if output.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: serde_json::Value = serde_json::from_str(&output)
            .map_err(|e| format!("Failed to parse gh project list output: {}", e))?;

        // gh project list --format json returns { "projects": [...] }
        let projects_array = parsed.get("projects")
            .and_then(|p| p.as_array())
            .cloned()
            .unwrap_or_default();

        let projects = projects_array
            .iter()
            .filter_map(|p| {
                let number = p["number"].as_u64()?;
                let title = p["title"].as_str().unwrap_or("").to_string();
                let id = p["id"].as_str().unwrap_or("").to_string();
                Some(ProjectInfo { number, title, id })
            })
            .collect();

        Ok(projects)
    }

    #[tauri::command]
    pub async fn get_project_columns(
        owner: String,
        project_number: u64,
    ) -> Result<ProjectColumnsResult, String> {
        if !is_command_available("gh") {
            return Err("gh CLI not found. Install from https://cli.github.com".to_string());
        }

        let number_str = project_number.to_string();
        let output = run_global_command(
            "gh",
            &[
                "project", "field-list",
                &number_str,
                "--owner", &owner,
                "--format", "json",
            ],
        )?;

        if output.is_empty() {
            return Ok(ProjectColumnsResult { field_id: String::new(), columns: Vec::new() });
        }

        let parsed: serde_json::Value = serde_json::from_str(&output)
            .map_err(|e| format!("Failed to parse gh project field-list output: {}", e))?;

        // gh project field-list --format json returns { "fields": [...] }
        let fields = parsed.get("fields")
            .and_then(|f| f.as_array())
            .cloned()
            .unwrap_or_default();

        // Find the "Status" single-select field and extract options + field ID
        for field in &fields {
            let name = field.get("name").and_then(|n| n.as_str()).unwrap_or("");
            if name == "Status" {
                let field_id = field.get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();

                let options = field.get("options")
                    .and_then(|o| o.as_array())
                    .cloned()
                    .unwrap_or_default();

                let columns = options
                    .iter()
                    .filter_map(|opt| {
                        let id = opt["id"].as_str()?.to_string();
                        let opt_name = opt["name"].as_str().unwrap_or("").to_string();
                        Some(ProjectColumn { id, name: opt_name })
                    })
                    .collect();

                return Ok(ProjectColumnsResult { field_id, columns });
            }
        }

        // No Status field found — return empty
        Ok(ProjectColumnsResult { field_id: String::new(), columns: Vec::new() })
    }

    #[tauri::command]
    pub async fn get_project_items(
        owner: String,
        project_number: u64,
    ) -> Result<Vec<KanbanItem>, String> {
        if !is_command_available("gh") {
            return Err("gh CLI not found. Install from https://cli.github.com".to_string());
        }

        let number_str = project_number.to_string();
        let output = run_global_command(
            "gh",
            &[
                "project", "item-list",
                &number_str,
                "--owner", &owner,
                "--format", "json",
                "--limit", "100",
            ],
        )?;

        if output.is_empty() {
            return Ok(Vec::new());
        }

        let parsed: serde_json::Value = serde_json::from_str(&output)
            .map_err(|e| format!("Failed to parse gh project item-list output: {}", e))?;

        // gh project item-list --format json returns { "items": [...] }
        let items_array = parsed.get("items")
            .and_then(|i| i.as_array())
            .cloned()
            .unwrap_or_default();

        let items = items_array
            .iter()
            .map(|item| {
                let id = item["id"].as_str().unwrap_or("").to_string();
                let title = item["title"].as_str().unwrap_or("").to_string();

                let content = item.get("content");
                let number = content
                    .and_then(|c| c.get("number"))
                    .and_then(|n| n.as_u64());
                let url = content
                    .and_then(|c| c.get("url"))
                    .and_then(|u| u.as_str())
                    .unwrap_or("")
                    .to_string();
                let item_type = content
                    .and_then(|c| c.get("type"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("DraftIssue")
                    .to_string();

                let labels = content
                    .and_then(|c| c.get("labels"))
                    .and_then(|l| l.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|l| l.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();

                let assignees = content
                    .and_then(|c| c.get("assignees"))
                    .and_then(|a| a.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|a| a.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();

                let status = item.get("status")
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();

                KanbanItem {
                    id,
                    title,
                    number,
                    status,
                    labels,
                    assignees,
                    url,
                    item_type,
                }
            })
            .collect();

        Ok(items)
    }

    #[tauri::command]
    pub async fn update_item_status(
        project_id: String,
        item_id: String,
        field_id: String,
        option_id: String,
    ) -> Result<(), String> {
        if !is_command_available("gh") {
            return Err("gh CLI not found. Install from https://cli.github.com".to_string());
        }

        run_global_command(
            "gh",
            &[
                "project", "item-edit",
                "--project-id", &project_id,
                "--id", &item_id,
                "--field-id", &field_id,
                "--single-select-option-id", &option_id,
            ],
        )?;

        Ok(())
    }
}
