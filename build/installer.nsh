; ============================================================================
; Local Desk — Native NSIS Installer & Uninstaller Macros (build/installer.nsh)
; ============================================================================
; SECURITY & AV HYGIENE CONTRACT:
; - 100% Native NSIS instructions (CreateShortCut, WriteRegStr, Delete, RMDir).
; - ZERO external script interpreters or child process execution.
; - Populates full PE VersionInfo and shortcut FileDescription natively.
; ============================================================================

!macro customHeader
  ; PE VersionInfo is populated by electron-builder from package.json metadata.
!macroend

!macro customInstall
  ; 1. Create Start Menu folder & shortcuts using native NSIS CreateShortCut (no child processes)
  CreateDirectory "$SMPROGRAMS\Local Desk"

  CreateShortCut \
    "$SMPROGRAMS\Local Desk\Local Desk.lnk" \
    "$INSTDIR\Local Desk.exe" \
    "" \
    "$INSTDIR\Local Desk.exe" \
    0 \
    SW_SHOWNORMAL \
    "" \
    "Local Desk - All-in-One PDF & Document Studio"

  CreateShortCut \
    "$SMPROGRAMS\Local Desk\Uninstall Local Desk.lnk" \
    "$INSTDIR\Uninstall Local Desk.exe" \
    "" \
    "$INSTDIR\Uninstall Local Desk.exe" \
    0 \
    SW_SHOWNORMAL \
    "" \
    "Uninstall Local Desk"

  ; 2. Create Desktop shortcut with explicit icon and FileDescription
  CreateShortCut \
    "$DESKTOP\Local Desk.lnk" \
    "$INSTDIR\Local Desk.exe" \
    "" \
    "$INSTDIR\Local Desk.exe" \
    0 \
    SW_SHOWNORMAL \
    "" \
    "Local Desk - All-in-One PDF & Document Studio"

  ; 3. Register per-user (HKCU) .pdf file association natively
  WriteRegStr HKCU "Software\Classes\LocalDesk.PDF" "" "Local Desk - All-in-One PDF & Document Studio"
  WriteRegStr HKCU "Software\Classes\LocalDesk.PDF\DefaultIcon" "" '"$INSTDIR\Local Desk.exe",0'
  WriteRegStr HKCU "Software\Classes\LocalDesk.PDF\shell\open\command" "" '"$INSTDIR\Local Desk.exe" "%1"'

  ; 4. Notify Windows Shell in-process via shell32!SHChangeNotify (SHCNE_ASSOCCHANGED = 0x08000000)
  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  ; Remove shortcuts and per-user file association cleanly without spawning any shell
  Delete "$DESKTOP\Local Desk.lnk"
  Delete "$SMPROGRAMS\Local Desk\Local Desk.lnk"
  Delete "$SMPROGRAMS\Local Desk\Uninstall Local Desk.lnk"
  RMDir "$SMPROGRAMS\Local Desk"
  DeleteRegKey HKCU "Software\Classes\LocalDesk.PDF"
  System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
