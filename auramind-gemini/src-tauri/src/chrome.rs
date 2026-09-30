//! The main window's look: Windows 11 title bar in AuraMind colours, and
//! shown only once React has painted (no white flash).

use tauri::{AppHandle, Manager, WebviewWindow};

/// `#rrggbb` → Win32 COLORREF (0x00BBGGRR).
pub fn colorref(hex: &str) -> Option<u32> {
    let hex = hex.strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let v = u32::from_str_radix(hex, 16).ok()?;
    let (r, g, b) = ((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
    Some((b << 16) | (g << 8) | r)
}

/// Caption, title text and border colours. Windows 10 doesn't support these
/// attributes and returns an error, which is ignored: it keeps the dark
/// title bar from `theme: "Dark"`.
#[cfg(windows)]
pub fn brand_title_bar(window: &WebviewWindow) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
    };
    let Ok(raw) = window.hwnd() else { return };
    let hwnd = HWND(raw.0 as _);
    for (attr, hex) in [
        (DWMWA_CAPTION_COLOR, "#0b1022"),
        (DWMWA_TEXT_COLOR, "#e8e6ff"),
        (DWMWA_BORDER_COLOR, "#8B5CF6"),
    ] {
        if let Some(color) = colorref(hex) {
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    attr,
                    &color as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
            }
        }
    }
}

#[cfg(not(windows))]
pub fn brand_title_bar(_window: &WebviewWindow) {}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// If React never reports its first paint (a crash, a very slow machine),
/// show the window anyway so the app can't stay invisible.
pub fn show_fallback(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        let state = app.state::<crate::state::AppState>();
        if state.hidden_start.load(std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        if let Some(window) = app.get_webview_window("main") {
            if !window.is_visible().unwrap_or(true) {
                show_main_window(&app);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_becomes_bgr() {
        assert_eq!(colorref("#0b1022"), Some(0x0022_100b));
        assert_eq!(colorref("#8B5CF6"), Some(0x00f6_5c8b));
        assert_eq!(colorref("#e8e6ff"), Some(0x00ff_e6e8));
    }

    #[test]
    fn malformed_hex_is_rejected() {
        assert_eq!(colorref("0b1022"), None);
        assert_eq!(colorref("#fff"), None);
        assert_eq!(colorref("#zzzzzz"), None);
    }
}
