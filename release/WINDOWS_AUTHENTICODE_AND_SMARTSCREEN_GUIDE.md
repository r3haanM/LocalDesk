# Local Desk - Windows Authenticode Code-Signing & SmartScreen Readiness Guide

## 1. Current Signing Status & Audit Summary

- **Current Build Status:** `UNSIGNED_DEVELOPMENT_BUILD`
- **Configured Publisher Identity:** `null` (embedded consistently across `VS_VERSION_INFO` `CompanyName`, Windows Registry `HKCU\...\Uninstall\LocalDesk\Publisher`, `electron-builder.yml`, and `package.json`).
- **Executables in Release Pipeline:**
  1. `Local Desk.exe` (Main PE32+ x64 application executable - signed **before** packaging into Portable ZIP and Setup SFX archive).
  2. `Uninstall Local Desk.exe` (PE32+ x64 uninstaller executable - signed **before** packaging into Portable ZIP and Setup SFX archive).
  3. `Local-Desk-Setup-1.0.3-x64.exe` (Outer PE32+ x64 installer - signed **last** after SFX assembly; never modified after signing).

> **Honest Status Note:** If `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` have not yet been provisioned with a publicly trusted CA certificate, the generated binaries in development/pre-certificate mode remain unsigned (`IMAGE_DIRECTORY_ENTRY_SECURITY = 0`). Running `npm run desktop:release:prod` (`FORCE_CODE_SIGNING=true`) strictly fails the build until a valid certificate is supplied.

---

## 2. Required Certificate Type & Acquisition

To satisfy Windows 10/11 Authenticode verification and establish Microsoft Defender SmartScreen publisher reputation, acquire one of the following from a publicly trusted Certificate Authority (DigiCert, Sectigo, GlobalSign, Entrust, or Microsoft):

1. **Azure Trusted Signing (Recommended for Modern Windows Distribution):**
   - Cloud-managed FIPS 140-2 Level 3 HSM-backed signing managed by Microsoft.
   - Rapid identity validation for organizations and verified individual developers.
2. **Extended Validation (EV) or Organization Validation (OV) Code Signing Certificate:**
   - Stored on a FIPS 140-2 Level 2+ hardware token (e.g., SafeNet eToken) or Cloud HSM, or exported as an encrypted PKCS#12 (`.pfx` / `.p12`) bundle where supported.
   - Must support **SHA-256** digest signing (`/fd sha256`) and **RFC 3161 SHA-256 Timestamping** (`/tr http://timestamp.digicert.com /td sha256`).

---

## 3. Secure Environment Variable Provisioning

Never commit `.pfx`/`.p12` files or passwords to Git. Configure the following environment variables in your CI/CD secret store or local environment before running `npm run desktop:release:prod`:

```powershell
# Path to trusted PFX/P12 file OR base64-encoded PFX payload
$env:WIN_CSC_LINK = "C:\secure-certs\local-desk-authenticode.pfx"

# Password unlocking the PFX private key (never logged)
$env:WIN_CSC_KEY_PASSWORD = "<YOUR_CERT_PASSWORD>"

# Exact verified Subject Name (CN) on your certificate
$env:WIN_PUBLISHER_NAME = "Local Desk"

# RFC 3161 Timestamp Authority URL
$env:WIN_TIMESTAMP_SERVER = "http://timestamp.digicert.com"

# Enforce mandatory code signing (build aborts if signing fails or credentials are missing)
$env:FORCE_CODE_SIGNING = "true"
```

---

## 4. Production Signing & Verification Procedure

1. **Build Signed Production Release:**
   ```bash
   npm run desktop:release:prod
   ```
2. **Verify Signatures & Checksums on Windows PowerShell:**
   Run the bundled verification script:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File .\release\Verify-Local-Desk-Signatures.ps1 -RequireValidSignature
   ```
   Or inspect individual executables directly:
   ```powershell
   Get-AuthenticodeSignature .\release\Local-Desk-Setup-1.0.3-x64.exe | Format-List *
   Get-AuthenticodeSignature "$env:LOCALAPPDATA\Programs\LocalDesk\Local Desk.exe" | Format-List *
   ```

---

## 5. Honest Microsoft Defender SmartScreen Expectations

- **Signing != Instant SmartScreen Bypass:** Even with a valid publicly trusted OV or Individual Authenticode signature, Microsoft Defender SmartScreen evaluates **application and certificate download/execution reputation** across the Windows ecosystem.
- **Reputation Accumulation:** A newly issued certificate may still display the SmartScreen prompt for initial downloads until sufficient positive telemetry accumulates with Microsoft.
- **Best Practices:**
  - Always maintain the **exact same verified publisher identity** across versions (`1.0.3`, `1.0.4`, etc.) so reputation carries forward.
  - Submit newly signed release installers to **Microsoft Security Intelligence (WDSI) File Submission Portal** as a signed software developer prior to public announcement.
  - Never instruct users to disable Windows Defender or weaken SmartScreen policies.

---

## 6. Distribution Strategy Comparison: Direct Signed EXE vs. Microsoft Store (MSIX)

| Criterion | Option A: Direct Signed EXE (`Local-Desk-Setup-x64.exe`) | Option B: Microsoft Store (`.msix` / `appx`) |
| :--- | :--- | :--- |
| **Certificate Requirement** | Publicly trusted OV/EV Code Signing Certificate or Azure Trusted Signing | Automatic signing by Microsoft Store upon submission (no separate PFX needed for Store downloads) |
| **SmartScreen Behavior** | Reputation builds over time tied to Publisher Certificate & file hash | Store-signed packages are automatically trusted by Windows SmartScreen immediately |
| **User Installation UX** | Download `Local-Desk-Setup-1.0.3-x64.exe` from website -> 1-click per-user install to `%LOCALAPPDATA%\Programs\LocalDesk` | Install directly from Microsoft Store app on Windows 10/11 with automatic background updates |
| **Enterprise / Offline Use** | Ideal for air-gapped networks, USB transfer, and portable ZIP deployment | Requires Microsoft Store access or enterprise `Add-AppxPackage` sideloading |
| **Maintenance Effort** | Low (automated via `npm run desktop:release:prod`) | Moderate (requires Partner Center account & Store certification review per release) |
