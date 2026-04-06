// src-tauri/src/validation.rs
//
// Centralized input validation for Tauri commands.
// All user-supplied IDs, paths, and strings should be validated here.

use crate::error::ADPError;

/// Validate a session ID (used in PTY resume).
/// Only alphanumeric chars, hyphens, and underscores allowed.
pub fn validate_session_id(id: &str) -> Result<(), ADPError> {
    if id.is_empty() {
        return Err(ADPError::validation("Session ID must not be empty"));
    }
    if id.len() > 256 {
        return Err(ADPError::validation("Session ID too long (max 256 chars)"));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ADPError::validation(format!(
            "Invalid session ID '{}' — only alphanumeric characters, hyphens, and underscores are allowed",
            id
        )));
    }
    Ok(())
}

/// Validate a library item ID (used in file path construction).
/// Only alphanumeric chars, hyphens, underscores, and dots allowed.
pub fn validate_library_id(id: &str) -> Result<(), ADPError> {
    if id.is_empty() {
        return Err(ADPError::validation("Library item ID must not be empty"));
    }
    if id.len() > 128 {
        return Err(ADPError::validation(
            "Library item ID too long (max 128 chars)",
        ));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(ADPError::validation(format!(
            "Invalid library item ID '{}' — only alphanumeric characters, hyphens, underscores, and dots are allowed",
            id
        )));
    }
    // Reject path traversal attempts
    if id.contains("..") {
        return Err(ADPError::validation(
            "Library item ID must not contain '..'",
        ));
    }
    Ok(())
}

/// Validate a folder path exists and is a directory.
pub fn validate_folder(folder: &str) -> Result<(), ADPError> {
    if folder.is_empty() {
        return Err(ADPError::validation("Folder path must not be empty"));
    }
    let path = std::path::Path::new(folder);
    if !path.is_dir() {
        return Err(ADPError::validation(format!(
            "Folder does not exist or is not a directory: {}",
            folder
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- validate_session_id ---

    #[test]
    fn test_valid_session_ids() {
        assert!(validate_session_id("abc-123").is_ok());
        assert!(validate_session_id("session_42").is_ok());
        assert!(validate_session_id("a").is_ok());
    }

    #[test]
    fn test_empty_session_id() {
        assert!(validate_session_id("").is_err());
    }

    #[test]
    fn test_session_id_with_special_chars() {
        assert!(validate_session_id("$(rm -rf /)").is_err());
        assert!(validate_session_id("test;ls").is_err());
        assert!(validate_session_id("test`whoami`").is_err());
        assert!(validate_session_id("../../../etc/passwd").is_err());
    }

    #[test]
    fn test_session_id_too_long() {
        let long_id = "a".repeat(257);
        assert!(validate_session_id(&long_id).is_err());
    }

    // --- validate_library_id ---

    #[test]
    fn test_valid_library_ids() {
        assert!(validate_library_id("my-snippet").is_ok());
        assert!(validate_library_id("note_2024").is_ok());
        assert!(validate_library_id("file.md").is_ok());
    }

    #[test]
    fn test_empty_library_id() {
        assert!(validate_library_id("").is_err());
    }

    #[test]
    fn test_library_id_traversal() {
        assert!(validate_library_id("../../etc/passwd").is_err());
        assert!(validate_library_id("..").is_err());
    }

    #[test]
    fn test_library_id_special_chars() {
        assert!(validate_library_id("test/sub").is_err());
        assert!(validate_library_id("test\\sub").is_err());
        assert!(validate_library_id("test;ls").is_err());
    }

    #[test]
    fn test_library_id_too_long() {
        let long_id = "a".repeat(129);
        assert!(validate_library_id(&long_id).is_err());
    }

    // --- validate_folder ---

    #[test]
    fn test_empty_folder() {
        assert!(validate_folder("").is_err());
    }

    #[test]
    fn test_nonexistent_folder() {
        assert!(validate_folder("/nonexistent/path/xyz").is_err());
    }
}
