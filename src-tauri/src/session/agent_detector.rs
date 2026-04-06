// src-tauri/src/session/agent_detector.rs
//
// Detects Claude Code subagent spawns, task/phase status changes, completions,
// and worktree creation from PTY terminal output. Operates on ANSI-stripped text.
//
// Claude Code outputs structured Unicode markers (●, ■, □, ✓, ✗, ·, ✱) that
// survive ANSI stripping. This detector matches those specific signals instead
// of generic phrases like "agent launched" which cause false positives.

use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

/// Maximum buffer size for rolling output window (in chars).
const MAX_BUFFER: usize = 4000;

/// Maximum number of completed/errored agents to keep in memory.
/// Running agents are never pruned.
const MAX_COMPLETED_AGENTS: usize = 50;

// ============================================================================
// Data Model
// ============================================================================

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: Option<String>,
    pub task: Option<String>,
    pub task_number: Option<u32>,
    pub phase_number: Option<u32>,
    pub status: String, // "running" | "completed" | "error" | "pending" | "blocked"
    pub detected_at: i64,
    pub completed_at: Option<i64>,
    pub worktree_path: Option<String>,
    pub parent_agent_id: Option<String>,
    pub depth: u32,
    pub duration_str: Option<String>,
    pub token_count: Option<String>,
    pub blocked_by: Option<u32>,
}

// ============================================================================
// Tauri Event Payloads
// ============================================================================

#[derive(Clone, Debug, serde::Serialize)]
pub struct AgentDetectedEvent {
    pub session_id: String,
    pub agent_id: String,
    pub name: Option<String>,
    pub task: Option<String>,
    pub task_number: Option<u32>,
    pub phase_number: Option<u32>,
    pub parent_agent_id: Option<String>,
    pub depth: u32,
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
pub struct AgentStatusUpdateEvent {
    pub session_id: String,
    pub agent_id: String,
    pub status: String,
    pub duration_str: Option<String>,
    pub token_count: Option<String>,
    pub blocked_by: Option<u32>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct TaskSummaryEvent {
    pub session_id: String,
    pub pending_count: u32,
    pub completed_count: u32,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct WorktreeDetectedEvent {
    pub session_id: String,
    pub path: String,
    pub branch: Option<String>,
    pub agent_id: Option<String>,
}

// ============================================================================
// Worktree scan result (unchanged)
// ============================================================================

#[derive(Clone, Debug, serde::Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: Option<String>,
    pub is_main: bool,
}

// ============================================================================
// Event Enum
// ============================================================================

/// Events emitted by the detector after processing a chunk.
#[derive(Clone, Debug)]
pub enum AgentEvent {
    Detected(AgentDetectedEvent),
    Completed(AgentCompletedEvent),
    StatusUpdate(AgentStatusUpdateEvent),
    TaskSummary(TaskSummaryEvent),
    Worktree(WorktreeDetectedEvent),
}

// ============================================================================
// Regex Patterns — Claude Code specific
// ============================================================================

struct AgentPatterns {
    /// "● Agent(description)" or "● Explore(description)"
    agent_spawn: Regex,
    /// "· Task N: Name..." or "✱ Main task..." — anchored, · requires "Task N:"
    task_entry: Regex,
    /// "■ Task N: Name" / "□ Task N:" / "✓ Task N:" / "✗ Task N:"
    task_status: Regex,
    /// "■ Phase N: Name" / "✓ Phase N: Name (#55)"
    phase_status: Regex,
    /// "blocked by #N"
    blocked_by: Regex,
    /// "(2m 38s · ↓ 5.4k tokens)"
    metrics: Regex,
    /// "+3 pending, 1 completed"
    summary_line: Regex,
    /// "git worktree add" / "created worktree"
    worktree_create: Regex,
    /// Extract worktree path
    worktree_path: Regex,
    /// "✻ Churned for 1m 0s" — Claude finished processing
    session_complete: Regex,
}

/// Process-global singleton — patterns are compiled once on first access.
static PATTERNS: OnceLock<AgentPatterns> = OnceLock::new();

fn get_patterns() -> &'static AgentPatterns {
    PATTERNS.get_or_init(|| AgentPatterns {
        // ● (U+25CF) precedes tool calls in Claude Code output
        // Matches: "● Agent(desc)", "● Explore(desc)" — anchored to line start
        agent_spawn: Regex::new(
            r"^[\s]*●\s+(Agent|Explore)\(([^)]{1,200})\)",
        )
        .expect("agent_spawn regex"),

        // Task entry — two alternations to prevent false positives:
        //   · (U+00B7) REQUIRES "Task N:" prefix (otherwise it catches status bar text)
        //   ✱ (U+2731) allows free-form text (only used for main task headers)
        // Both anchored to line start (^) to prevent matching · buried in metric strings.
        // Named groups: num, name1 (numbered), name2 (main), parens (metrics)
        task_entry: Regex::new(
            r"^[\s]*(?:·\s+Task\s+(?P<num>\d+):\s*(?P<name1>.+?)|✱\s+(?P<name2>.+?))(?:\.{3})?\s*(?:\((?P<parens>[^)]+)\))?$",
        )
        .expect("task_entry regex"),

        // Status icons: ■ (U+25A0)=running, □ (U+25A1)=pending, ✓ (U+2713)=done, ✗ (U+2717)=error
        // Preceded by optional tree chars (├, └, │, spaces) — anchored to line start
        task_status: Regex::new(
            r"^[\s├└│]*([■□✓✗])\s+Task\s+(\d+):\s*(.+?)(?:\s*\.{3})?\s*$",
        )
        .expect("task_status regex"),

        // Phase status: same icons + "Phase N: Name (#55)" — anchored to line start
        phase_status: Regex::new(
            r"^[\s├└│]*([■□✓✗])\s+Phase\s+(\d+):\s*(.+?)(?:\s*\(#(\d+)\))?\s*$",
        )
        .expect("phase_status regex"),

        // Dependency: "blocked by #4" or "> blocked by #4"
        blocked_by: Regex::new(
            r"blocked\s+by\s+#(\d+)",
        )
        .expect("blocked_by regex"),

        // Metrics in parens: "(2m 38s · ↓ 5.4k tokens)"
        metrics: Regex::new(
            r"\((\d+[mh]\s*\d*s?)\s*[·•]\s*[↓⬇]\s*([\d.]+k?\s*tokens?)\)",
        )
        .expect("metrics regex"),

        // Summary: "+3 pending, 1 completed" or "… +3 pending, 1 completed"
        summary_line: Regex::new(
            r"\+(\d+)\s+pending(?:,\s*(\d+)\s+completed)?",
        )
        .expect("summary_line regex"),

        // Worktree creation (kept from original — matches real git output)
        worktree_create: Regex::new(
            r"(?i)(?:git\s+worktree\s+add|created?\s+worktree|worktree\s+created)",
        )
        .expect("worktree_create regex"),

        // Worktree path extraction
        worktree_path: Regex::new(
            r#"(?:worktrees?[/\\]|worktree\s+add\s+)([^\s\n"']+)"#,
        )
        .expect("worktree_path regex"),

        // "✻ Churned for 1m 0s" — Claude finished processing, all agents done
        session_complete: Regex::new(
            r"✻\s+Churned\s+for",
        )
        .expect("session_complete regex"),
    })
}

// ============================================================================
// Status icon → status string mapping
// ============================================================================

fn icon_to_status(icon: &str) -> &'static str {
    match icon {
        "■" => "running",
        "□" => "pending",
        "✓" => "completed",
        "✗" => "error",
        _ => "running",
    }
}

fn is_terminal_status(status: &str) -> bool {
    status == "completed" || status == "error"
}

/// Detect status-bar and spinner noise that should never be matched as agents.
/// These are transient terminal updates from Claude Code's UI, not structured output.
fn is_noise_line(line: &str) -> bool {
    let trimmed = line.trim();
    // Braille spinner characters (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) used for progress animation
    const SPINNER_CHARS: &[char] = &['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    if trimmed.starts_with(SPINNER_CHARS) {
        return true;
    }
    // Status bar keyboard hints
    if trimmed.contains("esc to interrupt") || trimmed.contains("shift+tab to cycle") {
        return true;
    }
    // Bare metric fragments (e.g. "↓ 342 tokens · thought for 4s)")
    if trimmed.starts_with('↓') || trimmed.starts_with('⬇') {
        return true;
    }
    false
}

// ============================================================================
// AgentDetector
// ============================================================================

pub struct AgentDetector {
    session_id: String,
    buffer: String,
    known_agents: HashMap<String, AgentInfo>,
    agent_counter: u32,
    /// Track what we've already processed to avoid duplicate events
    last_processed_len: usize,
    /// Recent agent launches for deduplication: (name, timestamp_ms)
    recent_launches: Vec<(String, i64)>,
    /// Stack of currently-active agent IDs for hierarchy tracking
    agent_stack: Vec<String>,
    /// Unique key (e.g. "phase-1-Shell-Injection") → agent ID mapping
    task_agents: HashMap<String, String>,
    /// Task/phase number → list of agent IDs (for dependency resolution via blocked_by)
    task_number_agents: HashMap<u32, Vec<String>>,
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
            agent_stack: Vec::new(),
            task_agents: HashMap::new(),
            task_number_agents: HashMap::new(),
        }
    }

    /// Feed a chunk of ANSI-stripped terminal output and return any detected events.
    pub fn feed(&mut self, stripped_chunk: &str) -> Vec<AgentEvent> {
        // Append to rolling buffer
        self.buffer.push_str(stripped_chunk);

        // Trim buffer if too large (keep the tail)
        if self.buffer.len() > MAX_BUFFER {
            let mut trim_at = self.buffer.len() - (MAX_BUFFER / 2);
            // Find a valid char boundary
            while trim_at < self.buffer.len() && !self.buffer.is_char_boundary(trim_at) {
                trim_at += 1;
            }
            let old_processed = self.last_processed_len;
            self.buffer = self.buffer[trim_at..].to_string();
            self.last_processed_len = old_processed.saturating_sub(trim_at);
        }

        let mut events = Vec::new();

        // Only scan the new portion of the buffer, and ONLY complete lines.
        // PTY output arrives in arbitrary byte chunks — a chunk may end mid-line.
        // Processing incomplete lines causes false matches (e.g. "/effort" arriving
        // as "/", "/e", "/ef" … each being matched as a separate agent).
        let scan_start = self.last_processed_len.min(self.buffer.len());
        let remaining = &self.buffer[scan_start..];

        // Find last newline — only process up to there, keep the rest for next feed()
        let last_newline = remaining.rfind('\n');
        if last_newline.is_none() {
            // No complete line yet — wait for more data
            return events;
        }
        let process_end = scan_start + last_newline.unwrap() + 1;
        let scan_text = self.buffer[scan_start..process_end].to_string();

        if scan_text.is_empty() {
            return events;
        }

        let p = get_patterns();

        // Process line-by-line for precise status icon matching
        for raw_line in scan_text.lines() {
            // Handle carriage return (\r): terminal overwrites the current line.
            // Claude Code uses \r for spinner/status updates, producing sequences like
            // "\r· Claude Max... /effort\r· Claude Max... /effor". Only the final
            // segment (after the last \r) represents the actual displayed line.
            let line = if let Some(cr_pos) = raw_line.rfind('\r') {
                &raw_line[cr_pos + 1..]
            } else {
                raw_line
            };

            // Skip empty lines
            if line.trim().is_empty() {
                continue;
            }

            // Noise filter: skip status bar and spinner updates that are never agents
            if is_noise_line(line) {
                continue;
            }

            // 1. Check for agent spawn: ● Agent(desc) or ● Explore(desc)
            if let Some(caps) = p.agent_spawn.captures(line) {
                let tool_type = caps.get(1).map(|m| m.as_str()).unwrap_or("Agent");
                let description = caps.get(2).map(|m| m.as_str().trim().to_string());
                let name = description.clone().map(|d| {
                    if tool_type == "Agent" {
                        d
                    } else {
                        format!("{}: {}", tool_type, d)
                    }
                });

                if let Some(event) = self.try_spawn_tool_agent(name) {
                    events.push(event);
                }
                continue;
            }

            // 2. Check for phase status: ■ Phase 2: QA-Infra
            if let Some(caps) = p.phase_status.captures(line) {
                let icon = caps.get(1).map(|m| m.as_str()).unwrap_or("□");
                let phase_num: Option<u32> = caps.get(2).and_then(|m| m.as_str().parse().ok());
                let phase_name = caps.get(3).map(|m| m.as_str().trim().to_string());
                let _issue_num: Option<u32> = caps.get(4).and_then(|m| m.as_str().parse().ok());
                let status = icon_to_status(icon);

                let blocked_by: Option<u32> = p
                    .blocked_by
                    .captures(line)
                    .and_then(|bc| bc.get(1))
                    .and_then(|m| m.as_str().parse().ok());

                let effective_status = if blocked_by.is_some() && status == "pending" {
                    "blocked"
                } else {
                    status
                };

                if let Some(phase_n) = phase_num {
                    // Composite key: "phase-{N}-{name}" to handle multiple sub-tasks per phase
                    let composite_key =
                        format!("phase-{}-{}", phase_n, phase_name.as_deref().unwrap_or(""));

                    if let Some(agent_id) = self.task_agents.get(&composite_key).cloned() {
                        self.update_agent_status(
                            &agent_id,
                            effective_status,
                            blocked_by,
                            &mut events,
                        );
                    } else {
                        let display_name = phase_name.map(|n| format!("Phase {}: {}", phase_n, n));
                        if let Some(event) = self.try_spawn_agent(display_name, None, Some(phase_n))
                        {
                            if let AgentEvent::Detected(ref e) = event {
                                self.task_agents.insert(composite_key, e.agent_id.clone());
                                self.task_number_agents
                                    .entry(phase_n)
                                    .or_default()
                                    .push(e.agent_id.clone());
                                if let Some(info) = self.known_agents.get_mut(&e.agent_id) {
                                    info.status = effective_status.to_string();
                                    info.blocked_by = blocked_by;
                                    if is_terminal_status(effective_status) {
                                        info.completed_at =
                                            Some(chrono::Utc::now().timestamp_millis());
                                    }
                                }
                            }
                            events.push(event);
                        }
                    }
                }
                continue;
            }

            // 3. Check for task status: ■ Task 2: Name
            if let Some(caps) = p.task_status.captures(line) {
                let icon = caps.get(1).map(|m| m.as_str()).unwrap_or("□");
                let task_num: Option<u32> = caps.get(2).and_then(|m| m.as_str().parse().ok());
                let task_name = caps.get(3).map(|m| m.as_str().trim().to_string());
                let status = icon_to_status(icon);

                let blocked_by: Option<u32> = p
                    .blocked_by
                    .captures(line)
                    .and_then(|bc| bc.get(1))
                    .and_then(|m| m.as_str().parse().ok());

                let effective_status = if blocked_by.is_some() && status == "pending" {
                    "blocked"
                } else {
                    status
                };

                if let Some(task_n) = task_num {
                    let composite_key =
                        format!("task-{}-{}", task_n, task_name.as_deref().unwrap_or(""));

                    if let Some(agent_id) = self.task_agents.get(&composite_key).cloned() {
                        self.update_agent_status(
                            &agent_id,
                            effective_status,
                            blocked_by,
                            &mut events,
                        );
                    } else if let Some(event) = self.try_spawn_agent(task_name, Some(task_n), None)
                    {
                        if let AgentEvent::Detected(ref e) = event {
                            self.task_agents.insert(composite_key, e.agent_id.clone());
                            self.task_number_agents
                                .entry(task_n)
                                .or_default()
                                .push(e.agent_id.clone());
                            if let Some(info) = self.known_agents.get_mut(&e.agent_id) {
                                info.status = effective_status.to_string();
                                info.blocked_by = blocked_by;
                                if is_terminal_status(effective_status) {
                                    info.completed_at = Some(chrono::Utc::now().timestamp_millis());
                                }
                            }
                        }
                        events.push(event);
                    }
                }
                continue;
            }

            // 4. Check for task entry: · Task 2: Name... (metrics) or ✱ Main task...
            if let Some(caps) = p.task_entry.captures(line) {
                let task_num: Option<u32> = caps.name("num").and_then(|m| m.as_str().parse().ok());
                let task_name = caps
                    .name("name1")
                    .or(caps.name("name2"))
                    .map(|m| m.as_str().trim().to_string());

                let (duration_str, token_count) = extract_metrics(line, p);

                if let Some(task_n) = task_num {
                    let composite_key = format!(
                        "task-entry-{}-{}",
                        task_n,
                        task_name.as_deref().unwrap_or("")
                    );

                    if let Some(agent_id) = self.task_agents.get(&composite_key).cloned() {
                        // Update existing with metrics
                        if let Some(info) = self.known_agents.get_mut(&agent_id) {
                            if duration_str.is_some() {
                                info.duration_str = duration_str.clone();
                            }
                            if token_count.is_some() {
                                info.token_count = token_count.clone();
                            }
                            events.push(AgentEvent::StatusUpdate(AgentStatusUpdateEvent {
                                session_id: self.session_id.clone(),
                                agent_id,
                                status: info.status.clone(),
                                duration_str,
                                token_count,
                                blocked_by: info.blocked_by,
                            }));
                        }
                    } else if let Some(event) = self.try_spawn_agent(task_name, Some(task_n), None)
                    {
                        if let AgentEvent::Detected(ref e) = event {
                            self.task_agents.insert(composite_key, e.agent_id.clone());
                            self.task_number_agents
                                .entry(task_n)
                                .or_default()
                                .push(e.agent_id.clone());
                            if let Some(info) = self.known_agents.get_mut(&e.agent_id) {
                                info.duration_str = duration_str;
                                info.token_count = token_count;
                            }
                        }
                        events.push(event);
                    }
                } else if task_name.is_some() {
                    // Main task entry without number (✱ pattern)
                    if let Some(event) = self.try_spawn_agent(task_name, None, None) {
                        if let AgentEvent::Detected(ref e) = event {
                            if let Some(info) = self.known_agents.get_mut(&e.agent_id) {
                                info.duration_str = duration_str;
                                info.token_count = token_count;
                            }
                        }
                        events.push(event);
                    }
                }
                continue;
            }

            // 5. Check for summary line: +3 pending, 1 completed
            if let Some(caps) = p.summary_line.captures(line) {
                let pending: u32 = caps
                    .get(1)
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or(0);
                let completed: u32 = caps
                    .get(2)
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or(0);
                events.push(AgentEvent::TaskSummary(TaskSummaryEvent {
                    session_id: self.session_id.clone(),
                    pending_count: pending,
                    completed_count: completed,
                }));
                continue;
            }

            // 6. Check for session completion: ✻ Churned for Xm Ys
            if p.session_complete.is_match(line) {
                self.complete_all_running(&mut events);
                continue;
            }
        }

        // 7. Worktree detection: scan full text (path may be on a different line than "created worktree")
        if p.worktree_create.is_match(&scan_text) {
            let path = p
                .worktree_path
                .captures(&scan_text)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_else(|| "unknown".to_string());

            let agent_id = self.find_running_agent();

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

        self.last_processed_len = process_end;
        self.prune_completed_agents();
        events
    }

    /// Try to spawn a new agent, returning a Detected event if successful.
    /// Handles deduplication, ID generation, hierarchy tracking.
    ///
    /// `is_tool_call`: true for `● Agent(…)` / `● Explore(…)` spawns which create
    /// hierarchy nesting. Tasks/phases are siblings — they use the stack for
    /// parent lookup but don't push themselves onto it.
    fn try_spawn_agent(
        &mut self,
        name: Option<String>,
        task_number: Option<u32>,
        phase_number: Option<u32>,
    ) -> Option<AgentEvent> {
        self.try_spawn_agent_inner(name, task_number, phase_number, false)
    }

    /// Spawn an agent from a `● Agent(…)` / `● Explore(…)` tool call.
    /// These push onto the hierarchy stack (creating parent-child nesting).
    fn try_spawn_tool_agent(&mut self, name: Option<String>) -> Option<AgentEvent> {
        self.try_spawn_agent_inner(name, None, None, true)
    }

    fn try_spawn_agent_inner(
        &mut self,
        name: Option<String>,
        task_number: Option<u32>,
        phase_number: Option<u32>,
        is_tool_call: bool,
    ) -> Option<AgentEvent> {
        let now = chrono::Utc::now().timestamp_millis();

        // Deduplication: skip if same name detected within 2000ms
        let dedup_key = name.clone().unwrap_or_default();
        let is_duplicate = !dedup_key.is_empty()
            && self
                .recent_launches
                .iter()
                .any(|(n, ts)| n == &dedup_key && (now - ts).abs() < 2000);

        // Clean up old dedup entries
        self.recent_launches
            .retain(|(_, ts)| (now - ts).abs() < 5000);

        if is_duplicate {
            return None;
        }

        self.agent_counter += 1;
        let agent_id = format!("{}-agent-{}", self.session_id, self.agent_counter);

        // Record for future dedup
        if !dedup_key.is_empty() {
            self.recent_launches.push((dedup_key, now));
        }

        // Hierarchy: current stack top is the parent
        let parent_agent_id = self.agent_stack.last().cloned();
        let depth = self.agent_stack.len() as u32;

        // Only tool calls (● Agent/Explore) push onto the hierarchy stack.
        // Tasks and phases are siblings under the current parent.
        if is_tool_call {
            self.agent_stack.push(agent_id.clone());
        }

        let info = AgentInfo {
            id: agent_id.clone(),
            name: name.clone(),
            task: name.clone(),
            task_number,
            phase_number,
            status: "running".to_string(),
            detected_at: now,
            completed_at: None,
            worktree_path: None,
            parent_agent_id: parent_agent_id.clone(),
            depth,
            duration_str: None,
            token_count: None,
            blocked_by: None,
        };

        self.known_agents.insert(agent_id.clone(), info);

        Some(AgentEvent::Detected(AgentDetectedEvent {
            session_id: self.session_id.clone(),
            agent_id,
            name: name.clone(),
            task: name,
            task_number,
            phase_number,
            parent_agent_id,
            depth,
            detected_at: now,
        }))
    }

    /// Update an existing agent's status and emit the appropriate event.
    fn update_agent_status(
        &mut self,
        agent_id: &str,
        effective_status: &str,
        blocked_by: Option<u32>,
        events: &mut Vec<AgentEvent>,
    ) {
        if let Some(info) = self.known_agents.get_mut(agent_id) {
            let old_status = info.status.clone();
            info.status = effective_status.to_string();
            info.blocked_by = blocked_by;
            if is_terminal_status(effective_status) {
                info.completed_at = Some(chrono::Utc::now().timestamp_millis());
                // Pop from hierarchy stack so subsequent agents don't get wrong parent
                self.agent_stack.retain(|aid| aid != agent_id);
            }

            if old_status != effective_status {
                if is_terminal_status(effective_status) {
                    events.push(AgentEvent::Completed(AgentCompletedEvent {
                        session_id: self.session_id.clone(),
                        agent_id: agent_id.to_string(),
                        status: effective_status.to_string(),
                        completed_at: chrono::Utc::now().timestamp_millis(),
                    }));
                } else {
                    events.push(AgentEvent::StatusUpdate(AgentStatusUpdateEvent {
                        session_id: self.session_id.clone(),
                        agent_id: agent_id.to_string(),
                        status: effective_status.to_string(),
                        duration_str: None,
                        token_count: None,
                        blocked_by,
                    }));
                }
            }
        }
    }

    /// Mark all running/pending agents as completed (session finished).
    fn complete_all_running(&mut self, events: &mut Vec<AgentEvent>) {
        let now = chrono::Utc::now().timestamp_millis();
        let running_ids: Vec<String> = self
            .known_agents
            .iter()
            .filter(|(_, a)| a.status == "running" || a.status == "pending")
            .map(|(id, _)| id.clone())
            .collect();

        for agent_id in running_ids {
            if let Some(info) = self.known_agents.get_mut(&agent_id) {
                info.status = "completed".to_string();
                info.completed_at = Some(now);
                events.push(AgentEvent::Completed(AgentCompletedEvent {
                    session_id: self.session_id.clone(),
                    agent_id: agent_id.clone(),
                    status: "completed".to_string(),
                    completed_at: now,
                }));
            }
        }

        // Clear the agent stack — no more hierarchy after completion
        self.agent_stack.clear();
    }

    /// Remove the oldest completed/errored agents when the map exceeds the threshold.
    fn prune_completed_agents(&mut self) {
        let mut completed: Vec<(String, i64)> = self
            .known_agents
            .iter()
            .filter(|(_, a)| a.status == "completed" || a.status == "error")
            .map(|(id, a)| (id.clone(), a.completed_at.unwrap_or(a.detected_at)))
            .collect();

        if completed.len() <= MAX_COMPLETED_AGENTS {
            return;
        }

        completed.sort_by_key(|(_, ts)| *ts);
        let to_remove = completed.len() - MAX_COMPLETED_AGENTS;
        for (id, _) in completed.into_iter().take(to_remove) {
            self.known_agents.remove(&id);
            // Also remove from agent_stack if present
            self.agent_stack.retain(|aid| aid != &id);
        }
    }

    /// Find the most recently spawned running agent.
    fn find_running_agent(&self) -> Option<String> {
        self.known_agents
            .values()
            .filter(|a| a.status == "running")
            .max_by_key(|a| a.detected_at)
            .map(|a| a.id.clone())
    }

    /// Get all known agents for this session.
    pub fn known_agents(&self) -> &HashMap<String, AgentInfo> {
        &self.known_agents
    }
}

/// Extract duration and token count from a line using the metrics pattern.
fn extract_metrics(line: &str, p: &AgentPatterns) -> (Option<String>, Option<String>) {
    if let Some(caps) = p.metrics.captures(line) {
        let duration = caps.get(1).map(|m| m.as_str().trim().to_string());
        let tokens = caps.get(2).map(|m| m.as_str().trim().to_string());
        (duration, tokens)
    } else {
        (None, None)
    }
}

// ============================================================================
// Worktree scanning (unchanged)
// ============================================================================

/// Scan a project folder for git worktrees.
/// Uses `git worktree list --porcelain` for reliable parsing.
pub fn scan_worktrees_in_folder(folder: &str) -> Result<Vec<WorktreeInfo>, crate::error::ADPError> {
    let mut cmd = crate::util::silent_command("git");
    cmd.args(["worktree", "list", "--porcelain"])
        .current_dir(folder);
    let output = crate::util::timed_output(cmd, crate::util::DEFAULT_COMMAND_TIMEOUT)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(crate::error::ADPError::command_failed(format!(
            "git worktree list failed: {}",
            stderr.trim()
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    let mut is_bare = false;

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("worktree ") {
            if let Some(path) = current_path.take() {
                if !is_bare {
                    worktrees.push(WorktreeInfo {
                        path,
                        branch: current_branch.take(),
                        is_main: worktrees.is_empty(),
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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ── Agent spawn detection ─────────────────────────────────────────

    #[test]
    fn detects_agent_spawn() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("● Agent(Explore test infrastructure and stores)\n");
        assert_eq!(count_detected(&events), 1);
        let e = first_detected(&events).unwrap();
        assert_eq!(
            e.name.as_deref(),
            Some("Explore test infrastructure and stores")
        );
    }

    #[test]
    fn detects_explore_spawn() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("● Explore(Find all config files)\n");
        assert_eq!(count_detected(&events), 1);
        let e = first_detected(&events).unwrap();
        assert_eq!(e.name.as_deref(), Some("Explore: Find all config files"));
    }

    #[test]
    fn detects_multiple_agent_spawns() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("● Agent(task one)\n● Agent(task two)\n");
        assert_eq!(count_detected(&events), 2);
    }

    // ── Task detection ──────────────────────────────────────────────

    #[test]
    fn detects_task_entry_with_metrics() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("· Task 2: TicketCollector... (2m 38s · ↓ 5.4k tokens)\n");
        assert_eq!(count_detected(&events), 1);
        let e = first_detected(&events).unwrap();
        assert_eq!(e.task_number, Some(2));
        // Check metrics were stored
        let agent = det.known_agents().values().next().unwrap();
        assert_eq!(agent.duration_str.as_deref(), Some("2m 38s"));
        assert_eq!(agent.token_count.as_deref(), Some("5.4k tokens"));
    }

    #[test]
    fn detects_main_task_entry() {
        let mut det = AgentDetector::new("s1".into());
        let events =
            det.feed("✱ Fixing shell injection vulnerability... (6m 29s · ↓ 14.6k tokens)\n");
        assert_eq!(count_detected(&events), 1);
    }

    // ── Status transitions ──────────────────────────────────────────

    #[test]
    fn detects_task_status_running() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("├ ■ Task 2: TicketCollector\n");
        assert_eq!(count_detected(&events), 1);
        let agent = det.known_agents().values().next().unwrap();
        assert_eq!(agent.status, "running");
    }

    #[test]
    fn detects_task_status_pending() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("  □ Task 3: TicketHistoryCollector\n");
        assert_eq!(count_detected(&events), 1);
        let agent = det.known_agents().values().next().unwrap();
        assert_eq!(agent.status, "pending");
    }

    #[test]
    fn detects_task_status_completed() {
        let mut det = AgentDetector::new("s1".into());
        // First create the task
        det.feed("├ ■ Task 2: TicketCollector\n");
        // Then complete it
        let events = det.feed("├ ✓ Task 2: TicketCollector\n");
        assert!(events
            .iter()
            .any(|e| matches!(e, AgentEvent::Completed(c) if c.status == "completed")));
        let agent = det.known_agents().values().next().unwrap();
        assert_eq!(agent.status, "completed");
    }

    #[test]
    fn detects_task_status_error() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("├ ■ Task 2: TicketCollector\n");
        let events = det.feed("├ ✗ Task 2: TicketCollector\n");
        assert!(events
            .iter()
            .any(|e| matches!(e, AgentEvent::Completed(c) if c.status == "error")));
    }

    // ── Phase detection ─────────────────────────────────────────────

    #[test]
    fn detects_phase_with_issue() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("├ ✓ Phase 1: Shell-Injection in Session-Resume validieren (#55)\n");
        assert_eq!(count_detected(&events), 1);
        let e = first_detected(&events).unwrap();
        assert_eq!(e.phase_number, Some(1));
        assert!(e.name.as_deref().unwrap().contains("Phase 1"));
    }

    #[test]
    fn detects_phase_running() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("  ■ Phase 2: QA-Infrastruktur\n");
        assert_eq!(count_detected(&events), 1);
        let agent = det.known_agents().values().next().unwrap();
        assert_eq!(agent.status, "running");
        assert_eq!(agent.phase_number, Some(2));
    }

    // ── Blocked dependencies ────────────────────────────────────────

    #[test]
    fn detects_blocked_dependency() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("  □ Phase 3: Kritische Tests > blocked by #4\n");
        assert_eq!(count_detected(&events), 1);
        let agent = det.known_agents().values().next().unwrap();
        assert_eq!(agent.status, "blocked");
        assert_eq!(agent.blocked_by, Some(4));
    }

    #[test]
    fn detects_blocked_task() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("  □ Task 5: Integration > blocked by #3\n");
        assert_eq!(count_detected(&events), 1);
        let agent = det.known_agents().values().next().unwrap();
        assert_eq!(agent.status, "blocked");
        assert_eq!(agent.blocked_by, Some(3));
    }

    // ── Summary line ────────────────────────────────────────────────

    #[test]
    fn detects_summary_line() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("… +3 pending, 1 completed\n");
        let summary = events.iter().find_map(|e| match e {
            AgentEvent::TaskSummary(s) => Some(s),
            _ => None,
        });
        assert!(summary.is_some());
        let s = summary.unwrap();
        assert_eq!(s.pending_count, 3);
        assert_eq!(s.completed_count, 1);
    }

    #[test]
    fn detects_summary_line_pending_only() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("+5 pending\n");
        let summary = events.iter().find_map(|e| match e {
            AgentEvent::TaskSummary(s) => Some(s),
            _ => None,
        });
        assert!(summary.is_some());
        assert_eq!(summary.unwrap().pending_count, 5);
        assert_eq!(summary.unwrap().completed_count, 0);
    }

    // ── No false positives ──────────────────────────────────────────

    #[test]
    fn no_false_positives_on_conversational_text() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("The agent launched the test successfully\n");
        assert!(events.is_empty(), "Should not match conversational text");
    }

    #[test]
    fn no_false_positives_on_markdown_table() {
        let mut det = AgentDetector::new("s1".into());
        let text = "| agent launched | starting agent | completed successfully |\n\
                    | Detection funktioniert | launched/completed | agent error |\n";
        let events = det.feed(text);
        assert!(events.is_empty(), "Should not match markdown table content");
    }

    #[test]
    fn no_false_positives_on_code_discussion() {
        let mut det = AgentDetector::new("s1".into());
        let text = "The agent_detector.rs file uses agent_launch patterns.\n\
                    Agent completed successfully means the task is done.\n\
                    Starting agent detection now.\n";
        let events = det.feed(text);
        assert!(events.is_empty(), "Should not match code discussion");
    }

    #[test]
    fn no_false_positives_on_agent_keyword_in_explanation() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("Detection funktioniert — Regex erkennt aus dem PTY-Output\n");
        assert!(events.is_empty());
    }

    // ── Hierarchy ───────────────────────────────────────────────────

    #[test]
    fn agent_spawn_tracks_hierarchy() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("● Agent(Parent task)\n");
        det.feed("● Agent(Child task)\n");

        let agents: Vec<&AgentInfo> = det.known_agents().values().collect();
        assert_eq!(agents.len(), 2);

        let child = agents
            .iter()
            .find(|a| a.name.as_deref() == Some("Child task"))
            .unwrap();
        assert!(
            child.parent_agent_id.is_some(),
            "Child should have a parent"
        );
        assert_eq!(child.depth, 1);

        let parent = agents
            .iter()
            .find(|a| a.name.as_deref() == Some("Parent task"))
            .unwrap();
        assert!(
            parent.parent_agent_id.is_none(),
            "Parent should have no parent"
        );
        assert_eq!(parent.depth, 0);
    }

    // ── Buffer handling ─────────────────────────────────────────────

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
    fn buffer_trimmed_after_max_size() {
        let mut det = AgentDetector::new("s1".into());
        let large = "x".repeat(MAX_BUFFER + 1000);
        let events = det.feed(&large);
        assert!(events.is_empty());
        assert!(
            det.buffer.len() <= MAX_BUFFER,
            "Buffer should be trimmed to at most MAX_BUFFER, got {}",
            det.buffer.len()
        );
    }

    // ── Deduplication ───────────────────────────────────────────────

    #[test]
    fn dedup_prevents_double_detect() {
        let mut det = AgentDetector::new("s1".into());
        let events1 = det.feed("● Agent(same task)\n");
        assert_eq!(count_detected(&events1), 1);
        // Same name within 2s cooldown
        let events2 = det.feed("● Agent(same task)\n");
        assert_eq!(count_detected(&events2), 0);
    }

    #[test]
    fn different_names_detected_independently() {
        let mut det = AgentDetector::new("s1".into());
        let events1 = det.feed("● Agent(task one)\n");
        assert_eq!(count_detected(&events1), 1);
        let events2 = det.feed("● Agent(task two)\n");
        assert_eq!(count_detected(&events2), 1);
        assert_eq!(det.known_agents().len(), 2);
    }

    // ── Worktree detection ──────────────────────────────────────────

    #[test]
    fn worktree_detection_emits_event() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("● Agent(fix bug)\n");
        let events = det.feed("created worktree\nworktrees/agent-abc123\n");
        assert!(events.iter().any(|e| matches!(e, AgentEvent::Worktree(_))));
    }

    #[test]
    fn worktree_linked_to_running_agent() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("● Agent(fix bug)\n");
        det.feed("worktree created\nworktrees/my-branch\n");
        let agent = det.known_agents().values().next().unwrap();
        assert_eq!(agent.worktree_path.as_deref(), Some("my-branch"));
    }

    // ── Full scenario ───────────────────────────────────────────────

    #[test]
    fn full_claude_session_scenario() {
        let mut det = AgentDetector::new("session-1".into());

        // Main task header
        det.feed("✱ Fixing shell injection vulnerability... (6m 29s · ↓ 14.6k tokens)\n");

        // Phase entries with various statuses
        det.feed("├ ✓ Phase 1: Shell-Injection in Session-Resume validieren (#55)\n");
        det.feed("  ■ Phase 1: CSP-Policy härten — unsafe-eval entfernen (#56)\n");
        det.feed("  ■ Phase 2: QA-Infrastruktur — Tests stabilisieren\n");
        det.feed("  □ Phase 3: Kritische Tests > blocked by #4\n");
        det.feed("  □ Phase 4: Bugfixes > blocked by #4\n");

        let agents = det.known_agents();

        // Should have: main task + 5 phases = 6 agents
        assert!(
            agents.len() >= 5,
            "Expected at least 5 agents, got {}",
            agents.len()
        );

        // Check statuses
        let completed_count = agents.values().filter(|a| a.status == "completed").count();
        let running_count = agents.values().filter(|a| a.status == "running").count();
        let blocked_count = agents.values().filter(|a| a.status == "blocked").count();

        assert!(
            completed_count >= 1,
            "Should have at least 1 completed phase"
        );
        assert!(running_count >= 1, "Should have at least 1 running phase");
        assert!(blocked_count >= 1, "Should have at least 1 blocked phase");

        // Check blocked_by
        let blocked_agents: Vec<&AgentInfo> =
            agents.values().filter(|a| a.status == "blocked").collect();
        assert!(blocked_agents.iter().any(|a| a.blocked_by == Some(4)));
    }

    // ── Incomplete line handling ───────────────────────────────────

    #[test]
    fn incomplete_line_deferred_until_newline() {
        let mut det = AgentDetector::new("s1".into());
        // Feed partial line (no newline) — should NOT produce events
        let events = det.feed("● Agent(partial ta");
        assert!(events.is_empty(), "Incomplete line should be deferred");
        // Complete the line — NOW it should match
        let events = det.feed("sk)\n");
        assert_eq!(count_detected(&events), 1);
        let e = first_detected(&events).unwrap();
        assert_eq!(e.name.as_deref(), Some("partial task"));
    }

    #[test]
    fn progressive_typing_no_false_agents() {
        let mut det = AgentDetector::new("s1".into());
        // Simulate character-by-character arrival without newlines
        for chunk in &["/", "e", "f", "f", "o", "r", "t"] {
            let events = det.feed(chunk);
            assert!(
                events.is_empty(),
                "Partial input '{}' should not create agents",
                chunk
            );
        }
        // Final newline — but "/effort" doesn't match any pattern
        let events = det.feed("\n");
        assert!(events.is_empty(), "/effort is not an agent pattern");
    }

    // ── Carriage return handling ────────────────────────────────────

    #[test]
    fn carriage_return_overwrites_take_last_segment() {
        let mut det = AgentDetector::new("s1".into());
        // Simulate spinner updates with \r — only final version matters
        let events = det.feed("\r· Claude Max  esc to interrupt\r● Agent(real task)\n");
        assert_eq!(count_detected(&events), 1);
        let e = first_detected(&events).unwrap();
        assert_eq!(e.name.as_deref(), Some("real task"));
    }

    #[test]
    fn carriage_return_status_bar_no_false_agents() {
        let mut det = AgentDetector::new("s1".into());
        // Status bar with middle-dot separator — should not create agents
        let events = det.feed("\r⠙ Thinking... · esc to interrupt\n");
        assert!(
            events.is_empty(),
            "Status bar with \\r should not create agents"
        );
    }

    // ── Noise filter ────────────────────────────────────────────────

    #[test]
    fn no_false_positives_on_esc_to_interrupt() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("esc to interrupt\n");
        assert!(events.is_empty());
    }

    #[test]
    fn no_false_positives_on_spinner_chars() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("⠙ Thinking deeply about the problem\n");
        assert!(events.is_empty());
    }

    #[test]
    fn no_false_positives_on_metric_fragments() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("↓ 342 tokens · thought for 4s)\n");
        assert!(events.is_empty());
    }

    #[test]
    fn no_false_positives_on_middle_dot_status_bar() {
        let mut det = AgentDetector::new("s1".into());
        // · without "Task N:" should NOT match (status bar, not a task entry)
        let events = det.feed("· Claude Max\n");
        assert!(
            events.is_empty(),
            "· without 'Task N:' should not create an agent"
        );
    }

    #[test]
    fn no_false_positives_on_befuddling() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("· Befuddling... (thought for 4s)\n");
        assert!(
            events.is_empty(),
            "Thinking indicator should not create an agent"
        );
    }

    #[test]
    fn no_false_positives_on_timeout_fragment() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("timeout 2m)\n");
        assert!(events.is_empty());
    }

    #[test]
    fn no_false_positives_on_token_count_line() {
        let mut det = AgentDetector::new("s1".into());
        let events = det.feed("↓ 835 tokens thought for 4s)\n");
        assert!(events.is_empty());
    }

    // ── Session completion ──────────────────────────────────────────

    #[test]
    fn churned_for_completes_all_running_agents() {
        let mut det = AgentDetector::new("s1".into());
        // Spawn two agents
        det.feed("● Agent(task one)\n");
        det.feed("● Agent(task two)\n");
        assert_eq!(
            det.known_agents()
                .values()
                .filter(|a| a.status == "running")
                .count(),
            2
        );

        // Session completes
        let events = det.feed("✻ Churned for 1m 0s\n");
        let completions = events
            .iter()
            .filter(|e| matches!(e, AgentEvent::Completed(_)))
            .count();
        assert_eq!(completions, 2, "Both agents should be completed");
        assert_eq!(
            det.known_agents()
                .values()
                .filter(|a| a.status == "completed")
                .count(),
            2
        );
    }

    #[test]
    fn churned_for_clears_agent_stack() {
        let mut det = AgentDetector::new("s1".into());
        det.feed("● Agent(task one)\n");
        det.feed("✻ Churned for 30s\n");

        // New agent after completion should be at depth 0 (no parent)
        let events = det.feed("● Agent(new task)\n");
        let e = first_detected(&events).unwrap();
        assert_eq!(e.depth, 0, "Agent after completion should be root level");
        assert!(
            e.parent_agent_id.is_none(),
            "Agent after completion should have no parent"
        );
    }

    // ── Anchored regexes ────────────────────────────────────────────

    #[test]
    fn middle_dot_in_metrics_no_false_match() {
        let mut det = AgentDetector::new("s1".into());
        // · appearing mid-line in metric text should not trigger task_entry
        let events = det.feed("some text · with middle dot\n");
        assert!(events.is_empty(), "· in middle of line should not match");
    }

    #[test]
    fn task_icon_in_middle_of_line_no_match() {
        let mut det = AgentDetector::new("s1".into());
        // Status icon not at line start
        let events = det.feed("output: ■ Task 2: fake\n");
        assert!(events.is_empty(), "■ not at line start should not match");
    }

    // ── Helpers ──────────────────────────────────────────────────────

    fn count_detected(events: &[AgentEvent]) -> usize {
        events
            .iter()
            .filter(|e| matches!(e, AgentEvent::Detected(_)))
            .count()
    }

    fn count_completed(events: &[AgentEvent]) -> usize {
        events
            .iter()
            .filter(|e| matches!(e, AgentEvent::Completed(_)))
            .count()
    }

    fn first_detected(events: &[AgentEvent]) -> Option<&AgentDetectedEvent> {
        events.iter().find_map(|e| match e {
            AgentEvent::Detected(d) => Some(d),
            _ => None,
        })
    }
}
