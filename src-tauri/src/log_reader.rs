use std::io::{BufRead, BufReader};
use std::path::PathBuf;

fn log_file_path() -> PathBuf {
    if let Some(data_dir) = std::env::var_os("LOCALAPPDATA") {
        let dir = PathBuf::from(data_dir).join("agentic-explorer");
        return dir.join("agentic-explorer.log");
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("agentic-explorer.log")
}

#[allow(clippy::module_inception)]
pub mod commands {
    use super::*;

    #[tauri::command]
    pub fn read_backend_log(max_lines: Option<usize>) -> Result<Vec<String>, String> {
        let path = log_file_path();
        let max = max_lines.unwrap_or(500);

        let file = std::fs::File::open(&path).map_err(|e| {
            format!("Failed to open log file '{}': {}", path.display(), e)
        })?;

        let reader = BufReader::new(file);
        let all_lines: Vec<String> = reader
            .lines()
            .map_while(Result::ok)
            .collect();

        let start = all_lines.len().saturating_sub(max);
        Ok(all_lines[start..].to_vec())
    }
}
