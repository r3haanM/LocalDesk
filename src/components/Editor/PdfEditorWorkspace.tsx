import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import {
  PdfEditableObject,
  PdfPageDescriptor,
  EditorHistorySnapshot,
  UploadedFileItem
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
  X
} from 'lucide-react';

gsap.registerPlugin(Flip);

export type EditorToolMode =
  | 'select'
  | 'edit-text'
  | 'add-text'
  | 'add-image'
  | 'highlight'
  | 'freehand'
  | 'rectangle'
  | 'circle'
  | 'arrow'
  | 'sticky-note'
  | 'form-field'
  | 'signature'
  | 'watermark'
  | 'redact';

interface PdfEditorWorkspaceProps {
  initialFile: UploadedFileItem | null;
  initialMode?: EditorToolMode;
  initialSidebarTab?: 'pages' | 'objects' | 'outline' | 'annotations' | 'forms' | 'structure';
  onBack: () => void;
  onRecordHistory: (toolId: string, toolName: string, fileName: string, outName: string, outSize: number, summary: string) => void;
}

export const PdfEditorWorkspace: React.FC<PdfEditorWorkspaceProps> = ({
  initialFile,
  initialMode = 'select',
  initialSidebarTab = 'objects',
  onBack,
  onRecordHistory
}) => {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [docName, setDocName] = useState<string>(initialFile?.name || 'Vellum_Architecture_Spec_2026.pdf');
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
  const [sidebarTab, setSidebarTab] = useState<'pages' | 'objects' | 'outline' | 'annotations' | 'forms' | 'structure'>(
    initialSidebarTab
  );
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(false);

  // Selection & Multi-selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [objectFilter, setObjectFilter] = useState<'all' | 'native-text' | 'added' | 'shapes' | 'forms' | 'redaction' | 'hidden'>('all');
  const [showHiddenOutlines, setShowHiddenOutlines] = useState<boolean>(true);
  const [applyHiddenToExport, setApplyHiddenToExport] = useState<boolean>(true);
  const [flattenFormsOnExport, setFlattenFormsOnExport] = useState<boolean>(false);

  // Undo / Redo History
  const [history, setHistory] = useState<EditorHistorySnapshot[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [saveStatus, setSaveStatus] = useState<string>('All changes synced in working model');

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Rendered page background image
  const [pageBgUrl, setPageBgUrl] = useState<string>('');

  // Drag / Resize / Freehand state
  const [dragState, setDragState] = useState<{
    mode: 'move' | 'resize' | 'freehand' | 'draw-redact';
    objId?: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    points?: Array<{ x: number; y: number }>;
  } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; objId: string } | null>(null);

  // Drag-and-drop page reordering state & Full-Canvas Page Sorter state
  const [draggedPageIdx, setDraggedPageIdx] = useState<number | null>(null);
  const [dragOverPageIdx, setDragOverPageIdx] = useState<number | null>(null);
  const [pageSorterOpen, setPageSorterOpen] = useState<boolean>(false);
  const pageRailRef = useRef<HTMLDivElement | null>(null);
  const sorterGridRef = useRef<HTMLDivElement | null>(null);

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
    setLoadingMsg('Parsing PDF content streams, text runs, and AcroForm fields...');
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

      const initialSnap: EditorHistorySnapshot = {
        id: 'snap-init',
        label: 'Initial Document Load',
        timestamp: Date.now(),
        pages: JSON.parse(JSON.stringify(parsed.pages)),
        objects: JSON.parse(JSON.stringify(parsed.objects))
      };
      setHistory([initialSnap]);
      setHistoryIdx(0);
      setSaveStatus('Ready — Native PDF objects indexed');
    } catch (err: any) {
      setSaveStatus(`Load error: ${err?.message || 'Invalid PDF'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFile) {
      initialFile.file.arrayBuffer().then((ab) => {
        loadDocumentBytes(new Uint8Array(ab), initialFile.name);
      });
    } else {
      // Automatically load our rich multi-page sample PDF so the Editor is immediately interactive!
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
      // Blank added page
      setPageBgUrl('');
      return;
    }
    renderPdfPageToDataUrl(pdfBytes, currentPage.originalPageIndex + 1, 1.5, 'image/png')
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

  // Object manipulation actions
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

  const removeObjectsPermanently = (ids: string[]) => {
    updateObjectsWithHistory(
      (prev) =>
        prev.map((o) => (ids.includes(o.id) && !o.locked ? { ...o, deleted: true } : o)),
      `Remove ${ids.length} Object(s)`
    );
    setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
  };

  const restoreAllHiddenObjects = () => {
    updateObjectsWithHistory(
      (prev) => prev.map((o) => (!o.visible ? { ...o, visible: true } : o)),
      'Restore All Hidden Objects'
    );
  };

  const duplicateObject = (id: string) => {
    const target = objects.find((o) => o.id === id);
    if (!target) return;
    const copyId = `obj-copy-${Date.now().toString(36)}`;
    const clone: PdfEditableObject = {
      ...JSON.parse(JSON.stringify(target)),
      id: copyId,
      name: `${target.name} (Copy)`,
      isNative: false,
      x: target.x + 18,
      y: target.y + 18,
      zIndex: target.zIndex + 5
    };
    updateObjectsWithHistory((prev) => [...prev, clone], `Duplicate ${target.name}`);
    setSelectedIds([copyId]);
  };

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
        if (dir === 'back') return { ...o, zIndex: Math.max(0, minZ - 2) };
        if (dir === 'forward') return { ...o, zIndex: o.zIndex + 5 };
        return { ...o, zIndex: Math.max(0, o.zIndex - 5) };
      });
    }, `Change Layer Order (${dir})`);
  };

  // Keyboard shortcuts inside Editor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        removeObjectsPermanently(selectedIds);
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
        setContextMenu(null);
        setToolMode('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, handleUndo, handleRedo]);

  // Canvas Click to insert new objects when in creation toolMode
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setContextMenu(null);
    if (!currentPage) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.round((e.clientX - rect.left) / zoom);
    const clickY = Math.round((e.clientY - rect.top) / zoom);

    if (toolMode === 'select' || toolMode === 'edit-text') {
      if (e.target === e.currentTarget) {
        setSelectedIds([]);
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
        zIndex: 300,
        x: clickX,
        y: clickY,
        width: 220,
        height: 32,
        rotation: 0,
        opacity: 1,
        text: 'Double-click or use Right Panel to edit text',
        fontFamily: 'Helvetica',
        fontSize: 14,
        fontWeight: 'bold',
        fontStyle: 'normal',
        color: '#4C1D95'
      };
      updateObjectsWithHistory((prev) => [...prev, newObj], 'Insert Text Box');
      setSelectedIds([newId]);
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
    } else if (
      toolMode === 'highlight' ||
      toolMode === 'rectangle' ||
      toolMode === 'circle' ||
      toolMode === 'arrow' ||
      toolMode === 'sticky-note'
    ) {
      const isHighlight = toolMode === 'highlight';
      const isNote = toolMode === 'sticky-note';
      const newObj: PdfEditableObject = {
        id: newId,
        pageIndex: currentPage.pageIndex,
        type: isHighlight || isNote ? 'annotation' : 'shape',
        name: isHighlight
          ? 'Highlight Markup'
          : isNote
          ? 'Sticky Note Comment'
          : `${toolMode.charAt(0).toUpperCase() + toolMode.slice(1)} Shape`,
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 250,
        x: clickX,
        y: clickY,
        width: isNote ? 180 : 160,
        height: isHighlight ? 24 : isNote ? 90 : 80,
        rotation: 0,
        opacity: isHighlight ? 0.38 : 1,
        shapeKind: toolMode as any,
        fillColor: isHighlight ? '#FACC15' : isNote ? '#FEF08A' : undefined,
        strokeColor: '#7C3AED',
        strokeWidth: 2,
        text: isNote ? 'Review note: verify figures before final sign-off.' : undefined
      };
      updateObjectsWithHistory((prev) => [...prev, newObj], `Add ${newObj.name}`);
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
    } else if (toolMode === 'redact') {
      const newObj: PdfEditableObject = {
        id: newId,
        pageIndex: currentPage.pageIndex,
        type: 'redaction',
        name: 'Redaction Zone',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 999,
        x: clickX,
        y: clickY,
        width: 240,
        height: 36,
        rotation: 0,
        opacity: 1,
        fillColor: '#09090B',
        redactionCode: 'REDACTED // FOIA (b)(6)'
      };
      updateObjectsWithHistory((prev) => [...prev, newObj], 'Add Redaction Zone');
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
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState || !currentPage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const curX = Math.round((e.clientX - rect.left) / zoom);
    const curY = Math.round((e.clientY - rect.top) / zoom);
    const dx = curX - dragState.startX;
    const dy = curY - dragState.startY;

    if (dragState.mode === 'move' && dragState.objId) {
      setObjects((prev) =>
        prev.map((o) =>
          o.id === dragState.objId && !o.locked
            ? {
                ...o,
                x: Math.max(0, Math.min(currentPage.width - 20, dragState.origX + dx)),
                y: Math.max(0, Math.min(currentPage.height - 14, dragState.origY + dy))
              }
            : o
        )
      );
    } else if (dragState.mode === 'resize' && dragState.objId) {
      setObjects((prev) =>
        prev.map((o) =>
          o.id === dragState.objId && !o.locked
            ? {
                ...o,
                width: Math.max(24, dragState.origW + dx),
                height: Math.max(14, dragState.origH + dy)
              }
            : o
        )
      );
    } else if (dragState.mode === 'freehand' && dragState.points) {
      const nextPt = { x: curX - dragState.origX, y: curY - dragState.origY };
      setDragState((prev) => (prev ? { ...prev, points: [...(prev.points || []), nextPt] } : null));
    }
  };

  const handleCanvasMouseUp = () => {
    if (!dragState || !currentPage) return;
    if (dragState.mode === 'freehand' && dragState.points && dragState.points.length > 1) {
      const xs = dragState.points.map((p) => p.x);
      const ys = dragState.points.map((p) => p.y);
      const w = Math.max(30, Math.max(...xs) - Math.min(...xs) + 10);
      const h = Math.max(30, Math.max(...ys) - Math.min(...ys) + 10);
      const freeObj: PdfEditableObject = {
        id: dragState.objId || `obj-free-${Date.now()}`,
        pageIndex: currentPage.pageIndex,
        type: 'annotation',
        name: 'Freehand Ink Markup',
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
        strokeColor: '#E11D48',
        strokeWidth: 2.5,
        points: dragState.points
      };
      updateObjectsWithHistory((prev) => [...prev, freeObj], 'Draw Freehand Annotation');
      setSelectedIds([freeObj.id]);
      setToolMode('select');
    } else if (dragState.mode === 'move' || dragState.mode === 'resize') {
      pushSnapshot(pages, objects, dragState.mode === 'move' ? 'Move Object' : 'Resize Object');
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

    // Rebuild full pages array preserving any deleted page entries
    const deletedPages = pages.filter((p) => p.deleted);
    const nextPages = [...reorderedActive, ...deletedPages];

    captureAndAnimatePageFlip(() => {
      setPages(nextPages);
      pushSnapshot(
        nextPages,
        objects,
        `Reorder Page ${fromActiveIdx + 1} → Page ${toActiveIdx + 1}`
      );

      // Keep user focused on the page they moved or their previously active page
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
        imageDataUrl: dataUrl,
        imageMimeType: file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      };
      updateObjectsWithHistory((prev) => [...prev, imgObj], `Insert Image ${file.name}`);
      setSelectedIds([id]);
      setToolMode('select');
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
      name: sigIsCrypto ? `Cryptographic Signature (${sigTypedText})` : `Visual Signature (${sigTypedText})`,
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
        `Exported ${result.verification.exportedPageCount} pages (${result.verification.removedCount} removed, ${result.verification.redactionCount} redacted).`
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
    if (objectFilter === 'native-text') return o.type === 'native-text';
    if (objectFilter === 'added') return !o.isNative;
    if (objectFilter === 'shapes') return o.type === 'shape' || o.type === 'annotation';
    if (objectFilter === 'forms') return o.type === 'form-field';
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

      {/* ========================================================= */}
      {/* TOP EDITOR TOOLBAR (13.2) */}
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

          <div className="min-w-0">
            <input
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              aria-label="Document Name"
              className="text-sm font-bold bg-transparent text-theme-primary focus:outline-none focus:underline truncate max-w-[220px] sm:max-w-[280px]"
            />
            <div className="text-[11px] text-theme-muted truncate">{saveStatus}</div>
          </div>
        </div>

        {/* Center: Undo/Redo, Zoom, Page Nav, Search */}
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
          </div>

          {/* Zoom Controls (Zoom In, Zoom Out, Fit Page, Fit Width, Actual Size) */}
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
              onClick={() => setZoom((z) => Math.min(2.2, Math.round((z + 0.15) * 100) / 100))}
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
              onClick={() => setZoom(1.2)}
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
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-theme-subtle bg-theme-elevated">
            <Search className="w-3.5 h-3.5 text-theme-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find text on page..."
              className="w-32 bg-transparent text-xs text-theme-primary placeholder:text-theme-muted focus:outline-none"
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

        {/* Right: Hidden-on-Export Toggle & Primary Export CTA */}
        <div className="flex items-center gap-2.5">
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
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold bg-theme-accent hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Verifying & Exporting...' : 'Export & Verify PDF'}
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SECONDARY EDITING MODE RIBBON */}
      {/* ========================================================= */}
      <div className="border-b border-theme-subtle bg-theme-elevated px-4 py-1.5 flex items-center gap-1 overflow-x-auto">
        {(
          [
            { id: 'select', label: 'Select & Objects', icon: MousePointer },
            { id: 'edit-text', label: 'Edit Native Text', icon: Type },
            { id: 'add-text', label: 'Add Text', icon: Plus },
            { id: 'add-image', label: 'Insert Image', icon: ImageIcon },
            { id: 'highlight', label: 'Highlight', icon: Highlighter },
            { id: 'freehand', label: 'Freehand Ink', icon: PenTool },
            { id: 'rectangle', label: 'Rectangle', icon: Square },
            { id: 'circle', label: 'Circle', icon: Circle },
            { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
            { id: 'sticky-note', label: 'Sticky Note', icon: StickyNote },
            { id: 'form-field', label: 'Add Form Field', icon: FormInput },
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
      {/* MAIN 3-COLUMN EDITOR WORKSPACE */}
      {/* ========================================================= */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* --------------------------------------------------------- */}
        {/* LEFT SIDEBAR: Pages, Sajda Object Manager, Outline, Forms */}
        {/* --------------------------------------------------------- */}
        {!leftSidebarCollapsed && (
          <aside className="lg:col-span-3 border-r border-theme-subtle bg-theme-surface flex flex-col min-h-[340px] lg:max-h-[calc(100vh-155px)]">
          {/* Sidebar Navigation Tabs */}
          <div className="grid grid-cols-6 border-b border-theme-subtle bg-theme-elevated text-[11px] font-semibold">
            {(
              [
                { id: 'objects', label: 'Objects', icon: Layers },
                { id: 'pages', label: 'Pages', icon: FileText },
                { id: 'outline', label: 'Outline', icon: BookOpen },
                { id: 'annotations', label: 'Notes', icon: MessageSquare },
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

          {/* TAB 1: SAJDA-STYLE OBJECT & LAYER MANAGEMENT PANEL (10.4 & 10.5) */}
          {sidebarTab === 'objects' && (
            <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3 overflow-hidden">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-theme-primary">
                    Page {currentPageIdx + 1} Object Tree ({filteredPanelObjects.length})
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
                      { id: 'native-text', label: 'Native Text' },
                      { id: 'added', label: 'Added' },
                      { id: 'shapes', label: 'Shapes' },
                      { id: 'forms', label: 'Forms' },
                      { id: 'redaction', label: 'Redactions' },
                      { id: 'hidden', label: `Hidden (${pageObjects.filter((o) => !o.visible).length})` }
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
                    Hide / Show Selected ({selectedIds.length})
                  </button>
                  <button
                    type="button"
                    disabled={selectedIds.length === 0}
                    onClick={() => removeObjectsPermanently(selectedIds)}
                    className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 disabled:opacity-40 cursor-pointer"
                  >
                    Remove Selected
                  </button>
                  {pageObjects.some((o) => !o.visible) && (
                    <button
                      type="button"
                      onClick={restoreAllHiddenObjects}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-theme-accent hover:underline cursor-pointer"
                    >
                      Restore All Hidden
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Object List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {filteredPanelObjects.length === 0 ? (
                  <div className="py-8 text-center text-xs text-theme-muted">
                    No objects match the current filter on Page {currentPageIdx + 1}.
                  </div>
                ) : (
                  filteredPanelObjects.map((obj) => {
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
                              {obj.isNative ? 'Native Stream' : 'Editor Layer'} ·{' '}
                              {Math.round(obj.x)},{Math.round(obj.y)} pt
                              {!obj.visible ? ' · HIDDEN' : ''}
                            </div>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => toggleObjectVisibility([obj.id])}
                            title={obj.visible ? 'Hide Object (Reversible)' : 'Restore Visibility'}
                            aria-label={obj.visible ? 'Hide Object' : 'Show Object'}
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
                            aria-label={obj.locked ? 'Unlock Object' : 'Lock Object'}
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
                            title="Permanently Remove Object from PDF"
                            aria-label="Remove Object"
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

              {/* Technical Notice distinguishing Hiding vs Permanent Removal */}
              <div className="p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle text-[11px] text-theme-secondary leading-relaxed">
                <strong className="text-theme-primary">Hiding vs. Removal:</strong> Hiding (<EyeOff className="w-3 h-3 inline" />) is reversible at any time. Removing (<Trash2 className="w-3 h-3 inline text-rose-400" />) strips the object operator from the exported PDF stream.
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE PAGE THUMBNAILS & SPRING DRAG-AND-DROP REORDERING (10.9) */}
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
                      {isDropTarget && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mb-1.5 px-2 py-0.5 rounded bg-violet-500/20 text-[10px] font-mono font-bold text-violet-300 text-center"
                        >
                          Drop to move to Page {idx + 1}
                        </motion.div>
                      )}

                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <GripVertical
                            className="w-3.5 h-3.5 text-theme-muted hover:text-theme-primary shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-bold text-theme-primary font-mono tabular-nums">
                            Page {String(idx + 1).padStart(2, '0')}
                          </span>
                          {p.originalPageIndex >= 0 && p.originalPageIndex !== idx && (
                            <span className="text-[10px] font-mono text-theme-accent tabular-nums">
                              (from #{p.originalPageIndex + 1})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleReorderPages(idx, idx - 1)}
                            title="Move Page Up"
                            aria-label={`Move Page ${idx + 1} Up`}
                            className="p-1 rounded hover:bg-theme-muted text-theme-secondary hover:text-theme-primary disabled:opacity-25 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === activePages.length - 1}
                            onClick={() => handleReorderPages(idx, idx + 1)}
                            title="Move Page Down"
                            aria-label={`Move Page ${idx + 1} Down`}
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
                            title={`Extract Page ${idx + 1} as Standalone PDF`}
                            aria-label={`Extract Page ${idx + 1}`}
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

          {/* TAB 4: ANNOTATIONS & COMMENTS */}
          {sidebarTab === 'annotations' && (
            <div className="flex-1 p-3 space-y-3 overflow-y-auto">
              <span className="text-xs font-bold text-theme-primary block">
                Document Annotations &amp; Markups
              </span>
              {objects.filter((o) => !o.deleted && (o.type === 'annotation' || o.type === 'shape')).length === 0 ? (
                <p className="text-xs text-theme-muted py-4">
                  No annotations added yet. Choose Highlight, Freehand Ink, Sticky Note, or Shapes in the top ribbon.
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
                        <span className="font-mono text-[10px] text-theme-muted">Page {ann.pageIndex + 1}</span>
                      </div>
                      {ann.text && <p className="text-theme-secondary">{ann.text}</p>}
                    </div>
                  ))
              )}
            </div>
          )}

          {/* TAB 5: ACROFORM INTERACTIVE FIELDS (10.10) */}
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
                        <span className="text-[10px] text-theme-muted">Page {field.pageIndex + 1}</span>
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
                    {Math.round(currentPage?.width || 612)} × {Math.round(currentPage?.height || 792)} pt
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-muted">Native Text Runs:</span>
                  <span>{objects.filter((o) => o.isNative && o.type === 'native-text' && !o.deleted).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-muted">Hidden Objects:</span>
                  <span>{objects.filter((o) => !o.visible && !o.deleted).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-muted">Removed Objects:</span>
                  <span>{objects.filter((o) => o.deleted).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-muted">Redaction Zones:</span>
                  <span>{objects.filter((o) => o.type === 'redaction' && !o.deleted).length}</span>
                </div>
              </div>
            </div>
          )}
          </aside>
        )}

        {/* --------------------------------------------------------- */}
        {/* CENTRAL INTERACTIVE DOCUMENT CANVAS (10.1, 10.2, 10.3) */}
        {/* --------------------------------------------------------- */}
        <main
          className={`${
            leftSidebarCollapsed && rightPanelCollapsed
              ? 'lg:col-span-12'
              : leftSidebarCollapsed || rightPanelCollapsed
              ? 'lg:col-span-9'
              : 'lg:col-span-6'
          } bg-theme-muted/60 overflow-auto flex items-start justify-center p-6 lg:max-h-[calc(100vh-155px)] relative`}
        >
          {loading ? (
            <div className="my-auto text-center space-y-3 p-8">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-theme-primary">{loadingMsg}</p>
            </div>
          ) : currentPage ? (
            <div
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              style={{
                width: Math.round(currentPage.width * zoom),
                height: Math.round(currentPage.height * zoom),
                transform: `rotate(${currentPage.rotation}deg)`
              }}
              className={`relative bg-white shadow-2xl border border-black/15 transition-shadow shrink-0 ${
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

              {/* Mask whiteout rectangles over native text objects that have been modified, hidden, or deleted! */}
              {objects
                .filter((o) => o.pageIndex === currentPage.pageIndex && o.isNative && o.type === 'native-text')
                .map((obj) => {
                  const isModified =
                    obj.text !== obj.originalText ||
                    obj.color !== '#18181B' ||
                    obj.fontWeight === 'bold' ||
                    obj.fontStyle === 'italic' ||
                    obj.underline;
                  const shouldMaskOriginal = obj.deleted || !obj.visible || isModified;
                  if (!shouldMaskOriginal) return null;
                  return (
                    <div
                      key={`mask-${obj.id}`}
                      style={{
                        left: obj.x * zoom - 1,
                        top: obj.y * zoom - 1,
                        width: obj.width * zoom + 2,
                        height: obj.height * zoom + 3
                      }}
                      className="absolute bg-white pointer-events-none"
                    />
                  );
                })}

              {/* Interactive Object Layer */}
              {pageObjects.map((obj) => {
                const isSelected = selectedIds.includes(obj.id);
                const isSearchMatch =
                  searchQuery.trim().length > 1 &&
                  obj.text?.toLowerCase().includes(searchQuery.trim().toLowerCase());

                if (!obj.visible && !showHiddenOutlines) return null;

                const isModifiedNativeText =
                  obj.isNative &&
                  obj.type === 'native-text' &&
                  (obj.text !== obj.originalText ||
                    obj.color !== '#18181B' ||
                    obj.fontWeight === 'bold' ||
                    obj.fontStyle === 'italic' ||
                    obj.underline);

                return (
                  <div
                    key={obj.id}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setContextMenu(null);
                      if (e.shiftKey || e.ctrlKey || e.metaKey) {
                        setSelectedIds((prev) =>
                          prev.includes(obj.id) ? prev.filter((i) => i !== obj.id) : [...prev, obj.id]
                        );
                      } else {
                        setSelectedIds([obj.id]);
                      }
                      if (!obj.locked && toolMode === 'select') {
                        setDragState({
                          mode: 'move',
                          objId: obj.id,
                          startX: Math.round(e.clientX / zoom),
                          startY: Math.round(e.clientY / zoom),
                          origX: obj.x,
                          origY: obj.y,
                          origW: obj.width,
                          origH: obj.height
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
                      zIndex: obj.zIndex,
                      transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
                      opacity: !obj.visible ? 0.45 : obj.opacity ?? 1
                    }}
                    className={`group absolute transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-violet-600 bg-violet-500/5'
                        : isSearchMatch
                        ? 'ring-2 ring-amber-400 bg-amber-300/30'
                        : !obj.visible
                        ? 'border border-dashed border-amber-500/80 bg-amber-500/10'
                        : 'hover:ring-1 hover:ring-violet-500/60'
                    } ${obj.locked ? 'cursor-not-allowed' : 'cursor-move'}`}
                  >
                    {/* Render Modified Native Text or Added Text / Watermark */}
                    {(obj.type === 'added-text' ||
                      obj.type === 'watermark' ||
                      (obj.type === 'native-text' && isModifiedNativeText && obj.visible)) && (
                      <div
                        style={{
                          fontSize: (obj.fontSize || 12) * zoom,
                          fontFamily:
                            obj.fontFamily === 'Courier'
                              ? 'monospace'
                              : obj.fontFamily === 'Times-Roman'
                              ? 'serif'
                              : 'sans-serif',
                          fontWeight: obj.fontWeight || 'normal',
                          fontStyle: obj.fontStyle || 'normal',
                          textDecoration: obj.underline ? 'underline' : 'none',
                          color: obj.color || '#18181B',
                          lineHeight: 1.15
                        }}
                        className="w-full h-full whitespace-pre-wrap break-words pointer-events-none"
                      >
                        {obj.text}
                      </div>
                    )}

                    {/* Render Added Image or Signature */}
                    {(obj.type === 'added-image' || obj.type === 'signature') && (
                      <div className="w-full h-full flex flex-col justify-center">
                        {obj.imageDataUrl ? (
                          <img
                            src={obj.imageDataUrl}
                            alt={obj.name}
                            referrerPolicy="no-referrer"
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

                    {/* Render Shapes & Annotations */}
                    {(obj.type === 'shape' || obj.type === 'annotation') && (
                      <div
                        style={{
                          backgroundColor:
                            obj.shapeKind === 'highlight' || obj.shapeKind === 'sticky-note'
                              ? obj.fillColor
                              : obj.fillColor || 'transparent',
                          borderColor: obj.strokeColor || '#7C3AED',
                          borderWidth:
                            obj.shapeKind === 'highlight' ? 0 : (obj.strokeWidth || 2) * zoom,
                          borderStyle: 'solid',
                          borderRadius: obj.shapeKind === 'circle' ? '9999px' : '2px'
                        }}
                        className="w-full h-full pointer-events-none p-1.5 overflow-hidden"
                      >
                        {obj.shapeKind === 'sticky-note' && (
                          <p className="text-[10px] text-slate-900 font-sans leading-snug">
                            {obj.text}
                          </p>
                        )}
                        {obj.shapeKind === 'freehand' && obj.points && (
                          <svg className="w-full h-full overflow-visible">
                            <polyline
                              fill="none"
                              stroke={obj.strokeColor || '#E11D48'}
                              strokeWidth={(obj.strokeWidth || 2.5) * zoom}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={obj.points
                                .map((pt) => `${pt.x * zoom},${pt.y * zoom}`)
                                .join(' ')}
                            />
                          </svg>
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
                                `Toggle Form Checkbox`
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
                                `Update Form Field`
                              )
                            }
                            className="w-full bg-transparent text-slate-900 text-xs font-sans focus:outline-none"
                          />
                        )}
                      </div>
                    )}

                    {/* Render Permanent Redaction Zone */}
                    {obj.type === 'redaction' && (
                      <div className="w-full h-full bg-zinc-950/90 border-2 border-rose-500 flex items-center justify-between px-2 pointer-events-none">
                        <span className="text-[10px] font-mono font-bold text-rose-400 truncate">
                          {obj.redactionCode || 'REDACTED'}
                        </span>
                      </div>
                    )}

                    {/* Resize Handle when selected */}
                    {isSelected && !obj.locked && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDragState({
                            mode: 'resize',
                            objId: obj.id,
                            startX: Math.round(e.clientX / zoom),
                            startY: Math.round(e.clientY / zoom),
                            origX: obj.x,
                            origY: obj.y,
                            origW: obj.width,
                            origH: obj.height
                          });
                        }}
                        title="Drag to resize"
                        className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-violet-600 border border-white rounded-xs cursor-nwse-resize"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Floating Context Menu on Right-Click (10.4) */}
          {contextMenu && (
            <div
              style={{ left: contextMenu.x, top: contextMenu.y }}
              className="fixed z-50 w-52 bg-theme-elevated border border-theme-strong rounded-lg shadow-2xl py-1.5 text-xs"
            >
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
                  duplicateObject(contextMenu.objId);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-theme-muted flex items-center justify-between cursor-pointer"
              >
                <span>Duplicate Object</span>
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
                <span>Redact Underlying Content</span>
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
                <span>Remove Object Permanently</span>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </main>

        {/* --------------------------------------------------------- */}
        {/* RIGHT CONTEXTUAL PROPERTIES PANEL (10.1 & 10.2) */}
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
                  Click any native text run, vector block, form field, or annotation on the canvas (or in the left Objects tree) to inspect and modify its properties.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-theme-elevated border border-theme-subtle space-y-2.5 text-xs">
                <div className="font-semibold text-theme-primary">Quick Studio Actions</div>
                <button
                  type="button"
                  onClick={() => setToolMode('add-text')}
                  className="w-full py-2 px-3 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center justify-between cursor-pointer"
                >
                  <span>Insert New Text Block</span>
                  <Type className="w-3.5 h-3.5 text-theme-accent" />
                </button>
                <button
                  type="button"
                  onClick={() => setSigModalOpen(true)}
                  className="w-full py-2 px-3 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center justify-between cursor-pointer"
                >
                  <span>Draw or Apply Signature</span>
                  <PenTool className="w-3.5 h-3.5 text-theme-accent" />
                </button>
                <button
                  type="button"
                  onClick={() => setToolMode('redact')}
                  className="w-full py-2 px-3 rounded bg-theme-surface border border-theme-subtle text-left hover:border-theme-accent flex items-center justify-between cursor-pointer"
                >
                  <span>Draw Permanent Redaction Zone</span>
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Selected Object Header */}
              <div className="pb-3 border-b border-theme-subtle space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-theme-accent font-semibold">
                    {primarySelectedObj.isNative ? 'Native PDF Stream Object' : 'Editor-Managed Object'}
                  </span>
                  <span className="font-mono text-[11px] text-theme-muted">
                    {primarySelectedObj.id}
                  </span>
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

              {/* Visibility, Lock, Duplicate, Delete Quick Bar */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => toggleObjectVisibility([primarySelectedObj.id])}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded bg-theme-elevated border border-theme-subtle hover:border-theme-accent font-semibold cursor-pointer"
                >
                  {primarySelectedObj.visible ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>Hide Object</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Restore Visibility</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => removeObjectsPermanently([primarySelectedObj.id])}
                  className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Object</span>
                </button>
              </div>

              {/* Text Content & Typography Controls (for Native Text, Added Text, Sticky Note, Watermark) */}
              {(primarySelectedObj.type === 'native-text' ||
                primarySelectedObj.type === 'added-text' ||
                primarySelectedObj.type === 'watermark' ||
                primarySelectedObj.shapeKind === 'sticky-note') && (
                <div className="space-y-3 pt-2 border-t border-theme-subtle">
                  <label className="block font-bold text-theme-primary">
                    {primarySelectedObj.isNative ? 'Edit Native PDF Text' : 'Text Content'}
                  </label>
                  <textarea
                    rows={3}
                    value={primarySelectedObj.text || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setObjects((prev) =>
                        prev.map((o) => (o.id === primarySelectedObj.id ? { ...o, text: val } : o))
                      );
                    }}
                    onBlur={() => pushSnapshot(pages, objects, 'Modify Text Content')}
                    className="w-full p-2.5 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary focus:outline-none focus:border-theme-accent"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-theme-secondary mb-1">Font Family</label>
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
                        max={96}
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

                  {/* Bold, Italic, Underline, Color */}
                  <div className="flex items-center justify-between gap-2">
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
                        className={`px-2.5 py-1 rounded border font-bold cursor-pointer ${
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
                        className={`px-2.5 py-1 rounded border italic cursor-pointer ${
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
                        className={`px-2.5 py-1 rounded border underline cursor-pointer ${
                          primarySelectedObj.underline
                            ? 'bg-theme-accent text-white border-transparent'
                            : 'bg-theme-elevated border-theme-subtle text-theme-primary'
                        }`}
                      >
                        U
                      </button>
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
                                o.id === primarySelectedObj.id ? { ...o, color: e.target.value } : o
                              ),
                            'Change Text Color'
                          )
                        }
                        className="w-7 h-7 rounded cursor-pointer border border-theme-subtle bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Redaction Exemption Code */}
              {primarySelectedObj.type === 'redaction' && (
                <div className="space-y-2 pt-2 border-t border-theme-subtle">
                  <label className="block font-bold text-rose-400">
                    Redaction Overlay Label / Exemption Code
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

              {/* Geometry: Position, Dimensions, Rotation, Opacity */}
              <div className="space-y-2.5 pt-2 border-t border-theme-subtle">
                <div className="font-bold text-theme-primary">Geometry &amp; Coordinates (pt)</div>
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
                    <label className="block text-[10px] text-theme-muted">Opacity (%)</label>
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={Math.round((primarySelectedObj.opacity ?? 1) * 100)}
                      onChange={(e) =>
                        updateObjectsWithHistory(
                          (prev) =>
                            prev.map((o) =>
                              o.id === primarySelectedObj.id
                                ? {
                                    ...o,
                                    opacity: Math.max(0.1, Math.min(1, Number(e.target.value) / 100))
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
                <div className="font-bold text-theme-primary">Stacking Order</div>
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
                    onClick={() => duplicateObject(primarySelectedObj.id)}
                    className="py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle hover:border-theme-accent cursor-pointer"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => convertObjectToRedaction(primarySelectedObj.id)}
                    className="py-1.5 px-2 rounded bg-theme-elevated border border-theme-subtle text-amber-400 hover:border-amber-400 cursor-pointer"
                  >
                    Redact Object
                  </button>
                </div>
              </div>
            </div>
          )}
          </aside>
        )}
      </div>

      {/* ========================================================= */}
      {/* SIGNATURE CREATION MODAL (10.11) */}
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
      {/* EXPORT & STREAM VERIFICATION MODAL (10.16) */}
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
                <span className="text-theme-secondary">Objects Permanently Removed:</span>
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
                        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
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
