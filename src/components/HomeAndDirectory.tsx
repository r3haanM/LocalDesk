import React, { useState, useRef, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import {
  PdfToolDefinition,
  ToolCategory,
  UploadedFileItem,
  ThemeSettings,
  UserAccountProfile
} from '../types/pdf';
import {
  PDF_TOOLS_CATALOG,
  findToolById
} from '../data/toolsCatalog';
import {
  validateFileSignature
} from '../services/pdfRenderer';
import { ToolIcon } from './IconMapper';
import { PDFDocument } from 'pdf-lib';
import {
  Search,
  Upload,
  Sparkles,
  FileEdit,
  Layers,
  ShieldAlert,
  SlidersHorizontal,
  ArrowUpRight,
  Lock,
  Unlock,
  FileText,
  LayoutGrid
} from 'lucide-react';

gsap.registerPlugin(Flip);

const ThreeHeroStage = React.lazy(() =>
  import('./Three/ThreeHeroStage').then((m) => ({ default: m.ThreeHeroStage }))
);

interface HomeAndDirectoryProps {
  initialCategory?: ToolCategory | 'all';
  onSelectTool: (tool: PdfToolDefinition, preloadFiles?: UploadedFileItem[]) => void;
  onOpenEditorWithSample: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettingsModal: () => void;
  theme: ThemeSettings;
  account: UserAccountProfile | null;
}

type StudioFilterGroup = 'all' | 'edit' | 'organize' | 'security-batch' | 'word-convert';

const STUDIO_FILTERS: Array<{ id: StudioFilterGroup; label: string; count: number }> = [
  { id: 'all', label: 'All 12 Core Tools', count: 12 },
  { id: 'edit', label: 'Edit & Objects', count: 2 },
  { id: 'organize', label: 'Organize & Reorder', count: 3 },
  { id: 'security-batch', label: 'Security & Batch Queue', count: 5 },
  { id: 'word-convert', label: 'Word & PDF Convert', count: 2 }
];

function matchesStudioGroup(tool: PdfToolDefinition, group: StudioFilterGroup): boolean {
  if (group === 'all') return true;
  if (group === 'edit') return tool.category === 'edit-pdf';
  if (group === 'organize') return tool.category === 'organize-pdf';
  if (group === 'security-batch') {
    return tool.category === 'pdf-security' || tool.category === 'optimize-pdf';
  }
  if (group === 'word-convert') {
    return tool.category === 'convert-to-pdf' || tool.category === 'convert-from-pdf';
  }
  return true;
}

/**
 * Homepage-Exclusive 3D Spatial Perspective Tilt Card
 */
const SpatialToolCard: React.FC<{
  tool: PdfToolDefinition;
  index: number;
  onSelect: (tool: PdfToolDefinition) => void;
}> = ({ tool, index, onSelect }) => {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number; gx: number; gy: number; active: boolean }>({
    rx: 0,
    ry: 0,
    gx: 50,
    gy: 50,
    active: false
  });

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const ry = (px - 0.5) * 11;
    const rx = (0.5 - py) * 11;
    setTilt({
      rx,
      ry,
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
      active: true
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50, active: false });
  };

  return (
    <button
      ref={cardRef}
      type="button"
      data-flip-id={tool.id}
      onClick={() => onSelect(tool)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        transform: tilt.active
          ? `perspective(900px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg) translateY(-3px)`
          : 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)',
        transition: tilt.active
          ? 'transform 70ms linear, border-color 160ms ease'
          : 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms ease'
      }}
      className="tool-flip-card group relative text-left p-5 rounded-xl bg-theme-surface border border-theme-subtle hover:border-theme-accent flex flex-col justify-between gap-4 cursor-pointer overflow-hidden"
    >
      {/* Dynamic 3D Specular Cursor Highlight */}
      <div
        aria-hidden="true"
        style={{
          opacity: tilt.active ? 1 : 0,
          background: `radial-gradient(320px circle at ${tilt.gx}% ${tilt.gy}%, rgba(124, 58, 237, 0.14), transparent 70%)`
        }}
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
      />

      <div className="relative z-10 space-y-3">
        {/* Top Row: Icon + Editorial Index */}
        <div className="flex items-center justify-between gap-2">
          <div className="p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-accent group-hover:border-violet-500/40 transition-colors">
            <ToolIcon name={tool.iconName} className="w-5 h-5" />
          </div>
          <span className="text-xs font-mono text-theme-muted tabular-nums">
            {String(index + 1).padStart(2, '0')} · {tool.categoryLabel}
          </span>
        </div>

        {/* Title & Concise Outcome Description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-theme-primary group-hover:text-theme-accent transition-colors">
              {tool.name}
            </h3>
            <ArrowUpRight className="w-4 h-4 text-theme-muted group-hover:text-theme-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
          </div>
          <p className="text-xs text-theme-secondary leading-relaxed line-clamp-2">
            {tool.description}
          </p>
        </div>
      </div>

      {/* Bottom Unboxed Metadata Row (Zero-Pill Discipline) */}
      <div className="relative z-10 pt-3 border-t border-theme-subtle flex items-center justify-between text-[11px] text-theme-muted font-mono">
        <span>
          {tool.acceptedExtensions.slice(0, 3).join(', ')} → {tool.outputExtension}
        </span>
        <span className="text-theme-secondary group-hover:text-theme-primary font-sans font-semibold">
          {tool.workspaceType === 'editor'
            ? 'Open 2D Studio'
            : tool.workspaceType === 'batch'
            ? 'Launch Batch Queue'
            : 'Open Workspace'}
        </span>
      </div>
    </button>
  );
};

export const HomeAndDirectory: React.FC<HomeAndDirectoryProps> = ({
  initialCategory = 'all',
  onSelectTool,
  onOpenEditorWithSample,
  onOpenCommandPalette,
  onOpenSettingsModal,
  theme,
  account
}) => {
  const mapCategoryToStudioGroup = (cat: ToolCategory | 'all'): StudioFilterGroup => {
    if (cat === 'edit-pdf') return 'edit';
    if (cat === 'organize-pdf') return 'organize';
    if (cat === 'pdf-security' || cat === 'optimize-pdf') return 'security-batch';
    if (cat === 'convert-to-pdf' || cat === 'convert-from-pdf') return 'word-convert';
    return 'all';
  };

  const [selectedGroup, setSelectedGroup] = useState<StudioFilterGroup>(() =>
    mapCategoryToStudioGroup(initialCategory)
  );
  const [dirSearch, setDirSearch] = useState<string>('');
  const [heroFiles, setHeroFiles] = useState<UploadedFileItem[]>([]);
  const [isDropzoneDragging, setIsDropzoneDragging] = useState<boolean>(false);

  const heroFileInputRef = useRef<HTMLInputElement | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const flipStateRef = useRef<Flip.FlipState | null>(null);

  const handleFilterChange = (nextGroup: StudioFilterGroup) => {
    if (gridContainerRef.current) {
      flipStateRef.current = Flip.getState(
        gridContainerRef.current.querySelectorAll('.tool-flip-card')
      );
    }
    setSelectedGroup(nextGroup);
  };

  // Run GSAP Flip animation whenever filtered tools change
  useEffect(() => {
    if (!flipStateRef.current || !gridContainerRef.current) return;
    Flip.from(flipStateRef.current, {
      duration: 0.24,
      ease: 'power3.out',
      stagger: 0.015,
      scale: true,
      simple: true
    });
    flipStateRef.current = null;
  }, [selectedGroup, dirSearch]);

  const handleHeroFileDrop = async (rawFiles: File[]) => {
    const processed: UploadedFileItem[] = [];
    for (const f of rawFiles) {
      const ab = await f.arrayBuffer();
      const sig = await validateFileSignature(ab, f.name);
      let pageCount: number | undefined;
      if (sig.detectedFormat.startsWith('PDF')) {
        try {
          const doc = await PDFDocument.load(ab, { ignoreEncryption: true });
          pageCount = doc.getPageCount();
        } catch {
          pageCount = 1;
        }
      }
      processed.push({
        id: `hero-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        name: f.name,
        size: f.size,
        type: f.type || 'application/pdf',
        pageCount,
        isValidSignature: sig.isValid,
        signatureLabel: sig.detectedFormat,
        addedAt: Date.now(),
        arrayBuffer: ab
      });
    }
    if (processed.length > 0) {
      setHeroFiles(processed);
    }
  };

  const filteredTools = PDF_TOOLS_CATALOG.filter((tool) => {
    if (!matchesStudioGroup(tool, selectedGroup)) return false;
    if (!dirSearch.trim()) return true;
    const q = dirSearch.trim().toLowerCase();
    const hay = [
      tool.name,
      tool.shortName,
      tool.description,
      tool.categoryLabel,
      ...tool.keywords
    ]
      .join(' ')
      .toLowerCase();
    return q.split(/\s+/).every((tok) => hay.includes(tok));
  });

  const hasWordFiles = heroFiles.some((f) => f.name.toLowerCase().endsWith('.docx'));

  return (
    <div className="space-y-20 pb-20">
      {/* ========================================================= */}
      {/* 1. HERO DROPZONE + INTERACTIVE 3D DOCUMENT STUDIO STAGE    */}
      {/* ========================================================= */}
      <section className="relative overflow-hidden border-b border-theme-subtle pt-10 pb-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[920px] h-[420px] rounded-full bg-violet-600/12 blur-[130px]"
        />

        <div className="max-w-[1440px] mx-auto px-6 relative z-10 space-y-10">
          {/* Top Utility Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-theme-subtle text-xs">
            <div className="flex items-center gap-2 text-theme-secondary">
              <span>ISO 32000 Document Architecture</span>
              <span aria-hidden="true">·</span>
              <span>12 Essential Core Utilities</span>
              <span aria-hidden="true">·</span>
              <span>100% Free &amp; Local-First</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="inline-flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-strong transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-theme-accent" />
                <span>Quick Switch Tool...</span>
                <kbd className="font-mono text-[11px] text-theme-muted pl-2 border-l border-theme-subtle">
                  Ctrl K
                </kbd>
              </button>

              <button
                type="button"
                onClick={onOpenSettingsModal}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-strong transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-theme-accent" />
                <span className="capitalize">Theme: {theme.preset}</span>
                {account && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-theme-primary font-semibold">{account.name}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Two-Column Hero Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Left Column: Editorial Headline + Magnetic Dropzone */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
              <div className="space-y-5">
                <div className="text-xs font-medium text-theme-secondary">
                  2D PDF Studio · Sajda Object Control · Spring Page Reordering · Batch Password Vault
                </div>

                <h1
                  style={{ fontSize: 'clamp(2.35rem, 4.2vw, 3.75rem)', textWrap: 'balance' } as React.CSSProperties}
                  className="font-extrabold tracking-tight text-theme-primary leading-[1.08]"
                >
                  Focused Document Engineering, Zero Clutter.
                </h1>

                <p className="text-base text-theme-secondary max-w-2xl leading-relaxed">
                  Explore your document layers in interactive 3D on the right, then step into our distraction-free 2D PDF Studio to edit native text, hide or purge PDF objects, drag-and-drop reorder pages with spring physics, or lock and unlock multiple files in one go.
                </p>
              </div>

              {/* Magnetic Interactive Upload Dropzone */}
              <motion.div
                animate={{
                  scale: isDropzoneDragging ? 1.015 : 1,
                  borderColor: isDropzoneDragging ? 'rgba(124, 58, 237, 0.9)' : undefined
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isDropzoneDragging) setIsDropzoneDragging(true);
                }}
                onDragLeave={() => setIsDropzoneDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDropzoneDragging(false);
                  if (e.dataTransfer.files?.length) {
                    handleHeroFileDrop(Array.from(e.dataTransfer.files));
                  }
                }}
                className="p-6 rounded-xl bg-theme-surface border border-theme-strong space-y-5 shadow-xl"
              >
                <input
                  ref={heroFileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      handleHeroFileDrop(Array.from(e.target.files));
                    }
                    e.target.value = '';
                  }}
                />

                <AnimatePresence mode="wait">
                  {heroFiles.length === 0 ? (
                    <motion.div
                      key="empty-dropzone"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.16 }}
                      className="space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          <div className="p-3 rounded-xl bg-theme-elevated border border-theme-subtle text-theme-accent shrink-0">
                            <Upload className="w-6 h-6" />
                          </div>
                          <div>
                            <h2 className="text-sm font-bold text-theme-primary">
                              Drop PDFs or Word (.docx) Files Here to Begin
                            </h2>
                            <p className="text-xs text-theme-secondary mt-0.5">
                              Dragging files over this box magnetizes the 3D Document Stack on the right.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => heroFileInputRef.current?.click()}
                            className="px-4 py-2.5 rounded-lg text-xs font-bold bg-theme-accent text-white hover:opacity-95 transition-opacity whitespace-nowrap cursor-pointer"
                          >
                            Select Files
                          </button>
                          <button
                            type="button"
                            onClick={onOpenEditorWithSample}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent transition-colors whitespace-nowrap cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
                            Open Sample in 2D Editor
                          </button>
                        </div>
                      </div>

                      {/* Quick Direct Workflow Launch Bar */}
                      <div className="pt-3 border-t border-theme-subtle flex flex-wrap items-center justify-between gap-2 text-xs text-theme-secondary">
                        <span>Instant Launch:</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectTool(findToolById('organize-pages')!, [])}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-theme-elevated border border-theme-subtle hover:text-theme-primary cursor-pointer"
                          >
                            <LayoutGrid className="w-3.5 h-3.5 text-theme-accent" />
                            <span>Spring Page Organizer</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectTool(findToolById('batch-process')!, [])}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-theme-elevated border border-theme-subtle hover:text-theme-primary cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Multi-Word &amp; PDF Password Queue</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectTool(findToolById('remove-objects')!, [])}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-theme-elevated border border-theme-subtle hover:text-theme-primary cursor-pointer"
                          >
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            <span>Sajda Object Manager</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="populated-dropzone"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
                        <div className="text-xs font-bold text-theme-primary font-mono tabular-nums">
                          {heroFiles.length} file(s) staged ·{' '}
                          {heroFiles.map((f) => f.name).join(', ').slice(0, 56)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setHeroFiles([])}
                          className="text-xs text-theme-secondary hover:text-rose-400 cursor-pointer"
                        >
                          Clear Staged Files
                        </button>
                      </div>

                      <div className="text-xs font-semibold text-theme-secondary">
                        Choose a workspace for your staged file(s):
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {!hasWordFiles && (
                          <>
                            <button
                              type="button"
                              onClick={() => onSelectTool(findToolById('edit-pdf')!, heroFiles)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                              Open in 2D PDF Editor
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectTool(findToolById('organize-pages')!, heroFiles)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                            >
                              <LayoutGrid className="w-3.5 h-3.5 text-theme-accent" />
                              Reorder &amp; Organize Pages
                            </button>
                          </>
                        )}

                        {hasWordFiles && (
                          <button
                            type="button"
                            onClick={() => onSelectTool(findToolById('word-to-pdf')!, heroFiles)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Convert Word to Protected PDF
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('protect-pdf')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5 text-emerald-400" />
                          Password-Protect All
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('unlock-pdf')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5 text-amber-400" />
                          Unlock All in One Go
                        </button>

                        {heroFiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onSelectTool(findToolById('merge-pdf')!, heroFiles)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                          >
                            Merge {heroFiles.length} PDFs
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Right Column: Interactive Three.js 3D Document Studio Stage (Homepage Exclusive) */}
            <Suspense
              fallback={
                <div className="lg:col-span-5 rounded-xl bg-theme-surface border border-theme-subtle min-h-[500px] flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-mono text-theme-secondary">
                    Initializing 3D Document Architecture Studio...
                  </p>
                </div>
              }
            >
              <ThreeHeroStage
                onLaunchEditorSample={onOpenEditorWithSample}
                onSelectToolById={(id) => {
                  const found = findToolById(id);
                  if (found) onSelectTool(found, []);
                }}
                isDropzoneActive={isDropzoneDragging}
              />
            </Suspense>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. CURATED 12-TOOL SPATIAL STUDIO GRID (GSAP FLIP + 3D)   */}
      {/* ========================================================= */}
      <section id="tool-directory" className="max-w-[1440px] mx-auto px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-theme-subtle pb-6">
          <div className="space-y-2">
            <div className="text-xs font-mono text-theme-accent">
              01 · CURATED 12-TOOL STUDIO
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-theme-primary">
              Every Essential Document Workflow, Zero Bloat.
            </h2>
            <p className="text-sm text-theme-secondary max-w-2xl">
              We pruned 24 redundant utilities so your most-used PDF editing, spring page organization, batch password protection, and Word conversion tools are always one click away.
            </p>
          </div>

          {/* Live Filter Search Input */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="Filter the 12 core tools..."
              aria-label="Filter the 12 core tools"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-xs text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-theme-accent"
            />
          </div>
        </div>

        {/* Motion Shared-Layout Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-theme-surface border border-theme-subtle w-fit">
          {STUDIO_FILTERS.map((tab) => {
            const active = selectedGroup === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange(tab.id)}
                className={`relative px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  active ? 'text-white' : 'text-theme-secondary hover:text-theme-primary'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="activeStudioFilterTab"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-theme-accent"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      active ? 'text-violet-200' : 'text-theme-muted'
                    }`}
                  >
                    {tab.count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* 12-Tool Grid with 3D Perspective Tilt & GSAP Flip Reflow */}
        <div
          ref={gridContainerRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          {filteredTools.map((tool, idx) => (
            <SpatialToolCard
              key={tool.id}
              tool={tool}
              index={idx}
              onSelect={(t) => onSelectTool(t, [])}
            />
          ))}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. STUDIO CAPABILITIES & SPRING REORDER SHOWCASE BANNER   */}
      {/* ========================================================= */}
      <section id="how-it-works" className="max-w-[1440px] mx-auto px-6">
        <div className="p-8 rounded-2xl bg-theme-surface border border-theme-subtle grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-mono text-theme-accent">
              02 · 2D PRECISION WORKSPACE + SPRING PHYSICS
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-theme-primary">
              Built for Fast, Tactile Multi-Page Editing.
            </h2>
            <p className="text-sm text-theme-secondary leading-relaxed max-w-2xl">
              While the Homepage uses Three.js WebGL to visualize PDF structure in 3D, our workspaces switch to a pure 2D canvas powered by Motion springs and GSAP Flip—giving you surgical accuracy for Sajda-style object hiding, genuine byte-stream redaction, and drag-and-drop page reordering.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onOpenEditorWithSample}
                className="px-4 py-2.5 rounded-lg text-xs font-bold bg-theme-accent text-white hover:opacity-95 transition-opacity cursor-pointer"
              >
                Launch 2D PDF Editor with Sample
              </button>
              <button
                type="button"
                onClick={() => onSelectTool(findToolById('batch-process')!, [])}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent transition-colors cursor-pointer"
              >
                Open Multi-File Password Queue
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-xl bg-theme-elevated border border-theme-subtle space-y-1.5">
              <div className="font-mono text-theme-accent font-bold tabular-nums">01 · Spring Drag</div>
              <div className="font-bold text-theme-primary">Visual Page Sorter</div>
              <p className="text-theme-secondary leading-relaxed">
                Reorder pages in the sidebar rail or full-screen grid with live spring displacement.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-theme-elevated border border-theme-subtle space-y-1.5">
              <div className="font-mono text-amber-400 font-bold tabular-nums">02 · Sajda Layers</div>
              <div className="font-bold text-theme-primary">Hide or Purge Objects</div>
              <p className="text-theme-secondary leading-relaxed">
                Non-destructively toggle visibility or permanently strip PDF operators on export.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-theme-elevated border border-theme-subtle space-y-1.5">
              <div className="font-mono text-emerald-400 font-bold tabular-nums">03 · One-Go Vault</div>
              <div className="font-bold text-theme-primary">Batch Word &amp; PDF Lock</div>
              <p className="text-theme-secondary leading-relaxed">
                Convert &amp; lock multiple Word files or unlock multiple protected PDFs at once.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-theme-elevated border border-theme-subtle space-y-1.5">
              <div className="font-mono text-rose-400 font-bold tabular-nums">04 · Zero AI</div>
              <div className="font-bold text-theme-primary">100% Local &amp; Free</div>
              <p className="text-theme-secondary leading-relaxed">
                Deterministic ISO 32000 processing with full guest parity and zero paywalls.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
