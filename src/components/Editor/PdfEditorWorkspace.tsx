import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import {
  PdfEditableObject,
  PdfPageDescriptor,
  PdfShapeKind,
  StrokeStyleKind,
  EditorHistorySnapshot,
  UploadedFileItem,
  OcrLanguageCode,
  OcrPreprocessMode,
  BgReconstructionMethod,
  ScannedExportMode
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
  createSampleScannedBilingualPdf,
  isRtlText
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
  X
} from 'lucide-react';

gsap.registerPlugin(Flip);

export type EditorToolMode =
  | 'select'
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

export const PdfEditorWorkspace: React.FC<PdfEditorWorkspaceProps> = ({
  initialFile,
  initialMode = 'select',
  initialSidebarTab = 'objects',
  onBack,
  onRecordHistory
}) => {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [docName, setDocName] = useState<string>(
    initialFile?.name || 'Vellum_Architecture_Spec_2026.pdf'
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

  // Scanned PDF & OCR Engine State (Sections 2–19)
  const [showScannedDetectionPrompt, setShowScannedDetectionPrompt] = useState<boolean>(false);
  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguageCode>('eng+urd');
  const [ocrPreprocessMode, setOcrPreprocessMode] = useState<OcrPreprocessMode>('auto-enhance');
  const [scannedExportMode, setScannedExportMode] = useState<ScannedExportMode>('visually-edited');
  const [ocrRunning, setOcrRunning] = useState<boolean>(false);
  const [ocrProgressText, setOcrProgressText] = useState<string>('');
  const [ocrProgressPct, setOcrProgressPct] = useState<number>(0);
  const [showOcrBoundaries, setShowOcrBoundaries] = useState<boolean>(true);
  const [compareOriginalScan, setCompareOriginalScan] = useState<boolean>(false);
  const [isBilingualSampleLoaded, setIsBilingualSampleLoaded] = useState<boolean>(false);
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

  // Unified Direct Manipulation State: Move, 8-Handle Resize, Rotate, Draw Shape, or Freehand
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'resize' | 'rotate' | 'freehand' | 'draw-shape';
    resizeDir?: ResizeHandleDir;
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
  } | null>(null);

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

      const isSynthSample =
        parsed.metadata?.subject === 'SYNTHETIC_BILINGUAL_SCANNED_SAMPLE' ||
        name.toLowerCase().includes('bilingual') ||
        name.toLowerCase().includes('alshifa');
      setIsBilingualSampleLoaded(isSynthSample);

      const scannedCount = parsed.pages.filter((p) => p.pageClassification === 'scanned').length;
      const mixedCount = parsed.pages.filter((p) => p.pageClassification === 'mixed').length;
      if (scannedCount > 0 || mixedCount > 0) {
        setShowScannedDetectionPrompt(true);
        setSaveStatus(
          `Detected ${scannedCount} scanned page(s) & ${mixedCount} mixed page(s) — OCR ready`
        );
      } else {
        setShowScannedDetectionPrompt(false);
        setSaveStatus(`Ready — ${parsed.objects.length} native PDF objects indexed`);
      }
    } catch (err: any) {
      setSaveStatus(`Load error: ${err?.message || 'Invalid PDF'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Synthetic Scanned Bilingual Invoice (English + Urdu اردو) Sample
  const handleLoadScannedBilingualSample = useCallback(async () => {
    setLoading(true);
    setLoadingMsg('Generating Synthetic Scanned Bilingual Invoice (English + اردو)...');
    try {
      const sampleBytes = await createSampleScannedBilingualPdf();
      await loadDocumentBytes(sampleBytes, 'AlShifa_Scanned_Bilingual_Invoice_2025.pdf');
    } catch (err: any) {
      setSaveStatus(`Failed to load scanned sample: ${err?.message || 'Error'}`);
      setLoading(false);
    }
  }, [loadDocumentBytes]);

  // Execute OCR on Scanned / Selected Pages
  const handleRunOcr = useCallback(
    async (scope: 'current-page' | 'scanned-only' | 'all-scanned-and-mixed') => {
      if (!pdfBytes || ocrRunning) return;
      setShowScannedDetectionPrompt(false);
      setOcrRunning(true);
      ocrCancelRef.current = false;
      setOcrProgressPct(5);
      setOcrProgressText('Initializing OCR engine...');

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
            language: ocrLanguage,
            preprocessMode: ocrPreprocessMode,
            isBilingualSampleDoc: isBilingualSampleLoaded,
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
                  ocrLanguageUsed: ocrLanguage
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
            `OCR Recognized (${ocrLanguage.toUpperCase()})`
          );
          const totalOcr = accumulatedObjects.filter(
            (o) => o.type === 'ocr-text' && !o.deleted
          ).length;
          setSaveStatus(
            `OCR Complete — ${totalOcr} editable text regions recognized (${ocrLanguage.toUpperCase()})`
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
      ocrLanguage,
      ocrPreprocessMode,
      isBilingualSampleLoaded,
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
          const nextPad = maskPadding !== undefined ? maskPadding : o.bgMaskPadding ?? 2;
          const nextColor = customColor !== undefined ? customColor : o.fillColor || o.sampledBgColor;
          const cachedCanvas = getCachedPageCanvas(`${docName}:p${o.pageIndex}`);
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
        setToolMode('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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

  // Canvas MouseDown: Select, or Interactive Click-and-Drag Creation of Shapes/Text/Redactions
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setContextMenu(null);
    if (!currentPage) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.round((e.clientX - rect.left) / zoom);
    const clickY = Math.round((e.clientY - rect.top) / zoom);

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

  // Canvas MouseMove: Direct Move, 8-Handle Resize, Rotation, Shape Draw, & Smart Snap Guides
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState || !currentPage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const curX = Math.round((e.clientX - rect.left) / zoom);
    const curY = Math.round((e.clientY - rect.top) / zoom);
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

  const handleCanvasMouseUp = () => {
    setSnapGuides({ vertical: [], horizontal: [] });
    if (!dragState || !currentPage) return;

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
  };

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

  const triggerDownloadBytes = (bytes: Uint8Array, filename: string) => {
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col bg-theme-canvas text-theme-primary select-none">
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
        {/* Left: Back, Document Title, Save Status */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-theme-secondary hover:text-theme-primary hover:bg-theme-muted border border-theme-subtle cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Exit Studio
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
            onClick={handleLoadScannedBilingualSample}
            title="Load a synthetic Scanned Bilingual Charge Slip / Invoice (English + اردو) to test OCR, RTL text editing, and Background Reconstruction"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/15 border border-violet-500/40 text-violet-300 hover:bg-violet-500/25 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span>Load Scanned Sample (EN + اردو)</span>
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
      {/* OCR & SCANNED DOCUMENT INTELLIGENCE BAR                   */}
      {/* ========================================================= */}
      <div className="border-b border-theme-subtle bg-theme-surface/90 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Page Classification Badge (Section 3) */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono font-bold text-[11px] border ${
              currentPage?.pageClassification === 'scanned'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : currentPage?.pageClassification === 'mixed'
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
            }`}
          >
            {currentPage?.pageClassification === 'scanned'
              ? 'SCANNED PAGE (IMAGE-BASED)'
              : currentPage?.pageClassification === 'mixed'
              ? 'MIXED PAGE (SCAN + NATIVE)'
              : 'NATIVE PDF PAGE'}
          </span>

          {currentPage?.ocrProcessed && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 text-violet-300 text-[11px] font-mono">
              OCR: {currentPage.ocrRegionCount || 0} regions · Avg {currentPage.ocrAvgConfidence || 94}% conf
            </span>
          )}

          {/* Language Selector (English, Urdu, Bilingual) */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-theme-muted">OCR Lang:</span>
            <select
              value={ocrLanguage}
              onChange={(e) => setOcrLanguage(e.target.value as OcrLanguageCode)}
              disabled={ocrRunning}
              className="px-2 py-0.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary text-[11px] font-semibold cursor-pointer"
            >
              <option value="eng+urd">Bilingual: English + Urdu (اردو)</option>
              <option value="eng">English Only (LTR)</option>
              <option value="urd">Urdu Only — اردو (RTL)</option>
            </select>
          </div>

          {/* Image Preprocessing Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-theme-muted">Preprocess:</span>
            <select
              value={ocrPreprocessMode}
              onChange={(e) => setOcrPreprocessMode(e.target.value as OcrPreprocessMode)}
              disabled={ocrRunning}
              className="px-2 py-0.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary text-[11px] cursor-pointer"
            >
              <option value="auto-enhance">Auto Enhance (Contrast + Sharpen)</option>
              <option value="grayscale-contrast">Grayscale Normalization</option>
              <option value="adaptive-threshold">Adaptive Binarization (Threshold)</option>
              <option value="denoise">Speckle Denoise (3×3 Median)</option>
              <option value="none">Raw Scan Bitmap</option>
            </select>
          </div>
        </div>

        {/* Right: Run OCR / Progress / Compare Original Scan */}
        <div className="flex flex-wrap items-center gap-2">
          {ocrRunning ? (
            <div className="flex items-center gap-2.5 bg-violet-950/60 border border-violet-500/40 px-3 py-1 rounded-lg">
              <div className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] font-mono text-violet-200">
                {ocrProgressText} ({ocrProgressPct}%)
              </span>
              <button
                type="button"
                onClick={() => {
                  ocrCancelRef.current = true;
                }}
                className="px-2 py-0.5 rounded bg-rose-500/25 border border-rose-500/40 text-rose-200 text-[10px] font-bold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleRunOcr('current-page')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-theme-accent text-white hover:opacity-95 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>
                  {currentPage?.ocrProcessed
                    ? `Re-run OCR on Page ${currentPageIdx + 1}`
                    : `Recognize Text (OCR Page ${currentPageIdx + 1})`}
                </span>
              </button>

              {pages.filter((p) => !p.deleted).length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRunOcr('scanned-only')}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                >
                  OCR Scanned Pages Only
                </button>
              )}

              {pageObjects.some((o) => o.type === 'ocr-text') && (
                <>
                  <label className="inline-flex items-center gap-1 text-[11px] text-theme-secondary cursor-pointer px-2 py-0.5 rounded bg-theme-elevated border border-theme-subtle">
                    <input
                      type="checkbox"
                      checked={showOcrBoundaries}
                      onChange={(e) => setShowOcrBoundaries(e.target.checked)}
                      className="rounded"
                    />
                    <span>OCR Boxes</span>
                  </label>

                  <button
                    type="button"
                    onMouseDown={() => setCompareOriginalScan(true)}
                    onMouseUp={() => setCompareOriginalScan(false)}
                    onMouseLeave={() => setCompareOriginalScan(false)}
                    onClick={() => setCompareOriginalScan((v) => !v)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                      compareOriginalScan
                        ? 'bg-amber-500 text-black border-amber-400 font-bold'
                        : 'bg-theme-elevated border-theme-subtle text-theme-secondary hover:text-theme-primary'
                    }`}
                    title="Toggle or hold to compare the unedited original scanned image against your reconstructed edits"
                  >
                    {compareOriginalScan ? 'Viewing Original Scan' : 'Compare Original Scan'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* SECONDARY EDITING MODE & SHAPE CREATION RIBBON            */}
      {/* ========================================================= */}
      <div className="border-b border-theme-subtle bg-theme-elevated px-4 py-1.5 flex items-center gap-1 overflow-x-auto">
        {(
          [
            { id: 'select', label: 'Select & Transform', icon: MousePointer },
            { id: 'add-text', label: 'Add Text', icon: Type },
            { id: 'add-image', label: 'Insert Image', icon: ImageIcon },
            { id: 'cover-overlay', label: 'Cover / Blur Overlay', icon: Eraser },
            { id: 'rectangle', label: 'Rectangle', icon: Square },
            { id: 'rounded-rectangle', label: 'Rounded Rect', icon: Square },
            { id: 'circle', label: 'Circle / Ellipse', icon: Circle },
            { id: 'polygon', label: 'Polygon', icon: Hexagon },
            { id: 'line', label: 'Line', icon: Minus },
            { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
            { id: 'freehand', label: 'Custom Path / Ink', icon: PenTool },
            { id: 'highlight', label: 'Highlight', icon: Highlighter },
            { id: 'sticky-note', label: 'Sticky Note', icon: StickyNote },
            { id: 'form-field', label: 'Form Field', icon: FormInput },
            { id: 'signature', label: 'Sign PDF', icon: PenTool },
            { id: 'watermark', label: 'Watermark', icon: Stamp },
            { id: 'redact', label: 'Permanent Redact', icon: ShieldAlert }
          ] as Array<{ id: EditorToolMode; label: string; icon: any }>
        ).map((m) => {
          const Icon = m.icon;
          const active = toolMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                if (m.id === 'signature') {
                  setSigModalOpen(true);
                } else if (m.id === 'add-image') {
                  imageInsertInputRef.current?.click();
                } else {
                  setToolMode(m.id);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-theme-accent text-white shadow-2xs'
                  : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-muted'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* MAIN 3-COLUMN EDITOR WORKSPACE                            */}
      {/* ========================================================= */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* --------------------------------------------------------- */}
        {/* LEFT SIDEBAR: Pages, Object & Layer Manager, Outline, Forms */}
        {/* --------------------------------------------------------- */}
        {!leftSidebarCollapsed && (
          <aside className="lg:col-span-3 border-r border-theme-subtle bg-theme-surface flex flex-col min-h-[340px] lg:max-h-[calc(100vh-155px)]">
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
                        ? 'border-violet-500 text-theme-primary bg-theme-surface'
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
                                    ? `OCR Region (${obj.ocrConfidence ?? 92}%${
                                        obj.textDirection === 'rtl' ? ' · RTL اردو' : ''
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
                            ? 'border-violet-400 ring-2 ring-violet-500/40 bg-violet-500/10 scale-[1.02]'
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
          className={`${
            leftSidebarCollapsed && rightPanelCollapsed
              ? 'lg:col-span-12'
              : leftSidebarCollapsed || rightPanelCollapsed
              ? 'lg:col-span-9'
              : 'lg:col-span-6'
          } bg-theme-muted/60 overflow-auto flex flex-col items-center p-6 lg:max-h-[calc(100vh-155px)] relative`}
        >
          {/* Automatic Scanned Document Detection Offer Banner (Section 4) */}
          {showScannedDetectionPrompt && !ocrRunning && (
            <div className="w-full max-w-3xl mb-4 p-4 rounded-xl bg-theme-surface border-2 border-violet-500/60 shadow-xl space-y-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
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
                Run OCR to make printed English &amp; Urdu (اردو) text directly selectable, searchable, and editable with background reconstruction.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRunOcr('current-page')}
                  className="px-2.5 py-1 rounded bg-violet-600 font-semibold text-white whitespace-nowrap cursor-pointer"
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
            <div className="w-full max-w-2xl mb-3 px-3.5 py-2 rounded-lg bg-violet-600/20 border border-violet-500/40 flex items-center justify-between text-xs text-violet-200">
              <span>
                <strong>Creation Mode ({toolMode.replace('-', ' ')}):</strong> Click and drag anywhere on the PDF page below to draw, or press <kbd className="font-mono px-1 bg-black/30 rounded">Esc</kbd> to return to Select mode.
              </span>
              <button
                type="button"
                onClick={() => setToolMode('select')}
                className="px-2 py-0.5 rounded bg-violet-600 text-white font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {loading ? (
            <div className="my-auto text-center space-y-3 p-8">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-theme-primary">{loadingMsg}</p>
            </div>
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
              className={`relative bg-white shadow-2xl border border-black/15 transition-shadow shrink-0 my-auto ${
                toolMode !== 'select' ? 'cursor-crosshair' : 'cursor-default'
              }`}
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
                        const rect = pageCanvasRef.current?.getBoundingClientRect();
                        const startX = rect
                          ? Math.round((e.clientX - rect.left) / zoom)
                          : Math.round(e.clientX / zoom);
                        const startY = rect
                          ? Math.round((e.clientY - rect.top) / zoom)
                          : Math.round(e.clientY / zoom);

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
                        ? 'ring-2 ring-violet-600'
                        : isSearchMatch
                        ? 'ring-2 ring-amber-400 bg-amber-300/30'
                        : !obj.visible
                        ? 'border border-dashed border-amber-500/80 bg-amber-500/10'
                        : obj.type === 'ocr-text' && showOcrBoundaries
                        ? (obj.ocrConfidence ?? 95) < 75 && !obj.ocrConfidenceVerified
                          ? 'ring-1 ring-amber-500/85 bg-amber-500/5 hover:ring-2 hover:ring-amber-400'
                          : 'ring-1 ring-cyan-500/55 hover:ring-2 hover:ring-violet-500'
                        : 'hover:ring-1 hover:ring-violet-500/75'
                    } ${obj.locked ? 'cursor-not-allowed' : 'cursor-move'}`}
                  >
                    {/* OCR Confidence & RTL Badge on Hover or Selection */}
                    {obj.type === 'ocr-text' &&
                      (isSelected || ((obj.ocrConfidence ?? 95) < 75 && !obj.ocrConfidenceVerified)) &&
                      !isEditingInline && (
                        <div
                          className={`pointer-events-none absolute -top-4 right-0 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold whitespace-nowrap shadow-xs z-20 ${
                            (obj.ocrConfidence ?? 95) < 75 && !obj.ocrConfidenceVerified
                              ? 'bg-amber-500 text-black'
                              : 'bg-violet-600 text-white'
                          }`}
                        >
                          OCR {obj.ocrConfidence ?? 95}%
                          {obj.textDirection === 'rtl' ? ' · اردو RTL' : ''}
                          {obj.ocrEdited ? ' · Edited' : ''}
                        </div>
                      )}

                    {/* Inline Direct Text Editor on Double-Click */}
                    {isEditingInline ? (
                      <textarea
                        autoFocus
                        dir={obj.textDirection || (isRtlText(obj.text || '') ? 'rtl' : 'ltr')}
                        value={obj.text || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const rtl = isRtlText(val);
                          setObjects((prev) =>
                            prev.map((o) =>
                              o.id === obj.id
                                ? {
                                    ...o,
                                    text: val,
                                    ocrEdited: o.type === 'ocr-text' ? true : o.ocrEdited,
                                    textDirection: rtl ? 'rtl' : o.textDirection || 'ltr',
                                    textAlign: rtl ? 'right' : o.textAlign || 'left'
                                  }
                                : o
                            )
                          );
                        }}
                        onBlur={() => {
                          setEditingTextObjId(null);
                          pushSnapshot(pages, objects, 'Inline Edit Text');
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          fontSize: (obj.fontSize || 12) * zoom,
                          fontFamily:
                            obj.fontFamily === 'Courier'
                              ? 'monospace'
                              : obj.fontFamily === 'Times-Roman'
                              ? '"Noto Nastaliq Urdu", Georgia, serif'
                              : '"Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif',
                          fontWeight: obj.fontWeight || 'normal',
                          fontStyle: obj.fontStyle || 'normal',
                          color: obj.color || obj.sampledTextColor || '#18181B',
                          textAlign:
                            obj.textAlign || (obj.textDirection === 'rtl' ? 'right' : 'left'),
                          lineHeight: obj.lineHeight || 1.18,
                          letterSpacing: obj.letterSpacing ? `${obj.letterSpacing}px` : undefined
                        }}
                        className="w-full h-full bg-white/95 border border-violet-600 p-0.5 focus:outline-none resize-none"
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
                            dir={obj.textDirection || (isRtlText(obj.text || '') ? 'rtl' : 'ltr')}
                            style={{
                              fontSize: (obj.fontSize || 12) * zoom,
                              fontFamily:
                                obj.fontFamily === 'Courier'
                                  ? 'monospace'
                                  : obj.fontFamily === 'Times-Roman'
                                  ? '"Noto Nastaliq Urdu", Georgia, serif'
                                  : '"Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif',
                              fontWeight: obj.fontWeight || 'normal',
                              fontStyle: obj.fontStyle || 'normal',
                              textDecoration: obj.underline ? 'underline' : 'none',
                              color: obj.color || obj.sampledTextColor || '#18181B',
                              textAlign:
                                obj.textAlign || (obj.textDirection === 'rtl' ? 'right' : 'left'),
                              lineHeight: obj.lineHeight || 1.18,
                              letterSpacing: obj.letterSpacing ? `${obj.letterSpacing}px` : undefined
                            }}
                            className="w-full h-full whitespace-pre-wrap break-words pointer-events-none"
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
                          <div className="bg-violet-950/90 text-violet-100 text-[9px] font-mono px-1.5 py-0.5 truncate pointer-events-none">
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
                        className="w-full h-full bg-violet-50/90 border border-violet-500/60 flex items-center px-1.5"
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
                            className="w-4 h-4 accent-violet-600 cursor-pointer"
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
                        {/* Top Rotation Handle & Stem */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const rect = pageCanvasRef.current?.getBoundingClientRect();
                            const startX = rect
                              ? Math.round((e.clientX - rect.left) / zoom)
                              : Math.round(e.clientX / zoom);
                            const startY = rect
                              ? Math.round((e.clientY - rect.top) / zoom)
                              : Math.round(e.clientY / zoom);
                            setDragState({
                              mode: 'rotate',
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
                          className="absolute left-1/2 -top-7 -translate-x-1/2 w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing z-30"
                        >
                          <div className="w-px h-3 bg-violet-600 absolute -bottom-1.5 left-1/2 -translate-x-1/2 pointer-events-none" />
                          <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-violet-600 shadow-sm flex items-center justify-center">
                            <RotateCw className="w-2 h-2 text-violet-700" />
                          </div>
                        </div>

                        {/* 8 Forgiving Resize Handles (4 Corners: NW, NE, SE, SW + 4 Edges: N, E, S, W) */}
                        {(
                          [
                            { dir: 'nw', pos: '-left-2.5 -top-2.5', cursor: 'cursor-nwse-resize' },
                            { dir: 'n', pos: 'left-1/2 -translate-x-1/2 -top-2.5', cursor: 'cursor-ns-resize' },
                            { dir: 'ne', pos: '-right-2.5 -top-2.5', cursor: 'cursor-nesw-resize' },
                            { dir: 'e', pos: '-right-2.5 top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize' },
                            { dir: 'se', pos: '-right-2.5 -bottom-2.5', cursor: 'cursor-nwse-resize' },
                            { dir: 's', pos: 'left-1/2 -translate-x-1/2 -bottom-2.5', cursor: 'cursor-ns-resize' },
                            { dir: 'sw', pos: '-left-2.5 -bottom-2.5', cursor: 'cursor-nesw-resize' },
                            { dir: 'w', pos: '-left-2.5 top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize' }
                          ] as Array<{ dir: ResizeHandleDir; pos: string; cursor: string }>
                        ).map((h) => (
                          <div
                            key={h.dir}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              const rect = pageCanvasRef.current?.getBoundingClientRect();
                              const startX = rect
                                ? Math.round((e.clientX - rect.left) / zoom)
                                : Math.round(e.clientX / zoom);
                              const startY = rect
                                ? Math.round((e.clientY - rect.top) / zoom)
                                : Math.round(e.clientY / zoom);
                              setDragState({
                                mode: 'resize',
                                resizeDir: h.dir,
                                objId: obj.id,
                                startX,
                                startY,
                                origX: obj.x,
                                origY: obj.y,
                                origW: obj.width,
                                origH: obj.height
                              });
                            }}
                            title={`Resize (${h.dir.toUpperCase()}) — Hold Shift for proportional`}
                            className={`absolute ${h.pos} w-5 h-5 flex items-center justify-center ${h.cursor} z-30`}
                          >
                            <div className="w-2.5 h-2.5 bg-white border-2 border-violet-600 rounded-[2px] shadow-xs group-hover:scale-110 transition-transform" />
                          </div>
                        ))}
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
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
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
          <aside className="lg:col-span-3 border-l border-theme-subtle bg-theme-surface p-4 space-y-5 overflow-y-auto lg:max-h-[calc(100vh-155px)]">
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

                {/* Quick Shape & Overlay Creation Palette */}
                <div className="p-3.5 rounded-lg bg-theme-elevated border border-theme-subtle space-y-2.5 text-xs">
                  <div className="font-semibold text-theme-primary">
                    Create Shape or Content Overlay
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setToolMode('cover-overlay')}
                      className="py-2 px-2.5 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eraser className="w-3.5 h-3.5 text-theme-accent shrink-0" />
                      <span className="truncate">Cover Overlay</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('add-text')}
                      className="py-2 px-2.5 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center gap-1.5 cursor-pointer"
                    >
                      <Type className="w-3.5 h-3.5 text-theme-accent shrink-0" />
                      <span className="truncate">Add Text Box</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('rectangle')}
                      className="py-2 px-2.5 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center gap-1.5 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 text-theme-accent shrink-0" />
                      <span className="truncate">Rectangle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('rounded-rectangle')}
                      className="py-2 px-2.5 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center gap-1.5 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span className="truncate">Rounded Rect</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('circle')}
                      className="py-2 px-2.5 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center gap-1.5 cursor-pointer"
                    >
                      <Circle className="w-3.5 h-3.5 text-theme-accent shrink-0" />
                      <span className="truncate">Circle / Ellipse</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('polygon')}
                      className="py-2 px-2.5 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center gap-1.5 cursor-pointer"
                    >
                      <Hexagon className="w-3.5 h-3.5 text-theme-accent shrink-0" />
                      <span className="truncate">Polygon</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('arrow')}
                      className="py-2 px-2.5 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-theme-accent shrink-0" />
                      <span className="truncate">Line / Arrow</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolMode('freehand')}
                      className="py-2 px-2.5 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center gap-1.5 cursor-pointer"
                    >
                      <PenTool className="w-3.5 h-3.5 text-theme-accent shrink-0" />
                      <span className="truncate">Custom Path</span>
                    </button>
                  </div>
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
                  <div className="p-2.5 rounded-lg bg-theme-elevated border border-violet-500/40 space-y-2">
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
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
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

                    {/* RTL / LTR Direction Toggle (English vs Urdu اردو) */}
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-theme-secondary">Script Direction:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, textDirection: 'ltr', textAlign: 'left' }
                                    : o
                                ),
                              'Set LTR Text Direction'
                            )
                          }
                          className={`px-2 py-0.5 rounded border cursor-pointer ${
                            (primarySelectedObj.textDirection || 'ltr') === 'ltr'
                              ? 'bg-theme-accent text-white border-transparent font-bold'
                              : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                          }`}
                        >
                          LTR (English)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, textDirection: 'rtl', textAlign: 'right' }
                                    : o
                                ),
                              'Set RTL Urdu Text Direction'
                            )
                          }
                          className={`px-2 py-0.5 rounded border cursor-pointer ${
                            primarySelectedObj.textDirection === 'rtl'
                              ? 'bg-theme-accent text-white border-transparent font-bold'
                              : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                          }`}
                        >
                          RTL (اردو / Arabic)
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      dir={
                        primarySelectedObj.textDirection ||
                        (isRtlText(primarySelectedObj.text || '') ? 'rtl' : 'ltr')
                      }
                      value={primarySelectedObj.text || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const rtl = isRtlText(val);
                        setObjects((prev) =>
                          prev.map((o) =>
                            o.id === primarySelectedObj.id
                              ? {
                                  ...o,
                                  text: val,
                                  ocrEdited: o.type === 'ocr-text' ? true : o.ocrEdited,
                                  textDirection: rtl ? 'rtl' : o.textDirection || 'ltr'
                                }
                              : o
                          )
                        );
                      }}
                      onBlur={() => pushSnapshot(pages, objects, 'Modify Text Content')}
                      className="w-full p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary focus:outline-none focus:border-theme-accent"
                    />

                    {/* SCANNED BACKGROUND RECONSTRUCTION ENGINE CONTROLS (SECTION 10) */}
                    {primarySelectedObj.type === 'ocr-text' && (
                      <div className="p-2.5 rounded-lg bg-theme-elevated border border-cyan-500/30 space-y-2.5 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-cyan-300">
                            Scanned Background Reconstruction
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
                            <span>{primarySelectedObj.bgMaskPadding ?? 2} pt</span>
                          </div>
                          <input
                            type="range"
                            min={-2}
                            max={10}
                            step={1}
                            value={primarySelectedObj.bgMaskPadding ?? 2}
                            onChange={(e) =>
                              updateOcrBgReconstruction(
                                primarySelectedObj.id,
                                primarySelectedObj.bgReconstructionMethod || 'inpaint-texture',
                                undefined,
                                Number(e.target.value)
                              )
                            }
                            className="w-full accent-violet-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-theme-secondary mb-1">
                          Font Family
                        </label>
                        <select
                          value={primarySelectedObj.fontFamily || 'Helvetica'}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, fontFamily: e.target.value as any }
                                    : o
                                ),
                              'Change Font Family'
                            )
                          }
                          className="w-full px-2 py-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary"
                        >
                          <option value="Helvetica">Helvetica (Sans)</option>
                          <option value="Times-Roman">Times Roman (Serif)</option>
                          <option value="Courier">Courier (Mono)</option>
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
                          value={primarySelectedObj.fontSize || 12}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, fontSize: Number(e.target.value) || 12 }
                                    : o
                                ),
                              'Change Font Size'
                            )
                          }
                          className="w-full px-2 py-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    {/* Bold, Italic, Underline, Alignment, Color */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? {
                                        ...o,
                                        fontWeight: o.fontWeight === 'bold' ? 'normal' : 'bold'
                                      }
                                    : o
                                ),
                              'Toggle Bold'
                            )
                          }
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
                                    ? {
                                        ...o,
                                        fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic'
                                      }
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
                                    ? { ...o, underline: !o.underline }
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

                        {/* Text Alignment */}
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
                              onClick={() =>
                                updateObjectsWithHistory(
                                  (prev) =>
                                    prev.map((o) =>
                                      o.id === primarySelectedObj.id
                                        ? { ...o, textAlign: a.align }
                                        : o
                                    ),
                                  `Align Text ${a.align}`
                                )
                              }
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
                        <span className="text-[11px] text-theme-secondary">Color:</span>
                        <input
                          type="color"
                          value={primarySelectedObj.color || '#18181B'}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, color: e.target.value }
                                    : o
                                ),
                              'Change Text Color'
                            )
                          }
                          className="w-6 h-6 rounded cursor-pointer border border-theme-subtle bg-transparent"
                        />
                      </div>
                    </div>

                    {/* Line Spacing & Letter Spacing */}
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
                                    ? { ...o, lineHeight: Number(e.target.value) }
                                    : o
                                ),
                              'Change Line Height'
                            )
                          }
                          className="w-full accent-violet-600 cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-theme-muted">
                          Letter Spacing ({primarySelectedObj.letterSpacing || 0}px)
                        </label>
                        <input
                          type="range"
                          min={-1}
                          max={10}
                          step={0.5}
                          value={primarySelectedObj.letterSpacing || 0}
                          onChange={(e) =>
                            updateObjectsWithHistory(
                              (prev) =>
                                prev.map((o) =>
                                  o.id === primarySelectedObj.id
                                    ? { ...o, letterSpacing: Number(e.target.value) }
                                    : o
                                ),
                              'Change Letter Spacing'
                            )
                          }
                          className="w-full accent-violet-600 cursor-pointer"
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
                          className="w-32 accent-violet-600 cursor-pointer"
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
                                      ? 'ring-2 ring-violet-500 border-white'
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
                              className="w-full accent-violet-600 cursor-pointer"
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
                            className="w-full accent-violet-600 cursor-pointer"
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
                            className="w-full accent-violet-600 cursor-pointer"
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
                        className="w-full accent-violet-600 cursor-pointer"
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
                      className="w-full accent-violet-600 cursor-pointer"
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
                        className="w-24 accent-violet-600 cursor-pointer"
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
                            className="w-full accent-violet-600 cursor-pointer"
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
                Sign Document — Visual &amp; Cryptographic Attestation
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
                    <span className="text-violet-300 font-bold uppercase">
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
                          ? 'border-violet-400 ring-2 ring-violet-500/50 bg-violet-500/15 scale-[1.03]'
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
