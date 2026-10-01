//! Shared state and the outbox that holds events until the web layer is
//! listening. A deep link or Explorer file can arrive before React has
//! mounted (cold start, autostart); without the outbox it would be lost.

use crate::nudges::Nudge;
use serde::Deserialize;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, PartialEq)]
pub struct Outgoing {
    pub event: &'static str,
    pub payload: serde_json::Value,
}

#[derive(Debug, Default)]
pub struct Outbox {
    ready: bool,
    queued: Vec<Outgoing>,
}

impl Outbox {
    /// Returns the event back when it can be emitted now; queues it otherwise.
    pub fn push(&mut self, ev: Outgoing) -> Option<Outgoing> {
        if self.ready {
            Some(ev)
        } else {
            self.queued.push(ev);
            None
        }
    }

    /// The web layer is listening: hand back everything queued, in order.
    pub fn mark_ready(&mut self) -> Vec<Outgoing> {
        self.ready = true;
        std::mem::take(&mut self.queued)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DueState {
    pub due: u32,
    pub fading_count: u32,
    pub top_decks: Vec<String>,
    pub streak: u32,
    pub studying: bool,
}

#[derive(Default)]
pub struct AppState {
    pub outbox: Mutex<Outbox>,
    pub hidden_start: AtomicBool,
    pub due: Mutex<DueState>,
    pub nudges: Mutex<Vec<Nudge>>,
    pub paused_until_ms: Mutex<Option<i64>>,
    pub quick_review_open: AtomicBool,
}

pub fn emit_to_main(app: &AppHandle, event: &'static str, payload: serde_json::Value) {
    let state = app.state::<AppState>();
    let now = state.outbox.lock().unwrap().push(Outgoing { event, payload });
    if let Some(ev) = now {
        let _ = app.emit_to("main", ev.event, ev.payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(event: &'static str) -> Outgoing {
        Outgoing { event, payload: serde_json::json!({}) }
    }

    #[test]
    fn events_before_ready_are_held_in_order() {
        let mut outbox = Outbox::default();
        assert_eq!(outbox.push(ev("deep-link")), None);
        assert_eq!(outbox.push(ev("create-from-file")), None);
        assert_eq!(outbox.mark_ready(), vec![ev("deep-link"), ev("create-from-file")]);
    }

    #[test]
    fn events_after_ready_go_straight_out() {
        let mut outbox = Outbox::default();
        outbox.mark_ready();
        assert_eq!(outbox.push(ev("open-route")), Some(ev("open-route")));
        assert!(outbox.mark_ready().is_empty());
    }

    #[test]
    fn due_state_reads_the_web_layers_json() {
        let parsed: DueState = serde_json::from_str(
            r#"{"due":12,"fadingCount":3,"topDecks":["Spanish A1"],"streak":5,"studying":false}"#,
        )
        .unwrap();
        assert_eq!(parsed.due, 12);
        assert_eq!(parsed.top_decks, vec!["Spanish A1".to_string()]);
    }
}
