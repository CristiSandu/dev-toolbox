mod barcodes;
mod codegen_history;
mod commands;
mod db;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
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
