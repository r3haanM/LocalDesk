# Security Policy

## Local-Only Processing Architecture

Local Desk processes all PDF and Office documents locally in memory (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`). Outbound network requests from the desktop renderer are blocked at the Electron session layer.

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `1.0.5` | Yes |
| `1.0.4` and earlier | Upgrade to `1.0.5` — the password-protection feature in these versions did not actually encrypt files |

## Reporting a Vulnerability

Please report security issues privately via [GitHub Security Advisories](https://github.com/r3haanM/LocalDesk/security/advisories) (or open a [GitHub Issue](https://github.com/r3haanM/LocalDesk/issues) for non-sensitive questions). For antivirus false-positive verification and SHA-256 checksum validation, see [`docs/AV-FALSE-POSITIVE.md`](./docs/AV-FALSE-POSITIVE.md).
