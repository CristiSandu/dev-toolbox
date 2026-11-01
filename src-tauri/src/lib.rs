mod barcodes;
mod codegen_history;
mod commands;
mod db;
mod mcp;
mod mcp_settings;
pub use mcp::run as run_mcp;
mod test_plan_pdf;
mod test_plans;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(test_plan_pdf::PdfJobs::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            mcp_settings::get_mcp_setup,
            mcp_settings::check_mcp_connection,
            test_plans::list_test_projects,
            test_plans::save_test_project,
            test_plans::delete_test_project,
            test_plans::list_test_cases,
            test_plans::save_test_case,
            test_plans::delete_test_case,
            test_plans::get_test_case_revisions,
            test_plans::export_test_project,
            test_plans::export_test_case,
            test_plans::save_test_case_pdf,
            test_plan_pdf::export_test_case_pdf,
            test_plan_pdf::cancel_test_case_pdf,
            test_plans::fetch_test_product_image,
            test_plans::read_test_plan_import,
            test_plans::import_test_plan,
            commands::save_task,
            commands::get_tasks,
            commands::delete_task,
            commands::get_last_task,
            commands::export_tasks,
            commands::import_tasks,
            barcodes::generate_barcode,
            codegen_history::save_codegen_state,
            codegen_history::get_codegen_history,
            codegen_history::delete_codegen_entry,
            codegen_history::export_codegen_history,
            codegen_history::import_codegen_history,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
