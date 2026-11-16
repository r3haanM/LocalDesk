# LocalDesk Mobile (Android)

Offline document viewer companion to the LocalDesk desktop app. Opens **PDF, DOCX, XLSX, PPTX, CSV, TXT, MD and images** entirely on-device — **zero permissions, zero network, zero telemetry**.

## Features

- **PDF viewer** — continuous vertical reading, two-phase zoom (pinch, then sharp re-render), in-document search, page thumbnails with jump, line-granular text selection + copy, persisted highlights, wide-page centering
- **DOCX** — styled runs (bold/italic/underline/strike/color/highlight/size), headings, numbering, tables, images, headers/footers, footnotes, hyperlinks
- **XLSX / CSV** — all sheets with tab strip, number/date formats, authored column widths, merged cells, frozen columns, sticky header, row/col caps with honest notices
- **PPTX** — true slide canvases (shapes, text runs, pictures, tables), theme colors, chart placeholder cards
- **TXT / MD** — font-scale reflow zoom, selectable text
- **Images** — pinch zoom / pan
- Floating Adobe-style toolbar per pane (prev/next · page · zoom · slider), honest error panes for damaged/locked/unsupported files, PDF highlights persisted locally

## Install (test build)

1. Grab `LocalDesk-Mobile-v1.0.0.apk` from the [Releases](https://github.com/r3haanM/LocalDesk/releases) page (tag `mobile-v1.0.0`)
2. Allow "Install unknown apps" for your browser/file manager when prompted
3. Install → open LocalDesk → pick files via **Browse** or open directly from other apps with "Open with → LocalDesk"

## Build from source

```bash
cd mobile
./gradlew :app:assembleDebug        # APK at app/build/outputs/apk/debug/
```

- Requires JDK 17 and an Android SDK (set `local.properties` → `sdk.dir`, or `ANDROID_HOME`)
- `minSdk 26 · targetSdk 35 · Kotlin 2.0 · Jetpack Compose (Material 3)`
- Zero declared permissions — files arrive only via SAF / `ACTION_VIEW` content URIs

## Notes

- The test build is debug-signed (fine for personal sideloading)
- Damaged / renamed files show an honest "appears to be damaged" pane instead of pretending
- Password-protected PDFs whose *user* password is set need the desktop app to unlock (platform limitation)
