//! Commands the web layer may call. Each is also listed in build.rs so it
//! gets its own permission, granted per window in capabilities/*.json.

use crate::chrome::show_main_window;
use crate::state::{emit_to_main, AppState};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};

/// React has painted: show the window (unless started hidden) and deliver
/// anything that arrived during startup.
#[tauri::command]
pub fn app_ready(app: AppHandle, state: State<AppState>) {
    if !state.hidden_start.load(Ordering::SeqCst) {
        show_main_window(&app);
    }
    let queued = state.outbox.lock().unwrap().mark_ready();
    for ev in queued {
        let _ = app.emit_to("main", ev.event, ev.payload);
    }
}

/// Open or focus the main window, optionally at an in-app route.
#[tauri::command]
pub fn show_main(app: AppHandle, path: Option<String>) {
    show_main_window(&app);
    if let Some(path) = path.filter(|p| p.starts_with('/') && !p.starts_with("//")) {
        emit_to_main(&app, "open-route", serde_json::json!({ "path": path }));
    }
}
