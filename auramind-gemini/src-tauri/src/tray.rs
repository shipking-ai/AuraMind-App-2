//! The tray: due count at a glance and the approved menu.

use crate::state::{emit_to_main, AppState, DueState};
use crate::{badge, chrome, handoff, nudges, quick_review};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::DialogExt;

const TRAY_ID: &str = "main";

pub struct TrayHandles {
    header: MenuItem<Wry>,
    autostart: CheckMenuItem<Wry>,
}

fn cards(n: u32) -> String {
    if n == 1 { "1 card".into() } else { format!("{n} cards") }
}

pub fn tooltip(due: u32) -> String {
    if due == 0 { "AuraMind · all caught up".into() } else { format!("AuraMind · {} due", cards(due)) }
}

pub fn header(due: u32, streak: u32) -> String {
    let due_part = if due == 0 { "All caught up".to_string() } else { format!("{} due", cards(due)) };
    if streak == 0 { due_part } else { format!("{due_part} · {streak}-day streak") }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let header_item = MenuItem::with_id(app, "header", header(0, 0), false, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &header_item,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quick-review", "Quick review", true, Some("CommandOrControl+Alt+Space"))?,
            &MenuItem::with_id(app, "open", "Open AuraMind", true, None::<&str>)?,
            &MenuItem::with_id(app, "new-course", "New course from file…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &MenuItem::with_id(app, "pause", "Pause reminders for today", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
        ],
    )?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .tooltip(tooltip(0))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quick-review" => quick_review::show(app),
            "open" => chrome::show_main_window(app),
            "new-course" => pick_course_file(app),
            "autostart" => toggle_autostart(app),
            "pause" => {
                let until = nudges::next_local_midnight_ms(chrono::Local::now());
                *app.state::<AppState>().paused_until_ms.lock().unwrap() = Some(until);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                chrome::show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    app.manage(TrayHandles { header: header_item, autostart });
    Ok(())
}

pub fn update(app: &AppHandle, state: &DueState) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip(state.due)));
        let bytes: &[u8] = if state.due > 0 {
            include_bytes!("../icons/tray-due.png")
        } else {
            include_bytes!("../icons/tray.png")
        };
        let _ = tray.set_icon(Image::from_bytes(bytes).ok());
    }
    if let Some(handles) = app.try_state::<TrayHandles>() {
        let _ = handles.header.set_text(header(state.due, state.streak));
    }
    badge::apply(app, state.due);
}

pub fn set_autostart_checked(app: &AppHandle, on: bool) {
    if let Some(handles) = app.try_state::<TrayHandles>() {
        let _ = handles.autostart.set_checked(on);
    }
}

fn toggle_autostart(app: &AppHandle) {
    let launcher = app.autolaunch();
    let on = launcher.is_enabled().unwrap_or(false);
    let _ = if on { launcher.disable() } else { launcher.enable() };
    set_autostart_checked(app, launcher.is_enabled().unwrap_or(false));
}

/// Tray → "New course from file…": native picker, then the same handoff as
/// the Explorer verb.
pub fn pick_course_file(app: &AppHandle) {
    let exts: Vec<&str> = handoff::DOC_EXTS.iter().chain(handoff::AUDIO_EXTS).copied().collect();
    let handle = app.clone();
    app.dialog()
        .file()
        .set_title("Make a course from a file")
        .add_filter("Documents and audio", &exts)
        .pick_file(move |picked| {
            let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return };
            let payload = serde_json::to_value(handoff::read(&path)).unwrap_or_default();
            chrome::show_main_window(&handle);
            emit_to_main(&handle, "create-from-file", payload);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tooltip_counts_and_clears() {
        assert_eq!(tooltip(12), "AuraMind · 12 cards due");
        assert_eq!(tooltip(1), "AuraMind · 1 card due");
        assert_eq!(tooltip(0), "AuraMind · all caught up");
    }

    #[test]
    fn header_matches_the_mockup() {
        assert_eq!(header(12, 12), "12 cards due · 12-day streak");
        assert_eq!(header(0, 3), "All caught up · 3-day streak");
        assert_eq!(header(4, 0), "4 cards due");
    }
}
