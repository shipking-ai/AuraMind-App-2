//! Files handed to AuraMind from outside the app (Explorer verb, tray file
//! picker). The only place Rust reads a user file: it checks the extension
//! and size, then passes the bytes to the web layer, which feeds the same
//! generator as a drag-and-drop. The lists mirror the generator's own
//! `accept` attributes; `courseFiles.test.ts` fails if they drift.

use base64::Engine;
use serde::Serialize;
use std::path::Path;

pub const DOC_EXTS: &[&str] = &["pdf", "pptx", "docx", "doc", "txt", "md"];
pub const AUDIO_EXTS: &[&str] = &["mp3", "wav", "m4a", "ogg", "webm"];
pub const MAX_BYTES: u64 = 52_428_800; // 50 MB

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Handoff {
    File { name: String, mime: &'static str, base64: String },
    Error { name: String, reason: &'static str },
}

fn mime_for(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "pdf" => "application/pdf",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc" => "application/msword",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "webm" => "audio/webm",
        _ => return None,
    })
}

/// The real (last) extension, lowercased. `evil.pdf.exe` → `exe`.
fn extension(path: &Path) -> Option<String> {
    path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase())
}

pub fn read(path: &Path) -> Handoff {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let Some(mime) = extension(path).as_deref().and_then(mime_for) else {
        return Handoff::Error { name, reason: "unsupported" };
    };
    let Ok(meta) = std::fs::metadata(path) else {
        return Handoff::Error { name, reason: "unreadable" };
    };
    if !meta.is_file() {
        return Handoff::Error { name, reason: "unreadable" };
    }
    if meta.len() > MAX_BYTES {
        return Handoff::Error { name, reason: "too-large" };
    }
    match std::fs::read(path) {
        Ok(bytes) => Handoff::File {
            name,
            mime,
            base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        },
        Err(_) => Handoff::Error { name, reason: "unreadable" },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("auramind-handoff-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::File::create(&path).unwrap().write_all(bytes).unwrap();
        path
    }

    #[test]
    fn a_pdf_is_read_and_encoded() {
        let path = temp_file("Notes.PDF", b"%PDF-1.7");
        assert_eq!(
            read(&path),
            Handoff::File {
                name: "Notes.PDF".into(),
                mime: "application/pdf",
                base64: "JVBERi0xLjc=".into()
            }
        );
    }

    #[test]
    fn the_last_extension_decides() {
        let path = temp_file("evil.pdf.exe", b"MZ");
        assert_eq!(read(&path), Handoff::Error { name: "evil.pdf.exe".into(), reason: "unsupported" });
    }

    #[test]
    fn a_missing_file_is_unreadable() {
        let path = std::env::temp_dir().join("auramind-does-not-exist.pdf");
        assert_eq!(read(&path), Handoff::Error { name: "auramind-does-not-exist.pdf".into(), reason: "unreadable" });
    }

    #[test]
    fn a_directory_is_unreadable() {
        let dir = std::env::temp_dir().join(format!("auramind-dir-{}.pdf", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(matches!(read(&dir), Handoff::Error { reason: "unreadable", .. }));
    }

    #[test]
    fn every_listed_extension_has_a_mime_type() {
        for ext in DOC_EXTS.iter().chain(AUDIO_EXTS) {
            assert!(mime_for(ext).is_some(), "{ext} needs a mime type");
        }
    }

    #[test]
    fn it_serialises_the_shape_the_web_layer_expects() {
        let json = serde_json::to_string(&Handoff::Error { name: "a.exe".into(), reason: "unsupported" }).unwrap();
        assert_eq!(json, r#"{"kind":"error","name":"a.exe","reason":"unsupported"}"#);
    }
}
