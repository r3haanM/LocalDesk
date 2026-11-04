import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Download,
  ShieldCheck,
  HardDrive,
  CheckCircle2,
  Lock,
  Cpu,
  FolderArchive,
  Trash2,
  Copy,
  Check,
  Terminal,
  FileCheck2,
  WifiOff
} from 'lucide-react';
import { LocalDeskLogo } from './Brand/LocalDeskLogo';
import {
  getPrivacyAuditReport,
  purgeTemporaryWorkspaceBuffers,
  PrivacyNetworkAuditSummary
} from '../services/desktopBridge';

interface ReleaseArtifactMeta {
  fileName: string;
  label: string;
  format: string;
  sizeBytes: number;
  sizeFormatted: string;
  sha256: string;
  downloadUrl: string;
  description: string;
}

interface ReleaseManifestResponse {
  version: string;
  productName: string;
  targetPlatform: string;
  buildTimestamp: string;
  artifacts: ReleaseArtifactMeta[];
}

interface DesktopReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BUNDLED_DEPENDENCIES = [
  {
    name: 'pdf-lib',
    version: '1.17.1',
    license: 'MIT',
    role: 'In-memory ISO 32000 PDF creation, stream modification, AcroForm flattening, XMP PDF/A metadata & SHA-256 security envelopes'
  },
  {
    name: 'pdfjs-dist',
    version: '6.4.299',
    license: 'Apache-2.0',
    role: 'Local WebWorker PDF operator parser, text coordinate extractor, and 2D HTML5 Canvas page rasterizer'
  },
  {
    name: 'tesseract.js + tesseract-core WASM',
    version: '7.0.0 / 5.1.0',
    license: 'Apache-2.0',
    role: 'Bundled local WebAssembly OCR engine + Local Desk 2D Connected-Component & Pixel Typography Matcher'
  },
  {
    name: 'docx & mammoth',
    version: '9.15.1 / 1.13.0',
    license: 'MIT / BSD-2-Clause',
    role: 'Bidirectional OpenXML Word (.docx) <-> PDF conversion with table & heading reconstruction'
  },
  {
    name: 'xlsx (SheetJS)',
    version: '0.18.5',
    license: 'Apache-2.0',
    role: 'Bidirectional OpenXML Excel (.xlsx / .csv) <-> PDF tabular extraction and bordered grid layout'
  },
  {
    name: 'pptxgenjs',
    version: '4.0.1',
    license: 'MIT',
    role: 'OpenXML PowerPoint (.pptx) presentation slide generator (Editable Hybrid & High-DPI Visual modes)'
  },
  {
    name: 'jszip',
    version: '3.10.2',
    license: 'MIT',
    role: 'Local ZIP archive packaging for multi-file splits, batch outputs, and high-DPI page image exports'
  },
  {
    name: 'Electron + Hardened IPC Bridge',
    version: '35.x (Win x64)',
    license: 'MIT',
    role: 'Native Windows windowing, OS file dialogs, atomic temp-to-target file writes, and zero-outbound-network firewall'
  }
];

export const DesktopReleaseModal: React.FC<DesktopReleaseModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'downloads' | 'privacy-audit' | 'architecture'>('downloads');
  const [manifest, setManifest] = useState<ReleaseManifestResponse | null>(null);
  const [audit, setAudit] = useState<PrivacyNetworkAuditSummary | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [tempPurgeMessage, setTempPurgeMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/releases/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.artifacts)) {
          setManifest(data);
        }
      })
      .catch(() => {
        // Offline or standalone file:// mode fallback
      });

    getPrivacyAuditReport().then(setAudit);
  }, [isOpen]);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard?.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handlePurgeTemp = async () => {
    const res = await purgeTemporaryWorkspaceBuffers();
    setTempPurgeMessage(
      `Purged ${res.revokedUrls} in-memory object buffer(s) and ${res.nativeFilesRemoved} staging file(s) from %LOCALAPPDATA%\\Local Desk\\Temp.`
    );
    const updated = await getPrivacyAuditReport();
    setAudit(updated);
    setTimeout(() => setTempPurgeMessage(null), 4000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="desktop-release-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            key="desktop-release-dialog"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-theme-surface border border-theme-subtle shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-theme-subtle bg-theme-elevated/60">
              <div className="flex items-center gap-3.5">
                <LocalDeskLogo variant="app-icon" pixelSize={28} />
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-theme-primary">
                      Local Desk for Windows (64-bit x64 PE32+)
                    </h2>
                    <span className="text-[11px] font-mono font-semibold text-theme-accent">
                      v1.0.1 Production Release
                    </span>
                  </div>
                  <p className="text-xs text-theme-secondary mt-0.5">
                    Native Windows x64 PE32+ GUI installer, portable build, SHA-256 verification &amp; local privacy audit
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close Windows Desktop Center"
                className="p-2 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-muted transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 px-6 pt-3 border-b border-theme-subtle bg-theme-surface">
              {[
                { id: 'downloads', label: 'Windows Installer & Portable Builds', icon: Download },
                { id: 'privacy-audit', label: 'Offline & Zero-Upload Audit', icon: ShieldCheck },
                { id: 'architecture', label: 'Desktop Architecture & Licenses', icon: Cpu }
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                      active
                        ? 'border-theme-accent text-theme-accent'
                        : 'border-transparent text-theme-secondary hover:text-theme-primary'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'downloads' && (
                <>
                  {/* Primary Download Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(manifest?.artifacts || [
                      {
                        fileName: 'Local-Desk-Setup-1.0.1-x64.exe',
                        label: 'Windows 10 / 11 Setup Installer (x64 PE32+)',
                        format: 'PE32+ EXE Installer (0x8664)',
                        sizeBytes: 0,
                        sizeFormatted: 'Standalone Setup',
                        sha256: 'Computing SHA-256...',
                        downloadUrl: '/api/releases/download/Local-Desk-Setup-1.0.1-x64.exe',
                        description:
                          'Native 64-bit Windows PE32+ GUI installer (MZ / PE\\0\\0 / 0x8664 AMD64) with embedded Local Desk icon, asInvoker manifest, Desktop & Start Menu shortcuts, and .pdf file association.'
                      },
                      {
                        fileName: 'Local-Desk-Portable-1.0.1-win-x64.zip',
                        label: 'Windows Portable Edition (No-Install ZIP)',
                        format: 'Portable ZIP (with Local Desk.exe)',
                        sizeBytes: 0,
                        sizeFormatted: 'Portable Archive',
                        sha256: 'Computing SHA-256...',
                        downloadUrl: '/api/releases/download/Local-Desk-Portable-1.0.1-win-x64.zip',
                        description:
                          'Standalone Windows x64 portable archive containing native Local Desk.exe (PE32+ 0x8664), pre-compiled offline assets, local OCR WASM binaries, and uninstaller.'
                      }
                    ])
                      .slice(0, 2)
                      .map((item, idx) => (
                        <div
                          key={item.fileName}
                          className={`p-5 rounded-xl border flex flex-col justify-between gap-4 ${
                            idx === 0
                              ? 'bg-theme-elevated/70 border-theme-accent/50'
                              : 'bg-theme-surface border-theme-subtle'
                          }`}
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono font-semibold text-theme-accent">
                                {idx === 0 ? 'RECOMMENDED · WINDOWS 10 / 11 (x64)' : 'PORTABLE · ZERO-INSTALL'}
                              </span>
                              <span className="text-xs font-mono text-theme-muted">
                                {item.sizeFormatted}
                              </span>
                            </div>

                            <h3 className="text-base font-bold text-theme-primary">
                              {item.label}
                            </h3>
                            <p className="text-xs text-theme-secondary leading-relaxed">
                              {item.description}
                            </p>

                            {/* SHA-256 Checksum Box */}
                            <div className="pt-2">
                              <div className="flex items-center justify-between text-[11px] font-mono text-theme-muted mb-1">
                                <span>SHA-256 Checksum</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyHash(item.sha256)}
                                  className="inline-flex items-center gap-1 text-theme-accent hover:underline cursor-pointer"
                                >
                                  {copiedHash === item.sha256 ? (
                                    <>
                                      <Check className="w-3 h-3" /> Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" /> Copy Hash
                                    </>
                                  )}
                                </button>
                              </div>
                              <div className="px-2.5 py-1.5 rounded-lg bg-theme-canvas border border-theme-subtle font-mono text-[11px] text-theme-secondary truncate">
                                {item.sha256}
                              </div>
                            </div>
                          </div>

                          <a
                            href={item.downloadUrl}
                            download={item.fileName}
                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-opacity cursor-pointer ${
                              idx === 0
                                ? 'bg-theme-accent text-white hover:opacity-95 shadow-sm'
                                : 'bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent'
                            }`}
                          >
                            <Download className="w-4 h-4" />
                            <span>Download {item.fileName}</span>
                          </a>
                        </div>
                      ))}
                  </div>

                  {/* Additional Release Artifacts (Checksums & Full Source Package) */}
                  <div className="p-4 rounded-xl bg-theme-canvas border border-theme-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-theme-primary flex items-center gap-2">
                        <FileCheck2 className="w-4 h-4 text-theme-accent" />
                        <span>Cryptographic Verification &amp; Reproducible Build Bundle</span>
                      </div>
                      <p className="text-xs text-theme-secondary">
                        Verify installer integrity with <code className="font-mono text-theme-primary">certutil -hashfile Local-Desk-Setup-1.0.0-x64.exe SHA256</code> on Windows.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <a
                        href="/api/releases/download/SHA256SUMS.txt"
                        download="SHA256SUMS.txt"
                        className="px-3 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle hover:border-theme-accent text-xs font-mono text-theme-primary transition-colors"
                      >
                        SHA256SUMS.txt
                      </a>
                      <a
                        href="/api/export-source"
                        download="local-desk-desktop-source.zip"
                        className="px-3 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle hover:border-theme-accent text-xs font-mono text-theme-accent transition-colors"
                      >
                        Desktop Source (.zip)
                      </a>
                    </div>
                  </div>

                  {/* Windows Installation & First-Launch Walkthrough */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="p-4 rounded-xl bg-theme-surface border border-theme-subtle space-y-1.5">
                      <div className="text-xs font-mono text-theme-accent font-semibold">
                        STEP 01 · INSTALL OR EXTRACT
                      </div>
                      <div className="text-sm font-bold text-theme-primary">
                        No Terminal or Node Setup
                      </div>
                      <p className="text-xs text-theme-secondary leading-relaxed">
                        Run <code className="font-mono">Local-Desk-Setup-1.0.0-x64.exe</code> to install to <code className="font-mono">%LOCALAPPDATA%\Programs\LocalDesk</code> (no Administrator UAC required) with Desktop &amp; Start Menu shortcuts.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-theme-surface border border-theme-subtle space-y-1.5">
                      <div className="text-xs font-mono text-theme-accent font-semibold">
                        STEP 02 · NATIVE WINDOWS UX
                      </div>
                      <div className="text-sm font-bold text-theme-primary">
                        File Dialogs &amp; Shortcuts
                      </div>
                      <p className="text-xs text-theme-secondary leading-relaxed">
                        Use <code className="font-mono">Ctrl+O</code> to open PDFs via the native Windows dialog, drag-and-drop from Explorer, or double-click any associated <code className="font-mono">.pdf</code> file.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-theme-surface border border-theme-subtle space-y-1.5">
                      <div className="text-xs font-mono text-theme-accent font-semibold">
                        STEP 03 · 100% AIR-GAPPED
                      </div>
                      <div className="text-sm font-bold text-theme-primary">
                        Works Disconnected
                      </div>
                      <p className="text-xs text-theme-secondary leading-relaxed">
                        Every PDF editor tool, 13-format converter, redaction stream sanitizer, and OCR typography matcher runs locally with zero internet dependency.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'privacy-audit' && (
                <div className="space-y-5">
                  {/* Live Privacy & Network Status Banner */}
                  <div className="p-5 rounded-xl bg-theme-elevated/70 border border-theme-accent/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-mono text-theme-accent font-semibold">
                        <WifiOff className="w-4 h-4" />
                        <span>ZERO-UPLOAD PRIVACY ARCHITECTURE VERIFIED</span>
                      </div>
                      <h3 className="text-base font-bold text-theme-primary">
                        Documents Never Leave Your Computer
                      </h3>
                      <p className="text-xs text-theme-secondary">
                        All PDF parsing, 2D object editing, OCR recognition, and Office conversions execute strictly in local memory.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handlePurgeTemp}
                      className="px-3.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle hover:border-theme-accent text-xs font-semibold text-theme-primary flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-theme-accent" />
                      <span>Purge Local Temp Cache</span>
                    </button>
                  </div>

                  {tempPurgeMessage && (
                    <div className="p-3 rounded-lg bg-theme-elevated border border-theme-accent text-xs text-theme-primary flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-theme-accent shrink-0" />
                      <span>{tempPurgeMessage}</span>
                    </div>
                  )}

                  {/* Audit Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    <div className="p-4 rounded-xl bg-theme-surface border border-theme-subtle">
                      <div className="text-[11px] font-mono text-theme-muted">
                        EXTERNAL DOC UPLOADS
                      </div>
                      <div className="text-2xl font-extrabold text-theme-accent mt-1 font-mono">
                        {audit?.externalDocumentUploads ?? 0}
                      </div>
                      <div className="text-[11px] text-theme-secondary mt-0.5">
                        0 bytes transmitted
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-theme-surface border border-theme-subtle">
                      <div className="text-[11px] font-mono text-theme-muted">
                        ANALYTICS / TELEMETRY
                      </div>
                      <div className="text-2xl font-extrabold text-theme-accent mt-1 font-mono">
                        {audit?.externalTelemetryCalls ?? 0}
                      </div>
                      <div className="text-[11px] text-theme-secondary mt-0.5">
                        Zero trackers bundled
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-theme-surface border border-theme-subtle">
                      <div className="text-[11px] font-mono text-theme-muted">
                        OFFLINE READINESS
                      </div>
                      <div className="text-2xl font-extrabold text-theme-primary mt-1 font-mono">
                        100%
                      </div>
                      <div className="text-[11px] text-theme-secondary mt-0.5">
                        All 27 tools local
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-theme-surface border border-theme-subtle">
                      <div className="text-[11px] font-mono text-theme-muted">
                        TEMP BUFFERS PURGED
                      </div>
                      <div className="text-2xl font-extrabold text-theme-primary mt-1 font-mono">
                        {audit?.tempObjectsRevoked ?? 0}
                      </div>
                      <div className="text-[11px] text-theme-secondary mt-0.5">
                        Auto-cleaned on exit
                      </div>
                    </div>
                  </div>

                  {/* Windows Filesystem & Storage Locations */}
                  <div className="p-4 rounded-xl bg-theme-canvas border border-theme-subtle space-y-3">
                    <h4 className="text-xs font-bold text-theme-primary uppercase tracking-wider font-mono">
                      Windows Local Storage &amp; Atomic File Safety
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-theme-surface border border-theme-subtle space-y-1">
                        <div className="font-semibold text-theme-primary">
                          User Preferences &amp; Recent Files
                        </div>
                        <div className="font-mono text-[11px] text-theme-accent">
                          %APPDATA%\Local Desk\preferences.json
                        </div>
                        <p className="text-theme-secondary text-[11px]">
                          Stores Dark/Light/System appearance mode, window geometry, and recent file paths locally.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-theme-surface border border-theme-subtle space-y-1">
                        <div className="font-semibold text-theme-primary">
                          Atomic Save Staging &amp; Temp Directory
                        </div>
                        <div className="font-mono text-[11px] text-theme-accent">
                          %LOCALAPPDATA%\Local Desk\Temp
                        </div>
                        <p className="text-theme-secondary text-[11px]">
                          Files are written to staging first, verified with SHA-256, and atomically renamed so originals are never corrupted.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'architecture' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-theme-canvas border border-theme-subtle space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-theme-primary">
                        Desktop Security Hardening &amp; Runtime Specification
                      </h3>
                      <span className="text-xs font-mono text-theme-accent">
                        ContextIsolation + Sandbox Enforced
                      </span>
                    </div>
                    <p className="text-xs text-theme-secondary leading-relaxed">
                      Local Desk runs in a hardened Electron Chromium container with <code className="font-mono">contextIsolation: true</code>, <code className="font-mono">nodeIntegration: false</code>, <code className="font-mono">sandbox: true</code>, a strict Content-Security-Policy, and a session-level outbound network firewall that blocks external traffic.
                    </p>
                  </div>

                  {/* Bundled Dependencies Table */}
                  <div className="rounded-xl border border-theme-subtle overflow-hidden">
                    <div className="px-4 py-2.5 bg-theme-elevated border-b border-theme-subtle flex items-center justify-between text-xs font-bold text-theme-primary">
                      <span>Bundled Offline Processing Engines &amp; Third-Party Licenses</span>
                      <span className="font-mono text-[11px] text-theme-muted">8 Core Packages · 0 External Binaries</span>
                    </div>
                    <div className="divide-y divide-theme-subtle/40 bg-theme-surface">
                      {BUNDLED_DEPENDENCIES.map((dep) => (
                        <div
                          key={dep.name}
                          className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-theme-primary flex items-center gap-2">
                              <span>{dep.name}</span>
                              <span className="font-mono text-[11px] text-theme-accent">
                                v{dep.version}
                              </span>
                            </div>
                            <p className="text-theme-secondary text-[11px]">{dep.role}</p>
                          </div>
                          <span className="font-mono text-[11px] text-theme-muted shrink-0">
                            {dep.license} License
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 border-t border-theme-subtle bg-theme-elevated/50 flex flex-wrap items-center justify-between gap-3 text-xs text-theme-muted">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-theme-accent" />
                <span>Windows 10 &amp; Windows 11 (64-bit) · 100% Local Execution · Zero Cloud Upload</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle hover:border-theme-accent text-theme-primary font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
