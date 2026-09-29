//! AuraMind for Windows: a Tauri 2 shell around the bundled web app.
//!
//! The web app ships inside the installer (built with `vite --mode desktop`)
//! and is served from the fixed origin `https://tauri.localhost`. The shell
//! adds what a browser tab can't: its own window that remembers its size, one
//! instance at a time, and signed auto-updates. The React code is the same as
//! the website's.

use tauri::{Manager, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use url::Url;

/// Where the app itself is served from. Changing this would move every
/// user's saved session and offline data to a new, empty origin, so it must
/// match `useHttpsScheme: true` in tauri.conf.json forever.
const APP_HOST: &str = "tauri.localhost";

/// Whether a navigation stays inside the app window.
///
/// Anything else (Stripe checkout, help links, sign-in providers) opens in the
/// user's own browser, the way Capacitor sends outside links out of the phone
/// apps. Keeping checkout out of the app window also means Stripe's success
/// redirect to auramind.app lands in the browser, not over the bundled app;
/// the app re-checks the subscription when its window regains focus.
pub fn stays_in_app(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => match url.host_str() {
            Some(APP_HOST) => true,
            // `tauri dev` loads the Vite dev server instead of the bundle.
            Some("localhost") | Some("127.0.0.1") => cfg!(debug_assertions),
            _ => false,
        },
        _ => false,
    }
}

/// Schemes worth handing to the operating system when they leave the app.
fn opens_externally(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

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

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn the_bundled_app_stays_in_the_window() {
        assert!(stays_in_app(&url("https://tauri.localhost/dashboard")));
        assert!(stays_in_app(&url("https://tauri.localhost/deck/abc?tab=community")));
        assert!(stays_in_app(&url("tauri://localhost/")));
        assert!(stays_in_app(&url("about:blank")));
    }

    #[test]
    fn outside_sites_leave_the_window() {
        for outside in [
            "https://checkout.stripe.com/c/pay/cs_live_123",
            "https://auramind.app/subscribe?payment=success",
            "https://accounts.google.com/o/oauth2/auth",
            "https://tauri.localhost.evil.example/",
            "http://evil.example/https://tauri.localhost",
        ] {
            assert!(!stays_in_app(&url(outside)), "{outside} must open outside the app");
        }
    }

    #[test]
    fn only_web_and_mail_links_are_handed_to_the_os() {
        assert!(opens_externally(&url("https://auramind.app/privacy")));
        assert!(opens_externally(&url("mailto:hello@auramind.app")));
        assert!(!opens_externally(&url("file:///C:/Windows/System32/cmd.exe")));
        assert!(!opens_externally(&url("ms-settings:privacy")));
    }

    #[test]
    fn the_dev_server_is_only_trusted_in_debug_builds() {
        assert_eq!(stays_in_app(&url("http://localhost:3000/")), cfg!(debug_assertions));
    }
}
