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
    read_codegen_history(&conn)
}

fn read_codegen_history(conn: &rusqlite::Connection) -> Result<Vec<CodegenHistoryEntry>, String> {
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
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    export_history_to_file(&conn, &file_path)
}

fn export_history_to_file(conn: &rusqlite::Connection, file_path: &str) -> Result<(), String> {
    let entries = read_codegen_history(conn)?;

    let export_data = CodegenHistoryExport {
        entries,
        export_date: Utc::now().to_rfc3339(),
        version: "1.0".to_string(),
    };

    let json = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;

    fs::write(file_path, json).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn import_codegen_history(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<usize, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    import_history_from_file(&conn, &file_path)
}

fn import_history_from_file(conn: &rusqlite::Connection, file_path: &str) -> Result<usize, String> {
    let json = fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let export_data: CodegenHistoryExport =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse JSON: {}", e))?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_backup_round_trip_preserves_history_payloads_and_assigns_new_ids() {
        let directory = tempfile::tempdir().unwrap();
        let conn = crate::db::open_db(&directory.path().join("tasks.db")).unwrap();
        let path = directory.path().join("history.json");
        let path = path.to_str().unwrap();
        let fixture = include_str!("../../tests/fixtures/codegen-history-v1.json");
        fs::write(path, fixture).unwrap();
        assert_eq!(import_history_from_file(&conn, path).unwrap(), 1);
        assert_eq!(import_history_from_file(&conn, path).unwrap(), 1);
        export_history_to_file(&conn, path).unwrap();

        let original: serde_json::Value = serde_json::from_str(fixture).unwrap();
        let exported: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(exported["version"], "1.0");
        assert!(
            chrono::DateTime::parse_from_rfc3339(exported["export_date"].as_str().unwrap()).is_ok()
        );
        let rows = exported["entries"].as_array().unwrap();
        assert_eq!(rows.len(), 2);
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row["id"].as_i64().unwrap());
            let mut expected = original["entries"][0].clone();
            expected["id"] = row["id"].clone();
            assert_eq!(row, &expected);
        }
        ids.sort();
        assert_eq!(ids, vec![1, 2]);
    }

    #[test]
    fn malformed_or_incomplete_backup_does_not_insert_history() {
        let directory = tempfile::tempdir().unwrap();
        let conn = crate::db::open_db(&directory.path().join("tasks.db")).unwrap();
        let path = directory.path().join("bad.json");
        for json in [
            "not json",
            r#"{"entries":[{"id":1}],"version":"1.0","export_date":"now"}"#,
        ] {
            fs::write(&path, json).unwrap();
            assert!(import_history_from_file(&conn, path.to_str().unwrap()).is_err());
            assert!(read_codegen_history(&conn).unwrap().is_empty());
        }
    }
}
