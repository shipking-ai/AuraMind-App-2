//! What a launch (or a second launch forwarded by single-instance) asks for.
//!
//! The Explorer verb runs `AuraMind.exe --create "<path>"`, autostart runs
//! `AuraMind.exe --hidden`, and Windows runs `AuraMind.exe "auramind://..."`
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
    /// An `auramind://` link to hand to the web layer.
    Open(String),
}

/// Only the two shapes the app understands. Everything else is ignored so a
/// crafted link can't reach the web layer at all.
pub fn is_app_url(s: &str) -> bool {
    let Ok(url) = Url::parse(s) else { return false };
    if url.scheme() != "auramind" {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        std::iter::once("C:\\AuraMind\\AuraMind.exe")
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
            parse_args(&args(&["auramind://app/study"])),
            vec![LaunchIntent::Open("auramind://app/study".into())]
        );
        assert!(is_app_url("auramind://auth/callback?code=abc"));
    }

    #[test]
    fn anything_else_is_dropped() {
        for bad in [
            "https://auramind.app/app/study",
            "auramind://auth/other",
            "auramind://evil/app",
            "auramind:app/study",
            "--unknown",
            "not a url",
        ] {
            assert!(parse_args(&args(&[bad])).is_empty(), "{bad} must be ignored");
        }
    }
}
