use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

pub(crate) struct RuntimePaths {
    pub node: PathBuf,
    pub script: PathBuf,
}
fn installed_paths(executable: &Path) -> Result<RuntimePaths, String> {
    let directory = executable
        .parent()
        .ok_or("Cannot locate MCP installation")?;
    let node = directory.join(if cfg!(windows) {
        "dev-toolbox-mcp-runtime.exe"
    } else {
        "dev-toolbox-mcp-runtime"
    });
    let resources =
        if cfg!(target_os = "macos") && directory.file_name().is_some_and(|name| name == "MacOS") {
            directory.join("../Resources/mcp")
        } else {
            directory.join("mcp")
        };
    Ok(RuntimePaths {
        node,
        script: resources.join("server.cjs"),
    })
}
pub(crate) fn runtime_paths(executable: &Path) -> Result<RuntimePaths, String> {
    let paths = installed_paths(executable)?;
    if paths.node.is_file() && paths.script.is_file() {
        return Ok(paths);
    }
    #[cfg(debug_assertions)]
    {
        let stage = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".mcp-bundle");
        let paths = RuntimePaths {
            node: stage.join(format!(
                "dev-toolbox-mcp-runtime-{}{}",
                env!("DEV_TOOLBOX_TARGET"),
                if cfg!(windows) { ".exe" } else { "" }
            )),
            script: stage.join("resources/server.cjs"),
        };
        if paths.node.is_file() && paths.script.is_file() {
            return Ok(paths);
        }
    }
    Err("The installed MCP components are missing. Reinstall Dev Toolbox and copy its MCP configuration again.".into())
}
/// The public executable always starts the complete tool set using its private runtime.
pub fn launch() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let paths = runtime_paths(&executable)?;
    let mut command = Command::new(paths.node);
    command
        .arg(paths.script)
        .arg(&executable)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // Keep private console helpers hidden; preserve piped stdio.
    }
    let status = command
        .status()
        .map_err(|e| format!("Cannot start the bundled MCP runtime: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("MCP runtime exited with {status}"))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installed_paths_are_relative_to_the_executable_not_the_working_directory() {
        let paths = installed_paths(Path::new("/an app/Contents/MacOS/dev-toolbox-mcp")).unwrap();
        assert!(paths.node.starts_with("/an app/Contents/MacOS"));
        if cfg!(target_os = "macos") {
            assert_eq!(
                paths.script,
                Path::new("/an app/Contents/MacOS/../Resources/mcp/server.cjs")
            );
        }
        let paths = installed_paths(Path::new("/installed app/dev-toolbox-mcp.exe")).unwrap();
        assert_eq!(paths.script, Path::new("/installed app/mcp/server.cjs"));
    }
}
