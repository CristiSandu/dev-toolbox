use rusqlite::{Connection, Result};
use std::fs;
use std::path::Path;
use tauri::path::BaseDirectory;
use tauri::Manager;

pub fn get_db(app: &tauri::AppHandle) -> Result<Connection> {
    let db_path = app
        .path()
        .resolve("tasks.db", BaseDirectory::AppData)
        .expect("failed to resolve app data path");

    open_db(&db_path)
}

pub(crate) fn open_db(db_path: &Path) -> Result<Connection> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reopening_database_preserves_both_histories() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("app-data/tasks.db");
        {
            let conn = open_db(&path).unwrap();
            conn.execute("INSERT INTO tasks VALUES (1, 'Fix login', 'DEV-42', 'bugfix', 'bugfix/DEV-42-fix-login', 'DEV-42: Fix login', '2026-10-30T10:00:00Z')", []).unwrap();
            conn.execute("INSERT INTO codegen_history VALUES (1, 'single', 'QR sample', '{}', '2026-10-30T10:00:00Z')", []).unwrap();
        }
        let reopened = open_db(&path).unwrap();
        assert_eq!(
            reopened
                .query_row("SELECT number FROM tasks", [], |row| row
                    .get::<_, String>(0))
                .unwrap(),
            "DEV-42"
        );
        assert_eq!(
            reopened
                .query_row("SELECT summary FROM codegen_history", [], |row| row
                    .get::<_, String>(0))
                .unwrap(),
            "QR sample"
        );
    }
}
