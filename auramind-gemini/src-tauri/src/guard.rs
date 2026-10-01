//! What stays inside the app window, and what the OS may open.

use url::Url;

/// Where the app itself is served from. Changing this would move every
/// user's saved session and offline data to a new, empty origin, so it must
/// match `useHttpsScheme: true` in tauri.conf.json forever.
pub const APP_HOST: &str = "tauri.localhost";

/// The single Windows settings page the app may open (Settings → "turn on
/// notifications"). Exact match only; no other `ms-settings:` URI passes.
const NOTIFICATION_SETTINGS: &str = "ms-settings:notifications";

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

/// URLs worth handing to the operating system when they leave the app.
pub fn opens_externally(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto") || url.as_str() == NOTIFICATION_SETTINGS
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
    fn exactly_the_notification_settings_page_may_open() {
        assert!(opens_externally(&url("ms-settings:notifications")));
        assert!(!opens_externally(&url("ms-settings:notifications-evil")));
        assert!(!opens_externally(&url("ms-settings:windowsupdate")));
    }

    #[test]
    fn the_dev_server_is_only_trusted_in_debug_builds() {
        assert_eq!(stays_in_app(&url("http://localhost:3000/")), cfg!(debug_assertions));
    }
}
