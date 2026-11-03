import React, { useState } from 'react';
import {
  X,
  Download,
  Check,
  Layers,
  Grid,
  Compass,
  Eye,
  Monitor,
  Globe,
  AppWindow,
  Sliders
} from 'lucide-react';
import { LocalDeskLogo, LogoRefinementVersion } from './LocalDeskLogo';

interface BrandIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ICON_TEST_SIZES = [16, 24, 32, 48, 64, 128, 256] as const;

const CONTROLLED_REFINEMENTS: Array<{
  version: LogoRefinementVersion;
  title: string;
  subtitle: string;
  selected: boolean;
  badge: string;
  summary: string;
  critique: string[];
}> = [
  {
    version: 'A',
    title: 'Version A — Minimal & Restrained',
    subtitle: 'Monolithic Tonal Symbol · Unified Off-White / Forest Wordmark',
    selected: false,
    badge: 'Study A',
    summary:
      'Reduces the symbol to a tonal two-shade emerald geometry without internal document calibration lines, paired with a subdued tonal wordmark (`Local` 800 + `Desk` 600) and no trailing square.',
    critique: [
      'Strengths: Quiet, understated architectural presence with zero decorative noise.',
      'Trade-off: Removing the high-contrast mint/white document sheet inside the symbol reduces small-scale silhouette legibility at 16px–24px, and the single-hue wordmark loses the crisp semantic distinction between "Local" and "Desk".'
    ]
  },
  {
    version: 'B',
    title: 'Version B — Cohesive Forest + Emerald Identity',
    subtitle: 'Uniform 4.5px Channel · Two-Plane Symbol · Balanced Two-Tone Wordmark',
    selected: true,
    badge: 'Selected Master Identity',
    summary:
      'Unifies the identity around Deep Forest Green (#0D1F18), Emerald Green (#10B981 / #34D399 / #059669), and Crisp Off-White (#F2F7F4). Calibrates an exact 4.5px negative-space channel on both axes of the symbol and removes the disconnected trailing green square so the wordmark stands with mature software authority.',
    critique: [
      'Why Version B Wins: Retires the competing purple "Desk" color entirely in favor of a cohesive Forest + Emerald hierarchy with strong contrast on both dark (#0D1F18) and light (#F6F8F7) surfaces.',
      'Symbol & Wordmark Harmony: The 22×22 active document plane and 9.5px L-frame desk datum share a uniform 4.5px architectural channel, while removing the tacked-on trailing green dot gives the wordmark a clean, confident terminal.'
    ]
  },
  {
    version: 'C',
    title: 'Version C — Distinctive Typographic Terminal',
    subtitle: 'High Weight Contrast (800 / 500) · Integrated Baseline Cursor Bar',
    selected: false,
    badge: 'Study C',
    summary:
      'Tightens word spacing (`0.12em`), increases typographic weight contrast (`Local` 800 ExtraBold vs `Desk` 500 Medium), and reimagines the former green square as an integrated baseline underscore bar anchored to the terminal of "Desk".',
    critique: [
      'Strengths: Gives the trailing geometric accent an intentional typographic purpose (an active document cursor/terminal).',
      'Trade-off: The lighter 500 weight on "Desk" and the trailing baseline bar introduce extra visual complexity in compact 24px–28px application title bars compared to Version B.'
    ]
  }
];

const BRAND_COLORS = [
  {
    name: 'Deep Forest Green',
    role: 'Primary Brand Color · Dark Canvas & Light-Mode Primary Ink',
    hex: '#0D1F18',
    rgb: '13, 31, 24',
    contrast: '16.4:1 vs #F2F7F4',
    sampleBg: '#0D1F18',
    sampleText: '#F2F7F4'
  },
  {
    name: 'Forest Vessel Surface',
    role: 'Elevated Dark Interface & Icon Squircle Container',
    hex: '#132A21',
    rgb: '19, 42, 33',
    contrast: '13.8:1 vs #F2F7F4',
    sampleBg: '#132A21',
    sampleText: '#F2F7F4'
  },
  {
    name: 'Core Emerald Accent',
    role: 'Primary Brand Accent · L-Frame Desk Datum & Fold',
    hex: '#10B981',
    rgb: '16, 185, 129',
    contrast: '7.4:1 vs #0D1F18',
    sampleBg: '#10B981',
    sampleText: '#0D1F18'
  },
  {
    name: 'Luminous Emerald (Dark UI)',
    role: '"Desk" Wordmark Accent on Dark Surfaces & Rim Highlight',
    hex: '#34D399',
    rgb: '52, 211, 153',
    contrast: '10.6:1 vs #0D1F18',
    sampleBg: '#34D399',
    sampleText: '#0D1F18'
  },
  {
    name: 'Precision Emerald (Light UI)',
    role: '"Desk" Wordmark Accent on Light Surfaces',
    hex: '#059669',
    rgb: '5, 150, 105',
    contrast: '4.6:1 vs #F6F8F7',
    sampleBg: '#059669',
    sampleText: '#FFFFFF'
  },
  {
    name: 'Crisp Off-White & Clean Neutral',
    role: '"Local" Dark-Mode Text (#F2F7F4) & Light-Mode Canvas (#F6F8F7)',
    hex: '#F2F7F4',
    rgb: '242, 247, 244',
    contrast: '16.4:1 vs #0D1F18',
    sampleBg: '#F2F7F4',
    sampleText: '#0D1F18'
  }
];

const SVG_ASSETS = [
  {
    id: 'primary',
    title: 'Primary Horizontal Logo (SVG)',
    desc: 'Master horizontal symbol + wordmark lockup (Version B)',
    path: '/brand/local-desk-logo-primary.svg',
    filename: 'local-desk-logo-primary.svg'
  },
  {
    id: 'dark',
    title: 'Dark Background Version (SVG)',
    desc: 'Calibrated for Deep Forest (#0D1F18) & dark UI headers',
    path: '/brand/local-desk-logo-dark.svg',
    filename: 'local-desk-logo-dark.svg'
  },
  {
    id: 'light',
    title: 'Light Background Version (SVG)',
    desc: 'Calibrated for Clean Neutral (#F6F8F7 / #FFFFFF) surfaces',
    path: '/brand/local-desk-logo-light.svg',
    filename: 'local-desk-logo-light.svg'
  },
  {
    id: 'app-icon',
    title: 'Desktop Application Icon (SVG)',
    desc: 'Squircle container with Deep Forest vessel & 4.5px channel',
    path: '/brand/local-desk-app-icon.svg',
    filename: 'local-desk-app-icon.svg'
  },
  {
    id: 'symbol',
    title: 'Standalone Symbol (SVG)',
    desc: 'Uncontained Grounded L-Frame + Active Document Plane',
    path: '/brand/local-desk-symbol.svg',
    filename: 'local-desk-symbol.svg'
  },
  {
    id: 'wordmark',
    title: 'Wordmark Only (SVG)',
    desc: 'Custom Plus Jakarta Sans logotype without trailing dot',
    path: '/brand/local-desk-wordmark.svg',
    filename: 'local-desk-wordmark.svg'
  },
  {
    id: 'stacked',
    title: 'Stacked Lockup (SVG)',
    desc: 'Centered vertical arrangement for splash & about dialogs',
    path: '/brand/local-desk-stacked.svg',
    filename: 'local-desk-stacked.svg'
  },
  {
    id: 'mono-black',
    title: 'Monochrome Dark Ink (SVG)',
    desc: 'Single-ink (#0D1F18) vector stencil for print & embossing',
    path: '/brand/local-desk-mono-black.svg',
    filename: 'local-desk-mono-black.svg'
  },
  {
    id: 'mono-white',
    title: 'Monochrome White (SVG)',
    desc: 'Single-ink (#F2F7F4) knocked-out vector mark',
    path: '/brand/local-desk-mono-white.svg',
    filename: 'local-desk-mono-white.svg'
  }
];

export const BrandIdentityModal: React.FC<BrandIdentityModalProps> = ({ isOpen, onClose }) => {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'refinements' | 'contexts' | 'geometry' | 'assets'
  >('refinements');

  if (!isOpen) return null;

  const handleCopyHex = (hex: string) => {
    navigator.clipboard.writeText(hex);
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl bg-theme-surface border border-theme-strong rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-theme-subtle flex flex-wrap items-center justify-between gap-4 bg-theme-elevated">
          <div className="flex items-center gap-3.5">
            <LocalDeskLogo variant="app-icon" pixelSize={38} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight text-theme-primary">
                  Local Desk — Brand Identity &amp; Logo Refinement Studio
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                  Version B · Production Master
                </span>
              </div>
              <p className="text-xs text-theme-secondary">
                Cohesive Deep Forest + Emerald color architecture, uniform 4.5px symbol geometry &amp; controlled typography refinement
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 bg-theme-canvas p-1 rounded-xl border border-theme-subtle">
            <button
              type="button"
              onClick={() => setActiveTab('refinements')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'refinements'
                  ? 'bg-[#10B981] text-[#062218]'
                  : 'text-theme-secondary hover:text-theme-primary'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Controlled Refinements (A / B / C)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contexts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'contexts'
                  ? 'bg-[#10B981] text-[#062218]'
                  : 'text-theme-secondary hover:text-theme-primary'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Real-World Contexts (6)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('geometry')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'geometry'
                  ? 'bg-[#10B981] text-[#062218]'
                  : 'text-theme-secondary hover:text-theme-primary'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              Symbol Grid &amp; 16–256px Scale
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'assets'
                  ? 'bg-[#10B981] text-[#062218]'
                  : 'text-theme-secondary hover:text-theme-primary'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              SVG &amp; PNG Exports
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-muted transition-colors cursor-pointer"
            aria-label="Close Brand Identity Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-10">
          {activeTab === 'refinements' && (
            <>
              {/* 1. Primary Selected Master Lockup (Dark & Light Comparison) */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    <Compass className="w-4 h-4" />
                    <span>1. Selected Refined Identity (Version B) — Dark &amp; Light Hierarchy</span>
                  </div>
                  <span className="text-xs font-mono text-theme-muted">
                    Purple removed · Cohesive Deep Forest + Emerald + Off-White system
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Dark Brand Stage */}
                  <div className="rounded-xl bg-[#0D1F18] border border-[#34D399]/25 p-8 flex flex-col justify-between min-h-[220px]">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#86A89B]">
                      <span>PRIMARY DARK LOCKUP · DEEP FOREST (#0D1F18)</span>
                      <span className="px-2 py-0.5 rounded bg-[#10B981]/15 text-[#34D399] border border-[#34D399]/30">
                        Master Dark
                      </span>
                    </div>
                    <div className="my-6 flex items-center justify-center">
                      <LocalDeskLogo
                        variant="horizontal"
                        surface="dark"
                        size="xl"
                        refinementVersion="B"
                        subtitle="LOCAL DOCUMENT WORKSPACE"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#86A89B] border-t border-white/10 pt-3">
                      <span>Local: #F2F7F4 (800)</span>
                      <span>Desk: #34D399 (700)</span>
                      <span>Channel: 4.5px Uniform</span>
                    </div>
                  </div>

                  {/* Light Brand Stage */}
                  <div className="rounded-xl bg-[#F6F8F7] border border-[#0D1F18]/15 p-8 flex flex-col justify-between min-h-[220px]">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#4D6A5F]">
                      <span>PRIMARY LIGHT LOCKUP · CLEAN NEUTRAL (#F6F8F7)</span>
                      <span className="px-2 py-0.5 rounded bg-[#059669]/12 text-[#059669] border border-[#059669]/25">
                        Master Light
                      </span>
                    </div>
                    <div className="my-6 flex items-center justify-center">
                      <LocalDeskLogo
                        variant="horizontal"
                        surface="light"
                        size="xl"
                        refinementVersion="B"
                        subtitle="LOCAL DOCUMENT WORKSPACE"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#4D6A5F] border-t border-[#0D1F18]/10 pt-3">
                      <span>Local: #0D1F18 (800)</span>
                      <span>Desk: #059669 (700)</span>
                      <span>Vessel: #0D1F18 Contrast</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* 2. Controlled Refinements Comparison (Versions A, B, C) */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <Sliders className="w-4 h-4" />
                  <span>2. Controlled Refinement Study — Versions A, B &amp; C</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {CONTROLLED_REFINEMENTS.map((item) => (
                    <div
                      key={item.version}
                      className={`rounded-xl border p-5 flex flex-col justify-between space-y-4 ${
                        item.selected
                          ? 'border-[#10B981] bg-theme-elevated ring-1 ring-[#10B981]/30'
                          : 'border-theme-subtle bg-theme-canvas/60'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-semibold ${
                              item.selected
                                ? 'bg-[#10B981] text-[#062218]'
                                : 'bg-theme-muted text-theme-secondary'
                            }`}
                          >
                            {item.badge}
                          </span>
                          {item.selected && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <Check className="w-3.5 h-3.5" /> Implemented Across App
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-theme-primary">{item.title}</h3>
                          <p className="text-[11px] font-mono text-theme-muted mt-0.5">
                            {item.subtitle}
                          </p>
                        </div>

                        {/* Dark & Light Preview Strips for each version */}
                        <div className="space-y-2 pt-1">
                          <div className="rounded-lg bg-[#0D1F18] px-4 py-4 flex items-center justify-center border border-white/10">
                            <LocalDeskLogo
                              variant="horizontal"
                              surface="dark"
                              size="md"
                              refinementVersion={item.version}
                            />
                          </div>
                          <div className="rounded-lg bg-[#F6F8F7] px-4 py-3.5 flex items-center justify-center border border-[#0D1F18]/10">
                            <LocalDeskLogo
                              variant="horizontal"
                              surface="light"
                              size="md"
                              refinementVersion={item.version}
                            />
                          </div>
                        </div>

                        <p className="text-xs text-theme-secondary leading-relaxed">
                          {item.summary}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-theme-subtle space-y-1.5">
                        {item.critique.map((point, idx) => (
                          <p
                            key={idx}
                            className="text-[11px] text-theme-secondary leading-relaxed"
                          >
                            • {point}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 3. Reconsidering the Small Green Square & Color System */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 rounded-xl border border-theme-subtle bg-theme-canvas p-5 space-y-3">
                  <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                    3. Trailing Green Square Audit
                  </div>
                  <h3 className="text-sm font-bold text-theme-primary">
                    Why the Small Trailing Square Was Removed in Version B
                  </h3>
                  <p className="text-xs text-theme-secondary leading-relaxed">
                    In the initial concept, a `w-2 h-2` green square was placed immediately after{' '}
                    <span className="font-mono text-theme-primary">Desk</span>. Critical optical
                    evaluation revealed three reasons to retire it:
                  </p>
                  <ul className="text-xs text-theme-secondary space-y-2 leading-relaxed">
                    <li>
                      <strong className="text-theme-primary">1. Competing Focal Anchors:</strong>{' '}
                      The left-hand application symbol already provides a strong geometric square
                      anchor. A second small green square at the far right split horizontal eye
                      movement.
                    </li>
                    <li>
                      <strong className="text-theme-primary">2. Unattached Terminal Geometry:</strong>{' '}
                      Sitting at baseline height next to the diagonal leg of <code className="font-mono">k</code>,
                      the square created an uneven optical gap that resembled a notification badge
                      rather than part of the typography.
                    </li>
                    <li>
                      <strong className="text-theme-primary">3. Stronger Two-Tone Wordmark:</strong>{' '}
                      With <code className="font-mono">Desk</code> rendered in calibrated Emerald
                      (<code className="font-mono">#34D399</code> / <code className="font-mono">#059669</code>),
                      the wordmark already carries the brand accent with clean authority.
                    </li>
                  </ul>
                </div>

                {/* Color System Hierarchy Swatches */}
                <div className="lg:col-span-7 rounded-xl border border-theme-subtle bg-theme-canvas p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                      4. Refined Forest + Emerald Color System
                    </span>
                    <span className="text-[11px] font-mono text-theme-muted">
                      Click any swatch to copy HEX
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {BRAND_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => handleCopyHex(c.hex)}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-theme-subtle bg-theme-surface hover:border-theme-strong transition-colors text-left cursor-pointer"
                      >
                        <div
                          className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center font-mono text-[10px] font-bold border border-black/15"
                          style={{ backgroundColor: c.sampleBg, color: c.sampleText }}
                        >
                          {copiedHex === c.hex ? <Check className="w-4 h-4" /> : c.hex}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-theme-primary truncate">
                              {c.name}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                              {c.contrast}
                            </span>
                          </div>
                          <p className="text-[11px] text-theme-secondary truncate mt-0.5">
                            {c.role}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {activeTab === 'contexts' && (
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <Monitor className="w-4 h-4" />
                  <span>Real-World Brand Application — 6 Functional Product Contexts</span>
                </div>
                <span className="text-xs font-mono text-theme-muted">
                  Clean 2D product contexts · Zero 3D mockups
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Context 1: Desktop Application Icon */}
                <div className="rounded-xl border border-theme-subtle bg-theme-canvas p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-theme-primary flex items-center gap-1.5">
                      <AppWindow className="w-3.5 h-3.5 text-emerald-500" />
                      1. Desktop Application Icon (OS Dock &amp; Taskbar)
                    </span>
                    <span className="font-mono text-[11px] text-theme-muted">64px / 48px / 32px</span>
                  </div>
                  <div className="rounded-lg bg-[#091410] border border-white/10 p-5 flex items-center justify-center">
                    <div className="px-5 py-3 rounded-2xl bg-[#132A21]/90 border border-[#34D399]/20 flex items-center gap-5">
                      <div className="flex flex-col items-center gap-1.5">
                        <LocalDeskLogo variant="app-icon" pixelSize={56} />
                        <span className="w-1 h-1 rounded-full bg-[#34D399]" />
                      </div>
                      <div className="h-9 w-px bg-white/10" />
                      <div className="flex items-center gap-4 opacity-90">
                        <LocalDeskLogo variant="app-icon" pixelSize={40} />
                        <LocalDeskLogo variant="app-icon" pixelSize={28} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Context 2: Application Title Bar */}
                <div className="rounded-xl border border-theme-subtle bg-theme-canvas p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-theme-primary flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-emerald-500" />
                      2. Native Desktop Application Title Bar
                    </span>
                    <span className="font-mono text-[11px] text-theme-muted">22px Compact Lockup</span>
                  </div>
                  <div className="rounded-lg bg-[#0D1F18] border border-white/10 overflow-hidden">
                    <div className="h-11 px-4 bg-[#132A21] border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                          <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                          <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                        </div>
                        <div className="h-4 w-px bg-white/10" />
                        <LocalDeskLogo variant="horizontal" surface="dark" size="xs" pixelSize={22} />
                      </div>
                      <div className="text-[11px] font-mono text-[#A3BEB3]">
                        Q4_Financial_Audit.pdf — Edited Locally
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#10B981]/15 text-[#34D399] border border-[#34D399]/25">
                        OFFLINE ENGINE
                      </span>
                    </div>
                    <div className="p-4 text-[11px] font-mono text-[#86A89B] flex items-center justify-between">
                      <span>Page 1 of 18 · 100% Zoom</span>
                      <span>Zero Network Calls</span>
                    </div>
                  </div>
                </div>

                {/* Context 3: Dark Application Interface */}
                <div className="rounded-xl border border-theme-subtle bg-theme-canvas p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-theme-primary">
                      3. Dark Application Interface (#0D1F18 Workspace)
                    </span>
                    <span className="font-mono text-[11px] text-theme-muted">Surface="dark"</span>
                  </div>
                  <div className="rounded-lg bg-[#0D1F18] border border-[#34D399]/20 overflow-hidden">
                    <div className="px-4 py-3 bg-[#132A21] border-b border-white/10 flex items-center justify-between">
                      <LocalDeskLogo
                        variant="horizontal"
                        surface="dark"
                        size="sm"
                        pixelSize={28}
                        subtitle="DOCUMENT WORKSPACE"
                      />
                      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#F2F7F4]">
                        <span className="px-2.5 py-1 rounded bg-[#1A362B] text-[#34D399]">
                          Edit PDF
                        </span>
                        <span className="px-2.5 py-1 rounded text-[#A3BEB3]">Convert</span>
                        <span className="px-2.5 py-1 rounded text-[#A3BEB3]">OCR Scan</span>
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-4 space-y-1.5">
                        <div className="h-2 w-20 rounded bg-[#34D399]/40" />
                        <div className="h-2 w-28 rounded bg-white/15" />
                        <div className="h-2 w-24 rounded bg-white/10" />
                      </div>
                      <div className="col-span-8 rounded bg-[#132A21] border border-white/10 p-3 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-[#F2F7F4]">
                          Vector Canvas Ready
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#10B981] text-[#062218] text-[10px] font-bold">
                          Export PDF
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Context 4: Light Application Interface */}
                <div className="rounded-xl border border-theme-subtle bg-theme-canvas p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-theme-primary">
                      4. Light Application Interface (#F6F8F7 Workspace)
                    </span>
                    <span className="font-mono text-[11px] text-theme-muted">Surface="light"</span>
                  </div>
                  <div className="rounded-lg bg-[#F6F8F7] border border-[#0D1F18]/15 overflow-hidden">
                    <div className="px-4 py-3 bg-white border-b border-[#0D1F18]/10 flex items-center justify-between">
                      <LocalDeskLogo
                        variant="horizontal"
                        surface="light"
                        size="sm"
                        pixelSize={28}
                        subtitle="DOCUMENT WORKSPACE"
                      />
                      <div className="flex items-center gap-2 text-[11px] font-semibold">
                        <span className="px-2.5 py-1 rounded bg-[#E9F0EC] text-[#059669]">
                          Edit PDF
                        </span>
                        <span className="px-2.5 py-1 rounded text-[#3B544A]">Convert</span>
                        <span className="px-2.5 py-1 rounded text-[#3B544A]">OCR Scan</span>
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-4 space-y-1.5">
                        <div className="h-2 w-20 rounded bg-[#059669]/40" />
                        <div className="h-2 w-28 rounded bg-[#0D1F18]/15" />
                        <div className="h-2 w-24 rounded bg-[#0D1F18]/10" />
                      </div>
                      <div className="col-span-8 rounded bg-white border border-[#0D1F18]/10 p-3 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-[#0D1F18]">
                          Vector Canvas Ready
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#059669] text-white text-[10px] font-bold">
                          Export PDF
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Context 5: Website Header */}
                <div className="rounded-xl border border-theme-subtle bg-theme-canvas p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-theme-primary flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-emerald-500" />
                      5. Product Website Header Navigation
                    </span>
                    <span className="font-mono text-[11px] text-theme-muted">32px Lockup</span>
                  </div>
                  <div className="rounded-lg bg-[#0D1F18] border border-white/10 px-5 py-3.5 flex items-center justify-between">
                    <LocalDeskLogo variant="horizontal" surface="dark" size="sm" pixelSize={32} />
                    <div className="hidden sm:flex items-center gap-5 text-xs font-medium text-[#A3BEB3]">
                      <span className="text-[#F2F7F4]">Features</span>
                      <span>Security</span>
                      <span>OCR Engine</span>
                      <span>Docs</span>
                    </div>
                    <span className="px-3 py-1.5 rounded-lg bg-[#10B981] text-[#062218] text-xs font-bold">
                      Download App
                    </span>
                  </div>
                </div>

                {/* Context 6: Small Favicon (16×16 Browser Tab) */}
                <div className="rounded-xl border border-theme-subtle bg-theme-canvas p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-theme-primary flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-emerald-500" />
                      6. Small Favicon (16×16 Browser Tabs — Dark &amp; Light)
                    </span>
                    <span className="font-mono text-[11px] text-theme-muted">
                      16px Optical Simplification
                    </span>
                  </div>
                  <div className="space-y-2">
                    {/* Dark Browser Tab */}
                    <div className="rounded-lg bg-[#0A1612] border border-white/10 p-2.5 flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-md bg-[#132A21] border border-white/10 flex items-center gap-2 text-xs text-[#F2F7F4]">
                        <LocalDeskLogo variant="app-icon" pixelSize={16} />
                        <span className="font-medium truncate">
                          Local Desk — All-in-One PDF Workspace
                        </span>
                        <X className="w-3 h-3 text-[#86A89B]" />
                      </div>
                    </div>
                    {/* Light Browser Tab */}
                    <div className="rounded-lg bg-[#E4ECE8] border border-[#0D1F18]/10 p-2.5 flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-md bg-white border border-[#0D1F18]/10 flex items-center gap-2 text-xs text-[#0D1F18]">
                        <LocalDeskLogo variant="app-icon" pixelSize={16} />
                        <span className="font-medium truncate">
                          Local Desk — All-in-One PDF Workspace
                        </span>
                        <X className="w-3 h-3 text-[#658075]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'geometry' && (
            <section className="space-y-8">
              {/* Symbol Geometry Specification */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-5 rounded-xl bg-[#0D1F18] border border-[#34D399]/25 p-8 flex flex-col items-center justify-center relative">
                  <LocalDeskLogo variant="app-icon" pixelSize={160} />
                  <div className="mt-5 text-center space-y-1">
                    <div className="text-xs font-mono text-[#34D399] font-semibold">
                      64×64 MASTER ARCHITECTURAL GRID
                    </div>
                    <div className="text-[11px] font-mono text-[#A3BEB3]">
                      L-Datum: 9.5px stroke · Channel: 4.5px uniform · Sheet: 22×22px
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                    Refined Symbol Construction
                  </div>
                  <h3 className="text-base font-extrabold text-theme-primary">
                    Uniform 4.5px Negative-Space Channel &amp; Balanced Proportions
                  </h3>
                  <p className="text-xs text-theme-secondary leading-relaxed">
                    The symbol has been mathematically recalibrated on a 64×64 coordinate grid so
                    every stroke, corner radius, and negative-space channel locks into a unified
                    visual rhythm:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-lg border border-theme-subtle bg-theme-canvas space-y-1">
                      <div className="font-bold text-theme-primary">1. Uniform 4.5px Channel</div>
                      <p className="text-theme-secondary text-[11px] leading-relaxed">
                        Both the vertical gap (<code className="font-mono">x: 23.5 → 28</code>) and
                        horizontal gap (<code className="font-mono">y: 36 → 40.5</code>) measure
                        exactly 4.5px, eliminating the previous 4px/2px asymmetry.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-lg border border-theme-subtle bg-theme-canvas space-y-1">
                      <div className="font-bold text-theme-primary">2. 1:1 Document Plane</div>
                      <p className="text-theme-secondary text-[11px] leading-relaxed">
                        The active document sheet occupies an exact 22×22px square (
                        <code className="font-mono">x: 28..50, y: 14..36</code>) with a crisp 9×9px
                        45° corner fold.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-lg border border-theme-subtle bg-theme-canvas space-y-1">
                      <div className="font-bold text-theme-primary">3. Grounded L-Frame Datum</div>
                      <p className="text-theme-secondary text-[11px] leading-relaxed">
                        9.5px structural L-beam anchors the bottom-left quadrant, representing the
                        private local hardware desk.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-lg border border-theme-subtle bg-theme-canvas space-y-1">
                      <div className="font-bold text-theme-primary">
                        4. Small-Size Simplification (≤24px)
                      </div>
                      <p className="text-theme-secondary text-[11px] leading-relaxed">
                        At 16px and 24px, dual internal lines automatically collapse into a single
                        3.4px high-contrast bar to prevent sub-pixel blur.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 16px to 256px Live Scale Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                    Multi-Resolution Legibility Verification (16px → 256px)
                  </span>
                  <span className="text-xs font-mono text-theme-muted">
                    Tested at 16, 24, 32, 48, 64, 128 &amp; 256px
                  </span>
                </div>

                <div className="rounded-xl border border-theme-subtle bg-[#0D1F18] p-6 overflow-x-auto">
                  <div className="flex items-end justify-between gap-6 min-w-[720px]">
                    {ICON_TEST_SIZES.map((sz) => (
                      <div key={sz} className="flex flex-col items-center gap-3">
                        <div className="flex items-center justify-center">
                          <LocalDeskLogo variant="app-icon" pixelSize={sz} />
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-mono font-bold text-[#F2F7F4]">
                            {sz}×{sz}px
                          </div>
                          <div className="text-[10px] font-mono text-[#86A89B]">
                            {sz <= 24 ? 'Simplified Micro' : 'Full Detail'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'assets' && (
            <section className="space-y-8">
              {/* SVG Vector Downloads */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                    Production SVG Vector Assets (/public/brand/*.svg)
                  </span>
                  <span className="text-xs font-mono text-theme-muted">
                    Clean W3C SVG · Zero External Dependencies
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {SVG_ASSETS.map((asset) => (
                    <div
                      key={asset.id}
                      className="p-4 rounded-xl border border-theme-subtle bg-theme-canvas flex flex-col justify-between gap-4"
                    >
                      <div>
                        <h4 className="text-xs font-bold text-theme-primary">{asset.title}</h4>
                        <p className="text-[11px] text-theme-secondary mt-1">{asset.desc}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-theme-subtle">
                        <span className="text-[10px] font-mono text-theme-muted">
                          {asset.filename}
                        </span>
                        <a
                          href={asset.path}
                          download={asset.filename}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#10B981]/15 text-emerald-600 dark:text-emerald-400 hover:bg-[#10B981] hover:text-[#062218] text-xs font-semibold transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          SVG
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transparent PNG Downloads */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                    Supersampled Transparent PNG Exports (/public/brand/png/*.png)
                  </span>
                  <span className="text-xs font-mono text-theme-muted">
                    16× Supersampled RGBA · Transparent Background
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {ICON_TEST_SIZES.map((sz) => (
                    <a
                      key={sz}
                      href={`/brand/png/local-desk-app-icon-${sz}x${sz}.png`}
                      download={`local-desk-app-icon-${sz}x${sz}.png`}
                      className="p-3 rounded-xl border border-theme-subtle bg-theme-canvas hover:border-emerald-500/50 transition-colors flex flex-col items-center gap-2 text-center group"
                    >
                      <div className="w-12 h-12 rounded-lg bg-[#0D1F18] flex items-center justify-center">
                        <LocalDeskLogo variant="app-icon" pixelSize={Math.min(sz, 36)} />
                      </div>
                      <div className="text-xs font-mono font-bold text-theme-primary">
                        {sz}×{sz} PNG
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 group-hover:underline flex items-center gap-1">
                        <Download className="w-3 h-3" /> Download
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
