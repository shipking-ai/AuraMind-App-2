//! The Quick Review corner panel: a small always-on-top window on the same
//! bundle (/quick-review), opened by a global shortcut, the tray or a
//! notification. Created once, then only hidden and re-shown.

use crate::guard::{opens_externally, stays_in_app};
use crate::state::AppState;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

pub const LABEL: &str = "quick-review";
pub const DEFAULT_SHORTCUT: &str = "CommandOrControl+Alt+Space";
const WIDTH: f64 = 380.0;
const HEIGHT: f64 = 300.0;
const MARGIN: f64 = 12.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Bottom-right of a monitor's work area (the part the taskbar doesn't
/// cover), in physical pixels. Works for monitors left of or above the
/// primary one, whose coordinates are negative.
pub fn position_in_work_area(work: Rect, window: (u32, u32), margin: i32) -> (i32, i32) {
    let x = work.x + work.width as i32 - window.0 as i32 - margin;
    let y = work.y + work.height as i32 - window.1 as i32 - margin;
    (x.max(work.x), y.max(work.y))
}

fn target_work_area(app: &AppHandle) -> Option<(Rect, f64)> {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let area = monitor.work_area();
    Some((
        Rect { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height },
        monitor.scale_factor(),
    ))
}

fn build(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let handle = app.clone();
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("quick-review".into()))
        .title("Quick review")
        .inner_size(WIDTH, HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
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
    #[cfg(windows)]
    let _ = window_vibrancy::apply_acrylic(&window, Some((11, 16, 34, 170)));
    Ok(window)
}

pub fn show(app: &AppHandle) {
    let window = match app.get_webview_window(LABEL) {
        Some(w) => w,
        None => match build(app) {
            Ok(w) => w,
            Err(_) => return,
        },
    };
    if let Some((work, scale)) = target_work_area(app) {
        let size = ((WIDTH * scale).round() as u32, (HEIGHT * scale).round() as u32);
        let (x, y) = position_in_work_area(work, size, (MARGIN * scale).round() as i32);
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
    let _ = window.show();
    let _ = window.set_focus();
    app.state::<AppState>().quick_review_open.store(true, Ordering::SeqCst);
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
    app.state::<AppState>().quick_review_open.store(false, Ordering::SeqCst);
}

pub fn toggle(app: &AppHandle) {
    let open = app
        .get_webview_window(LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if open {
        hide(app)
    } else {
        show(app)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRIMARY: Rect = Rect { x: 0, y: 0, width: 1920, height: 1040 };

    #[test]
    fn sits_above_the_taskbar_bottom_right() {
        assert_eq!(position_in_work_area(PRIMARY, (380, 300), 12), (1528, 728));
    }

    #[test]
    fn follows_a_monitor_left_of_the_primary() {
        let left = Rect { x: -2560, y: 0, width: 2560, height: 1392 };
        assert_eq!(position_in_work_area(left, (570, 450), 18), (-588, 924));
    }

    #[test]
    fn follows_a_monitor_above_the_primary() {
        let above = Rect { x: 0, y: -1080, width: 1920, height: 1040 };
        assert_eq!(position_in_work_area(above, (380, 300), 12), (1528, -352));
    }

    #[test]
    fn never_leaves_a_tiny_work_area() {
        let tiny = Rect { x: 100, y: 100, width: 200, height: 150 };
        assert_eq!(position_in_work_area(tiny, (380, 300), 12), (100, 100));
    }
}
