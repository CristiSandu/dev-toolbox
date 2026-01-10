use rusqlite::{Connection, OpenFlags, Result};
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::path::BaseDirectory;
use tauri::Manager;

fn init_schema(conn: &Connection) -> Result<()> {
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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS print_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_id TEXT NOT NULL,
            requested_by TEXT NOT NULL,
            payload TEXT NOT NULL,
            state TEXT NOT NULL,
            print_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    Ok(())
}

fn home_dir_fallback() -> PathBuf {
    env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".dev-toolbox")
        .join("tasks.db")
}

fn candidate_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
    vec![
        app.path()
            .resolve("tasks.db", BaseDirectory::AppData)
            .unwrap_or_else(|_| PathBuf::from("tasks.db")),
        app.path()
            .resolve("tasks.db", BaseDirectory::AppLocalData)
            .unwrap_or_else(|_| PathBuf::from("tasks.db")),
        home_dir_fallback(),
        app.path()
            .resolve("tasks.db", BaseDirectory::Temp)
            .unwrap_or_else(|_| PathBuf::from("/tmp/tasks.db")),
    ]
}

fn ensure_writable(path: &PathBuf) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if path.exists() {
        if let Ok(metadata) = fs::metadata(path) {
            let mut perms = metadata.permissions();
            if perms.readonly() {
                perms.set_readonly(false);
                let _ = fs::set_permissions(path, perms);
            }
        }
    }
}

fn try_open(path: &PathBuf, open_flags: OpenFlags) -> Option<Connection> {
    match Connection::open_with_flags(path, open_flags) {
        Ok(conn) => {
            // Quick write test to weed out read-only mounts
            if conn
                .execute(
                    "CREATE TABLE IF NOT EXISTS __writable_probe (v INTEGER)",
                    [],
                )
                .is_ok()
                && conn
                    .execute("DROP TABLE IF EXISTS __writable_probe", [])
                    .is_ok()
            {
                Some(conn)
            } else {
                None
            }
        }
        Err(_) => None,
    }
}

pub fn get_db(app: &tauri::AppHandle) -> Result<Connection> {
    let open_flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE;

    for path in candidate_paths(app) {
        ensure_writable(&path);

        if let Some(conn) = try_open(&path, open_flags) {
            init_schema(&conn)?;
            return Ok(conn);
        }
    }

    Err(rusqlite::Error::InvalidQuery) // Should not happen; all candidates failed
}

#[tauri::command]
pub fn debug_db_path(app: tauri::AppHandle) -> Result<String, String> {
    let open_flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE;

    for path in candidate_paths(&app) {
        ensure_writable(&path);
        if let Some(_) = try_open(&path, open_flags) {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    Err("No writable DB path found".into())
}
