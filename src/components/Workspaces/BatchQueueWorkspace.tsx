import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import {
  BatchQueueItem,
  UploadedFileItem,
  PdfToolDefinition
} from '../../types/pdf';
import {
  findToolById
} from '../../data/toolsCatalog';
import {
  validateFileSignature,
  generateSamplePdfBytes
} from '../../services/pdfRenderer';
import {
  executePdfTool,
  ToolExecutionOptions
} from '../../services/pdfToolsProcessor';
import { ToolIcon } from '../IconMapper';
import { ThreeWorkspaceBanner } from '../Three/ThreeWorkspaceBanner';
import {
  ArrowLeft,
  Upload,
  Sparkles,
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  Download,
  FolderArchive,
  Layers2,
  Lock,
  Unlock
} from 'lucide-react';

const BATCH_COMPATIBLE_TOOL_IDS = [
  'word-to-pdf',
  'protect-pdf',
  'unlock-pdf',
  'compress-pdf',
  'excel-to-pdf',
  'ppt-to-pdf',
  'jpg-to-pdf',
  'png-to-pdf',
  'html-to-pdf',
  'pdf-to-word',
  'pdf-to-excel',
  'pdf-to-ppt',
  'pdf-to-html',
  'pdf-to-pdfa'
];

const CONVERT_TO_PDF_IDS = [
  'word-to-pdf',
  'excel-to-pdf',
  'ppt-to-pdf',
  'jpg-to-pdf',
  'png-to-pdf',
  'html-to-pdf'
];

interface BatchQueueWorkspaceProps {
  initialToolId?: string;
  initialFiles?: UploadedFileItem[];
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

export const BatchQueueWorkspace: React.FC<BatchQueueWorkspaceProps> = ({
  initialToolId = 'compress-pdf',
  initialFiles = [],
  onBack,
  onRecordHistory
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>(
    BATCH_COMPATIBLE_TOOL_IDS.includes(initialToolId) ? initialToolId : 'compress-pdf'
  );
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [concurrencyMode, setConcurrencyMode] = useState<'parallel' | 'sequential'>('parallel');
  const [isRunningBatch, setIsRunningBatch] = useState<boolean>(false);
  const [bundlingZip, setBundlingZip] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string>('');

  // Shared Contextual Parameters for Selected Batch Tool
  const [rotationAngle, setRotationAngle] = useState<number>(90);
  const [watermarkText, setWatermarkText] = useState<string>('CONFIDENTIAL // VELLUM');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.22);
  const [watermarkRotation, setWatermarkRotation] = useState<number>(35);
  const [pageNumberPosition, setPageNumberPosition] = useState<
    'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-center'
  >('bottom-center');
  const [pageNumberFormat, setPageNumberFormat] = useState<'page-x-of-y' | 'numeric' | 'roman'>('page-x-of-y');
  const [headerLeft, setHeaderLeft] = useState<string>('Vellum Batch Spec');
  const [headerRight, setHeaderRight] = useState<string>('2026 Edition');
  const [footerLeft, setFooterLeft] = useState<string>('Verified Pipeline');
  const [footerRight, setFooterRight] = useState<string>('ISO-32000');
  const [cropMargin, setCropMargin] = useState<number>(36);

  // Password & Security Parameters (shared across batch)
  const [password, setPassword] = useState<string>('');
  const [protectOutputWithPassword, setProtectOutputWithPassword] = useState<boolean>(true);
  const [permissionPrint, setPermissionPrint] = useState<boolean>(true);
  const [permissionCopy, setPermissionCopy] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeTool: PdfToolDefinition =
    findToolById(selectedToolId) || findToolById('compress-pdf')!;

  const batchTools = BATCH_COMPATIBLE_TOOL_IDS.map((id) => findToolById(id)).filter(
    (t): t is PdfToolDefinition => Boolean(t)
  );

  // Initialize queue if initialFiles were passed
  useEffect(() => {
    if (initialFiles.length > 0 && queue.length === 0) {
      const items: BatchQueueItem[] = initialFiles.map((f) => ({
        id: `bq-${f.id}-${Math.random().toString(36).slice(2, 6)}`,
        fileItem: f,
        status: 'queued',
        progress: 0,
        stageLabel: 'Waiting in queue'
      }));
      setQueue(items);

      // Auto-select word-to-pdf if initial files are .docx
      const allWord = initialFiles.every((f) => f.name.toLowerCase().endsWith('.docx'));
      if (allWord && selectedToolId === 'compress-pdf') {
        setSelectedToolId('word-to-pdf');
        setProtectOutputWithPassword(true);
      }
    }
  }, [initialFiles, queue.length, selectedToolId]);

  const addFilesToBatchQueue = async (rawFiles: File[]) => {
    setErrorBanner('');
    const newQueueItems: BatchQueueItem[] = [];

    for (const f of rawFiles) {
      if (f.size > 50 * 1024 * 1024) {
        setErrorBanner(`Skipped "${f.name}": exceeds 50 MB operational safety limit.`);
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

      const uploadedItem: UploadedFileItem = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        file: f,
        name: f.name,
        size: f.type ? f.size : ab.byteLength,
        type: f.type || 'application/pdf',
        pageCount,
        isValidSignature: sig.isValid,
        signatureLabel: sig.detectedFormat,
        addedAt: Date.now(),
        arrayBuffer: ab
      };

      newQueueItems.push({
        id: `bq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileItem: uploadedItem,
        status: 'queued',
        progress: 0,
        stageLabel: 'Ready in queue'
      });
    }

    if (newQueueItems.length > 0) {
      // Auto-switch tool if user drops .docx files while a PDF-only tool is active
      const hasDocx = rawFiles.some((f) => f.name.toLowerCase().endsWith('.docx'));
      if (hasDocx && !CONVERT_TO_PDF_IDS.includes(selectedToolId)) {
        setSelectedToolId('word-to-pdf');
        setProtectOutputWithPassword(true);
      }
      setQueue((prev) => [...prev, ...newQueueItems]);
    }
  };

  // Sample 1: 3 Standard PDFs
  const handleLoadThreeSamplePdfs = async () => {
    setErrorBanner('');
    setQueue([]);
    const sample1 = await generateSamplePdfBytes('editorial-report');
    const sample2 = await generateSamplePdfBytes('comparison-v2');
    const sample3 = await generateSamplePdfBytes('editorial-report');

    const files = [
      new File([sample1.bytes as unknown as BlobPart], '01_Architecture_Spec_2026.pdf', {
        type: 'application/pdf'
      }),
      new File([sample2.bytes as unknown as BlobPart], '02_Quarterly_Security_Audit_RevB.pdf', {
        type: 'application/pdf'
      }),
      new File([sample3.bytes as unknown as BlobPart], '03_Infrastructure_Compliance_Summary.pdf', {
        type: 'application/pdf'
      })
    ];
    await addFilesToBatchQueue(files);
  };

  // Sample 2: 3 Word (.docx) Files Ready to Convert & Password-Protect in One Go
  const handleLoadThreeSampleWordFiles = async () => {
    setErrorBanner('');
    setQueue([]);
    setSelectedToolId('word-to-pdf');
    setProtectOutputWithPassword(true);
    if (!password) {
      setPassword('vellum2026');
    }

    const specs = [
      {
        name: '01_Executive_Contract_Draft.docx',
        title: 'Executive Service Agreement — 2026',
        body: 'This Microsoft Word (.docx) contract is queued for simultaneous batch conversion into a password-protected ISO-32000 PDF container.'
      },
      {
        name: '02_Engineering_Architecture_Notes.docx',
        title: 'Zero-Trust Systems Architecture Specification',
        body: 'Confidential engineering notes prepared in OpenXML Word format. Batch processing converts and applies SHA-256 access policies in a single pass.'
      },
      {
        name: '03_Board_Compensation_Schedule.docx',
        title: 'Q4 Compensation & Governance Schedule',
        body: 'Restricted distribution document. Converting multiple Word files with shared password protection ensures consistent security across the entire archive.'
      }
    ];

    const docxFiles: File[] = [];
    for (const item of specs) {
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: item.title,
                heading: HeadingLevel.HEADING_1
              }),
              new Paragraph({
                children: [new TextRun({ text: item.body, size: 24 })]
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Generated by Vellum Document Studio for multi-Word password protection testing.',
                    italics: true,
                    size: 20
                  })
                ]
              })
            ]
          }
        ]
      });
      const blob = await Packer.toBlob(doc);
      docxFiles.push(
        new File([blob], item.name, {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        })
      );
    }

    await addFilesToBatchQueue(docxFiles);
  };

  // Sample 3: 3 Password-Protected PDFs Ready to Unlock All in One Go
  const handleLoadThreeProtectedPdfsToUnlock = async () => {
    setErrorBanner('');
    setQueue([]);
    const sharedPass = 'vellum2026';
    setSelectedToolId('unlock-pdf');
    setPassword(sharedPass);

    const sample1 = await generateSamplePdfBytes('editorial-report');
    const sample2 = await generateSamplePdfBytes('comparison-v2');
    const sample3 = await generateSamplePdfBytes('editorial-report');

    const rawPdfs = [
      { bytes: sample1.bytes, name: '01_Locked_Financial_Statement.pdf' },
      { bytes: sample2.bytes, name: '02_Locked_Security_Clearance.pdf' },
      { bytes: sample3.bytes, name: '03_Locked_Board_Resolution.pdf' }
    ];

    const protectedFiles: File[] = [];
    for (const item of rawPdfs) {
      const f = new File([item.bytes as unknown as BlobPart], item.name, {
        type: 'application/pdf'
      });
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
      protectedFiles.push(
        new File([protectedRes.outputBytes as unknown as BlobPart], protectedRes.outputFileName, {
          type: 'application/pdf'
        })
      );
    }

    await addFilesToBatchQueue(protectedFiles);
  };

  // Process a single queue item and update its individual progress bar in state
  const processSingleQueueItem = async (item: BatchQueueItem) => {
    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? {
              ...q,
              status: 'processing',
              progress: 8,
              stageLabel: 'Initializing document stream...',
              errorMessage: undefined
            }
          : q
      )
    );

    try {
      const options: ToolExecutionOptions = {
        rotationAngle,
        watermarkText,
        watermarkOpacity,
        watermarkRotation,
        pageNumberPosition,
        pageNumberFormat,
        headerLeft,
        headerRight,
        footerLeft,
        footerRight,
        cropMarginTop: cropMargin,
        cropMarginBottom: cropMargin,
        cropMarginLeft: cropMargin,
        cropMarginRight: cropMargin,
        password,
        protectOutputWithPassword:
          CONVERT_TO_PDF_IDS.includes(selectedToolId) && protectOutputWithPassword,
        permissionPrint,
        permissionCopy,
        onProgress: (stage, pct) => {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    progress: Math.max(10, Math.min(99, pct)),
                    stageLabel: stage
                  }
                : q
            )
          );
        }
      };

      const res = await executePdfTool(selectedToolId, [item.fileItem], options);

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'completed',
                progress: 100,
                stageLabel: 'Verified & Completed',
                result: res
              }
            : q
        )
      );

      onRecordHistory(
        selectedToolId,
        `Batch: ${activeTool.shortName}`,
        item.fileItem.name,
        res.outputFileName,
        res.outputSize,
        res.summary
      );
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                status: 'error',
                progress: 100,
                stageLabel: 'Processing Failed',
                errorMessage: err?.message || 'Error processing document'
              }
            : q
        )
      );
    }
  };

  const handleRunBatchQueue = async () => {
    const pendingItems = queue.filter((q) => q.status === 'queued' || q.status === 'error');
    const itemsToProcess = pendingItems.length > 0 ? pendingItems : queue;
    if (itemsToProcess.length === 0) return;

    if (
      CONVERT_TO_PDF_IDS.includes(selectedToolId) &&
      protectOutputWithPassword &&
      !password.trim()
    ) {
      setErrorBanner(
        'Please enter a password in Step 03 to password-protect all converted PDFs in one go (or uncheck the password protection toggle).'
      );
      return;
    }

    if (
      (selectedToolId === 'protect-pdf' || selectedToolId === 'unlock-pdf') &&
      !password.trim()
    ) {
      setErrorBanner(
        selectedToolId === 'protect-pdf'
          ? 'Please enter a password in Step 03 to protect all PDFs in one go.'
          : 'Please enter the document password in Step 03 to unlock all PDFs in one go.'
      );
      return;
    }

    setIsRunningBatch(true);
    setErrorBanner('');

    // Reset any already-completed items if re-running all
    if (pendingItems.length === 0) {
      setQueue((prev) =>
        prev.map((q) => ({
          ...q,
          status: 'queued',
          progress: 0,
          stageLabel: 'Queued for batch execution',
          result: undefined,
          errorMessage: undefined
        }))
      );
    }

    try {
      if (concurrencyMode === 'parallel') {
        await Promise.all(itemsToProcess.map((item) => processSingleQueueItem(item)));
      } else {
        for (const item of itemsToProcess) {
          await processSingleQueueItem(item);
        }
      }
    } finally {
      setIsRunningBatch(false);
    }
  };

  const handleResetQueueStatuses = () => {
    setQueue((prev) =>
      prev.map((q) => ({
        ...q,
        status: 'queued',
        progress: 0,
        stageLabel: 'Ready in queue',
        result: undefined,
        errorMessage: undefined
      }))
    );
  };

  const triggerDownloadSingle = (item: BatchQueueItem) => {
    if (!item.result) return;
    const blob = new Blob([item.result.outputBytes as unknown as BlobPart], {
      type: item.result.outputMimeType
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.result.outputFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllAsZip = async () => {
    const completed = queue.filter((q) => q.status === 'completed' && q.result);
    if (completed.length === 0) return;
    setBundlingZip(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();

      for (const item of completed) {
        const res = item.result!;
        let fileName = res.outputFileName;
        if (usedNames.has(fileName)) {
          const dotIdx = fileName.lastIndexOf('.');
          fileName =
            dotIdx > 0
              ? `${fileName.slice(0, dotIdx)}_${item.id.slice(-4)}${fileName.slice(dotIdx)}`
              : `${fileName}_${item.id.slice(-4)}`;
        }
        usedNames.add(fileName);
        zip.file(fileName, res.outputBytes);
      }

      const zipBytes = await zip.generateAsync({ type: 'uint8array' });
      const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Vellum_Batch_${selectedToolId}_${completed.length}_files.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBundlingZip(false);
    }
  };

  // Aggregate Batch Telemetry
  const totalCount = queue.length;
  const completedCount = queue.filter((q) => q.status === 'completed').length;
  const processingCount = queue.filter((q) => q.status === 'processing').length;
  const errorCount = queue.filter((q) => q.status === 'error').length;
  const overallProgress =
    totalCount > 0
      ? Math.round(queue.reduce((acc, q) => acc + q.progress, 0) / totalCount)
      : 0;

  const totalInputBytes = queue.reduce((acc, q) => acc + q.fileItem.size, 0);
  const totalOutputBytes = queue.reduce(
    (acc, q) => acc + (q.result ? q.result.outputSize : 0),
    0
  );

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
      {/* Header Bar */}
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
              <span>Multi-Document Pipeline</span>
              <span aria-hidden="true">·</span>
              <span>Word → Protected PDF in One Go</span>
              <span aria-hidden="true">·</span>
              <span>Bulk PDF Password Unlock</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-theme-primary mt-0.5 flex items-center gap-2.5">
              <Layers2 className="w-6 h-6 text-theme-accent" />
              <span>Batch Processing Queue</span>
            </h1>
          </div>
        </div>

        {/* 1-Click Preset Workflows */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadThreeSampleWordFiles}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-theme-accent" />
            3 Word (.docx) → Password-Protected PDFs
          </button>

          <button
            type="button"
            onClick={handleLoadThreeProtectedPdfsToUnlock}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
          >
            <Unlock className="w-3.5 h-3.5 text-emerald-400" />
            3 Locked PDFs → Remove Password in One Go
          </button>

          <button
            type="button"
            onClick={handleLoadThreeSamplePdfs}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-accent cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
            3 Sample PDFs
          </button>
        </div>
      </div>

      {/* Interactive Three.js 3D Batch Pipeline Visualizer */}
      <ThreeWorkspaceBanner
        title={`Batch Queue: ${activeTool.shortName}`}
        subtitle={`${queue.length} File(s) Queued · Drag to Orbit 3D Document Folios`}
        mode="batch"
        fileCount={queue.length}
        completedCount={completedCount}
        isProcessing={isRunningBatch}
        progressPercent={overallProgress}
        isPasswordLocked={
          (CONVERT_TO_PDF_IDS.includes(selectedToolId) && protectOutputWithPassword) ||
          selectedToolId === 'protect-pdf'
        }
      />

      {errorBanner && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-xs text-rose-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Main 12-Column Batch Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT 4 COLUMNS: Tool Selection, Parameters & Concurrency Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="p-6 rounded-xl bg-theme-surface border border-theme-subtle space-y-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-theme-secondary">
                01. Select Tool to Apply to All Files
              </label>
              <select
                value={selectedToolId}
                onChange={(e) => {
                  setSelectedToolId(e.target.value);
                  handleResetQueueStatuses();
                }}
                className="w-full px-3.5 py-2.5 rounded-lg bg-theme-elevated border border-theme-strong text-sm font-bold text-theme-primary focus:outline-none focus:border-theme-accent"
              >
                {batchTools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.outputExtension})
                  </option>
                ))}
              </select>
              <p className="text-xs text-theme-secondary pt-1 leading-relaxed">
                {activeTool.description}
              </p>
            </div>

            {/* Execution Concurrency Mode */}
            <div className="space-y-2 pt-3 border-t border-theme-subtle">
              <label className="block text-xs font-bold uppercase tracking-wider text-theme-secondary">
                02. Queue Execution Mode
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setConcurrencyMode('parallel')}
                  className={`py-2 px-3 rounded-lg border cursor-pointer ${
                    concurrencyMode === 'parallel'
                      ? 'bg-theme-accent text-white border-transparent'
                      : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                  }`}
                >
                  Simultaneous (Parallel)
                </button>
                <button
                  type="button"
                  onClick={() => setConcurrencyMode('sequential')}
                  className={`py-2 px-3 rounded-lg border cursor-pointer ${
                    concurrencyMode === 'sequential'
                      ? 'bg-theme-accent text-white border-transparent'
                      : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                  }`}
                >
                  Sequential (1-by-1)
                </button>
              </div>
            </div>

            {/* Contextual Tool Options */}
            <div className="space-y-3 pt-3 border-t border-theme-subtle text-xs">
              <div className="font-bold uppercase tracking-wider text-theme-secondary">
                03. Operation &amp; Security Parameters
              </div>

              {/* Word-to-PDF / Convert-to-PDF: Option to Password-Protect All Output PDFs in One Go */}
              {CONVERT_TO_PDF_IDS.includes(selectedToolId) && (
                <div className="p-3.5 rounded-xl bg-theme-elevated border border-theme-strong space-y-3">
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
                        Password-Protect All Output PDFs in One Go
                      </span>
                      <span className="block text-[11px] text-theme-secondary mt-0.5">
                        Convert every uploaded {selectedToolId === 'word-to-pdf' ? 'Word (.docx)' : 'source'} file and lock all resulting PDFs with a single shared password.
                      </span>
                    </div>
                  </label>

                  {protectOutputWithPassword && (
                    <div className="space-y-2.5 pt-2 border-t border-theme-subtle">
                      <div>
                        <label className="block font-semibold text-theme-secondary mb-1">
                          Shared Output PDF Password
                        </label>
                        <input
                          type="text"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password to lock all output PDFs..."
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
                          <span>Allow Printing on Protected PDFs</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={permissionCopy}
                            onChange={(e) => setPermissionCopy(e.target.checked)}
                          />
                          <span>Allow Text &amp; Graphic Extraction</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Protect PDF / Unlock Multiple PDFs in One Go */}
              {(selectedToolId === 'protect-pdf' || selectedToolId === 'unlock-pdf') && (
                <div className="p-3.5 rounded-xl bg-theme-elevated border border-theme-strong space-y-3">
                  <div>
                    <label className="block font-bold text-theme-primary mb-1 flex items-center gap-1.5">
                      {selectedToolId === 'protect-pdf' ? (
                        <>
                          <Lock className="w-3.5 h-3.5 text-theme-accent" />
                          <span>Password to Lock All PDFs in One Go</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Password to Unlock All PDFs in One Go</span>
                        </>
                      )}
                    </label>
                    <p className="text-[11px] text-theme-secondary mb-2">
                      {selectedToolId === 'protect-pdf'
                        ? 'Enter the password once to apply SHA-256 protection to every PDF in the queue.'
                        : 'Enter the document password once to remove password restrictions from all queued PDFs simultaneously.'}
                    </p>
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        selectedToolId === 'protect-pdf'
                          ? 'Enter password to protect all...'
                          : 'Enter password to unlock all...'
                      }
                      className="w-full px-3 py-2 rounded-lg bg-theme-surface border border-theme-subtle text-theme-primary font-mono"
                    />
                  </div>
                  {selectedToolId === 'protect-pdf' && (
                    <div className="space-y-1 pt-1 border-t border-theme-subtle">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissionPrint}
                          onChange={(e) => setPermissionPrint(e.target.checked)}
                        />
                        <span>Allow Printing</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissionCopy}
                          onChange={(e) => setPermissionCopy(e.target.checked)}
                        />
                        <span>Allow Copying</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {selectedToolId === 'rotate-pages' && (
                <div className="grid grid-cols-3 gap-2 font-mono">
                  {[90, 180, 270].map((ang) => (
                    <button
                      key={ang}
                      type="button"
                      onClick={() => setRotationAngle(ang)}
                      className={`py-2 rounded-lg border font-semibold cursor-pointer ${
                        rotationAngle === ang
                          ? 'bg-theme-accent text-white border-transparent'
                          : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                      }`}
                    >
                      +{ang}°
                    </button>
                  ))}
                </div>
              )}

              {selectedToolId === 'watermark-pdf' && (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-theme-secondary mb-1">Watermark Text</label>
                    <input
                      type="text"
                      value={watermarkText}
                      onChange={(e) => setWatermarkText(e.target.value)}
                      className="w-full px-3 py-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div>
                      <label className="block text-theme-secondary mb-1">Opacity</label>
                      <input
                        type="number"
                        step={0.05}
                        min={0.05}
                        max={1}
                        value={watermarkOpacity}
                        onChange={(e) => setWatermarkOpacity(Number(e.target.value) || 0.22)}
                        className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                      />
                    </div>
                    <div>
                      <label className="block text-theme-secondary mb-1">Angle (°)</label>
                      <input
                        type="number"
                        value={watermarkRotation}
                        onChange={(e) => setWatermarkRotation(Number(e.target.value) || 35)}
                        className="w-full px-2.5 py-1.5 rounded bg-theme-elevated border border-theme-subtle"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedToolId === 'page-numbers' && (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-theme-secondary mb-1">Position</label>
                    <select
                      value={pageNumberPosition}
                      onChange={(e) => setPageNumberPosition(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary"
                    >
                      <option value="bottom-center">Bottom Center</option>
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="top-center">Top Center</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-theme-secondary mb-1">Format</label>
                    <select
                      value={pageNumberFormat}
                      onChange={(e) => setPageNumberFormat(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-primary"
                    >
                      <option value="page-x-of-y">Page 1 of N</option>
                      <option value="numeric">1, 2, 3</option>
                      <option value="roman">i, ii, iii (Roman)</option>
                    </select>
                  </div>
                </div>
              )}

              {selectedToolId === 'header-footer' && (
                <div className="grid grid-cols-2 gap-2">
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

              {selectedToolId === 'crop-pdf' && (
                <div>
                  <label className="block text-theme-secondary mb-1">
                    Uniform Trim Margin (pt)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={150}
                    value={cropMargin}
                    onChange={(e) => setCropMargin(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 rounded bg-theme-elevated border border-theme-subtle font-mono"
                  />
                </div>
              )}

              {![
                ...CONVERT_TO_PDF_IDS,
                'rotate-pages',
                'watermark-pdf',
                'page-numbers',
                'header-footer',
                'crop-pdf',
                'protect-pdf',
                'unlock-pdf'
              ].includes(selectedToolId) && (
                <p className="text-theme-muted">
                  Automatic ISO-32000 optimization and stream validation parameters are pre-configured for {activeTool.name}.
                </p>
              )}
            </div>

            {/* Primary Batch Action Button */}
            <button
              type="button"
              disabled={queue.length === 0 || isRunningBatch}
              onClick={handleRunBatchQueue}
              className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-theme-accent text-white hover:opacity-95 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              {isRunningBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Batch ({completedCount}/{totalCount})...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>
                    {CONVERT_TO_PDF_IDS.includes(selectedToolId) && protectOutputWithPassword
                      ? `Convert & Password-Protect All (${queue.length})`
                      : selectedToolId === 'unlock-pdf'
                      ? `Unlock All PDFs in One Go (${queue.length})`
                      : `Apply ${activeTool.shortName} to All (${queue.length})`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT 8 COLUMNS: Multi-File Upload Dropzone, Live Per-File Progress Queue & Bulk ZIP Download */}
        <div className="lg:col-span-8 space-y-6">
          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) {
                addFilesToBatchQueue(Array.from(e.dataTransfer.files));
              }
            }}
            className="p-6 rounded-xl border-2 border-dashed border-theme-strong bg-theme-surface/70 hover:border-theme-accent transition-colors flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.csv,.pptx,.html,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  addFilesToBatchQueue(Array.from(e.target.files));
                }
                e.target.value = '';
              }}
            />
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-theme-elevated border border-theme-subtle flex items-center justify-center text-theme-accent shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-theme-primary">
                  Drop Multiple Word (.docx), PDF, or Office Files Here
                </h2>
                <p className="text-xs text-theme-secondary mt-0.5">
                  Convert &amp; password-protect multiple Word files at once, or unlock multiple password-protected PDFs in one go
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-theme-accent text-white hover:opacity-95 cursor-pointer"
              >
                + Add Files
              </button>
            </div>
          </div>

          {/* Aggregate Batch Telemetry & Download All ZIP Header */}
          {queue.length > 0 && (
            <div className="p-5 rounded-xl bg-theme-surface border border-theme-subtle space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-theme-secondary">
                    <span className="font-bold text-theme-primary">
                      Queue Progress: {overallProgress}%
                    </span>
                    <span>·</span>
                    <span>{completedCount} Completed</span>
                    <span>·</span>
                    <span>{processingCount} Active</span>
                    {errorCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-rose-400">{errorCount} Failed</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-theme-muted">
                    Total Input: {(totalInputBytes / 1024).toFixed(1)} KB
                    {totalOutputBytes > 0 &&
                      ` → Total Output: ${(totalOutputBytes / 1024).toFixed(1)} KB`}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {completedCount > 0 && (
                    <button
                      type="button"
                      disabled={bundlingZip}
                      onClick={handleDownloadAllAsZip}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-colors cursor-pointer shadow-xs"
                    >
                      <FolderArchive className="w-4 h-4" />
                      {bundlingZip
                        ? 'Packaging ZIP...'
                        : `Download All Completed (${completedCount}) as .ZIP`}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isRunningBatch}
                    onClick={handleResetQueueStatuses}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary disabled:opacity-40 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Status
                  </button>

                  <button
                    type="button"
                    disabled={isRunningBatch}
                    onClick={() => setQueue([])}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All
                  </button>
                </div>
              </div>

              {/* Overall Batch Progress Bar */}
              <div className="w-full h-2 rounded-full bg-theme-muted overflow-hidden">
                <div
                  style={{ width: `${overallProgress}%` }}
                  className="h-full bg-theme-accent transition-all duration-200"
                />
              </div>
            </div>
          )}

          {/* Individual Per-File Queue Cards with Per-File Progress Indicators */}
          {queue.length === 0 ? (
            <div className="p-12 rounded-xl bg-theme-surface border border-theme-subtle text-center space-y-4">
              <ToolIcon name={activeTool.iconName} className="w-8 h-8 text-theme-accent mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-theme-primary">
                  Your Batch Processing Queue is Empty
                </h3>
                <p className="text-xs text-theme-secondary max-w-lg mx-auto">
                  Upload multiple Word (.docx) files to convert and password-protect all of them in one go, or upload multiple password-protected PDFs to unlock them simultaneously.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleLoadThreeSampleWordFiles}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-theme-accent" />
                  Try: 3 Word Files → Protected PDFs
                </button>
                <button
                  type="button"
                  onClick={handleLoadThreeProtectedPdfsToUnlock}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                  Try: 3 Locked PDFs → Unlock All
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map((item, idx) => {
                const isDone = item.status === 'completed' && item.result;
                const isErr = item.status === 'error';
                const isProc = item.status === 'processing';

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isDone
                        ? 'bg-theme-elevated border-emerald-500/40'
                        : isErr
                        ? 'bg-rose-500/5 border-rose-500/40'
                        : isProc
                        ? 'bg-theme-elevated border-theme-accent'
                        : 'bg-theme-surface border-theme-subtle'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Status Icon */}
                        <div className="shrink-0">
                          {isDone ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : isErr ? (
                            <AlertTriangle className="w-5 h-5 text-rose-400" />
                          ) : isProc ? (
                            <Loader2 className="w-5 h-5 text-theme-accent animate-spin" />
                          ) : (
                            <Clock className="w-5 h-5 text-theme-muted" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-bold text-theme-primary truncate">
                            <span className="font-mono text-xs text-theme-muted">
                              #{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="truncate">{item.fileItem.name}</span>
                          </div>
                          <div className="text-xs font-mono tabular-nums text-theme-secondary mt-0.5">
                            {(item.fileItem.size / 1024).toFixed(1)} KB
                            {item.fileItem.pageCount ? ` · ${item.fileItem.pageCount} Pages` : ''}
                            {' · '}
                            <span>{item.fileItem.signatureLabel}</span>
                            {isDone && item.result && (
                              <>
                                {' → '}
                                <span className="text-emerald-400 font-semibold">
                                  {item.result.outputFileName} (
                                  {(item.result.outputSize / 1024).toFixed(1)} KB)
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Per-File Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono tabular-nums font-semibold text-theme-primary">
                          {item.progress}%
                        </span>

                        {isDone && (
                          <button
                            type="button"
                            onClick={() => triggerDownloadSingle(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                        )}

                        {isErr && (
                          <button
                            type="button"
                            onClick={() => processSingleQueueItem(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Retry
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isProc}
                          onClick={() =>
                            setQueue((prev) => prev.filter((q) => q.id !== item.id))
                          }
                          aria-label={`Remove ${item.fileItem.name} from queue`}
                          className="p-1.5 rounded-lg text-theme-muted hover:text-rose-400 hover:bg-theme-muted disabled:opacity-30 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Per-File Progress Bar & Live Stage Caption */}
                    <div className="space-y-1.5">
                      <div className="w-full h-2 rounded-full bg-theme-muted overflow-hidden">
                        <div
                          style={{ width: `${item.progress}%` }}
                          className={`h-full transition-all duration-150 ${
                            isDone
                              ? 'bg-emerald-500'
                              : isErr
                              ? 'bg-rose-500'
                              : 'bg-theme-accent'
                          }`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className={isErr ? 'text-rose-400' : 'text-theme-secondary'}>
                          {isErr ? item.errorMessage : item.stageLabel}
                        </span>
                        <span className="text-theme-muted uppercase">{item.status}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
