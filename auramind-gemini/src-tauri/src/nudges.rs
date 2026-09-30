//! Study nudges: React plans them (quiet hours, reminder time, wording in
//! `desktop/nudgePlanner.ts`); Rust holds them and fires them on time,
//! because WebView2 throttles timers in hidden windows. This part is pure:
//! given the plan, the clock and the gate, what fires now.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Nudge {
    pub at_ms: i64,
    pub title: String,
    pub body: String,
}

/// Reasons to stay quiet right now.
#[derive(Debug, Default, Clone)]
pub struct Gate {
    /// "Pause reminders for today" — until local midnight.
    pub paused_until_ms: Option<i64>,
    /// The user is studying (study screen or Quick Review open).
    pub busy: bool,
}

/// A nudge more than this late (the PC was asleep) is dropped, not fired.
pub const STALE_AFTER_MS: i64 = 30 * 60 * 1000;

/// Remove every nudge whose time has come and return the ones to show.
/// Due nudges are consumed even when gated, so a paused reminder doesn't
/// fire the moment the pause ends.
pub fn take_due(nudges: &mut Vec<Nudge>, now_ms: i64, gate: &Gate) -> Vec<Nudge> {
    let (due, later): (Vec<Nudge>, Vec<Nudge>) = nudges.drain(..).partition(|n| n.at_ms <= now_ms);
    *nudges = later;
    let paused = gate.paused_until_ms.is_some_and(|until| now_ms < until);
    if paused || gate.busy {
        return Vec::new();
    }
    due.into_iter().filter(|n| now_ms - n.at_ms <= STALE_AFTER_MS).collect()
}

pub fn next_local_midnight_ms(now: chrono::DateTime<chrono::Local>) -> i64 {
    let tomorrow = now.date_naive().succ_opt().expect("date in range");
    tomorrow
        .and_hms_opt(0, 0, 0)
        .and_then(|t| t.and_local_timezone(chrono::Local).earliest())
        .map(|t| t.timestamp_millis())
        .unwrap_or(now.timestamp_millis() + 24 * 60 * 60 * 1000)
}

use tauri::{AppHandle, Manager};

/// Windows needs the AppUserModelID from the installer's Start-menu shortcut
/// to show toasts with buttons. `tauri dev` has no shortcut, so debug builds
/// borrow PowerShell's id.
#[cfg(windows)]
fn app_id(app: &AppHandle) -> String {
    if cfg!(debug_assertions) {
        tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

#[cfg(windows)]
pub fn toast(app: &AppHandle, title: &str, body: &str, with_actions: bool) {
    use tauri_winrt_notification::Toast;
    let handle = app.clone();
    let mut toast = Toast::new(&app_id(app)).title(title).text1(body);
    if with_actions {
        toast = toast.add_button("Quick review", "quick-review").add_button("Later", "later");
    }
    let _ = toast
        .on_activated(move |action| {
            match action.as_deref() {
                Some("quick-review") => crate::quick_review::show(&handle),
                Some("later") => {}
                _ => crate::chrome::show_main_window(&handle),
            }
            Ok(())
        })
        .show();
}

#[cfg(not(windows))]
pub fn toast(_app: &AppHandle, _title: &str, _body: &str, _with_actions: bool) {}

/// Checks the plan every 30 seconds. Rust holds the timer because WebView2
/// throttles timers in hidden windows.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let state = app.state::<crate::state::AppState>();
        let gate = Gate {
            paused_until_ms: *state.paused_until_ms.lock().unwrap(),
            busy: state.due.lock().unwrap().studying
                || state.quick_review_open.load(std::sync::atomic::Ordering::SeqCst),
        };
        let now = chrono::Utc::now().timestamp_millis();
        let fire = take_due(&mut state.nudges.lock().unwrap(), now, &gate);
        for nudge in fire {
            toast(&app, &nudge.title, &nudge.body, true);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nudge(at_ms: i64) -> Nudge {
        Nudge { at_ms, title: "12 cards are ready".into(), body: "About 5 minutes.".into() }
    }

    #[test]
    fn nothing_fires_before_its_time() {
        let mut plan = vec![nudge(1_000)];
        assert!(take_due(&mut plan, 999, &Gate::default()).is_empty());
        assert_eq!(plan.len(), 1);
    }

    #[test]
    fn a_due_nudge_fires_once() {
        let mut plan = vec![nudge(1_000), nudge(9_000)];
        assert_eq!(take_due(&mut plan, 1_000, &Gate::default()), vec![nudge(1_000)]);
        assert_eq!(plan, vec![nudge(9_000)]);
        assert!(take_due(&mut plan, 1_500, &Gate::default()).is_empty());
    }

    #[test]
    fn a_paused_day_consumes_without_firing() {
        let mut plan = vec![nudge(1_000)];
        let gate = Gate { paused_until_ms: Some(5_000), busy: false };
        assert!(take_due(&mut plan, 1_000, &gate).is_empty());
        assert!(plan.is_empty(), "must not fire the moment the pause ends");
    }

    #[test]
    fn an_expired_pause_no_longer_blocks() {
        let mut plan = vec![nudge(6_000)];
        let gate = Gate { paused_until_ms: Some(5_000), busy: false };
        assert_eq!(take_due(&mut plan, 6_000, &gate).len(), 1);
    }

    #[test]
    fn studying_suppresses() {
        let mut plan = vec![nudge(1_000)];
        let gate = Gate { paused_until_ms: None, busy: true };
        assert!(take_due(&mut plan, 1_000, &gate).is_empty());
    }

    #[test]
    fn a_nudge_missed_while_asleep_is_dropped() {
        let mut plan = vec![nudge(0)];
        assert!(take_due(&mut plan, STALE_AFTER_MS + 1, &Gate::default()).is_empty());
        assert!(plan.is_empty());
    }

    #[test]
    fn midnight_is_later_today_boundary() {
        use chrono::TimeZone;
        let now = chrono::Local.with_ymd_and_hms(2026, 9, 29, 15, 30, 0).unwrap();
        let midnight = chrono::Local.with_ymd_and_hms(2026, 9, 30, 0, 0, 0).unwrap();
        assert_eq!(next_local_midnight_ms(now), midnight.timestamp_millis());
    }
}
