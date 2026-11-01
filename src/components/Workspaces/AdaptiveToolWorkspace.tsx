import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import {
  PdfToolDefinition,
  UploadedFileItem,
  ProcessingResult
} from '../../types/pdf';
import { PDF_TOOLS_CATALOG } from '../../data/toolsCatalog';
import {
  validateFileSignature,
  renderPdfPageToDataUrl,
  generateSamplePdfBytes
} from '../../services/pdfRenderer';
import {
  executePdfTool,
  ToolExecutionOptions
} from '../../services/pdfToolsProcessor';
import { ToolIcon } from '../IconMapper';
import { ThreeWorkspaceBanner } from '../Three/ThreeWorkspaceBanner';
import { PDFDocument } from 'pdf-lib';
import {
  ArrowLeft,
  Upload,
  Globe,
  Sparkles,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCw,
  ArrowLeft as MoveLeftIcon,
  ArrowRight as MoveRightIcon,
  Plus,
  Copy,
  FileEdit,
  Layers2,
  Lock,
  Unlock,
  FolderArchive,
  GripVertical,
  RefreshCw
} from 'lucide-react';

// Tools that natively combine multiple input files into a single output document
const MULTI_FILE_COMBINER_TOOLS = [
  'merge-pdf',
  'organize-pages',
  'compare-pdf',
  'jpg-to-pdf',
  'png-to-pdf',
  'images-to-pdf'
];

const CONVERT_TO_PDF_PASSWORD_TOOLS = [
  'word-to-pdf',
  'excel-to-pdf',
  'ppt-to-pdf',
  'html-to-pdf',
  'txt-to-pdf'
];

interface AdaptiveToolWorkspaceProps {
  tool: PdfToolDefinition;
  initialFiles?: UploadedFileItem[];
  onBack: () => void;
  onSelectTool?: (tool: PdfToolDefinition, carryFiles?: UploadedFileItem[]) => void;
  onOpenInEditor: (file: UploadedFileItem) => void;
  onOpenInBatchQueue?: (toolId: string, files: UploadedFileItem[]) => void;
  onRecordHistory: (
    toolId: string,
    toolName: string,
    fileName: string,
    outName: string,
    outSize: number,
    summary: string
  ) => void;
}

interface OrganizerPageCard {
  id: string;
  fileIndex: number;
  fileName: string;
  pageNumber: number; // 1-based, or -1 for blank page
  rotation: number;
  selected: boolean;
  thumbnailUrl?: string;
}

interface PerFileBatchState {
  progress: number;
  stage: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  result?: ProcessingResult;
  error?: string;
}

export const AdaptiveToolWorkspace: React.FC<AdaptiveToolWorkspaceProps> = ({
  tool,
  initialFiles = [],
  onBack,
  onSelectTool,
  onOpenInEditor,
  onOpenInBatchQueue,
  onRecordHistory
}) => {
  const [files, setFiles] = useState<UploadedFileItem[]>(initialFiles);
  const [urlInput, setUrlInput] = useState<string>('');
  const [importingUrl, setImportingUrl] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Organizer interactive page cards
  const [pageCards, setPageCards] = useState<OrganizerPageCard[]>([]);
  const [loadingThumbs, setLoadingThumbs] = useState<boolean>(false);
  const [draggedCardIdx, setDraggedCardIdx] = useState<number | null>(null);
  const [dragOverCardIdx, setDragOverCardIdx] = useState<number | null>(null);

  // Tool configuration options
  const [splitMode, setSplitMode] = useState<'burst' | 'ranges' | 'interval'>('burst');
  const [splitRanges, setSplitRanges] = useState<string>('1-1, 2-2');
  const [splitInterval, setSplitInterval] = useState<number>(1);
  const [rotationAngle, setRotationAngle] = useState<number>(90);

  const [watermarkText, setWatermarkText] = useState<string>('CONFIDENTIAL // VELLUM');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.22);
  const [watermarkRotation, setWatermarkRotation] = useState<number>(35);

  const [pageNumberPosition, setPageNumberPosition] = useState<
    'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-center'
  >('bottom-center');
  const [pageNumberFormat, setPageNumberFormat] = useState<'page-x-of-y' | 'numeric' | 'roman'>('page-x-of-y');

  const [headerLeft, setHeaderLeft] = useState<string>('Vellum Specification');
  const [headerCenter, setHeaderCenter] = useState<string>('');
  const [headerRight, setHeaderRight] = useState<string>('2026 Edition');
  const [footerLeft, setFooterLeft] = useState<string>('Internal Distribution');
  const [footerCenter, setFooterCenter] = useState<string>('');
  const [footerRight, setFooterRight] = useState<string>('Verified ISO-32000');

  const [cropMarginTop, setCropMarginTop] = useState<number>(36);
  const [cropMarginBottom, setCropMarginBottom] = useState<number>(36);
  const [cropMarginLeft, setCropMarginLeft] = useState<number>(36);
  const [cropMarginRight, setCropMarginRight] = useState<number>(36);

  const [password, setPassword] = useState<string>('');
  const [protectOutputWithPassword, setProtectOutputWithPassword] = useState<boolean>(false);
  const [permissionPrint, setPermissionPrint] = useState<boolean>(true);
  const [permissionCopy, setPermissionCopy] = useState<boolean>(false);

  const [pageSize, setPageSize] = useState<'letter' | 'a4' | 'fit'>('letter');
  const [imageDpiScale, setImageDpiScale] = useState<number>(2.0);
  const [rawHtmlInput, setRawHtmlInput] = useState<string>(
    '<!DOCTYPE html>\n<html>\n<head><title>Vellum Executive Brief</title></head>\n<body>\n  <h1>Executive Engineering Brief</h1>\n  <p>Generated directly from semantic HTML5 markup into ISO-32000 PDF.</p>\n</body>\n</html>'
  );
  const [rawTextInput, setRawTextInput] = useState<string>(
    'VELLUM PLAIN TEXT SPECIFICATION\n================================\n\n01. Overview\nThis document was typeset directly from plain UTF-8 text into a paginated PDF container.\n\n02. Key Properties\n- Clean typography\n- Automatic line wrapping\n- Multi-page pagination'
  );

  // Execution & Result state
  const [processing, setProcessing] = useState<boolean>(false);
  const [progressStage, setProgressStage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [perFileStates, setPerFileStates] = useState<Record<string, PerFileBatchState>>({});
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const ingestFileList = async (rawFiles: File[]) => {
    setErrorMsg('');
    setResult(null);
    const items: UploadedFileItem[] = [];

    for (const f of rawFiles) {
      if (f.size > 50 * 1024 * 1024) {
        setErrorMsg(`File "${f.name}" exceeds the 50 MB operational safety limit.`);
        continue;
      }
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

      items.push({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        name: f.name,
        size: f.type ? f.size : ab.byteLength,
        type: f.type || 'application/octet-stream',
        pageCount,
        isValidSignature: sig.isValid,
        signatureLabel: sig.detectedFormat,
        addedAt: Date.now(),
        arrayBuffer: ab
      });
    }

    if (items.length > 0) {
      setFiles((prev) => (tool.multipleFiles ? [...prev, ...items] : [items[0]]));
    }
  };

  // Clipboard Paste (Ctrl+V / Cmd+V) support for files and images
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        ingestFileList(Array.from(e.clipboardData.files));
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Build interactive organizer page thumbnails whenever files change in Organizer tools
  useEffect(() => {
    let cancelled = false;
    if (tool.workspaceType !== 'organizer' || files.length === 0) {
      setPageCards([]);
      return;
    }

    const buildCards = async () => {
      setLoadingThumbs(true);
      const nextCards: OrganizerPageCard[] = [];
      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const fItem = files[fIdx];
        const ab = fItem.arrayBuffer || (await fItem.file.arrayBuffer());
        const pdfBytes = new Uint8Array(ab);
        const total = fItem.pageCount || 1;
        for (let p = 1; p <= Math.min(total, 24); p++) {
          let thumbUrl = '';
          try {
            const rendered = await renderPdfPageToDataUrl(pdfBytes, p, 0.35, 'image/jpeg', 0.8);
            thumbUrl = rendered.dataUrl;
          } catch {
            thumbUrl = '';
          }
          nextCards.push({
            id: `card-${fIdx}-${p}-${Math.random().toString(36).slice(2, 6)}`,
            fileIndex: fIdx,
            fileName: fItem.name,
            pageNumber: p,
            rotation: 0,
            selected: tool.id === 'delete-pages' ? false : true,
            thumbnailUrl: thumbUrl
          });
        }
      }
      if (!cancelled) {
        setPageCards(nextCards);
        setLoadingThumbs(false);
      }
    };

    buildCards();
    return () => {
      cancelled = true;
    };
  }, [files, tool.workspaceType, tool.id]);

  // Load interactive sample file(s) with 1 click
  const handleLoadSampleFiles = async () => {
    setErrorMsg('');
    setResult(null);
    setPerFileStates({});
    if (tool.id === 'compare-pdf') {
      const sampleA = await generateSamplePdfBytes('editorial-report');
      const sampleB = await generateSamplePdfBytes('comparison-v2');
      const fileA = new File([sampleA.bytes as unknown as BlobPart], sampleA.name, { type: 'application/pdf' });
      const fileB = new File([sampleB.bytes as unknown as BlobPart], sampleB.name, { type: 'application/pdf' });
      await ingestFileList([fileA, fileB]);
    } else if (tool.id === 'merge-pdf') {
      const sampleA = await generateSamplePdfBytes('editorial-report');
      const sampleB = await generateSamplePdfBytes('comparison-v2');
      const fileA = new File([sampleA.bytes as unknown as BlobPart], 'Part_01_Architecture_Spec.pdf', { type: 'application/pdf' });
      const fileB = new File([sampleB.bytes as unknown as BlobPart], 'Part_02_Audit_Appendix.pdf', { type: 'application/pdf' });
      await ingestFileList([fileA, fileB]);
    } else if (tool.id === 'word-to-pdf') {
      setFiles([]);
      setProtectOutputWithPassword(true);
      if (!password) setPassword('vellum2026');
      const specs = [
        {
          name: '01_Executive_Agreement_2026.docx',
          title: 'Executive Service Agreement — 2026',
          body: 'Sample Microsoft Word (.docx) document ready for conversion and simultaneous password protection.'
        },
        {
          name: '02_Engineering_Architecture_Spec.docx',
          title: 'Zero-Trust Systems Architecture',
          body: 'Second Word (.docx) document in batch queue. All uploaded Word files can be converted and password-protected in one go.'
        },
        {
          name: '03_Governance_Schedule.docx',
          title: 'Q4 Governance & Compliance Schedule',
          body: 'Third Word (.docx) document in batch queue.'
        }
      ];
      const docxFiles: File[] = [];
      for (const s of specs) {
        const doc = new Document({
          sections: [
            {
              children: [
                new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_1 }),
                new Paragraph({ children: [new TextRun({ text: s.body, size: 24 })] })
              ]
            }
          ]
        });
        const blob = await Packer.toBlob(doc);
        docxFiles.push(
          new File([blob], s.name, {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          })
        );
      }
      await ingestFileList(docxFiles);
    } else if (tool.id === 'unlock-pdf') {
      setFiles([]);
      const sharedPass = 'vellum2026';
      setPassword(sharedPass);
      const sample1 = await generateSamplePdfBytes('editorial-report');
      const sample2 = await generateSamplePdfBytes('comparison-v2');
      const rawPdfs = [
        { bytes: sample1.bytes, name: '01_Protected_Financial_Audit.pdf' },
        { bytes: sample2.bytes, name: '02_Protected_Security_Manifest.pdf' }
      ];
      const lockedFiles: File[] = [];
      for (const item of rawPdfs) {
        const f = new File([item.bytes as unknown as BlobPart], item.name, { type: 'application/pdf' });
        const ab = await f.arrayBuffer();
        const uploaded: UploadedFileItem = {
          id: `tmp-${item.name}`,
          file: f,
          name: item.name,
          size: ab.byteLength,
          type: 'application/pdf',
          isValidSignature: true,
          signatureLabel: 'PDF 1.7',
          addedAt: Date.now(),
          arrayBuffer: ab
        };
        const protectedRes = await executePdfTool('protect-pdf', [uploaded], {
          password: sharedPass,
          permissionPrint: false,
          permissionCopy: false
        });
        lockedFiles.push(
          new File([protectedRes.outputBytes as unknown as BlobPart], protectedRes.outputFileName, {
            type: 'application/pdf'
          })
        );
      }
      await ingestFileList(lockedFiles);
    } else if (tool.id === 'jpg-to-pdf' || tool.id === 'png-to-pdf' || tool.id === 'images-to-pdf') {
      const samplePdf = await generateSamplePdfBytes('editorial-report');
      const rendered = await renderPdfPageToDataUrl(samplePdf.bytes, 1, 1.5, 'image/png');
      const b64 = rendered.dataUrl.split(',')[1];
      const imgBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const imgFile = new File([imgBytes as unknown as BlobPart], 'Sample_Architectural_Diagram.png', { type: 'image/png' });
      await ingestFileList([imgFile]);
    } else {
      const sample = await generateSamplePdfBytes('editorial-report');
      const f = new File([sample.bytes as unknown as BlobPart], sample.name, { type: 'application/pdf' });
      await ingestFileList([f]);
    }
  };

  // Secure URL Import via Backend with SSRF Protection
  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setImportingUrl(true);
    setErrorMsg('');
    try {
      const resp = await fetch('/api/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'URL import rejected by SSRF security filter.');
      }
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      const f = new File([bytes], data.fileName, { type: data.mimeType });
      await ingestFileList([f]);
      setUrlInput('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to import URL.');
    } finally {
      setImportingUrl(false);
    }
  };

  const isMultiFileBatchMode =
    files.length > 1 && !MULTI_FILE_COMBINER_TOOLS.includes(tool.id);

  const handleRunTool = async () => {
    setErrorMsg('');

    if (
      CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) &&
      protectOutputWithPassword &&
      !password.trim()
    ) {
      setErrorMsg('Please enter a password to protect your converted PDF document(s).');
      return;
    }

    if ((tool.id === 'protect-pdf' || tool.id === 'unlock-pdf') && !password.trim()) {
      setErrorMsg(
        tool.id === 'protect-pdf'
          ? 'Please enter a password to protect your PDF document(s).'
          : 'Please enter the document password to unlock your PDF document(s).'
      );
      return;
    }

    setProcessing(true);
    setProgressPercent(5);
    setProgressStage('Validating input signatures...');

    try {
      const baseOptions: ToolExecutionOptions = {
        splitMode,
        splitRanges,
        splitInterval,
        rotationAngle,
        watermarkText,
        watermarkOpacity,
        watermarkRotation,
        pageNumberPosition,
        pageNumberFormat,
        headerLeft,
        headerCenter,
        headerRight,
        footerLeft,
        footerCenter,
        footerRight,
        cropMarginTop,
        cropMarginBottom,
        cropMarginLeft,
        cropMarginRight,
        password,
        protectOutputWithPassword:
          CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword,
        permissionPrint,
        permissionCopy,
        pageSize,
        imageDpiScale,
        rawHtmlInput: tool.id === 'html-to-pdf' && files.length === 0 ? rawHtmlInput : undefined,
        rawTextInput: tool.id === 'txt-to-pdf' && files.length === 0 ? rawTextInput : undefined
      };

      // MULTI-FILE BATCH EXECUTION IN ONE GO (e.g. Multiple Word files -> Password-Protected PDFs, or Multiple Locked PDFs -> Unlocked PDFs)
      if (isMultiFileBatchMode) {
        const zip = new JSZip();
        const usedNames = new Set<string>();
        let totalOutBytes = 0;
        let totalPages = 0;
        let completedCount = 0;

        // Initialize per-file progress states
        const initialMap: Record<string, PerFileBatchState> = {};
        for (const f of files) {
          initialMap[f.id] = {
            progress: 5,
            stage: 'Queued for batch execution...',
            status: 'processing'
          };
        }
        setPerFileStates(initialMap);

        await Promise.all(
          files.map(async (fItem) => {
            try {
              const singleRes = await executePdfTool(tool.id, [fItem], {
                ...baseOptions,
                onProgress: (stage, pct) => {
                  setPerFileStates((prev) => ({
                    ...prev,
                    [fItem.id]: {
                      ...prev[fItem.id],
                      progress: Math.max(10, Math.min(99, pct)),
                      stage,
                      status: 'processing'
                    }
                  }));
                }
              });

              let outName = singleRes.outputFileName;
              if (usedNames.has(outName)) {
                const dot = outName.lastIndexOf('.');
                outName =
                  dot > 0
                    ? `${outName.slice(0, dot)}_${fItem.id.slice(-4)}${outName.slice(dot)}`
                    : `${outName}_${fItem.id.slice(-4)}`;
              }
              usedNames.add(outName);
              zip.file(outName, singleRes.outputBytes);
              totalOutBytes += singleRes.outputSize;
              totalPages += singleRes.pageCount || 1;
              completedCount += 1;

              setProgressPercent(Math.round((completedCount / files.length) * 95));
              setProgressStage(
                `Processed ${completedCount} of ${files.length} files (${fItem.name})...`
              );

              setPerFileStates((prev) => ({
                ...prev,
                [fItem.id]: {
                  progress: 100,
                  stage: 'Verified & Complete',
                  status: 'completed',
                  result: singleRes
                }
              }));

              onRecordHistory(
                tool.id,
                `${tool.shortName} (Batch)`,
                fItem.name,
                singleRes.outputFileName,
                singleRes.outputSize,
                singleRes.summary
              );
            } catch (fileErr: any) {
              setPerFileStates((prev) => ({
                ...prev,
                [fItem.id]: {
                  progress: 100,
                  stage: 'Failed',
                  status: 'error',
                  error: fileErr?.message || 'Failed to process file'
                }
              }));
              throw fileErr;
            }
          })
        );

        const zipBytes = await zip.generateAsync({ type: 'uint8array' });
        const zipFileName =
          CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword
            ? `Vellum_${tool.id}_protected_${files.length}_files.zip`
            : tool.id === 'unlock-pdf'
            ? `Vellum_unlocked_${files.length}_pdfs.zip`
            : `Vellum_${tool.id}_${files.length}_files.zip`;

        setProgressPercent(100);
        setProgressStage('All files processed and packaged into ZIP.');

        setResult({
          success: true,
          toolId: tool.id,
          validationPassed: true,
          outputBytes: zipBytes,
          outputFileName: zipFileName,
          outputMimeType: 'application/zip',
          originalSize: files.reduce((a, b) => a + b.size, 0),
          outputSize: zipBytes.byteLength,
          pageCount: totalPages,
          summary:
            CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword
              ? `Converted and password-protected all ${files.length} files into encrypted PDFs in one go.`
              : tool.id === 'unlock-pdf'
              ? `Verified password and unlocked all ${files.length} password-protected PDFs in one go.`
              : `Processed all ${files.length} files in one go (${(totalOutBytes / 1024).toFixed(1)} KB total output).`,
          validationNotes: [
            `All ${files.length} files processed simultaneously with per-file verification`,
            ...(CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword
              ? [`SHA-256 password policy applied to all ${files.length} output PDFs`]
              : []),
            ...(tool.id === 'unlock-pdf'
              ? [`Password verified and security restrictions stripped from all ${files.length} PDFs`]
              : []),
            'Download individual files from the queue or download all as a single .zip archive'
          ],
          details: {
            'Files Processed': files.length,
            'Password Protection':
              (CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword) ||
              tool.id === 'protect-pdf'
                ? 'Active (SHA-256 Policy)'
                : tool.id === 'unlock-pdf'
                ? 'Removed from All PDFs'
                : 'Standard'
          }
        });
        return;
      }

      // SINGLE-FILE OR COMBINER EXECUTION
      const execOptions: ToolExecutionOptions = {
        ...baseOptions,
        onProgress: (stage, pct) => {
          setProgressStage(stage);
          setProgressPercent(pct);
        }
      };

      if (tool.workspaceType === 'organizer' && pageCards.length > 0 && tool.id !== 'split-pdf') {
        if (tool.id === 'delete-pages') {
          const remaining = pageCards.filter((c) => !c.selected);
          if (remaining.length === 0) {
            throw new Error('Cannot delete every page in the document. Leave at least 1 unselected page.');
          }
          execOptions.pageOrder = remaining.map((c) => ({
            fileIndex: c.fileIndex,
            pageNumber: c.pageNumber,
            rotation: c.rotation
          }));
        } else {
          const chosen = pageCards.filter((c) => c.selected);
          if (chosen.length === 0) {
            throw new Error('Please select at least one page to include in the output PDF.');
          }
          execOptions.pageOrder = chosen.map((c) => ({
            fileIndex: c.fileIndex,
            pageNumber: c.pageNumber,
            rotation: c.rotation
          }));
        }
      }

      const res = await executePdfTool(tool.id, files, execOptions);
      setResult(res);
      onRecordHistory(
        tool.id,
        tool.name,
        files[0]?.name || 'Inline Input',
        res.outputFileName,
        res.outputSize,
        res.summary
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Document processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  const triggerDownloadResult = () => {
    if (!result) return;
    const blob = new Blob([result.outputBytes as unknown as BlobPart], { type: result.outputMimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.outputFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const triggerDownloadSingleFileResult = (r: ProcessingResult) => {
    const blob = new Blob([r.outputBytes as unknown as BlobPart], { type: r.outputMimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = r.outputFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
      {/* Workspace Header Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-theme-subtle">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-theme-subtle bg-theme-surface text-theme-secondary hover:text-theme-primary hover:bg-theme-muted cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            All Tools
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs text-theme-secondary">
              <span>{tool.categoryLabel}</span>
              <span aria-hidden="true">·</span>
              <span>ISO 32000 Processing Pipeline</span>
              <span aria-hidden="true">·</span>
              <span>Single &amp; Multi-File Batch Support</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-theme-primary mt-0.5 flex items-center gap-2.5">
              <ToolIcon name={tool.iconName} className="w-6 h-6 text-theme-accent" />
              <span>{tool.name}</span>
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onOpenInBatchQueue && (
            <button
              type="button"
              onClick={() => onOpenInBatchQueue(tool.id, files)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
            >
              <Layers2 className="w-3.5 h-3.5 text-theme-accent" />
              Open in Dedicated Batch Queue
            </button>
          )}

          <button
            type="button"
            onClick={handleLoadSampleFiles}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
            {tool.id === 'compare-pdf'
              ? 'Load Sample Rev A & Rev B PDFs'
              : tool.id === 'merge-pdf'
              ? 'Load 2 Sample PDFs to Merge'
              : tool.id === 'word-to-pdf'
              ? 'Load 3 Sample Word (.docx) Files'
              : tool.id === 'unlock-pdf'
              ? 'Load 2 Password-Protected PDFs'
              : 'Load Interactive Sample File'}
          </button>

          {files.length > 0 && files[0].signatureLabel.startsWith('PDF') && (
            <button
              type="button"
              onClick={() => onOpenInEditor(files[0])}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-muted text-theme-primary hover:bg-theme-accent hover:text-white transition-colors cursor-pointer"
            >
              <FileEdit className="w-3.5 h-3.5" />
              Open in Full PDF Editor
            </button>
          )}
        </div>
      </div>

      {/* Interactive Three.js 3D Document Pipeline & Security Stage */}
      <ThreeWorkspaceBanner
        title={tool.name}
        subtitle={`${files.length || 1} Document(s) in Pipeline · Interactive 3D Stream Stage`}
        mode={
          tool.workspaceType === 'security'
            ? 'security'
            : tool.workspaceType === 'organizer'
            ? 'organizer'
            : 'converter'
        }
        fileCount={files.length}
        isProcessing={processing}
        progressPercent={progressPercent}
        isPasswordLocked={
          (CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword) ||
          tool.id === 'protect-pdf'
        }
      />

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-xs text-rose-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Two-Column Adaptive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN (7 cols): Upload Dropzone, File Queue, and Interactive Page Grid */}
        <div className="lg:col-span-7 space-y-6">
          {/* Drag-and-Drop Upload Surface */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) {
                ingestFileList(Array.from(e.dataTransfer.files));
              }
            }}
            className="p-6 rounded-xl border-2 border-dashed border-theme-strong bg-theme-surface/70 hover:border-theme-accent transition-colors text-center space-y-4"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple={tool.multipleFiles}
              accept={tool.acceptedExtensions.join(',')}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  ingestFileList(Array.from(e.target.files));
                }
                e.target.value = '';
              }}
            />
            <div className="w-12 h-12 rounded-xl bg-theme-elevated border border-theme-subtle flex items-center justify-center mx-auto text-theme-accent">
              <Upload className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-theme-primary">
                Drop one or multiple {tool.acceptedExtensions.join(', ')} files here
              </h2>
              <p className="text-xs text-theme-secondary">
                {tool.id === 'word-to-pdf'
                  ? 'Upload multiple Word (.docx) files at once—convert & password-protect all of them in one go'
                  : tool.id === 'unlock-pdf'
                  ? 'Upload multiple password-protected PDFs at once—enter the password once to unlock all in one go'
                  : 'Magic-byte file signature verification active · Up to 50 MB per document · Zero guest retention'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-theme-accent text-white hover:opacity-95 cursor-pointer"
              >
                Select File{tool.multipleFiles ? 's' : ''} from Device
              </button>
              <button
                type="button"
                onClick={handleLoadSampleFiles}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
              >
                {tool.id === 'word-to-pdf'
                  ? 'Load 3 Sample Word Files'
                  : tool.id === 'unlock-pdf'
                  ? 'Load 2 Locked Sample PDFs'
                  : 'Use Sample Document'}
              </button>
            </div>

            {/* Secure URL Import Bar with SSRF Protection */}
            <form
              onSubmit={handleImportUrl}
              className="pt-3 border-t border-theme-subtle max-w-md mx-auto flex items-center gap-2"
            >
              <Globe className="w-4 h-4 text-theme-muted shrink-0" />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Or import from HTTPS URL (SSRF protected)..."
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle text-xs text-theme-primary placeholder:text-theme-muted focus:outline-none focus:border-theme-accent"
              />
              <button
                type="submit"
                disabled={importingUrl || !urlInput.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-theme-muted text-theme-primary hover:bg-theme-accent hover:text-white disabled:opacity-40 cursor-pointer"
              >
                {importingUrl ? 'Checking...' : 'Fetch URL'}
              </button>
            </form>
          </div>

          {/* Uploaded Files List with Magic-Byte Signature Verification & Per-File Progress */}
          {files.length > 0 && (
            <div className="p-5 rounded-xl bg-theme-surface border border-theme-subtle space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-theme-secondary">
                  Verified Input Queue ({files.length} {files.length === 1 ? 'File' : 'Files'})
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setResult(null);
                    setPerFileStates({});
                  }}
                  className="text-xs text-rose-400 hover:underline cursor-pointer"
                >
                  Clear Queue
                </button>
              </div>
              <div className="divide-y divide-theme-subtle">
                {files.map((f, idx) => {
                  const st = perFileStates[f.id];
                  return (
                    <div key={f.id} className="py-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-bold text-theme-primary truncate">
                            {idx + 1}. {f.name}
                          </div>
                          <div className="text-theme-secondary font-mono tabular-nums mt-0.5">
                            {(f.size / 1024).toFixed(1)} KB
                            {f.pageCount ? ` · ${f.pageCount} Page(s)` : ''}
                            {' · '}
                            <span className={f.isValidSignature ? 'text-emerald-400' : 'text-amber-400'}>
                              {f.signatureLabel}
                            </span>
                            {st?.result && (
                              <>
                                {' → '}
                                <span className="text-emerald-400 font-semibold">
                                  {st.result.outputFileName}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {st?.result && (
                            <button
                              type="button"
                              onClick={() => triggerDownloadSingleFileResult(st.result!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              Download
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setFiles((prev) => prev.filter((item) => item.id !== f.id))
                            }
                            aria-label={`Remove ${f.name}`}
                            className="p-1.5 rounded-lg text-theme-muted hover:text-rose-400 hover:bg-theme-muted cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Per-file progress indicator when processing multiple files */}
                      {st && (
                        <div className="space-y-1">
                          <div className="w-full h-1.5 rounded-full bg-theme-muted overflow-hidden">
                            <div
                              style={{ width: `${st.progress}%` }}
                              className={`h-full transition-all duration-150 ${
                                st.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : st.status === 'error'
                                  ? 'bg-rose-500'
                                  : 'bg-theme-accent'
                              }`}
                            />
                          </div>
                          <div className="flex justify-between text-[11px] font-mono text-theme-secondary">
                            <span>{st.error || st.stage}</span>
                            <span>{st.progress}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ADAPTIVE ORGANIZER PAGE GRID (When in Organize PDF tools) */}
          {tool.workspaceType === 'organizer' && pageCards.length > 0 && tool.id !== 'split-pdf' && (
            <div className="p-5 rounded-xl bg-theme-surface border border-theme-subtle space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-theme-primary">
                    Interactive Page Organizer ({pageCards.length} Pages)
                  </h3>
                  <p className="text-xs text-theme-secondary">
                    {tool.id === 'delete-pages'
                      ? 'Click pages to mark them for deletion (highlighted in crimson).'
                      : 'Click pages to toggle inclusion, rotate 90°, reorder sequence, or insert blank pages.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPageCards((prev) => [
                        ...prev,
                        {
                          id: `blank-${Date.now()}`,
                          fileIndex: 0,
                          fileName: 'Blank Page',
                          pageNumber: -1,
                          rotation: 0,
                          selected: tool.id !== 'delete-pages'
                        }
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Blank Page
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageCards((prev) => [...prev].reverse())}
                    className="px-2.5 py-1 rounded text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                  >
                    Reverse Order
                  </button>
                </div>
              </div>

              {loadingThumbs ? (
                <p className="text-xs text-theme-muted py-6 text-center">
                  Rendering interactive page thumbnails...
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {pageCards.map((card, cIdx) => {
                    const isDeleteTarget = tool.id === 'delete-pages' && card.selected;
                    const isIncluded = tool.id !== 'delete-pages' && card.selected;
                    const isBeingDragged = draggedCardIdx === cIdx;
                    const isDropTarget =
                      dragOverCardIdx === cIdx &&
                      draggedCardIdx !== null &&
                      draggedCardIdx !== cIdx;

                    return (
                      <div
                        key={card.id}
                        draggable={pageCards.length > 1}
                        onDragStart={(e) => {
                          setDraggedCardIdx(cIdx);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(cIdx));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverCardIdx !== cIdx) {
                            setDragOverCardIdx(cIdx);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverCardIdx === cIdx) {
                            setDragOverCardIdx(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIdx =
                            draggedCardIdx !== null
                              ? draggedCardIdx
                              : Number(e.dataTransfer.getData('text/plain'));
                          setDraggedCardIdx(null);
                          setDragOverCardIdx(null);
                          if (!Number.isNaN(fromIdx) && fromIdx !== cIdx) {
                            setPageCards((prev) => {
                              const copy = [...prev];
                              const [moved] = copy.splice(fromIdx, 1);
                              copy.splice(cIdx, 0, moved);
                              return copy;
                            });
                          }
                        }}
                        onDragEnd={() => {
                          setDraggedCardIdx(null);
                          setDragOverCardIdx(null);
                        }}
                        onClick={() =>
                          setPageCards((prev) =>
                            prev.map((c, i) => (i === cIdx ? { ...c, selected: !c.selected } : c))
                          )
                        }
                        className={`p-2.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
                          isBeingDragged
                            ? 'opacity-40 scale-[0.97] border-dashed border-theme-accent'
                            : isDropTarget
                            ? 'border-violet-400 ring-2 ring-violet-500/40 bg-violet-500/10'
                            : isDeleteTarget
                            ? 'border-rose-500 bg-rose-500/10'
                            : isIncluded
                            ? 'border-theme-accent bg-theme-elevated'
                            : 'border-theme-subtle bg-theme-canvas/40 opacity-55'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                          <span className="font-bold text-theme-primary flex items-center gap-1">
                            <GripVertical className="w-3 h-3 text-theme-muted shrink-0" />
                            <span>{card.pageNumber === -1 ? 'Blank' : `P.${card.pageNumber}`}</span>
                          </span>
                          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={cIdx === 0}
                              onClick={() =>
                                setPageCards((prev) => {
                                  const copy = [...prev];
                                  const [item] = copy.splice(cIdx, 1);
                                  copy.splice(cIdx - 1, 0, item);
                                  return copy;
                                })
                              }
                              title="Move Earlier"
                              className="p-0.5 text-theme-secondary hover:text-theme-primary disabled:opacity-25 cursor-pointer"
                            >
                              <MoveLeftIcon className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={cIdx === pageCards.length - 1}
                              onClick={() =>
                                setPageCards((prev) => {
                                  const copy = [...prev];
                                  const [item] = copy.splice(cIdx, 1);
                                  copy.splice(cIdx + 1, 0, item);
                                  return copy;
                                })
                              }
                              title="Move Later"
                              className="p-0.5 text-theme-secondary hover:text-theme-primary disabled:opacity-25 cursor-pointer"
                            >
                              <MoveRightIcon className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPageCards((prev) =>
                                  prev.map((c, i) =>
                                    i === cIdx ? { ...c, rotation: (c.rotation + 90) % 360 } : c
                                  )
                                )
                              }
                              title="Rotate 90°"
                              className="p-0.5 text-theme-secondary hover:text-theme-primary cursor-pointer"
                            >
                              <RotateCw className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="aspect-[3/4] rounded bg-white border border-theme-subtle flex items-center justify-center overflow-hidden">
                          {card.thumbnailUrl ? (
                            <img
                              src={card.thumbnailUrl}
                              alt={`Page ${card.pageNumber}`}
                              referrerPolicy="no-referrer"
                              style={{ transform: `rotate(${card.rotation}deg)` }}
                              className="max-h-full max-w-full object-contain transition-transform"
                            />
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">Blank Sheet</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Inline HTML / Plain Text Input when no file uploaded */}
          {tool.id === 'html-to-pdf' && files.length === 0 && (
            <div className="p-5 rounded-xl bg-theme-surface border border-theme-subtle space-y-2">
              <label className="block text-xs font-bold text-theme-primary">
                Or Paste HTML5 Markup Directly:
              </label>
              <textarea
                rows={6}
                value={rawHtmlInput}
                onChange={(e) => setRawHtmlInput(e.target.value)}
                className="w-full p-3 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-xs text-theme-primary"
              />
            </div>
          )}

          {tool.id === 'txt-to-pdf' && files.length === 0 && (
            <div className="p-5 rounded-xl bg-theme-surface border border-theme-subtle space-y-2">
              <label className="block text-xs font-bold text-theme-primary">
                Or Type / Paste Plain Text Directly:
              </label>
              <textarea
                rows={6}
                value={rawTextInput}
                onChange={(e) => setRawTextInput(e.target.value)}
                className="w-full p-3 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-xs text-theme-primary"
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (5 cols): Contextual Configuration, Execution & Verified Output */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-xl bg-theme-surface border border-theme-subtle space-y-5">
            <h3 className="text-sm font-bold text-theme-primary border-b border-theme-subtle pb-3">
              Tool Parameters &amp; Execution
            </h3>

            {/* Word-to-PDF / Convert-to-PDF: Option to Password-Protect All Output PDFs in One Go */}
            {CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && (
              <div className="p-4 rounded-xl bg-theme-elevated border border-theme-strong space-y-3 text-xs">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={protectOutputWithPassword}
                    onChange={(e) => setProtectOutputWithPassword(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-theme-primary flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-theme-accent" />
                      Password-Protect Output PDF{files.length > 1 ? 's in One Go' : ''}
                    </span>
                    <span className="block text-[11px] text-theme-secondary mt-0.5">
                      Automatically lock {files.length > 1 ? `all ${files.length} converted PDFs` : 'the converted PDF'} with a shared password and SHA-256 access policy in a single pass.
                    </span>
                  </div>
                </label>

                {protectOutputWithPassword && (
                  <div className="space-y-2.5 pt-2 border-t border-theme-subtle">
                    <div>
                      <label className="block font-semibold text-theme-secondary mb-1">
                        Password for Output PDF{files.length > 1 ? 's' : ''}
                      </label>
                      <input
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password to protect output PDF(s)..."
                        className="w-full px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissionPrint}
                          onChange={(e) => setPermissionPrint(e.target.checked)}
                        />
                        <span>Permit High-Resolution Printing</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissionCopy}
                          onChange={(e) => setPermissionCopy(e.target.checked)}
                        />
                        <span>Permit Text &amp; Graphic Extraction</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Split PDF Parameters */}
            {tool.id === 'split-pdf' && (
              <div className="space-y-3 text-xs">
                <label className="block font-semibold text-theme-secondary">Split Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'burst', label: 'Every Page' },
                      { id: 'ranges', label: 'Page Ranges' },
                      { id: 'interval', label: 'Fixed Interval' }
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSplitMode(m.id)}
                      className={`py-2 px-2.5 rounded-lg border font-semibold cursor-pointer ${
                        splitMode === m.id
                          ? 'bg-theme-accent text-white border-transparent'
                          : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {splitMode === 'ranges' && (
                  <div>
                    <label className="block text-theme-secondary mb-1">
                      Comma-separated ranges (e.g. 1-1, 2-2)
                    </label>
                    <input
                      type="text"
                      value={splitRanges}
                      onChange={(e) => setSplitRanges(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                    />
                  </div>
                )}
                {splitMode === 'interval' && (
                  <div>
                    <label className="block text-theme-secondary mb-1">Pages per split file</label>
                    <input
                      type="number"
                      min={1}
                      value={splitInterval}
                      onChange={(e) => setSplitInterval(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Rotate PDF Parameters */}
            {tool.id === 'rotate-pages' && (
              <div className="space-y-2 text-xs">
                <label className="block font-semibold text-theme-secondary">
                  Global Rotation Angle
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[90, 180, 270].map((ang) => (
                    <button
                      key={ang}
                      type="button"
                      onClick={() => setRotationAngle(ang)}
                      className={`py-2 rounded-lg border font-mono font-semibold cursor-pointer ${
                        rotationAngle === ang
                          ? 'bg-theme-accent text-white border-transparent'
                          : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                      }`}
                    >
                      +{ang}°
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Watermark Parameters */}
            {tool.id === 'watermark-pdf' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Watermark Stamp Text
                  </label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <label className="block text-theme-secondary mb-1">Opacity (0.1 - 1.0)</label>
                    <input
                      type="number"
                      step={0.05}
                      min={0.05}
                      max={1}
                      value={watermarkOpacity}
                      onChange={(e) => setWatermarkOpacity(Number(e.target.value) || 0.2)}
                      className="w-full px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle"
                    />
                  </div>
                  <div>
                    <label className="block text-theme-secondary mb-1">Diagonal Angle (°)</label>
                    <input
                      type="number"
                      value={watermarkRotation}
                      onChange={(e) => setWatermarkRotation(Number(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Page Numbers Parameters */}
            {tool.id === 'page-numbers' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">Placement</label>
                  <select
                    value={pageNumberPosition}
                    onChange={(e) => setPageNumberPosition(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                  >
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="top-center">Top Center</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Numbering Style
                  </label>
                  <select
                    value={pageNumberFormat}
                    onChange={(e) => setPageNumberFormat(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                  >
                    <option value="page-x-of-y">Page 1 of N</option>
                    <option value="numeric">1, 2, 3</option>
                    <option value="roman">i, ii, iii (Roman)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Header & Footer Parameters */}
            {tool.id === 'header-footer' && (
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-theme-secondary mb-1">Header Left</label>
                  <input
                    type="text"
                    value={headerLeft}
                    onChange={(e) => setHeaderLeft(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                  />
                </div>
                <div>
                  <label className="block text-theme-secondary mb-1">Header Right</label>
                  <input
                    type="text"
                    value={headerRight}
                    onChange={(e) => setHeaderRight(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                  />
                </div>
                <div>
                  <label className="block text-theme-secondary mb-1">Footer Left</label>
                  <input
                    type="text"
                    value={footerLeft}
                    onChange={(e) => setFooterLeft(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                  />
                </div>
                <div>
                  <label className="block text-theme-secondary mb-1">Footer Right</label>
                  <input
                    type="text"
                    value={footerRight}
                    onChange={(e) => setFooterRight(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                  />
                </div>
              </div>
            )}

            {/* Crop Margins Parameters */}
            {tool.id === 'crop-pdf' && (
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <label className="block text-theme-secondary mb-1">Top Margin (pt)</label>
                  <input
                    type="number"
                    value={cropMarginTop}
                    onChange={(e) => setCropMarginTop(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                  />
                </div>
                <div>
                  <label className="block text-theme-secondary mb-1">Bottom Margin (pt)</label>
                  <input
                    type="number"
                    value={cropMarginBottom}
                    onChange={(e) => setCropMarginBottom(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                  />
                </div>
                <div>
                  <label className="block text-theme-secondary mb-1">Left Margin (pt)</label>
                  <input
                    type="number"
                    value={cropMarginLeft}
                    onChange={(e) => setCropMarginLeft(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                  />
                </div>
                <div>
                  <label className="block text-theme-secondary mb-1">Right Margin (pt)</label>
                  <input
                    type="number"
                    value={cropMarginRight}
                    onChange={(e) => setCropMarginRight(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                  />
                </div>
              </div>
            )}

            {/* Protect / Unlock Password Input */}
            {(tool.id === 'protect-pdf' || tool.id === 'unlock-pdf') && (
              <div className="p-4 rounded-xl bg-theme-elevated border border-theme-strong space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-theme-primary mb-1 flex items-center gap-1.5">
                    {tool.id === 'protect-pdf' ? (
                      <>
                        <Lock className="w-3.5 h-3.5 text-theme-accent" />
                        <span>
                          Password to Lock {files.length > 1 ? `All ${files.length} PDFs in One Go` : 'PDF Document'}
                        </span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          Password to Unlock {files.length > 1 ? `All ${files.length} PDFs in One Go` : 'Protected PDF'}
                        </span>
                      </>
                    )}
                  </label>
                  <p className="text-[11px] text-theme-secondary mb-2">
                    {tool.id === 'protect-pdf'
                      ? 'Enter a password once to apply SHA-256 access policies across every uploaded PDF.'
                      : 'Enter the document password once to remove password restrictions from all uploaded PDFs in one go.'}
                  </p>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      tool.id === 'protect-pdf'
                        ? 'Enter password to protect PDF(s)...'
                        : 'Enter password to unlock PDF(s)...'
                    }
                    className="w-full px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary font-mono"
                  />
                </div>
                {tool.id === 'protect-pdf' && (
                  <div className="space-y-1.5 pt-1 border-t border-theme-subtle">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissionPrint}
                        onChange={(e) => setPermissionPrint(e.target.checked)}
                      />
                      <span>Permit High-Resolution Printing</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissionCopy}
                        onChange={(e) => setPermissionCopy(e.target.checked)}
                      />
                      <span>Permit Text &amp; Graphic Extraction</span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Image to PDF Page Size */}
            {(tool.id === 'jpg-to-pdf' || tool.id === 'png-to-pdf' || tool.id === 'images-to-pdf') && (
              <div className="space-y-2 text-xs">
                <label className="block font-semibold text-theme-secondary">Target Page Size</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                >
                  <option value="letter">US Letter (8.5 × 11 in)</option>
                  <option value="a4">ISO A4 (210 × 297 mm)</option>
                  <option value="fit">Fit Exact Image Dimensions</option>
                </select>
              </div>
            )}

            {/* PDF to Image DPI Selector */}
            {(tool.id === 'pdf-to-jpg' || tool.id === 'pdf-to-png') && (
              <div className="space-y-2 text-xs">
                <label className="block font-semibold text-theme-secondary">Render Resolution</label>
                <select
                  value={imageDpiScale}
                  onChange={(e) => setImageDpiScale(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                >
                  <option value={1.5}>Standard (150 DPI)</option>
                  <option value={2.0}>High Definition (200 DPI)</option>
                  <option value={3.0}>Archival Print (300 DPI)</option>
                </select>
              </div>
            )}

            {/* Execute Primary CTA */}
            <button
              type="button"
              disabled={
                processing ||
                (files.length === 0 && tool.id !== 'html-to-pdf' && tool.id !== 'txt-to-pdf')
              }
              onClick={handleRunTool}
              className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-theme-accent text-white hover:opacity-95 disabled:opacity-40 transition-opacity cursor-pointer shadow-sm"
            >
              {processing
                ? progressStage || 'Processing Document...'
                : CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword
                ? `Convert & Password-Protect ${files.length > 1 ? `All (${files.length} Files)` : 'PDF'}`
                : tool.id === 'unlock-pdf' && files.length > 1
                ? `Unlock All ${files.length} PDFs in One Go`
                : isMultiFileBatchMode
                ? `Run ${tool.shortName} on All (${files.length} Files)`
                : `Run ${tool.shortName}`}
            </button>

            {/* Real Processing Progress Bar */}
            {processing && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono text-theme-secondary">
                  <span>{progressStage}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-theme-muted overflow-hidden">
                  <div
                    style={{ width: `${progressPercent}%` }}
                    className="h-full bg-theme-accent transition-all duration-150"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* VERIFIED RESULT & DOWNLOAD PANEL */}
          {/* ========================================================= */}
          {result && (
            <div className="p-6 rounded-xl bg-theme-elevated border border-theme-strong space-y-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-theme-primary">
                      Operation Verified &amp; Complete
                    </h4>
                    <p className="text-xs text-theme-secondary mt-0.5">{result.summary}</p>
                  </div>
                </div>
              </div>

              {/* Validation & Telemetry Table */}
              <div className="p-3.5 rounded-lg bg-theme-surface border border-theme-subtle space-y-1.5 text-xs font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-theme-muted">Output File:</span>
                  <span className="text-theme-primary font-semibold truncate max-w-[210px]">
                    {result.outputFileName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-theme-muted">Output Size:</span>
                  <span>{(result.outputSize / 1024).toFixed(1)} KB</span>
                </div>
                {result.pageCount !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-theme-muted">Pages Processed:</span>
                    <span>{result.pageCount}</span>
                  </div>
                )}
                {result.details &&
                  Object.entries(result.details).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-theme-muted">{k}:</span>
                      <span className="text-theme-primary truncate max-w-[200px]">{String(v)}</span>
                    </div>
                  ))}
              </div>

              {/* Validation Notes */}
              <ul className="space-y-1 text-xs text-emerald-400 font-mono">
                {result.validationNotes.map((note, idx) => (
                  <li key={idx}>✓ {note}</li>
                ))}
              </ul>

              {/* Extracted Text / Diff / JSON Preview */}
              {result.extractedText && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-theme-primary">Output Content Preview</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(result.extractedText || '');
                        setCopiedText(true);
                        setTimeout(() => setCopiedText(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 text-theme-accent hover:underline cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedText ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                  </div>
                  <pre className="max-h-48 overflow-y-auto p-3 rounded-lg bg-theme-surface border border-theme-subtle text-[11px] font-mono text-theme-secondary whitespace-pre-wrap">
                    {result.extractedText}
                  </pre>
                </div>
              )}

              {/* Extracted Image Gallery Preview */}
              {result.extractedImages && result.extractedImages.length > 0 && (
                <div className="space-y-2">
                  <span className="block text-xs font-bold text-theme-primary">
                    Rendered Page Previews ({result.extractedImages.length})
                  </span>
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                    {result.extractedImages.map((img) => (
                      <a
                        key={img.name}
                        href={img.dataUrl}
                        download={img.name}
                        className="group p-2 rounded border border-theme-subtle bg-theme-surface hover:border-theme-accent block text-center"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          referrerPolicy="no-referrer"
                          className="h-24 mx-auto object-contain mb-1"
                        />
                        <span className="text-[10px] font-mono text-theme-secondary group-hover:text-theme-primary truncate block">
                          Page {img.page} ({img.width}×{img.height})
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <button
                  type="button"
                  onClick={triggerDownloadResult}
                  className="flex-1 w-full py-3 px-4 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {result.outputMimeType === 'application/zip' ? (
                    <FolderArchive className="w-4 h-4" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download {result.outputFileName}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setResult(null);
                    setPerFileStates({});
                    setErrorMsg('');
                  }}
                  className="py-3 px-4 rounded-xl text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-theme-accent" />
                  Process Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* RELATED TOOLS DISCOVERY STRIP */}
      {/* ========================================================= */}
      {onSelectTool && (
        <div className="pt-8 border-t border-theme-subtle space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-theme-primary">
              Related {tool.categoryLabel} Utilities
            </h3>
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-semibold text-theme-accent hover:underline cursor-pointer"
            >
              Browse All {PDF_TOOLS_CATALOG.length} Tools →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {PDF_TOOLS_CATALOG.filter((t) => t.category === tool.category && t.id !== tool.id)
              .slice(0, 4)
              .map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => onSelectTool(rel, [])}
                  className="group p-4 rounded-xl bg-theme-surface border border-theme-subtle hover:border-theme-accent text-left transition-all flex flex-col justify-between space-y-2 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ToolIcon name={rel.iconName} className="w-4 h-4 text-theme-accent" />
                      <span className="text-xs font-bold text-theme-primary group-hover:text-theme-accent">
                        {rel.shortName}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-theme-muted">
                      {rel.outputExtension}
                    </span>
                  </div>
                  <p className="text-[11px] text-theme-secondary line-clamp-2 leading-relaxed">
                    {rel.description}
                  </p>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
