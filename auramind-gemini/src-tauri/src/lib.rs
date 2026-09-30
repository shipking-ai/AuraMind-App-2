//! AuraMind for Windows: a Tauri 2 shell around the bundled web app.
//!
//! The web app ships inside the installer (built with `vite --mode desktop`)
//! and is served from the fixed origin `https://tauri.localhost`. The shell
//! adds what a browser tab can't: its own window that remembers its size, one
//! instance at a time, and signed auto-updates. The React code is the same as
//! the website's.

mod guard;
mod handoff;
mod links;
mod nudges;

use guard::{opens_externally, stays_in_app};
use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch focuses the running
        // window instead of opening another copy.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
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

            WebviewWindowBuilder::from_config(app, &config)?
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AuraMind");
}
