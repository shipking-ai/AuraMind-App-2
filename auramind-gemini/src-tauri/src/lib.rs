//! AuraMind for Windows: a Tauri 2 shell around the bundled web app.
//!
//! The web app ships inside the installer (built with `vite --mode desktop`)
//! and is served from the fixed origin `https://tauri.localhost`. The shell
//! adds what a browser tab can't: its own window that remembers its size, one
//! instance at a time, and signed auto-updates. The React code is the same as
//! the website's.

mod badge;
mod chrome;
mod commands;
mod guard;
mod handoff;
mod links;
mod nudges;
mod quick_review;
mod state;
mod tray;

use guard::{opens_externally, stays_in_app};
use links::{parse_args, LaunchIntent};
use state::AppState;
use std::sync::atomic::Ordering;
use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;

/// Links, Explorer files and second launches all end here. Events wait in
/// the outbox until the web layer is listening.
fn deliver(app: &tauri::AppHandle, intents: &[LaunchIntent]) {
    let events = links::intents_to_events(intents, |path| {
        serde_json::to_value(handoff::read(path)).unwrap_or_default()
    });
    if !events.is_empty() {
        chrome::show_main_window(app);
    }
    for (event, payload) in events {
        state::emit_to_main(app, event, payload);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch focuses the running
        // window (and forwards its link or file) instead of opening another copy.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let intents = parse_args(&args);
            if intents.is_empty() {
                chrome::show_main_window(app);
            } else {
                deliver(app, &intents);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::app_ready,
            commands::show_main,
            commands::quick_review_done,
            commands::cards_changed,
            commands::set_shortcut,
            commands::set_due_state,
            commands::schedule_nudges,
            commands::get_autostart,
            commands::set_autostart,
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let hidden = parse_args(&args).contains(&LaunchIntent::Hidden);
            app.state::<AppState>().hidden_start.store(hidden, Ordering::SeqCst);

            #[cfg(debug_assertions)]
            let _ = app.deep_link().register_all(); // `tauri dev` isn't installed, so register at runtime

            let link_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let intents: Vec<LaunchIntent> = event
                    .urls()
                    .into_iter()
                    .map(|u| u.to_string())
                    .filter(|u| links::is_app_url(u))
                    .map(LaunchIntent::Open)
                    .collect();
                deliver(&link_handle, &intents);
            });

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            quick_review::toggle(app);
                        }
                    })
                    .build(),
            )?;
            // Taken by another app? Settings offers another; startup must not fail.
            let _ = app.global_shortcut().register(quick_review::DEFAULT_SHORTCUT);

            // The main window is declared in tauri.conf.json with
            // `create: false` so it can be built here with a navigation guard.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .expect("tauri.conf.json must declare the main window");
            let handle = app.handle().clone();
            let window = WebviewWindowBuilder::from_config(app, &config)?
                .on_navigation(move |url| {
                    if stays_in_app(url) {
                        return true;
                    }
                    if opens_externally(url) {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    false
                })
                .build()?;
            chrome::brand_title_bar(&window);
            chrome::show_fallback(app.handle());
            tray::build(app.handle())?;
            nudges::start(app.handle());
            // Cold start from Explorer or a link: queued until app_ready.
            deliver(app.handle(), &parse_args(&args));

            // ✕ keeps AuraMind in the tray so reminders keep working; Quit exits.
            let close_handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(w) = close_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                    let marker = close_handle
                        .path()
                        .app_data_dir()
                        .map(|d| d.join("tray-notice-shown"));
                    if let Ok(marker) = marker {
                        if !marker.exists() {
                            if let Some(dir) = marker.parent() {
                                let _ = std::fs::create_dir_all(dir);
                            }
                            let _ = std::fs::write(&marker, b"1");
                            nudges::toast(
                                &close_handle,
                                "AuraMind is still running",
                                "It's in the tray, so your reminders keep working. Quit from the tray icon.",
                                false,
                            );
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AuraMind");
}
