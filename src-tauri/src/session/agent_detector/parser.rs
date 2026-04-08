// src-tauri/src/session/agent_detector/parser.rs
//
// Stateless parsing: regex patterns, icon mapping, noise filtering, metrics extraction.

use regex::Regex;
use std::sync::OnceLock;

// ============================================================================
// Regex Patterns — Claude Code specific
// ============================================================================

pub(crate) struct AgentPatterns {
    /// "● Agent(description)" or "● Explore(description)"
    pub agent_spawn: Regex,
    /// "· Task N: Name..." or "✱ Main task..." — anchored, · requires "Task N:"
    pub task_entry: Regex,
    /// "■ Task N: Name" / "□ Task N:" / "✓ Task N:" / "✗ Task N:"
    pub task_status: Regex,
    /// "■ Phase N: Name" / "✓ Phase N: Name (#55)"
    pub phase_status: Regex,
    /// "blocked by #N"
    pub blocked_by: Regex,
    /// "(2m 38s · ↓ 5.4k tokens)"
    pub metrics: Regex,
    /// "+3 pending, 1 completed"
    pub summary_line: Regex,
    /// "git worktree add" / "created worktree"
    pub worktree_create: Regex,
    /// Extract worktree path
    pub worktree_path: Regex,
    /// "✻ Churned for 1m 0s" — Claude finished processing
    pub session_complete: Regex,
}

/// Process-global singleton — patterns are compiled once on first access.
static PATTERNS: OnceLock<AgentPatterns> = OnceLock::new();

pub(crate) fn get_patterns() -> &'static AgentPatterns {
    PATTERNS.get_or_init(|| AgentPatterns {
        // ● (U+25CF) precedes tool calls in Claude Code output
        // Matches: "● Agent(desc)", "● Explore(desc)" — anchored to line start
        agent_spawn: Regex::new(r"^[\s]*●\s+(Agent|Explore)\(([^)]{1,200})\)")
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
        task_status: Regex::new(r"^[\s├└│]*([■□✓✗])\s+Task\s+(\d+):\s*(.+?)(?:\s*\.{3})?\s*$")
            .expect("task_status regex"),

        // Phase status: same icons + "Phase N: Name (#55)" — anchored to line start
        phase_status: Regex::new(
            r"^[\s├└│]*([■□✓✗])\s+Phase\s+(\d+):\s*(.+?)(?:\s*\(#(\d+)\))?\s*$",
        )
        .expect("phase_status regex"),

        // Dependency: "blocked by #4" or "> blocked by #4"
        blocked_by: Regex::new(r"blocked\s+by\s+#(\d+)").expect("blocked_by regex"),

        // Metrics in parens: "(2m 38s · ↓ 5.4k tokens)"
        metrics: Regex::new(r"\((\d+[mh]\s*\d*s?)\s*[·•]\s*[↓⬇]\s*([\d.]+k?\s*tokens?)\)")
            .expect("metrics regex"),

        // Summary: "+3 pending, 1 completed" or "… +3 pending, 1 completed"
        summary_line: Regex::new(r"\+(\d+)\s+pending(?:,\s*(\d+)\s+completed)?")
            .expect("summary_line regex"),

        // Worktree creation (kept from original — matches real git output)
        worktree_create: Regex::new(
            r"(?i)(?:git\s+worktree\s+add|created?\s+worktree|worktree\s+created)",
        )
        .expect("worktree_create regex"),

        // Worktree path extraction
        worktree_path: Regex::new(r#"(?:worktrees?[/\\]|worktree\s+add\s+)([^\s\n"']+)"#)
            .expect("worktree_path regex"),

        // "✻ Churned for 1m 0s" — Claude finished processing, all agents done
        session_complete: Regex::new(r"✻\s+Churned\s+for").expect("session_complete regex"),
    })
}

// ============================================================================
// Status icon → status string mapping
// ============================================================================

pub(crate) fn icon_to_status(icon: &str) -> &'static str {
    match icon {
        "■" => "running",
        "□" => "pending",
        "✓" => "completed",
        "✗" => "error",
        _ => "running",
    }
}

pub(crate) fn is_terminal_status(status: &str) -> bool {
    status == "completed" || status == "error"
}

/// Detect status-bar and spinner noise that should never be matched as agents.
/// These are transient terminal updates from Claude Code's UI, not structured output.
pub(crate) fn is_noise_line(line: &str) -> bool {
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

/// Extract duration and token count from a line using the metrics pattern.
pub(crate) fn extract_metrics(line: &str, p: &AgentPatterns) -> (Option<String>, Option<String>) {
    if let Some(caps) = p.metrics.captures(line) {
        let duration = caps.get(1).map(|m| m.as_str().trim().to_string());
        let tokens = caps.get(2).map(|m| m.as_str().trim().to_string());
        (duration, tokens)
    } else {
        (None, None)
    }
}

// ============================================================================
// Parser-specific tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ── icon_to_status ─────────────────────────────────────────────

    #[test]
    fn icon_running() {
        assert_eq!(icon_to_status("■"), "running");
    }

    #[test]
    fn icon_pending() {
        assert_eq!(icon_to_status("□"), "pending");
    }

    #[test]
    fn icon_completed() {
        assert_eq!(icon_to_status("✓"), "completed");
    }

    #[test]
    fn icon_error() {
        assert_eq!(icon_to_status("✗"), "error");
    }

    #[test]
    fn icon_unknown_defaults_to_running() {
        assert_eq!(icon_to_status("?"), "running");
    }

    // ── is_terminal_status ─────────────────────────────────────────

    #[test]
    fn terminal_status_completed() {
        assert!(is_terminal_status("completed"));
    }

    #[test]
    fn terminal_status_error() {
        assert!(is_terminal_status("error"));
    }

    #[test]
    fn non_terminal_status_running() {
        assert!(!is_terminal_status("running"));
    }

    #[test]
    fn non_terminal_status_pending() {
        assert!(!is_terminal_status("pending"));
    }

    // ── is_noise_line ──────────────────────────────────────────────

    #[test]
    fn noise_spinner_char() {
        assert!(is_noise_line("⠙ Thinking deeply about the problem"));
    }

    #[test]
    fn noise_esc_to_interrupt() {
        assert!(is_noise_line("esc to interrupt"));
    }

    #[test]
    fn noise_shift_tab() {
        assert!(is_noise_line("shift+tab to cycle through options"));
    }

    #[test]
    fn noise_metric_fragment_arrow_down() {
        assert!(is_noise_line("↓ 342 tokens · thought for 4s)"));
    }

    #[test]
    fn noise_metric_fragment_double_arrow() {
        assert!(is_noise_line("⬇ 100 tokens"));
    }

    #[test]
    fn not_noise_normal_text() {
        assert!(!is_noise_line("hello world"));
    }

    #[test]
    fn not_noise_agent_spawn() {
        assert!(!is_noise_line("● Agent(some task)"));
    }

    // ── extract_metrics ────────────────────────────────────────────

    #[test]
    fn extracts_duration_and_tokens() {
        let p = get_patterns();
        let (dur, tok) = extract_metrics("(2m 38s · ↓ 5.4k tokens)", p);
        assert_eq!(dur.as_deref(), Some("2m 38s"));
        assert_eq!(tok.as_deref(), Some("5.4k tokens"));
    }

    #[test]
    fn no_metrics_in_plain_text() {
        let p = get_patterns();
        let (dur, tok) = extract_metrics("just some text", p);
        assert!(dur.is_none());
        assert!(tok.is_none());
    }

    // ── Regex pattern tests ────────────────────────────────────────

    #[test]
    fn agent_spawn_pattern_anchored() {
        let p = get_patterns();
        // Should match at line start
        assert!(p.agent_spawn.is_match("● Agent(task)"));
        assert!(p.agent_spawn.is_match("  ● Agent(task)"));
        // Should NOT match in middle of text
        assert!(!p.agent_spawn.is_match("output: ● Agent(task)"));
    }

    #[test]
    fn task_status_pattern_with_tree_chars() {
        let p = get_patterns();
        assert!(p.task_status.is_match("├ ■ Task 2: Name"));
        assert!(p.task_status.is_match("└ ✓ Task 1: Done"));
        assert!(p.task_status.is_match("  □ Task 3: Pending"));
    }

    #[test]
    fn task_entry_requires_task_prefix_for_middle_dot() {
        let p = get_patterns();
        // · with "Task N:" should match
        assert!(p.task_entry.is_match("· Task 2: TicketCollector"));
        // · without "Task N:" should NOT match
        assert!(!p.task_entry.is_match("· Claude Max"));
        assert!(!p.task_entry.is_match("· Befuddling..."));
    }

    #[test]
    fn summary_line_pattern_both_variants() {
        let p = get_patterns();
        assert!(p.summary_line.is_match("+3 pending, 1 completed"));
        assert!(p.summary_line.is_match("+5 pending"));
    }

    #[test]
    fn session_complete_pattern() {
        let p = get_patterns();
        assert!(p.session_complete.is_match("✻ Churned for 1m 0s"));
        assert!(p.session_complete.is_match("✻ Churned for 30s"));
    }
}
