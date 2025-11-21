use rusqlite::{Connection, Result};

pub fn get_db() -> Result<Connection> {
    let conn = Connection::open("tasks.db")?;

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

    Ok(conn)
}
