use chrono::Utc;
use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PrintJob {
    pub id: i64,
    pub batch_id: String,
    pub requested_by: String,
    pub payload: String,
    pub state: String,
    pub print_count: i64,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn insert_print_job(
    app: &tauri::AppHandle,
    batch_id: &str,
    requested_by: &str,
    payload: &str,
) -> Result<PrintJob, String> {
    let conn = crate::db::get_db(app).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO print_jobs (batch_id, requested_by, payload, state, print_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'new', 0, ?4, ?4)",
        params![batch_id, requested_by, payload, now],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    let mut stmt = conn
        .prepare(
            "SELECT id, batch_id, requested_by, payload, state, print_count, last_error, created_at, updated_at
             FROM print_jobs WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let job = stmt
        .query_row(params![id], row_to_job)
        .map_err(|e| e.to_string())?;

    Ok(job)
}

fn row_to_job(row: &Row) -> rusqlite::Result<PrintJob> {
    Ok(PrintJob {
        id: row.get(0)?,
        batch_id: row.get(1)?,
        requested_by: row.get(2)?,
        payload: row.get(3)?,
        state: row.get(4)?,
        print_count: row.get(5)?,
        last_error: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn validate_state(state: &str) -> bool {
    matches!(state, "new" | "printing" | "done")
}

#[tauri::command]
pub fn create_print_job(
    app: tauri::AppHandle,
    batch_id: String,
    requested_by: String,
    payload: String,
) -> Result<PrintJob, String> {
    let job = insert_print_job(&app, &batch_id, &requested_by, &payload)?;
    let _ = app.emit("print-queue-updated", &job);
    Ok(job)
}

#[tauri::command]
pub fn list_print_jobs(app: tauri::AppHandle) -> Result<Vec<PrintJob>, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, batch_id, requested_by, payload, state, print_count, last_error, created_at, updated_at
             FROM print_jobs
             ORDER BY datetime(created_at) DESC",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], row_to_job)
        .map_err(|e| e.to_string())?;

    let mut jobs = Vec::new();
    for job in iter {
        jobs.push(job.map_err(|e| e.to_string())?);
    }

    Ok(jobs)
}

#[tauri::command]
pub fn update_print_job_state(
    app: tauri::AppHandle,
    id: i64,
    state: String,
    last_error: Option<String>,
    increment_count: bool,
) -> Result<(), String> {
    if !validate_state(&state) {
        return Err("Invalid state provided".into());
    }

    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let sql = if increment_count {
        "UPDATE print_jobs
         SET state = ?1, print_count = print_count + 1, last_error = ?2, updated_at = ?3
         WHERE id = ?4"
    } else {
        "UPDATE print_jobs
         SET state = ?1, last_error = ?2, updated_at = ?3
         WHERE id = ?4"
    };

    conn.execute(&sql, params![state, last_error, now, id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn requeue_job(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE print_jobs
         SET state = 'new', last_error = NULL, updated_at = ?1
         WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn requeue_batch(app: tauri::AppHandle, batch_id: String) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE print_jobs
         SET state = 'new', last_error = NULL, updated_at = ?1
         WHERE batch_id = ?2",
        params![now, batch_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
