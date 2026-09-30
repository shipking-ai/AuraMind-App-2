//! Commands the web layer may call. Each is also listed in build.rs so it
//! gets its own permission, granted per window in capabilities/*.json.

use crate::chrome::show_main_window;
use crate::quick_review;
use crate::state::{emit_to_main, AppState};
use serde::Serialize;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

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

#[tauri::command]
pub fn quick_review_done(app: AppHandle) {
    quick_review::hide(&app);
}

/// Quick Review rated a card: the main window reloads its counts.
#[tauri::command]
pub fn cards_changed(app: AppHandle) {
    emit_to_main(&app, "cards-changed", serde_json::json!({}));
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutResult {
    pub ok: bool,
    pub reason: Option<&'static str>,
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, accelerator: String) -> ShortcutResult {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    match shortcuts.register(accelerator.as_str()) {
        Ok(()) => ShortcutResult { ok: true, reason: None },
        Err(err) => {
            // Put the previous default back so the feature isn't left dead.
            let _ = shortcuts.register(quick_review::DEFAULT_SHORTCUT);
            let reason = if err.to_string().to_lowercase().contains("already") { "taken" } else { "invalid" };
            ShortcutResult { ok: false, reason: Some(reason) }
        }
    }
}
