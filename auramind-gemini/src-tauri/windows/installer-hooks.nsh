; "Make a course with BonaMind" in Explorer's right-click menu, per user.
; Keep this list in sync with DOC_EXTS/AUDIO_EXTS in src/handoff.rs
; (courseFiles.test.ts checks both). On Windows 11 it appears under
; "Show more options"; a top-level entry needs a signed MSIX.

!macro BonaMindVerb EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\BonaMind" "" "Make a course with BonaMind"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\BonaMind" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\BonaMind\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --create "%1"'
!macroend

!macro BonaMindUnverb EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\BonaMind"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro BonaMindVerb "pdf"
  !insertmacro BonaMindVerb "pptx"
  !insertmacro BonaMindVerb "docx"
  !insertmacro BonaMindVerb "doc"
  !insertmacro BonaMindVerb "txt"
  !insertmacro BonaMindVerb "md"
  !insertmacro BonaMindVerb "mp3"
  !insertmacro BonaMindVerb "wav"
  !insertmacro BonaMindVerb "m4a"
  !insertmacro BonaMindVerb "ogg"
  !insertmacro BonaMindVerb "webm"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro BonaMindUnverb "pdf"
  !insertmacro BonaMindUnverb "pptx"
  !insertmacro BonaMindUnverb "docx"
  !insertmacro BonaMindUnverb "doc"
  !insertmacro BonaMindUnverb "txt"
  !insertmacro BonaMindUnverb "md"
  !insertmacro BonaMindUnverb "mp3"
  !insertmacro BonaMindUnverb "wav"
  !insertmacro BonaMindUnverb "m4a"
  !insertmacro BonaMindUnverb "ogg"
  !insertmacro BonaMindUnverb "webm"
!macroend
