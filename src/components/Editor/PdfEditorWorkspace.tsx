import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { LocalDeskLogo } from '../Brand/LocalDeskLogo';
import { StudioLaunchTransition } from '../StudioLaunchTransition';
import { saveProcessedDocumentSafe } from '../../services/desktopBridge';
import {
  PdfEditableObject,
  PdfFontFamily,
  PdfPageDescriptor,
  PdfShapeKind,
  StrokeStyleKind,
  EditorHistorySnapshot,
  UploadedFileItem,
  OcrLanguageCode,
  OcrPreprocessMode,
  BgReconstructionMethod,
  ScannedExportMode,
  ScannedSamplePreset
} from '../../types/pdf';
import {
  parseDocumentIntoEditorModel,
  exportEditedPdfDocument,
  ExportVerificationReport
} from '../../services/pdfEditorEngine';
import {
  renderPdfPageToDataUrl,
  generateSamplePdfBytes
} from '../../services/pdfRenderer';
import {
  runScannedPageOcr,
  reconstructRegionBackground,
  getCachedPageCanvas,
  createSampleScannedEnglishPdf,
  fitReplacementTextToOcrGeometry,
  clientPointToPdfPagePoint,
  FONT_CANDIDATE_CATALOG,
  getFontCssStack,
  getFontDisplayName,
  generateTypographyComparisonCrops,
  reanalyzeObjectTypographyStyle
} from '../../services/scannedOcrEngine';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Search,
  Download,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ClipboardPaste,
  Plus,
  RotateCw,
  ArrowUp,
  ArrowDown,
  Type,
  Image as ImageIcon,
  Highlighter,
  PenTool,
  Square,
  Circle,
  ArrowUpRight,
  StickyNote,
  FormInput,
  Stamp,
  ShieldAlert,
  MousePointer,
  Layers,
  FileText,
  BookOpen,
  MessageSquare,
  Code2,
  CheckCircle2,
  Upload,
  Sparkles,
  GripVertical,
  LayoutGrid,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Hexagon,
  Minus,
  Eraser,
  Group,
  Ungroup,
  RefreshCw,
  X,
  ChevronDown,
  Pin,
  SlidersHorizontal,
  Hand
} from 'lucide-react';

gsap.registerPlugin(Flip);

export type EditorToolMode =
  | 'select'
  | 'pan'
  | 'edit-text'
  | 'add-text'
  | 'add-image'
  | 'cover-overlay'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'freehand'
  | 'highlight'
  | 'sticky-note'
  | 'form-field'
  | 'signature'
  | 'watermark'
  | 'redact';

export type ToolbarCategoryId =
  | 'select'
  | 'text'
  | 'images'
  | 'shapes'
  | 'effects'
  | 'arrange'
  | 'annotate'
  | 'page-design'
  | 'forms'
  | 'more';

const TOOLBAR_CATEGORY_ORDER: Array<{
  id: ToolbarCategoryId;
  label: string;
  shortDesc: string;
  icon: any;
}> = [
  { id: 'select', label: 'Select', shortDesc: 'Selection, transform & clipboard', icon: MousePointer },
  { id: 'text', label: 'Text', shortDesc: 'Add/edit text, typography & English OCR', icon: Type },
  { id: 'images', label: 'Images', shortDesc: 'Insert, replace, rotate & crop images', icon: ImageIcon },
  { id: 'shapes', label: 'Shapes', shortDesc: 'Rectangles, circles, polygons, lines & arrows', icon: Square },
  { id: 'effects', label: 'Effects', shortDesc: 'Cover overlays, blur, fill, opacity & shadow', icon: Sparkles },
  { id: 'arrange', label: 'Arrange', shortDesc: 'Layer order, multi-align, distribute & group', icon: Layers },
  { id: 'annotate', label: 'Annotate', shortDesc: 'Highlight, notes, callouts, ink, stamps & sign', icon: MessageSquare },
  { id: 'page-design', label: 'Page Design', shortDesc: 'Watermarks, headers, footers & page operations', icon: BookOpen },
  { id: 'forms', label: 'Forms', shortDesc: 'Interactive AcroForm fields & form flattening', icon: FormInput },
  { id: 'more', label: 'More', shortDesc: 'Permanent redaction, OCR diagnostics & stream', icon: SlidersHorizontal }
];

const TOOL_MODE_LABELS: Record<EditorToolMode, string> = {
  select: 'Select',
  pan: 'Pan Canvas',
  'edit-text': 'Edit Text',
  'add-text': 'Add Text',
  'add-image': 'Insert Image',
  'cover-overlay': 'Cover / Blur',
  rectangle: 'Rectangle',
  'rounded-rectangle': 'Rounded Rect',
  circle: 'Circle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  polygon: 'Polygon',
  freehand: 'Freehand Ink',
  highlight: 'Highlight',
  'sticky-note': 'Sticky Note',
  'form-field': 'Form Field',
  signature: 'Sign PDF',
  watermark: 'Watermark',
  redact: 'Redact'
};

function getCategoryForToolMode(mode: EditorToolMode): ToolbarCategoryId {
  switch (mode) {
    case 'select':
    case 'pan':
      return 'select';
    case 'edit-text':
    case 'add-text':
      return 'text';
    case 'add-image':
      return 'images';
    case 'rectangle':
    case 'rounded-rectangle':
    case 'circle':
    case 'ellipse':
    case 'line':
    case 'arrow':
    case 'polygon':
      return 'shapes';
    case 'cover-overlay':
      return 'effects';
    case 'highlight':
    case 'sticky-note':
    case 'freehand':
    case 'signature':
      return 'annotate';
    case 'watermark':
      return 'page-design';
    case 'form-field':
      return 'forms';
    case 'redact':
      return 'more';
    default:
      return 'select';
  }
}

type ResizeHandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface PdfEditorWorkspaceProps {
  initialFile: UploadedFileItem | null;
  initialMode?: EditorToolMode;
  initialSidebarTab?: 'pages' | 'objects' | 'outline' | 'annotations' | 'forms' | 'structure';
  onBack: () => void;
  onRecordHistory: (
    toolId: string,
    toolName: string,
    fileName: string,
    outName: string,
    outSize: number,
    summary: string
  ) => void;
}

const QUICK_COLOR_SWATCHES = [
  '#FFFFFF',
  '#F8FAFC',
  '#18181B',
  '#7C3AED',
  '#2563EB',
  '#10B981',
  '#F59E0B',
  '#E11D48',
  '#FEF08A',
  '#DDD6FE'
];

function computePolygonClipPath(sides = 5): string {
  const n = Math.max(3, Math.min(12, sides));
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
    const px = 50 + 50 * Math.cos(angle);
    const py = 50 + 50 * Math.sin(angle);
    pts.push(`${px.toFixed(1)}% ${py.toFixed(1)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}

/**
 * Computes the accurate Windows directional resize cursor ('ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize')
 * accounting for both object rotation and page rotation.
 */
function getResizeCursorForHandle(
  dir: ResizeHandleDir,
  objectRotationDeg = 0,
  pageRotationDeg = 0
): 'ns-resize' | 'nesw-resize' | 'ew-resize' | 'nwse-resize' {
  const baseAngles: Record<ResizeHandleDir, number> = {
    n: 0,
    ne: 45,
    e: 90,
    se: 135,
    s: 180,
    sw: 225,
    w: 270,
    nw: 315
  };
  const totalAngle = (((baseAngles[dir] + objectRotationDeg + pageRotationDeg) % 360) + 360) % 360;
  const sector = Math.round(totalAngle / 45) % 4;
  if (sector === 0) return 'ns-resize';
  if (sector === 1) return 'nesw-resize';
  if (sector === 2) return 'ew-resize';
  return 'nwse-resize';
}

export const PdfEditorWorkspace: React.FC<PdfEditorWorkspaceProps> = ({
  initialFile,
  initialMode = 'select',
  initialSidebarTab = 'objects',
  onBack,
  onRecordHistory
}) => {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [docName, setDocName] = useState<string>(
    initialFile?.name || 'LocalDesk_Architecture_Spec_2026.pdf'
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMsg, setLoadingMsg] = useState<string>('Parsing PDF object model...');

  const [pages, setPages] = useState<PdfPageDescriptor[]>([]);
  const [objects, setObjects] = useState<PdfEditableObject[]>([]);
  const [outline, setOutline] = useState<Array<{ title: string; pageNumber: number }>>([]);
  const [customBookmarks, setCustomBookmarks] = useState<Array<{ title: string; pageNumber: number }>>([]);
  const [hasXfa, setHasXfa] = useState<boolean>(false);

  const [currentPageIdx, setCurrentPageIdx] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1.0);
  const [toolMode, setToolMode] = useState<EditorToolMode>(initialMode);
  const [sidebarTab, setSidebarTab] = useState<
    'pages' | 'objects' | 'outline' | 'annotations' | 'forms' | 'structure'
  >(initialSidebarTab);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(false);

  // Category-Based Toolbar & Contextual Tool Panel State (Hover + Click/Pin)
  const [openCategory, setOpenCategory] = useState<ToolbarCategoryId | null>(null);
  const [pinnedCategory, setPinnedCategory] = useState<ToolbarCategoryId | null>(null);
  const toolbarContainerRef = useRef<HTMLDivElement | null>(null);
  const categoryBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hoverCloseTimeoutRef = useRef<number | null>(null);

  const clearHoverCloseTimeout = useCallback(() => {
    if (hoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  }, []);

  const closeToolbarPanel = useCallback(() => {
    clearHoverCloseTimeout();
    setOpenCategory(null);
    setPinnedCategory(null);
  }, [clearHoverCloseTimeout]);

  const handleCategoryPointerEnter = useCallback(
    (catId: ToolbarCategoryId, e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      clearHoverCloseTimeout();
      if (!pinnedCategory) {
        setOpenCategory(catId);
      }
    },
    [clearHoverCloseTimeout, pinnedCategory]
  );

  const handleToolbarAreaPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (pinnedCategory) return;
      clearHoverCloseTimeout();
      hoverCloseTimeoutRef.current = window.setTimeout(() => {
        setOpenCategory(null);
      }, 220);
    },
    [clearHoverCloseTimeout, pinnedCategory]
  );

  const handleCategoryClick = useCallback(
    (catId: ToolbarCategoryId) => {
      clearHoverCloseTimeout();
      if (pinnedCategory === catId && openCategory === catId) {
        setPinnedCategory(null);
        setOpenCategory(null);
      } else {
        setPinnedCategory(catId);
        setOpenCategory(catId);
      }
    },
    [clearHoverCloseTimeout, openCategory, pinnedCategory]
  );

  const selectToolAndCloseUnpinned = useCallback(
    (nextMode: EditorToolMode) => {
      setToolMode(nextMode);
      if (!pinnedCategory) {
        setOpenCategory(null);
      }
    },
    [pinnedCategory]
  );

  useEffect(() => {
    if (!openCategory) return;
    const handleOutsidePointerDown = (e: PointerEvent) => {
      if (
        toolbarContainerRef.current &&
        !toolbarContainerRef.current.contains(e.target as Node)
      ) {
        closeToolbarPanel();
      }
    };
    window.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => window.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [openCategory, closeToolbarPanel]);

  // Selection, Multi-selection, Inline Text Editing & Clipboard
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingTextObjId, setEditingTextObjId] = useState<string | null>(null);
  const [clipboardObjs, setClipboardObjs] = useState<PdfEditableObject[]>([]);
  const [objectFilter, setObjectFilter] = useState<
    | 'all'
    | 'ocr-text'
    | 'native-text'
    | 'native-shape'
    | 'added'
    | 'shapes'
    | 'forms'
    | 'redaction'
    | 'hidden'
  >('all');
  const [showHiddenOutlines, setShowHiddenOutlines] = useState<boolean>(true);
  const [applyHiddenToExport, setApplyHiddenToExport] = useState<boolean>(true);
  const [flattenFormsOnExport, setFlattenFormsOnExport] = useState<boolean>(false);

  // Scanned PDF & OCR Engine State (English-Only OCR + Exact Coordinate + Font Matching Pipeline)
  const [showScannedDetectionPrompt, setShowScannedDetectionPrompt] = useState<boolean>(false);
  const [ocrLanguage] = useState<OcrLanguageCode>('eng');
  const [ocrPreprocessMode, setOcrPreprocessMode] = useState<OcrPreprocessMode>('auto-enhance');
  const [scannedExportMode, setScannedExportMode] = useState<ScannedExportMode>('visually-edited');
  const [ocrRunning, setOcrRunning] = useState<boolean>(false);
  const [ocrProgressText, setOcrProgressText] = useState<string>('');
  const [ocrProgressPct, setOcrProgressPct] = useState<number>(0);
  const [showOcrBoundaries, setShowOcrBoundaries] = useState<boolean>(true);
  const [showOcrCoordinateDebug, setShowOcrCoordinateDebug] = useState<boolean>(false);
  const [compareOriginalScan, setCompareOriginalScan] = useState<boolean>(false);
  const [isSampleEnglishDocLoaded, setIsSampleEnglishDocLoaded] = useState<boolean>(false);
  const [samplePreset, setSamplePreset] = useState<ScannedSamplePreset>('receipt-monospaced');
  const ocrCancelRef = useRef<boolean>(false);

  // Smart alignment snap guides during drag/resize
  const [snapGuides, setSnapGuides] = useState<{ vertical: number[]; horizontal: number[] }>({
    vertical: [],
    horizontal: []
  });

  // Undo / Redo History
  const [history, setHistory] = useState<EditorHistorySnapshot[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [saveStatus, setSaveStatus] = useState<string>('All changes synced in working model');

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Rendered page background image
  const [pageBgUrl, setPageBgUrl] = useState<string>('');

  // Unified Direct Manipulation State: Move, 8-Handle Resize, Rotate, Pan, Draw Shape, or Freehand
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'resize' | 'rotate' | 'pan' | 'freehand' | 'draw-shape';
    resizeDir?: ResizeHandleDir;
    activeCursor?: string;
    shapeTool?: EditorToolMode;
    objId?: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origRotation?: number;
    centerX?: number;
    centerY?: number;
    groupOrigins?: Record<string, { x: number; y: number }>;
    points?: Array<{ x: number; y: number }>;
    panStartClientX?: number;
    panStartClientY?: number;
    panStartScrollLeft?: number;
    panStartScrollTop?: number;
  } | null>(null);
  const [spacePanHeld, setSpacePanHeld] = useState<boolean>(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; objId: string } | null>(
    null
  );

  // Drag-and-drop page reordering state & Full-Canvas Page Sorter state
  const [draggedPageIdx, setDraggedPageIdx] = useState<number | null>(null);
  const [dragOverPageIdx, setDragOverPageIdx] = useState<number | null>(null);
  const [pageSorterOpen, setPageSorterOpen] = useState<boolean>(false);
  const pageRailRef = useRef<HTMLDivElement | null>(null);
  const sorterGridRef = useRef<HTMLDivElement | null>(null);
  const pageCanvasRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLElement | null>(null);

  // Signature Modal state
  const [sigModalOpen, setSigModalOpen] = useState<boolean>(false);
  const [sigTab, setSigTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [sigTypedText, setSigTypedText] = useState<string>('Alex Morgan');
  const [sigIsCrypto, setSigIsCrypto] = useState<boolean>(true);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSig, setIsDrawingSig] = useState<boolean>(false);

  // Export & Verification Modal state
  const [exporting, setExporting] = useState<boolean>(false);
  const [verificationReport, setVerificationReport] = useState<{
    bytes: Uint8Array;
    report: ExportVerificationReport;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInsertInputRef = useRef<HTMLInputElement | null>(null);
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);

  const pushSnapshot = useCallback(
    (nextPages: PdfPageDescriptor[], nextObjects: PdfEditableObject[], label: string) => {
      const snap: EditorHistorySnapshot = {
        id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        timestamp: Date.now(),
        pages: JSON.parse(JSON.stringify(nextPages)),
        objects: JSON.parse(JSON.stringify(nextObjects))
      };
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIdx + 1);
        return [...sliced, snap];
      });
      setHistoryIdx((prev) => prev + 1);
      setSaveStatus(`Saved: ${label}`);
    },
    [historyIdx]
  );

  const loadDocumentBytes = useCallback(async (bytes: Uint8Array, name: string) => {
    setLoading(true);
    setLoadingMsg('Parsing PDF content streams, text runs, vector blocks, and AcroForm fields...');
    try {
      setPdfBytes(bytes);
      setDocName(name);
      const parsed = await parseDocumentIntoEditorModel(bytes);
      setPages(parsed.pages);
      setObjects(parsed.objects);
      setOutline(parsed.outline);
      setHasXfa(parsed.hasXfa);
      setCurrentPageIdx(0);
      setSelectedIds([]);
      setEditingTextObjId(null);

      const initialSnap: EditorHistorySnapshot = {
        id: 'snap-init',
        label: 'Initial Document Load',
        timestamp: Date.now(),
        pages: JSON.parse(JSON.stringify(parsed.pages)),
        objects: JSON.parse(JSON.stringify(parsed.objects))
      };
      setHistory([initialSnap]);
      setHistoryIdx(0);

      const subj = parsed.metadata?.subject || '';
      const isSynthSample =
        subj.startsWith('SYNTHETIC_ENGLISH_SCANNED_SAMPLE') ||
        subj === 'SYNTHETIC_BILINGUAL_SCANNED_SAMPLE' ||
        name.toLowerCase().includes('stjude') ||
        name.toLowerCase().includes('scanned_charge_slip') ||
        name.toLowerCase().includes('commonwealth_clinical') ||
        name.toLowerCase().includes('apex_commercial');
      setIsSampleEnglishDocLoaded(isSynthSample);
      if (subj.includes('::serif-notice')) {
        setSamplePreset('serif-notice');
      } else if (subj.includes('::sans-invoice')) {
        setSamplePreset('sans-invoice');
      } else if (isSynthSample) {
        setSamplePreset('receipt-monospaced');
      }

      const scannedCount = parsed.pages.filter((p) => p.pageClassification === 'scanned').length;
      const mixedCount = parsed.pages.filter((p) => p.pageClassification === 'mixed').length;
      if (scannedCount > 0 || mixedCount > 0) {
        setShowScannedDetectionPrompt(true);
        setSaveStatus(
          `Detected ${scannedCount} scanned & ${mixedCount} mixed page(s) · English OCR ready`
        );
      } else {
        setShowScannedDetectionPrompt(false);
        setSaveStatus(`Ready · ${parsed.objects.length} native PDF objects indexed`);
      }
    } catch (err: any) {
      setSaveStatus(`Load error: ${err?.message || 'Invalid PDF'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Synthetic Scanned English Test Document (Receipt Monospaced, Serif Legal Notice, or Sans Invoice)
  const handleLoadScannedEnglishSample = useCallback(
    async (presetOverride?: ScannedSamplePreset) => {
      const targetPreset = presetOverride || samplePreset;
      setSamplePreset(targetPreset);
      setLoading(true);
      setLoadingMsg(
        `Generating Synthetic Scanned English Sample (${targetPreset}) for OCR Font Matching...`
      );
      try {
        const sampleBytes = await createSampleScannedEnglishPdf(targetPreset);
        const fileNameMap: Record<ScannedSamplePreset, string> = {
          'receipt-monospaced': 'StJude_Scanned_Charge_Slip_Mono_2025.pdf',
          'serif-notice': 'Commonwealth_Clinical_Serif_Notice_2025.pdf',
          'sans-invoice': 'Apex_Commercial_Sans_Invoice_2025.pdf'
        };
        await loadDocumentBytes(sampleBytes, fileNameMap[targetPreset]);
      } catch (err: any) {
        setSaveStatus(`Failed to load scanned sample: ${err?.message || 'Error'}`);
        setLoading(false);
      }
    },
    [loadDocumentBytes, samplePreset]
  );

  // Execute English ('eng') OCR + Pixel Typography Analysis on Scanned / Selected Pages
  const handleRunOcr = useCallback(
    async (scope: 'current-page' | 'scanned-only' | 'all-scanned-and-mixed') => {
      if (!pdfBytes || ocrRunning) return;
      setShowScannedDetectionPrompt(false);
      setOcrRunning(true);
      ocrCancelRef.current = false;
      setOcrProgressPct(5);
      setOcrProgressText('Initializing English OCR & Typography Matching engine...');

      const targetPages = pages.filter((p) => {
        if (p.deleted) return false;
        if (scope === 'current-page') return p.pageIndex === (pages[currentPageIdx]?.pageIndex ?? 0);
        if (scope === 'scanned-only') return p.pageClassification === 'scanned';
        return p.pageClassification === 'scanned' || p.pageClassification === 'mixed';
      });

      const pagesToProcess =
        targetPages.length > 0 ? targetPages : [pages[currentPageIdx] || pages[0]].filter(Boolean);

      let accumulatedObjects = [...objects];
      let updatedPages = [...pages];

      try {
        for (let i = 0; i < pagesToProcess.length; i++) {
          if (ocrCancelRef.current) break;
          const p = pagesToProcess[i];
          const arrayBuf = pdfBytes.buffer.slice(
            pdfBytes.byteOffset,
            pdfBytes.byteOffset + pdfBytes.byteLength
          ) as ArrayBuffer;

          const res = await runScannedPageOcr({
            pdfBuffer: arrayBuf,
            docCacheKey: docName,
            pageIndex: p.pageIndex,
            pageWidthPt: p.width,
            pageHeightPt: p.height,
            pageRotationDeg: p.rotation || 0,
            language: 'eng',
            preprocessMode: ocrPreprocessMode,
            isSampleEnglishDoc: isSampleEnglishDocLoaded,
            samplePreset,
            shouldCancel: () => ocrCancelRef.current,
            onProgress: (status, pct) => {
              const overall = Math.round(
                ((i + pct / 100) / Math.max(1, pagesToProcess.length)) * 100
              );
              setOcrProgressPct(overall);
              setOcrProgressText(`Page ${p.pageIndex + 1}/${pages.length}: ${status}`);
            }
          });

          if (ocrCancelRef.current) break;

          // Replace any previous OCR regions on this page with the fresh recognition output
          accumulatedObjects = [
            ...accumulatedObjects.filter(
              (o) => !(o.pageIndex === p.pageIndex && o.type === 'ocr-text')
            ),
            ...res.regions
          ];

          updatedPages = updatedPages.map((pg) =>
            pg.pageIndex === p.pageIndex
              ? {
                  ...pg,
                  ocrProcessed: true,
                  ocrRegionCount: res.regions.length,
                  ocrAvgConfidence: res.avgConfidence,
                  ocrLanguageUsed: 'eng'
                }
              : pg
          );
        }

        if (!ocrCancelRef.current) {
          setPages(updatedPages);
          setObjects(accumulatedObjects);
          pushSnapshot(
            updatedPages,
            accumulatedObjects,
            'OCR & Typography Matched (ENG)'
          );
          const totalOcr = accumulatedObjects.filter(
            (o) => o.type === 'ocr-text' && !o.deleted
          ).length;
          setSaveStatus(
            `OCR Complete · ${totalOcr} English regions recognized`
          );
        } else {
          setSaveStatus('OCR cancelled by user');
        }
      } catch (err: any) {
        setSaveStatus(`OCR error: ${err?.message || 'Recognition failed'}`);
      } finally {
        setOcrRunning(false);
        setOcrProgressPct(0);
        setOcrProgressText('');
      }
    },
    [
      pdfBytes,
      ocrRunning,
      pages,
      currentPageIdx,
      objects,
      docName,
      ocrPreprocessMode,
      isSampleEnglishDocLoaded,
      samplePreset,
      pushSnapshot
    ]
  );

  // Re-generate background reconstruction patch when method or padding changes in Inspector
  const updateOcrBgReconstruction = useCallback(
    (
      objId: string,
      method: BgReconstructionMethod,
      customColor?: string,
      maskPadding?: number
    ) => {
      setObjects((prev) => {
        const next = prev.map((o) => {
          if (o.id !== objId) return o;
          const nextPad = maskPadding !== undefined ? maskPadding : o.bgMaskPadding ?? 1.5;
          const nextColor = customColor !== undefined ? customColor : o.fillColor || o.sampledBgColor;
          const cachedCanvas =
            getCachedPageCanvas(`${docName}::page-${o.pageIndex}`) ||
            getCachedPageCanvas(`${docName}:p${o.pageIndex}`);
          const pageDesc = pages.find((p) => p.pageIndex === o.pageIndex);

          let patchDataUrl = o.bgPatchDataUrl;
          let sampledBg = o.sampledBgColor;

          if (cachedCanvas && pageDesc) {
            const rebuilt = reconstructRegionBackground(
              cachedCanvas,
              pageDesc.width,
              pageDesc.height,
              {
                x: o.originalX ?? o.x,
                y: o.originalY ?? o.y,
                width: o.originalWidth ?? o.width,
                height: o.originalHeight ?? o.height
              },
              method,
              nextColor,
              nextPad
            );
            patchDataUrl = rebuilt.patchDataUrl;
            sampledBg = rebuilt.sampledBgColor;
          }

          return {
            ...o,
            bgReconstructionMethod: method,
            fillColor: nextColor,
            bgMaskPadding: nextPad,
            bgPatchDataUrl: patchDataUrl,
            sampledBgColor: sampledBg,
            ocrEdited: true
          };
        });
        pushSnapshot(pages, next, `Update Background Reconstruction (${method})`);
        return next;
      });
    },
    [docName, pages, pushSnapshot]
  );

  useEffect(() => {
    if (initialFile) {
      initialFile.file.arrayBuffer().then((ab) => {
        loadDocumentBytes(new Uint8Array(ab), initialFile.name);
      });
    } else {
      generateSamplePdfBytes('editorial-report').then((sample) => {
        loadDocumentBytes(sample.bytes, sample.name);
      });
    }
  }, [initialFile, loadDocumentBytes]);

  const activePages = pages.filter((p) => !p.deleted);
  const currentPage = activePages[currentPageIdx] || activePages[0];

  // Render crisp background canvas whenever currentPage changes
  useEffect(() => {
    let cancelled = false;
    if (!pdfBytes || !currentPage) {
      setPageBgUrl('');
      return;
    }
    if (currentPage.originalPageIndex < 0) {
      setPageBgUrl('');
      return;
    }
    renderPdfPageToDataUrl(pdfBytes, currentPage.originalPageIndex + 1, 1.75, 'image/png')
      .then((res) => {
        if (!cancelled) setPageBgUrl(res.dataUrl);
      })
      .catch(() => {
        if (!cancelled) setPageBgUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [pdfBytes, currentPage?.originalPageIndex]);

  // Undo & Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      const target = history[historyIdx - 1];
      setPages(JSON.parse(JSON.stringify(target.pages)));
      setObjects(JSON.parse(JSON.stringify(target.objects)));
      setHistoryIdx(historyIdx - 1);
      setSaveStatus(`Undid: ${target.label}`);
    }
  }, [history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const target = history[historyIdx + 1];
      setPages(JSON.parse(JSON.stringify(target.pages)));
      setObjects(JSON.parse(JSON.stringify(target.objects)));
      setHistoryIdx(historyIdx + 1);
      setSaveStatus(`Redid: ${target.label}`);
    }
  }, [history, historyIdx]);

  const updateObjectsWithHistory = useCallback(
    (updater: (prev: PdfEditableObject[]) => PdfEditableObject[], actionLabel: string) => {
      setObjects((prev) => {
        const next = updater(prev);
        pushSnapshot(pages, next, actionLabel);
        return next;
      });
    },
    [pages, pushSnapshot]
  );

  const toggleObjectVisibility = (ids: string[], forceState?: boolean) => {
    updateObjectsWithHistory(
      (prev) =>
        prev.map((o) =>
          ids.includes(o.id)
            ? { ...o, visible: forceState !== undefined ? forceState : !o.visible }
            : o
        ),
      ids.length === 1 ? 'Toggle Object Visibility' : `Toggle ${ids.length} Objects Visibility`
    );
  };

  const toggleObjectLock = (ids: string[]) => {
    updateObjectsWithHistory(
      (prev) => prev.map((o) => (ids.includes(o.id) ? { ...o, locked: !o.locked } : o)),
      'Toggle Object Lock'
    );
  };

  // Method B: Genuine Object Deletion
  const removeObjectsPermanently = useCallback(
    (ids: string[]) => {
      updateObjectsWithHistory(
        (prev) =>
          prev.map((o) => (ids.includes(o.id) && !o.locked ? { ...o, deleted: true } : o)),
        `Delete ${ids.length} PDF Object(s)`
      );
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      setEditingTextObjId(null);
    },
    [updateObjectsWithHistory]
  );

  // Method A: Place Customizable Cover Overlay over Selected Object (Non-Destructive)
  const coverObjectWithOverlay = (targetId: string, withBlur = false) => {
    const target = objects.find((o) => o.id === targetId);
    if (!target) return;
    const covId = `obj-cover-${Date.now().toString(36)}`;
    const pad = 4;
    const coverObj: PdfEditableObject = {
      id: covId,
      pageIndex: target.pageIndex,
      type: 'shape',
      shapeKind: 'rounded-rectangle',
      isCoverOverlay: true,
      name: withBlur
        ? `Blur Cover Overlay (${target.name.slice(0, 16)})`
        : `Whiteout Cover Overlay (${target.name.slice(0, 16)})`,
      isNative: false,
      visible: true,
      locked: false,
      deleted: false,
      zIndex: Math.max(400, target.zIndex + 20),
      x: Math.max(0, target.x - pad),
      y: Math.max(0, target.y - pad),
      width: target.width + pad * 2,
      height: target.height + pad * 2,
      rotation: 0,
      opacity: 1,
      fillColor: '#FFFFFF',
      fillOpacity: withBlur ? 0.25 : 1,
      transparentFill: false,
      strokeColor: '#E4E4E7',
      strokeWidth: withBlur ? 1 : 0,
      strokeOpacity: 0.8,
      strokeStyle: 'solid',
      cornerRadius: 4,
      backdropBlur: withBlur ? 8 : 0,
      objectBlur: 0
    };
    updateObjectsWithHistory(
      (prev) => [...prev, coverObj],
      withBlur ? 'Cover Content with Background Blur Overlay' : 'Cover Content with Whiteout Overlay'
    );
    setSelectedIds([covId]);
  };

  const restoreAllHiddenObjects = () => {
    updateObjectsWithHistory(
      (prev) => prev.map((o) => (!o.visible ? { ...o, visible: true } : o)),
      'Restore All Hidden Objects'
    );
  };

  const duplicateObjects = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const newIds: string[] = [];
      updateObjectsWithHistory((prev) => {
        const clones: PdfEditableObject[] = [];
        prev.forEach((o) => {
          if (ids.includes(o.id) && !o.deleted) {
            const copyId = `obj-copy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
            newIds.push(copyId);
            clones.push({
              ...JSON.parse(JSON.stringify(o)),
              id: copyId,
              name: `${o.name} (Copy)`,
              isNative: false,
              type: o.type === 'native-text' ? 'added-text' : o.type === 'native-shape' ? 'shape' : o.type,
              x: o.x + 16,
              y: o.y + 16,
              zIndex: o.zIndex + 10
            });
          }
        });
        return [...prev, ...clones];
      }, `Duplicate ${ids.length} Object(s)`);
      setTimeout(() => setSelectedIds(newIds), 0);
    },
    [updateObjectsWithHistory]
  );

  const convertObjectToRedaction = (id: string) => {
    const target = objects.find((o) => o.id === id);
    if (!target) return;
    const redId = `obj-redact-${Date.now().toString(36)}`;
    const redObj: PdfEditableObject = {
      id: redId,
      pageIndex: target.pageIndex,
      type: 'redaction',
      name: `Redaction: ${target.name.slice(0, 22)}`,
      isNative: false,
      visible: true,
      locked: false,
      deleted: false,
      zIndex: 999,
      x: Math.max(0, target.x - 2),
      y: Math.max(0, target.y - 2),
      width: target.width + 4,
      height: target.height + 4,
      rotation: 0,
      opacity: 1,
      fillColor: '#09090B',
      redactionCode: 'REDACTED // PII'
    };
    updateObjectsWithHistory((prev) => [...prev, redObj], `Mark ${target.name} for Redaction`);
    setSelectedIds([redId]);
  };

  const changeStackOrder = (id: string, dir: 'forward' | 'backward' | 'front' | 'back') => {
    updateObjectsWithHistory((prev) => {
      const maxZ = Math.max(10, ...prev.map((o) => o.zIndex));
      const minZ = Math.min(1, ...prev.map((o) => o.zIndex));
      return prev.map((o) => {
        if (o.id !== id) return o;
        if (dir === 'front') return { ...o, zIndex: maxZ + 10 };
        if (dir === 'back') return { ...o, zIndex: Math.max(1, minZ - 2) };
        if (dir === 'forward') return { ...o, zIndex: o.zIndex + 5 };
        return { ...o, zIndex: Math.max(1, o.zIndex - 5) };
      });
    }, `Change Layer Order (${dir})`);
  };

  // Multi-Object Alignment, Distribution & Grouping (Section 3)
  const alignSelectedObjects = (
    alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-h' | 'distribute-v'
  ) => {
    if (selectedIds.length < 2) return;
    updateObjectsWithHistory((prev) => {
      const sel = prev.filter((o) => selectedIds.includes(o.id) && !o.deleted && !o.locked);
      if (sel.length < 2) return prev;

      const minX = Math.min(...sel.map((o) => o.x));
      const maxX = Math.max(...sel.map((o) => o.x + o.width));
      const minY = Math.min(...sel.map((o) => o.y));
      const maxY = Math.max(...sel.map((o) => o.y + o.height));
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      if (alignment === 'distribute-h' && sel.length >= 3) {
        const sorted = [...sel].sort((a, b) => a.x - b.x);
        const step = (maxX - minX) / (sorted.length - 1);
        const posMap = new Map<string, number>();
        sorted.forEach((o, i) => posMap.set(o.id, Math.round(minX + i * step - (i === sorted.length - 1 ? o.width : 0))));
        return prev.map((o) => (posMap.has(o.id) ? { ...o, x: posMap.get(o.id)! } : o));
      }

      if (alignment === 'distribute-v' && sel.length >= 3) {
        const sorted = [...sel].sort((a, b) => a.y - b.y);
        const step = (maxY - minY) / (sorted.length - 1);
        const posMap = new Map<string, number>();
        sorted.forEach((o, i) => posMap.set(o.id, Math.round(minY + i * step - (i === sorted.length - 1 ? o.height : 0))));
        return prev.map((o) => (posMap.has(o.id) ? { ...o, y: posMap.get(o.id)! } : o));
      }

      return prev.map((o) => {
        if (!selectedIds.includes(o.id) || o.locked) return o;
        if (alignment === 'left') return { ...o, x: minX };
        if (alignment === 'center') return { ...o, x: Math.round(midX - o.width / 2) };
        if (alignment === 'right') return { ...o, x: Math.round(maxX - o.width) };
        if (alignment === 'top') return { ...o, y: minY };
        if (alignment === 'middle') return { ...o, y: Math.round(midY - o.height / 2) };
        if (alignment === 'bottom') return { ...o, y: Math.round(maxY - o.height) };
        return o;
      });
    }, `Align Objects (${alignment})`);
  };

  const handleGroupSelected = () => {
    if (selectedIds.length < 2) return;
    const gid = `grp-${Date.now().toString(36)}`;
    updateObjectsWithHistory(
      (prev) => prev.map((o) => (selectedIds.includes(o.id) ? { ...o, groupId: gid } : o)),
      `Group ${selectedIds.length} Objects`
    );
  };

  const handleUngroupSelected = () => {
    updateObjectsWithHistory(
      (prev) => prev.map((o) => (selectedIds.includes(o.id) ? { ...o, groupId: undefined } : o)),
      'Ungroup Selected Objects'
    );
  };

  // Cycle Selection Through Overlapping Objects at Same Region (Section 15)
  const cycleOverlappingObjects = (referenceObj: PdfEditableObject) => {
    const cx = referenceObj.x + referenceObj.width / 2;
    const cy = referenceObj.y + referenceObj.height / 2;
    const candidates = objects
      .filter(
        (o) =>
          o.pageIndex === referenceObj.pageIndex &&
          !o.deleted &&
          (o.visible || showHiddenOutlines) &&
          cx >= o.x - 8 &&
          cx <= o.x + o.width + 8 &&
          cy >= o.y - 8 &&
          cy <= o.y + o.height + 8
      )
      .sort((a, b) => b.zIndex - a.zIndex);

    if (candidates.length <= 1) return;
    const curIdx = candidates.findIndex((c) => c.id === referenceObj.id);
    const nextObj = candidates[(curIdx + 1) % candidates.length];
    if (nextObj) {
      setSelectedIds([nextObj.id]);
      setSaveStatus(`Cycled selection → ${nextObj.name}`);
    }
  };

  // Keyboard shortcuts inside Editor (Copy, Paste, Duplicate, Delete, Arrow Nudge, Undo/Redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        editingTextObjId
      ) {
        if (e.key === 'Escape') {
          setEditingTextObjId(null);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedIds.length > 0) {
        e.preventDefault();
        const copied = objects.filter((o) => selectedIds.includes(o.id) && !o.deleted);
        setClipboardObjs(JSON.parse(JSON.stringify(copied)));
        setSaveStatus(`Copied ${copied.length} object(s) to clipboard`);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardObjs.length > 0 && currentPage) {
        e.preventDefault();
        const newIds: string[] = [];
        updateObjectsWithHistory((prev) => {
          const pasted = clipboardObjs.map((o, i) => {
            const pid = `obj-paste-${Date.now().toString(36)}-${i}`;
            newIds.push(pid);
            return {
              ...JSON.parse(JSON.stringify(o)),
              id: pid,
              pageIndex: currentPage.pageIndex,
              isNative: false,
              type: o.type === 'native-text' ? 'added-text' : o.type === 'native-shape' ? 'shape' : o.type,
              x: Math.min(currentPage.width - 40, o.x + 20),
              y: Math.min(currentPage.height - 30, o.y + 20),
              zIndex: o.zIndex + 15
            };
          });
          return [...prev, ...pasted];
        }, `Paste ${clipboardObjs.length} Object(s)`);
        setTimeout(() => setSelectedIds(newIds), 0);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedIds.length > 0) {
        e.preventDefault();
        duplicateObjects(selectedIds);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        removeObjectsPermanently(selectedIds);
      } else if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) &&
        selectedIds.length > 0
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        updateObjectsWithHistory(
          (prev) =>
            prev.map((o) =>
              selectedIds.includes(o.id) && !o.locked
                ? {
                    ...o,
                    x: Math.max(0, o.x + dx),
                    y: Math.max(0, o.y + dy)
                  }
                : o
            ),
          `Nudge Object (${dx},${dy}pt)`
        );
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
        setEditingTextObjId(null);
        setContextMenu(null);
        closeToolbarPanel();
        setToolMode('select');
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setSpacePanHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePanHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    selectedIds,
    editingTextObjId,
    clipboardObjs,
    currentPage,
    objects,
    handleUndo,
    handleRedo,
    duplicateObjects,
    removeObjectsPermanently,
    updateObjectsWithHistory
  ]);

  // Helper to create a new shape or object at (x, y, w, h)
  const createNewEditorObject = (
    mode: EditorToolMode,
    pageIndex: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): PdfEditableObject => {
    const newId = `obj-p${pageIndex + 1}-${mode}-${Date.now().toString(36)}`;
    const isCover = mode === 'cover-overlay';
    const isHighlight = mode === 'highlight';
    const isNote = mode === 'sticky-note';

    const shapeKindMap: Record<string, PdfShapeKind> = {
      'cover-overlay': 'rounded-rectangle',
      rectangle: 'rectangle',
      'rounded-rectangle': 'rounded-rectangle',
      circle: 'circle',
      ellipse: 'ellipse',
      line: 'line',
      arrow: 'arrow',
      polygon: 'polygon',
      highlight: 'highlight',
      'sticky-note': 'sticky-note'
    };

    return {
      id: newId,
      pageIndex,
      type: isHighlight || isNote ? 'annotation' : 'shape',
      shapeKind: shapeKindMap[mode] || 'rectangle',
      isCoverOverlay: isCover,
      name: isCover
        ? 'Content Cover Overlay'
        : isHighlight
        ? 'Highlight Markup'
        : isNote
        ? 'Sticky Note Comment'
        : `${mode.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Shape`,
      isNative: false,
      visible: true,
      locked: false,
      deleted: false,
      zIndex: isCover ? 420 : 280,
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      fillColor: isCover
        ? '#FFFFFF'
        : isHighlight
        ? '#FACC15'
        : isNote
        ? '#FEF08A'
        : '#EDE9FE',
      fillOpacity: isCover ? 1 : isHighlight ? 0.38 : mode === 'line' || mode === 'arrow' ? 0 : 0.85,
      transparentFill: mode === 'line' || mode === 'arrow',
      strokeColor: isCover ? '#E4E4E7' : isHighlight ? '#EAB308' : '#7C3AED',
      strokeWidth: isCover ? 0 : isHighlight ? 0 : 2,
      strokeOpacity: 1,
      strokeStyle: 'solid',
      cornerRadius: mode === 'rounded-rectangle' ? 14 : isCover ? 4 : 0,
      polygonSides: mode === 'polygon' ? 5 : undefined,
      backdropBlur: 0,
      objectBlur: 0,
      text: isNote ? 'Review note: verify figures before final sign-off.' : undefined
    };
  };

  // Helper to convert client mouse coordinates into PDF page points accounting for zoom, scroll/pan, and rotation (Sections 5 & 6)
  const getCanvasPdfPoint = useCallback(
    (clientX: number, clientY: number, fallbackRect?: DOMRect): { x: number; y: number } => {
      if (!currentPage) return { x: 0, y: 0 };
      const rect = fallbackRect || pageCanvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return {
          x: Math.round(clientX / Math.max(0.1, zoom)),
          y: Math.round(clientY / Math.max(0.1, zoom))
        };
      }
      const pt = clientPointToPdfPagePoint(
        clientX,
        clientY,
        rect,
        currentPage.width,
        currentPage.height,
        zoom,
        currentPage.rotation || 0
      );
      return {
        x: Math.round(pt.xPt * 100) / 100,
        y: Math.round(pt.yPt * 100) / 100
      };
    },
    [currentPage, zoom]
  );

  // Helper to refresh Original Text | Replacement Preview comparison crops for an OCR object (Section 16)
  const withRefreshedComparisonCrops = useCallback(
    (obj: PdfEditableObject): PdfEditableObject => {
      if (obj.type !== 'ocr-text' || !obj.ocrTypography) return obj;
      const cachedCanvas =
        getCachedPageCanvas(`${docName}::page-${obj.pageIndex}`) ||
        getCachedPageCanvas(`${docName}:p${obj.pageIndex}`);
      const pageDesc = pages.find((p) => p.pageIndex === obj.pageIndex);
      if (!cachedCanvas || !pageDesc) return obj;
      try {
        const crops = generateTypographyComparisonCrops(
          cachedCanvas,
          obj,
          pageDesc.width,
          pageDesc.height
        );
        return {
          ...obj,
          ocrTypography: {
            ...obj.ocrTypography,
            originalCropDataUrl: crops.originalCropDataUrl,
            replacementPreviewCropDataUrl: crops.replacementPreviewCropDataUrl
          }
        };
      } catch {
        return obj;
      }
    },
    [docName, pages]
  );

  // Unified handler for editing text on an object (preserving exact OCR geometry, anchor, baseline, and matched font!)
  const handleUpdateObjectText = useCallback(
    (objId: string, newText: string) => {
      const pageWidthPt = currentPage?.width || 612;
      setObjects((prev) => {
        const pagePeers = prev.filter(
          (p) => p.pageIndex === (currentPage?.pageIndex ?? 0) && !p.deleted
        );
        return prev.map((o) => {
          if (o.id !== objId) return o;
          if (o.type === 'ocr-text') {
            const fitted = fitReplacementTextToOcrGeometry(o, newText, pageWidthPt, pagePeers);
            const updated: PdfEditableObject = {
              ...o,
              text: newText,
              x: fitted.x,
              y: fitted.y,
              width: fitted.width,
              height: fitted.height,
              fontSize: fitted.fontSize,
              widthOverflowWarning: fitted.widthOverflowWarning,
              ocrEdited: true
            };
            return withRefreshedComparisonCrops(updated);
          }
          return {
            ...o,
            text: newText
          };
        });
      });
    },
    [currentPage?.width, currentPage?.pageIndex, withRefreshedComparisonCrops]
  );

  // Section 11: "Match Original Text Style" Action Handler
  const handleMatchOriginalTextStyle = useCallback(
    (objId: string) => {
      const pageWidthPt = currentPage?.width || 612;
      const pageHeightPt = currentPage?.height || 792;
      updateObjectsWithHistory((prev) => {
        const pagePeers = prev.filter(
          (p) => p.pageIndex === (currentPage?.pageIndex ?? 0) && !p.deleted
        );
        return prev.map((o) => {
          if (o.id !== objId || o.type !== 'ocr-text') return o;
          const cachedCanvas =
            getCachedPageCanvas(`${docName}::page-${o.pageIndex}`) ||
            getCachedPageCanvas(`${docName}:p${o.pageIndex}`);
          return reanalyzeObjectTypographyStyle(
            o,
            pagePeers,
            cachedCanvas,
            pageWidthPt,
            pageHeightPt
          );
        });
      }, 'Match Original Scanned Text Style');
    },
    [currentPage?.width, currentPage?.height, currentPage?.pageIndex, docName, updateObjectsWithHistory]
  );

  // Canvas MouseDown: Select, Pan, or Interactive Click-and-Drag Creation of Shapes/Text/Redactions
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setContextMenu(null);
    if (!currentPage) return;

    // Middle-click or Spacebar + Left-Click or Pan Tool initiates Canvas Panning (grab -> grabbing)
    if (e.button === 1 || toolMode === 'pan' || spacePanHeld) {
      e.preventDefault();
      const viewport = canvasViewportRef.current;
      setDragState({
        mode: 'pan',
        activeCursor: 'grabbing',
        startX: e.clientX,
        startY: e.clientY,
        origX: 0,
        origY: 0,
        origW: 0,
        origH: 0,
        panStartClientX: e.clientX,
        panStartClientY: e.clientY,
        panStartScrollLeft: viewport?.scrollLeft || 0,
        panStartScrollTop: viewport?.scrollTop || 0
      });
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const { x: clickX, y: clickY } = getCanvasPdfPoint(e.clientX, e.clientY, rect);

    if (toolMode === 'select' || toolMode === 'edit-text') {
      if (e.target === e.currentTarget) {
        setSelectedIds([]);
        setEditingTextObjId(null);
      }
      return;
    }

    const newId = `obj-p${currentPage.pageIndex + 1}-${toolMode}-${Date.now().toString(36)}`;

    if (toolMode === 'add-text') {
      const newObj: PdfEditableObject = {
        id: newId,
        pageIndex: currentPage.pageIndex,
        type: 'added-text',
        name: 'Added Text Block',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 320,
        x: clickX,
        y: clickY,
        width: 220,
        height: 36,
        rotation: 0,
        opacity: 1,
        text: 'Type or double-click to edit text',
        fontFamily: 'Helvetica',
        fontSize: 14,
        fontWeight: 'bold',
        fontStyle: 'normal',
        color: '#18181B',
        lineHeight: 1.2,
        letterSpacing: 0
      };
      updateObjectsWithHistory((prev) => [...prev, newObj], 'Insert Text Block');
      setSelectedIds([newId]);
      setEditingTextObjId(newId);
      setToolMode('select');
    } else if (toolMode === 'watermark') {
      const newObj: PdfEditableObject = {
        id: newId,
        pageIndex: currentPage.pageIndex,
        type: 'watermark',
        name: 'Page Watermark',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 50,
        x: Math.round(currentPage.width * 0.18),
        y: Math.round(currentPage.height * 0.45),
        width: 360,
        height: 60,
        rotation: -30,
        opacity: 0.22,
        text: 'CONFIDENTIAL // VELLUM',
        fontFamily: 'Helvetica',
        fontSize: 38,
        fontWeight: 'bold',
        fontStyle: 'normal',
        color: '#6D28D9'
      };
      updateObjectsWithHistory((prev) => [...prev, newObj], 'Insert Watermark');
      setSelectedIds([newId]);
      setToolMode('select');
    } else if (toolMode === 'form-field') {
      const newObj: PdfEditableObject = {
        id: newId,
        pageIndex: currentPage.pageIndex,
        type: 'form-field',
        name: `Form Input (${objects.filter((o) => o.type === 'form-field').length + 1})`,
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 280,
        x: clickX,
        y: clickY,
        width: 200,
        height: 26,
        rotation: 0,
        opacity: 1,
        fieldType: 'text',
        fieldName: `custom_field_${Date.now().toString().slice(-4)}`,
        fieldValue: 'Sample Input Value'
      };
      updateObjectsWithHistory((prev) => [...prev, newObj], 'Add AcroForm Field');
      setSelectedIds([newId]);
      setToolMode('select');
    } else if (toolMode === 'freehand') {
      setDragState({
        mode: 'freehand',
        objId: newId,
        startX: clickX,
        startY: clickY,
        origX: clickX,
        origY: clickY,
        origW: 10,
        origH: 10,
        points: [{ x: 0, y: 0 }]
      });
    } else if (toolMode === 'signature') {
      setSigModalOpen(true);
    } else if (toolMode === 'add-image') {
      imageInsertInputRef.current?.click();
    } else if (
      [
        'cover-overlay',
        'rectangle',
        'rounded-rectangle',
        'circle',
        'ellipse',
        'line',
        'arrow',
        'polygon',
        'highlight',
        'sticky-note',
        'redact'
      ].includes(toolMode)
    ) {
      // Interactive Click-and-Drag Shape / Overlay / Redaction Creation!
      const tempObj: PdfEditableObject =
        toolMode === 'redact'
          ? {
              id: newId,
              pageIndex: currentPage.pageIndex,
              type: 'redaction',
              name: 'Permanent Redaction Zone',
              isNative: false,
              visible: true,
              locked: false,
              deleted: false,
              zIndex: 999,
              x: clickX,
              y: clickY,
              width: 12,
              height: 12,
              rotation: 0,
              opacity: 1,
              fillColor: '#09090B',
              redactionCode: 'REDACTED // FOIA (b)(6)'
            }
          : createNewEditorObject(toolMode, currentPage.pageIndex, clickX, clickY, 12, 12);

      setObjects((prev) => [...prev, tempObj]);
      setSelectedIds([newId]);
      setDragState({
        mode: 'draw-shape',
        shapeTool: toolMode,
        objId: newId,
        startX: clickX,
        startY: clickY,
        origX: clickX,
        origY: clickY,
        origW: 12,
        origH: 12
      });
    }
  };

  // Canvas MouseMove: Direct Move, 8-Handle Resize, Rotation, Pan, Shape Draw, & Smart Snap Guides
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState || !currentPage) return;

    if (dragState.mode === 'pan') {
      const viewport = canvasViewportRef.current;
      if (viewport && dragState.panStartClientX !== undefined && dragState.panStartClientY !== undefined) {
        const deltaX = e.clientX - dragState.panStartClientX;
        const deltaY = e.clientY - dragState.panStartClientY;
        viewport.scrollLeft = (dragState.panStartScrollLeft || 0) - deltaX;
        viewport.scrollTop = (dragState.panStartScrollTop || 0) - deltaY;
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const { x: curX, y: curY } = getCanvasPdfPoint(e.clientX, e.clientY, rect);
    const dx = curX - dragState.startX;
    const dy = curY - dragState.startY;

    if (dragState.mode === 'move' && dragState.objId) {
      let nextX = Math.max(0, Math.min(currentPage.width - 12, dragState.origX + dx));
      let nextY = Math.max(0, Math.min(currentPage.height - 12, dragState.origY + dy));

      // Compute Smart Alignment Snap Guides (Page Center + Other Objects)
      const vGuides: number[] = [];
      const hGuides: number[] = [];
      const snapThreshold = 5;

      const pageMidX = Math.round(currentPage.width / 2);
      const pageMidY = Math.round(currentPage.height / 2);
      const objCenterX = nextX + dragState.origW / 2;
      const objCenterY = nextY + dragState.origH / 2;

      if (Math.abs(objCenterX - pageMidX) < snapThreshold) {
        nextX = Math.round(pageMidX - dragState.origW / 2);
        vGuides.push(pageMidX);
      }
      if (Math.abs(objCenterY - pageMidY) < snapThreshold) {
        nextY = Math.round(pageMidY - dragState.origH / 2);
        hGuides.push(pageMidY);
      }

      // Snap to other visible objects on page
      const peers = objects.filter(
        (o) =>
          o.pageIndex === currentPage.pageIndex &&
          !o.deleted &&
          o.visible &&
          o.id !== dragState.objId &&
          !selectedIds.includes(o.id)
      );
      for (const peer of peers) {
        if (Math.abs(nextX - peer.x) < snapThreshold) {
          nextX = peer.x;
          vGuides.push(peer.x);
        } else if (Math.abs(nextX + dragState.origW - (peer.x + peer.width)) < snapThreshold) {
          nextX = peer.x + peer.width - dragState.origW;
          vGuides.push(peer.x + peer.width);
        }
        if (Math.abs(nextY - peer.y) < snapThreshold) {
          nextY = peer.y;
          hGuides.push(peer.y);
        } else if (Math.abs(nextY + dragState.origH - (peer.y + peer.height)) < snapThreshold) {
          nextY = peer.y + peer.height - dragState.origH;
          hGuides.push(peer.y + peer.height);
        }
      }

      setSnapGuides({ vertical: vGuides, horizontal: hGuides });

      const actualDx = nextX - dragState.origX;
      const actualDy = nextY - dragState.origY;

      setObjects((prev) =>
        prev.map((o) => {
          if (o.locked) return o;
          if (o.id === dragState.objId) {
            return { ...o, x: nextX, y: nextY };
          }
          if (dragState.groupOrigins && dragState.groupOrigins[o.id]) {
            return {
              ...o,
              x: Math.max(0, dragState.groupOrigins[o.id].x + actualDx),
              y: Math.max(0, dragState.groupOrigins[o.id].y + actualDy)
            };
          }
          return o;
        })
      );
    } else if (dragState.mode === 'resize' && dragState.objId) {
      const dir = dragState.resizeDir || 'se';
      let nx = dragState.origX;
      let ny = dragState.origY;
      let nw = dragState.origW;
      let nh = dragState.origH;

      const minW = 14;
      const minH = 12;

      if (dir.includes('e')) {
        nw = Math.max(minW, dragState.origW + dx);
      }
      if (dir.includes('s')) {
        nh = Math.max(minH, dragState.origH + dy);
      }
      if (dir.includes('w')) {
        const candidateW = dragState.origW - dx;
        if (candidateW >= minW) {
          nw = candidateW;
          nx = dragState.origX + dx;
        }
      }
      if (dir.includes('n')) {
        const candidateH = dragState.origH - dy;
        if (candidateH >= minH) {
          nh = candidateH;
          ny = dragState.origY + dy;
        }
      }

      // Proportional Aspect Ratio Lock if Shift is held or object has lockAspectRatio
      const targetObj = objects.find((o) => o.id === dragState.objId);
      if (
        (e.shiftKey || targetObj?.lockAspectRatio || targetObj?.shapeKind === 'circle') &&
        dragState.origH > 0
      ) {
        const ratio =
          targetObj?.shapeKind === 'circle' ? 1 : dragState.origW / dragState.origH;
        if (dir === 'n' || dir === 's') {
          nw = Math.round(nh * ratio);
        } else {
          nh = Math.round(nw / ratio);
        }
      }

      setObjects((prev) =>
        prev.map((o) =>
          o.id === dragState.objId && !o.locked
            ? {
                ...o,
                x: Math.round(nx),
                y: Math.round(ny),
                width: Math.round(nw),
                height: Math.round(nh)
              }
            : o
        )
      );
    } else if (dragState.mode === 'rotate' && dragState.objId) {
      const cx = dragState.centerX ?? dragState.origX + dragState.origW / 2;
      const cy = dragState.centerY ?? dragState.origY + dragState.origH / 2;
      const angleRad = Math.atan2(curY - cy, curX - cx);
      let angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
      if (angleDeg < 0) angleDeg += 360;
      // Snap to 15-degree increments when Shift is held
      if (e.shiftKey) {
        angleDeg = Math.round(angleDeg / 15) * 15;
      }
      setObjects((prev) =>
        prev.map((o) =>
          o.id === dragState.objId && !o.locked ? { ...o, rotation: angleDeg % 360 } : o
        )
      );
    } else if (dragState.mode === 'draw-shape' && dragState.objId) {
      const x = Math.min(dragState.startX, curX);
      const y = Math.min(dragState.startY, curY);
      let w = Math.max(12, Math.abs(curX - dragState.startX));
      let h = Math.max(12, Math.abs(curY - dragState.startY));
      if (e.shiftKey || dragState.shapeTool === 'circle' || dragState.shapeTool === 'polygon') {
        const side = Math.max(w, h);
        w = side;
        h = side;
      }
      setObjects((prev) =>
        prev.map((o) => (o.id === dragState.objId ? { ...o, x, y, width: w, height: h } : o))
      );
    } else if (dragState.mode === 'freehand' && dragState.points) {
      const nextPt = { x: curX - dragState.origX, y: curY - dragState.origY };
      setDragState((prev) => (prev ? { ...prev, points: [...(prev.points || []), nextPt] } : null));
    }
  };

  // Global cursor lock & window mouseup fallback so cursors remain consistent throughout the entire drag/resize/rotate/pan gesture
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('canvas-dragging-active', Boolean(dragState));

    let lockedCursor: string | null = null;
    if (dragState) {
      if (dragState.activeCursor) {
        lockedCursor = dragState.activeCursor;
      } else if (dragState.mode === 'pan') {
        lockedCursor = 'grabbing';
      } else if (dragState.mode === 'rotate') {
        lockedCursor = 'crosshair';
      } else if (dragState.mode === 'move') {
        lockedCursor = 'grabbing';
      } else if (dragState.mode === 'resize') {
        const targetObj = objects.find((o) => o.id === dragState.objId);
        lockedCursor = getResizeCursorForHandle(
          dragState.resizeDir || 'se',
          targetObj?.rotation || 0,
          currentPage?.rotation || 0
        );
      } else {
        lockedCursor = 'crosshair';
      }
    } else if (draggedPageIdx !== null) {
      lockedCursor = 'grabbing';
    } else if (isDrawingSig) {
      lockedCursor = 'crosshair';
    }

    if (lockedCursor) {
      root.setAttribute('data-active-cursor', lockedCursor);
    } else {
      root.removeAttribute('data-active-cursor');
    }

    return () => {
      root.classList.remove('canvas-dragging-active');
      root.removeAttribute('data-active-cursor');
    };
  }, [dragState, draggedPageIdx, isDrawingSig, objects, currentPage?.rotation]);

  const getActiveCanvasCursorClass = (): string => {
    if (dragState) {
      if (dragState.mode === 'pan') return 'cursor-grabbing';
      if (dragState.mode === 'rotate') return 'cursor-crosshair';
      if (dragState.mode === 'move') return 'cursor-grabbing';
      if (dragState.mode === 'resize') {
        const targetObj = objects.find((o) => o.id === dragState.objId);
        const c = getResizeCursorForHandle(
          dragState.resizeDir || 'se',
          targetObj?.rotation || 0,
          currentPage?.rotation || 0
        );
        return `cursor-${c}`;
      }
      return 'cursor-crosshair';
    }
    if (toolMode === 'pan' || spacePanHeld) {
      return 'cursor-grab';
    }
    if (toolMode === 'edit-text' || toolMode === 'add-text') {
      return 'cursor-text';
    }
    if (toolMode !== 'select') {
      return 'cursor-crosshair';
    }
    return 'cursor-default';
  };

  const handleCanvasMouseUp = useCallback(() => {
    setSnapGuides({ vertical: [], horizontal: [] });
    if (!dragState || !currentPage) {
      if (dragState) setDragState(null);
      return;
    }

    if (dragState.mode === 'pan') {
      setDragState(null);
      return;
    }

    if (dragState.mode === 'freehand' && dragState.points && dragState.points.length > 1) {
      const xs = dragState.points.map((p) => p.x);
      const ys = dragState.points.map((p) => p.y);
      const w = Math.max(30, Math.max(...xs) - Math.min(...xs) + 12);
      const h = Math.max(30, Math.max(...ys) - Math.min(...ys) + 12);
      const freeObj: PdfEditableObject = {
        id: dragState.objId || `obj-free-${Date.now()}`,
        pageIndex: currentPage.pageIndex,
        type: 'shape',
        name: 'Custom Freehand Path',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 320,
        x: dragState.origX,
        y: dragState.origY,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        shapeKind: 'freehand',
        fillColor: '#DDD6FE',
        fillOpacity: 0.45,
        transparentFill: true,
        strokeColor: '#7C3AED',
        strokeWidth: 2.5,
        strokeOpacity: 1,
        strokeStyle: 'solid',
        closePath: false,
        points: dragState.points
      };
      updateObjectsWithHistory((prev) => [...prev, freeObj], 'Draw Freehand Path');
      setSelectedIds([freeObj.id]);
      setToolMode('select');
    } else if (dragState.mode === 'draw-shape' && dragState.objId) {
      // If user only clicked without dragging (> 16pt), give it a sensible default size
      setObjects((prev) => {
        const next = prev.map((o) => {
          if (o.id !== dragState.objId) return o;
          if (o.width <= 16 && o.height <= 16) {
            const isNote = dragState.shapeTool === 'sticky-note';
            const isLine = dragState.shapeTool === 'line' || dragState.shapeTool === 'arrow';
            const isCircle = dragState.shapeTool === 'circle' || dragState.shapeTool === 'polygon';
            return {
              ...o,
              width: isNote ? 180 : isCircle ? 110 : 160,
              height: isLine ? 24 : isNote ? 96 : isCircle ? 110 : 84
            };
          }
          return o;
        });
        pushSnapshot(pages, next, `Create ${dragState.shapeTool}`);
        return next;
      });
      setToolMode('select');
    } else if (
      dragState.mode === 'move' ||
      dragState.mode === 'resize' ||
      dragState.mode === 'rotate'
    ) {
      pushSnapshot(
        pages,
        objects,
        dragState.mode === 'move'
          ? 'Move Object'
          : dragState.mode === 'rotate'
          ? 'Rotate Object'
          : 'Resize Object'
      );
    }
    setDragState(null);
  }, [dragState, currentPage, pages, objects, pushSnapshot, updateObjectsWithHistory]);

  // Ensure mouseup outside the canvas still cleanly terminates active drag/resize/rotate/pan gestures
  useEffect(() => {
    if (!dragState) return;
    const onWindowMouseUp = () => {
      handleCanvasMouseUp();
    };
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => window.removeEventListener('mouseup', onWindowMouseUp);
  }, [dragState, handleCanvasMouseUp]);

  // Page Management Operations
  const handleAddBlankPage = () => {
    const newPageIndex = pages.length;
    const nextPages: PdfPageDescriptor[] = [
      ...pages,
      {
        pageIndex: newPageIndex,
        originalPageIndex: -1,
        width: 612,
        height: 792,
        rotation: 0,
        deleted: false
      }
    ];
    setPages(nextPages);
    pushSnapshot(nextPages, objects, 'Insert Blank Page');
    setCurrentPageIdx(nextPages.filter((p) => !p.deleted).length - 1);
  };

  const handleDuplicatePage = (pageDesc: PdfPageDescriptor) => {
    const newPageIdx = pages.length;
    const clonedPage: PdfPageDescriptor = {
      ...pageDesc,
      pageIndex: newPageIdx
    };
    const clonedObjs: PdfEditableObject[] = objects
      .filter((o) => o.pageIndex === pageDesc.pageIndex && !o.deleted)
      .map((o, idx) => ({
        ...JSON.parse(JSON.stringify(o)),
        id: `obj-p${newPageIdx + 1}-dup-${idx}-${Date.now().toString(36)}`,
        pageIndex: newPageIdx
      }));
    const nextPages = [...pages, clonedPage];
    const nextObjs = [...objects, ...clonedObjs];
    setPages(nextPages);
    setObjects(nextObjs);
    pushSnapshot(nextPages, nextObjs, `Duplicate Page ${pageDesc.pageIndex + 1}`);
  };

  const handleRotatePage = (pageDesc: PdfPageDescriptor) => {
    const nextPages = pages.map((p) =>
      p.pageIndex === pageDesc.pageIndex ? { ...p, rotation: (p.rotation + 90) % 360 } : p
    );
    setPages(nextPages);
    pushSnapshot(nextPages, objects, `Rotate Page ${pageDesc.pageIndex + 1}`);
  };

  const handleDeletePage = (pageDesc: PdfPageDescriptor) => {
    if (activePages.length <= 1) return;
    const nextPages = pages.map((p) =>
      p.pageIndex === pageDesc.pageIndex ? { ...p, deleted: true } : p
    );
    setPages(nextPages);
    pushSnapshot(nextPages, objects, `Delete Page ${pageDesc.pageIndex + 1}`);
    setCurrentPageIdx((prev) => Math.max(0, prev - 1));
  };

  const captureAndAnimatePageFlip = (callback: () => void) => {
    const railTargets = pageRailRef.current
      ? Array.from(pageRailRef.current.querySelectorAll('.editor-page-flip-item'))
      : [];
    const gridTargets = sorterGridRef.current
      ? Array.from(sorterGridRef.current.querySelectorAll('.sorter-page-flip-item'))
      : [];
    const allTargets = [...railTargets, ...gridTargets];
    const flipState = allTargets.length > 0 ? Flip.getState(allTargets) : null;

    callback();

    if (flipState) {
      requestAnimationFrame(() => {
        Flip.from(flipState, {
          duration: 0.28,
          ease: 'power3.out',
          scale: true
        });
      });
    }
  };

  const handleReorderPages = (fromActiveIdx: number, toActiveIdx: number) => {
    if (
      fromActiveIdx === toActiveIdx ||
      fromActiveIdx < 0 ||
      toActiveIdx < 0 ||
      fromActiveIdx >= activePages.length ||
      toActiveIdx >= activePages.length
    ) {
      return;
    }

    const currentActivePageId = activePages[currentPageIdx]?.pageIndex;
    const reorderedActive = [...activePages];
    const [movedPage] = reorderedActive.splice(fromActiveIdx, 1);
    reorderedActive.splice(toActiveIdx, 0, movedPage);

    const deletedPages = pages.filter((p) => p.deleted);
    const nextPages = [...reorderedActive, ...deletedPages];

    captureAndAnimatePageFlip(() => {
      setPages(nextPages);
      pushSnapshot(
        nextPages,
        objects,
        `Reorder Page ${fromActiveIdx + 1} → Page ${toActiveIdx + 1}`
      );

      if (currentPageIdx === fromActiveIdx) {
        setCurrentPageIdx(toActiveIdx);
      } else if (currentActivePageId !== undefined) {
        const nextCurrentIdx = reorderedActive.findIndex(
          (p) => p.pageIndex === currentActivePageId
        );
        if (nextCurrentIdx >= 0) {
          setCurrentPageIdx(nextCurrentIdx);
        }
      }
    });
  };

  const handleReversePagesOrder = () => {
    if (activePages.length <= 1) return;
    const reorderedActive = [...activePages].reverse();
    const deletedPages = pages.filter((p) => p.deleted);
    const nextPages = [...reorderedActive, ...deletedPages];
    captureAndAnimatePageFlip(() => {
      setPages(nextPages);
      pushSnapshot(nextPages, objects, 'Reverse Document Page Order');
      setCurrentPageIdx(0);
    });
  };

  const handleExtractSinglePage = async (pageDesc: PdfPageDescriptor, displayNum: number) => {
    if (!pdfBytes) return;
    try {
      const singlePageList: PdfPageDescriptor[] = [{ ...pageDesc, deleted: false }];
      const res = await exportEditedPdfDocument(pdfBytes, singlePageList, objects, {
        applyHiddenToExport,
        flattenForms: flattenFormsOnExport,
        stripMetadataOnRedact: true,
        documentTitle: `${docName.replace(/\.pdf$/i, '')}_page_${displayNum}`
      });
      const outName = `${docName.replace(/\.pdf$/i, '')}_page_${displayNum}.pdf`;
      triggerDownloadBytes(res.bytes, outName);
      setSaveStatus(`Extracted Page ${displayNum} (${(res.bytes.byteLength / 1024).toFixed(1)} KB)`);
    } catch (err: any) {
      setSaveStatus(`Extract failed: ${err?.message || 'Error'}`);
    }
  };

  // Insert Image Handler
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentPage) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const id = `obj-img-${Date.now().toString(36)}`;
      const imgObj: PdfEditableObject = {
        id,
        pageIndex: currentPage.pageIndex,
        type: 'added-image',
        name: `Image: ${file.name}`,
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 260,
        x: 96,
        y: 120,
        width: 220,
        height: 150,
        rotation: 0,
        opacity: 1,
        lockAspectRatio: true,
        imageDataUrl: dataUrl,
        imageMimeType: file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        crop: { top: 0, right: 0, bottom: 0, left: 0 }
      };
      updateObjectsWithHistory((prev) => [...prev, imgObj], `Insert Image ${file.name}`);
      setSelectedIds([id]);
      setToolMode('select');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Replace Image Handler (Preserves position & dimensions)
  const handleReplaceSelectedImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selectedIds.length === 0) return;
    const targetId = selectedIds[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      updateObjectsWithHistory(
        (prev) =>
          prev.map((o) =>
            o.id === targetId
              ? {
                  ...o,
                  name: `Image: ${file.name}`,
                  imageDataUrl: dataUrl,
                  imageMimeType: file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
                }
              : o
          ),
        `Replace Image with ${file.name}`
      );
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Signature Creation Handler
  const handleInsertSignature = async () => {
    if (!currentPage) return;
    let dataUrl: string | undefined;
    if (sigTab === 'draw' && sigCanvasRef.current) {
      dataUrl = sigCanvasRef.current.toDataURL('image/png');
    }
    const id = `obj-sig-${Date.now().toString(36)}`;
    const hashHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const sigObj: PdfEditableObject = {
      id,
      pageIndex: currentPage.pageIndex,
      type: 'signature',
      name: sigIsCrypto
        ? `Cryptographic Signature (${sigTypedText})`
        : `Visual Signature (${sigTypedText})`,
      isNative: false,
      visible: true,
      locked: false,
      deleted: false,
      zIndex: 350,
      x: 84,
      y: 380,
      width: 240,
      height: 68,
      rotation: 0,
      opacity: 1,
      text: sigTypedText,
      signerName: sigTypedText,
      imageDataUrl: dataUrl,
      signatureKind: sigIsCrypto
        ? 'cryptographic-sha256'
        : sigTab === 'draw'
        ? 'visual-drawn'
        : 'visual-typed',
      signatureHash: hashHex,
      color: '#1E1B4B',
      fontSize: 22
    };
    updateObjectsWithHistory((prev) => [...prev, sigObj], 'Apply Document Signature');
    setSelectedIds([id]);
    setSigModalOpen(false);
    setToolMode('select');
  };

  // Export & Verify Handler
  const handleExportAndVerify = async () => {
    if (!pdfBytes) return;
    setExporting(true);
    try {
      const result = await exportEditedPdfDocument(pdfBytes, pages, objects, {
        applyHiddenToExport,
        flattenForms: flattenFormsOnExport,
        stripMetadataOnRedact: true,
        scannedExportMode,
        documentTitle: docName.replace(/\.pdf$/i, '')
      });
      setVerificationReport({
        bytes: result.bytes,
        report: result.verification
      });
      const outName = docName.endsWith('.pdf')
        ? docName.replace(/\.pdf$/i, '_edited.pdf')
        : `${docName}_edited.pdf`;
      onRecordHistory(
        'edit-pdf',
        'Professional PDF Editor',
        docName,
        outName,
        result.bytes.byteLength,
        `Exported ${result.verification.exportedPageCount} pages (${result.verification.removedCount} deleted, ${result.verification.redactionCount} redacted, ${result.verification.ocrRegionsExportedCount || 0} OCR regions).`
      );
    } catch (err: any) {
      setSaveStatus(`Export failed: ${err?.message || 'Error'}`);
    } finally {
      setExporting(false);
    }
  };

  const triggerDownloadBytes = async (bytes: Uint8Array, filename: string) => {
    await saveProcessedDocumentSafe({
      bytes,
      suggestedFileName: filename,
      mimeType: 'application/pdf',
      originalFileName: docName
    });
  };

  // Filter objects on current page
  const pageObjects = objects.filter(
    (o) => o.pageIndex === (currentPage?.pageIndex ?? 0) && !o.deleted
  );

  const filteredPanelObjects = pageObjects.filter((o) => {
    if (objectFilter === 'all') return true;
    if (objectFilter === 'ocr-text') return o.type === 'ocr-text';
    if (objectFilter === 'native-text') return o.type === 'native-text';
    if (objectFilter === 'native-shape') return o.type === 'native-shape' || o.type === 'native-image';
    if (objectFilter === 'added') return !o.isNative && o.type !== 'ocr-text';
    if (objectFilter === 'shapes') return o.type === 'shape' || o.type === 'annotation';
    if (objectFilter === 'forms') return o.type === 'form-field' || Boolean(o.isScannedFormField);
    if (objectFilter === 'redaction') return o.type === 'redaction';
    if (objectFilter === 'hidden') return !o.visible;
    return true;
  });

  const primarySelectedObj =
    selectedIds.length > 0 ? objects.find((o) => o.id === selectedIds[0] && !o.deleted) : null;

  // Quick helper to insert preset annotations, stamps, headers, footers, page numbers, or checkboxes from contextual category panels
  const handleInsertCategoryPreset = (
    preset:
      | 'stamp-approved'
      | 'stamp-confidential'
      | 'stamp-draft'
      | 'callout'
      | 'header'
      | 'footer'
      | 'page-number'
      | 'checkbox-field'
      | 'underline-markup'
      | 'strike-markup'
  ) => {
    if (!currentPage) return;
    const id = `obj-p${currentPage.pageIndex + 1}-${preset}-${Date.now().toString(36)}`;
    let newObj: PdfEditableObject;

    if (preset === 'stamp-approved' || preset === 'stamp-confidential' || preset === 'stamp-draft') {
      const stampText =
        preset === 'stamp-approved'
          ? 'APPROVED'
          : preset === 'stamp-confidential'
          ? 'CONFIDENTIAL'
          : 'DRAFT';
      const stampColor =
        preset === 'stamp-approved'
          ? '#059669'
          : preset === 'stamp-confidential'
          ? '#E11D48'
          : '#D97706';
      newObj = {
        id,
        pageIndex: currentPage.pageIndex,
        type: 'watermark',
        name: `Stamp: ${stampText}`,
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 340,
        x: Math.round(currentPage.width / 2 - 90),
        y: Math.round(currentPage.height / 2 - 26),
        width: 180,
        height: 48,
        rotation: -12,
        opacity: 0.85,
        text: stampText,
        fontFamily: 'Helvetica',
        fontSize: 22,
        fontWeight: 'bold',
        color: stampColor,
        strokeColor: stampColor,
        strokeWidth: 2
      };
    } else if (preset === 'callout') {
      newObj = {
        id,
        pageIndex: currentPage.pageIndex,
        type: 'annotation',
        shapeKind: 'sticky-note',
        name: 'Callout Annotation',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 330,
        x: 72,
        y: 120,
        width: 210,
        height: 76,
        rotation: 0,
        opacity: 1,
        fillColor: '#ECFDF5',
        fillOpacity: 0.96,
        strokeColor: '#059669',
        strokeWidth: 2,
        strokeStyle: 'solid',
        cornerRadius: 8,
        color: '#064E3B',
        fontSize: 12,
        fontFamily: 'Helvetica',
        text: 'Callout: Verify section details here.'
      };
    } else if (preset === 'header' || preset === 'footer' || preset === 'page-number') {
      const isHeader = preset === 'header';
      const isFooter = preset === 'footer';
      newObj = {
        id,
        pageIndex: currentPage.pageIndex,
        type: 'added-text',
        name: isHeader ? 'Running Header' : isFooter ? 'Running Footer' : 'Page Number Stamp',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 310,
        x: isHeader || isFooter ? 48 : Math.round(currentPage.width - 130),
        y: isHeader ? 24 : Math.round(currentPage.height - 36),
        width: isHeader || isFooter ? 320 : 90,
        height: 22,
        rotation: 0,
        opacity: 0.85,
        text: isHeader
          ? `${docName.replace(/\.pdf$/i, '')} · Confidential`
          : isFooter
          ? 'Prepared via Local Desk Studio'
          : `Page ${currentPageIdx + 1} of ${Math.max(1, activePages.length)}`,
        fontFamily: 'Helvetica',
        fontSize: 10,
        fontWeight: 'normal',
        textAlign: isHeader || isFooter ? 'left' : 'right',
        color: '#475569'
      };
    } else if (preset === 'checkbox-field') {
      newObj = {
        id,
        pageIndex: currentPage.pageIndex,
        type: 'form-field',
        name: `Form Checkbox (${objects.filter((o) => o.type === 'form-field').length + 1})`,
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 335,
        x: 96,
        y: 220,
        width: 140,
        height: 28,
        rotation: 0,
        opacity: 1,
        fieldName: `checkbox_${Date.now().toString().slice(-4)}`,
        fieldType: 'checkbox',
        fieldValue: 'Checked',
        text: '☑ Approved / Verified',
        fontFamily: 'Helvetica',
        fontSize: 12,
        color: '#065F46',
        fillColor: '#ECFDF5',
        strokeColor: '#10B981',
        strokeWidth: 1.5
      };
    } else {
      const isStrike = preset === 'strike-markup';
      newObj = {
        id,
        pageIndex: currentPage.pageIndex,
        type: 'shape',
        shapeKind: 'line',
        name: isStrike ? 'Strikethrough Markup' : 'Underline Markup',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 330,
        x: primarySelectedObj ? primarySelectedObj.x : 96,
        y: primarySelectedObj
          ? isStrike
            ? Math.round(primarySelectedObj.y + primarySelectedObj.height / 2)
            : Math.round(primarySelectedObj.y + primarySelectedObj.height - 2)
          : 180,
        width: primarySelectedObj ? primarySelectedObj.width : 180,
        height: 6,
        rotation: 0,
        opacity: 1,
        transparentFill: true,
        fillOpacity: 0,
        strokeColor: isStrike ? '#E11D48' : '#059669',
        strokeWidth: 2,
        strokeStyle: 'solid'
      };
    }

    updateObjectsWithHistory((prev) => [...prev, newObj], `Insert ${newObj.name}`);
    setSelectedIds([id]);
    setToolMode('select');
    if (!pinnedCategory) setOpenCategory(null);
  };

  const activeCategoryForCurrentTool = getCategoryForToolMode(toolMode);

  return (
    <div className="flex-1 flex flex-col min-h-0 lg:h-full lg:overflow-hidden bg-theme-canvas text-theme-primary select-none">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            f.arrayBuffer().then((ab) => loadDocumentBytes(new Uint8Array(ab), f.name));
          }
          e.target.value = '';
        }}
      />
      <input
        ref={imageInsertInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleImageFileUpload}
      />
      <input
        ref={replaceImageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleReplaceSelectedImage}
      />

      {/* ========================================================= */}
      {/* TOP EDITOR TOOLBAR                                        */}
      {/* ========================================================= */}
      <div className="border-b border-theme-subtle bg-theme-surface px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand Icon, Back, Document Title, Save Status */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            title="Return to Local Desk Home"
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-theme-secondary hover:text-theme-primary hover:bg-theme-muted border border-theme-subtle cursor-pointer"
          >
            <LocalDeskLogo variant="app-icon" pixelSize={20} />
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit Studio</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-theme-secondary hover:text-theme-primary hover:bg-theme-muted border border-theme-subtle cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Open PDF
          </button>

          <button
            type="button"
            onClick={() => handleLoadScannedEnglishSample()}
            title="Load a synthetic Scanned English Document to test OCR font matching, text replacement positioning, alignment, and background reconstruction"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 border border-emerald-500/40 text-theme-accent hover:bg-emerald-500/25 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
            <span>Load Scanned Sample (EN)</span>
          </button>

          <div className="min-w-0">
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              aria-label="Document Name"
              className="text-sm font-bold bg-transparent text-theme-primary focus:outline-none focus:underline truncate max-w-[200px] sm:max-w-[260px]"
            />
            <div className="text-[11px] text-theme-muted truncate">{saveStatus}</div>
          </div>
        </div>

        {/* Center: Undo/Redo, Copy/Paste, Zoom, Page Nav, Sort, Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center border border-theme-subtle rounded-lg bg-theme-elevated p-0.5">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIdx <= 0}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              className="p-1.5 rounded text-theme-secondary hover:text-theme-primary disabled:opacity-35 cursor-pointer"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIdx >= history.length - 1}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
              className="p-1.5 rounded text-theme-secondary hover:text-theme-primary disabled:opacity-35 cursor-pointer"
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <span className="text-theme-subtle px-0.5">|</span>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => duplicateObjects(selectedIds)}
              title="Duplicate Selected (Ctrl+D)"
              aria-label="Duplicate Selected"
              className="p-1.5 rounded text-theme-secondary hover:text-theme-primary disabled:opacity-35 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => removeObjectsPermanently(selectedIds)}
              title="Delete Selected Object(s) (Del)"
              aria-label="Delete Selected"
              className="p-1.5 rounded text-rose-400 hover:bg-rose-500/15 disabled:opacity-35 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center border border-theme-subtle rounded-lg bg-theme-elevated p-0.5 text-xs font-mono tabular-nums">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))}
              aria-label="Zoom Out"
              className="p-1.5 text-theme-secondary hover:text-theme-primary cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1.0)}
              className="px-2 text-theme-primary hover:underline cursor-pointer"
              title="Reset Zoom to 100% (Actual Size)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.4, Math.round((z + 0.15) * 100) / 100))}
              aria-label="Zoom In"
              className="p-1.5 text-theme-secondary hover:text-theme-primary cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(0.85)}
              title="Fit Page in Viewport"
              className="hidden sm:inline-block px-2 py-1 border-l border-theme-subtle text-[11px] font-sans text-theme-secondary hover:text-theme-primary cursor-pointer"
            >
              Fit Page
            </button>
            <button
              type="button"
              onClick={() => setZoom(1.25)}
              title="Fit Page Width"
              className="hidden sm:inline-block px-2 py-1 border-l border-theme-subtle text-[11px] font-sans text-theme-secondary hover:text-theme-primary cursor-pointer"
            >
              Fit Width
            </button>
          </div>

          {/* Page Navigation */}
          <div className="flex items-center gap-1.5 border border-theme-subtle rounded-lg bg-theme-elevated px-2.5 py-1 text-xs font-mono tabular-nums">
            <button
              type="button"
              disabled={currentPageIdx <= 0}
              onClick={() => setCurrentPageIdx((p) => Math.max(0, p - 1))}
              className="text-theme-secondary hover:text-theme-primary disabled:opacity-35 cursor-pointer"
            >
              Prev
            </button>
            <span className="text-theme-muted">|</span>
            <span className="text-theme-primary font-semibold">
              Page {currentPageIdx + 1} / {Math.max(1, activePages.length)}
            </span>
            <span className="text-theme-muted">|</span>
            <button
              type="button"
              disabled={currentPageIdx >= activePages.length - 1}
              onClick={() => setCurrentPageIdx((p) => Math.min(activePages.length - 1, p + 1))}
              className="text-theme-secondary hover:text-theme-primary disabled:opacity-35 cursor-pointer"
            >
              Next
            </button>
          </div>

          {/* Spring Page Sorter Modal Trigger */}
          <button
            type="button"
            onClick={() => setPageSorterOpen(true)}
            title="Open Full-Canvas Spring Page Sorter"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-theme-subtle bg-theme-elevated text-xs font-semibold text-theme-primary hover:border-theme-accent transition-colors cursor-pointer"
          >
            <LayoutGrid className="w-3.5 h-3.5 text-theme-accent" />
            <span>Sort Pages ({activePages.length})</span>
          </button>

          {/* In-Document Text Search */}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-theme-subtle bg-theme-elevated">
            <Search className="w-3.5 h-3.5 text-theme-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find text on page..."
              className="w-28 bg-transparent text-xs text-theme-primary placeholder:text-theme-muted focus:outline-none"
            />
          </div>

          {/* Collapsible Panel Toggles */}
          <div className="hidden lg:flex items-center border border-theme-subtle rounded-lg bg-theme-elevated p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setLeftSidebarCollapsed((v) => !v)}
              className={`px-2 py-1 rounded cursor-pointer ${
                !leftSidebarCollapsed
                  ? 'bg-theme-surface text-theme-primary font-semibold'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
              title="Toggle Left Object & Pages Sidebar"
            >
              Left Panel
            </button>
            <button
              type="button"
              onClick={() => setRightPanelCollapsed((v) => !v)}
              className={`px-2 py-1 rounded cursor-pointer ${
                !rightPanelCollapsed
                  ? 'bg-theme-surface text-theme-primary font-semibold'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
              title="Toggle Right Properties Inspector"
            >
              Inspector
            </button>
          </div>
        </div>

        {/* Right: Scanned Export Mode, Hidden-on-Export Toggle & Primary Export CTA */}
        <div className="flex flex-wrap items-center gap-2">
          {pages.some((p) => p.isScannedCandidate || p.ocrProcessed) && (
            <select
              value={scannedExportMode}
              onChange={(e) => setScannedExportMode(e.target.value as ScannedExportMode)}
              title="Choose Scanned PDF Export Mode (Section 19)"
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary cursor-pointer"
            >
              <option value="visually-edited">Export Mode B: Visually Edited Scan</option>
              <option value="searchable-ocr">Export Mode A: Searchable Scanned PDF (Invisible OCR)</option>
              <option value="redacted-sanitized">Export Mode C: Redacted &amp; Sanitized Scan</option>
            </select>
          )}

          <label
            title="When enabled, objects hidden via the Eye toggle are omitted from the exported PDF"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-theme-secondary cursor-pointer px-2.5 py-1.5 rounded-lg border border-theme-subtle bg-theme-elevated"
          >
            <input
              type="checkbox"
              checked={applyHiddenToExport}
              onChange={(e) => setApplyHiddenToExport(e.target.checked)}
              className="rounded"
            />
            <span>Omit Hidden on Export</span>
          </label>

          <button
            type="button"
            onClick={handleExportAndVerify}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold bg-theme-accent text-white hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Verifying & Exporting...' : 'Export & Verify PDF'}
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* UNIFIED CATEGORY-BASED EDITOR TOOLBAR & CONTEXTUAL PANELS */}
      {/* ========================================================= */}
      <div
        ref={toolbarContainerRef}
        onPointerLeave={handleToolbarAreaPointerLeave}
        className="relative z-30 border-b border-theme-subtle bg-theme-surface px-4 py-1.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: 10 Top-Level Tool Categories (Hover + Click/Pin + Keyboard Nav) */}
          <div
            role="menubar"
            aria-label="PDF Editor Tool Categories"
            className="flex items-center gap-1 overflow-x-auto py-0.5"
          >
            {TOOLBAR_CATEGORY_ORDER.map((cat, idx) => {
              const Icon = cat.icon;
              const isOpen = openCategory === cat.id;
              const isPinned = pinnedCategory === cat.id;
              const isActiveToolCat = activeCategoryForCurrentTool === cat.id;
              const showSubToolBadge =
                isActiveToolCat && toolMode !== 'select' && TOOL_MODE_LABELS[toolMode];

              return (
                <button
                  key={cat.id}
                  ref={(el) => {
                    categoryBtnRefs.current[cat.id] = el;
                  }}
                  type="button"
                  role="menuitem"
                  aria-haspopup="true"
                  aria-expanded={isOpen}
                  onPointerEnter={(e) => handleCategoryPointerEnter(cat.id, e)}
                  onClick={() => handleCategoryClick(cat.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      const next =
                        TOOLBAR_CATEGORY_ORDER[(idx + 1) % TOOLBAR_CATEGORY_ORDER.length];
                      categoryBtnRefs.current[next.id]?.focus();
                      setOpenCategory(next.id);
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const prev =
                        TOOLBAR_CATEGORY_ORDER[
                          (idx - 1 + TOOLBAR_CATEGORY_ORDER.length) %
                            TOOLBAR_CATEGORY_ORDER.length
                        ];
                      categoryBtnRefs.current[prev.id]?.focus();
                      setOpenCategory(prev.id);
                    } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPinnedCategory(cat.id);
                      setOpenCategory(cat.id);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      closeToolbarPanel();
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
                    isOpen
                      ? 'bg-theme-elevated text-theme-primary border-theme-accent shadow-xs'
                      : isActiveToolCat
                      ? 'bg-emerald-500/15 text-theme-primary border-emerald-500/40'
                      : 'border-transparent text-theme-secondary hover:text-theme-primary hover:bg-theme-elevated/70'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isOpen || isActiveToolCat ? 'text-theme-accent' : 'text-theme-secondary'
                    }`}
                  />
                  <span>{cat.label}</span>
                  {showSubToolBadge && (
                    <span className="px-1.5 py-0.2 rounded bg-theme-accent text-white text-[10px] font-mono">
                      {TOOL_MODE_LABELS[toolMode]}
                    </span>
                  )}
                  {isPinned ? (
                    <Pin className="w-3 h-3 text-theme-accent" />
                  ) : (
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-150 ${
                        isOpen ? 'rotate-180 text-theme-accent' : 'opacity-60'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: Compact Active Mode & Scanned / OCR Status Strip */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Active Tool Quick Reset if not Select */}
            {toolMode !== 'select' && (
              <button
                type="button"
                onClick={() => setToolMode('select')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-500/25 cursor-pointer"
                title="Click to return to Select & Transform mode (Esc)"
              >
                <span>Mode: {TOOL_MODE_LABELS[toolMode]}</span>
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Page Classification Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono font-bold text-[10px] border ${
                currentPage?.pageClassification === 'scanned'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : currentPage?.pageClassification === 'mixed'
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              }`}
            >
              {currentPage?.pageClassification === 'scanned'
                ? 'SCANNED PAGE'
                : currentPage?.pageClassification === 'mixed'
                ? 'MIXED SCAN'
                : 'NATIVE PDF'}
            </span>

            {currentPage?.ocrProcessed && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-theme-elevated border border-theme-subtle text-theme-secondary text-[10px] font-mono">
                OCR (ENG): {currentPage.ocrRegionCount || 0} regions · {currentPage.ocrAvgConfidence || 94}%
              </span>
            )}

            {ocrRunning ? (
              <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 rounded-md">
                <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] font-mono text-emerald-200">
                  {ocrProgressText} ({ocrProgressPct}%)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    ocrCancelRef.current = true;
                  }}
                  className="px-1.5 py-0.5 rounded bg-rose-500/25 border border-rose-500/40 text-rose-200 text-[10px] font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleRunOcr('current-page')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                title="Run English OCR on the current page to make scanned text directly editable"
              >
                <Sparkles className="w-3 h-3 text-theme-accent" />
                <span>
                  {currentPage?.ocrProcessed
                    ? `Re-run OCR (P${currentPageIdx + 1})`
                    : `Recognize Text (OCR P${currentPageIdx + 1})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* CONTEXTUAL CATEGORY TOOL PANEL (HOVER OR PINNED POPOVER)  */}
        {/* ========================================================= */}
        <AnimatePresence>
          {openCategory && (
            <motion.div
              key={openCategory}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              onPointerEnter={() => clearHoverCloseTimeout()}
              onPointerLeave={handleToolbarAreaPointerLeave}
              role="region"
              aria-label={`${
                TOOLBAR_CATEGORY_ORDER.find((c) => c.id === openCategory)?.label || ''
              } Tools Panel`}
              className="mt-1.5 p-3.5 rounded-xl bg-theme-elevated border border-theme-strong shadow-2xl space-y-3"
            >
              {/* Panel Top Bar: Category Title, Description, Pin Status & Close */}
              <div className="flex items-center justify-between gap-4 pb-2 border-b border-theme-subtle">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-theme-primary">
                    {TOOLBAR_CATEGORY_ORDER.find((c) => c.id === openCategory)?.label} Tools
                  </span>
                  <span className="text-[11px] text-theme-secondary">
                    · {TOOLBAR_CATEGORY_ORDER.find((c) => c.id === openCategory)?.shortDesc}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPinnedCategory((prev) => (prev === openCategory ? null : openCategory))
                    }
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer ${
                      pinnedCategory === openCategory
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-theme-surface border-theme-subtle text-theme-muted hover:text-theme-primary'
                    }`}
                    title="Pin or unpin this tool panel so it stays open while editing"
                  >
                    <Pin className="w-3 h-3" />
                    <span>{pinnedCategory === openCategory ? 'Pinned Open' : 'Pin Panel'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeToolbarPanel}
                    aria-label="Close Tool Panel"
                    className="p-1 rounded bg-theme-surface border border-theme-subtle text-theme-muted hover:text-theme-primary cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 1. SELECT CATEGORY PANEL */}
              {openCategory === 'select' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Selection Mode
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('select')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'select'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <MousePointer className="w-3.5 h-3.5" />
                        <span>Select &amp; Transform</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('pan')}
                        title="Pan Canvas (or hold Spacebar + Drag)"
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'pan'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <Hand className="w-3.5 h-3.5" />
                        <span>Pan Canvas (Space)</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && cycleOverlappingObjects(primarySelectedObj)
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                        title="Select object underneath current selection (or Alt+Click on canvas)"
                      >
                        <Layers className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Select Underneath (Alt+Click)</span>
                      </button>
                      <button
                        type="button"
                        disabled={selectedIds.length === 0}
                        onClick={() => {
                          setSelectedIds([]);
                          setEditingTextObjId(null);
                        }}
                        className="px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary disabled:opacity-40 cursor-pointer"
                      >
                        Deselect All (Esc)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Clipboard &amp; Quick Object Actions
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={selectedIds.length === 0}
                        onClick={() => duplicateObjects(selectedIds)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Duplicate (Ctrl+D)</span>
                      </button>
                      <button
                        type="button"
                        disabled={selectedIds.length === 0}
                        onClick={() => {
                          const copied = objects.filter(
                            (o) => selectedIds.includes(o.id) && !o.deleted
                          );
                          setClipboardObjs(JSON.parse(JSON.stringify(copied)));
                          setSaveStatus(`Copied ${copied.length} object(s) to clipboard`);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy (Ctrl+C)</span>
                      </button>
                      <button
                        type="button"
                        disabled={clipboardObjs.length === 0 || !currentPage}
                        onClick={() => {
                          if (!currentPage || clipboardObjs.length === 0) return;
                          const newIds: string[] = [];
                          updateObjectsWithHistory((prev) => {
                            const pasted = clipboardObjs.map((o, i) => {
                              const pid = `obj-paste-${Date.now().toString(36)}-${i}`;
                              newIds.push(pid);
                              return {
                                ...JSON.parse(JSON.stringify(o)),
                                id: pid,
                                pageIndex: currentPage.pageIndex,
                                isNative: false,
                                type:
                                  o.type === 'native-text'
                                    ? 'added-text'
                                    : o.type === 'native-shape'
                                    ? 'shape'
                                    : o.type,
                                x: Math.min(currentPage.width - 40, o.x + 20),
                                y: Math.min(currentPage.height - 30, o.y + 20),
                                zIndex: o.zIndex + 15
                              };
                            });
                            return [...prev, ...pasted];
                          }, `Paste ${clipboardObjs.length} Object(s)`);
                          setTimeout(() => setSelectedIds(newIds), 0);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        <span>Paste ({clipboardObjs.length})</span>
                      </button>
                      <button
                        type="button"
                        disabled={selectedIds.length === 0}
                        onClick={() => removeObjectsPermanently(selectedIds)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete (Del)</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Selection Filter on Canvas
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'all', label: 'All Objects' },
                          { id: 'ocr-text', label: 'OCR Text' },
                          { id: 'native-text', label: 'Native Text' },
                          { id: 'shapes', label: 'Shapes' }
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setObjectFilter(f.id);
                            setSidebarTab('objects');
                          }}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                            objectFilter === f.id
                              ? 'bg-theme-accent text-white border-theme-accent'
                              : 'bg-theme-surface border-theme-subtle text-theme-secondary hover:text-theme-primary'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. TEXT CATEGORY PANEL */}
              {openCategory === 'text' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Text Creation &amp; Inline Editing
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('add-text')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'add-text'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Text</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('edit-text')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'edit-text'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <Type className="w-3.5 h-3.5" />
                        <span>Edit Text</span>
                      </button>
                      {primarySelectedObj &&
                        (primarySelectedObj.type === 'native-text' ||
                          primarySelectedObj.type === 'added-text' ||
                          primarySelectedObj.type === 'ocr-text') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTextObjId(primarySelectedObj.id);
                              if (!pinnedCategory) setOpenCategory(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-semibold hover:bg-emerald-500/25 cursor-pointer"
                          >
                            <span>Inline Edit Selected</span>
                          </button>
                        )}
                    </div>
                  </div>

                  {/* Quick Typography Controls */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Typography (Font, Size, Weight, Align &amp; Color)
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={primarySelectedObj?.fontFamily || 'Helvetica'}
                        disabled={!primarySelectedObj}
                        onChange={(e) => {
                          if (!primarySelectedObj) return;
                          const fam = e.target.value as PdfFontFamily;
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id ? { ...o, fontFamily: fam } : o
                              ),
                            `Set Font Family to ${fam}`
                          );
                        }}
                        className="px-2 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary text-[11px] disabled:opacity-45 cursor-pointer"
                      >
                        <option value="Helvetica">Helvetica (Sans)</option>
                        <option value="Times-Roman">Times Roman (Serif)</option>
                        <option value="Courier">Courier (Mono)</option>
                      </select>

                      <input
                        type="number"
                        min={6}
                        max={96}
                        disabled={!primarySelectedObj}
                        value={Math.round(primarySelectedObj?.fontSize || 14)}
                        onChange={(e) => {
                          if (!primarySelectedObj) return;
                          const sz = Math.max(6, Math.min(96, Number(e.target.value) || 14));
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id ? { ...o, fontSize: sz } : o
                              ),
                            `Set Font Size to ${sz}pt`
                          );
                        }}
                        className="w-16 px-2 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary font-mono text-[11px] disabled:opacity-45"
                        title="Font Size (pt)"
                      />

                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() => {
                          if (!primarySelectedObj) return;
                          const nextW =
                            primarySelectedObj.fontWeight === 'bold' ? 'normal' : 'bold';
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id ? { ...o, fontWeight: nextW } : o
                              ),
                            `Toggle Bold`
                          );
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border font-bold text-[11px] disabled:opacity-45 cursor-pointer ${
                          primarySelectedObj?.fontWeight === 'bold'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary'
                        }`}
                      >
                        B
                      </button>

                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() => {
                          if (!primarySelectedObj) return;
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? {
                                      ...o,
                                      fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic'
                                    }
                                  : o
                              ),
                            `Toggle Italic`
                          );
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border italic text-[11px] disabled:opacity-45 cursor-pointer ${
                          primarySelectedObj?.fontStyle === 'italic'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary'
                        }`}
                      >
                        I
                      </button>

                      {(
                        [
                          { align: 'left', icon: AlignLeft },
                          { align: 'center', icon: AlignCenter },
                          { align: 'right', icon: AlignRight }
                        ] as const
                      ).map((al) => {
                        const AlIcon = al.icon;
                        return (
                          <button
                            key={al.align}
                            type="button"
                            disabled={!primarySelectedObj}
                            onClick={() => {
                              if (!primarySelectedObj) return;
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === primarySelectedObj.id
                                      ? { ...o, textAlign: al.align }
                                      : o
                                  ),
                                `Align Text ${al.align}`
                              );
                            }}
                            className={`p-1.5 rounded-lg border disabled:opacity-45 cursor-pointer ${
                              (primarySelectedObj?.textAlign || 'left') === al.align
                                ? 'bg-theme-accent text-white border-theme-accent'
                                : 'bg-theme-surface border-theme-subtle text-theme-secondary'
                            }`}
                          >
                            <AlIcon className="w-3.5 h-3.5" />
                          </button>
                        );
                      })}

                      <input
                        type="color"
                        disabled={!primarySelectedObj}
                        value={primarySelectedObj?.color || '#18181B'}
                        onChange={(e) => {
                          if (!primarySelectedObj) return;
                          const col = e.target.value;
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id ? { ...o, color: col } : o
                              ),
                            `Change Text Color`
                          );
                        }}
                        className="w-7 h-7 rounded border border-theme-subtle bg-theme-surface cursor-pointer disabled:opacity-45"
                        title="Text Color"
                      />
                    </div>
                  </div>

                  {/* Scanned Text (English OCR & Style Reconstruction) */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Scanned Text (English OCR &amp; Style Matching)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={ocrRunning}
                        onClick={() => handleRunOcr('current-page')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-theme-accent text-white font-semibold hover:opacity-95 disabled:opacity-45 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Recognize Text (OCR Page {currentPageIdx + 1})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const firstOcr = pageObjects.find((o) => o.type === 'ocr-text');
                          if (firstOcr) {
                            setSelectedIds([firstOcr.id]);
                            setObjectFilter('ocr-text');
                            setSidebarTab('objects');
                          } else {
                            handleRunOcr('current-page');
                          }
                        }}
                        className="px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        Select Recognized Text
                      </button>
                      {primarySelectedObj?.type === 'ocr-text' && (
                        <button
                          type="button"
                          onClick={() => handleMatchOriginalTextStyle(primarySelectedObj.id)}
                          className="px-2.5 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-semibold hover:bg-emerald-500/25 cursor-pointer"
                        >
                          Match Original Text Style
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleLoadScannedEnglishSample()}
                        className="px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        Load Scanned Sample (EN)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. IMAGES CATEGORY PANEL */}
              {openCategory === 'images' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Insert &amp; Replace Image
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          imageInsertInputRef.current?.click();
                          if (!pinnedCategory) setOpenCategory(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-accent text-white font-semibold hover:opacity-95 cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Insert Image (PNG / JPG / WebP)</span>
                      </button>
                      <button
                        type="button"
                        disabled={
                          !primarySelectedObj ||
                          (primarySelectedObj.type !== 'added-image' &&
                            primarySelectedObj.type !== 'native-image')
                        }
                        onClick={() => replaceImageInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Replace Selected Image</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Selected Image Controls (Rotate, Aspect Lock, Crop &amp; Delete)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() => {
                          if (!primarySelectedObj) return;
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, rotation: ((o.rotation || 0) + 90) % 360 }
                                  : o
                              ),
                            'Rotate Image +90°'
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Rotate +90°</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() => {
                          if (!primarySelectedObj) return;
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, lockAspectRatio: !o.lockAspectRatio }
                                  : o
                              ),
                            'Toggle Image Aspect Ratio Lock'
                          );
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg border disabled:opacity-40 cursor-pointer ${
                          primarySelectedObj?.lockAspectRatio
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-semibold'
                            : 'bg-theme-surface border-theme-subtle text-theme-secondary'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>
                          {primarySelectedObj?.lockAspectRatio
                            ? 'Aspect Ratio Locked'
                            : 'Lock Aspect Ratio'}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() => {
                          if (!primarySelectedObj) return;
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, crop: { top: 0, right: 0, bottom: 0, left: 0 } }
                                  : o
                              ),
                            'Reset Image Crop'
                          );
                        }}
                        className="px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary disabled:opacity-40 cursor-pointer"
                      >
                        Reset Crop
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && removeObjectsPermanently([primarySelectedObj.id])
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Image</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. SHAPES CATEGORY PANEL */}
              {openCategory === 'shapes' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Basic Shapes
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'rectangle', label: 'Rectangle', icon: Square },
                          { id: 'rounded-rectangle', label: 'Rounded Rectangle', icon: Square },
                          { id: 'circle', label: 'Circle', icon: Circle },
                          { id: 'ellipse', label: 'Ellipse', icon: Circle }
                        ] as const
                      ).map((sh) => {
                        const ShIcon = sh.icon;
                        return (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() => selectToolAndCloseUnpinned(sh.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                              toolMode === sh.id
                                ? 'bg-theme-accent text-white border-theme-accent'
                                : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                            }`}
                          >
                            <ShIcon className="w-3.5 h-3.5" />
                            <span>{sh.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Lines &amp; Arrows
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('line')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'line'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                        <span>Line</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('arrow')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'arrow'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Arrow</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Polygons &amp; Custom Drawing
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('polygon')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'polygon'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <Hexagon className="w-3.5 h-3.5" />
                        <span>Polygon</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('freehand')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'freehand'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Custom Path / Freeform</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. EFFECTS CATEGORY PANEL */}
              {openCategory === 'effects' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Cover / Blur Overlays
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('cover-overlay')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'cover-overlay'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <Eraser className="w-3.5 h-3.5" />
                        <span>Draw Cover / Blur Overlay</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj &&
                          coverObjectWithOverlay(primarySelectedObj.id, false)
                        }
                        className="px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        Cover Selected (Whiteout)
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj &&
                          coverObjectWithOverlay(primarySelectedObj.id, true)
                        }
                        className="px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        Cover Selected (Blur)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Fill Color &amp; Transparency
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {QUICK_COLOR_SWATCHES.slice(0, 7).map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          disabled={!primarySelectedObj}
                          onClick={() => {
                            if (!primarySelectedObj) return;
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, fillColor: hex, transparentFill: false }
                                    : o
                                ),
                              `Set Fill Color ${hex}`
                            );
                          }}
                          style={{ backgroundColor: hex }}
                          className="w-6 h-6 rounded-md border border-theme-strong cursor-pointer disabled:opacity-35"
                          title={`Set Fill ${hex}`}
                        />
                      ))}
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() => {
                          if (!primarySelectedObj) return;
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, transparentFill: !o.transparentFill }
                                  : o
                              ),
                            'Toggle Transparent Fill'
                          );
                        }}
                        className={`px-2 py-1 rounded border text-[11px] disabled:opacity-40 cursor-pointer ${
                          primarySelectedObj?.transparentFill
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-secondary'
                        }`}
                      >
                        Transparent Fill
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Background Blur, Shadow &amp; Opacity
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[0, 6, 12, 18].map((blurPx) => (
                        <button
                          key={blurPx}
                          type="button"
                          disabled={!primarySelectedObj}
                          onClick={() => {
                            if (!primarySelectedObj) return;
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, backdropBlur: blurPx }
                                    : o
                                ),
                              `Set Background Blur ${blurPx}px`
                            );
                          }}
                          className={`px-2 py-1 rounded border text-[11px] font-mono disabled:opacity-40 cursor-pointer ${
                            (primarySelectedObj?.backdropBlur || 0) === blurPx
                              ? 'bg-theme-accent text-white border-theme-accent'
                              : 'bg-theme-surface border-theme-subtle text-theme-secondary'
                          }`}
                        >
                          Blur {blurPx}px
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() => {
                          if (!primarySelectedObj) return;
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? {
                                      ...o,
                                      shadow: o.shadow?.enabled
                                        ? { ...o.shadow, enabled: false }
                                        : {
                                            enabled: true,
                                            color: 'rgba(0,0,0,0.28)',
                                            blur: 12,
                                            offsetX: 0,
                                            offsetY: 4
                                          }
                                    }
                                  : o
                              ),
                            'Toggle Drop Shadow'
                          );
                        }}
                        className={`px-2 py-1 rounded border text-[11px] disabled:opacity-40 cursor-pointer ${
                          primarySelectedObj?.shadow?.enabled
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-secondary'
                        }`}
                      >
                        Drop Shadow
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 6. ARRANGE CATEGORY PANEL */}
              {openCategory === 'arrange' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Layer Stacking Order
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && changeStackOrder(primarySelectedObj.id, 'front')
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        Bring to Front
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && changeStackOrder(primarySelectedObj.id, 'forward')
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                        <span>Bring Forward</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && changeStackOrder(primarySelectedObj.id, 'backward')
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                        <span>Send Backward</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && changeStackOrder(primarySelectedObj.id, 'back')
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        Send to Back
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Align &amp; Distribute (Select 2+ Objects)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'left', label: 'Left' },
                          { id: 'center', label: 'Center' },
                          { id: 'right', label: 'Right' },
                          { id: 'top', label: 'Top' },
                          { id: 'middle', label: 'Middle' },
                          { id: 'bottom', label: 'Bottom' },
                          { id: 'distribute-h', label: 'Distribute H' },
                          { id: 'distribute-v', label: 'Distribute V' }
                        ] as const
                      ).map((al) => (
                        <button
                          key={al.id}
                          type="button"
                          disabled={selectedIds.length < 2}
                          onClick={() => alignSelectedObjects(al.id)}
                          className="px-2 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-accent disabled:opacity-35 cursor-pointer text-[11px]"
                        >
                          {al.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Group, Lock &amp; Visibility
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={selectedIds.length < 2}
                        onClick={handleGroupSelected}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <Group className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Group</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj?.groupId}
                        onClick={handleUngroupSelected}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        <Ungroup className="w-3.5 h-3.5" />
                        <span>Ungroup</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && toggleObjectVisibility([primarySelectedObj.id])
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        {primarySelectedObj?.visible === false ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                        <span>{primarySelectedObj?.visible === false ? 'Show' : 'Hide'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && toggleObjectLock([primarySelectedObj.id])
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent disabled:opacity-40 cursor-pointer"
                      >
                        {primarySelectedObj?.locked ? (
                          <Unlock className="w-3.5 h-3.5" />
                        ) : (
                          <Lock className="w-3.5 h-3.5" />
                        )}
                        <span>{primarySelectedObj?.locked ? 'Unlock' : 'Lock'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={restoreAllHiddenObjects}
                        className="px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                      >
                        Restore All Hidden
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 7. ANNOTATE CATEGORY PANEL */}
              {openCategory === 'annotate' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Text Markup
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('highlight')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'highlight'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <Highlighter className="w-3.5 h-3.5" />
                        <span>Highlight</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('underline-markup')}
                        className="px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer underline"
                      >
                        Underline
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('strike-markup')}
                        className="px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer line-through"
                      >
                        Strikethrough
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Comments, Callouts &amp; Freehand Ink
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('sticky-note')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'sticky-note'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <StickyNote className="w-3.5 h-3.5" />
                        <span>Sticky Note</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('callout')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Callout Box</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('freehand')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'freehand'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Freehand Ink</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Signatures &amp; Stamps
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSigModalOpen(true);
                          if (!pinnedCategory) setOpenCategory(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-accent text-white font-semibold hover:opacity-95 cursor-pointer"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Sign PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('stamp-approved')}
                        className="px-2.5 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-mono font-bold text-[11px] cursor-pointer"
                      >
                        APPROVED
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('stamp-confidential')}
                        className="px-2.5 py-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-400 font-mono font-bold text-[11px] cursor-pointer"
                      >
                        CONFIDENTIAL
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('stamp-draft')}
                        className="px-2.5 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 font-mono font-bold text-[11px] cursor-pointer"
                      >
                        DRAFT
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 8. PAGE DESIGN CATEGORY PANEL */}
              {openCategory === 'page-design' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Watermarks, Headers, Footers &amp; Page Numbers
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('watermark')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'watermark'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <Stamp className="w-3.5 h-3.5" />
                        <span>Watermark Tool</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('header')}
                        className="px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        + Header Text
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('footer')}
                        className="px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        + Footer Text
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('page-number')}
                        className="px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        + Page Number
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Page Structure &amp; Organization
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={handleAddBlankPage}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Add Blank Page</span>
                      </button>
                      {currentPage && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDuplicatePage(currentPage)}
                            className="px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                          >
                            Duplicate Page
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRotatePage(currentPage)}
                            className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                          >
                            <RotateCw className="w-3.5 h-3.5 text-theme-accent" />
                            <span>Rotate Page +90°</span>
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={handleReversePagesOrder}
                        className="px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                      >
                        Reverse Page Order
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPageSorterOpen(true);
                          if (!pinnedCategory) setOpenCategory(null);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        <LayoutGrid className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Open Page Sorter</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 9. FORMS CATEGORY PANEL */}
              {openCategory === 'forms' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Interactive Form Controls
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('form-field')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'form-field'
                            ? 'bg-theme-accent text-white border-theme-accent'
                            : 'bg-theme-surface border-theme-subtle text-theme-primary hover:border-theme-accent'
                        }`}
                      >
                        <FormInput className="w-3.5 h-3.5" />
                        <span>Add Text Form Field</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCategoryPreset('checkbox-field')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Add Checkbox Field</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSidebarTab('forms');
                          setLeftSidebarCollapsed(false);
                          if (!pinnedCategory) setOpenCategory(null);
                        }}
                        className="px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                      >
                        Open AcroForm Directory
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Form Export Behavior
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={flattenFormsOnExport}
                          onChange={(e) => setFlattenFormsOnExport(e.target.checked)}
                          className="rounded"
                        />
                        <span>Flatten Form Fields into Static Content on Export</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 10. MORE CATEGORY PANEL */}
              {openCategory === 'more' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      Sanitization &amp; Permanent Redaction
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => selectToolAndCloseUnpinned('redact')}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold border cursor-pointer ${
                          toolMode === 'redact'
                            ? 'bg-rose-600 text-white border-rose-500'
                            : 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Permanent Redact Tool</span>
                      </button>
                      <button
                        type="button"
                        disabled={!primarySelectedObj}
                        onClick={() =>
                          primarySelectedObj && convertObjectToRedaction(primarySelectedObj.id)
                        }
                        className="px-2.5 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-rose-500/40 disabled:opacity-40 cursor-pointer"
                      >
                        Mark Selected for Redaction
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      OCR Preprocessing &amp; Scanned Diagnostics
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={ocrPreprocessMode}
                        onChange={(e) => setOcrPreprocessMode(e.target.value as OcrPreprocessMode)}
                        disabled={ocrRunning}
                        className="px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary text-[11px] cursor-pointer"
                      >
                        <option value="auto-enhance">Preprocess: Auto Enhance</option>
                        <option value="grayscale-contrast">Preprocess: Grayscale</option>
                        <option value="adaptive-threshold">Preprocess: Adaptive Threshold</option>
                        <option value="denoise">Preprocess: Speckle Denoise</option>
                        <option value="none">Preprocess: Raw Scan Bitmap</option>
                      </select>

                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showOcrBoundaries}
                          onChange={(e) => setShowOcrBoundaries(e.target.checked)}
                          className="rounded"
                        />
                        <span>OCR Boxes</span>
                      </label>

                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showOcrCoordinateDebug}
                          onChange={(e) => setShowOcrCoordinateDebug(e.target.checked)}
                          className="rounded"
                        />
                        <span>Coord Debug</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => setCompareOriginalScan((v) => !v)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                          compareOriginalScan
                            ? 'bg-amber-500 text-black border-amber-400'
                            : 'bg-theme-surface border-theme-subtle text-theme-secondary hover:text-theme-primary'
                        }`}
                      >
                        {compareOriginalScan ? 'Viewing Original Scan' : 'Compare Original Scan'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-theme-muted">
                      PDF Content Stream &amp; Export Options
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSidebarTab('structure');
                          setLeftSidebarCollapsed(false);
                          if (!pinnedCategory) setOpenCategory(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                      >
                        <Code2 className="w-3.5 h-3.5 text-theme-accent" />
                        <span>Inspect Content Stream</span>
                      </button>
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-theme-surface border border-theme-subtle text-theme-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyHiddenToExport}
                          onChange={(e) => setApplyHiddenToExport(e.target.checked)}
                          className="rounded"
                        />
                        <span>Omit Hidden on Export</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ========================================================= */}
      {/* MAIN 3-COLUMN EDITOR WORKSPACE                            */}
      {/* ========================================================= */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 lg:overflow-hidden">
        {/* --------------------------------------------------------- */}
        {/* LEFT SIDEBAR: Pages, Object & Layer Manager, Outline, Forms */}
        {/* --------------------------------------------------------- */}
        {!leftSidebarCollapsed && (
          <aside className="lg:col-span-3 border-r border-theme-subtle bg-theme-surface flex flex-col min-h-[340px] lg:h-full lg:min-h-0 overflow-hidden">
            {/* Sidebar Navigation Tabs */}
            <div className="grid grid-cols-6 border-b border-theme-subtle bg-theme-elevated text-[11px] font-semibold">
              {(
                [
                  { id: 'objects', label: 'Layers', icon: Layers },
                  { id: 'pages', label: 'Pages', icon: FileText },
                  { id: 'outline', label: 'Outline', icon: BookOpen },
                  { id: 'annotations', label: 'Shapes', icon: MessageSquare },
                  { id: 'forms', label: 'Forms', icon: FormInput },
                  { id: 'structure', label: 'Stream', icon: Code2 }
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = sidebarTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSidebarTab(tab.id)}
                    className={`flex flex-col items-center justify-center py-2 px-1 border-b-2 transition-colors cursor-pointer ${
                      active
                        ? 'border-theme-accent text-theme-primary bg-theme-surface'
                        : 'border-transparent text-theme-muted hover:text-theme-primary'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 mb-0.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: OBJECT & LAYER MANAGEMENT PANEL */}
            {sidebarTab === 'objects' && (
              <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-hidden">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-theme-primary">
                      Page {currentPageIdx + 1} Layers ({filteredPanelObjects.length})
                    </span>
                    <label className="inline-flex items-center gap-1 text-[11px] text-theme-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showHiddenOutlines}
                        onChange={(e) => setShowHiddenOutlines(e.target.checked)}
                        className="rounded"
                      />
                      <span>Ghost Hidden</span>
                    </label>
                  </div>

                  {/* Filter buttons */}
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { id: 'all', label: 'All' },
                        {
                          id: 'ocr-text',
                          label: `OCR Text (${pageObjects.filter((o) => o.type === 'ocr-text').length})`
                        },
                        { id: 'native-text', label: 'PDF Text' },
                        { id: 'native-shape', label: 'PDF Graphics' },
                        { id: 'added', label: 'Added' },
                        { id: 'shapes', label: 'Shapes/Covers' },
                        { id: 'forms', label: 'Forms' },
                        { id: 'redaction', label: 'Redactions' },
                        {
                          id: 'hidden',
                          label: `Hidden (${pageObjects.filter((o) => !o.visible).length})`
                        }
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setObjectFilter(f.id)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium cursor-pointer ${
                          objectFilter === f.id
                            ? 'bg-theme-accent text-white'
                            : 'bg-theme-muted text-theme-secondary hover:text-theme-primary'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Batch Object Actions */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={selectedIds.length === 0}
                      onClick={() => toggleObjectVisibility(selectedIds)}
                      className="px-2 py-1 rounded text-[11px] font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:bg-theme-muted disabled:opacity-40 cursor-pointer"
                    >
                      Hide/Show ({selectedIds.length})
                    </button>
                    <button
                      type="button"
                      disabled={selectedIds.length === 0}
                      onClick={() => removeObjectsPermanently(selectedIds)}
                      className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 disabled:opacity-40 cursor-pointer"
                    >
                      Delete Object(s)
                    </button>
                    {pageObjects.some((o) => !o.visible) && (
                      <button
                        type="button"
                        onClick={restoreAllHiddenObjects}
                        className="px-2 py-1 rounded text-[11px] font-semibold text-theme-accent hover:underline cursor-pointer"
                      >
                        Restore All
                      </button>
                    )}
                  </div>
                </div>

                {/* Scrollable Object List (Ordered top-most zIndex first like Figma) */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {filteredPanelObjects.length === 0 ? (
                    <div className="py-8 text-center text-xs text-theme-muted">
                      No objects match the current filter on Page {currentPageIdx + 1}.
                    </div>
                  ) : (
                    [...filteredPanelObjects]
                      .sort((a, b) => b.zIndex - a.zIndex)
                      .map((obj) => {
                        const isSel = selectedIds.includes(obj.id);
                        return (
                          <div
                            key={obj.id}
                            onClick={(e) => {
                              if (e.shiftKey || e.metaKey || e.ctrlKey) {
                                setSelectedIds((prev) =>
                                  prev.includes(obj.id)
                                    ? prev.filter((i) => i !== obj.id)
                                    : [...prev, obj.id]
                                );
                              } else {
                                setSelectedIds([obj.id]);
                              }
                            }}
                            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                              isSel
                                ? 'border-theme-accent bg-theme-elevated'
                                : 'border-theme-subtle bg-theme-canvas/60 hover:bg-theme-elevated'
                            } ${!obj.visible ? 'opacity-60' : ''}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSel}
                                onChange={() => {}}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedIds((prev) =>
                                    prev.includes(obj.id)
                                      ? prev.filter((i) => i !== obj.id)
                                      : [...prev, obj.id]
                                  );
                                }}
                                aria-label={`Select ${obj.name}`}
                                className="rounded shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-theme-primary truncate">
                                  {obj.name}
                                </div>
                                <div className="text-[10px] text-theme-muted font-mono">
                                  {obj.type === 'ocr-text'
                                    ? `OCR Region (${obj.ocrConfidence ?? 92}% · ${
                                        obj.textAlign || 'left'
                                      }${obj.ocrEdited ? ' · Reconstructed' : ''})`
                                    : obj.isCoverOverlay
                                    ? 'Cover Overlay'
                                    : obj.isNative
                                    ? 'Native PDF Object'
                                    : 'Added Layer'}{' '}
                                  · {Math.round(obj.x)},{Math.round(obj.y)} pt
                                  {obj.backdropBlur ? ` · Blur ${obj.backdropBlur}px` : ''}
                                  {obj.groupId ? ' · Grouped' : ''}
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex items-center gap-0.5 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => changeStackOrder(obj.id, 'forward')}
                                title="Bring Forward"
                                className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => changeStackOrder(obj.id, 'backward')}
                                title="Send Backward"
                                className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleObjectVisibility([obj.id])}
                                title={obj.visible ? 'Hide Object (Reversible)' : 'Restore Visibility'}
                                className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                              >
                                {obj.visible ? (
                                  <Eye className="w-3.5 h-3.5" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleObjectLock([obj.id])}
                                title={obj.locked ? 'Unlock Object' : 'Lock Object'}
                                className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                              >
                                {obj.locked ? (
                                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                                ) : (
                                  <Unlock className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={obj.locked}
                                onClick={() => removeObjectsPermanently([obj.id])}
                                title="Permanently Delete Object from PDF"
                                className="p-1 rounded hover:bg-rose-500/20 text-theme-secondary hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>

                {/* Method A vs Method B vs Redaction Distinction Callout */}
                <div className="p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle text-[11px] text-theme-secondary leading-relaxed space-y-1">
                  <div>
                    <strong className="text-theme-primary">Method A (Cover Overlay):</strong> Places a movable shape/blur over content without deleting underlying objects.
                  </div>
                  <div>
                    <strong className="text-rose-400">Method B (Delete Object):</strong> Genuinely removes the selected object from the exported PDF stream.
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: INTERACTIVE PAGE THUMBNAILS & SPRING DRAG-AND-DROP REORDERING */}
            {sidebarTab === 'pages' && (
              <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-y-auto">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-theme-primary font-mono tabular-nums">
                      Pages ({activePages.length})
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPageSorterOpen(true)}
                        title="Expand Full-Grid Spring Page Sorter"
                        className="px-2 py-1 rounded text-[11px] font-semibold bg-theme-elevated border border-theme-subtle text-theme-accent hover:border-theme-accent cursor-pointer"
                      >
                        Grid Sorter
                      </button>
                      {activePages.length > 1 && (
                        <button
                          type="button"
                          onClick={handleReversePagesOrder}
                          title="Reverse Page Sequence"
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                        >
                          Reverse
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleAddBlankPage}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-theme-accent text-white cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Page
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-theme-secondary">
                    Drag and drop page cards to reorder with spring physics, or open the Grid Sorter.
                  </p>
                </div>

                <div ref={pageRailRef} className="space-y-2.5">
                  {activePages.map((p, idx) => {
                    const isCurrent = idx === currentPageIdx;
                    const isBeingDragged = draggedPageIdx === idx;
                    const isDropTarget =
                      dragOverPageIdx === idx &&
                      draggedPageIdx !== null &&
                      draggedPageIdx !== idx;

                    return (
                      <motion.div
                        layout
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                        key={`page-card-${p.pageIndex}`}
                        data-flip-id={`rail-page-${p.pageIndex}`}
                        draggable={activePages.length > 1}
                        onDragStart={(e: any) => {
                          setDraggedPageIdx(idx);
                          if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(idx));
                          }
                        }}
                        onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverPageIdx !== idx) {
                            setDragOverPageIdx(idx);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverPageIdx === idx) {
                            setDragOverPageIdx(null);
                          }
                        }}
                        onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                          e.preventDefault();
                          const fromIdx =
                            draggedPageIdx !== null
                              ? draggedPageIdx
                              : Number(e.dataTransfer.getData('text/plain'));
                          setDraggedPageIdx(null);
                          setDragOverPageIdx(null);
                          if (!Number.isNaN(fromIdx)) {
                            handleReorderPages(fromIdx, idx);
                          }
                        }}
                        onDragEnd={() => {
                          setDraggedPageIdx(null);
                          setDragOverPageIdx(null);
                        }}
                        onClick={() => setCurrentPageIdx(idx)}
                        className={`editor-page-flip-item p-2.5 rounded-lg border cursor-grab active:cursor-grabbing ${
                          isBeingDragged
                            ? 'opacity-45 scale-[0.96] border-dashed border-theme-accent'
                            : isDropTarget
                            ? 'border-emerald-400 ring-2 ring-emerald-500/40 bg-emerald-500/10 scale-[1.02]'
                            : isCurrent
                            ? 'border-theme-accent bg-theme-elevated'
                            : 'border-theme-subtle bg-theme-canvas/50 hover:bg-theme-elevated'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="w-3.5 h-3.5 text-theme-muted shrink-0" />
                            <span className="text-xs font-bold text-theme-primary font-mono tabular-nums">
                              Page {String(idx + 1).padStart(2, '0')}
                            </span>
                          </div>
                          <div
                            className="flex items-center gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleReorderPages(idx, idx - 1)}
                              title="Move Page Up"
                              className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary disabled:opacity-25 cursor-pointer"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === activePages.length - 1}
                              onClick={() => handleReorderPages(idx, idx + 1)}
                              title="Move Page Down"
                              className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary disabled:opacity-25 cursor-pointer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRotatePage(p)}
                              title="Rotate 90°"
                              className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExtractSinglePage(p, idx + 1)}
                              title={`Extract Page ${idx + 1}`}
                              className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicatePage(p)}
                              title="Duplicate Page"
                              className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={activePages.length <= 1}
                              onClick={() => handleDeletePage(p)}
                              title="Delete Page"
                              className="p-1 rounded hover:bg-rose-500/20 text-theme-secondary hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="aspect-[3/4] rounded bg-white border border-theme-subtle flex items-center justify-center overflow-hidden pointer-events-none">
                          {p.thumbnailUrl ? (
                            <img
                              src={p.thumbnailUrl}
                              alt={`Page ${idx + 1} thumbnail`}
                              referrerPolicy="no-referrer"
                              draggable={false}
                              style={{ transform: `rotate(${p.rotation}deg)` }}
                              className="max-h-full max-w-full object-contain transition-transform"
                            />
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">
                              {Math.round(p.width)} × {Math.round(p.height)} pt
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: OUTLINE & BOOKMARKS */}
            {sidebarTab === 'outline' && (
              <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-theme-primary">Document Bookmarks</span>
                  <button
                    type="button"
                    onClick={() =>
                      setCustomBookmarks((prev) => [
                        ...prev,
                        {
                          title: `Bookmark Page ${currentPageIdx + 1}`,
                          pageNumber: currentPageIdx + 1
                        }
                      ])
                    }
                    className="px-2 py-1 rounded text-xs font-semibold bg-theme-muted text-theme-primary hover:bg-theme-accent hover:text-white cursor-pointer"
                  >
                    + Bookmark Page {currentPageIdx + 1}
                  </button>
                </div>
                {[...outline, ...customBookmarks].length === 0 ? (
                  <p className="text-xs text-theme-muted py-4">
                    No native outline tree embedded. Click &ldquo;+ Bookmark&rdquo; above to add quick navigation markers.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {[...outline, ...customBookmarks].map((b, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => setCurrentPageIdx(Math.max(0, b.pageNumber - 1))}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-xs text-theme-primary hover:border-theme-accent cursor-pointer"
                        >
                          <span className="truncate">{b.title}</span>
                          <span className="font-mono text-theme-muted">p.{b.pageNumber}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* TAB 4: SHAPES, OVERLAYS & ANNOTATIONS */}
            {sidebarTab === 'annotations' && (
              <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                <span className="text-xs font-bold text-theme-primary block">
                  Shapes, Cover Overlays &amp; Markups
                </span>
                {objects.filter(
                  (o) => !o.deleted && (o.type === 'annotation' || o.type === 'shape')
                ).length === 0 ? (
                  <p className="text-xs text-theme-muted py-4">
                    No shapes or cover overlays added yet. Choose any shape or Cover/Blur Overlay in the ribbon above and drag on the canvas.
                  </p>
                ) : (
                  objects
                    .filter((o) => !o.deleted && (o.type === 'annotation' || o.type === 'shape'))
                    .map((ann) => (
                      <div
                        key={ann.id}
                        onClick={() => {
                          setCurrentPageIdx(ann.pageIndex);
                          setSelectedIds([ann.id]);
                        }}
                        className="p-2.5 rounded-lg border border-theme-subtle bg-theme-elevated text-xs space-y-1 cursor-pointer hover:border-theme-accent"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-theme-primary">{ann.name}</span>
                          <span className="font-mono text-[10px] text-theme-muted">
                            Page {ann.pageIndex + 1}
                          </span>
                        </div>
                        {ann.text && <p className="text-theme-secondary">{ann.text}</p>}
                      </div>
                    ))
                )}
              </div>
            )}

            {/* TAB 5: ACROFORM INTERACTIVE FIELDS */}
            {sidebarTab === 'forms' && (
              <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-theme-primary">AcroForm Inspector</span>
                  <button
                    type="button"
                    onClick={() => setToolMode('form-field')}
                    className="px-2 py-1 rounded text-xs font-semibold bg-theme-accent text-white cursor-pointer"
                  >
                    + Add Field
                  </button>
                </div>

                {hasXfa && (
                  <div className="p-2.5 rounded bg-amber-500/15 border border-amber-500/30 text-xs text-amber-300">
                    Note: This PDF contains legacy XML Forms Architecture (XFA) packets. AcroForm fields are editable below; dynamic XFA scripts are flattened on export.
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-theme-secondary p-2 rounded bg-theme-elevated border border-theme-subtle cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flattenFormsOnExport}
                    onChange={(e) => setFlattenFormsOnExport(e.target.checked)}
                  />
                  <span>Flatten form fields into static page graphics on export</span>
                </label>

                <div className="space-y-2">
                  {objects
                    .filter((o) => !o.deleted && o.type === 'form-field')
                    .map((field) => (
                      <div
                        key={field.id}
                        onClick={() => {
                          setCurrentPageIdx(field.pageIndex);
                          setSelectedIds([field.id]);
                        }}
                        className="p-2.5 rounded-lg border border-theme-subtle bg-theme-elevated space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-theme-primary">
                            {field.fieldName}
                          </span>
                          <span className="text-[10px] text-theme-muted">
                            Page {field.pageIndex + 1}
                          </span>
                        </div>
                        {field.fieldType === 'checkbox' ? (
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(field.fieldValue)}
                              onChange={(e) =>
                                updateObjectsWithHistory(
                                  (prev) =>
                                    prev.map((o) =>
                                      o.id === field.id ? { ...o, fieldValue: e.target.checked } : o
                                    ),
                                  `Update Checkbox ${field.fieldName}`
                                )
                              }
                            />
                            <span>Checked</span>
                          </label>
                        ) : (
                          <input
                            type="text"
                            value={String(field.fieldValue || '')}
                            onChange={(e) =>
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === field.id ? { ...o, fieldValue: e.target.value } : o
                                  ),
                                `Edit Field ${field.fieldName}`
                              )
                            }
                            className="w-full px-2 py-1 rounded bg-theme-surface border border-theme-subtle text-theme-primary"
                          />
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TAB 6: DOCUMENT STREAM STRUCTURE */}
            {sidebarTab === 'structure' && (
              <div className="flex-1 p-3 space-y-3 overflow-y-auto text-xs">
                <span className="font-bold text-theme-primary block">
                  ISO 32000 Content Stream Summary
                </span>
                <div className="p-3 rounded-lg bg-theme-elevated border border-theme-subtle space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-theme-muted">Active Pages:</span>
                    <span>{activePages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-muted">MediaBox:</span>
                    <span>
                      {Math.round(currentPage?.width || 612)} ×{' '}
                      {Math.round(currentPage?.height || 792)} pt
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-muted">Native Text Runs:</span>
                    <span>
                      {
                        objects.filter(
                          (o) => o.isNative && o.type === 'native-text' && !o.deleted
                        ).length
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-muted">Native Vector Blocks:</span>
                    <span>
                      {
                        objects.filter(
                          (o) => o.isNative && o.type === 'native-shape' && !o.deleted
                        ).length
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-muted">Cover/Blur Overlays:</span>
                    <span>
                      {objects.filter((o) => o.isCoverOverlay && !o.deleted).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-muted">Deleted PDF Objects:</span>
                    <span>{objects.filter((o) => o.deleted).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-muted">Redaction Zones:</span>
                    <span>
                      {objects.filter((o) => o.type === 'redaction' && !o.deleted).length}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* --------------------------------------------------------- */}
        {/* CENTRAL INTERACTIVE DOCUMENT CANVAS                       */}
        {/* --------------------------------------------------------- */}
        <main
          ref={canvasViewportRef}
          onMouseDown={(e) => {
            if (e.button === 1 || toolMode === 'pan' || spacePanHeld) {
              e.preventDefault();
              const viewport = canvasViewportRef.current;
              setDragState({
                mode: 'pan',
                activeCursor: 'grabbing',
                startX: e.clientX,
                startY: e.clientY,
                origX: 0,
                origY: 0,
                origW: 0,
                origH: 0,
                panStartClientX: e.clientX,
                panStartClientY: e.clientY,
                panStartScrollLeft: viewport?.scrollLeft || 0,
                panStartScrollTop: viewport?.scrollTop || 0
              });
            }
          }}
          onMouseMove={(e) => {
            if (dragState?.mode === 'pan') {
              const viewport = canvasViewportRef.current;
              if (
                viewport &&
                dragState.panStartClientX !== undefined &&
                dragState.panStartClientY !== undefined
              ) {
                const deltaX = e.clientX - dragState.panStartClientX;
                const deltaY = e.clientY - dragState.panStartClientY;
                viewport.scrollLeft = (dragState.panStartScrollLeft || 0) - deltaX;
                viewport.scrollTop = (dragState.panStartScrollTop || 0) - deltaY;
              }
            }
          }}
          className={`${
            leftSidebarCollapsed && rightPanelCollapsed
              ? 'lg:col-span-12'
              : leftSidebarCollapsed || rightPanelCollapsed
              ? 'lg:col-span-9'
              : 'lg:col-span-6'
          } bg-theme-muted/60 overflow-auto flex flex-col items-center p-6 lg:h-full lg:min-h-0 relative ${
            dragState?.mode === 'pan'
              ? 'cursor-grabbing'
              : toolMode === 'pan' || spacePanHeld
              ? 'cursor-grab'
              : ''
          }`}
        >
          {/* Automatic Scanned Document Detection Offer Banner (Section 4) */}
          {showScannedDetectionPrompt && !ocrRunning && (
            <div className="w-full max-w-3xl mb-4 p-4 rounded-xl bg-theme-surface border-2 border-emerald-500/60 shadow-xl space-y-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-theme-accent shrink-0" />
                    <span className="text-sm font-bold text-theme-primary">
                      This document appears to contain scanned pages. Recognize text to enable text selection, search and editing.
                    </span>
                  </div>
                  <p className="text-theme-secondary">
                    Detected{' '}
                    <strong>
                      {pages.filter((p) => p.pageClassification === 'scanned').length} scanned
                    </strong>{' '}
                    and{' '}
                    <strong>
                      {pages.filter((p) => p.pageClassification === 'mixed').length} mixed
                    </strong>{' '}
                    page(s). Choose your recognition language and scope below:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScannedDetectionPrompt(false)}
                  className="p-1 text-theme-muted hover:text-theme-primary cursor-pointer"
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRunOcr('all-scanned-and-mixed')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-theme-accent text-white font-bold hover:opacity-95 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>1. Recognize Text &amp; Continue</span>
                  </button>

                  {pages.some((p) => p.pageClassification === 'mixed') && (
                    <button
                      type="button"
                      onClick={() => handleRunOcr('scanned-only')}
                      className="px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary font-semibold hover:border-theme-accent cursor-pointer"
                    >
                      2. Process Scanned Pages Only
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowScannedDetectionPrompt(false)}
                    className="px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                  >
                    3. Continue Without OCR
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowScannedDetectionPrompt(false)}
                  className="text-theme-muted hover:text-theme-primary underline cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Scanned / Flattened Page Status Bar when OCR has not been run yet */}
          {currentPage?.isScannedCandidate && !currentPage?.ocrProcessed && !showScannedDetectionPrompt && (
            <div className="w-full max-w-2xl mb-4 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200">
              <span>
                <strong>
                  {currentPage.pageClassification === 'mixed'
                    ? 'Mixed Page (Scan + Native Text):'
                    : 'Scanned Page Detected:'}
                </strong>{' '}
                Run English OCR to make printed text directly selectable, searchable, and editable in-place with background reconstruction.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRunOcr('current-page')}
                  className="px-2.5 py-1 rounded bg-emerald-600 font-semibold text-white whitespace-nowrap cursor-pointer"
                >
                  Run OCR Now
                </button>
                <button
                  type="button"
                  onClick={() => setToolMode('cover-overlay')}
                  className="px-2.5 py-1 rounded bg-amber-500/25 border border-amber-400/50 font-semibold text-white whitespace-nowrap cursor-pointer"
                >
                  Use Cover Overlay
                </button>
              </div>
            </div>
          )}

          {/* Active Creation Tool Instruction Banner */}
          {toolMode !== 'select' && toolMode !== 'edit-text' && (
            <div className="w-full max-w-2xl mb-3 px-3.5 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-between text-xs text-theme-primary">
              <span>
                <strong>Creation Mode ({toolMode.replace('-', ' ')}):</strong> Click and drag anywhere on the PDF page below to draw, or press <kbd className="font-mono px-1 bg-black/30 rounded">Esc</kbd> to return to Select mode.
              </span>
              <button
                type="button"
                onClick={() => setToolMode('select')}
                className="px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {loading ? (
            <StudioLaunchTransition
              mode="inline"
              toolName={docName || '2D PDF Editor & Object Studio'}
              stageMessage={loadingMsg}
            />
          ) : currentPage ? (
            <div
              ref={pageCanvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              style={{
                width: Math.round(currentPage.width * zoom),
                height: Math.round(currentPage.height * zoom),
                transform: `rotate(${currentPage.rotation}deg)`
              }}
              className={`relative bg-white shadow-2xl border border-black/15 transition-shadow shrink-0 my-auto ${getActiveCanvasCursorClass()}`}
            >
              {/* Rendered PDF Page Canvas Image */}
              {pageBgUrl && (
                <img
                  src={pageBgUrl}
                  alt={`Rendered PDF Page ${currentPageIdx + 1}`}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className="w-full h-full object-fill pointer-events-none select-none"
                />
              )}

              {/* Mask whiteout rectangles over native objects (text or vector blocks) at their ORIGINAL coordinates when moved, modified, hidden, or deleted! */}
              {objects
                .filter(
                  (o) =>
                    o.pageIndex === currentPage.pageIndex &&
                    o.isNative &&
                    (o.type === 'native-text' || o.type === 'native-shape' || o.type === 'native-image')
                )
                .map((obj) => {
                  const origX = obj.originalX ?? obj.x;
                  const origY = obj.originalY ?? obj.y;
                  const origW = obj.originalWidth ?? obj.width;
                  const origH = obj.originalHeight ?? obj.height;
                  const hasMovedOrResized =
                    Math.abs(obj.x - origX) > 1 ||
                    Math.abs(obj.y - origY) > 1 ||
                    Math.abs(obj.width - origW) > 1 ||
                    Math.abs(obj.height - origH) > 1 ||
                    (obj.rotation || 0) !== 0;

                  const isModifiedText =
                    obj.type === 'native-text' &&
                    (obj.text !== obj.originalText ||
                      obj.color !== '#18181B' ||
                      obj.fontWeight === 'bold' ||
                      obj.fontStyle === 'italic' ||
                      obj.underline ||
                      (obj.opacity ?? 1) < 1);

                  const shouldMaskOriginal =
                    obj.deleted || !obj.visible || hasMovedOrResized || isModifiedText;
                  if (!shouldMaskOriginal) return null;

                  return (
                    <div
                      key={`mask-${obj.id}`}
                      style={{
                        left: origX * zoom - 1,
                        top: origY * zoom - 1,
                        width: origW * zoom + 2,
                        height: origH * zoom + (obj.type === 'native-text' ? 3 : 2)
                      }}
                      className="absolute bg-white pointer-events-none"
                    />
                  );
                })}

              {/* Scanned Background Reconstruction Patches (Section 10):
                  Whenever an 'ocr-text' object is edited, moved, hidden, or deleted, render its reconstructed
                  paper/texture patch over the original scanned coordinates so old printed pixels are cleanly removed! */}
              {!compareOriginalScan &&
                objects
                  .filter(
                    (o) =>
                      o.pageIndex === currentPage.pageIndex &&
                      o.type === 'ocr-text'
                  )
                  .map((obj) => {
                    const origX = obj.originalX ?? obj.x;
                    const origY = obj.originalY ?? obj.y;
                    const origW = obj.originalWidth ?? obj.width;
                    const origH = obj.originalHeight ?? obj.height;
                    const hasMoved =
                      Math.abs(obj.x - origX) > 1 || Math.abs(obj.y - origY) > 1;
                    const isModified =
                      obj.deleted ||
                      !obj.visible ||
                      obj.ocrEdited ||
                      obj.text !== obj.originalText ||
                      hasMoved;

                    if (!isModified) return null;

                    const pad = obj.bgMaskPadding ?? 2;
                    const px = Math.max(0, origX - pad) * zoom;
                    const py = Math.max(0, origY - pad) * zoom;
                    const pw = Math.max(6, origW + pad * 2) * zoom;
                    const ph = Math.max(6, origH + pad * 2) * zoom;

                    return (
                      <div
                        key={`ocr-bg-patch-${obj.id}`}
                        style={{
                          left: px,
                          top: py,
                          width: pw,
                          height: ph,
                          backgroundColor:
                            obj.bgReconstructionMethod === 'manual-solid' && obj.fillColor
                              ? obj.fillColor
                              : obj.sampledBgColor || '#FAF8F5'
                        }}
                        className="absolute pointer-events-none overflow-hidden"
                      >
                        {obj.bgPatchDataUrl &&
                          obj.bgReconstructionMethod !== 'manual-solid' && (
                            <img
                              src={obj.bgPatchDataUrl}
                              alt=""
                              aria-hidden="true"
                              draggable={false}
                              className="w-full h-full object-fill select-none"
                            />
                          )}
                      </div>
                    );
                  })}

              {/* Smart Alignment Snap Guides (Rendered during active object drag) */}
              {snapGuides.vertical.map((vx, i) => (
                <div
                  key={`vguide-${i}`}
                  style={{ left: vx * zoom }}
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-fuchsia-500 z-[999]"
                />
              ))}
              {snapGuides.horizontal.map((hy, i) => (
                <div
                  key={`hguide-${i}`}
                  style={{ top: hy * zoom }}
                  className="pointer-events-none absolute left-0 right-0 h-px bg-fuchsia-500 z-[999]"
                />
              ))}

              {/* Interactive Object Layer */}
              {pageObjects.map((obj) => {
                const isSelected = selectedIds.includes(obj.id);
                const isEditingInline = editingTextObjId === obj.id;
                const isSearchMatch =
                  searchQuery.trim().length > 1 &&
                  obj.text?.toLowerCase().includes(searchQuery.trim().toLowerCase());

                if (!obj.visible && !showHiddenOutlines) return null;

                const origX = obj.originalX ?? obj.x;
                const origY = obj.originalY ?? obj.y;
                const origW = obj.originalWidth ?? obj.width;
                const origH = obj.originalHeight ?? obj.height;
                const hasNativeMovedOrResized =
                  obj.isNative &&
                  (Math.abs(obj.x - origX) > 1 ||
                    Math.abs(obj.y - origY) > 1 ||
                    Math.abs(obj.width - origW) > 1 ||
                    Math.abs(obj.height - origH) > 1 ||
                    (obj.rotation || 0) !== 0);

                const isModifiedNativeText =
                  obj.isNative &&
                  obj.type === 'native-text' &&
                  (hasNativeMovedOrResized ||
                    obj.text !== obj.originalText ||
                    obj.color !== '#18181B' ||
                    obj.fontWeight === 'bold' ||
                    obj.fontStyle === 'italic' ||
                    obj.underline ||
                    (obj.opacity ?? 1) < 1);

                const kind = obj.shapeKind || 'rectangle';
                const isShapeOrOverlay =
                  obj.type === 'shape' ||
                  obj.type === 'annotation' ||
                  (obj.type === 'native-shape' && hasNativeMovedOrResized);

                const shapeBorderRadius =
                  kind === 'circle' || kind === 'ellipse'
                    ? '9999px'
                    : kind === 'rounded-rectangle' || (obj.cornerRadius && obj.cornerRadius > 0)
                    ? `${(obj.cornerRadius ?? 12) * zoom}px`
                    : '2px';

                const shapeClipPath =
                  kind === 'polygon' ? computePolygonClipPath(obj.polygonSides || 5) : undefined;

                const boxShadowCss = obj.shadow?.enabled
                  ? `${(obj.shadow.offsetX || 0) * zoom}px ${(obj.shadow.offsetY || 4) * zoom}px ${
                      (obj.shadow.blur || 8) * zoom
                    }px ${obj.shadow.color || 'rgba(0,0,0,0.3)'}`
                  : undefined;

                return (
                  <div
                    key={obj.id}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (
                        !obj.locked &&
                        (obj.type === 'native-text' ||
                          obj.type === 'ocr-text' ||
                          obj.type === 'added-text' ||
                          obj.type === 'watermark' ||
                          obj.shapeKind === 'sticky-note')
                      ) {
                        setSelectedIds([obj.id]);
                        setEditingTextObjId(obj.id);
                      }
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setContextMenu(null);

                      if (e.button === 1 || toolMode === 'pan' || spacePanHeld) {
                        const viewport = canvasViewportRef.current;
                        setDragState({
                          mode: 'pan',
                          activeCursor: 'grabbing',
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: 0,
                          origY: 0,
                          origW: 0,
                          origH: 0,
                          panStartClientX: e.clientX,
                          panStartClientY: e.clientY,
                          panStartScrollLeft: viewport?.scrollLeft || 0,
                          panStartScrollTop: viewport?.scrollTop || 0
                        });
                        return;
                      }

                      // Alt+Click cycles through overlapping objects at this spot!
                      if (e.altKey) {
                        cycleOverlappingObjects(obj);
                        return;
                      }

                      if (editingTextObjId && editingTextObjId !== obj.id) {
                        setEditingTextObjId(null);
                      }

                      // Group-aware selection
                      let nextSelected = [obj.id];
                      if (obj.groupId && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                        nextSelected = objects
                          .filter((peer) => peer.groupId === obj.groupId && !peer.deleted)
                          .map((peer) => peer.id);
                      }

                      if (e.shiftKey || e.ctrlKey || e.metaKey) {
                        setSelectedIds((prev) =>
                          prev.includes(obj.id)
                            ? prev.filter((i) => i !== obj.id)
                            : [...prev, obj.id]
                        );
                      } else {
                        setSelectedIds(nextSelected);
                      }

                      if (!obj.locked && toolMode === 'select' && !isEditingInline) {
                        const { x: startX, y: startY } = getCanvasPdfPoint(e.clientX, e.clientY);

                        const groupOrigins: Record<string, { x: number; y: number }> = {};
                        if (nextSelected.length > 1) {
                          objects.forEach((peer) => {
                            if (nextSelected.includes(peer.id) && peer.id !== obj.id) {
                              groupOrigins[peer.id] = { x: peer.x, y: peer.y };
                            }
                          });
                        }

                        setDragState({
                          mode: 'move',
                          activeCursor: 'grabbing',
                          objId: obj.id,
                          startX,
                          startY,
                          origX: obj.x,
                          origY: obj.y,
                          origW: obj.width,
                          origH: obj.height,
                          groupOrigins
                        });
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds([obj.id]);
                      setContextMenu({ x: e.clientX, y: e.clientY, objId: obj.id });
                    }}
                    style={{
                      left: obj.x * zoom,
                      top: obj.y * zoom,
                      width: obj.width * zoom,
                      height: obj.height * zoom,
                      zIndex: isSelected ? Math.max(obj.zIndex, 600) : obj.zIndex,
                      transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
                      opacity: !obj.visible ? 0.45 : obj.opacity ?? 1,
                      filter:
                        obj.objectBlur && obj.objectBlur > 0
                          ? `blur(${obj.objectBlur * zoom}px)`
                          : undefined
                    }}
                    className={`group absolute transition-shadow ${
                      compareOriginalScan
                        ? 'opacity-0 pointer-events-none'
                        : isSelected
                        ? 'ring-2 ring-emerald-600'
                        : isSearchMatch
                        ? 'ring-2 ring-amber-400 bg-amber-300/30'
                        : !obj.visible
                        ? 'border border-dashed border-amber-500/80 bg-amber-500/10'
                        : obj.type === 'ocr-text' && showOcrBoundaries
                        ? (obj.ocrConfidence ?? 95) < 75 && !obj.ocrConfidenceVerified
                          ? 'ring-1 ring-amber-500/85 bg-amber-500/5 hover:ring-2 hover:ring-amber-400'
                          : 'ring-1 ring-cyan-500/55 hover:ring-2 hover:ring-emerald-500'
                        : 'hover:ring-1 hover:ring-emerald-500/75'
                    } ${
                      toolMode === 'pan' || spacePanHeld
                        ? 'cursor-grab active:cursor-grabbing'
                        : obj.locked
                        ? 'cursor-not-allowed'
                        : isEditingInline ||
                          (toolMode === 'edit-text' &&
                            (obj.type === 'native-text' ||
                              obj.type === 'ocr-text' ||
                              obj.type === 'added-text' ||
                              obj.type === 'watermark'))
                        ? 'cursor-text'
                        : dragState?.mode === 'move' && dragState?.objId === obj.id
                        ? 'cursor-grabbing'
                        : isSelected &&
                          (obj.type === 'native-text' ||
                            obj.type === 'ocr-text' ||
                            obj.type === 'added-text')
                        ? 'cursor-move'
                        : 'cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    {/* OCR Confidence, Font Classification & Alignment Badge on Hover or Selection */}
                    {obj.type === 'ocr-text' &&
                      (isSelected || ((obj.ocrConfidence ?? 95) < 75 && !obj.ocrConfidenceVerified)) &&
                      !isEditingInline && (
                        <div
                          className={`pointer-events-none absolute -top-4 right-0 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold whitespace-nowrap shadow-xs z-20 ${
                            (obj.ocrConfidence ?? 95) < 75 && !obj.ocrConfidenceVerified
                              ? 'bg-amber-500 text-black'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          OCR {obj.ocrConfidence ?? 95}% ·{' '}
                          {obj.ocrTypography?.fontClassification
                            ? obj.ocrTypography.fontClassification.toUpperCase()
                            : 'SANS'}{' '}
                          · {obj.fontFamily || 'Helvetica'} · {(obj.textAlign || 'left').toUpperCase()}
                          {obj.ocrEdited ? ' · Matched' : ''}
                        </div>
                      )}

                    {/* Section 11: OCR Coordinate Verification & Debug Overlay */}
                    {obj.type === 'ocr-text' && showOcrCoordinateDebug && (
                      <>
                        {/* Original OCR Selection Bounding Box (if expanded or moved) */}
                        <div
                          style={{
                            left: ((obj.originalX ?? obj.x) - obj.x) * zoom,
                            top: ((obj.originalY ?? obj.y) - obj.y) * zoom,
                            width: (obj.originalWidth ?? obj.width) * zoom,
                            height: (obj.originalHeight ?? obj.height) * zoom
                          }}
                          className="pointer-events-none absolute border border-dashed border-emerald-500/90 bg-emerald-500/5 z-10"
                        />

                        {/* Typographic Baseline Indicator Line */}
                        <div
                          style={{
                            top:
                              ((obj.ocrGeometry?.baselineOffsetPt ??
                                (obj.fontSize || 12) * 0.82) +
                                (obj.baselineAdjustmentPt || 0)) *
                              zoom
                          }}
                          className="pointer-events-none absolute left-0 right-0 h-px bg-rose-500/90 z-20"
                        >
                          {/* Alignment Anchor Crosshair Dot on Baseline */}
                          <div
                            style={{
                              left:
                                (obj.textAlign || 'left') === 'right'
                                  ? '100%'
                                  : (obj.textAlign || 'left') === 'center'
                                  ? '50%'
                                  : '0%'
                            }}
                            className="w-2 h-2 -mt-1 -ml-1 rounded-full bg-rose-600 border border-white shadow-2xs"
                          />
                        </div>

                        {/* Live Coordinate Telemetry Readout Tag (shown when selected) */}
                        {isSelected && (
                          <div className="pointer-events-none absolute -bottom-11 left-0 px-1.5 py-0.5 rounded bg-slate-950/95 border border-cyan-500/60 text-[9px] font-mono text-cyan-200 whitespace-nowrap shadow-lg z-30 leading-tight">
                            <div>
                              imgPx:[
                              {obj.ocrGeometry
                                ? `${obj.ocrGeometry.imageBboxPx.x0},${obj.ocrGeometry.imageBboxPx.y0}..${obj.ocrGeometry.imageBboxPx.x1},${obj.ocrGeometry.imageBboxPx.y1}`
                                : 'n/a'}
                              ] → pdfTL:({Math.round(obj.x)},{Math.round(obj.y)},{Math.round(obj.width)}×
                              {Math.round(obj.height)}pt)
                            </div>
                            <div>
                              font:{obj.fontFamily || 'Helvetica'} ({obj.numericFontWeight || 400}) · base:
                              {Math.round(
                                (obj.y +
                                  (obj.ocrGeometry?.baselineOffsetPt ??
                                    (obj.fontSize || 12) * 0.82) +
                                  (obj.baselineAdjustmentPt || 0)) *
                                  10
                              ) / 10}
                              pt · canvasPx:({Math.round(obj.x * zoom)},{Math.round(obj.y * zoom)})
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Inline Direct Text Editor on Double-Click */}
                    {isEditingInline ? (
                      <textarea
                        autoFocus
                        dir="ltr"
                        value={obj.text || ''}
                        onChange={(e) => {
                          handleUpdateObjectText(obj.id, e.target.value);
                        }}
                        onBlur={() => {
                          setEditingTextObjId(null);
                          pushSnapshot(pages, objects, 'Inline Edit Text');
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          fontSize: (obj.fontSize || 12) * zoom,
                          fontFamily: getFontCssStack(obj.fontFamily),
                          fontWeight: obj.numericFontWeight || (obj.fontWeight === 'bold' ? 700 : 400),
                          fontStyle: obj.fontStyle || 'normal',
                          color: obj.color || obj.sampledTextColor || '#18181B',
                          textAlign: obj.textAlign || 'left',
                          lineHeight: 1,
                          padding: 0,
                          margin: 0,
                          letterSpacing:
                            obj.letterSpacing !== undefined
                              ? `${obj.letterSpacing * zoom}px`
                              : undefined
                        }}
                        className="w-full h-full bg-white/95 ring-2 ring-emerald-600 focus:outline-none resize-none overflow-hidden"
                      />
                    ) : (
                      <>
                        {/* Render Modified Native Text, Modified/Moved OCR Text, or Added Text / Watermark */}
                        {(obj.type === 'added-text' ||
                          obj.type === 'watermark' ||
                          (obj.type === 'native-text' && isModifiedNativeText && obj.visible) ||
                          (obj.type === 'ocr-text' &&
                            obj.visible &&
                            (obj.ocrEdited ||
                              obj.text !== obj.originalText ||
                              Math.abs(obj.x - (obj.originalX ?? obj.x)) > 1 ||
                              Math.abs(obj.y - (obj.originalY ?? obj.y)) > 1))) && (
                          <div
                            dir="ltr"
                            style={{
                              fontSize: (obj.fontSize || 12) * zoom,
                              fontFamily: getFontCssStack(obj.fontFamily),
                              fontWeight:
                                obj.numericFontWeight ||
                                (obj.fontWeight === 'bold' ? 700 : 400),
                              fontStyle: obj.fontStyle || 'normal',
                              textDecoration: obj.underline ? 'underline' : 'none',
                              color: obj.color || obj.sampledTextColor || '#18181B',
                              textAlign: obj.textAlign || 'left',
                              lineHeight:
                                obj.type === 'ocr-text' && !(obj.text || '').includes('\n')
                                  ? `${obj.height * zoom}px`
                                  : obj.lineHeight || 1.18,
                              letterSpacing:
                                obj.letterSpacing !== undefined
                                  ? `${obj.letterSpacing * zoom}px`
                                  : undefined,
                              transform:
                                obj.horizontalScale && Math.abs(obj.horizontalScale - 1) > 0.01
                                  ? `scaleX(${obj.horizontalScale})`
                                  : undefined,
                              transformOrigin:
                                (obj.textAlign || 'left') === 'right'
                                  ? 'right center'
                                  : (obj.textAlign || 'left') === 'center'
                                  ? 'center center'
                                  : 'left center',
                              marginTop: obj.baselineAdjustmentPt
                                ? `${obj.baselineAdjustmentPt * zoom}px`
                                : undefined,
                              filter:
                                obj.type === 'ocr-text' && obj.scanPrintRealism !== false
                                  ? `blur(${
                                      (obj.ocrTypography?.scanEdgeSoftnessPx ?? 0.3) * 0.55 * zoom
                                    }px)`
                                  : undefined
                            }}
                            className={`w-full h-full pointer-events-none ${
                              obj.type === 'ocr-text' && !(obj.text || '').includes('\n')
                                ? 'whitespace-nowrap'
                                : 'whitespace-pre-wrap break-words'
                            }`}
                          >
                            {obj.text}
                          </div>
                        )}
                      </>
                    )}

                    {/* Render Added Image (with Non-Destructive Crop) or Signature */}
                    {(obj.type === 'added-image' || obj.type === 'signature') && (
                      <div className="w-full h-full flex flex-col justify-center overflow-hidden">
                        {obj.imageDataUrl ? (
                          <img
                            src={obj.imageDataUrl}
                            alt={obj.name}
                            referrerPolicy="no-referrer"
                            style={{
                              clipPath: obj.crop
                                ? `inset(${obj.crop.top}% ${obj.crop.right}% ${obj.crop.bottom}% ${obj.crop.left}%)`
                                : undefined
                            }}
                            className="w-full h-full object-contain pointer-events-none"
                          />
                        ) : (
                          <div
                            style={{
                              fontSize: (obj.fontSize || 20) * zoom,
                              color: obj.color || '#1E1B4B'
                            }}
                            className="font-serif italic font-bold px-2 pointer-events-none"
                          >
                            {obj.text}
                          </div>
                        )}
                        {obj.signatureKind === 'cryptographic-sha256' && (
                          <div className="bg-emerald-950/90 text-emerald-100 text-[9px] font-mono px-1.5 py-0.5 truncate pointer-events-none">
                            SHA-256: {obj.signatureHash?.slice(0, 18)}…
                          </div>
                        )}
                      </div>
                    )}

                    {/* Render Shapes, Cover Overlays, & Annotations (with Clipped Background Blur!) */}
                    {isShapeOrOverlay && (
                      <div
                        style={{
                          borderRadius: shapeBorderRadius,
                          clipPath: shapeClipPath,
                          boxShadow: boxShadowCss
                        }}
                        className="relative w-full h-full pointer-events-none overflow-hidden"
                      >
                        {/* 1. Clipped Background Blur of Underlying PDF Page Content (Section 9) */}
                        {obj.backdropBlur && obj.backdropBlur > 0 && pageBgUrl && (
                          <img
                            src={pageBgUrl}
                            alt=""
                            aria-hidden="true"
                            draggable={false}
                            style={{
                              position: 'absolute',
                              left: -obj.x * zoom,
                              top: -obj.y * zoom,
                              width: currentPage.width * zoom,
                              height: currentPage.height * zoom,
                              maxWidth: 'none',
                              filter: `blur(${obj.backdropBlur * zoom}px)`
                            }}
                            className="pointer-events-none select-none object-fill"
                          />
                        )}

                        {/* 2. Independent Fill Layer (Solid or Gradient, with Independent fillOpacity) */}
                        {!obj.transparentFill &&
                          kind !== 'line' &&
                          kind !== 'arrow' &&
                          kind !== 'freehand' && (
                            <div
                              style={{
                                background:
                                  obj.gradientFill?.enabled && obj.gradientFill.toColor
                                    ? `linear-gradient(${obj.gradientFill.angle || 135}deg, ${
                                        obj.fillColor || '#7C3AED'
                                      }, ${obj.gradientFill.toColor})`
                                    : obj.fillColor || 'transparent',
                                opacity: obj.fillOpacity ?? (kind === 'highlight' ? 0.38 : 1)
                              }}
                              className="absolute inset-0"
                            />
                          )}

                        {/* 3. Independent Border / Stroke Layer (Solid, Dashed, or Dotted) */}
                        {kind !== 'highlight' &&
                          kind !== 'line' &&
                          kind !== 'arrow' &&
                          kind !== 'freehand' &&
                          (obj.strokeWidth ?? 2) > 0 && (
                            <div
                              style={{
                                borderRadius: shapeBorderRadius,
                                borderColor: obj.strokeColor || '#7C3AED',
                                borderWidth: (obj.strokeWidth ?? 2) * zoom,
                                borderStyle: obj.strokeStyle || 'solid',
                                opacity: obj.strokeOpacity ?? 1
                              }}
                              className="absolute inset-0"
                            />
                          )}

                        {/* 4. Line & Arrow SVG Renderer */}
                        {(kind === 'line' || kind === 'arrow') && (
                          <svg className="w-full h-full overflow-visible">
                            <line
                              x1={0}
                              y1={(obj.height * zoom) / 2}
                              x2={obj.width * zoom}
                              y2={(obj.height * zoom) / 2}
                              stroke={obj.strokeColor || '#7C3AED'}
                              strokeWidth={(obj.strokeWidth || 2) * zoom}
                              strokeOpacity={obj.strokeOpacity ?? 1}
                              strokeDasharray={
                                obj.strokeStyle === 'dashed'
                                  ? `${6 * zoom},${4 * zoom}`
                                  : obj.strokeStyle === 'dotted'
                                  ? `${2 * zoom},${3 * zoom}`
                                  : undefined
                              }
                            />
                            {kind === 'arrow' && (
                              <polyline
                                fill="none"
                                stroke={obj.strokeColor || '#7C3AED'}
                                strokeWidth={(obj.strokeWidth || 2) * zoom}
                                strokeOpacity={obj.strokeOpacity ?? 1}
                                points={`${obj.width * zoom - 9 * zoom},${
                                  (obj.height * zoom) / 2 - 5 * zoom
                                } ${obj.width * zoom},${(obj.height * zoom) / 2} ${
                                  obj.width * zoom - 9 * zoom
                                },${(obj.height * zoom) / 2 + 5 * zoom}`}
                              />
                            )}
                          </svg>
                        )}

                        {/* 5. Freehand / Custom Closed Path SVG Renderer */}
                        {kind === 'freehand' && obj.points && (
                          <svg className="w-full h-full overflow-visible">
                            {obj.closePath ? (
                              <polygon
                                fill={obj.transparentFill ? 'none' : obj.fillColor || '#DDD6FE'}
                                fillOpacity={obj.fillOpacity ?? 0.45}
                                stroke={obj.strokeColor || '#7C3AED'}
                                strokeWidth={(obj.strokeWidth || 2.5) * zoom}
                                strokeOpacity={obj.strokeOpacity ?? 1}
                                strokeLinejoin="round"
                                points={obj.points
                                  .map((pt) => `${pt.x * zoom},${pt.y * zoom}`)
                                  .join(' ')}
                              />
                            ) : (
                              <polyline
                                fill="none"
                                stroke={obj.strokeColor || '#7C3AED'}
                                strokeWidth={(obj.strokeWidth || 2.5) * zoom}
                                strokeOpacity={obj.strokeOpacity ?? 1}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={obj.points
                                  .map((pt) => `${pt.x * zoom},${pt.y * zoom}`)
                                  .join(' ')}
                              />
                            )}
                          </svg>
                        )}

                        {/* 6. Sticky Note Text */}
                        {kind === 'sticky-note' && !isEditingInline && (
                          <p className="relative z-10 p-1.5 text-[10px] text-slate-900 font-sans leading-snug">
                            {obj.text}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Render Interactive Form Field */}
                    {obj.type === 'form-field' && (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-full bg-emerald-50/90 border border-emerald-500/60 flex items-center px-1.5"
                      >
                        {obj.fieldType === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={Boolean(obj.fieldValue)}
                            onChange={(e) =>
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === obj.id ? { ...o, fieldValue: e.target.checked } : o
                                  ),
                                'Toggle Form Checkbox'
                              )
                            }
                            className="w-4 h-4 accent-emerald-600 cursor-pointer"
                          />
                        ) : (
                          <input
                            type="text"
                            value={String(obj.fieldValue ?? '')}
                            onChange={(e) =>
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === obj.id ? { ...o, fieldValue: e.target.value } : o
                                  ),
                                'Update Form Field'
                              )
                            }
                            className="w-full bg-transparent text-slate-900 text-xs font-sans focus:outline-none"
                          />
                        )}
                      </div>
                    )}

                    {/* Render Permanent Redaction Zone */}
                    {obj.type === 'redaction' && (
                      <div className="w-full h-full bg-zinc-950/95 border-2 border-rose-500 flex items-center justify-between px-2 pointer-events-none">
                        <span className="text-[10px] font-mono font-bold text-rose-400 truncate">
                          {obj.redactionCode || 'REDACTED'}
                        </span>
                      </div>
                    )}

                    {/* ========================================================= */}
                    {/* 8-HANDLE FORGIVING RESIZE + TOP ROTATION HANDLE (SEC 4)   */}
                    {/* ========================================================= */}
                    {isSelected && !obj.locked && !isEditingInline && (
                      <>
                        {/* Top Rotation Handle & Stem (crosshair rotation cursor) */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const { x: startX, y: startY } = getCanvasPdfPoint(
                              e.clientX,
                              e.clientY
                            );
                            setDragState({
                              mode: 'rotate',
                              activeCursor: 'crosshair',
                              objId: obj.id,
                              startX,
                              startY,
                              origX: obj.x,
                              origY: obj.y,
                              origW: obj.width,
                              origH: obj.height,
                              origRotation: obj.rotation || 0,
                              centerX: obj.x + obj.width / 2,
                              centerY: obj.y + obj.height / 2
                            });
                          }}
                          title="Drag to Rotate Object (Hold Shift for 15° snap)"
                          className="absolute left-1/2 -top-7 -translate-x-1/2 w-6 h-6 flex items-center justify-center cursor-crosshair z-30"
                        >
                          <div className="w-px h-3 bg-emerald-600 absolute -bottom-1.5 left-1/2 -translate-x-1/2 pointer-events-none" />
                          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-emerald-600 shadow-sm flex items-center justify-center pointer-events-none">
                            <RotateCw className="w-2 h-2 text-emerald-700 pointer-events-none" />
                          </div>
                        </div>

                        {/* 8 Forgiving Resize Handles (4 Corners: NW, NE, SE, SW + 4 Edges: N, E, S, W) */}
                        {(
                          [
                            { dir: 'nw', pos: '-left-2.5 -top-2.5' },
                            { dir: 'n', pos: 'left-1/2 -translate-x-1/2 -top-2.5' },
                            { dir: 'ne', pos: '-right-2.5 -top-2.5' },
                            { dir: 'e', pos: '-right-2.5 top-1/2 -translate-y-1/2' },
                            { dir: 'se', pos: '-right-2.5 -bottom-2.5' },
                            { dir: 's', pos: 'left-1/2 -translate-x-1/2 -bottom-2.5' },
                            { dir: 'sw', pos: '-left-2.5 -bottom-2.5' },
                            { dir: 'w', pos: '-left-2.5 top-1/2 -translate-y-1/2' }
                          ] as Array<{ dir: ResizeHandleDir; pos: string }>
                        ).map((h) => {
                          const handleCursor = getResizeCursorForHandle(
                            h.dir,
                            obj.rotation || 0,
                            currentPage.rotation || 0
                          );
                          return (
                            <div
                              key={h.dir}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                const { x: startX, y: startY } = getCanvasPdfPoint(
                                  e.clientX,
                                  e.clientY
                                );
                                setDragState({
                                  mode: 'resize',
                                  resizeDir: h.dir,
                                  activeCursor: handleCursor,
                                  objId: obj.id,
                                  startX,
                                  startY,
                                  origX: obj.x,
                                  origY: obj.y,
                                  origW: obj.width,
                                  origH: obj.height
                                });
                              }}
                              title={`Resize (${h.dir.toUpperCase()}) · Hold Shift for proportional`}
                              className={`absolute ${h.pos} w-5 h-5 flex items-center justify-center cursor-${handleCursor} z-30`}
                            >
                              <div className="w-2.5 h-2.5 bg-white border-2 border-emerald-600 rounded-[2px] shadow-xs pointer-events-none" />
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Floating Context Menu on Right-Click */}
          {contextMenu && (
            <div
              style={{ left: contextMenu.x, top: contextMenu.y }}
              className="fixed z-50 w-60 bg-theme-elevated border border-theme-strong rounded-lg shadow-2xl py-1.5 text-xs"
            >
              <button
                type="button"
                onClick={() => {
                  coverObjectWithOverlay(contextMenu.objId, false);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Cover w/ Whiteout Overlay (Method A)</span>
                <Eraser className="w-3.5 h-3.5 text-theme-accent" />
              </button>
              <button
                type="button"
                onClick={() => {
                  coverObjectWithOverlay(contextMenu.objId, true);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Cover w/ Background Blur Overlay</span>
                <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const refObj = objects.find((o) => o.id === contextMenu.objId);
                  if (refObj) cycleOverlappingObjects(refObj);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Select Object Underneath (Alt+Click)</span>
                <Layers className="w-3.5 h-3.5 text-theme-muted" />
              </button>
              <div className="my-1 border-t border-theme-subtle" />
              <button
                type="button"
                onClick={() => {
                  toggleObjectVisibility([contextMenu.objId]);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Toggle Visibility (Hide/Show)</span>
                <Eye className="w-3.5 h-3.5 text-theme-muted" />
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicateObjects([contextMenu.objId]);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Duplicate Object (Ctrl+D)</span>
                <Copy className="w-3.5 h-3.5 text-theme-muted" />
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleObjectLock([contextMenu.objId]);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Lock / Unlock Position</span>
                <Lock className="w-3.5 h-3.5 text-theme-muted" />
              </button>
              <button
                type="button"
                onClick={() => {
                  changeStackOrder(contextMenu.objId, 'front');
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Bring to Front</span>
                <ArrowUp className="w-3.5 h-3.5 text-theme-muted" />
              </button>
              <button
                type="button"
                onClick={() => {
                  changeStackOrder(contextMenu.objId, 'back');
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Send to Back</span>
                <ArrowDown className="w-3.5 h-3.5 text-theme-muted" />
              </button>
              <button
                type="button"
                onClick={() => {
                  convertObjectToRedaction(contextMenu.objId);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted text-amber-400 flex items-center justify-between cursor-pointer"
              >
                <span>Permanent Redact Underlying Stream</span>
                <ShieldAlert className="w-3.5 h-3.5" />
              </button>
              <div className="my-1 border-t border-theme-subtle" />
              <button
                type="button"
                onClick={() => {
                  removeObjectsPermanently([contextMenu.objId]);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-rose-500/20 text-rose-400 flex items-center justify-between cursor-pointer"
              >
                <span>Delete Object from PDF (Method B)</span>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </main>

        {/* --------------------------------------------------------- */}
        {/* RIGHT CONTEXTUAL PROPERTIES INSPECTOR (SECTIONS 8, 9, 17) */}
        {/* --------------------------------------------------------- */}
        {!rightPanelCollapsed && (
          <aside className="lg:col-span-3 border-l border-theme-subtle bg-theme-surface p-4 space-y-5 overflow-y-auto lg:h-full lg:min-h-0">
            {!primarySelectedObj ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                    Document &amp; Object Inspector
                  </h3>
                  <p className="text-xs text-theme-secondary mt-1 leading-relaxed">
                    Click any native PDF text run, graphic block, shape, or image on the canvas to select, move, resize from 8 handles, rotate, cover, blur, or delete it.
                  </p>
                </div>

                {/* Contextual Category Guide (No Duplicate Shape Grid) */}
                <div className="p-3.5 rounded-lg bg-theme-elevated border border-theme-subtle space-y-2 text-xs">
                  <div className="font-semibold text-theme-primary">
                    Categorized Toolbar Quick Access
                  </div>
                  <p className="text-[11px] text-theme-secondary leading-relaxed">
                    Hover or click any category in the top toolbar (<span className="text-theme-primary font-semibold">Select, Text, Images, Shapes, Effects, Arrange, Annotate, Page Design, Forms, More</span>) to open its contextual tool panel. Click a category to pin its panel open while working.
                  </p>
                </div>

                {/* Keyboard Shortcuts Reference */}
                <div className="p-3.5 rounded-lg bg-theme-elevated border border-theme-subtle space-y-1.5 text-[11px] text-theme-secondary">
                  <div className="font-bold text-theme-primary">Canvas Precision Shortcuts</div>
                  <div className="flex justify-between">
                    <span>Double-Click Text:</span>
                    <span className="font-mono text-theme-primary">Inline Edit</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Alt + Click:</span>
                    <span className="font-mono text-theme-primary">Select Underneath</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Arrow / Shift+Arrow:</span>
                    <span className="font-mono text-theme-primary">Nudge 1pt / 10pt</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ctrl+C / Ctrl+V / Ctrl+D:</span>
                    <span className="font-mono text-theme-primary">Copy / Paste / Dup</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delete / Backspace:</span>
                    <span className="font-mono text-theme-primary">Delete PDF Object</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Selected Object Header */}
                <div className="pb-3 border-b border-theme-subtle space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-theme-accent font-semibold">
                      {primarySelectedObj.isCoverOverlay
                        ? 'Method A · Cover Overlay'
                        : primarySelectedObj.isNative
                        ? 'Native PDF Stream Object'
                        : 'Editor-Managed Object'}
                    </span>
                    <button
                      type="button"
                      onClick={() => cycleOverlappingObjects(primarySelectedObj)}
                      title="Select overlapping object underneath (Alt+Click)"
                      className="text-[11px] text-theme-secondary hover:text-theme-accent underline cursor-pointer"
                    >
                      Cycle Underneath
                    </button>
                  </div>
                  <input
                    type="text"
                    value={primarySelectedObj.name}
                    onChange={(e) =>
                      updateObjectsWithHistory(
                        (prev) =>
                          prev.map((o) =>
                            o.id === primarySelectedObj.id ? { ...o, name: e.target.value } : o
                          ),
                        'Rename Object'
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle font-bold text-theme-primary"
                  />
                </div>

                {/* Multi-Object Alignment, Distribution & Grouping Bar */}
                {selectedIds.length > 1 && (
                  <div className="p-2.5 rounded-lg bg-theme-elevated border border-emerald-500/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-theme-primary">
                        {selectedIds.length} Objects Selected
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleGroupSelected}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-theme-surface border border-theme-subtle text-[11px] font-semibold hover:border-theme-accent cursor-pointer"
                        >
                          <Group className="w-3 h-3" />
                          Group
                        </button>
                        <button
                          type="button"
                          onClick={handleUngroupSelected}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-theme-surface border border-theme-subtle text-[11px] font-semibold hover:border-theme-accent cursor-pointer"
                        >
                          <Ungroup className="w-3 h-3" />
                          Ungroup
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => alignSelectedObjects('left')}
                        className="py-1 rounded bg-theme-surface border border-theme-subtle hover:border-theme-accent cursor-pointer"
                      >
                        Align L
                      </button>
                      <button
                        type="button"
                        onClick={() => alignSelectedObjects('center')}
                        className="py-1 rounded bg-theme-surface border border-theme-subtle hover:border-theme-accent cursor-pointer"
                      >
                        Center H
                      </button>
                      <button
                        type="button"
                        onClick={() => alignSelectedObjects('right')}
                        className="py-1 rounded bg-theme-surface border border-theme-subtle hover:border-theme-accent cursor-pointer"
                      >
                        Align R
                      </button>
                      <button
                        type="button"
                        onClick={() => alignSelectedObjects('distribute-h')}
                        className="py-1 rounded bg-theme-surface border border-theme-subtle hover:border-theme-accent cursor-pointer"
                      >
                        Dist H
                      </button>
                      <button
                        type="button"
                        onClick={() => alignSelectedObjects('top')}
                        className="py-1 rounded bg-theme-surface border border-theme-subtle hover:border-theme-accent cursor-pointer"
                      >
                        Align T
                      </button>
                      <button
                        type="button"
                        onClick={() => alignSelectedObjects('middle')}
                        className="py-1 rounded bg-theme-surface border border-theme-subtle hover:border-theme-accent cursor-pointer"
                      >
                        Middle V
                      </button>
                      <button
                        type="button"
                        onClick={() => alignSelectedObjects('bottom')}
                        className="py-1 rounded bg-theme-surface border border-theme-subtle hover:border-theme-accent cursor-pointer"
                      >
                        Align B
                      </button>
                      <button
                        type="button"
                        onClick={() => alignSelectedObjects('distribute-v')}
                        className="py-1 rounded bg-theme-surface border border-theme-subtle hover:border-theme-accent cursor-pointer"
                      >
                        Dist V
                      </button>
                    </div>
                  </div>
                )}

                {/* Two Content Hiding / Removal Methods Quick Bar (Section 6) */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-theme-secondary">
                    Content Hiding &amp; Object Removal
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => coverObjectWithOverlay(primarySelectedObj.id, false)}
                      title="Method A: Place a movable whiteout shape overlay over this object without deleting it"
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle hover:border-theme-accent font-semibold cursor-pointer"
                    >
                      <Eraser className="w-3.5 h-3.5 text-theme-accent" />
                      <span>Cover w/ Overlay</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => coverObjectWithOverlay(primarySelectedObj.id, true)}
                      title="Method A: Place a movable background-blur overlay over this object"
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle hover:border-theme-accent font-semibold cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
                      <span>Cover w/ Blur</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleObjectVisibility([primarySelectedObj.id])}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle hover:border-theme-accent font-semibold cursor-pointer"
                    >
                      {primarySelectedObj.visible ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                          <span>Hide Layer</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Show Layer</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeObjectsPermanently([primarySelectedObj.id])}
                      title="Method B: Genuinely delete this object from the exported PDF document"
                      className="flex items-center justify-center gap-1 py-1.5 px-2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 font-semibold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Object</span>
                    </button>
                  </div>
                </div>

                {/* ========================================================= */}
                {/* TEXT CONTENT & TYPOGRAPHY CONTROLS (SECTION 10 + OCR)     */}
                {/* ========================================================= */}
                {(primarySelectedObj.type === 'native-text' ||
                  primarySelectedObj.type === 'ocr-text' ||
                  primarySelectedObj.type === 'added-text' ||
                  primarySelectedObj.type === 'watermark' ||
                  primarySelectedObj.shapeKind === 'sticky-note') && (
                  <div className="space-y-3 pt-2 border-t border-theme-subtle">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-theme-primary">
                        {primarySelectedObj.type === 'ocr-text'
                          ? 'Edit Scanned OCR Text Region'
                          : primarySelectedObj.isNative
                          ? 'Edit Native PDF Text'
                          : 'Text Content'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditingTextObjId(primarySelectedObj.id)}
                        className="text-[11px] text-theme-accent hover:underline cursor-pointer"
                      >
                        Edit Inline on Canvas
                      </button>
                    </div>

                    <textarea
                      rows={3}
                      dir="ltr"
                      value={primarySelectedObj.text || ''}
                      onChange={(e) => {
                        handleUpdateObjectText(primarySelectedObj.id, e.target.value);
                      }}
                      onBlur={() => pushSnapshot(pages, objects, 'Modify Text Content')}
                      className="w-full p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary focus:outline-none focus:border-theme-accent"
                    />

                    {/* SCANNED BACKGROUND RECONSTRUCTION & COORDINATE ANCHOR CONTROLS (SECTIONS 2–11) */}
                    {primarySelectedObj.type === 'ocr-text' && (
                      <div className="p-2.5 rounded-lg bg-theme-elevated border border-cyan-500/30 space-y-2.5 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-cyan-300">
                            Scanned OCR Geometry &amp; Reconstruction
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                              (primarySelectedObj.ocrConfidence ?? 95) < 75 &&
                              !primarySelectedObj.ocrConfidenceVerified
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {primarySelectedObj.ocrConfidence ?? 95}% Conf
                          </span>
                        </div>

                        {/* Coordinate Pipeline Readout & Snap Back to Original Anchor */}
                        <div className="p-2 rounded bg-theme-surface/80 border border-theme-subtle font-mono text-[10px] space-y-1 text-theme-secondary">
                          <div className="flex items-center justify-between">
                            <span className="text-theme-muted">Original OCR Anchor:</span>
                            <span className="text-theme-primary font-semibold">
                              X:{Math.round(primarySelectedObj.originalX ?? primarySelectedObj.x)} · Y:
                              {Math.round(primarySelectedObj.originalY ?? primarySelectedObj.y)} · W:
                              {Math.round(
                                primarySelectedObj.originalWidth ?? primarySelectedObj.width
                              )}
                              ×H:
                              {Math.round(
                                primarySelectedObj.originalHeight ?? primarySelectedObj.height
                              )}
                              pt
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-theme-muted">Active Box &amp; Align:</span>
                            <span className="text-cyan-300 font-semibold">
                              X:{Math.round(primarySelectedObj.x)} · Y:{Math.round(primarySelectedObj.y)}{' '}
                              · W:{Math.round(primarySelectedObj.width)}pt ·{' '}
                              {(primarySelectedObj.textAlign || 'left').toUpperCase()}
                            </span>
                          </div>
                          {primarySelectedObj.ocrGeometry && (
                            <div className="flex items-center justify-between">
                              <span className="text-theme-muted">Image BBox (px):</span>
                              <span>
                                [{primarySelectedObj.ocrGeometry.imageBboxPx.x0},
                                {primarySelectedObj.ocrGeometry.imageBboxPx.y0} →{' '}
                                {primarySelectedObj.ocrGeometry.imageBboxPx.x1},
                                {primarySelectedObj.ocrGeometry.imageBboxPx.y1}]
                              </span>
                            </div>
                          )}
                          {(Math.abs(
                            primarySelectedObj.x -
                              (primarySelectedObj.originalX ?? primarySelectedObj.x)
                          ) > 1 ||
                            Math.abs(
                              primarySelectedObj.y -
                                (primarySelectedObj.originalY ?? primarySelectedObj.y)
                            ) > 1) && (
                            <button
                              type="button"
                              onClick={() => {
                                const pageWidthPt = currentPage?.width || 612;
                                updateObjectsWithHistory(
                                  (prev) =>
                                    prev.map((o) => {
                                      if (o.id !== primarySelectedObj.id) return o;
                                      const resetObj: PdfEditableObject = {
                                        ...o,
                                        x: o.originalX ?? o.x,
                                        y: o.originalY ?? o.y,
                                        width: o.originalWidth ?? o.width,
                                        height: o.originalHeight ?? o.height
                                      };
                                      const fitted = fitReplacementTextToOcrGeometry(
                                        resetObj,
                                        o.text || '',
                                        pageWidthPt
                                      );
                                      return {
                                        ...resetObj,
                                        x: fitted.x,
                                        y: fitted.y,
                                        width: fitted.width,
                                        height: fitted.height
                                      };
                                    }),
                                  'Snap OCR Region Back to Original Anchor'
                                );
                              }}
                              className="w-full mt-1 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-sans font-semibold hover:bg-cyan-500/30 cursor-pointer"
                            >
                              Snap Back to Original OCR Anchor
                            </button>
                          )}
                        </div>

                        {(primarySelectedObj.ocrConfidence ?? 95) < 75 &&
                          !primarySelectedObj.ocrConfidenceVerified && (
                            <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-200">
                              <span>Low-confidence OCR region. Verify text above.</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateObjectsWithHistory(
                                    (prev) =>
                                      prev.map((o) =>
                                        o.id === primarySelectedObj.id
                                          ? { ...o, ocrConfidenceVerified: true }
                                          : o
                                      ),
                                    'Verify Low-Confidence OCR Region'
                                  )
                                }
                                className="px-2 py-0.5 rounded bg-amber-500 text-black font-bold shrink-0 cursor-pointer"
                              >
                                Mark Verified
                              </button>
                            </div>
                          )}

                        <div className="space-y-1">
                          <label className="block text-theme-secondary">
                            Reconstruction Method (underneath edited/removed text):
                          </label>
                          <div className="grid grid-cols-3 gap-1">
                            {(
                              [
                                { id: 'inpaint-texture', label: 'B: Texture Inpaint' },
                                { id: 'auto-color', label: 'A: Auto Paper' },
                                { id: 'manual-solid', label: 'C: Solid Color' }
                              ] as const
                            ).map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() =>
                                  updateOcrBgReconstruction(primarySelectedObj.id, m.id)
                                }
                                className={`py-1 px-1.5 rounded border text-[10px] font-semibold cursor-pointer ${
                                  (primarySelectedObj.bgReconstructionMethod ||
                                    'inpaint-texture') === m.id
                                    ? 'bg-theme-accent text-white border-transparent'
                                    : 'bg-theme-surface border-theme-subtle text-theme-secondary hover:text-theme-primary'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {primarySelectedObj.bgReconstructionMethod === 'manual-solid' && (
                          <div className="flex items-center justify-between">
                            <span className="text-theme-secondary">Custom Patch Fill Color:</span>
                            <input
                              type="color"
                              value={
                                primarySelectedObj.fillColor ||
                                primarySelectedObj.sampledBgColor ||
                                '#FAF8F5'
                              }
                              onChange={(e) =>
                                updateOcrBgReconstruction(
                                  primarySelectedObj.id,
                                  'manual-solid',
                                  e.target.value
                                )
                              }
                              className="w-6 h-6 rounded cursor-pointer border border-theme-subtle bg-transparent"
                            />
                          </div>
                        )}

                        <div>
                          <div className="flex justify-between text-[10px] text-theme-muted">
                            <span>Mask Cleanup Padding</span>
                            <span>{primarySelectedObj.bgMaskPadding ?? 1.5} pt</span>
                          </div>
                          <input
                            type="range"
                            min={-2}
                            max={10}
                            step={0.5}
                            value={primarySelectedObj.bgMaskPadding ?? 1.5}
                            onChange={(e) =>
                              updateOcrBgReconstruction(
                                primarySelectedObj.id,
                                primarySelectedObj.bgReconstructionMethod || 'inpaint-texture',
                                undefined,
                                Number(e.target.value)
                              )
                            }
                            className="w-full accent-emerald-600 cursor-pointer"
                          />
                        </div>

                        {/* ========================================================= */}
                        {/* OCR TYPOGRAPHY & FONT MATCHING DIAGNOSTICS (SECTIONS 3–16) */}
                        {/* ========================================================= */}
                        <div className="pt-2 border-t border-cyan-500/25 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-theme-accent">
                              OCR Font &amp; Style Reconstruction
                            </span>
                            <button
                              type="button"
                              onClick={() => handleMatchOriginalTextStyle(primarySelectedObj.id)}
                              title="Re-analyze original scanned image pixels and neighbouring regions to match font family, size, weight, spacing, and ink color (Section 11)"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold text-[10px] hover:bg-emerald-500 cursor-pointer shadow-2xs"
                            >
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>Match Original Text Style</span>
                            </button>
                          </div>

                          {primarySelectedObj.ocrTypography && (
                            <div className="p-2 rounded bg-theme-surface/90 border border-theme-subtle space-y-1.5 text-[10px]">
                              <div className="flex items-center justify-between">
                                <span className="text-theme-muted">Detected Class:</span>
                                <span className="font-mono font-bold text-theme-accent uppercase">
                                  {primarySelectedObj.ocrTypography.fontClassification} (
                                  {primarySelectedObj.ocrTypography.fontStyleDescriptor}) ·{' '}
                                  {Math.round(primarySelectedObj.ocrTypography.confidence * 100)}%
                                  Match
                                </span>
                              </div>
                              <div className="flex items-center justify-between font-mono text-theme-secondary">
                                <span>Cap/x-Height:</span>
                                <span>
                                  {primarySelectedObj.ocrTypography.capHeightPt}pt /{' '}
                                  {primarySelectedObj.ocrTypography.xHeightPt}pt · Stroke:{' '}
                                  {primarySelectedObj.ocrTypography.strokeThicknessPx}px
                                </span>
                              </div>
                              {primarySelectedObj.ocrTypography.nearbyReferenceTexts &&
                                primarySelectedObj.ocrTypography.nearbyReferenceTexts.length > 0 && (
                                  <div className="text-theme-muted truncate">
                                    <span className="text-theme-secondary font-semibold">
                                      Pooled Peers:{' '}
                                    </span>
                                    {primarySelectedObj.ocrTypography.nearbyReferenceTexts
                                      .slice(0, 3)
                                      .join(' · ')}
                                  </div>
                                )}

                              {/* Ranked Candidate Font Alternatives (Section 5) */}
                              {primarySelectedObj.ocrTypography.candidateMatches &&
                                primarySelectedObj.ocrTypography.candidateMatches.length > 0 && (
                                  <div className="space-y-1 pt-1">
                                    <div className="text-theme-muted font-semibold">
                                      Top Visual Font Candidates (Click to apply):
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {primarySelectedObj.ocrTypography.candidateMatches
                                        .slice(0, 4)
                                        .map((cand) => {
                                          const isCurr =
                                            (primarySelectedObj.fontFamily ||
                                              primarySelectedObj.ocrTypography?.matchedFontFamily) ===
                                            cand.fontFamily;
                                          return (
                                            <button
                                              key={cand.fontFamily}
                                              type="button"
                                              onClick={() => {
                                                const pageWidthPt = currentPage?.width || 612;
                                                updateObjectsWithHistory((prev) => {
                                                  const peers = prev.filter(
                                                    (p) =>
                                                      p.pageIndex === primarySelectedObj.pageIndex &&
                                                      !p.deleted
                                                  );
                                                  return prev.map((o) => {
                                                    if (o.id !== primarySelectedObj.id) return o;
                                                    const updated: PdfEditableObject = {
                                                      ...o,
                                                      fontFamily: cand.fontFamily
                                                    };
                                                    const fitted = fitReplacementTextToOcrGeometry(
                                                      updated,
                                                      o.text || '',
                                                      pageWidthPt,
                                                      peers
                                                    );
                                                    return withRefreshedComparisonCrops({
                                                      ...updated,
                                                      x: fitted.x,
                                                      y: fitted.y,
                                                      width: fitted.width,
                                                      height: fitted.height,
                                                      widthOverflowWarning:
                                                        fitted.widthOverflowWarning,
                                                      ocrEdited: true
                                                    });
                                                  });
                                                }, `Apply Candidate Font ${cand.fontFamily}`);
                                              }}
                                              className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer ${
                                                isCurr
                                                  ? 'bg-emerald-600 text-white border-emerald-400 font-bold'
                                                  : 'bg-theme-elevated border-theme-subtle text-theme-secondary hover:text-theme-primary'
                                              }`}
                                            >
                                              {cand.fontFamily} ({Math.round(cand.similarityScore * 100)}%)
                                            </button>
                                          );
                                        })}
                                    </div>
                                  </div>
                                )}

                              {/* Section 16: Side-by-Side Original Text | Replacement Preview Diagnostic View */}
                              {(primarySelectedObj.ocrTypography.originalCropDataUrl ||
                                primarySelectedObj.ocrTypography.replacementPreviewCropDataUrl) && (
                                <div className="pt-1.5 space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-semibold text-cyan-300">
                                    <span>Original Text | Replacement Preview</span>
                                    <span className="text-[9px] font-mono text-theme-muted">
                                      1:1 Scan Fidelity Check
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div className="p-1 rounded bg-black/30 border border-theme-subtle">
                                      <div className="text-[9px] text-theme-muted mb-0.5 font-mono">
                                        Original Scan Crop
                                      </div>
                                      {primarySelectedObj.ocrTypography.originalCropDataUrl ? (
                                        <img
                                          src={primarySelectedObj.ocrTypography.originalCropDataUrl}
                                          alt="Original scanned text crop"
                                          className="w-full h-9 object-contain bg-white/90 rounded-2xs"
                                        />
                                      ) : (
                                        <div className="h-9 flex items-center justify-center text-[9px] text-theme-muted">
                                          N/A
                                        </div>
                                      )}
                                    </div>
                                    <div className="p-1 rounded bg-black/30 border border-emerald-500/40">
                                      <div className="text-[9px] text-theme-accent mb-0.5 font-mono">
                                        Replacement Preview
                                      </div>
                                      {primarySelectedObj.ocrTypography
                                        .replacementPreviewCropDataUrl ? (
                                        <img
                                          src={
                                            primarySelectedObj.ocrTypography
                                              .replacementPreviewCropDataUrl
                                          }
                                          alt="Matched replacement text preview crop"
                                          className="w-full h-9 object-contain bg-white/90 rounded-2xs"
                                        />
                                      ) : (
                                        <div className="h-9 flex items-center justify-center text-[9px] text-theme-muted">
                                          N/A
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Section 9: Width Overflow Warning Banner */}
                          {primarySelectedObj.widthOverflowWarning && (
                            <div className="p-1.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-200 text-[10px]">
                              {primarySelectedObj.widthOverflowWarning}
                            </div>
                          )}

                          {/* Section 13: Scanned Print Realism & Ink Sampling */}
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <label className="inline-flex items-center gap-1.5 text-[10px] text-theme-secondary cursor-pointer">
                              <input
                                type="checkbox"
                                checked={primarySelectedObj.scanPrintRealism !== false}
                                onChange={(e) => {
                                  const enabled = e.target.checked;
                                  updateObjectsWithHistory(
                                    (prev) =>
                                      prev.map((o) =>
                                        o.id === primarySelectedObj.id
                                          ? withRefreshedComparisonCrops({
                                              ...o,
                                              scanPrintRealism: enabled,
                                              ocrEdited: true
                                            })
                                          : o
                                      ),
                                    'Toggle Scan Print Realism'
                                  );
                                }}
                                className="rounded"
                              />
                              <span>Scan Print Realism (Edge Softness &amp; Grain)</span>
                            </label>

                            {primarySelectedObj.sampledTextColor && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateObjectsWithHistory(
                                    (prev) =>
                                      prev.map((o) =>
                                        o.id === primarySelectedObj.id
                                          ? withRefreshedComparisonCrops({
                                              ...o,
                                              color: o.sampledTextColor,
                                              ocrEdited: true
                                            })
                                          : o
                                      ),
                                    'Restore Sampled Scan Ink Color'
                                  )
                                }
                                className="px-1.5 py-0.5 rounded bg-theme-surface border border-theme-subtle text-[9px] text-theme-secondary hover:text-theme-primary cursor-pointer"
                              >
                                Use Scan Ink ({primarySelectedObj.sampledTextColor})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Font Family (10-Font Licensed Catalog) & Font Size */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-theme-secondary mb-1">
                          Font Family
                        </label>
                        <select
                          value={primarySelectedObj.fontFamily || 'Helvetica'}
                          onChange={(e) => {
                            const nextFam = e.target.value as PdfFontFamily;
                            const pageWidthPt = currentPage?.width || 612;
                            updateObjectsWithHistory(
                              (prev) => {
                                const peers = prev.filter(
                                  (p) =>
                                    p.pageIndex === primarySelectedObj.pageIndex && !p.deleted
                                );
                                return prev.map((o) => {
                                  if (o.id !== primarySelectedObj.id) return o;
                                  const updated: PdfEditableObject = { ...o, fontFamily: nextFam };
                                  if (o.type === 'ocr-text') {
                                    const fitted = fitReplacementTextToOcrGeometry(
                                      updated,
                                      o.text || '',
                                      pageWidthPt,
                                      peers
                                    );
                                    return withRefreshedComparisonCrops({
                                      ...updated,
                                      x: fitted.x,
                                      y: fitted.y,
                                      width: fitted.width,
                                      height: fitted.height,
                                      widthOverflowWarning: fitted.widthOverflowWarning,
                                      ocrEdited: true
                                    });
                                  }
                                  return updated;
                                });
                              },
                              `Change Font to ${getFontDisplayName(nextFam)}`
                            );
                          }}
                          className="w-full px-2 py-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary text-[11px]"
                        >
                          <optgroup label="Monospaced / Receipt / Typewriter">
                            {FONT_CANDIDATE_CATALOG.filter(
                              (f) => f.classification === 'monospaced'
                            ).map((f) => (
                              <option key={f.fontFamily} value={f.fontFamily}>
                                {f.displayName}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Serif / Book / Slab-Serif">
                            {FONT_CANDIDATE_CATALOG.filter(
                              (f) =>
                                f.classification === 'serif' ||
                                f.classification === 'slab-serif'
                            ).map((f) => (
                              <option key={f.fontFamily} value={f.fontFamily}>
                                {f.displayName}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Sans-Serif / Condensed">
                            {FONT_CANDIDATE_CATALOG.filter(
                              (f) =>
                                f.classification === 'sans-serif' ||
                                f.classification === 'condensed-sans'
                            ).map((f) => (
                              <option key={f.fontFamily} value={f.fontFamily}>
                                {f.displayName}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-theme-secondary mb-1">
                          Font Size (pt)
                        </label>
                        <input
                          type="number"
                          min={6}
                          max={120}
                          step={0.5}
                          value={primarySelectedObj.fontSize || 12}
                          onChange={(e) => {
                            const nextSize = Number(e.target.value) || 12;
                            const pageWidthPt = currentPage?.width || 612;
                            updateObjectsWithHistory(
                              (prev) => {
                                const peers = prev.filter(
                                  (p) =>
                                    p.pageIndex === primarySelectedObj.pageIndex && !p.deleted
                                );
                                return prev.map((o) => {
                                  if (o.id !== primarySelectedObj.id) return o;
                                  const updated = { ...o, fontSize: nextSize };
                                  if (o.type === 'ocr-text') {
                                    const fitted = fitReplacementTextToOcrGeometry(
                                      updated,
                                      o.text || '',
                                      pageWidthPt,
                                      peers
                                    );
                                    return withRefreshedComparisonCrops({
                                      ...updated,
                                      x: fitted.x,
                                      y: fitted.y,
                                      width: fitted.width,
                                      height: fitted.height,
                                      fontSize: nextSize,
                                      widthOverflowWarning: fitted.widthOverflowWarning,
                                      ocrEdited: true
                                    });
                                  }
                                  return updated;
                                });
                              },
                              'Change Font Size'
                            );
                          }}
                          className="w-full px-2 py-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Granular Font Weight Selector (300 Light to 700 Bold — Section 8 & 10) */}
                    <div>
                      <label className="block text-[10px] text-theme-muted mb-1">
                        Font Weight (Stroke Thickness)
                      </label>
                      <div className="grid grid-cols-5 gap-1">
                        {(
                          [
                            { w: 300, label: 'Light' },
                            { w: 400, label: 'Regular' },
                            { w: 500, label: 'Medium' },
                            { w: 600, label: 'Semi' },
                            { w: 700, label: 'Bold' }
                          ] as const
                        ).map((item) => {
                          const currentWeight =
                            primarySelectedObj.numericFontWeight ||
                            (primarySelectedObj.fontWeight === 'bold' ? 700 : 400);
                          const active = currentWeight === item.w;
                          return (
                            <button
                              key={item.w}
                              type="button"
                              onClick={() => {
                                const pageWidthPt = currentPage?.width || 612;
                                updateObjectsWithHistory((prev) => {
                                  const peers = prev.filter(
                                    (p) =>
                                      p.pageIndex === primarySelectedObj.pageIndex && !p.deleted
                                  );
                                  return prev.map((o) => {
                                    if (o.id !== primarySelectedObj.id) return o;
                                    const updated: PdfEditableObject = {
                                      ...o,
                                      numericFontWeight: item.w,
                                      fontWeight: item.w >= 600 ? 'bold' : 'normal'
                                    };
                                    if (o.type === 'ocr-text') {
                                      const fitted = fitReplacementTextToOcrGeometry(
                                        updated,
                                        o.text || '',
                                        pageWidthPt,
                                        peers
                                      );
                                      return withRefreshedComparisonCrops({
                                        ...updated,
                                        x: fitted.x,
                                        y: fitted.y,
                                        width: fitted.width,
                                        height: fitted.height,
                                        widthOverflowWarning: fitted.widthOverflowWarning,
                                        ocrEdited: true
                                      });
                                    }
                                    return updated;
                                  });
                                }, `Set Font Weight ${item.label} (${item.w})`);
                              }}
                              className={`py-1 rounded border text-[10px] cursor-pointer ${
                                active
                                  ? 'bg-theme-accent text-white border-transparent font-bold'
                                  : 'bg-theme-elevated border-theme-subtle text-theme-secondary hover:text-theme-primary'
                              }`}
                            >
                              {item.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bold, Italic, Underline, Alignment, Color */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const pageWidthPt = currentPage?.width || 612;
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) => {
                                  if (o.id !== primarySelectedObj.id) return o;
                                  const nextWeight: 'normal' | 'bold' =
                                    o.fontWeight === 'bold' ? 'normal' : 'bold';
                                  const nextNum: 400 | 700 = nextWeight === 'bold' ? 700 : 400;
                                  const updated: PdfEditableObject = {
                                    ...o,
                                    fontWeight: nextWeight,
                                    numericFontWeight: nextNum
                                  };
                                  if (o.type === 'ocr-text') {
                                    const fitted = fitReplacementTextToOcrGeometry(
                                      updated,
                                      o.text || '',
                                      pageWidthPt
                                    );
                                    return withRefreshedComparisonCrops({
                                      ...updated,
                                      x: fitted.x,
                                      y: fitted.y,
                                      width: fitted.width,
                                      height: fitted.height,
                                      ocrEdited: true
                                    });
                                  }
                                  return updated;
                                }),
                              'Toggle Bold'
                            );
                          }}
                          className={`px-2 py-1 rounded border font-bold cursor-pointer ${
                            primarySelectedObj.fontWeight === 'bold'
                              ? 'bg-theme-accent text-white border-transparent'
                              : 'bg-theme-elevated border-theme-subtle text-theme-primary'
                          }`}
                        >
                          B
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? withRefreshedComparisonCrops({
                                        ...o,
                                        fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic',
                                        ocrEdited: o.type === 'ocr-text' ? true : o.ocrEdited
                                      })
                                    : o
                                ),
                              'Toggle Italic'
                            )
                          }
                          className={`px-2 py-1 rounded border italic cursor-pointer ${
                            primarySelectedObj.fontStyle === 'italic'
                              ? 'bg-theme-accent text-white border-transparent'
                              : 'bg-theme-elevated border-theme-subtle text-theme-primary'
                          }`}
                        >
                          I
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? {
                                        ...o,
                                        underline: !o.underline,
                                        ocrEdited: o.type === 'ocr-text' ? true : o.ocrEdited
                                      }
                                    : o
                                ),
                              'Toggle Underline'
                            )
                          }
                          className={`px-2 py-1 rounded border underline cursor-pointer ${
                            primarySelectedObj.underline
                              ? 'bg-theme-accent text-white border-transparent'
                              : 'bg-theme-elevated border-theme-subtle text-theme-primary'
                          }`}
                        >
                          U
                        </button>

                        {/* Text Alignment (Preserving Anchor Position!) */}
                        {(
                          [
                            { align: 'left', icon: AlignLeft },
                            { align: 'center', icon: AlignCenter },
                            { align: 'right', icon: AlignRight }
                          ] as const
                        ).map((a) => {
                          const Icon = a.icon;
                          return (
                            <button
                              key={a.align}
                              type="button"
                              onClick={() => {
                                const pageWidthPt = currentPage?.width || 612;
                                updateObjectsWithHistory(
                                  (prev) =>
                                    prev.map((o) => {
                                      if (o.id !== primarySelectedObj.id) return o;
                                      const updated = { ...o, textAlign: a.align };
                                      if (o.type === 'ocr-text') {
                                        const fitted = fitReplacementTextToOcrGeometry(
                                          updated,
                                          o.text || '',
                                          pageWidthPt
                                        );
                                        return withRefreshedComparisonCrops({
                                          ...updated,
                                          x: fitted.x,
                                          y: fitted.y,
                                          width: fitted.width,
                                          height: fitted.height,
                                          ocrEdited: true
                                        });
                                      }
                                      return updated;
                                    }),
                                  `Align Text ${a.align}`
                                );
                              }}
                              className={`p-1.5 rounded border cursor-pointer ${
                                (primarySelectedObj.textAlign || 'left') === a.align
                                  ? 'bg-theme-accent text-white border-transparent'
                                  : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                              }`}
                            >
                              <Icon className="w-3 h-3" />
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-theme-secondary">Ink:</span>
                        <input
                          type="color"
                          value={primarySelectedObj.color || '#18181B'}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? withRefreshedComparisonCrops({
                                        ...o,
                                        color: e.target.value,
                                        ocrEdited: o.type === 'ocr-text' ? true : o.ocrEdited
                                      })
                                    : o
                                ),
                              'Change Text Color'
                            )
                          }
                          className="w-6 h-6 rounded cursor-pointer border border-theme-subtle bg-transparent"
                        />
                      </div>
                    </div>

                    {/* Line Spacing, Character Spacing, Horizontal Scale & Baseline Offset (Section 10) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-theme-muted">
                          Line Height ({primarySelectedObj.lineHeight || 1.2}×)
                        </label>
                        <input
                          type="range"
                          min={0.9}
                          max={2.4}
                          step={0.05}
                          value={primarySelectedObj.lineHeight || 1.2}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? {
                                        ...o,
                                        lineHeight: Number(e.target.value),
                                        ocrEdited: o.type === 'ocr-text' ? true : o.ocrEdited
                                      }
                                    : o
                                ),
                              'Change Line Height'
                            )
                          }
                          className="w-full accent-emerald-600 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-theme-muted">
                          Char Spacing ({primarySelectedObj.letterSpacing || 0}pt)
                        </label>
                        <input
                          type="range"
                          min={-1.2}
                          max={6}
                          step={0.1}
                          value={primarySelectedObj.letterSpacing || 0}
                          onChange={(e) => {
                            const nextSpacing = Number(e.target.value);
                            const pageWidthPt = currentPage?.width || 612;
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) => {
                                  if (o.id !== primarySelectedObj.id) return o;
                                  const updated = { ...o, letterSpacing: nextSpacing };
                                  if (o.type === 'ocr-text') {
                                    const fitted = fitReplacementTextToOcrGeometry(
                                      updated,
                                      o.text || '',
                                      pageWidthPt
                                    );
                                    return withRefreshedComparisonCrops({
                                      ...updated,
                                      x: fitted.x,
                                      y: fitted.y,
                                      width: fitted.width,
                                      height: fitted.height,
                                      ocrEdited: true
                                    });
                                  }
                                  return updated;
                                }),
                              'Change Character Spacing'
                            );
                          }}
                          className="w-full accent-emerald-600 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-theme-muted">
                          Horizontal Scale (
                          {Math.round((primarySelectedObj.horizontalScale ?? 1) * 100)}%)
                        </label>
                        <input
                          type="range"
                          min={0.8}
                          max={1.25}
                          step={0.02}
                          value={primarySelectedObj.horizontalScale ?? 1}
                          onChange={(e) => {
                            const nextScale = Number(e.target.value);
                            const pageWidthPt = currentPage?.width || 612;
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) => {
                                  if (o.id !== primarySelectedObj.id) return o;
                                  const updated = { ...o, horizontalScale: nextScale };
                                  if (o.type === 'ocr-text') {
                                    const fitted = fitReplacementTextToOcrGeometry(
                                      updated,
                                      o.text || '',
                                      pageWidthPt
                                    );
                                    return withRefreshedComparisonCrops({
                                      ...updated,
                                      x: fitted.x,
                                      y: fitted.y,
                                      width: fitted.width,
                                      height: fitted.height,
                                      ocrEdited: true
                                    });
                                  }
                                  return updated;
                                }),
                              'Change Horizontal Text Scale'
                            );
                          }}
                          className="w-full accent-emerald-600 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-theme-muted">
                          Baseline Offset ({primarySelectedObj.baselineAdjustmentPt || 0}pt)
                        </label>
                        <input
                          type="range"
                          min={-4}
                          max={4}
                          step={0.25}
                          value={primarySelectedObj.baselineAdjustmentPt || 0}
                          onChange={(e) => {
                            const nextBase = Number(e.target.value);
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? withRefreshedComparisonCrops({
                                        ...o,
                                        baselineAdjustmentPt: nextBase,
                                        ocrEdited: o.type === 'ocr-text' ? true : o.ocrEdited
                                      })
                                    : o
                                ),
                              'Adjust Baseline Offset'
                            );
                          }}
                          className="w-full accent-emerald-600 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ========================================================= */}
                {/* SHAPE, FILL & BORDER CUSTOMIZATION (SECTIONS 7 & 8)       */}
                {/* ========================================================= */}
                {(primarySelectedObj.type === 'shape' ||
                  primarySelectedObj.type === 'annotation' ||
                  primarySelectedObj.type === 'native-shape') && (
                  <div className="space-y-3.5 pt-2 border-t border-theme-subtle">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-theme-primary">
                        Shape &amp; Appearance Controls
                      </span>
                      <select
                        value={primarySelectedObj.shapeKind || 'rectangle'}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, shapeKind: e.target.value as PdfShapeKind }
                                  : o
                              ),
                            'Change Shape Geometry'
                          )
                        }
                        className="px-2 py-1 rounded bg-theme-elevated border border-theme-subtle text-[11px] text-theme-primary"
                      >
                        <option value="rectangle">Rectangle</option>
                        <option value="rounded-rectangle">Rounded Rectangle</option>
                        <option value="circle">Circle / Ellipse</option>
                        <option value="polygon">Regular Polygon</option>
                        <option value="line">Straight Line</option>
                        <option value="arrow">Directional Arrow</option>
                        <option value="highlight">Highlight Band</option>
                      </select>
                    </div>

                    {/* Polygon Sides or Custom Path Close Toggle */}
                    {primarySelectedObj.shapeKind === 'polygon' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-theme-secondary">
                          Polygon Sides ({primarySelectedObj.polygonSides || 5}):
                        </span>
                        <input
                          type="range"
                          min={3}
                          max={10}
                          step={1}
                          value={primarySelectedObj.polygonSides || 5}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, polygonSides: Number(e.target.value) }
                                    : o
                                ),
                              'Change Polygon Sides'
                            )
                          }
                          className="w-32 accent-emerald-600 cursor-pointer"
                        />
                      </div>
                    )}

                    {primarySelectedObj.shapeKind === 'freehand' && (
                      <label className="flex items-center gap-2 text-[11px] text-theme-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(primarySelectedObj.closePath)}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? {
                                        ...o,
                                        closePath: e.target.checked,
                                        transparentFill: !e.target.checked
                                      }
                                    : o
                                ),
                              'Toggle Closed Custom Shape'
                            )
                          }
                          className="rounded"
                        />
                        <span>Close path into filled custom polygon</span>
                      </label>
                    )}

                    {/* 1. INDEPENDENT FILL CONTROLS (Section 8) */}
                    <div className="p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-theme-primary">Fill Color</span>
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-theme-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(primarySelectedObj.transparentFill)}
                            onChange={(e) =>
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === primarySelectedObj.id
                                      ? { ...o, transparentFill: e.target.checked }
                                      : o
                                  ),
                                'Toggle Transparent Fill'
                              )
                            }
                            className="rounded"
                          />
                          <span>No Fill (Transparent)</span>
                        </label>
                      </div>

                      {!primarySelectedObj.transparentFill && (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1">
                              {QUICK_COLOR_SWATCHES.map((hex) => (
                                <button
                                  key={hex}
                                  type="button"
                                  onClick={() =>
                                    updateObjectsWithHistory(
                                      (prev) =>
                                        prev.map((o) =>
                                          o.id === primarySelectedObj.id
                                            ? { ...o, fillColor: hex, transparentFill: false }
                                            : o
                                        ),
                                      `Set Fill ${hex}`
                                    )
                                  }
                                  style={{ backgroundColor: hex }}
                                  className={`w-4 h-4 rounded-xs border ${
                                    primarySelectedObj.fillColor === hex
                                      ? 'ring-2 ring-emerald-500 border-white'
                                      : 'border-black/25'
                                  } cursor-pointer`}
                                  title={`Fill ${hex}`}
                                />
                              ))}
                            </div>
                            <input
                              type="color"
                              value={primarySelectedObj.fillColor || '#FFFFFF'}
                              onChange={(e) =>
                                updateObjectsWithHistory(
                                  (prev) =>
                                    prev.map((o) =>
                                      o.id === primarySelectedObj.id
                                        ? { ...o, fillColor: e.target.value, transparentFill: false }
                                        : o
                                    ),
                                  'Change Fill Color'
                                )
                              }
                              className="w-6 h-6 rounded cursor-pointer border border-theme-subtle bg-transparent shrink-0"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[10px] text-theme-muted mb-0.5">
                              <span>Fill Opacity</span>
                              <span className="font-mono">
                                {Math.round((primarySelectedObj.fillOpacity ?? 1) * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={Math.round((primarySelectedObj.fillOpacity ?? 1) * 100)}
                              onChange={(e) =>
                                updateObjectsWithHistory(
                                  (prev) =>
                                    prev.map((o) =>
                                      o.id === primarySelectedObj.id
                                        ? { ...o, fillOpacity: Number(e.target.value) / 100 }
                                        : o
                                    ),
                                  'Change Fill Opacity'
                                )
                              }
                              className="w-full accent-emerald-600 cursor-pointer"
                            />
                          </div>

                          {/* Optional Gradient Fill */}
                          <div className="flex items-center justify-between pt-1 border-t border-theme-subtle">
                            <label className="inline-flex items-center gap-1.5 text-[11px] text-theme-secondary cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(primarySelectedObj.gradientFill?.enabled)}
                                onChange={(e) =>
                                  updateObjectsWithHistory(
                                    (prev) =>
                                      prev.map((o) =>
                                        o.id === primarySelectedObj.id
                                          ? {
                                              ...o,
                                              gradientFill: {
                                                enabled: e.target.checked,
                                                toColor: o.gradientFill?.toColor || '#3B82F6',
                                                angle: 135
                                              }
                                            }
                                          : o
                                      ),
                                    'Toggle Gradient Fill'
                                  )
                                }
                                className="rounded"
                              />
                              <span>Linear Gradient</span>
                            </label>
                            {primarySelectedObj.gradientFill?.enabled && (
                              <input
                                type="color"
                                value={primarySelectedObj.gradientFill.toColor || '#3B82F6'}
                                onChange={(e) =>
                                  updateObjectsWithHistory(
                                    (prev) =>
                                      prev.map((o) =>
                                        o.id === primarySelectedObj.id
                                          ? {
                                              ...o,
                                              gradientFill: {
                                                enabled: true,
                                                toColor: e.target.value,
                                                angle: 135
                                              }
                                            }
                                          : o
                                      ),
                                    'Change Gradient End Color'
                                  )
                                }
                                className="w-5 h-5 rounded cursor-pointer border border-theme-subtle bg-transparent"
                              />
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* 2. INDEPENDENT BORDER / STROKE CONTROLS (Section 8) */}
                    <div className="p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-theme-primary">Border / Stroke</span>
                        <input
                          type="color"
                          value={primarySelectedObj.strokeColor || '#7C3AED'}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, strokeColor: e.target.value }
                                    : o
                                ),
                              'Change Border Color'
                            )
                          }
                          className="w-6 h-6 rounded cursor-pointer border border-theme-subtle bg-transparent"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-theme-muted mb-0.5">
                            Border Width (pt)
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={24}
                            step={0.5}
                            value={primarySelectedObj.strokeWidth ?? 2}
                            onChange={(e) =>
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === primarySelectedObj.id
                                      ? { ...o, strokeWidth: Math.max(0, Number(e.target.value)) }
                                      : o
                                  ),
                                'Change Border Width'
                              )
                            }
                            className="w-full px-2 py-1 rounded bg-theme-surface border border-theme-subtle font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-theme-muted mb-0.5">
                            Border Style
                          </label>
                          <select
                            value={primarySelectedObj.strokeStyle || 'solid'}
                            onChange={(e) =>
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === primarySelectedObj.id
                                      ? { ...o, strokeStyle: e.target.value as StrokeStyleKind }
                                      : o
                                  ),
                                'Change Border Style'
                              )
                            }
                            className="w-full px-2 py-1 rounded bg-theme-surface border border-theme-subtle text-theme-primary"
                          >
                            <option value="solid">Solid</option>
                            <option value="dashed">Dashed</option>
                            <option value="dotted">Dotted</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between text-[10px] text-theme-muted">
                            <span>Border Opacity</span>
                            <span className="font-mono">
                              {Math.round((primarySelectedObj.strokeOpacity ?? 1) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round((primarySelectedObj.strokeOpacity ?? 1) * 100)}
                            onChange={(e) =>
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === primarySelectedObj.id
                                      ? { ...o, strokeOpacity: Number(e.target.value) / 100 }
                                      : o
                                  ),
                                'Change Border Opacity'
                              )
                            }
                            className="w-full accent-emerald-600 cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] text-theme-muted">
                            <span>Corner Radius</span>
                            <span className="font-mono">
                              {primarySelectedObj.cornerRadius || 0}pt
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={48}
                            value={primarySelectedObj.cornerRadius || 0}
                            onChange={(e) =>
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === primarySelectedObj.id
                                      ? {
                                          ...o,
                                          cornerRadius: Number(e.target.value),
                                          shapeKind:
                                            Number(e.target.value) > 0 && o.shapeKind === 'rectangle'
                                              ? 'rounded-rectangle'
                                              : o.shapeKind
                                        }
                                      : o
                                  ),
                                'Change Corner Radius'
                              )
                            }
                            className="w-full accent-emerald-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ========================================================= */}
                {/* BACKGROUND BLUR, OBJECT BLUR & DROP SHADOW (SECTION 9)    */}
                {/* ========================================================= */}
                <div className="p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle space-y-2.5">
                  <div className="font-semibold text-theme-primary flex items-center justify-between">
                    <span>Blur &amp; Visual Effects</span>
                    <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
                  </div>

                  {/* Background Blur (Blurs underlying PDF content inside shape boundary!) */}
                  {(primarySelectedObj.type === 'shape' ||
                    primarySelectedObj.type === 'annotation' ||
                    primarySelectedObj.type === 'native-shape') && (
                    <div>
                      <div className="flex justify-between text-[10px] text-theme-secondary mb-0.5">
                        <span>Background Blur (Underlying PDF)</span>
                        <span className="font-mono text-theme-accent font-bold">
                          {primarySelectedObj.backdropBlur || 0}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={24}
                        step={1}
                        value={primarySelectedObj.backdropBlur || 0}
                        onChange={(e) => {
                          const blurVal = Number(e.target.value);
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? {
                                      ...o,
                                      backdropBlur: blurVal,
                                      // Lower fill opacity slightly if 100% solid so the background blur is immediately visible
                                      fillOpacity:
                                        blurVal > 0 && (o.fillOpacity ?? 1) > 0.65
                                          ? 0.28
                                          : o.fillOpacity
                                    }
                                  : o
                              ),
                            `Set Background Blur ${blurVal}px`
                          );
                        }}
                        className="w-full accent-emerald-600 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Object Blur (Blurs the object itself) */}
                  <div>
                    <div className="flex justify-between text-[10px] text-theme-secondary mb-0.5">
                      <span>Object Blur (Self)</span>
                      <span className="font-mono">{primarySelectedObj.objectBlur || 0}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={16}
                      step={0.5}
                      value={primarySelectedObj.objectBlur || 0}
                      onChange={(e) =>
                        updateObjectsWithHistory(
                          (prev) =>
                            prev.map((o) =>
                              o.id === primarySelectedObj.id
                                ? { ...o, objectBlur: Number(e.target.value) }
                                : o
                            ),
                          'Set Object Blur'
                        )
                      }
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                  </div>

                  {/* Drop Shadow */}
                  <div className="pt-1 border-t border-theme-subtle flex items-center justify-between">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-theme-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(primarySelectedObj.shadow?.enabled)}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? {
                                      ...o,
                                      shadow: {
                                        enabled: e.target.checked,
                                        color: o.shadow?.color || 'rgba(0,0,0,0.35)',
                                        blur: o.shadow?.blur ?? 10,
                                        offsetX: o.shadow?.offsetX ?? 0,
                                        offsetY: o.shadow?.offsetY ?? 4
                                      }
                                    }
                                  : o
                              ),
                            'Toggle Drop Shadow'
                          )
                        }
                        className="rounded"
                      />
                      <span>Drop Shadow</span>
                    </label>
                    {primarySelectedObj.shadow?.enabled && (
                      <input
                        type="range"
                        min={2}
                        max={24}
                        value={primarySelectedObj.shadow.blur || 10}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? {
                                      ...o,
                                      shadow: {
                                        ...(o.shadow || {
                                          enabled: true,
                                          color: 'rgba(0,0,0,0.35)',
                                          offsetX: 0,
                                          offsetY: 4
                                        }),
                                        blur: Number(e.target.value)
                                      }
                                    }
                                  : o
                              ),
                            'Change Shadow Blur'
                          )
                        }
                        className="w-24 accent-emerald-600 cursor-pointer"
                      />
                    )}
                  </div>
                </div>

                {/* ========================================================= */}
                {/* IMAGE REPLACEMENT & CROPPING CONTROLS (SECTION 11)        */}
                {/* ========================================================= */}
                {primarySelectedObj.type === 'added-image' && (
                  <div className="p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-theme-primary">Image Controls</span>
                      <button
                        type="button"
                        onClick={() => replaceImageInputRef.current?.click()}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-theme-surface border border-theme-subtle text-[11px] font-semibold text-theme-accent hover:border-theme-accent cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Replace Image
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                        <div key={edge}>
                          <div className="flex justify-between text-theme-muted capitalize">
                            <span>Crop {edge}</span>
                            <span className="font-mono">
                              {primarySelectedObj.crop?.[edge] || 0}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={45}
                            value={primarySelectedObj.crop?.[edge] || 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateObjectsWithHistory(
                                (prev) =>
                                  prev.map((o) =>
                                    o.id === primarySelectedObj.id
                                      ? {
                                          ...o,
                                          crop: {
                                            top: o.crop?.top || 0,
                                            right: o.crop?.right || 0,
                                            bottom: o.crop?.bottom || 0,
                                            left: o.crop?.left || 0,
                                            [edge]: val
                                          }
                                        }
                                      : o
                                  ),
                                `Crop Image ${edge}`
                              );
                            }}
                            className="w-full accent-emerald-600 cursor-pointer"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Redaction Exemption Code */}
                {primarySelectedObj.type === 'redaction' && (
                  <div className="space-y-2 pt-2 border-t border-theme-subtle">
                    <label className="block font-bold text-rose-400">
                      Permanent Redaction Label / Exemption Code
                    </label>
                    <input
                      type="text"
                      value={primarySelectedObj.redactionCode || ''}
                      onChange={(e) =>
                        updateObjectsWithHistory(
                          (prev) =>
                            prev.map((o) =>
                              o.id === primarySelectedObj.id
                                ? { ...o, redactionCode: e.target.value }
                                : o
                            ),
                          'Update Redaction Code'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                    />
                    <p className="text-[11px] text-theme-secondary">
                      On export, all underlying native text operators intersecting this box are permanently purged from the PDF content stream.
                    </p>
                  </div>
                )}

                {/* Geometry: Position, Dimensions, Aspect Ratio Lock, Rotation, Opacity */}
                <div className="space-y-2.5 pt-2 border-t border-theme-subtle">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-theme-primary">
                      Geometry &amp; Transform (pt)
                    </span>
                    <label className="inline-flex items-center gap-1 text-[11px] text-theme-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(primarySelectedObj.lockAspectRatio)}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, lockAspectRatio: e.target.checked }
                                  : o
                              ),
                            'Toggle Aspect Ratio Lock'
                          )
                        }
                        className="rounded"
                      />
                      <span>Lock Ratio</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
                    <div>
                      <label className="block text-[10px] text-theme-muted">X Position</label>
                      <input
                        type="number"
                        value={Math.round(primarySelectedObj.x)}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, x: Number(e.target.value) || 0 }
                                  : o
                              ),
                            'Change X Coordinate'
                          )
                        }
                        className="w-full px-2 py-1 rounded bg-theme-elevated border border-theme-subtle"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-theme-muted">Y Position</label>
                      <input
                        type="number"
                        value={Math.round(primarySelectedObj.y)}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, y: Number(e.target.value) || 0 }
                                  : o
                              ),
                            'Change Y Coordinate'
                          )
                        }
                        className="w-full px-2 py-1 rounded bg-theme-elevated border border-theme-subtle"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-theme-muted">Width</label>
                      <input
                        type="number"
                        min={10}
                        value={Math.round(primarySelectedObj.width)}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, width: Math.max(10, Number(e.target.value) || 20) }
                                  : o
                              ),
                            'Change Width'
                          )
                        }
                        className="w-full px-2 py-1 rounded bg-theme-elevated border border-theme-subtle"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-theme-muted">Height</label>
                      <input
                        type="number"
                        min={10}
                        value={Math.round(primarySelectedObj.height)}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, height: Math.max(10, Number(e.target.value) || 20) }
                                  : o
                              ),
                            'Change Height'
                          )
                        }
                        className="w-full px-2 py-1 rounded bg-theme-elevated border border-theme-subtle"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-theme-muted">Rotation (°)</label>
                      <input
                        type="number"
                        value={primarySelectedObj.rotation || 0}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? { ...o, rotation: Number(e.target.value) || 0 }
                                  : o
                              ),
                            'Change Rotation'
                          )
                        }
                        className="w-full px-2 py-1 rounded bg-theme-elevated border border-theme-subtle"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-theme-muted">Master Opacity (%)</label>
                      <input
                        type="number"
                        min={5}
                        max={100}
                        value={Math.round((primarySelectedObj.opacity ?? 1) * 100)}
                        onChange={(e) =>
                          updateObjectsWithHistory(
                            (prev) =>
                              prev.map((o) =>
                                o.id === primarySelectedObj.id
                                  ? {
                                      ...o,
                                      opacity: Math.max(
                                        0.05,
                                        Math.min(1, Number(e.target.value) / 100)
                                      )
                                    }
                                  : o
                              ),
                            'Change Opacity'
                          )
                        }
                        className="w-full px-2 py-1 rounded bg-theme-elevated border border-theme-subtle"
                      />
                    </div>
                  </div>
                </div>

                {/* Layer Stacking Order Controls */}
                <div className="space-y-2 pt-2 border-t border-theme-subtle">
                  <div className="font-bold text-theme-primary">Layer Stacking Order</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => changeStackOrder(primarySelectedObj.id, 'front')}
                      className="py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle hover:border-theme-accent cursor-pointer"
                    >
                      Bring to Front
                    </button>
                    <button
                      type="button"
                      onClick={() => changeStackOrder(primarySelectedObj.id, 'back')}
                      className="py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle hover:border-theme-accent cursor-pointer"
                    >
                      Send to Back
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateObjects([primarySelectedObj.id])}
                      className="py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle hover:border-theme-accent cursor-pointer"
                    >
                      Duplicate (Ctrl+D)
                    </button>
                    <button
                      type="button"
                      onClick={() => convertObjectToRedaction(primarySelectedObj.id)}
                      className="py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle text-amber-400 hover:border-amber-400 cursor-pointer"
                    >
                      Permanent Redact
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ========================================================= */}
      {/* SIGNATURE CREATION MODAL                                  */}
      {/* ========================================================= */}
      {sigModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create and Apply PDF Signature"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSigModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-theme-elevated border border-theme-strong rounded-xl shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-theme-primary">
                Sign Document · Visual &amp; Cryptographic Attestation
              </h3>
              <button
                type="button"
                onClick={() => setSigModalOpen(false)}
                className="p-1 text-theme-muted hover:text-theme-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2 p-1 bg-theme-surface rounded-lg border border-theme-subtle text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSigTab('draw')}
                className={`flex-1 py-1.5 rounded cursor-pointer ${
                  sigTab === 'draw' ? 'bg-theme-accent text-white' : 'text-theme-secondary'
                }`}
              >
                Draw Signature
              </button>
              <button
                type="button"
                onClick={() => setSigTab('type')}
                className={`flex-1 py-1.5 rounded cursor-pointer ${
                  sigTab === 'type' ? 'bg-theme-accent text-white' : 'text-theme-secondary'
                }`}
              >
                Type Signature
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-theme-secondary mb-1">
                Signer Full Name
              </label>
              <input
                type="text"
                value={sigTypedText}
                onChange={(e) => setSigTypedText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-sm text-theme-primary"
              />
            </div>

            {sigTab === 'draw' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-theme-secondary">
                  <span>Draw signature below:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const c = sigCanvasRef.current;
                      if (c) {
                        const ctx = c.getContext('2d');
                        ctx?.clearRect(0, 0, c.width, c.height);
                      }
                    }}
                    className="text-theme-accent hover:underline cursor-pointer"
                  >
                    Clear Pad
                  </button>
                </div>
                <canvas
                  ref={sigCanvasRef}
                  width={440}
                  height={130}
                  onMouseDown={(e) => {
                    setIsDrawingSig(true);
                    const c = sigCanvasRef.current;
                    if (!c) return;
                    const r = c.getBoundingClientRect();
                    const ctx = c.getContext('2d')!;
                    ctx.strokeStyle = '#1E1B4B';
                    ctx.lineWidth = 2.5;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
                  }}
                  onMouseMove={(e) => {
                    if (!isDrawingSig) return;
                    const c = sigCanvasRef.current;
                    if (!c) return;
                    const r = c.getBoundingClientRect();
                    const ctx = c.getContext('2d')!;
                    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
                    ctx.stroke();
                  }}
                  onMouseUp={() => setIsDrawingSig(false)}
                  className="w-full h-32 bg-white rounded-lg border border-theme-subtle cursor-crosshair"
                />
              </div>
            ) : (
              <div className="p-6 rounded-lg bg-white border border-theme-subtle text-center">
                <span className="text-3xl font-serif italic font-bold text-indigo-950">
                  {sigTypedText || 'Authorized Signer'}
                </span>
              </div>
            )}

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-theme-surface border border-theme-subtle text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={sigIsCrypto}
                onChange={(e) => setSigIsCrypto(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <div>
                <div className="font-semibold text-theme-primary">
                  Attach SHA-256 Cryptographic Digest Stamp
                </div>
                <p className="text-theme-secondary mt-0.5">
                  Distinguishes visual signatures from verifiable cryptographic content hashes by embedding a tamper-evident SHA-256 digest stamp.
                </p>
              </div>
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSigModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-theme-subtle text-theme-secondary cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertSignature}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-theme-accent text-white cursor-pointer"
              >
                Place Signature on Page {currentPageIdx + 1}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EXPORT & STREAM VERIFICATION MODAL                        */}
      {/* ========================================================= */}
      {verificationReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Exported PDF Integrity Verification"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setVerificationReport(null)}
        >
          <div
            className="w-full max-w-lg bg-theme-elevated border border-theme-strong rounded-xl shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-theme-primary">
                  PDF Export &amp; Stream Verification Complete
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setVerificationReport(null)}
                className="p-1 text-theme-muted hover:text-theme-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-lg bg-theme-surface border border-theme-subtle space-y-2 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-theme-secondary">ISO 32000 %PDF Header:</span>
                <span className="text-emerald-400 font-bold">
                  {verificationReport.report.validPdfHeader ? 'VERIFIED' : 'INVALID'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Exported Page Count:</span>
                <span>{verificationReport.report.exportedPageCount} Pages</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Objects Permanently Deleted:</span>
                <span>{verificationReport.report.removedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Hidden Objects Omitted:</span>
                <span>{verificationReport.report.hiddenAppliedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Permanent Redaction Zones:</span>
                <span>{verificationReport.report.redactionCount}</span>
              </div>
              {(verificationReport.report.ocrRegionsExportedCount ?? 0) > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-theme-secondary">Scanned Export Mode:</span>
                    <span className="text-theme-accent font-bold uppercase">
                      {verificationReport.report.scannedExportModeUsed}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-secondary">OCR Recognized Regions:</span>
                    <span>{verificationReport.report.ocrRegionsExportedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-theme-secondary">Background Reconstructions:</span>
                    <span className="text-cyan-300 font-bold">
                      {verificationReport.report.scannedBgPatchesCount || 0} Patches
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-theme-secondary">Purged Text Stream Verification:</span>
                <span className="text-emerald-400 font-bold">
                  {verificationReport.report.purgedStringsVerifiedAbsent
                    ? 'PASSED (0 Residual Tokens)'
                    : 'PARTIAL'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-secondary">Output File Size:</span>
                <span>{(verificationReport.bytes.byteLength / 1024).toFixed(1)} KB</span>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setVerificationReport(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold border border-theme-subtle text-theme-secondary cursor-pointer"
              >
                Continue Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  const outName = docName.endsWith('.pdf')
                    ? docName.replace(/\.pdf$/i, '_edited.pdf')
                    : `${docName}_edited.pdf`;
                  triggerDownloadBytes(verificationReport.bytes, outName);
                }}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-theme-accent text-white hover:opacity-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download Verified PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FULL-CANVAS SPRING PAGE SORTER OVERLAY (MOTION + FLIP)    */}
      {/* ========================================================= */}
      <AnimatePresence>
        {pageSorterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            role="dialog"
            aria-modal="true"
            aria-label="Spring Page Sorter Studio"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/75 backdrop-blur-xs"
            onClick={() => setPageSorterOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl bg-theme-surface border border-theme-strong shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-theme-subtle flex flex-wrap items-center justify-between gap-4 bg-theme-elevated">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-theme-accent" />
                    <h3 className="text-base font-bold text-theme-primary">
                      Spring-Physics Page Sorter ({activePages.length} Pages)
                    </h3>
                  </div>
                  <p className="text-xs text-theme-secondary">
                    Drag any page card to reorder visually with Motion springs &amp; GSAP Flip, or rotate, duplicate, and extract pages.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {activePages.length > 1 && (
                    <button
                      type="button"
                      onClick={handleReversePagesOrder}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                    >
                      Reverse All Pages
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddBlankPage}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-theme-accent" />
                    Add Blank Page
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageSorterOpen(false)}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold bg-theme-accent text-white cursor-pointer"
                  >
                    Done Sorting
                  </button>
                </div>
              </div>

              {/* Multi-Column Spring Page Grid */}
              <div
                ref={sorterGridRef}
                className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
              >
                {activePages.map((p, idx) => {
                  const isCurrent = idx === currentPageIdx;
                  const isBeingDragged = draggedPageIdx === idx;
                  const isDropTarget =
                    dragOverPageIdx === idx &&
                    draggedPageIdx !== null &&
                    draggedPageIdx !== idx;

                  return (
                    <motion.div
                      layout
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      key={`sorter-page-${p.pageIndex}`}
                      data-flip-id={`sorter-page-${p.pageIndex}`}
                      draggable={activePages.length > 1}
                      onDragStart={(e: any) => {
                        setDraggedPageIdx(idx);
                        if (e.dataTransfer) {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(idx));
                        }
                      }}
                      onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverPageIdx !== idx) {
                          setDragOverPageIdx(idx);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverPageIdx === idx) {
                          setDragOverPageIdx(null);
                        }
                      }}
                      onDrop={(e: React.DragEvent<HTMLDivElement>) => {
                        e.preventDefault();
                        const fromIdx =
                          draggedPageIdx !== null
                            ? draggedPageIdx
                            : Number(e.dataTransfer.getData('text/plain'));
                        setDraggedPageIdx(null);
                        setDragOverPageIdx(null);
                        if (!Number.isNaN(fromIdx)) {
                          handleReorderPages(fromIdx, idx);
                        }
                      }}
                      onDragEnd={() => {
                        setDraggedPageIdx(null);
                        setDragOverPageIdx(null);
                      }}
                      onClick={() => {
                        setCurrentPageIdx(idx);
                        setPageSorterOpen(false);
                      }}
                      className={`sorter-page-flip-item p-3 rounded-xl border flex flex-col justify-between gap-2.5 cursor-grab active:cursor-grabbing ${
                        isBeingDragged
                          ? 'opacity-40 scale-95 border-dashed border-theme-accent'
                          : isDropTarget
                          ? 'border-emerald-400 ring-2 ring-emerald-500/50 bg-emerald-500/15 scale-[1.03]'
                          : isCurrent
                          ? 'border-theme-accent bg-theme-elevated'
                          : 'border-theme-subtle bg-theme-canvas/60 hover:border-theme-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <GripVertical className="w-3.5 h-3.5 text-theme-muted" />
                          <span className="text-xs font-bold font-mono text-theme-primary tabular-nums">
                            Page {String(idx + 1).padStart(2, '0')}
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleReorderPages(idx, idx - 1)}
                            title="Move Earlier"
                            className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary disabled:opacity-25 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activePages.length - 1}
                            onClick={() => handleReorderPages(idx, idx + 1)}
                            title="Move Later"
                            className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary disabled:opacity-25 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRotatePage(p)}
                            title="Rotate 90°"
                            className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={activePages.length <= 1}
                            onClick={() => handleDeletePage(p)}
                            title="Delete Page"
                            className="p-1 rounded hover:bg-rose-500/20 text-theme-secondary hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="aspect-[3/4] rounded-lg bg-white border border-theme-subtle flex items-center justify-center overflow-hidden pointer-events-none">
                        {p.thumbnailUrl ? (
                          <img
                            src={p.thumbnailUrl}
                            alt={`Page ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            draggable={false}
                            style={{ transform: `rotate(${p.rotation}deg)` }}
                            className="max-h-full max-w-full object-contain transition-transform"
                          />
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">
                            {Math.round(p.width)} × {Math.round(p.height)} pt
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-theme-muted font-mono">
                        <span>{p.rotation}° rot</span>
                        <span className="text-theme-accent font-sans font-semibold">
                          Click to Edit
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
