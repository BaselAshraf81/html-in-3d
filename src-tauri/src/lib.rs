#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to VibeCanvas Studio.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Enable the HTML-in-Canvas API flag for WebView2 (Windows).
    // WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS must be set before the WebView2
    // environment is created — i.e. before tauri::Builder runs.
    #[cfg(target_os = "windows")]
    unsafe {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--enable-features=HTMLInCanvas",
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
