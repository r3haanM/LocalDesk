# Security Policy

## Local-Only Processing Architecture

Local Desk processes all PDF and Office documents locally in memory (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). Outbound network requests from the desktop renderer are blocked at the Electron session layer.

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `1.0.4` | Yes |
| `< 1.0.4` | Upgrade to `1.0.4` |

## Reporting a Vulnerability

Please report security issues privately to `security@localdesk.app` or via [GitHub Security Advisories](https://github.com/rehanmumtaz/local-desk/security/advisories). For antivirus false-positive verification and SHA-256 checksum validation, see [`docs/AV-FALSE-POSITIVE.md`](./docs/AV-FALSE-POSITIVE.md).
