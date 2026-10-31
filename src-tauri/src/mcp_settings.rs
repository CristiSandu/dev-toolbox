use serde::Serialize;
use serde_json::{json, Value};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSetup {
    native_path: String,
    native_available: bool,
    bridge_path: String,
    bridge_available: bool,
    node_command: String,
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
    let bridge = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/test-plans-mcp.mjs");
    let bridge = bridge.canonicalize().unwrap_or(bridge);
    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    let node = std::env::var_os("PATH")
        .and_then(|paths| {
            std::env::split_paths(&paths)
                .map(|p| p.join(node_name))
                .find(|p| p.is_file())
        })
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| node_name.into());
    Ok(McpSetup {
        native_available: native.is_file(),
        native_path: native.to_string_lossy().into_owned(),
        bridge_available: bridge.is_file(),
        bridge_path: bridge.to_string_lossy().into_owned(),
        node_command: node,
    })
}
#[tauri::command]
pub fn get_mcp_setup() -> Result<McpSetup, String> {
    setup()
}

fn connection_command(
    info: &McpSetup,
    pdf: bool,
    node: &str,
) -> Result<(String, Vec<String>), String> {
    if !info.native_available {
        return Err("Build dev-toolbox-mcp first, then reopen MCP settings.".into());
    }
    if pdf {
        if !info.bridge_available {
            return Err("The PDF bridge needs the source checkout. Use Native tools or restore the checkout.".into());
        }
        if node.trim().is_empty() {
            return Err("Enter the path to your Node executable.".into());
        }
        Ok((
            node.into(),
            vec![
                "--experimental-strip-types".into(),
                info.bridge_path.clone(),
                info.native_path.clone(),
            ],
        ))
    } else {
        Ok((info.native_path.clone(), vec![]))
    }
}
#[tauri::command]
pub async fn check_mcp_connection(pdf: bool, node: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let info = setup()?;
        let (command, args) = connection_command(&info, pdf, &node)?;
        probe(&command, &args)
    })
    .await
    .map_err(|e| e.to_string())?
}
fn probe(command: &str, args: &[String]) -> Result<(), String> {
    let mut child = Command::new(command).args(args).stdin(Stdio::piped()).stdout(Stdio::piped())
        .stderr(Stdio::null()).spawn().map_err(|e| format!("Could not start MCP server: {e}. Check the executable path and install Node dependencies for PDF export."))?;
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
                return Err(match result { Err(e) => e.to_string(), _ => "MCP check timed out. Verify the Node executable and rebuild the native server.".into() });
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
    Err("The server did not complete an MCP handshake. Rebuild dev-toolbox-mcp; for PDF export, verify Node 22.12+ and run npm install in the checkout.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn setup_commands_require_installed_components_and_keep_paths_as_arguments() {
        let mut info = McpSetup {
            native_path: "/a path/server".into(),
            native_available: false,
            bridge_path: "/a path/bridge.mjs".into(),
            bridge_available: true,
            node_command: "node".into(),
        };
        assert!(connection_command(&info, false, "node").is_err());
        info.native_available = true;
        assert_eq!(
            connection_command(&info, false, "node").unwrap(),
            (info.native_path.clone(), vec![])
        );
        let (_, args) = connection_command(&info, true, "/node path/node").unwrap();
        assert_eq!(args[1], info.bridge_path);
        assert_eq!(args[2], info.native_path);
        info.bridge_available = false;
        assert!(connection_command(&info, true, "node").is_err());
    }
    #[test]
    fn probe_requires_a_successful_handshake_and_ping() {
        let bytes = b"{\"id\":1,\"result\":{\"serverInfo\":{\"name\":\"dev-toolbox-test-plans\"}}}\n{\"id\":2,\"result\":{}}\n";
        assert!(validate_probe(true, bytes).is_ok());
        assert!(validate_probe(false, bytes).is_err());
        assert!(validate_probe(true, b"{\"id\":2,\"error\":{}}\n").is_err());
    }
}
