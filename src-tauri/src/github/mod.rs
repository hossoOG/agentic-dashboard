pub mod commands;
pub mod kanban;

use std::process::Command;

/// Creates a Command with hidden console window on Windows.
pub(crate) fn silent_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Run a command, optionally in a specific working directory.
pub(crate) fn exec_command(folder: Option<&str>, program: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = silent_command(program);
    cmd.args(args);
    if let Some(dir) = folder {
        cmd.current_dir(dir);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run {}: {}", program, e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("{} failed: {}", program, stderr))
    }
}

/// Run a command in a specific working directory.
pub(crate) fn run_command(folder: &str, program: &str, args: &[&str]) -> Result<String, String> {
    exec_command(Some(folder), program, args)
}

/// Run a command without a working directory (uses system PATH only).
pub(crate) fn run_global_command(program: &str, args: &[&str]) -> Result<String, String> {
    exec_command(None, program, args)
}

pub(crate) fn is_command_available(cmd: &str) -> bool {
    #[cfg(target_os = "windows")]
    let check = silent_command("where").arg(cmd).output();
    #[cfg(not(target_os = "windows"))]
    let check = silent_command("which").arg(cmd).output();

    check.map(|o| o.status.success()).unwrap_or(false)
}
