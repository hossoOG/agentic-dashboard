use crate::error::{ADPError, ADPErrorCode};
use std::process::{Command, Output, Stdio};
use std::time::Duration;

/// Default timeout for external commands (30 seconds).
pub const DEFAULT_COMMAND_TIMEOUT: Duration = Duration::from_secs(30);

/// Creates a Command with hidden console window on Windows.
/// Use this instead of `Command::new()` for any background CLI call
/// to prevent a console window from briefly flashing on screen.
pub fn silent_command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Execute a pre-configured Command with a timeout.
/// Spawns the process, polls `try_wait` in a loop, and kills on timeout.
/// Pipes stdout/stderr automatically so output can be captured.
pub fn timed_output(mut cmd: Command, timeout: Duration) -> Result<Output, ADPError> {
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| ADPError::command_failed(format!("Failed to spawn command: {}", e)))?;

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                // Process finished — collect output
                break;
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait(); // Reap the process
                    return Err(ADPError::new(
                        ADPErrorCode::ServiceTimeout,
                        format!("Command timed out after {}s", timeout.as_secs()),
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                return Err(ADPError::command_failed(format!(
                    "Error waiting for command: {}",
                    e
                )));
            }
        }
    }

    child
        .wait_with_output()
        .map_err(|e| ADPError::command_failed(format!("Failed to collect command output: {}", e)))
}
