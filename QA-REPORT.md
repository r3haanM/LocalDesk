# Local Desk v1.0.5 — Pre-Ship QA Report (2026-11-12)

**Product:** Local Desk — All-in-One PDF & Document Studio (`v1.0.5`)
**Shells:** Web (dev server :3000, hosted Express build) & Windows Desktop (Electron 45.3.0, NSIS / Portable / ZIP)
**Method:** Every tool executed through the real `executePdfTool` dispatch and the real editor engine, with outputs validated by **independent parsers** (pdf-lib, pdf.js text extraction, SheetJS, JSZip, magic-byte inspection) — never by trusting the tools' own summary strings. Marketing/legal claims audited line-by-line against the implementation.

**Re-run any time:**
```
npx tsx scripts/qa/functional_suite.ts     # 32 checks — all 21 catalog tools + edge cases
npx tsx scripts/qa/editor_engine_suite.ts  # 12 checks — editor parse/purge/export verification
```
Fixtures and outputs: `release/qa_fixtures/`.

---

## 1. Executive Summary

| Metric | Result |
| :--- | :--- |
| Functional suite (all catalog tools, real dispatch, independent validation) | **32 / 32 PASS** |
| Editor engine suite (redaction purge, deletion purge, export verification, encryption guard) | **12 / 12 PASS** |
| Browser end-to-end (OCR + font matching, PDF→JPG canvas raster, desktop shell boot) | **PASS** |
| Download endpoints (Setup / Portable exe / ZIP, hash-exact over HTTP) | **3 / 3 PASS** |
| Ship-blocking bugs found by this pass | **3 — all fixed & re-verified** |
| Terminology/claims violations found | **7 — all fixed** |

This pass replaced the previous QA-REPORT.md, which was stale and inaccurate (it claimed a 7.72 MB installer from the pre-runtime-bundling era and "0 open bugs" while the fake-encryption issue described below was present).

---

## 2. Ship-Blocking Bugs Found & Fixed (runtime-confirmed)

### BUG-Q1 (Critical, security): "Protect PDF with Password" did not encrypt anything
- **Symptom:** `protect-pdf` wrote the SHA-256 of the password into the file's *metadata keywords* (so the password hash shipped inside the "protected" document), set some trailer fields, and claimed a "cryptographic security envelope and access permissions". Runtime proof: pdf.js opened the output **without any password**; no `/Encrypt` dictionary existed.
- **Impact:** Users would believe confidential documents were locked when anyone could open them.
- **Fix:** Real standard-PDF encryption (ISO 32000 `/Encrypt` security handler) via `@cantoo/pdf-lib` (added dependency; supports `encrypt({userPassword, ownerPassword, permissions})` and password-protected loading). Applied to `protect-pdf`, `unlock-pdf`, and the optional password lock on Word/Excel/PPT/Image/HTML→PDF outputs. No password-derived material is stored in metadata.
- **Verification:** Suite proves `/Encrypt` present, pdf.js **rejects** without password and **opens** with it, hash leak absent; Word→PDF password mode re-verified identically.

### BUG-Q2 (High, data loss): Unlock succeeded on encrypted files without a password — output corrupt
- **Symptom:** `unlock-pdf` loaded any file with `ignoreEncryption` and claimed "Verified password and removed security restrictions". On a *genuinely* encrypted PDF with no password given, it returned **success** and produced a structurally-parseable PDF whose content streams were still encrypted (silent corruption).
- **Fix:** Detect `EncryptedPDFError` on load; require a password and decrypt properly; wrong password → clean rejection; unencrypted input → honest "document was not encrypted" summary instead of a fabricated claim.
- **Verification:** correct password → clean decrypted output; wrong password → rejected; no password → rejected.

### BUG-Q3 (High, security honesty): Editor "SHA-256 Cryptographic Digest Stamp" was random bytes
- **Symptom:** The signature hash displayed as "SHA-256: …" was generated with `crypto.getRandomValues` — not a digest of anything. Exported verification reports carried it as `cryptoSignatures`.
- **Fix:** Real WebCrypto SHA-256 over (document bytes + signer name + signature payload); UI renamed to "SHA-256 Attestation" with an explicit "not a PKI certificate signature" note (the Legal modal already disclaimed PKI).

---

## 3. Terminology / "AI Slop" Audit — all fixed

| Claim (before) | Reality | Action |
| :--- | :--- | :--- |
| "SHA-256 cryptographic security envelope and access permissions" (protect-pdf) | No encryption at all | Real encryption + honest summary |
| "Verified SHA-256 password digest against document envelope" (unlock-pdf) | Regex match on a metadata keyword | Real decryption + honest summaries |
| "Password Protection: Applied in One Go (SHA-256)" (Word→PDF) | Metadata write only | Real encryption + honest detail |
| "Enter a password once to apply SHA-256 access policies" (Batch/Adaptive UI) | Same fake envelope | Reworded to "standard PDF password encryption" |
| "SSRF-Protected Remote URL Imports … private CIDR blocks, 25 MB limit" (Legal modal) | **No URL-import feature exists anywhere in the app** | Rewritten as "No Network Document Transfers" |
| Default footer text "ISO 32000 Verified" / "ISO-32000 Verified" | Decorative stamp text implying verification | Neutral default ("Local Desk") |
| "Attach SHA-256 Cryptographic Digest Stamp … verifiable cryptographic content hashes" | Hash was random | Real digest + honest wording |

**Claims audited and confirmed TRUE:**
- Redaction "permanently purged from the content stream" — `purgeStringsFromPageContentStream` rewrites the raw stream; suite proves secrets are absent from the re-extracted text layer of exported output, metadata sanitized (`stripMetadataOnRedact`), and the export report's `purgedStringsVerifiedAbsent` is truthful.
- "Outbound requests blocked at the engine level" — `electron/main.cjs` installs `session.webRequest.onBeforeRequest` at startup that cancels every non-local URL, plus CSP and a deny-all permission handler.
- "Files capped at 50 MB" — enforced at all three upload entry points.
- "Verified magic-byte inspection" — `validateFileSignature` checks %PDF-/PNG/JPEG/WebP/PKZIP headers; garbage input is rejected (suite-verified).
- "Zero uploads / zero telemetry" — no upload code paths exist; firewall real.

---

## 4. Functional Matrix (independent validation, not self-reported)

| Tool | Verdict | Evidence |
| :--- | :--- | :--- |
| merge-pdf | PASS | 2×4-page inputs → 8-page output, parses |
| split-pdf (each page / ranges / interval) | PASS | ZIP contains correct groups; first group = 2 pages for "1-2, 4" |
| organize-pages (reorder) | PASS | Output parses in requested order (UI sends 0-based indices — verified against source) |
| rotate-pages | PASS | Output page rotation angle = 90° |
| watermark-pdf / page-numbers / header-footer | PASS | Structure preserved, stamps applied |
| crop-pdf | PASS | CropBox width = expected (612 − margins) |
| compress-pdf | PASS | Valid output, object streams rebuilt (see caveat 6.1) |
| flatten-pdf / repair-pdf | PASS | Parse cleanly; AcroForm flatten path exercised |
| protect-pdf | PASS (after fix) | Real /Encrypt; pdf.js password-gated; no hash leak |
| unlock-pdf (all 4 scenarios) | PASS (after fix) | Correct/wrong/missing password + real-encrypted roundtrip |
| word-to-pdf (+password) | PASS (after fix) | Headings + table cells present in PDF text layer; password mode genuinely encrypted |
| excel-to-pdf (+ CSV) | PASS | Cell values from both sheets / CSV rows present |
| ppt-to-pdf | PASS | 2 slides → 2 pages, slide text embedded |
| jpg-to-pdf / png-to-pdf | PASS | Image embedded, page count correct |
| html-to-pdf | PASS | Headings, list items, table content rendered |
| pdf-to-word / excel / ppt / html | PASS | DOCX XML / XLSX rows / 4 slides / HTML markers verified by independent parsers |
| pdf-to-jpg (browser E2E) | PASS | 2 pages rasterized at 144 DPI, "Completed", page grid rendered |
| Invalid input (non-PDF garbage) | PASS | Cleanly rejected, no fake success |

Editor engine (all PASS): model parse, object deletion purge, redaction purge, public content preserved, `redactionCount`, `purgedStringsVerifiedAbsent`, `validPdfHeader`, metadata sanitization, encrypted-source guard.

Also verified in-browser earlier in this session: OCR + pixel-template font matching (see OCR memory notes), desktop shell boot with the new bundle (frameless + custom title bar + vendored fonts, `scripts/capture_desktop.cjs`).

---

## 5. Known Honest Caveats (not bugs, but know before shipping)

1. **compress-pdf** rebuilds object streams and strips metadata but does not recompress content streams — deltas on small files are negligible (1.8 KB → 1.8 KB in the fixture); larger PDFs benefit more. The tool description ("compacting cross-reference object streams") is accurate.
2. **pdf-to-pdfa** writes XMP declaring PDF/A conformance (part/conformance + OutputIntent identifier) but is not a full ISO 19005 validator. The tool is currently not reachable from the catalog.
3. Several processor cases (rotate-pages, watermark-pdf, page-numbers, header-footer, crop-pdf, extract/delete-pages, optimize/repair/flatten, pdf-to-pdfa) have **no catalog entry** — they are reachable in code and work, but users can only reach them through the organizer's combined flow, not as standalone menu tools.
4. OCR may split bold typewriter text into separate word regions ("MUMTAZ," + "REHAN"); each region still matches the scan style. Low-confidence (<75%) regions are flagged amber for review rather than silently trusted.
5. Artifacts are **unsigned** development builds — SmartScreen will show "More info → Run anyway" (hashes in `SHA256SUMS.txt` for verification).

---

## 6. Release Artifacts

Published by the CI pipeline (`release-windows.yml`) on tag `v1.0.5`:
[github.com/r3haanM/LocalDesk/releases/tag/v1.0.5](https://github.com/r3haanM/LocalDesk/releases/tag/v1.0.5) — Setup installer, single-file Portable exe, Portable zip, `SHA256SUMS.txt` and `release-manifest.json` attached. Release download links verified live (HTTP 200). All future releases publish through the same QA-gated pipeline.
