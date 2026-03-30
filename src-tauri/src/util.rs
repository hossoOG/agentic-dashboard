use std::process::Command;

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
