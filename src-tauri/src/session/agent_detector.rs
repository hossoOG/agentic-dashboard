// src-tauri/src/session/agent_detector.rs
//
// Detects Claude Code subagent spawns, completions, and worktree creation
// from PTY terminal output. Operates on ANSI-stripped text.

use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

/// Maximum buffer size for rolling output window (in chars).
const MAX_BUFFER: usize = 4000;

/// Maximum number of completed/errored agents to keep in memory.
/// Running agents are never pruned.
const MAX_COMPLETED_AGENTS: usize = 50;

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: Option<String>,
    pub task: Option<String>,
    pub status: String, // "running" | "completed" | "error"
    pub detected_at: i64,
    pub completed_at: Option<i64>,
    pub worktree_path: Option<String>,
}

// --- Tauri Event Payloads ---

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentDetectedEvent {
    pub session_id: String,
    pub agent_id: String,
    pub name: Option<String>,
    pub task: Option<String>,
    pub detected_at: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentCompletedEvent {
    pub session_id: String,
    pub agent_id: String,
    pub status: String,
    pub completed_at: i64,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct WorktreeDetectedEvent {
    pub session_id: String,
    pub path: String,
    pub branch: Option<String>,
    pub agent_id: Option<String>,
}

// --- Worktree scan result ---

#[derive(Clone, Debug, serde::Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
}

/// Events emitted by the detector after processing a chunk.
#[derive(Clone, Debug)]
pub enum AgentEvent {
    Detected(AgentDetectedEvent),
    Completed(AgentCompletedEvent),
    Worktree(WorktreeDetectedEvent),
}

struct AgentPatterns {
    agent_launch: Regex,
    agent_name_task: Regex,
    agent_complete: Regex,
    agent_error: Regex,
    worktree_create: Regex,
    worktree_path: Regex,
}

/// Process-global singleton — patterns are compiled once on first access.
static PATTERNS: OnceLock<AgentPatterns> = OnceLock::new();

fn get_patterns() -> &'static AgentPatterns {
    PATTERNS.get_or_init(|| AgentPatterns {
        // Matches patterns like "Agent launched", "Starting agent", "⏳ Starting agent"
        agent_launch: Regex::new(
            r"(?i)(?:agent\s+launched|starting\s+agent|spawning.*agent|tool.*:\s*agent)",
        )
        .expect("agent_launch regex invalid"),
        // Try to extract agent name/task from surrounding text
        agent_name_task: Regex::new(r#"(?i)(?:agent|name)[:\s]+["']?([^"'\n]{3,60})["']?"#)
            .expect("agent_name_task regex invalid"),
        // Matches agent completion patterns
        agent_complete: Regex::new(
            r"(?i)(?:agent\s+completed|agent\s+finished|agent.*done|completed\s+successfully)",
        )
        .expect("agent_complete regex invalid"),
        // Matches agent error patterns
        agent_error: Regex::new(r"(?i)(?:agent\s+(?:failed|error|crashed)|agent.*error)")
            .expect("agent_error regex invalid"),
        // Matches worktree creation
        worktree_create: Regex::new(
            r"(?i)(?:git\s+worktree\s+add|created?\s+worktree|worktree\s+created)",
        )
        .expect("worktree_create regex invalid"),
        // Extract worktree path
        worktree_path: Regex::new(r#"(?:worktree[s]?[/\\]|worktree\s+add\s+)([^\s\n"']+)"#)
            .expect("worktree_path regex invalid"),
    })
}

pub struct AgentDetector {
    session_id: String,
    buffer: String,
    known_agents: HashMap<String, AgentInfo>,
    agent_counter: u32,
    /// Track what we've already processed to avoid duplicate events
    last_processed_len: usize,
    /// Recent agent launches for deduplication: (name, timestamp_ms)
    recent_launches: Vec<(String, i64)>,
}

impl AgentDetector {
    pub fn new(session_id: String) -> Self {
        Self {
            session_id,
            buffer: String::with_capacity(MAX_BUFFER),
            known_agents: HashMap::new(),
            agent_counter: 0,
            last_processed_len: 0,
            recent_launches: Vec::new(),
        }
    }

    /// Feed a chunk of ANSI-stripped terminal output and return any detected events.
    pub fn feed(&mut self, stripped_chunk: &str) -> Vec<AgentEvent> {
        // Append to rolling buffer
        self.buffer.push_str(stripped_chunk);

        // Trim buffer if too large (keep the tail)
        if self.buffer.len() > MAX_BUFFER {
            let mut trim_at = self.buffer.len() - (MAX_BUFFER / 2);
            // Find a valid char boundary (advance until we hit one)
            while trim_at < self.buffer.len() && !self.buffer.is_char_boundary(trim_at) {
                trim_at += 1;
            }
            let old_processed = self.last_processed_len;
            self.buffer = self.buffer[trim_at..].to_string();
            // Adjust processed marker: keep only the portion that was already scanned
            self.last_processed_len = old_processed.saturating_sub(trim_at);
        }

        let mut events = Vec::new();

        // Only scan the new portion of the buffer
        let scan_start = self.last_processed_len.min(self.buffer.len());
        let scan_text = &self.buffer[scan_start..];

        if scan_text.is_empty() {
            self.last_processed_len = self.buffer.len();
            return events;
        }

        let p = get_patterns();

        // Check for agent launches
        if p.agent_launch.is_match(scan_text) {
            let now = chrono::Utc::now().timestamp_millis();

            // Try to extract name/task from context
            let name = p
                .agent_name_task
                .captures(scan_text)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().trim().to_string());

            // Deduplication: skip if same agent name was detected within 2000ms cooldown
            let dedup_key = name.clone().unwrap_or_default();
            let is_duplicate = !dedup_key.is_empty()
                && self
                    .recent_launches
                    .iter()
                    .any(|(n, ts)| n == &dedup_key && (now - ts).abs() < 2000);

            // Clean up old entries (older than 5 seconds)
            self.recent_launches.retain(|(_, ts)| (now - ts).abs() < 5000);

            if !is_duplicate {
                self.agent_counter += 1;
                let agent_id = format!("{}-agent-{}", self.session_id, self.agent_counter);

                // Record this launch for future dedup
                if !dedup_key.is_empty() {
                    self.recent_launches.push((dedup_key, now));
                }

                let info = AgentInfo {
                    id: agent_id.clone(),
                    name: name.clone(),
                    task: name.clone(), // Use name as task for now
                    status: "running".to_string(),
                    detected_at: now,
                    completed_at: None,
                    worktree_path: None,
                };

                self.known_agents.insert(agent_id.clone(), info);

                events.push(AgentEvent::Detected(AgentDetectedEvent {
                    session_id: self.session_id.clone(),
                    agent_id,
                    name: name.clone(),
                    task: name,
                    detected_at: now,
                }));
            }
        }

        // Check for agent completions
        if p.agent_complete.is_match(scan_text) {
            let context_name = p
                .agent_name_task
                .captures(scan_text)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().trim().to_string());
            if let Some(agent_id) = self.find_running_agent_by_name(context_name.as_deref()) {
                let now = chrono::Utc::now().timestamp_millis();
                if let Some(info) = self.known_agents.get_mut(&agent_id) {
                    info.status = "completed".to_string();
                    info.completed_at = Some(now);
                }
                events.push(AgentEvent::Completed(AgentCompletedEvent {
                    session_id: self.session_id.clone(),
                    agent_id,
                    status: "completed".to_string(),
                    completed_at: now,
                }));
            }
        }

        // Check for agent errors
        if p.agent_error.is_match(scan_text) {
            let context_name = p
                .agent_name_task
                .captures(scan_text)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().trim().to_string());
            if let Some(agent_id) = self.find_running_agent_by_name(context_name.as_deref()) {
                let now = chrono::Utc::now().timestamp_millis();
                if let Some(info) = self.known_agents.get_mut(&agent_id) {
                    info.status = "error".to_string();
                    info.completed_at = Some(now);
                }
                events.push(AgentEvent::Completed(AgentCompletedEvent {
                    session_id: self.session_id.clone(),
                    agent_id,
                    status: "error".to_string(),
                    completed_at: now,
                }));
            }
        }

        // Check for worktree creation
        if p.worktree_create.is_match(scan_text) {
            let path = p
                .worktree_path
                .captures(scan_text)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            // Try to associate with the most recent running agent
            let agent_id = self.find_running_agent();

            // Update agent's worktree path
            if let Some(ref aid) = agent_id {
                if let Some(info) = self.known_agents.get_mut(aid) {
                    info.worktree_path = Some(path.clone());
                }
            }

            events.push(AgentEvent::Worktree(WorktreeDetectedEvent {
                session_id: self.session_id.clone(),
                path,
                branch: None,
                agent_id,
            }));
        }

        self.last_processed_len = self.buffer.len();
        self.prune_completed_agents();
        events
    }

    /// Remove the oldest completed/errored agents when the map exceeds the threshold.
    /// Running agents are never pruned.
    fn prune_completed_agents(&mut self) {
        // Collect completed agents sorted by completion time (oldest first)
        let mut completed: Vec<(String, i64)> = self
            .known_agents
            .iter()
            .filter(|(_, a)| a.status != "running")
            .map(|(id, a)| (id.clone(), a.completed_at.unwrap_or(a.detected_at)))
            .collect();

        if completed.len() <= MAX_COMPLETED_AGENTS {
            return;
        }

        completed.sort_by_key(|(_, ts)| *ts);

        let to_remove = completed.len() - MAX_COMPLETED_AGENTS;
        for (id, _) in completed.into_iter().take(to_remove) {
            self.known_agents.remove(&id);
        }
    }

    /// Find a running agent by name, falling back to most-recently-spawned if no name match.
    fn find_running_agent_by_name(&self, name_hint: Option<&str>) -> Option<String> {
        let running: Vec<&AgentInfo> = self
            .known_agents
            .values()
            .filter(|a| a.status == "running")
            .collect();

        // Try to match by name first
        if let Some(hint) = name_hint {
            let hint_lower = hint.to_lowercase();
            if let Some(matched) = running
                .iter()
                .filter(|a| {
                    a.name
                        .as_ref()
                        .map(|n| n.to_lowercase().contains(&hint_lower) || hint_lower.contains(&n.to_lowercase()))
                        .unwrap_or(false)
                })
                .max_by_key(|a| a.detected_at)
            {
                return Some(matched.id.clone());
            }
        }

        // Fallback: most recently spawned running agent
        running
            .into_iter()
            .max_by_key(|a| a.detected_at)
            .map(|a| a.id.clone())
    }

    /// Find the most recently spawned agent that's still running.
    fn find_running_agent(&self) -> Option<String> {
        self.find_running_agent_by_name(None)
    }

    /// Get all known agents for this session.
    pub fn known_agents(&self) -> &HashMap<String, AgentInfo> {
        &self.known_agents
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Buffer handling ──────────────────────────────────────────────

    #[test]
    fn empty_input_produces_no_events() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("");
        assert!(events.is_empty());
    }

    #[test]
    fn plain_text_produces_no_events() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("hello world\nsome normal output\n");
        assert!(events.is_empty());
    }

    #[test]
    fn partial_line_not_detected_until_full_pattern_present() {
        let mut det = AgentDetector::new("s1".into());
        // "Agent " alone matches neither launch pattern, so no event
        let events = det.feed("Agent ");
        assert!(events.is_empty());
        // The dedup scan window means only the NEW portion is checked.
        // "launched" alone doesn't match "agent launched", so no detection:
        let events = det.feed("launched\n");
        // Because last_processed_len already covers "Agent ", only "launched\n"
        // is scanned — which doesn't match. This tests the buffer dedup behavior.
        assert_eq!(count_detected(&events), 0);
    }

    #[test]
    fn full_pattern_in_single_chunk_detected() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("Agent launched\n");
        assert_eq!(count_detected(&events), 1);
    }

    #[test]
    fn buffer_trimmed_after_max_size() {
        let mut det = AgentDetector::new("s1".into());
        // Feed a chunk larger than MAX_BUFFER
        let large = "x".repeat(MAX_BUFFER + 1000);
        let events = det.feed(&large);
        assert!(events.is_empty());
        // Buffer should have been trimmed to roughly MAX_BUFFER/2
        assert!(
            det.buffer.len() <= MAX_BUFFER,
            "Buffer should be trimmed to at most MAX_BUFFER, got {}",
            det.buffer.len()
        );
    }

    #[test]
    fn buffer_trim_adjusts_processed_marker() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("Agent launched\n");
        assert_eq!(count_detected(&events), 1);

        // Fill buffer beyond MAX_BUFFER to trigger trim
        let filler = "y".repeat(MAX_BUFFER + 500);
        det.feed(&filler);

        // After trim, the buffer's last_processed_len is adjusted.
        // The name-based dedup (recent_launches with 2000ms cooldown) still prevents
        // re-detection of "launched" within the cooldown window.
        let events = det.feed("Agent launched\n");
        assert_eq!(
            count_detected(&events),
            0,
            "Name-based dedup should prevent re-detection within cooldown"
        );
    }

    #[test]
    fn different_name_after_buffer_trim_is_detected() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("Agent launched\n");
        assert_eq!(count_detected(&events), 1);

        // Fill buffer beyond MAX_BUFFER to trigger trim
        let filler = "y".repeat(MAX_BUFFER + 500);
        det.feed(&filler);

        // A different pattern with a different extracted name should still work
        let events = det.feed("Starting agent\n");
        assert_eq!(count_detected(&events), 1);
    }

    // ── Duplicate detection ──────────────────────────────────────────

    #[test]
    fn same_text_fed_twice_without_trim_does_not_duplicate() {
        let mut det = AgentDetector::new("s1".into());
        let events1 = det.feed("Agent launched\n");
        assert_eq!(count_detected(&events1), 1);

        // Feed unrelated text — the old text is still in the buffer but already processed
        let events2 = det.feed("some other output\n");
        assert_eq!(count_detected(&events2), 0);
    }

    #[test]
    fn different_agents_detected_independently() {
        let mut det = AgentDetector::new("s1".into());
        let events1 = det.feed("Starting agent\n");
        assert_eq!(count_detected(&events1), 1);

        let events2 = det.feed("Agent launched\n");
        assert_eq!(count_detected(&events2), 1);

        assert_eq!(det.known_agents().len(), 2);
    }

    // ── Name matching ────────────────────────────────────────────────

    #[test]
    fn name_regex_captures_text_after_agent_keyword() {
        let mut det = AgentDetector::new("s1".into());
        // The name regex: (?i)(?:agent|name)[:\s]+["']?([^"'\n]{3,60})["']?
        // "Agent launched" → "agent" + space + captures "launched"
        let events = det.feed("Agent launched\n");
        let detected = first_detected(&events).expect("should detect agent");
        assert_eq!(detected.name.as_deref(), Some("launched"));
    }

    #[test]
    fn name_regex_first_match_wins() {
        let mut det = AgentDetector::new("s1".into());
        // "Starting agent\nname: fix-bug\n" — regex first finds "agent" in
        // "Starting agent", then [:\s]+ consumes "\n", then captures "name: fix-bug"
        let events = det.feed("Starting agent\nname: fix-bug\n");
        let detected = first_detected(&events).expect("should detect agent");
        // First match is "agent\nname: fix-bug" → capture group = "name: fix-bug"
        assert_eq!(detected.name.as_deref(), Some("name: fix-bug"));
    }

    #[test]
    fn name_extracted_from_explicit_agent_colon_syntax() {
        let mut det = AgentDetector::new("s1".into());
        // "tool: agent" triggers launch; "agent: review-code" → name = "review-code"
        let events = det.feed("tool: agent\nagent: review-code\n");
        let detected = first_detected(&events).expect("should detect agent");
        // First name regex match: "agent\nagent: review-code" from the launch line
        // Actually "agent" in "tool: agent" → [:\s]+ matches "\n" → captures "agent: review-code"
        assert_eq!(detected.name.as_deref(), Some("agent: review-code"));
    }

    #[test]
    fn no_name_when_text_too_short() {
        let mut det = AgentDetector::new("s1".into());
        // Name capture requires 3+ chars. "Agent ab\n" — "ab" is only 2 chars
        let events = det.feed("Spawning agent\n");
        let detected = first_detected(&events).expect("should detect agent");
        // "agent" in "Spawning agent" + "\n" — nothing after newline on same match
        // The [:\s]+ eats the \n then [^"'\n]{3,60} needs 3+ non-newline chars
        // There's nothing after the \n in the scan text, so no capture
        assert!(detected.name.is_none());
    }

    #[test]
    fn tool_agent_pattern_detected() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("Tool: Agent\n");
        assert_eq!(count_detected(&events), 1);
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    #[test]
    fn agent_spawn_sets_running_status() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("Agent launched\n");
        let agents = det.known_agents();
        assert_eq!(agents.len(), 1);
        let info = agents.values().next().unwrap();
        assert_eq!(info.status, "running");
        assert!(info.completed_at.is_none());
    }

    #[test]
    fn agent_completion_sets_completed_status() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("Agent launched\n");
        det.feed("Agent completed\n");
        let agents = det.known_agents();
        let info = agents.values().next().unwrap();
        assert_eq!(info.status, "completed");
        assert!(info.completed_at.is_some());
    }

    #[test]
    fn agent_error_sets_error_status() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("Agent launched\n");
        det.feed("Agent failed\n");
        let agents = det.known_agents();
        let info = agents.values().next().unwrap();
        assert_eq!(info.status, "error");
        assert!(info.completed_at.is_some());
    }

    #[test]
    fn completion_without_running_agent_is_noop() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("Agent completed\n");
        // No running agent → no completion event
        assert!(
            !events
                .iter()
                .any(|e| matches!(e, AgentEvent::Completed(_))),
            "Should not emit Completed without a running agent"
        );
    }

    #[test]
    fn known_agents_returns_correct_state_after_lifecycle() {
        let mut det = AgentDetector::new("sess".into());

        // Spawn two agents
        det.feed("Agent launched\n");
        det.feed("Starting agent\n");
        assert_eq!(det.known_agents().len(), 2);

        // Complete one
        det.feed("Agent completed\n");

        let running: Vec<_> = det
            .known_agents()
            .values()
            .filter(|a| a.status == "running")
            .collect();
        let completed: Vec<_> = det
            .known_agents()
            .values()
            .filter(|a| a.status == "completed")
            .collect();

        assert_eq!(running.len(), 1);
        assert_eq!(completed.len(), 1);
    }

    #[test]
    fn worktree_detection_emits_event() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("Agent launched\n");
        let events = det.feed("created worktree\nworktrees/agent-abc123\n");
        assert!(
            events.iter().any(|e| matches!(e, AgentEvent::Worktree(_))),
            "Expected a Worktree event"
        );
    }

    #[test]
    fn worktree_path_extracted_and_linked_to_agent() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("Agent launched\n");
        det.feed("worktree created\nworktrees/my-branch\n");

        let agent = det.known_agents().values().next().unwrap().clone();
        assert_eq!(agent.worktree_path.as_deref(), Some("my-branch"));
    }

    // ── Pruning ──────────────────────────────────────────────────────

    #[test]
    fn completed_agents_pruned_when_exceeding_limit() {
        let mut det = AgentDetector::new("s1".into());
        for i in 0..(MAX_COMPLETED_AGENTS + 10) {
            // Each feed triggers a new agent and then completes it
            det.feed(&format!("Agent launched #{}\n", i));
            det.feed("Agent completed\n");
            // Need a new "running" agent for next completion — spawn fresh
        }
        let completed_count = det
            .known_agents()
            .values()
            .filter(|a| a.status != "running")
            .count();
        assert!(
            completed_count <= MAX_COMPLETED_AGENTS,
            "Completed agents should be pruned to {}, got {}",
            MAX_COMPLETED_AGENTS,
            completed_count
        );
    }

    // ── Helpers ──────────────────────────────────────────────────────

    fn count_detected(events: &[AgentEvent]) -> usize {
        events
            .iter()
            .filter(|e| matches!(e, AgentEvent::Detected(_)))
            .count()
    }

    fn first_detected(events: &[AgentEvent]) -> Option<&AgentDetectedEvent> {
        events.iter().find_map(|e| match e {
            AgentEvent::Detected(d) => Some(d),
            _ => None,
        })
    }
}

/// Scan a project folder for git worktrees.
/// Uses `git worktree list --porcelain` for reliable parsing.
pub fn scan_worktrees_in_folder(folder: &str) -> Result<Vec<WorktreeInfo>, String> {
    let mut cmd = crate::util::silent_command("git");
    cmd.args(["worktree", "list", "--porcelain"])
        .current_dir(folder);
    let output = crate::util::timed_output(cmd, crate::util::DEFAULT_COMMAND_TIMEOUT)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree list failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut is_bare = false;

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("worktree ") {
            // Save previous entry
            if let Some(path) = current_path.take() {
                if !is_bare {
                    worktrees.push(WorktreeInfo {
                        path,
                        branch: current_branch.take(),
                        is_main: worktrees.is_empty(), // First worktree is main
                    });
                }
            }
            current_path = Some(rest.to_string());
            current_branch = None;
            is_bare = false;
        } else if let Some(rest) = line.strip_prefix("branch ") {
            let branch = rest.to_string();
            current_branch = Some(branch.replace("refs/heads/", ""));
        } else if line == "bare" {
            is_bare = true;
        }
    }

    // Don't forget the last entry
    if let Some(path) = current_path {
        if !is_bare {
            worktrees.push(WorktreeInfo {
                path,
                branch: current_branch,
                is_main: worktrees.is_empty(),
            });
        }
    }

    Ok(worktrees)
}
