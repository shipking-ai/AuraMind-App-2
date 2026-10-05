; "Make a course with BonaMind" in Explorer's right-click menu, per user.
; Keep this list in sync with DOC_EXTS/AUDIO_EXTS in src/handoff.rs
; (courseFiles.test.ts checks both). On Windows 11 it appears under
; "Show more options"; a top-level entry needs a signed MSIX.

!macro AuraMindVerb EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuraMind" "" "Make a course with BonaMind"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuraMind" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuraMind\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --create "%1"'
!macroend

!macro AuraMindUnverb EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuraMind"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro AuraMindVerb "pdf"
  !insertmacro AuraMindVerb "pptx"
  !insertmacro AuraMindVerb "docx"
  !insertmacro AuraMindVerb "doc"
  !insertmacro AuraMindVerb "txt"
  !insertmacro AuraMindVerb "md"
  !insertmacro AuraMindVerb "mp3"
  !insertmacro AuraMindVerb "wav"
  !insertmacro AuraMindVerb "m4a"
  !insertmacro AuraMindVerb "ogg"
  !insertmacro AuraMindVerb "webm"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro AuraMindUnverb "pdf"
  !insertmacro AuraMindUnverb "pptx"
  !insertmacro AuraMindUnverb "docx"
  !insertmacro AuraMindUnverb "doc"
  !insertmacro AuraMindUnverb "txt"
  !insertmacro AuraMindUnverb "md"
  !insertmacro AuraMindUnverb "mp3"
  !insertmacro AuraMindUnverb "wav"
  !insertmacro AuraMindUnverb "m4a"
  !insertmacro AuraMindUnverb "ogg"
  !insertmacro AuraMindUnverb "webm"
!macroend
