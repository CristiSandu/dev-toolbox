use serde::Serialize;

#[derive(Serialize)]
pub struct Task {
    pub id: i64,
    pub name: String,
    pub number: String,
    pub feature_type: String,
    pub branch: String,
    pub pr_title: String,
    pub created_at: String,
}

#[tauri::command]
pub fn save_task(
    app: tauri::AppHandle,
    name: String,
    number: String,
    feature_type: String,
    branch: String,
    pr_title: String,
) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO tasks (name, number, feature_type, branch, pr_title, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (name, number, feature_type, branch, pr_title, now),
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

    let mut stmt = conn
        .prepare(
            "SELECT id, name, number, feature_type, branch, pr_title, created_at
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
            "SELECT id, name, number, feature_type, branch, pr_title, created_at
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
        })
    });

    match result {
        Ok(task) => Ok(Some(task)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
