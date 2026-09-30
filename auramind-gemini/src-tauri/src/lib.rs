//! AuraMind for Windows: a Tauri 2 shell around the bundled web app.
//!
//! The web app ships inside the installer (built with `vite --mode desktop`)
//! and is served from the fixed origin `https://tauri.localhost`. The shell
//! adds what a browser tab can't: its own window that remembers its size, one
//! instance at a time, and signed auto-updates. The React code is the same as
//! the website's.

mod chrome;
mod commands;
mod guard;
mod handoff;
mod links;
mod nudges;
mod quick_review;
mod state;

use guard::{opens_externally, stays_in_app};
use links::{parse_args, LaunchIntent};
use state::AppState;
use std::sync::atomic::Ordering;
use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch focuses the running
        // window instead of opening another copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            chrome::show_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::app_ready,
            commands::show_main,
            commands::quick_review_done,
            commands::cards_changed,
            commands::set_shortcut,
        ])
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            let hidden = parse_args(&args).contains(&LaunchIntent::Hidden);
            app.state::<AppState>().hidden_start.store(hidden, Ordering::SeqCst);

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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AuraMind");
}
