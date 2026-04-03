// src-tauri/src/session/manager.rs

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub folder: String,
    pub shell: String,
    pub status: String, // "running" | "done" | "error"
    pub exit_code: Option<i32>,
}

#[derive(Clone, serde::Serialize)]
pub struct SessionOutputEvent {
    pub id: String,
    pub data: String,
}

#[derive(Clone, serde::Serialize)]
pub struct SessionExitEvent {
    pub id: String,
    pub exit_code: i32,
}

#[derive(Clone, serde::Serialize)]
pub struct SessionStatusEvent {
    pub id: String,
    pub status: String,
    pub snippet: String,
}

struct SessionHandle {
    info: SessionInfo,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
}

pub struct SessionManager {
    sessions: Mutex<HashMap<String, SessionHandle>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Spawnt eine neue Claude-Session in einem PTY.
    ///
    /// Bestimmt den Shell-Befehl anhand des `shell`-Parameters:
    /// - "powershell" → `powershell.exe -NoExit -Command claude --dangerously-skip-permissions`
    /// - "cmd" → `cmd.exe /K claude --dangerously-skip-permissions`
    /// - "gitbash" → `bash.exe -c "claude --dangerously-skip-permissions"`
    pub fn create_session(
        &self,
        app: AppHandle,
        id: String,
        title: String,
        folder: String,
        shell: String,
        resume_session_id: Option<String>,
    ) -> Result<SessionInfo, String> {
        log::info!(
            "Creating session id={}, shell={}, folder={}",
            id,
            shell,
            folder
        );

        // Validate the shell executable exists
        let shell_exe = Self::shell_executable(&shell);
        if which_executable(shell_exe).is_none() {
            let msg = format!(
                "Failed to create session {}: shell executable '{}' not found in PATH",
                id, shell_exe
            );
            log::error!("{}", msg);
            return Err(msg);
        }

        let pty_system = native_pty_system();

        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| {
                log::error!("Failed to open PTY for session {}: {}", id, e);
                format!("Failed to open PTY for session {id}: {e}")
            })?;

        let mut cmd = CommandBuilder::new(shell_exe);
        for arg in Self::shell_args(&shell, resume_session_id.as_deref()) {
            cmd.arg(arg);
        }
        cmd.cwd(&folder);

        let child = pty_pair.slave.spawn_command(cmd).map_err(|e| {
            log::error!(
                "Failed to spawn shell '{}' for session {}: {}",
                shell_exe,
                id,
                e
            );
            format!("Failed to spawn shell for session {id}: {e}")
        })?;

        log::info!(
            "Session {} spawned successfully with shell '{}'",
            id,
            shell_exe
        );

        let writer = pty_pair.master.take_writer().map_err(|e| {
            log::error!("Failed to acquire PTY writer for session {}: {}", id, e);
            format!("Failed to acquire PTY writer for session {id}: {e}")
        })?;

        let mut reader = pty_pair.master.try_clone_reader().map_err(|e| {
            log::error!("Failed to acquire PTY reader for session {}: {}", id, e);
            format!("Failed to acquire PTY reader for session {id}: {e}")
        })?;

        let info = SessionInfo {
            id: id.clone(),
            title,
            folder,
            shell,
            status: "running".to_string(),
            exit_code: None,
        };

        {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|e| format!("Failed to lock session manager for create_session: {e}"))?;
            sessions.insert(
                id.clone(),
                SessionHandle {
                    info: info.clone(),
                    writer,
                    master: pty_pair.master,
                },
            );
        }

        // Reader-Thread: liest PTY-Output und emittiert Events
        let read_id = id.clone();
        let read_app = app.clone();
        let mut agent_detector = super::agent_detector::AgentDetector::new(id.clone());
        thread::spawn(move || {
            log::info!("Session {} reader thread started", read_id);
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        log::info!("Session {} reader: EOF reached", read_id);
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();

                        // Output-Event an Frontend
                        if let Err(e) = read_app.emit(
                            "session-output",
                            SessionOutputEvent {
                                id: read_id.clone(),
                                data: data.clone(),
                            },
                        ) {
                            log::debug!("Session {} failed to emit session-output: {}", read_id, e);
                        }

                        // Status-Heuristik: letzte Zeile pruefen
                        let snippet = if data.len() > 200 {
                            // Find a valid char boundary to avoid panic on multi-byte UTF-8
                            let start = data
                                .char_indices()
                                .rev()
                                .nth(199)
                                .map(|(i, _)| i)
                                .unwrap_or(0);
                            data[start..].to_string()
                        } else {
                            data.clone()
                        };

                        let status = Self::detect_status(&snippet);
                        if let Err(e) = read_app.emit(
                            "session-status",
                            SessionStatusEvent {
                                id: read_id.clone(),
                                status,
                                snippet: snippet.clone(),
                            },
                        ) {
                            log::debug!("Session {} failed to emit session-status: {}", read_id, e);
                        }

                        // Agent detection: feed stripped output to detector
                        let stripped = Self::strip_ansi(&data);
                        let agent_events = agent_detector.feed(&stripped);
                        for event in agent_events {
                            match event {
                                super::agent_detector::AgentEvent::Detected(e) => {
                                    log::info!(
                                        "Session {} agent detected: {} (name: {:?})",
                                        read_id,
                                        e.agent_id,
                                        e.name
                                    );
                                    let _ = read_app.emit("agent-detected", e);
                                }
                                super::agent_detector::AgentEvent::Completed(e) => {
                                    log::info!(
                                        "Session {} agent completed: {} ({})",
                                        read_id,
                                        e.agent_id,
                                        e.status
                                    );
                                    let _ = read_app.emit("agent-completed", e);
                                }
                                super::agent_detector::AgentEvent::StatusUpdate(e) => {
                                    log::debug!(
                                        "Session {} agent status update: {} → {}",
                                        read_id,
                                        e.agent_id,
                                        e.status
                                    );
                                    let _ = read_app.emit("agent-status-update", e);
                                }
                                super::agent_detector::AgentEvent::TaskSummary(e) => {
                                    log::debug!(
                                        "Session {} task summary: {} pending, {} completed",
                                        read_id,
                                        e.pending_count,
                                        e.completed_count
                                    );
                                    let _ = read_app.emit("task-summary", e);
                                }
                                super::agent_detector::AgentEvent::Worktree(e) => {
                                    log::info!("Session {} worktree detected: {}", read_id, e.path);
                                    let _ = read_app.emit("worktree-detected", e);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Session {} reader error: {}", read_id, e);
                        break;
                    }
                }
            }
            log::info!("Session {} reader thread exiting", read_id);
        });

        // Waiter-Thread: wartet auf Prozess-Ende
        let wait_id = id.clone();
        let wait_app = app;
        thread::spawn(move || {
            log::info!("Session {} waiter thread started", wait_id);
            let mut child = child;
            let result = match child.wait() {
                Ok(status) => {
                    let code = status.exit_code() as i32;
                    let is_normal = code == 0
                        || (cfg!(windows) && (code == -1073741510 || code == -1073741509));

                    if is_normal {
                        log::debug!(
                            "Session {} child process exited normally (code {})",
                            wait_id,
                            code
                        );
                    } else {
                        log::warn!(
                            "Session {} child process exited with unexpected code: {}",
                            wait_id,
                            code
                        );
                    }
                    code
                }
                Err(e) => {
                    log::error!(
                        "Session {} failed to wait for child process: {}",
                        wait_id,
                        e
                    );
                    -1
                }
            };

            if let Err(e) = wait_app.emit(
                "session-exit",
                SessionExitEvent {
                    id: wait_id.clone(),
                    exit_code: result,
                },
            ) {
                log::debug!("Session {} failed to emit session-exit: {}", wait_id, e);
            }
        });

        Ok(info)
    }

    /// Sendet Daten (User-Input) an eine laufende Session.
    pub fn write_to_session(&self, id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Failed to lock session manager for write_to_session: {e}"))?;
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| format!("Failed to find session {id}: not found"))?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to session {id}: {e}"))?;
        session
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush session {id}: {e}"))?;
        Ok(())
    }

    /// Aendert die Terminal-Groesse einer Session.
    pub fn resize_session(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| {
            log::warn!("SessionManager mutex was poisoned during resize_session, recovering");
            e.into_inner()
        });
        let session = sessions
            .get(id)
            .ok_or_else(|| format!("Failed to find session {id}: not found"))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize session {id}: {e}"))
    }

    /// Schliesst eine Session (killt den Prozess).
    pub fn close_session(&self, id: &str) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|e| format!("Failed to lock session manager for close_session: {e}"))?;
        // Drop entfernt den MasterPty, was den Child-Prozess signalisiert
        sessions
            .remove(id)
            .ok_or_else(|| format!("Failed to find session {id}: not found"))?;
        Ok(())
    }

    /// Gibt alle aktiven Sessions zurueck.
    pub fn list_sessions(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| {
            log::warn!("SessionManager mutex was poisoned during list_sessions, recovering");
            e.into_inner()
        });
        sessions.values().map(|s| s.info.clone()).collect()
    }

    // --- Private Helpers ---

    fn shell_executable(shell: &str) -> &'static str {
        match shell {
            "powershell" => "powershell.exe",
            "cmd" => "cmd.exe",
            "gitbash" => "bash.exe",
            _ => "powershell.exe",
        }
    }

    fn shell_args(shell: &str, resume_session_id: Option<&str>) -> Vec<String> {
        let claude_cmd = match resume_session_id {
            Some(id) => {
                // Defense-in-depth: reject any session ID with unexpected characters.
                // Primary validation happens at the Tauri command boundary (commands.rs).
                assert!(
                    !id.is_empty()
                        && id
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
                    "shell_args: resume_session_id contains invalid characters: '{}'",
                    id
                );
                format!("claude --dangerously-skip-permissions --resume {}", id)
            }
            None => "claude --dangerously-skip-permissions".to_string(),
        };
        match shell {
            "powershell" => vec!["-NoExit".to_string(), "-Command".to_string(), claude_cmd],
            "cmd" => vec!["/K".to_string(), claude_cmd],
            "gitbash" => vec!["-c".to_string(), claude_cmd],
            _ => vec!["-NoExit".to_string(), "-Command".to_string(), claude_cmd],
        }
    }

    /// Strips ANSI escape sequences (CSI sequences like \x1b[...m).
    fn strip_ansi(s: &str) -> String {
        let mut result = String::with_capacity(s.len());
        let mut chars = s.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '\x1b' {
                // Skip ESC[ ... (final byte 0x40-0x7E)
                if chars.peek() == Some(&'[') {
                    chars.next(); // consume '['
                    while let Some(&next) = chars.peek() {
                        chars.next();
                        if next.is_ascii() && (0x40..=0x7E).contains(&(next as u8)) {
                            break;
                        }
                    }
                }
            } else {
                result.push(c);
            }
        }
        result
    }

    /// Heuristik: erkennt ob Claude auf Input wartet.
    ///
    /// Prueft den letzten Output-Snippet auf typische Prompt-Muster:
    /// - Endet mit "> " oder "? " (Claude's interaktive Prompts)
    /// - Endet mit "❯ " (Claude CLI Prompt)
    /// - Enthaelt "(y/n)" oder "[Y/n]" (Ja/Nein-Frage)
    ///
    /// Erkennt auch Thinking-Indikatoren (Spinner, "Thinking" Text),
    /// um bei ultrathink/langen Denkpausen nicht faelschlich "waiting" zu melden.
    fn detect_status(snippet: &str) -> String {
        let clean = Self::strip_ansi(snippet);
        // Only trim newlines/CR — keep trailing spaces for prompt detection
        let trimmed = clean.trim_end_matches(['\n', '\r']);

        // Thinking indicators: spinner chars or "Thinking" text mean Claude is
        // actively processing — never treat these as "waiting"
        const SPINNER_CHARS: &[char] = &['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let has_thinking_indicator =
            trimmed.ends_with(SPINNER_CHARS) || trimmed.contains("Thinking");

        if has_thinking_indicator {
            return "running".to_string();
        }

        if trimmed.ends_with("> ")
            || trimmed.ends_with("? ")
            || trimmed.ends_with("❯ ")
            || trimmed.ends_with("(y/n)")
            || trimmed.ends_with("[Y/n]")
            || trimmed.ends_with("[y/N]")
        {
            "waiting".to_string()
        } else {
            "running".to_string()
        }
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for SessionManager {
    fn drop(&mut self) {
        // Alle Sessions sauber beenden beim App-Close
        if let Ok(mut sessions) = self.sessions.lock() {
            let count = sessions.len();
            if count > 0 {
                log::info!(
                    "SessionManager: closing {} active sessions on shutdown",
                    count
                );
            }
            sessions.clear(); // Drop aller SessionHandles → PTY Master wird geschlossen → Child-Prozesse beendet
        } else {
            log::error!(
                "SessionManager: mutex poisoned during drop, sessions may not be cleaned up"
            );
        }
    }
}

/// Check if an executable exists on PATH (simple cross-platform check).
fn which_executable(name: &str) -> Option<std::path::PathBuf> {
    let cmd_name = if cfg!(windows) { "where" } else { "which" };
    let mut cmd = crate::util::silent_command(cmd_name);
    cmd.arg(name);
    crate::util::timed_output(cmd, std::time::Duration::from_secs(5))
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            String::from_utf8(o.stdout)
                .ok()
                .map(|s| std::path::PathBuf::from(s.lines().next().unwrap_or_default().trim()))
        })
}
