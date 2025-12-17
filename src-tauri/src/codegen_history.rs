use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize)]
pub struct CodegenHistoryEntry {
    pub id: i64,
    pub mode: String,
    pub summary: String,
    pub payload: String,
    pub created_at: String,
}

#[tauri::command]
pub fn save_codegen_state(
    app: tauri::AppHandle,
    mode: String,
    summary: String,
    payload: String,
) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO codegen_history (mode, summary, payload, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        (mode, summary, payload, now),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_codegen_history(app: tauri::AppHandle) -> Result<Vec<CodegenHistoryEntry>, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, mode, summary, payload, created_at
             FROM codegen_history
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CodegenHistoryEntry {
                id: row.get(0)?,
                mode: row.get(1)?,
                summary: row.get(2)?,
                payload: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for r in rows {
        entries.push(r.map_err(|e| e.to_string())?);
    }

    Ok(entries)
}

#[tauri::command]
pub fn delete_codegen_entry(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM codegen_history WHERE id = ?1", (id,))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct CodegenHistoryExport {
    pub entries: Vec<CodegenHistoryEntry>,
    pub export_date: String,
    pub version: String,
}

#[tauri::command]
pub async fn export_codegen_history(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<(), String> {
    let entries = get_codegen_history(app.clone())?;
    
    let export_data = CodegenHistoryExport {
        entries,
        export_date: Utc::now().to_rfc3339(),
        version: "1.0".to_string(),
    };

    let json = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;

    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn import_codegen_history(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<usize, String> {
    let json = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let export_data: CodegenHistoryExport = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let mut imported_count = 0;

    for entry in export_data.entries {
        conn.execute(
            "INSERT INTO codegen_history (mode, summary, payload, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            (entry.mode, entry.summary, entry.payload, entry.created_at),
        )
        .map_err(|e| format!("Failed to import entry: {}", e))?;
        imported_count += 1;
    }

    Ok(imported_count)
}
