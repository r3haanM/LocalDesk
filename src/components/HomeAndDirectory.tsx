import React, { useState, useRef, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import {
  PdfToolDefinition,
  ToolCategory,
  ConversionSubcategory,
  UploadedFileItem,
  ThemeSettings,
  UserAccountProfile
} from '../types/pdf';
import {
  PDF_TOOLS_CATALOG,
  CONVERSION_SUBCATEGORY_LABELS,
  findToolById
} from '../data/toolsCatalog';
import { validateFileSignature } from '../services/pdfRenderer';
import { ToolIcon } from './IconMapper';
import { PDFDocument } from 'pdf-lib';
import {
  Search,
  Upload,
  Sparkles,
  FileEdit,
  Layers,
  SlidersHorizontal,
  ArrowUpRight,
  Lock,
  Unlock,
  FileText,
  LayoutGrid,
  ShieldCheck,
  Sheet,
  Image
} from 'lucide-react';

gsap.registerPlugin(Flip);

interface HomeAndDirectoryProps {
  initialCategory?: ToolCategory | 'all';
  onSelectTool: (tool: PdfToolDefinition, preloadFiles?: UploadedFileItem[]) => void;
  onOpenEditorWithSample: () => void;
  onOpenCommandPalette: () => void;
  onOpenSettingsModal: () => void;
  onOpenBrandModal?: () => void;
  theme: ThemeSettings;
  account: UserAccountProfile | null;
}

type StudioFilterGroup =
  | 'all'
  | 'convert-all'
  | 'pdf-to-office'
  | 'pdf-to-images-web'
  | 'formats-to-pdf'
  | 'archival'
  | 'edit'
  | 'organize'
  | 'security-batch';

const STUDIO_FILTERS: Array<{ id: StudioFilterGroup; label: string; count: number }> = [
  { id: 'all', label: 'All Studio Tools', count: PDF_TOOLS_CATALOG.length },
  {
    id: 'convert-all',
    label: 'All 13 Conversions',
    count: PDF_TOOLS_CATALOG.filter((t) => Boolean(t.conversionSubcategory)).length
  },
  {
    id: 'pdf-to-office',
    label: 'PDF to Office',
    count: PDF_TOOLS_CATALOG.filter((t) => t.conversionSubcategory === 'pdf-to-office').length
  },
  {
    id: 'pdf-to-images-web',
    label: 'PDF to Images & Web',
    count: PDF_TOOLS_CATALOG.filter((t) => t.conversionSubcategory === 'pdf-to-images-web').length
  },
  {
    id: 'formats-to-pdf',
    label: 'Other Formats to PDF',
    count: PDF_TOOLS_CATALOG.filter((t) => t.conversionSubcategory === 'formats-to-pdf').length
  },
  {
    id: 'archival',
    label: 'Archival (PDF/A)',
    count: PDF_TOOLS_CATALOG.filter((t) => t.conversionSubcategory === 'archival').length
  },
  {
    id: 'edit',
    label: 'Edit & Objects',
    count: PDF_TOOLS_CATALOG.filter((t) => t.category === 'edit-pdf').length
  },
  {
    id: 'organize',
    label: 'Organize Pages',
    count: PDF_TOOLS_CATALOG.filter((t) => t.category === 'organize-pdf').length
  },
  {
    id: 'security-batch',
    label: 'Security & Batch',
    count: PDF_TOOLS_CATALOG.filter(
      (t) => t.category === 'pdf-security' || t.category === 'optimize-pdf'
    ).length
  }
];

function matchesStudioGroup(tool: PdfToolDefinition, group: StudioFilterGroup): boolean {
  if (group === 'all') return true;
  if (group === 'convert-all') return Boolean(tool.conversionSubcategory);
  if (
    group === 'pdf-to-office' ||
    group === 'pdf-to-images-web' ||
    group === 'formats-to-pdf' ||
    group === 'archival'
  ) {
    return tool.conversionSubcategory === group;
  }
  if (group === 'edit') return tool.category === 'edit-pdf';
  if (group === 'organize') return tool.category === 'organize-pdf';
  if (group === 'security-batch') {
    return tool.category === 'pdf-security' || tool.category === 'optimize-pdf';
  }
  return true;
}

/**
 * Clean 2D Editorial Tool Card
 */
const SpatialToolCard: React.FC<{
  tool: PdfToolDefinition;
  index: number;
  onSelect: (tool: PdfToolDefinition) => void;
}> = ({ tool, index, onSelect }) => {
  const badgeLabel = tool.conversionSubcategoryLabel || tool.categoryLabel;

  return (
    <button
      type="button"
      data-flip-id={tool.id}
      onClick={() => onSelect(tool)}
      className="tool-flip-card group relative text-left p-5 rounded-xl bg-theme-surface border border-theme-subtle hover:border-theme-accent transition-colors flex flex-col justify-between gap-4 cursor-pointer overflow-hidden shadow-xs"
    >
      <div className="relative z-10 space-y-3">
        {/* Top Row: Icon + Editorial Index */}
        <div className="flex items-center justify-between gap-2">
          <div className="p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-accent group-hover:border-theme-accent/50 transition-colors">
            <ToolIcon name={tool.iconName} className="w-5 h-5" />
          </div>
          <span className="text-xs font-mono text-theme-muted tabular-nums">
            {String(index + 1).padStart(2, '0')} · {badgeLabel}
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
            : 'Open Converter'}
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
  onOpenBrandModal,
  theme,
  account
}) => {
  const mapCategoryToStudioGroup = (cat: ToolCategory | 'all'): StudioFilterGroup => {
    if (cat === 'edit-pdf') return 'edit';
    if (cat === 'organize-pdf') return 'organize';
    if (cat === 'pdf-security' || cat === 'optimize-pdf') return 'security-batch';
    if (cat === 'convert-to-pdf' || cat === 'convert-from-pdf') return 'convert-all';
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
      tool.conversionSubcategoryLabel || '',
      ...tool.keywords
    ]
      .join(' ')
      .toLowerCase();
    return q.split(/\s+/).every((tok) => hay.includes(tok));
  });

  // Detect staged file formats for contextual Hero actions
  const hasWordFiles = heroFiles.some((f) => f.name.toLowerCase().endsWith('.docx'));
  const hasExcelFiles = heroFiles.some((f) => /\.(xlsx|csv)$/i.test(f.name));
  const hasPptFiles = heroFiles.some((f) => f.name.toLowerCase().endsWith('.pptx'));
  const hasHtmlFiles = heroFiles.some((f) => /\.(html|htm)$/i.test(f.name));
  const hasJpgFiles = heroFiles.some((f) => /\.(jpg|jpeg)$/i.test(f.name));
  const hasPngFiles = heroFiles.some((f) => f.name.toLowerCase().endsWith('.png'));
  const hasPdfFiles = heroFiles.some((f) => f.name.toLowerCase().endsWith('.pdf'));

  const conversionSubcategoryOrder: ConversionSubcategory[] = [
    'pdf-to-office',
    'pdf-to-images-web',
    'formats-to-pdf',
    'archival'
  ];

  return (
    <div className="relative space-y-20 pb-20">

      {/* ========================================================= */}
      {/* 1. CENTERED EDITORIAL HERO + MAGNETIC DROPZONE            */}
      {/* ========================================================= */}
      <section className="relative z-10 border-b border-theme-subtle pt-10 pb-16">
        <div className="max-w-[1440px] mx-auto px-6 space-y-12">
          {/* Top Utility Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-theme-subtle text-xs">
            <div className="flex items-center gap-2 text-theme-secondary">
              <span>ISO 32000 &amp; ISO 19005 PDF/A Architecture</span>
              <span aria-hidden="true">·</span>
              <span>13 Bidirectional Conversion Engines</span>
              <span aria-hidden="true">·</span>
              <span>Direct 2D Canvas Object Manipulation</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="inline-flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-theme-surface/90 border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-strong transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-theme-accent" />
                <span>Quick Switch Tool...</span>
                <kbd className="font-mono text-[11px] text-theme-muted pl-2 border-l border-theme-subtle">
                  Ctrl K
                </kbd>
              </button>

              {onOpenBrandModal && (
                <button
                  type="button"
                  onClick={onOpenBrandModal}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-surface/90 border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-accent transition-colors cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-theme-accent" />
                  <span>Brand System</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenSettingsModal}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-surface/90 border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-strong transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-theme-accent" />
                <span className="capitalize">Appearance: {theme.appearance}</span>
                {account && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-theme-primary font-semibold">{account.name}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Wide Editorial Hero & Dropzone */}
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <div className="text-xs font-mono text-theme-accent tracking-wider uppercase">
              Local Desk · Privacy-First Desktop Document Studio · 2D Canvas Editor · 13-Tool Conversion Suite
            </div>

            <h1
              style={{ fontSize: 'clamp(2.5rem, 4.8vw, 4.25rem)', textWrap: 'balance' } as React.CSSProperties}
              className="font-extrabold tracking-tight text-theme-primary leading-[1.06]"
            >
              Precision PDF Engineering, Conversion &amp; Canvas Control.
            </h1>

            <p className="text-base sm:text-lg text-theme-secondary max-w-2xl mx-auto leading-relaxed">
              Manipulate PDF objects directly on a Figma-grade 2D canvas, or convert seamlessly between PDF, Word, Excel, PowerPoint, JPG, PNG, HTML5, and ISO 19005 PDF/A.
            </p>
          </div>

          {/* Magnetic Interactive Upload Dropzone */}
          <motion.div
            animate={{
              scale: isDropzoneDragging ? 1.01 : 1,
              borderColor: isDropzoneDragging ? 'rgba(16, 185, 129, 0.9)' : undefined
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
            className="max-w-4xl mx-auto p-7 rounded-2xl bg-theme-surface/95 border border-theme-strong space-y-5 shadow-2xl"
          >
            <input
              ref={heroFileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.csv,.pptx,.html,.htm,.jpg,.jpeg,.png"
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
                  className="space-y-5"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="p-3.5 rounded-xl bg-theme-elevated border border-theme-subtle text-theme-accent shrink-0">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-theme-primary">
                          Drop PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), HTML, or Images Here
                        </h2>
                        <p className="text-xs text-theme-secondary mt-1">
                          Automatically routes your file to the 2D PDF Editor, Office/Image/PDF-A Converter, or Batch Security Queue.
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
                        Open Sample in 2D PDF Editor
                      </button>
                    </div>
                  </div>

                  {/* Quick Direct Workflow Launch Bar */}
                  <div className="pt-4 border-t border-theme-subtle flex flex-wrap items-center justify-between gap-2 text-xs text-theme-secondary">
                    <span>Direct Studio Workspaces:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={onOpenEditorWithSample}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle hover:border-theme-accent hover:text-theme-primary cursor-pointer"
                      >
                        <FileEdit className="w-3.5 h-3.5 text-theme-accent" />
                        <span>2D Object &amp; Shape Editor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectTool(findToolById('pdf-to-word')!, [])}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle hover:border-theme-accent hover:text-theme-primary cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-theme-accent" />
                        <span>PDF to Word (.docx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectTool(findToolById('pdf-to-excel')!, [])}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle hover:border-theme-accent hover:text-theme-primary cursor-pointer"
                      >
                        <Sheet className="w-3.5 h-3.5 text-emerald-400" />
                        <span>PDF to Excel (.xlsx)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectTool(findToolById('pdf-to-pdfa')!, [])}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle hover:border-theme-accent hover:text-theme-primary cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        <span>PDF to PDF/A Archival</span>
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
                      {heroFiles.map((f) => f.name).join(', ').slice(0, 64)}
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
                    Choose a conversion or editing workspace for your staged file(s):
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {hasPdfFiles && (
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
                          onClick={() => onSelectTool(findToolById('pdf-to-word')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-theme-accent" />
                          PDF to Word (.docx)
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('pdf-to-excel')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <Sheet className="w-3.5 h-3.5 text-emerald-400" />
                          PDF to Excel (.xlsx)
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('pdf-to-ppt')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          PDF to PowerPoint (.pptx)
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('pdf-to-jpg')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <Image className="w-3.5 h-3.5 text-theme-accent" />
                          PDF to JPG
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('pdf-to-png')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          PDF to PNG
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('pdf-to-pdfa')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                          PDF to PDF/A
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
                        Convert Word (.docx) to PDF
                      </button>
                    )}

                    {hasExcelFiles && (
                      <button
                        type="button"
                        onClick={() => onSelectTool(findToolById('excel-to-pdf')!, heroFiles)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
                      >
                        <Sheet className="w-3.5 h-3.5" />
                        Convert Excel (.xlsx) to PDF
                      </button>
                    )}

                    {hasPptFiles && (
                      <button
                        type="button"
                        onClick={() => onSelectTool(findToolById('ppt-to-pdf')!, heroFiles)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
                      >
                        Convert PowerPoint (.pptx) to PDF
                      </button>
                    )}

                    {hasJpgFiles && (
                      <button
                        type="button"
                        onClick={() => onSelectTool(findToolById('jpg-to-pdf')!, heroFiles)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
                      >
                        <Image className="w-3.5 h-3.5" />
                        Convert JPG to PDF
                      </button>
                    )}

                    {hasPngFiles && (
                      <button
                        type="button"
                        onClick={() => onSelectTool(findToolById('png-to-pdf')!, heroFiles)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
                      >
                        <Image className="w-3.5 h-3.5" />
                        Convert PNG to PDF
                      </button>
                    )}

                    {hasHtmlFiles && (
                      <button
                        type="button"
                        onClick={() => onSelectTool(findToolById('html-to-pdf')!, heroFiles)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
                      >
                        Convert HTML to PDF
                      </button>
                    )}

                    {hasPdfFiles && (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('protect-pdf')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5 text-emerald-400" />
                          Password-Protect
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectTool(findToolById('unlock-pdf')!, heroFiles)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5 text-amber-400" />
                          Unlock PDF
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. DEDICATED 4-SUBCATEGORY CONVERSION SUITE ARCHITECTURE  */}
      {/* ========================================================= */}
      <section id="conversion-suite" className="relative z-10 max-w-[1440px] mx-auto px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-theme-subtle pb-5">
          <div className="space-y-1.5">
            <div className="text-xs font-mono text-theme-accent uppercase tracking-wider">
              01 · BIDIRECTIONAL CONVERSION ARCHITECTURE (13 TOOLS)
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-theme-primary">
              Format-Accurate Document &amp; Archival Conversion Suite.
            </h2>
            <p className="text-sm text-theme-secondary max-w-2xl">
              Organized into four dedicated subcategories: PDF to Office, PDF to Images &amp; Web, Other Formats to PDF, and ISO 19005 PDF/A Archival Conversion.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {conversionSubcategoryOrder.map((subKey, sIdx) => {
            const subTools = PDF_TOOLS_CATALOG.filter(
              (t) => t.conversionSubcategory === subKey
            );
            return (
              <div
                key={subKey}
                className="p-5 rounded-2xl bg-theme-surface/95 border border-theme-subtle flex flex-col justify-between space-y-4 shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-theme-subtle pb-2.5">
                    <span className="text-xs font-mono text-theme-accent font-bold">
                      0{sIdx + 1} · {CONVERSION_SUBCATEGORY_LABELS[subKey]}
                    </span>
                    <span className="text-[11px] font-mono text-theme-muted">
                      {subTools.length} {subTools.length === 1 ? 'Tool' : 'Tools'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {subTools.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => onSelectTool(tool, [])}
                        className="w-full group p-3 rounded-xl bg-theme-elevated/80 border border-theme-subtle hover:border-theme-accent text-left transition-all flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-accent shrink-0">
                            <ToolIcon name={tool.iconName} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-theme-primary group-hover:text-theme-accent truncate">
                              {tool.shortName}
                            </div>
                            <div className="text-[10px] font-mono text-theme-muted truncate">
                              {tool.acceptedExtensions[0]} → {tool.outputExtension}
                            </div>
                          </div>
                        </div>
                        <ArrowUpRight className="w-3.5 h-3.5 text-theme-muted group-hover:text-theme-accent shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. COMPLETE STUDIO DIRECTORY GRID (GSAP FLIP + 3D TILT)   */}
      {/* ========================================================= */}
      <section id="tool-directory" className="relative z-10 max-w-[1440px] mx-auto px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-theme-subtle pb-6">
          <div className="space-y-2">
            <div className="text-xs font-mono text-theme-accent">
              02 · COMPLETE STUDIO DIRECTORY ({PDF_TOOLS_CATALOG.length} VERIFIED TOOLS)
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-theme-primary">
              Direct Canvas Editing, Page Physics, Conversions &amp; Security.
            </h2>
            <p className="text-sm text-theme-secondary max-w-2xl">
              Filter by conversion subcategory, direct object editing, page organization, or batch security.
            </p>
          </div>

          {/* Live Filter Search Input */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={dirSearch}
              onChange={(e) => setDirSearch(e.target.value)}
              placeholder="Filter tools (e.g. excel, pdf/a, word)..."
              aria-label="Filter studio tools"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-theme-surface/90 border border-theme-subtle text-xs text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-theme-accent"
            />
          </div>
        </div>

        {/* Motion Shared-Layout Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-theme-surface/90 border border-theme-subtle w-fit">
          {STUDIO_FILTERS.map((tab) => {
            const active = selectedGroup === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleFilterChange(tab.id)}
                className={`relative px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
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
                      active ? 'opacity-85' : 'text-theme-muted'
                    }`}
                  >
                    {tab.count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Tool Grid with 3D Perspective Tilt & GSAP Flip Reflow */}
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
      {/* 4. STUDIO CAPABILITIES & SPRING REORDER SHOWCASE BANNER   */}
      {/* ========================================================= */}
      <section id="how-it-works" className="relative z-10 max-w-[1440px] mx-auto px-6">
        <div className="p-8 rounded-2xl bg-theme-surface/95 border border-theme-subtle grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-xl">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-mono text-theme-accent">
              03 · 2D PRECISION WORKSPACE + DIRECT OBJECT CONTROL
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-theme-primary">
              Figma-Grade Object Manipulation on Real PDF Streams.
            </h2>
            <p className="text-sm text-theme-secondary leading-relaxed max-w-2xl">
              Step into our 2D PDF Editor to select, drag, resize from 8 handles, rotate, align, group, cover with background blur, or permanently delete native PDF text and vector objects—backed by faithful PDF stream export.
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
                Open Multi-File Batch Queue
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 grid grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-xl bg-theme-elevated border border-theme-subtle space-y-1.5">
              <div className="font-mono text-theme-accent font-bold tabular-nums">01 · 8-Handle Transform</div>
              <div className="font-bold text-theme-primary">Direct Object Editing</div>
              <p className="text-theme-secondary leading-relaxed">
                Forgiving 8-way resize handles, top rotation handle, smart snap guides, and multi-select align.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-theme-elevated border border-theme-subtle space-y-1.5">
              <div className="font-mono text-amber-400 font-bold tabular-nums">02 · 13 Conversions</div>
              <div className="font-bold text-theme-primary">Office, Web &amp; PDF/A</div>
              <p className="text-theme-secondary leading-relaxed">
                Convert between PDF, Word, Excel, PowerPoint, JPG, PNG, HTML5, and ISO 19005 PDF/A.
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
