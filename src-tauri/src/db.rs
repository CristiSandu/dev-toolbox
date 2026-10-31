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

    let mut conn = Connection::open(db_path)?;
    conn.pragma_update(None, "foreign_keys", true)?;
    let transaction = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let version: i64 = transaction.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version > 2 {
        return Err(rusqlite::Error::InvalidQuery);
    }

    transaction.execute(
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

    transaction.execute(
        "CREATE TABLE IF NOT EXISTS codegen_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,        -- 'single' or 'multi'
            summary TEXT NOT NULL,     -- short human summary
            payload TEXT NOT NULL,     -- JSON snapshot of state
            created_at TEXT NOT NULL   -- ISO timestamp
        )",
        [],
    )?;

    if version == 0 {
        transaction.execute("ALTER TABLE tasks ADD COLUMN jira_issue_type TEXT", [])?;
        transaction.pragma_update(None, "user_version", 1)?;
    }
    if version < 2 {
        transaction.execute_batch(
            "CREATE TABLE test_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE test_cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES test_projects(id) ON DELETE CASCADE,
            content_json TEXT NOT NULL, revision INTEGER NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
          CREATE INDEX test_cases_project ON test_cases(project_id);
          CREATE TABLE test_case_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
            revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
            changes_json TEXT NOT NULL, created_at TEXT NOT NULL,
            UNIQUE(case_id, revision));",
        )?;
        transaction.pragma_update(None, "user_version", 2)?;
    }
    transaction.commit()?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_schema_migrates_once_without_changing_existing_rows() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("legacy.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch("CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, number TEXT NOT NULL, feature_type TEXT NOT NULL, branch TEXT NOT NULL, pr_title TEXT NOT NULL, created_at TEXT NOT NULL);
              INSERT INTO tasks VALUES (99, 'Old task', 'A-1', 'hotfix', 'hotfix/a-1-old-task', 'A-1: Old task', '2026-01-01');").unwrap();
        }
        for _ in 0..2 {
            let conn = open_db(&path).unwrap();
            let row: (i64, String, String, Option<String>) = conn
                .query_row(
                    "SELECT id, name, feature_type, jira_issue_type FROM tasks",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .unwrap();
            assert_eq!(row, (99, "Old task".into(), "hotfix".into(), None));
            assert_eq!(
                conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                    .unwrap(),
                2
            );
        }
    }

    #[test]
    fn version_one_migrates_with_existing_data_and_enables_relationships() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("v1.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch("CREATE TABLE tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, number TEXT NOT NULL, feature_type TEXT NOT NULL, branch TEXT NOT NULL, pr_title TEXT NOT NULL, created_at TEXT NOT NULL, jira_issue_type TEXT);
              CREATE TABLE codegen_history (id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL, summary TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
              INSERT INTO tasks VALUES (1,'Task','DEV-1','bugfix','branch','PR','now','Bug');
              INSERT INTO codegen_history VALUES (1,'single','Saved code','{}','now');
              PRAGMA user_version = 1;").unwrap();
        }
        for _ in 0..2 {
            let conn = open_db(&path).unwrap();
            assert_eq!(
                conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                2
            );
            assert_eq!(
                conn.query_row("PRAGMA foreign_keys", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                1
            );
            assert_eq!(
                conn.query_row("SELECT jira_issue_type FROM tasks", [], |r| r
                    .get::<_, String>(0))
                    .unwrap(),
                "Bug"
            );
            assert_eq!(
                conn.query_row("SELECT summary FROM codegen_history", [], |r| r
                    .get::<_, String>(0))
                    .unwrap(),
                "Saved code"
            );
            assert!(conn.execute("INSERT INTO test_cases (project_id,content_json,revision,created_at,updated_at) VALUES (999,'{}',1,'now','now')", []).is_err());
        }
    }

    #[test]
    fn future_schema_is_rejected_without_modification() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("future.db");
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "user_version", 3).unwrap();
        assert!(open_db(&path).is_err());
        assert_eq!(
            conn.query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }

    #[test]
    fn reopening_database_preserves_both_histories() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("app-data/tasks.db");
        {
            let conn = open_db(&path).unwrap();
            conn.execute("INSERT INTO tasks (id, name, number, feature_type, branch, pr_title, created_at) VALUES (1, 'Fix login', 'DEV-42', 'bugfix', 'bugfix/DEV-42-fix-login', 'DEV-42: Fix login', '2026-10-30T10:00:00Z')", []).unwrap();
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
