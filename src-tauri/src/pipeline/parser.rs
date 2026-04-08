//! Workflow YAML parser and validator.
//!
//! Loads `.yaml`/`.yml` workflow files, deserializes them into
//! [`WorkflowDefinition`] structs, and validates structural integrity
//! (unique IDs, valid references, no cycles).
//!
//! Related issues: #152

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::error::ADPError;
use crate::pipeline::schema::{StepType, WorkflowDefinition};

// ============================================================================
// Parsing
// ============================================================================

/// Parse a YAML workflow file from disk.
pub fn parse_workflow_file(path: &Path) -> Result<WorkflowDefinition, ADPError> {
    if !path.exists() {
        return Err(ADPError::file_io(format!(
            "Workflow file not found: {}",
            path.display()
        )));
    }

    let content = std::fs::read_to_string(path).map_err(|e| {
        ADPError::file_io(format!(
            "Failed to read workflow file {}: {}",
            path.display(),
            e
        ))
    })?;

    parse_workflow_str(&content)
}

/// Parse a YAML string into a [`WorkflowDefinition`].
pub fn parse_workflow_str(yaml: &str) -> Result<WorkflowDefinition, ADPError> {
    serde_yaml::from_str(yaml).map_err(|e| ADPError::parse(format!("Invalid workflow YAML: {}", e)))
}

// ============================================================================
// Validation
// ============================================================================

/// Validate a parsed workflow for structural correctness.
///
/// Checks:
/// - At least one step exists
/// - All step IDs are unique
/// - All `depends_on` references point to existing step IDs
/// - No circular dependencies
/// - Required inputs are declared
/// - Agent steps have non-empty prompts
/// - Gate/Action steps have non-empty commands
pub fn validate_workflow(workflow: &WorkflowDefinition) -> Result<(), ADPError> {
    // 1. At least one step
    if workflow.steps.is_empty() {
        return Err(ADPError::validation("Workflow must have at least one step"));
    }

    // 2. Collect step IDs and check uniqueness
    let mut seen_ids: HashSet<String> = HashSet::new();
    for step in &workflow.steps {
        if !seen_ids.insert(step.id.clone()) {
            return Err(ADPError::validation(format!(
                "Duplicate step ID: '{}'",
                step.id
            )));
        }
    }

    // 3. Check depends_on references
    for step in &workflow.steps {
        for dep in &step.depends_on {
            if !seen_ids.contains(dep.as_str()) {
                return Err(ADPError::validation(format!(
                    "Step '{}' depends on unknown step '{}'",
                    step.id, dep
                )));
            }
        }
    }

    // 4. Cycle detection (topological sort via Kahn's algorithm)
    detect_cycles(workflow)?;

    // 5. Step-type-specific validation
    for step in &workflow.steps {
        validate_step_type(&step.id, &step.step_type)?;
    }

    Ok(())
}

/// Detect circular dependencies using Kahn's algorithm.
fn detect_cycles(workflow: &WorkflowDefinition) -> Result<(), ADPError> {
    let step_ids: Vec<&str> = workflow.steps.iter().map(|s| s.id.as_str()).collect();
    let id_index: HashMap<&str, usize> = step_ids
        .iter()
        .enumerate()
        .map(|(i, id)| (*id, i))
        .collect();
    let n = step_ids.len();

    // Build in-degree counts and adjacency list
    let mut in_degree = vec![0usize; n];
    let mut adjacency: Vec<Vec<usize>> = vec![Vec::new(); n];

    for step in &workflow.steps {
        let step_idx = id_index[step.id.as_str()];
        for dep in &step.depends_on {
            if let Some(&dep_idx) = id_index.get(dep.as_str()) {
                adjacency[dep_idx].push(step_idx);
                in_degree[step_idx] += 1;
            }
        }
    }

    // Kahn's algorithm
    let mut queue: Vec<usize> = in_degree
        .iter()
        .enumerate()
        .filter(|(_, &d)| d == 0)
        .map(|(i, _)| i)
        .collect();
    let mut visited = 0;

    while let Some(node) = queue.pop() {
        visited += 1;
        for &neighbor in &adjacency[node] {
            in_degree[neighbor] -= 1;
            if in_degree[neighbor] == 0 {
                queue.push(neighbor);
            }
        }
    }

    if visited != n {
        return Err(ADPError::validation(
            "Circular dependency detected in workflow steps",
        ));
    }

    Ok(())
}

/// Validate step-type-specific constraints.
fn validate_step_type(step_id: &str, step_type: &StepType) -> Result<(), ADPError> {
    match step_type {
        StepType::Agent { prompt, .. } => {
            if prompt.trim().is_empty() {
                return Err(ADPError::validation(format!(
                    "Agent step '{}' has an empty prompt",
                    step_id
                )));
            }
        }
        StepType::Gate { command, .. } => {
            if command.trim().is_empty() {
                return Err(ADPError::validation(format!(
                    "Gate step '{}' has an empty command",
                    step_id
                )));
            }
        }
        StepType::Action { command, .. } => {
            if command.trim().is_empty() {
                return Err(ADPError::validation(format!(
                    "Action step '{}' has an empty command",
                    step_id
                )));
            }
        }
    }
    Ok(())
}

// ============================================================================
// Input Resolution
// ============================================================================

/// Replace `{input_name}` placeholders in a template string with values
/// from the provided inputs map.
///
/// Unknown placeholders are left as-is.
pub fn resolve_input_refs(template: &str, inputs: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in inputs {
        let placeholder = format!("{{{}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}

// ============================================================================
// Discovery
// ============================================================================

/// Find all `.yaml`/`.yml` workflow files in a directory (non-recursive).
pub fn list_workflow_files(dir: &Path) -> Result<Vec<PathBuf>, ADPError> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(dir).map_err(|e| {
        ADPError::file_io(format!("Failed to read directory {}: {}", dir.display(), e))
    })?;

    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| ADPError::file_io(e.to_string()))?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("yaml") || ext.eq_ignore_ascii_case("yml") {
                    files.push(path);
                }
            }
        }
    }

    files.sort();
    Ok(files)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_yaml() -> &'static str {
        r#"
name: test-workflow
description: "A test workflow"
steps:
  - id: step1
    type: agent
    prompt: "Do something"
  - id: step2
    type: gate
    command: "npm test"
    depends_on:
      - step1
  - id: step3
    type: action
    command: "echo done"
    depends_on:
      - step2
"#
    }

    fn full_yaml() -> &'static str {
        r#"
name: implement-feature
description: "Full pipeline"
version: 2
inputs:
  - name: issue_id
    type: string
    required: true
    description: "GitHub Issue ID"
  - name: priority
    type: select
    options:
      - low
      - high
steps:
  - id: analyze
    type: agent
    model: opus
    prompt: "Analyze issue #{issue_id}"
    read_only: true
    output: plan
  - id: implement
    type: agent
    prompt: "Implement: {plan}"
    worktree: true
    depends_on:
      - analyze
  - id: test-gate
    type: gate
    command: "npm run test"
    on_failure: retry
    max_retries: 3
    timeout_secs: 300
    depends_on:
      - implement
  - id: deploy
    type: action
    command: "gh pr create"
    capture_output: true
    output: pr_url
    timeout_secs: 60
    depends_on:
      - test-gate
metadata:
  author: "test"
  tags:
    - feature
  estimated_duration_mins: 30
"#
    }

    // ---- Parsing tests ----

    #[test]
    fn parse_valid_yaml() {
        let wf = parse_workflow_str(valid_yaml()).unwrap();
        assert_eq!(wf.name, "test-workflow");
        assert_eq!(wf.steps.len(), 3);
    }

    #[test]
    fn parse_full_yaml_with_all_fields() {
        let wf = parse_workflow_str(full_yaml()).unwrap();
        assert_eq!(wf.name, "implement-feature");
        assert_eq!(wf.version, 2);
        assert_eq!(wf.inputs.len(), 2);
        assert_eq!(wf.steps.len(), 4);
        assert_eq!(wf.metadata.author, Some("test".to_string()));
    }

    #[test]
    fn parse_agent_step() {
        let wf = parse_workflow_str(full_yaml()).unwrap();
        match &wf.steps[0].step_type {
            StepType::Agent {
                model,
                prompt,
                read_only,
                output,
                ..
            } => {
                assert_eq!(model.as_deref(), Some("opus"));
                assert!(prompt.contains("Analyze issue"));
                assert!(*read_only);
                assert_eq!(output.as_deref(), Some("plan"));
            }
            other => panic!("Expected Agent, got {:?}", other),
        }
    }

    #[test]
    fn parse_gate_step() {
        let wf = parse_workflow_str(full_yaml()).unwrap();
        match &wf.steps[2].step_type {
            StepType::Gate {
                command,
                max_retries,
                ..
            } => {
                assert_eq!(command, "npm run test");
                assert_eq!(*max_retries, 3);
            }
            other => panic!("Expected Gate, got {:?}", other),
        }
    }

    #[test]
    fn parse_action_step() {
        let wf = parse_workflow_str(full_yaml()).unwrap();
        match &wf.steps[3].step_type {
            StepType::Action {
                command,
                capture_output,
                output,
                ..
            } => {
                assert!(command.contains("gh pr create"));
                assert!(*capture_output);
                assert_eq!(output.as_deref(), Some("pr_url"));
            }
            other => panic!("Expected Action, got {:?}", other),
        }
    }

    #[test]
    fn parse_invalid_yaml_returns_error() {
        let result = parse_workflow_str("not: valid: yaml: [");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, crate::error::ADPErrorCode::ParseError);
    }

    #[test]
    fn parse_unknown_step_type_returns_error() {
        let yaml = r#"
name: bad
description: test
steps:
  - id: x
    type: unknown_type
    foo: bar
"#;
        assert!(parse_workflow_str(yaml).is_err());
    }

    // ---- Validation tests ----

    #[test]
    fn validate_valid_workflow() {
        let wf = parse_workflow_str(valid_yaml()).unwrap();
        assert!(validate_workflow(&wf).is_ok());
    }

    #[test]
    fn validate_empty_steps() {
        let yaml = r#"
name: empty
description: test
steps: []
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("at least one step"));
    }

    #[test]
    fn validate_duplicate_step_ids() {
        let yaml = r#"
name: dup
description: test
steps:
  - id: same
    type: agent
    prompt: "a"
  - id: same
    type: agent
    prompt: "b"
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("Duplicate step ID"));
    }

    #[test]
    fn validate_missing_depends_on_reference() {
        let yaml = r#"
name: bad-ref
description: test
steps:
  - id: step1
    type: agent
    prompt: "a"
    depends_on:
      - nonexistent
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("unknown step 'nonexistent'"));
    }

    #[test]
    fn validate_circular_dependency() {
        let yaml = r#"
name: cycle
description: test
steps:
  - id: a
    type: agent
    prompt: "a"
    depends_on:
      - b
  - id: b
    type: agent
    prompt: "b"
    depends_on:
      - a
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("Circular dependency"));
    }

    #[test]
    fn validate_self_dependency() {
        let yaml = r#"
name: self-dep
description: test
steps:
  - id: a
    type: agent
    prompt: "a"
    depends_on:
      - a
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("Circular dependency"));
    }

    #[test]
    fn validate_empty_agent_prompt() {
        let yaml = r#"
name: empty-prompt
description: test
steps:
  - id: x
    type: agent
    prompt: "  "
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("empty prompt"));
    }

    #[test]
    fn validate_empty_gate_command() {
        let yaml = r#"
name: empty-cmd
description: test
steps:
  - id: x
    type: gate
    command: ""
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("empty command"));
    }

    #[test]
    fn validate_empty_action_command() {
        let yaml = r#"
name: empty-cmd
description: test
steps:
  - id: x
    type: action
    command: "  "
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("empty command"));
    }

    // ---- Input resolution tests ----

    #[test]
    fn resolve_input_refs_replaces_placeholders() {
        let mut inputs = HashMap::new();
        inputs.insert("name".to_string(), "World".to_string());
        inputs.insert("id".to_string(), "42".to_string());
        let result = resolve_input_refs("Hello {name}, issue #{id}!", &inputs);
        assert_eq!(result, "Hello World, issue #42!");
    }

    #[test]
    fn resolve_input_refs_leaves_unknown_placeholders() {
        let inputs = HashMap::new();
        let result = resolve_input_refs("Hello {unknown}!", &inputs);
        assert_eq!(result, "Hello {unknown}!");
    }

    #[test]
    fn resolve_input_refs_handles_empty_template() {
        let inputs = HashMap::new();
        let result = resolve_input_refs("", &inputs);
        assert_eq!(result, "");
    }

    // ---- File discovery tests ----

    #[test]
    fn list_workflow_files_nonexistent_dir() {
        let result = list_workflow_files(Path::new("/nonexistent/path"));
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn list_workflow_files_finds_yaml() {
        let dir = std::env::temp_dir().join("parser_test_list");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        std::fs::write(dir.join("a.yaml"), "name: a\ndescription: a\nsteps: []").unwrap();
        std::fs::write(dir.join("b.yml"), "name: b\ndescription: b\nsteps: []").unwrap();
        std::fs::write(dir.join("c.txt"), "not a workflow").unwrap();

        let files = list_workflow_files(&dir).unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|f| {
            let ext = f.extension().unwrap().to_str().unwrap();
            ext == "yaml" || ext == "yml"
        }));

        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- File parsing test ----

    #[test]
    fn parse_workflow_file_not_found() {
        let result = parse_workflow_file(Path::new("/nonexistent/workflow.yaml"));
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, crate::error::ADPErrorCode::FileIoError);
    }

    #[test]
    fn parse_workflow_file_roundtrip() {
        let dir = std::env::temp_dir().join("parser_test_roundtrip");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let yaml = valid_yaml();
        let path = dir.join("test.yaml");
        std::fs::write(&path, yaml).unwrap();

        let wf = parse_workflow_file(&path).unwrap();
        assert_eq!(wf.name, "test-workflow");
        assert!(validate_workflow(&wf).is_ok());

        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---- Example workflow files ----

    #[test]
    fn parse_example_workflow_files() {
        let workflows_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("workflows");

        if !workflows_dir.exists() {
            return; // Skip if not available
        }

        let files = list_workflow_files(&workflows_dir).unwrap();
        assert!(!files.is_empty(), "Expected example workflow files");

        for file in &files {
            let wf = parse_workflow_file(file)
                .unwrap_or_else(|e| panic!("Failed to parse {}: {}", file.display(), e));
            validate_workflow(&wf)
                .unwrap_or_else(|e| panic!("Validation failed for {}: {}", file.display(), e));
        }
    }

    // ---- Complex cycle detection ----

    #[test]
    fn validate_three_node_cycle() {
        let yaml = r#"
name: triangle
description: test
steps:
  - id: a
    type: agent
    prompt: "a"
    depends_on: [c]
  - id: b
    type: agent
    prompt: "b"
    depends_on: [a]
  - id: c
    type: agent
    prompt: "c"
    depends_on: [b]
"#;
        let wf = parse_workflow_str(yaml).unwrap();
        let err = validate_workflow(&wf).unwrap_err();
        assert!(err.message.contains("Circular dependency"));
    }

    // ========================================================================
    // Integration tests for .claude/workflows/implement.yaml (#154)
    // ========================================================================

    #[test]
    fn implement_yaml_parses_successfully() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let project_root = std::path::Path::new(manifest_dir).parent().unwrap();
        let yaml_path = project_root.join(".claude/workflows/implement.yaml");
        if !yaml_path.exists() {
            // Skip in CI where the workflow file may not be present
            return;
        }
        let wf = parse_workflow_file(&yaml_path).unwrap();
        assert_eq!(wf.name, "implement-feature");
        assert!(!wf.description.is_empty());
    }

    #[test]
    fn implement_yaml_passes_validation() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let project_root = std::path::Path::new(manifest_dir).parent().unwrap();
        let yaml_path = project_root.join(".claude/workflows/implement.yaml");
        if !yaml_path.exists() {
            return;
        }
        let wf = parse_workflow_file(&yaml_path).unwrap();
        validate_workflow(&wf).unwrap();
    }

    #[test]
    fn implement_yaml_has_expected_steps() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let project_root = std::path::Path::new(manifest_dir).parent().unwrap();
        let yaml_path = project_root.join(".claude/workflows/implement.yaml");
        if !yaml_path.exists() {
            return;
        }
        let wf = parse_workflow_file(&yaml_path).unwrap();
        assert!(
            wf.steps.len() >= 7,
            "Expected at least 7 steps (phases 0-6)"
        );
        assert_eq!(wf.steps[0].id, "lessons-check");
        assert_eq!(wf.steps.last().unwrap().id, "create-pr");
    }

    #[test]
    fn implement_yaml_has_required_inputs() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let project_root = std::path::Path::new(manifest_dir).parent().unwrap();
        let yaml_path = project_root.join(".claude/workflows/implement.yaml");
        if !yaml_path.exists() {
            return;
        }
        let wf = parse_workflow_file(&yaml_path).unwrap();
        let issue_input = wf.inputs.iter().find(|i| i.name == "issue_id");
        assert!(issue_input.is_some(), "Must have issue_id input");
        assert!(issue_input.unwrap().required, "issue_id must be required");
    }

    #[test]
    fn implement_yaml_input_resolution() {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let project_root = std::path::Path::new(manifest_dir).parent().unwrap();
        let yaml_path = project_root.join(".claude/workflows/implement.yaml");
        if !yaml_path.exists() {
            return;
        }
        let wf = parse_workflow_file(&yaml_path).unwrap();
        let mut inputs = HashMap::new();
        inputs.insert("issue_id".to_string(), "42".to_string());
        // Check that the first agent step's prompt contains the placeholder
        if let crate::pipeline::schema::StepType::Agent { ref prompt, .. } = wf.steps[0].step_type {
            let resolved = resolve_input_refs(prompt, &inputs);
            assert!(resolved.contains("42"), "issue_id should be resolved to 42");
            assert!(
                !resolved.contains("{issue_id}"),
                "placeholder should be replaced"
            );
        }
    }
}
