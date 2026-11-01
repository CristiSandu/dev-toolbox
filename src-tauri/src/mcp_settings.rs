use serde::Serialize;
use serde_json::{json, Value};
#[cfg(debug_assertions)]
use std::path::PathBuf;
use std::{
    io::Write,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSetup {
    executable_path: String,
    available: bool,
    development: bool,
}
fn setup() -> Result<McpSetup, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let native = executable
        .parent()
        .ok_or("Cannot locate application directory")?
        .join(if cfg!(windows) {
            "dev-toolbox-mcp.exe"
        } else {
            "dev-toolbox-mcp"
        });
    #[cfg(debug_assertions)]
    let native = if !native.is_file() {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join(".mcp-bundle")
            .join(format!(
                "dev-toolbox-mcp-{}{}",
                env!("DEV_TOOLBOX_TARGET"),
                if cfg!(windows) { ".exe" } else { "" }
            ))
    } else {
        native
    };
    Ok(McpSetup {
        available: native.is_file(),
        executable_path: native.to_string_lossy().into_owned(),
        development: cfg!(debug_assertions),
    })
}
#[tauri::command]
pub fn get_mcp_setup() -> Result<McpSetup, String> {
    setup()
}

#[tauri::command]
pub async fn check_mcp_connection() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let info = setup()?;
        if !info.available {
            return Err("MCP components are missing. Repair or reinstall Dev Toolbox.".into());
        }
        probe(&info.executable_path, &[])
    })
    .await
    .map_err(|e| e.to_string())?
}
fn probe(command: &str, args: &[String]) -> Result<(), String> {
    let mut process = Command::new(command);
    process
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        process.creation_flags(0x08000000); // CREATE_NO_WINDOW for the temporary settings check.
    }
    let mut child = process.spawn().map_err(|e| {
        format!("Could not start the installed MCP server: {e}. Repair or reinstall Dev Toolbox.")
    })?;
    let requests = [
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"dev-toolbox-settings","version":"1"}}}),
        json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
        json!({"jsonrpc":"2.0","id":2,"method":"ping"}),
    ];
    let write_result = (|| {
        let mut input = child.stdin.take().ok_or("Cannot open server input")?;
        for request in requests {
            writeln!(input, "{request}")
                .map_err(|e| format!("Could not send MCP handshake: {e}"))?;
        }
        Ok::<_, String>(())
    })();
    if let Err(error) = write_result {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() < Duration::from_secs(10) => {
                std::thread::sleep(Duration::from_millis(25))
            }
            result => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(match result {
                    Err(e) => e.to_string(),
                    _ => "MCP check timed out. Close any stuck MCP processes and retry the check."
                        .into(),
                });
            }
        }
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    validate_probe(output.status.success(), &output.stdout)
}
fn validate_probe(success: bool, bytes: &[u8]) -> Result<(), String> {
    let responses: Vec<Value> = String::from_utf8_lossy(bytes)
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();
    if success
        && responses
            .iter()
            .any(|v| v["id"] == 1 && v["result"]["serverInfo"]["name"] == "dev-toolbox-test-plans")
        && responses
            .iter()
            .any(|v| v["id"] == 2 && v["result"].is_object() && v.get("error").is_none())
    {
        return Ok(());
    }
    Err("The installed MCP server did not complete a handshake. Repair or reinstall Dev Toolbox and retry.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn probe_requires_a_successful_handshake_and_ping() {
        let bytes = b"{\"id\":1,\"result\":{\"serverInfo\":{\"name\":\"dev-toolbox-test-plans\"}}}\n{\"id\":2,\"result\":{}}\n";
        assert!(validate_probe(true, bytes).is_ok());
        assert!(validate_probe(false, bytes).is_err());
        assert!(validate_probe(true, b"{\"id\":2,\"error\":{}}\n").is_err());
    }
}
