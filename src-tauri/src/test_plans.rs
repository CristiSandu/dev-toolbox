use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// Limits apply to source documents, never generated images.
const MAX_CONTENT_BYTES: usize = 2_000_000;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Product {
    id: String,
    title: String,
    text: String,
    #[serde(rename = "type")]
    code_type: String,
    image_url: String,
    description: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodeList {
    id: String,
    name: String,
    products: Vec<Product>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseContent {
    schema_version: u32,
    title: String,
    description_markdown: String,
    lists: Vec<CodeList>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    id: i64,
    name: String,
    created_at: String,
    updated_at: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestCase {
    id: i64,
    project_id: i64,
    content: CaseContent,
    revision: i64,
    created_at: String,
    updated_at: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    revision: i64,
    snapshot: CaseContent,
    changes: Vec<String>,
    created_at: String,
}
fn valid_name(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 200
}
fn valid_image_url(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    tauri::Url::parse(value).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
            && value.trim() == value
            && value.len() <= 8192
    })
}
fn validate(content: &CaseContent) -> Result<(), String> {
    if content.schema_version != 1 || !valid_name(&content.title) {
        return Err(
            "Add a case title of 1–200 characters and use a supported document version.".into(),
        );
    }
    if content.description_markdown.len() > 500_000
        || content.lists.is_empty()
        || content.lists.len() > 100
    {
        return Err("Use 1–100 lists and a description under 500 KB.".into());
    }
    let mut ids = HashSet::new();
    let mut total = 0;
    for list in &content.lists {
        if !valid_name(&list.name) || !valid_name(&list.id) || !ids.insert(&list.id) {
            return Err("Lists need a name and unique ID (1–200 characters).".into());
        }
        total += list.products.len();
        for product in &list.products {
            if !valid_name(&product.id)
                || !ids.insert(&product.id)
                || product.title.chars().count() > 200
                || product.text.trim().is_empty()
                || product.text.len() > 32_000
                || product.description.len() > 32_000
                || !matches!(
                    product.code_type.as_str(),
                    "QR Code" | "EAN-13" | "DataMatrix" | "Code128"
                )
                || !valid_image_url(&product.image_url)
            {
                return Err("Each product needs a unique ID, a value (up to 32 KB), a supported format, and an optional HTTP(S) image URL without credentials. Titles allow 200 characters; product descriptions allow 32 KB.".into());
            }
        }
    }
    if total > 5000 {
        return Err("A case supports up to 5,000 products.".into());
    }
    if serde_json::to_vec(content)
        .map_err(|e| e.to_string())?
        .len()
        > MAX_CONTENT_BYTES
    {
        return Err("Case content exceeds 2 MB.".into());
    }
    Ok(())
}
fn compare(old: Option<&CaseContent>, next: &CaseContent) -> Vec<String> {
    let Some(old) = old else {
        return vec!["Created test case".into()];
    };
    let mut changes = Vec::new();
    if old.title != next.title {
        changes.push(format!("Case title: {} → {}", old.title, next.title));
    }
    if old.description_markdown != next.description_markdown {
        changes.push("Updated Markdown description".into());
    }
    let old_lists: HashMap<_, _> = old.lists.iter().map(|l| (&l.id, l)).collect();
    let new_lists: HashMap<_, _> = next.lists.iter().map(|l| (&l.id, l)).collect();
    for list in &old.lists {
        if !new_lists.contains_key(&list.id) {
            changes.push(format!(
                "Removed list: {} ({} products)",
                list.name,
                list.products.len()
            ));
        }
    }
    for list in &next.lists {
        let Some(previous) = old_lists.get(&list.id) else {
            changes.push(format!(
                "Added list: {} ({} products)",
                list.name,
                list.products.len()
            ));
            continue;
        };
        if previous.name != list.name {
            changes.push(format!("List name: {} → {}", previous.name, list.name));
        }
        let before: HashMap<_, _> = previous.products.iter().map(|p| (&p.id, p)).collect();
        let after: HashMap<_, _> = list.products.iter().map(|p| (&p.id, p)).collect();
        for product in &previous.products {
            if !after.contains_key(&product.id) {
                changes.push(format!(
                    "{}: removed product {}",
                    list.name,
                    product_label(product)
                ));
            }
        }
        for product in &list.products {
            let label = product_label(product);
            let Some(previous) = before.get(&product.id) else {
                changes.push(format!("{}: added product {}", list.name, label));
                continue;
            };
            for (field, a, b) in [
                ("title", &previous.title, &product.title),
                ("value", &previous.text, &product.text),
                ("format", &previous.code_type, &product.code_type),
                ("image URL", &previous.image_url, &product.image_url),
                ("description", &previous.description, &product.description),
            ] {
                if a != b {
                    changes.push(format!("{} / {}: changed {}", list.name, label, field));
                }
            }
        }
        if previous.products.iter().map(|p| &p.id).collect::<Vec<_>>()
            != list.products.iter().map(|p| &p.id).collect::<Vec<_>>()
            && previous.products.len() == list.products.len()
            && before.keys().all(|id| after.contains_key(id))
        {
            changes.push(format!("{}: reordered products", list.name));
        }
    }
    if old.lists.iter().map(|l| &l.id).collect::<Vec<_>>()
        != next.lists.iter().map(|l| &l.id).collect::<Vec<_>>()
        && old.lists.len() == next.lists.len()
        && old_lists.keys().all(|id| new_lists.contains_key(id))
    {
        changes.push("Reordered lists".into());
    }
    changes
}
fn product_label(product: &Product) -> &str {
    if product.title.is_empty() {
        &product.text
    } else {
        &product.title
    }
}
fn read_case(conn: &Connection, id: i64) -> Result<TestCase, String> {
    let (project_id, json, revision, created_at, updated_at): (i64, String, i64, String, String) = conn.query_row(
        "SELECT project_id, content_json, revision, created_at, updated_at FROM test_cases WHERE id=?1", [id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    ).map_err(|e| e.to_string())?;
    Ok(TestCase {
        id,
        project_id,
        content: serde_json::from_str(&json).map_err(|e| e.to_string())?,
        revision,
        created_at,
        updated_at,
    })
}
#[tauri::command]
pub fn list_test_projects(app: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id,name,created_at,updated_at FROM test_projects ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Project {
                id: r.get(0)?,
                name: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn save_test_project(
    app: tauri::AppHandle,
    id: Option<i64>,
    name: String,
) -> Result<i64, String> {
    if !valid_name(&name) {
        return Err("Enter a project name of 1–200 characters.".into());
    }
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    match id {
        Some(id) => {
            if conn
                .execute(
                    "UPDATE test_projects SET name=?1,updated_at=?2 WHERE id=?3",
                    params![name.trim(), now, id],
                )
                .map_err(|e| e.to_string())?
                == 0
            {
                return Err("Project no longer exists.".into());
            }
            Ok(id)
        }
        None => {
            conn.execute(
                "INSERT INTO test_projects (name,created_at,updated_at) VALUES (?1,?2,?2)",
                params![name.trim(), now],
            )
            .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }
}
#[tauri::command]
pub fn list_test_cases(app: tauri::AppHandle) -> Result<Vec<TestCase>, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id FROM test_cases ORDER BY id")
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map([], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    ids.into_iter().map(|id| read_case(&conn, id)).collect()
}
#[tauri::command]
pub fn save_test_case(
    app: tauri::AppHandle,
    id: Option<i64>,
    project_id: i64,
    expected_revision: i64,
    content: CaseContent,
) -> Result<TestCase, String> {
    let mut conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    save_case(&mut conn, id, project_id, expected_revision, &content)
}
fn save_case(
    conn: &mut Connection,
    id: Option<i64>,
    project_id: i64,
    expected: i64,
    content: &CaseContent,
) -> Result<TestCase, String> {
    validate(content)?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let saved = save_case_in_connection(&tx, id, project_id, expected, content)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(saved)
}
fn save_case_in_connection(
    tx: &Connection,
    id: Option<i64>,
    project_id: i64,
    expected: i64,
    content: &CaseContent,
) -> Result<TestCase, String> {
    let previous = id.map(|id| read_case(tx, id)).transpose()?;
    if let Some(ref previous) = previous {
        if previous.project_id != project_id || previous.revision != expected {
            return Err("This case changed since it was opened. Keep your draft and reload the saved case before trying again.".into());
        }
        if previous.content == *content {
            return Ok(previous.clone());
        }
    } else if expected != 0 {
        return Err("A new case must start at revision 0.".into());
    }
    let json = serde_json::to_string(content).map_err(|e| e.to_string())?;
    let changes = serde_json::to_string(&compare(previous.as_ref().map(|p| &p.content), content))
        .map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let revision = expected + 1;
    let case_id = if let Some(id) = id {
        tx.execute(
            "UPDATE test_cases SET content_json=?1,revision=?2,updated_at=?3 WHERE id=?4",
            params![json, revision, now, id],
        )
        .map_err(|e| e.to_string())?;
        id
    } else {
        tx.execute("INSERT INTO test_cases (project_id,content_json,revision,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)", params![project_id,json,revision,now]).map_err(|e| e.to_string())?;
        tx.last_insert_rowid()
    };
    tx.execute("INSERT INTO test_case_revisions (case_id,revision,snapshot_json,changes_json,created_at) VALUES (?1,?2,?3,?4,?5)", params![case_id,revision,json,changes,now]).map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE test_projects SET updated_at=?1 WHERE id=?2",
        params![now, project_id],
    )
    .map_err(|e| e.to_string())?;
    read_case(tx, case_id)
}
#[tauri::command]
pub fn delete_test_project(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM test_projects WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn delete_test_case(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM test_cases WHERE id=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn get_test_case_revisions(
    app: tauri::AppHandle,
    case_id: i64,
) -> Result<Vec<Revision>, String> {
    let conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    read_revisions(&conn, case_id)
}
fn read_revisions(conn: &Connection, case_id: i64) -> Result<Vec<Revision>, String> {
    let mut stmt = conn.prepare("SELECT revision,snapshot_json,changes_json,created_at FROM test_case_revisions WHERE case_id=?1 ORDER BY revision DESC").map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([case_id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        let (revision, snapshot, changes, created_at) = row.map_err(|e| e.to_string())?;
        Ok(Revision {
            revision,
            snapshot: serde_json::from_str(&snapshot).map_err(|e| e.to_string())?,
            changes: serde_json::from_str(&changes).map_err(|e| e.to_string())?,
            created_at,
        })
    })
    .collect()
}

#[tauri::command]
pub async fn fetch_test_product_image(url: String) -> Result<String, String> {
    use base64::Engine;
    if url.is_empty() || !valid_image_url(&url) {
        return Err("Use an HTTP(S) product image URL without credentials.".into());
    }
    // Fetch locally so product-image servers do not need browser CORS headers.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !valid_image_url(attempt.url().as_str()) {
                attempt.error("Unsupported product image redirect")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if !matches!(
        mime.as_str(),
        "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    ) || response
        .content_length()
        .is_some_and(|size| size > 8_000_000)
    {
        return Err("Use a PNG, JPEG, WebP or GIF product image under 8 MB.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > 8_000_000 {
            return Err("Product image exceeds 8 MB.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(format!(
        "data:{mime};base64,{}",
        base64::prelude::BASE64_STANDARD.encode(bytes)
    ))
}

#[tauri::command]
pub fn save_test_case_pdf(file_path: String, bytes: Vec<u8>) -> Result<(), String> {
    write_case_pdf(&file_path, &bytes)
}
fn write_case_pdf(file_path: &str, bytes: &[u8]) -> Result<(), String> {
    if !bytes.starts_with(b"%PDF-") || bytes.len() > 64_000_000 {
        return Err("Expected a PDF document under 64 MB.".into());
    }
    std::fs::write(file_path, bytes).map_err(|e| format!("Could not save PDF: {e}"))
}

// Portable content only: database IDs and local revision history stay on this device.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransferProject {
    name: String,
    cases: Vec<CaseContent>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransferDocument {
    format: String,
    version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    project: Option<TransferProject>,
    #[serde(skip_serializing_if = "Option::is_none")]
    test_case: Option<CaseContent>,
}
const MAX_TRANSFER_BYTES: u64 = 20_000_000;
impl TransferDocument {
    fn validate(&self) -> Result<(), String> {
        if self.format != "dev-toolbox-test-plans" || self.version != 1 {
            return Err("Unsupported Test Plans JSON format or version.".into());
        }
        match (&self.project, &self.test_case) {
            (Some(project), None) => {
                if !valid_name(&project.name) || project.cases.len() > 1000 {
                    return Err(
                        "A project needs a name (1–200 characters) and at most 1,000 cases.".into(),
                    );
                }
                for content in &project.cases {
                    validate(content)?;
                }
            }
            (None, Some(content)) => validate(content)?,
            _ => return Err("JSON must contain either one project or one testCase.".into()),
        }
        if serde_json::to_vec(self).map_err(|e| e.to_string())?.len() as u64 > MAX_TRANSFER_BYTES {
            return Err("Test Plans JSON exceeds 20 MB.".into());
        }
        Ok(())
    }
}
fn write_transfer(file_path: &str, document: &TransferDocument) -> Result<(), String> {
    document.validate()?;
    let json = serde_json::to_vec_pretty(document).map_err(|e| e.to_string())?;
    if json.len() as u64 > MAX_TRANSFER_BYTES {
        return Err("Export exceeds 20 MB. Export individual cases instead.".into());
    }
    std::fs::write(file_path, json).map_err(|e| e.to_string())
}
fn project_document(conn: &Connection, project_id: i64) -> Result<TransferDocument, String> {
    let name = conn
        .query_row(
            "SELECT name FROM test_projects WHERE id=?1",
            [project_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id FROM test_cases WHERE project_id=?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let ids = stmt
        .query_map([project_id], |r| r.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let cases = ids
        .into_iter()
        .map(|id| read_case(conn, id).map(|case| case.content))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(TransferDocument {
        format: "dev-toolbox-test-plans".into(),
        version: 1,
        project: Some(TransferProject { name, cases }),
        test_case: None,
    })
}
#[tauri::command]
pub fn export_test_project(
    app: tauri::AppHandle,
    project_id: i64,
    file_path: String,
) -> Result<(), String> {
    let mut conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    write_transfer(&file_path, &project_document(&tx, project_id)?)
}
#[tauri::command]
pub fn export_test_case(content: CaseContent, file_path: String) -> Result<(), String> {
    write_transfer(
        &file_path,
        &TransferDocument {
            format: "dev-toolbox-test-plans".into(),
            version: 1,
            project: None,
            test_case: Some(content),
        },
    )
}
#[tauri::command]
pub fn read_test_plan_import(file_path: String) -> Result<TransferDocument, String> {
    use std::io::Read;
    let file = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_TRANSFER_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_TRANSFER_BYTES {
        return Err("Test Plans JSON exceeds 20 MB.".into());
    }
    let document: TransferDocument =
        serde_json::from_slice(&bytes).map_err(|e| format!("Invalid Test Plans JSON: {e}"))?;
    document.validate()?;
    Ok(document)
}
fn import_document(
    conn: &mut Connection,
    document: &TransferDocument,
    project_id: Option<i64>,
    new_project_name: Option<&str>,
) -> Result<i64, String> {
    document.validate()?;
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let (name, contents) = match (&document.project, &document.test_case) {
        (Some(project), None) => (Some(project.name.as_str()), project.cases.as_slice()),
        (None, Some(content)) => (new_project_name, std::slice::from_ref(content)),
        _ => unreachable!(),
    };
    let now = Utc::now().to_rfc3339();
    let target = if let Some(name) = name {
        if !valid_name(name) {
            return Err("Enter a project name of 1–200 characters.".into());
        }
        tx.execute(
            "INSERT INTO test_projects (name,created_at,updated_at) VALUES (?1,?2,?2)",
            params![name.trim(), now],
        )
        .map_err(|e| e.to_string())?;
        tx.last_insert_rowid()
    } else {
        project_id.ok_or("Choose a project for the imported case.")?
    };
    for content in contents {
        save_case_in_connection(&tx, None, target, 0, content)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(target)
}
#[tauri::command]
pub fn import_test_plan(
    app: tauri::AppHandle,
    document: TransferDocument,
    project_id: Option<i64>,
    new_project_name: Option<String>,
) -> Result<i64, String> {
    let mut conn = crate::db::get_db(&app).map_err(|e| e.to_string())?;
    import_document(
        &mut conn,
        &document,
        project_id,
        new_project_name.as_deref(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn content() -> CaseContent {
        serde_json::from_value(serde_json::json!({"schemaVersion":1,"title":"Scan products","descriptionMarkdown":"# Test\n\n- [ ] Scan **all** codes", "lists":[{"id":"list-1","name":"Products","products":[{"id":"product-1","title":"Sample","text":"0012345678905","type":"EAN-13","imageUrl":"https://example.com/a.png","description":""}]}]})).unwrap()
    }
    fn setup() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().unwrap();
        let conn = crate::db::open_db(&dir.path().join("test.db")).unwrap();
        conn.execute(
            "INSERT INTO test_projects (name,created_at,updated_at) VALUES ('Project','now','now')",
            [],
        )
        .unwrap();
        (dir, conn)
    }
    #[test]
    fn pdf_image_fetch_preserves_images_and_rejects_unsafe_urls_and_responses() {
        use std::io::{Read, Write};
        for url in [
            "file:///etc/passwd",
            "https://user:pass@example.com/a",
            "javascript:alert(1)",
            "",
        ] {
            assert!(tauri::async_runtime::block_on(fetch_test_product_image(url.into())).is_err());
        }
        for (mime, length, expected) in [
            ("image/png", 3, true),
            ("text/html", 3, false),
            ("image/png", 8_000_001, false),
        ] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}/product", listener.local_addr().unwrap());
            let server = std::thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                let mut request = [0; 4096];
                socket.read(&mut request).unwrap();
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: {mime}\r\nContent-Length: {length}\r\nConnection: close\r\n\r\nabc");
                let _ = socket.write_all(response.as_bytes());
            });
            let result = tauri::async_runtime::block_on(fetch_test_product_image(url));
            if expected {
                assert_eq!(result.unwrap(), "data:image/png;base64,YWJj");
            } else {
                assert!(result.is_err());
            }
            server.join().unwrap();
        }
    }
    #[test]
    fn pdf_writer_rejects_invalid_content_without_overwriting_a_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("case.pdf");
        let path = path.to_str().unwrap();
        assert!(write_case_pdf(path, b"not a PDF").is_err());
        assert!(!std::path::Path::new(path).exists());
        let bytes = b"%PDF-1.3\nfixture\n%%EOF";
        write_case_pdf(path, bytes).unwrap();
        assert!(write_case_pdf(path, b"invalid").is_err());
        assert_eq!(std::fs::read(path).unwrap(), bytes);
        assert!(
            write_case_pdf(dir.path().join("missing/case.pdf").to_str().unwrap(), bytes).is_err()
        );
    }
    #[test]
    fn portable_project_and_case_round_trip_as_new_copies() {
        let (dir, mut conn) = setup();
        let first = save_case(&mut conn, None, 1, 0, &content()).unwrap();
        let mut edited = content();
        edited.title = "Edited".into();
        save_case(&mut conn, Some(first.id), 1, 1, &edited).unwrap();
        save_case(&mut conn, None, 1, 0, &content()).unwrap();
        let document = project_document(&conn, 1).unwrap();
        let path = dir.path().join("project.json");
        write_transfer(path.to_str().unwrap(), &document).unwrap();
        let decoded = read_test_plan_import(path.to_str().unwrap().into()).unwrap();
        let copied = import_document(&mut conn, &decoded, None, None).unwrap();
        assert_ne!(copied, 1);
        let json = serde_json::to_value(project_document(&conn, copied).unwrap()).unwrap();
        assert_eq!(
            json["project"]["cases"][0],
            serde_json::to_value(&edited).unwrap()
        );
        assert_eq!(json["project"]["cases"].as_array().unwrap().len(), 2);
        assert_eq!(
            json["project"]["cases"][1],
            serde_json::to_value(content()).unwrap()
        );
        assert!(json["project"].get("id").is_none());
        let case_document = TransferDocument {
            format: "dev-toolbox-test-plans".into(),
            version: 1,
            project: None,
            test_case: Some(content()),
        };
        write_transfer(path.to_str().unwrap(), &case_document).unwrap();
        let decoded = read_test_plan_import(path.to_str().unwrap().into()).unwrap();
        import_document(&mut conn, &decoded, Some(copied), None).unwrap();
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM test_cases WHERE project_id=?1",
                [copied],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(total, 3);
        let revisions: i64 = conn.query_row("SELECT COUNT(*) FROM test_case_revisions r JOIN test_cases c ON c.id=r.case_id WHERE c.project_id=?1 AND r.revision=1", [copied], |r| r.get(0)).unwrap();
        assert_eq!(revisions, 3);
        assert_eq!(read_case(&conn, first.id).unwrap().revision, 2);
        assert_eq!(read_revisions(&conn, first.id).unwrap().len(), 2);
        let created = import_document(&mut conn, &case_document, None, Some("Colleague")).unwrap();
        assert_ne!(created, copied);
    }
    #[test]
    fn portable_import_rejects_invalid_documents_and_rolls_back_failed_writes() {
        let (dir, mut conn) = setup();
        let mut document = TransferDocument {
            format: "dev-toolbox-test-plans".into(),
            version: 1,
            project: Some(TransferProject {
                name: "Import".into(),
                cases: vec![content(), content()],
            }),
            test_case: None,
        };
        document.version = 2;
        assert!(import_document(&mut conn, &document, None, None).is_err());
        document.version = 1;
        document.test_case = Some(content());
        assert!(document.validate().is_err());
        document.test_case = None;
        document.project.as_mut().unwrap().cases[1].lists[0].products[0].image_url =
            "file:///etc/passwd".into();
        assert!(import_document(&mut conn, &document, None, None).is_err());
        document.project.as_mut().unwrap().cases[1] = content();
        conn.execute_batch("CREATE TRIGGER reject_second_case BEFORE INSERT ON test_cases WHEN (SELECT COUNT(*) FROM test_cases)>=1 BEGIN SELECT RAISE(ABORT,'write failure'); END;").unwrap();
        assert!(import_document(&mut conn, &document, None, None).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM test_projects", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM test_cases", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM test_case_revisions", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        let path = dir.path().join("invalid.json");
        std::fs::write(&path, "{}").unwrap();
        assert!(read_test_plan_import(path.to_str().unwrap().into()).is_err());
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_TRANSFER_BYTES + 1).unwrap();
        assert!(read_test_plan_import(path.to_str().unwrap().into()).is_err());
    }
    #[test]
    fn save_history_noop_conflict_and_reopen() {
        let (dir, mut conn) = setup();
        let mut source = content();
        let first = save_case(&mut conn, None, 1, 0, &source).unwrap();
        assert_eq!(first.revision, 1);
        assert_eq!(
            save_case(&mut conn, Some(first.id), 1, 1, &source)
                .unwrap()
                .revision,
            1
        );
        source
            .description_markdown
            .push_str("\n\n| A | B |\n| - | - |\n| 1 | 2 |");
        source.lists[0].products[0].image_url = "https://example.com/new.png".into();
        let second = save_case(&mut conn, Some(first.id), 1, 1, &source).unwrap();
        assert_eq!(second.revision, 2);
        assert!(save_case(&mut conn, Some(first.id), 1, 1, &content()).is_err());
        let conn = crate::db::open_db(&dir.path().join("test.db")).unwrap();
        assert_eq!(read_case(&conn, first.id).unwrap().content, source);
        let history = read_revisions(&conn, first.id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[1].snapshot, content());
        assert!(history[0].changes.iter().any(|c| c.contains("image URL")));
        assert_eq!(
            history[0].snapshot.lists[0].products[0].text,
            "0012345678905"
        );
    }
    #[test]
    fn revision_failure_rolls_back_content() {
        let (_dir, mut conn) = setup();
        let first = save_case(&mut conn, None, 1, 0, &content()).unwrap();
        conn.execute_batch("CREATE TRIGGER reject_revision BEFORE INSERT ON test_case_revisions BEGIN SELECT RAISE(ABORT,'disk failure'); END;").unwrap();
        let mut next = content();
        next.title = "Changed".into();
        assert!(save_case(&mut conn, Some(first.id), 1, 1, &next).is_err());
        assert_eq!(read_case(&conn, first.id).unwrap().content, content());
        assert_eq!(read_revisions(&conn, first.id).unwrap().len(), 1);
    }
    #[test]
    fn parent_delete_cascades_and_invalid_parent_inserts_nothing() {
        let (_dir, mut conn) = setup();
        assert!(save_case(&mut conn, None, 999, 0, &content()).is_err());
        let case = save_case(&mut conn, None, 1, 0, &content()).unwrap();
        conn.execute("DELETE FROM test_projects WHERE id=1", [])
            .unwrap();
        assert!(read_case(&conn, case.id).is_err());
        assert!(read_revisions(&conn, case.id).unwrap().is_empty());
    }
    #[test]
    fn validates_ids_formats_and_urls_but_allows_invalid_barcode_values() {
        let mut source = content();
        source.lists[0].products[0].text = "intentionally invalid EAN".into();
        assert!(validate(&source).is_ok());
        for url in [
            "javascript:alert(1)",
            "file:///tmp/a",
            "https://user:pass@example.com/a",
            "//example.com/a",
        ] {
            source.lists[0].products[0].image_url = url.into();
            assert!(validate(&source).is_err());
        }
        source.lists[0].products[0].image_url.clear();
        let duplicate = source.lists[0].products[0].clone();
        source.lists[0].products.push(duplicate);
        assert!(validate(&source).is_err());
    }
}
