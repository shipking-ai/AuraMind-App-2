//! The taskbar overlay badge: a violet count while cards are due.

pub fn badge_for(due: u32) -> Option<&'static [u8]> {
    Some(match due {
        0 => return None,
        1 => include_bytes!("../icons/badges/1.png"),
        2 => include_bytes!("../icons/badges/2.png"),
        3 => include_bytes!("../icons/badges/3.png"),
        4 => include_bytes!("../icons/badges/4.png"),
        5 => include_bytes!("../icons/badges/5.png"),
        6 => include_bytes!("../icons/badges/6.png"),
        7 => include_bytes!("../icons/badges/7.png"),
        8 => include_bytes!("../icons/badges/8.png"),
        9 => include_bytes!("../icons/badges/9.png"),
        _ => include_bytes!("../icons/badges/9plus.png"),
    })
}

pub fn apply(app: &tauri::AppHandle, due: u32) {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else { return };
    let icon = badge_for(due).and_then(|bytes| tauri::image::Image::from_bytes(bytes).ok());
    let _ = window.set_overlay_icon(icon);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_due_clears_the_badge() {
        assert!(badge_for(0).is_none());
    }

    #[test]
    fn one_to_nine_have_their_own_badge_and_more_is_nine_plus() {
        assert_ne!(badge_for(1), badge_for(2));
        assert_eq!(badge_for(10), badge_for(250));
        assert_ne!(badge_for(9), badge_for(10));
    }
}
