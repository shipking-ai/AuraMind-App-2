//! What a launch (or a second launch forwarded by single-instance) asks for.
//!
//! The Explorer verb runs `BonaMind.exe --create "<path>"`, autostart runs
//! `BonaMind.exe --hidden`, and Windows runs `BonaMind.exe "bonamind://..."`
//! for a deep link. Parsing is pure so every shape is unit-tested; the
//! allowlist of in-app routes stays in TypeScript (`lib/deepLinks.ts`).

use std::path::PathBuf;
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchIntent {
    /// Start in the tray without showing the window (autostart).
    Hidden,
    /// Make a course from this file (Explorer verb).
    Create(PathBuf),
    /// A `bonamind://` (or pre-rename) link to hand to the web layer.
    Open(String),
}

/// Only the two shapes the app understands. Everything else is ignored so a
/// crafted link can't reach the web layer at all.
pub fn is_app_url(s: &str) -> bool {
    let Ok(url) = Url::parse(s) else { return false };
    // bonamind:// is current; auramind:// is still sent by links made before // legacy-name: ok
    // the rename (pinned shortcuts, old notifications, OAuth returns).
    if url.scheme() != "bonamind" && url.scheme() != "auramind" { // legacy-name: ok
        return false;
    }
    match url.host_str() {
        Some("app") => true,
        Some("auth") => url.path() == "/callback",
        _ => false,
    }
}

pub fn parse_args(args: &[String]) -> Vec<LaunchIntent> {
    let mut intents = Vec::new();
    let mut rest = args.iter().skip(1);
    while let Some(arg) = rest.next() {
        match arg.as_str() {
            "--hidden" => intents.push(LaunchIntent::Hidden),
            "--create" => {
                if let Some(path) = rest.next() {
                    intents.push(LaunchIntent::Create(PathBuf::from(path)));
                }
            }
            other if is_app_url(other) => intents.push(LaunchIntent::Open(other.to_string())),
            _ => {}
        }
    }
    intents
}

/// What each launch intent tells the web layer. File reading is injected so
/// this stays pure (the app passes `handoff::read`).
pub fn intents_to_events(
    intents: &[LaunchIntent],
    read: impl Fn(&std::path::Path) -> serde_json::Value,
) -> Vec<(&'static str, serde_json::Value)> {
    intents
        .iter()
        .filter_map(|intent| match intent {
            LaunchIntent::Hidden => None,
            LaunchIntent::Open(url) => Some(("deep-link", serde_json::json!({ "url": url }))),
            LaunchIntent::Create(path) => Some(("create-from-file", read(path))),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        std::iter::once("C:\\BonaMind\\BonaMind.exe")
            .chain(list.iter().copied())
            .map(String::from)
            .collect()
    }

    #[test]
    fn no_arguments_means_a_normal_launch() {
        assert!(parse_args(&args(&[])).is_empty());
    }

    #[test]
    fn autostart_starts_hidden() {
        assert_eq!(parse_args(&args(&["--hidden"])), vec![LaunchIntent::Hidden]);
    }

    #[test]
    fn the_explorer_verb_passes_a_path() {
        assert_eq!(
            parse_args(&args(&["--create", "C:\\Users\\a\\Notes.pdf"])),
            vec![LaunchIntent::Create(PathBuf::from("C:\\Users\\a\\Notes.pdf"))]
        );
    }

    #[test]
    fn a_trailing_create_without_a_path_is_ignored() {
        assert!(parse_args(&args(&["--create"])).is_empty());
    }

    #[test]
    fn app_links_and_the_auth_callback_pass() {
        assert_eq!(
            parse_args(&args(&["auramind://app/study"])), // legacy-name: ok
            vec![LaunchIntent::Open("auramind://app/study".into())] // legacy-name: ok
        );
        assert!(is_app_url("auramind://auth/callback?code=abc")); // legacy-name: ok
    }

    #[test]
    fn the_bonamind_scheme_passes_the_same_way() {
        assert_eq!(
            parse_args(&args(&["bonamind://app/study"])),
            vec![LaunchIntent::Open("bonamind://app/study".into())]
        );
        assert!(is_app_url("bonamind://auth/callback?code=abc"));
        assert!(!is_app_url("bonamind://auth/other"));
        assert!(!is_app_url("bonamind://evil/app"));
        assert!(!is_app_url("https://bonamind.app/app/study"));
    }

    #[test]
    fn intents_become_web_events() {
        let intents = vec![
            LaunchIntent::Hidden,
            LaunchIntent::Open("auramind://app/study".into()), // legacy-name: ok
            LaunchIntent::Create(PathBuf::from("C:\\a\\Notes.pdf")),
        ];
        let events = intents_to_events(&intents, |p| {
            serde_json::json!({ "kind": "file", "name": p.file_name().unwrap().to_str().unwrap() })
        });
        assert_eq!(
            events,
            vec![
                ("deep-link", serde_json::json!({ "url": "auramind://app/study" })), // legacy-name: ok
                ("create-from-file", serde_json::json!({ "kind": "file", "name": "Notes.pdf" })),
            ]
        );
    }

    #[test]
    fn anything_else_is_dropped() {
        for bad in [
            "https://bonamind.app/app/study",
            "auramind://auth/other", // legacy-name: ok
            "auramind://evil/app", // legacy-name: ok
            "auramind:app/study", // legacy-name: ok
            "--unknown",
            "not a url",
        ] {
            assert!(parse_args(&args(&[bad])).is_empty(), "{bad} must be ignored");
        }
    }
}
