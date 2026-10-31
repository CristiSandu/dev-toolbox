//! Local stdio MCP adapter. All persistence uses the same operations as Tauri.
use crate::test_plans as plans;
use rusqlite::Connection;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

fn arg<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(
        args.get(key)
            .cloned()
            .ok_or_else(|| format!("Missing argument: {key}"))?,
    )
    .map_err(|e| format!("Invalid {key}: {e}"))
}
fn optional<T: DeserializeOwned>(args: &Value, key: &str) -> Result<Option<T>, String> {
    args.get(key)
        .filter(|v| !v.is_null())
        .map(|v| serde_json::from_value(v.clone()).map_err(|e| format!("Invalid {key}: {e}")))
        .transpose()
}
fn encode(value: impl Serialize) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|e| e.to_string())
}
fn tools() -> Value {
    serde_json::from_str(include_str!("mcp-tools.json")).expect("embedded tool schemas")
}
fn call(conn: &mut Connection, name: &str, a: &Value) -> Result<Value, String> {
    let registry = tools();
    let tool = registry
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["name"] == name)
        .ok_or("Unknown tool")?;
    let args = a.as_object().ok_or("Arguments must be an object")?;
    let properties = tool["inputSchema"]["properties"].as_object().unwrap();
    if let Some(key) = args.keys().find(|k| !properties.contains_key(*k)) {
        return Err(format!("Unknown argument: {key}"));
    }
    match name {
        "list_test_projects" => encode(plans::list_test_projects_db(conn)?),
        "save_test_project" => encode(plans::save_test_project_db(
            conn,
            optional(a, "id")?,
            arg(a, "name")?,
        )?),
        "delete_test_project" => encode(plans::delete_test_project_db(conn, arg(a, "id")?)?),
        "list_test_cases" => encode(plans::list_test_cases_db(conn)?),
        "save_test_case" => encode(plans::save_test_case_db(
            conn,
            optional(a, "id")?,
            arg(a, "projectId")?,
            arg(a, "expectedRevision")?,
            arg(a, "content")?,
        )?),
        "delete_test_case" => encode(plans::delete_test_case_db(conn, arg(a, "id")?)?),
        "get_test_case_revisions" => {
            encode(plans::get_test_case_revisions_db(conn, arg(a, "caseId")?)?)
        }
        "export_test_project" => encode(plans::export_test_project_db(
            conn,
            arg(a, "projectId")?,
            arg(a, "filePath")?,
        )?),
        "export_test_case" => encode(plans::export_test_case(
            arg(a, "content")?,
            arg(a, "filePath")?,
        )?),
        "read_test_plan_import" => encode(plans::read_test_plan_import(arg(a, "filePath")?)?),
        "import_test_plan" => encode(plans::import_test_plan_db(
            conn,
            arg(a, "document")?,
            optional(a, "projectId")?,
            optional(a, "newProjectName")?,
        )?),
        "fetch_test_product_image" => encode(tauri::async_runtime::block_on(
            plans::fetch_test_product_image(arg(a, "url")?),
        )?),
        "save_test_case_pdf" => encode(plans::save_test_case_pdf(
            arg(a, "filePath")?,
            arg(a, "bytes")?,
        )?),
        "generate_barcode" => encode(crate::barcodes::generate_barcode(
            arg(a, "kind")?,
            arg(a, "data")?,
            arg(a, "format")?,
        )?),
        _ => Err("Unknown tool".into()),
    }
}
fn error(id: Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
#[derive(Default)]
struct Session {
    initialized: bool,
    ready: bool,
}
impl Session {
    fn handle(&mut self, conn: &mut Connection, request: Value) -> Option<Value> {
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        if request["jsonrpc"] != "2.0"
            || !request["method"].is_string()
            || !(id.is_null() || id.is_string() || id.is_number())
        {
            return Some(error(id, -32600, "Invalid JSON-RPC request"));
        }
        let method = request["method"].as_str().unwrap();
        if request.get("id").is_none() {
            if method == "notifications/initialized" && self.initialized {
                self.ready = true;
            }
            return None;
        }
        let params = &request["params"];
        let result = match method {
            "initialize" => {
                if !params["protocolVersion"].is_string()
                    || !params["capabilities"].is_object()
                    || !params["clientInfo"].is_object()
                {
                    return Some(error(
                        id,
                        -32602,
                        "Expected protocolVersion, capabilities and clientInfo",
                    ));
                }
                self.initialized = true;
                self.ready = false;
                let requested = params["protocolVersion"].as_str().unwrap();
                let version = match requested {
                    "2024-11-05" | "2025-03-26" | "2025-06-18" | "2025-11-25" => requested,
                    _ => "2025-11-25",
                };
                json!({"protocolVersion":version,"capabilities":{"tools":{}},"serverInfo":{"name":"dev-toolbox-test-plans","version":env!("CARGO_PKG_VERSION")},"instructions":"Work on saved Test Plans. Read cases before editing; save complete content with expectedRevision. Keep stable list/product IDs. Deletes are permanent. File paths refer to this machine. Unsaved UI drafts are not visible; reload the UI to see external edits."})
            }
            "ping" => json!({}),
            _ if !self.ready => return Some(error(id, -32000, "Initialize the MCP session first")),
            "tools/list" => json!({"tools":tools()}),
            "tools/call" => {
                let Some(name) = params["name"].as_str() else {
                    return Some(error(id, -32602, "Expected tool name"));
                };
                let empty = json!({});
                match call(conn, name, params.get("arguments").unwrap_or(&empty)) {
                    Ok(value) => {
                        json!({"content":[{"type":"text","text":value.to_string()}],"isError":false})
                    }
                    Err(message) => {
                        json!({"content":[{"type":"text","text":message}],"isError":true})
                    }
                }
            }
            _ => return Some(error(id, -32601, "Method not found")),
        };
        Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
    }
}
/// Runs without creating a window or requiring the GUI to be running.
pub fn run() -> Result<(), String> {
    let default_path = dirs::data_dir()
        .ok_or("Cannot locate application data directory")?
        .join("com.sanduilie-cristian.dev-toolbox")
        .join("tasks.db");
    // Explicit override supports isolated profiles and installation smoke tests.
    let path = std::env::var_os("DEV_TOOLBOX_MCP_DATABASE")
        .map(std::path::PathBuf::from)
        .unwrap_or(default_path);
    let mut conn = crate::db::open_db(&path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    serve(&mut conn, std::io::stdin().lock(), std::io::stdout().lock())
}
fn serve(
    conn: &mut Connection,
    mut input: impl BufRead,
    mut output: impl Write,
) -> Result<(), String> {
    let mut session = Session::default();
    loop {
        // Includes JSON arrays of PDF bytes while bounding untrusted input allocation.
        let mut bytes = Vec::new();
        let size = std::io::Read::take(&mut input, 256_000_001)
            .read_until(b'\n', &mut bytes)
            .map_err(|e| e.to_string())?;
        if size == 0 {
            return Ok(());
        }
        if size > 256_000_000 {
            return Err("MCP message exceeds 256 MB".into());
        }
        let response = match serde_json::from_slice(&bytes) {
            Ok(request) => session.handle(conn, request),
            Err(_) => Some(error(Value::Null, -32700, "Parse error")),
        };
        if let Some(response) = response {
            serde_json::to_writer(&mut output, &response).map_err(|e| e.to_string())?;
            output
                .write_all(b"\n")
                .and_then(|_| output.flush())
                .map_err(|e| e.to_string())?;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stdio_handshake_errors_and_notifications() {
        let dir = tempfile::tempdir().unwrap();
        let mut conn = crate::db::open_db(&dir.path().join("test.db")).unwrap();
        let input = concat!("bad json\n", "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}\n",
            "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1\"}}}\n",
            "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n",
            "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/list\"}\n");
        let mut out = Vec::new();
        serve(&mut conn, input.as_bytes(), &mut out).unwrap();
        let responses: Vec<Value> = String::from_utf8(out)
            .unwrap()
            .lines()
            .map(|s| serde_json::from_str(s).unwrap())
            .collect();
        assert_eq!(responses.len(), 4);
        assert_eq!(responses[0]["error"]["code"], -32700);
        assert_eq!(responses[1]["error"]["code"], -32000);
        assert_eq!(responses[2]["result"]["protocolVersion"], "2025-11-25");
        assert_eq!(
            responses[3]["result"]["tools"].as_array().unwrap().len(),
            14
        );
    }
    #[test]
    fn tools_share_validation_history_conflicts_and_portable_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut conn = crate::db::open_db(&dir.path().join("test.db")).unwrap();
        let project = call(&mut conn, "save_test_project", &json!({"name":"Agent"})).unwrap();
        let content = json!({"schemaVersion":1,"title":"Scan","descriptionMarkdown":"# Steps","lists":[{"id":"l1","name":"Codes","products":[]}]});
        let mut args = json!({"projectId":project,"expectedRevision":0,"content":content});
        let saved = call(&mut conn, "save_test_case", &args).unwrap();
        args["id"] = saved["id"].clone();
        args["expectedRevision"] = json!(1);
        args["content"]["title"] = json!("Edited");
        call(&mut conn, "save_test_case", &args).unwrap();
        assert!(call(&mut conn, "save_test_case", &args).is_err());
        assert_eq!(
            call(
                &mut conn,
                "get_test_case_revisions",
                &json!({"caseId":saved["id"]})
            )
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
            2
        );
        let path = dir.path().join("export.json");
        call(
            &mut conn,
            "export_test_project",
            &json!({"projectId":project,"filePath":path}),
        )
        .unwrap();
        let document = call(
            &mut conn,
            "read_test_plan_import",
            &json!({"filePath":path}),
        )
        .unwrap();
        call(&mut conn, "import_test_plan", &json!({"document":document})).unwrap();
        assert_eq!(
            call(&mut conn, "list_test_projects", &json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert!(call(&mut conn, "save_test_project", &json!({"name":""})).is_err());
        assert!(call(
            &mut conn,
            "save_test_project",
            &json!({"name":"x","extra":1})
        )
        .is_err());
        call(&mut conn, "delete_test_project", &json!({"id":project})).unwrap();
        assert_eq!(
            call(&mut conn, "list_test_cases", &json!({}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
}
