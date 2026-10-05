// Release builds are GUI apps: no console window behind BonaMind.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    auramind_desktop_lib::run()
}
