fn main() {
    // Listing the app's own commands gives each one a permission
    // (allow-app-ready, …), so capabilities/*.json can grant them per window.
    // Add every new #[tauri::command] here.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&[
                "app_ready",
                "show_main",
                "quick_review_done",
                "cards_changed",
                "set_shortcut",
                "set_due_state",
                "schedule_nudges",
                "get_autostart",
                "set_autostart",
            ])),
    )
    .expect("failed to run tauri-build");
}
