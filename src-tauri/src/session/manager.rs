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
    ) -> Result<SessionInfo, String> {
        log::info!(
            "Creating session id={}, shell={}, folder={}",
            id, shell, folder
        );

        // Validate the shell executable exists
        let shell_exe = Self::shell_executable(&shell);
        if which_executable(shell_exe).is_none() {
            let msg = format!(
                "Shell executable '{}' not found in PATH. Cannot create session.",
                shell_exe
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
                log::error!("PTY initialization failed for session {}: {}", id, e);
                format!("PTY open failed: {e}")
            })?;

        let mut cmd = CommandBuilder::new(shell_exe);
        for arg in Self::shell_args(&shell) {
            cmd.arg(arg);
        }
        cmd.cwd(&folder);

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| {
                log::error!("Failed to spawn shell '{}' for session {}: {}", shell_exe, id, e);
                format!("Spawn failed: {e}")
            })?;

        log::info!("Session {} spawned successfully with shell '{}'", id, shell_exe);

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| {
                log::error!("Failed to acquire PTY writer for session {}: {}", id, e);
                format!("Writer failed: {e}")
            })?;

        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| {
                log::error!("Failed to acquire PTY reader for session {}: {}", id, e);
                format!("Reader failed: {e}")
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
            let mut sessions = self.sessions.lock().map_err(|e| {
                format!("Failed to lock session manager for create_session: {e}")
            })?;
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
                            log::error!("Session {} failed to emit session-output: {}", read_id, e);
                        }

                        // Status-Heuristik: letzte Zeile pruefen
                        let snippet = if data.len() > 200 {
                            // Find a valid char boundary to avoid panic on multi-byte UTF-8
                            let start = data.char_indices()
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
                            log::error!("Session {} failed to emit session-status: {}", read_id, e);
                        }

                        // Agent detection: feed stripped output to detector
                        let stripped = Self::strip_ansi(&data);
                        let agent_events = agent_detector.feed(&stripped);
                        for event in agent_events {
                            match event {
                                super::agent_detector::AgentEvent::Detected(e) => {
                                    log::info!("Session {} agent detected: {}", read_id, e.agent_id);
                                    let _ = read_app.emit("agent-detected", e);
                                }
                                super::agent_detector::AgentEvent::Completed(e) => {
                                    log::info!("Session {} agent completed: {} ({})", read_id, e.agent_id, e.status);
                                    let _ = read_app.emit("agent-completed", e);
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
                    if code != 0 {
                        log::warn!("Session {} child process exited with non-zero code: {}", wait_id, code);
                    } else {
                        log::info!("Session {} child process exited with code 0", wait_id);
                    }
                    code
                }
                Err(e) => {
                    log::error!("Session {} failed to wait for child process: {}", wait_id, e);
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
                log::error!("Session {} failed to emit session-exit: {}", wait_id, e);
            }
        });

        Ok(info)
    }

    /// Sendet Daten (User-Input) an eine laufende Session.
    pub fn write_to_session(&self, id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| {
            format!("Failed to lock session manager for write_to_session: {e}")
        })?;
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| format!("Session {id} nicht gefunden"))?;
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
            .ok_or_else(|| format!("Session {id} nicht gefunden"))?;
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
        let mut sessions = self.sessions.lock().map_err(|e| {
            format!("Failed to lock session manager for close_session: {e}")
        })?;
        // Drop entfernt den MasterPty, was den Child-Prozess signalisiert
        sessions
            .remove(id)
            .ok_or_else(|| format!("Session {id} nicht gefunden"))?;
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

    fn shell_args(shell: &str) -> Vec<&'static str> {
        match shell {
            "powershell" => vec![
                "-NoExit",
                "-Command",
                "claude --dangerously-skip-permissions",
            ],
            "cmd" => vec!["/K", "claude --dangerously-skip-permissions"],
            "gitbash" => vec!["-c", "claude --dangerously-skip-permissions"],
            _ => vec![
                "-NoExit",
                "-Command",
                "claude --dangerously-skip-permissions",
            ],
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
    fn detect_status(snippet: &str) -> String {
        let clean = Self::strip_ansi(snippet);
        // Only trim newlines/CR — keep trailing spaces for prompt detection
        let trimmed = clean.trim_end_matches(['\n', '\r']);

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
                log::info!("SessionManager: closing {} active sessions on shutdown", count);
            }
            sessions.clear(); // Drop aller SessionHandles → PTY Master wird geschlossen → Child-Prozesse beendet
        } else {
            log::error!("SessionManager: mutex poisoned during drop, sessions may not be cleaned up");
        }
    }
}

/// Check if an executable exists on PATH (simple cross-platform check).
fn which_executable(name: &str) -> Option<std::path::PathBuf> {
    // On Windows, try `where`; on Unix, try `which`
    let cmd = if cfg!(windows) { "where" } else { "which" };
    std::process::Command::new(cmd)
        .arg(name)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            String::from_utf8(o.stdout)
                .ok()
                .map(|s| std::path::PathBuf::from(s.lines().next().unwrap_or_default().trim()))
        })
}
