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
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::save_task,
            commands::get_tasks,
            barcodes::generate_barcode,
            codegen_history::save_codegen_state,
            codegen_history::get_codegen_history,
            codegen_history::delete_codegen_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
