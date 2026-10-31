use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Serialize, Deserialize)]
pub struct Task {
    pub id: i64,
    pub name: String,
    pub number: String,
    pub feature_type: String,
    pub branch: String,
    pub pr_title: String,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jira_issue_type: Option<String>,
}

#[tauri::command]
pub fn save_task(
    app: tauri::AppHandle,
    name: String,
    number: String,
    feature_type: String,
    branch: String,
    pr_title: String,
    jira_issue_type: Option<String>,
) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;

    validate_jira_type(&jira_issue_type)?;
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO tasks (name, number, feature_type, branch, pr_title, created_at, jira_issue_type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (name, number, feature_type, branch, pr_title, now, jira_issue_type),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_task(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE id = ?1", (id,))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_tasks(app: tauri::AppHandle) -> Result<Vec<Task>, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    read_tasks(&conn)
}

fn read_tasks(conn: &rusqlite::Connection) -> Result<Vec<Task>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, number, feature_type, branch, pr_title, created_at, jira_issue_type
             FROM tasks
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let task_iter = stmt
        .query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                name: row.get(1)?,
                number: row.get(2)?,
                feature_type: row.get(3)?,
                branch: row.get(4)?,
                pr_title: row.get(5)?,
                created_at: row.get(6)?,
                jira_issue_type: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();

    for task in task_iter {
        tasks.push(task.map_err(|e| e.to_string())?);
    }

    Ok(tasks)
}

#[tauri::command]
pub fn get_last_task(app: tauri::AppHandle) -> Result<Option<Task>, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, number, feature_type, branch, pr_title, created_at, jira_issue_type
             FROM tasks
             ORDER BY datetime(created_at) DESC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt.query_row([], |row| {
        Ok(Task {
            id: row.get(0)?,
            name: row.get(1)?,
            number: row.get(2)?,
            feature_type: row.get(3)?,
            branch: row.get(4)?,
            pr_title: row.get(5)?,
            created_at: row.get(6)?,
            jira_issue_type: row.get(7)?,
        })
    });

    match result {
        Ok(task) => Ok(Some(task)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize, Deserialize)]
pub struct TasksExport {
    pub tasks: Vec<Task>,
    pub export_date: String,
    pub version: String,
}

#[tauri::command]
pub async fn export_tasks(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    export_tasks_to_file(&conn, &file_path)
}

fn export_tasks_to_file(conn: &rusqlite::Connection, file_path: &str) -> Result<(), String> {
    let tasks = read_tasks(conn)?;

    let export_data = TasksExport {
        tasks,
        export_date: chrono::Utc::now().to_rfc3339(),
        version: "1.1".to_string(),
    };

    let json = serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize data: {}", e))?;

    fs::write(file_path, json).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn import_tasks(app: tauri::AppHandle, file_path: String) -> Result<usize, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    import_tasks_from_file(&conn, &file_path)
}

fn import_tasks_from_file(conn: &rusqlite::Connection, file_path: &str) -> Result<usize, String> {
    let json = fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let export_data: TasksExport =
        serde_json::from_str(&json).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    if !matches!(export_data.version.as_str(), "1.0" | "1.1") {
        return Err(format!(
            "Unsupported task backup version: {}",
            export_data.version
        ));
    }
    for task in &export_data.tasks {
        validate_jira_type(&task.jira_issue_type)?;
    }
    let transaction = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut imported_count = 0;

    for task in export_data.tasks {
        transaction.execute(
            "INSERT INTO tasks (name, number, feature_type, branch, pr_title, created_at, jira_issue_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (
                task.name,
                task.number,
                task.feature_type,
                task.branch,
                task.pr_title,
                task.created_at,
                task.jira_issue_type,
            ),
        )
        .map_err(|e| format!("Failed to import task: {}", e))?;
        imported_count += 1;
    }

    transaction.commit().map_err(|e| e.to_string())?;
    Ok(imported_count)
}

fn validate_jira_type(value: &Option<String>) -> Result<(), String> {
    match value.as_deref() {
        None | Some("Bug" | "Story" | "Task" | "Epic" | "Sub-task") => Ok(()),
        Some(_) => Err("Unsupported Jira issue type".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_backup_round_trip_preserves_task_fields_and_assigns_new_ids() {
        let directory = tempfile::tempdir().unwrap();
        let conn = crate::db::open_db(&directory.path().join("tasks.db")).unwrap();
        let backup = directory.path().join("tasks.json");
        let backup = backup.to_str().unwrap();
        let fixture = include_str!("../../tests/fixtures/tasks-v1.json");
        fs::write(backup, fixture).unwrap();
        assert_eq!(import_tasks_from_file(&conn, backup).unwrap(), 1);
        assert_eq!(import_tasks_from_file(&conn, backup).unwrap(), 1);
        export_tasks_to_file(&conn, backup).unwrap();

        let original: serde_json::Value = serde_json::from_str(fixture).unwrap();
        let exported: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(backup).unwrap()).unwrap();
        assert_eq!(exported["version"], "1.1");
        assert!(
            chrono::DateTime::parse_from_rfc3339(exported["export_date"].as_str().unwrap()).is_ok()
        );
        let rows = exported["tasks"].as_array().unwrap();
        assert_eq!(rows.len(), 2);
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row["id"].as_i64().unwrap());
            let mut expected = original["tasks"][0].clone();
            expected["id"] = row["id"].clone();
            assert_eq!(row, &expected);
        }
        ids.sort();
        assert_eq!(ids, vec![1, 2]);
    }

    #[test]
    fn jira_metadata_round_trip_and_invalid_backups_are_atomic() {
        let directory = tempfile::tempdir().unwrap();
        let conn = crate::db::open_db(&directory.path().join("tasks.db")).unwrap();
        let path = directory.path().join("tasks.json");
        let mut backup: serde_json::Value =
            serde_json::from_str(include_str!("../../tests/fixtures/tasks-v1.json")).unwrap();
        backup["version"] = "1.1".into();
        backup["tasks"][0]["jira_issue_type"] = "Bug".into();
        fs::write(&path, backup.to_string()).unwrap();
        import_tasks_from_file(&conn, path.to_str().unwrap()).unwrap();
        assert_eq!(
            read_tasks(&conn).unwrap()[0].jira_issue_type.as_deref(),
            Some("Bug")
        );
        export_tasks_to_file(&conn, path.to_str().unwrap()).unwrap();
        let exported: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(exported["tasks"][0]["jira_issue_type"], "Bug");
        let duplicate = backup["tasks"][0].clone();
        backup["tasks"].as_array_mut().unwrap().push(duplicate);
        backup["tasks"][1]["jira_issue_type"] = "Invalid".into();
        fs::write(&path, backup.to_string()).unwrap();
        assert!(import_tasks_from_file(&conn, path.to_str().unwrap()).is_err());
        backup["version"] = "9.0".into();
        fs::write(&path, backup.to_string()).unwrap();
        assert!(import_tasks_from_file(&conn, path.to_str().unwrap()).is_err());
        assert_eq!(read_tasks(&conn).unwrap().len(), 1);

        backup["version"] = "1.1".into();
        backup["tasks"][1]["jira_issue_type"] = "Bug".into();
        conn.execute_batch("CREATE TRIGGER fail_second_import BEFORE INSERT ON tasks WHEN (SELECT COUNT(*) FROM tasks) >= 2 BEGIN SELECT RAISE(FAIL, 'simulated write failure'); END;").unwrap();
        fs::write(&path, backup.to_string()).unwrap();
        assert!(import_tasks_from_file(&conn, path.to_str().unwrap()).is_err());
        assert_eq!(read_tasks(&conn).unwrap().len(), 1);
    }

    #[test]
    fn malformed_or_incomplete_backup_does_not_insert_tasks() {
        let directory = tempfile::tempdir().unwrap();
        let conn = crate::db::open_db(&directory.path().join("tasks.db")).unwrap();
        let path = directory.path().join("bad.json");
        for json in [
            "not json",
            r#"{"tasks":[{"id":1}],"version":"1.0","export_date":"now"}"#,
        ] {
            fs::write(&path, json).unwrap();
            assert!(import_tasks_from_file(&conn, path.to_str().unwrap()).is_err());
            assert!(read_tasks(&conn).unwrap().is_empty());
        }
    }
}
