use rusqlite::{Connection, Result};
use std::fs;
use tauri::path::BaseDirectory;
use tauri::Manager;

pub fn get_db(app: &tauri::AppHandle) -> Result<Connection> {
    let db_path = app
        .path()
        .resolve("tasks.db", BaseDirectory::AppData)
        .expect("failed to resolve app data path");

    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open(&db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            number TEXT NOT NULL,
            feature_type TEXT NOT NULL,
            branch TEXT NOT NULL,
            pr_title TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS codegen_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,        -- 'single' or 'multi'
            summary TEXT NOT NULL,     -- short human summary
            payload TEXT NOT NULL,     -- JSON snapshot of state
            created_at TEXT NOT NULL   -- ISO timestamp
        )",
        [],
    )?;

    Ok(conn)
}
