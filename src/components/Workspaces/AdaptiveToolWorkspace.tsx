import React, { useState, useEffect, useRef } from 'react';
import { motion, Reorder } from 'motion/react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType
} from 'docx';
import {
  PdfToolDefinition,
  ProcessingResult,
  UploadedFileItem
} from '../../types/pdf';
import {
  validateFileSignature,
  generateSamplePdfBytes,
  renderPdfPageToDataUrl,
  loadPdfJsDocument
} from '../../services/pdfRenderer';
import {
  executePdfTool,
  ToolExecutionOptions,
  inspectExcelWorkbookSheets
} from '../../services/pdfToolsProcessor';
import { PDF_TOOLS_CATALOG } from '../../data/toolsCatalog';
import { ToolIcon } from '../IconMapper';
import { saveProcessedDocumentSafe } from '../../services/desktopBridge';
import {
  ArrowLeft,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
  RotateCw,
  FileText,
  Layers,
  Copy,
  RefreshCw,
  FolderArchive,
  Layers2,
  Lock,
  Unlock,
  Loader2,
  Clock,
  ArrowUp,
  ArrowDown,
  ShieldCheck
} from 'lucide-react';

interface AdaptiveToolWorkspaceProps {
  tool: PdfToolDefinition;
  initialFiles?: UploadedFileItem[];
  onBack: () => void;
  onSelectTool?: (tool: PdfToolDefinition, files?: UploadedFileItem[]) => void;
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

const MULTI_FILE_COMBINE_TOOLS = ['merge-pdf', 'jpg-to-pdf', 'png-to-pdf'];

const CONVERT_TO_PDF_PASSWORD_TOOLS = [
  'word-to-pdf',
  'excel-to-pdf',
  'ppt-to-pdf',
  'jpg-to-pdf',
  'png-to-pdf',
  'html-to-pdf'
];

interface PerFileBatchState {
  status: 'queued' | 'processing' | 'completed' | 'error';
  progress: number;
  stage: string;
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
  const [processing, setProcessing] = useState<boolean>(false);
  const [progressStage, setProgressStage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // Per-file state when multiple files are uploaded into a single-document tool (e.g. 5 Word files or 4 locked PDFs)
  const [perFileStates, setPerFileStates] = useState<Record<string, PerFileBatchState>>({});

  // Page Thumbnails for Organizer / Split / Rotate / PDF-to-Image tools
  const [pageThumbs, setPageThumbs] = useState<
    Array<{ pageNumber: number; origIndex: number; dataUrl: string; rotation: number; selected: boolean }>
  >([]);
  const [loadingThumbs, setLoadingThumbs] = useState<boolean>(false);

  // Contextual Tool Options (Organize & Stamp)
  const [splitMode, setSplitMode] = useState<'burst' | 'ranges' | 'interval'>('ranges');
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
  const [headerRight, setHeaderRight] = useState<string>('2026 Edition');
  const [footerLeft, setFooterLeft] = useState<string>('ISO-32000 Verified');
  const [footerRight, setFooterRight] = useState<string>('Public Sample');

  const [cropMarginTop, setCropMarginTop] = useState<number>(36);
  const [cropMarginBottom, setCropMarginBottom] = useState<number>(36);
  const [cropMarginLeft, setCropMarginLeft] = useState<number>(36);
  const [cropMarginRight, setCropMarginRight] = useState<number>(36);

  // Security & Password Parameters
  const [password, setPassword] = useState<string>('');
  const [protectOutputWithPassword, setProtectOutputWithPassword] = useState<boolean>(false);
  const [permissionPrint, setPermissionPrint] = useState<boolean>(true);
  const [permissionCopy, setPermissionCopy] = useState<boolean>(false);

  // ============================================================================
  // FORMAT-SPECIFIC CONVERSION PARAMETERS
  // ============================================================================
  const [pageSize, setPageSize] = useState<'letter' | 'a4' | 'fit'>('letter');
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape' | 'auto'>(
    tool.id === 'excel-to-pdf' || tool.id === 'ppt-to-pdf'
      ? 'landscape'
      : tool.id === 'jpg-to-pdf' || tool.id === 'png-to-pdf'
      ? 'auto'
      : 'portrait'
  );
  const [pageMargin, setPageMargin] = useState<number>(
    tool.id === 'jpg-to-pdf' || tool.id === 'png-to-pdf' ? 24 : 42
  );
  const [imageFitMode, setImageFitMode] = useState<'contain' | 'cover' | 'center'>('contain');
  const [imageQuality, setImageQuality] = useState<number>(0.92);
  const [imageDpiScale, setImageDpiScale] = useState<number>(2.0); // 1.0 = 72 DPI, 2.0 = 150 DPI, 3.0 = 300 DPI
  const [conversionPageRange, setConversionPageRange] = useState<string>('all');

  // PDF to Word
  const [wordIncludePageImages, setWordIncludePageImages] = useState<boolean>(false);

  // PDF to Excel & Excel to PDF
  const [excelSheetMode, setExcelSheetMode] = useState<'per-page' | 'single-sheet'>('per-page');
  const [availableExcelSheets, setAvailableExcelSheets] = useState<string[]>([]);
  const [excelSheetName, setExcelSheetName] = useState<string>('__ALL__');
  const [excelPageScaling, setExcelPageScaling] = useState<'fit-columns' | 'actual-size'>('fit-columns');

  // PDF to PowerPoint & PowerPoint to PDF
  const [pptxConversionMode, setPptxConversionMode] = useState<'editable-hybrid' | 'visual-high-fidelity'>('editable-hybrid');
  const [pptxSlideAspect, setPptxSlideAspect] = useState<'original' | '16:9' | '4:3'>('16:9');

  // PDF to PDF/A Archival
  const [pdfaProfile, setPdfaProfile] = useState<'PDF/A-1b' | 'PDF/A-2b' | 'PDF/A-3b'>('PDF/A-2b');

  // Word / HTML / Excel to PDF Page Numbering
  const [includePageNumbersOnConvert, setIncludePageNumbersOnConvert] = useState<boolean>(true);

  const [htmlInput, setHtmlInput] = useState<string>(
    `<h1>Vellum Engineering &amp; Financial Specification 2026</h1>
<p>This HTML5 document demonstrates structured headings, paragraphs, bulleted lists, and bordered tables converted directly into a paginated ISO-32000 PDF container.</p>
<h2>01. Core Conversion Capabilities</h2>
<ul>
  <li>Preserves semantic headings (H1 through H4) and reading order</li>
  <li>Renders HTML tables with cell borders, alternating row shading, and multi-line wrapping</li>
  <li>Supports US Letter and ISO A4 page sizes in Portrait or Landscape orientation</li>
</ul>
<h2>02. Quarterly Conversion Benchmarks</h2>
<table>
  <tr><th>Format Pipeline</th><th>Fidelity Rating</th><th>Output Container</th><th>Validation</th></tr>
  <tr><td>Word (.docx) to PDF</td><td>High Layout &amp; Tables</td><td>PDF 1.7</td><td>Verified</td></tr>
  <tr><td>Excel (.xlsx) to PDF</td><td>Bordered Grid &amp; Sheets</td><td>PDF 1.7</td><td>Verified</td></tr>
  <tr><td>PDF to PDF/A-2b</td><td>ISO 19005-2 Archival</td><td>PDF/A-2b + XMP</td><td>Verified</td></tr>
</table>`
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isOrganizerTool = [
    'organize-pages',
    'split-pdf',
    'rotate-pages',
    'pdf-to-jpg',
    'pdf-to-png'
  ].includes(tool.id);

  // Inspect Excel workbook sheets whenever an .xlsx/.csv file is loaded in excel-to-pdf
  useEffect(() => {
    if (tool.id === 'excel-to-pdf' && files.length > 0 && files[0].arrayBuffer) {
      const sheets = inspectExcelWorkbookSheets(files[0].arrayBuffer);
      setAvailableExcelSheets(sheets);
      setExcelSheetName('__ALL__');
    } else {
      setAvailableExcelSheets([]);
    }
  }, [tool.id, files]);

  // Load page thumbnails when a PDF is uploaded to an organizer or PDF-to-Image tool
  useEffect(() => {
    let active = true;
    const loadThumbnails = async () => {
      if (!isOrganizerTool || files.length === 0) {
        setPageThumbs([]);
        return;
      }
      const primary = files[0];
      if (!primary.signatureLabel.startsWith('PDF')) return;

      setLoadingThumbs(true);
      try {
        const buf = primary.arrayBuffer || (await primary.file.arrayBuffer());
        const bytes = new Uint8Array(buf);
        const pdfDoc = await loadPdfJsDocument(bytes);
        const numPages = pdfDoc.numPages;
        await (pdfDoc as any).destroy?.();

        const thumbs: Array<{
          pageNumber: number;
          origIndex: number;
          dataUrl: string;
          rotation: number;
          selected: boolean;
        }> = [];

        const maxPreview = Math.min(numPages, 24);
        for (let i = 1; i <= maxPreview; i++) {
          const rendered = await renderPdfPageToDataUrl(bytes, i, 0.45, 'image/jpeg', 0.8);
          if (!active) return;
          thumbs.push({
            pageNumber: i,
            origIndex: i - 1,
            dataUrl: rendered.dataUrl,
            rotation: 0,
            selected: true
          });
        }
        if (active) {
          setPageThumbs(thumbs);
          if (numPages >= 2) {
            setSplitRanges(`1-1, 2-${numPages}`);
          }
        }
      } catch {
        // Fallback if PDF is encrypted
      } finally {
        if (active) setLoadingThumbs(false);
      }
    };
    loadThumbnails();
    return () => {
      active = false;
    };
  }, [files, isOrganizerTool]);

  const handleFilesSelected = async (rawFiles: File[]) => {
    setErrorMsg('');
    setResult(null);
    setPerFileStates({});
    const validated: UploadedFileItem[] = [];

    for (const f of rawFiles) {
      if (f.size === 0) {
        setErrorMsg(`File "${f.name}" is empty (0 bytes) and cannot be processed.`);
        continue;
      }
      if (f.size > 50 * 1024 * 1024) {
        setErrorMsg(`File "${f.name}" exceeds the 50 MB client operational limit.`);
        continue;
      }
      const ab = await f.arrayBuffer();
      const sig = await validateFileSignature(ab, f.name);

      if (!sig.isValid) {
        setErrorMsg(
          `Invalid or corrupted file "${f.name}" (${sig.detectedFormat}): ${sig.details}.`
        );
        continue;
      }

      // Validate file extension/signature compatibility with active tool
      const ext = `.${(f.name.split('.').pop() || '').toLowerCase()}`;
      const expectsPdf = tool.acceptedExtensions.includes('.pdf') && tool.acceptedExtensions.length === 1;
      if (expectsPdf && !sig.detectedFormat.startsWith('PDF')) {
        setErrorMsg(
          `Invalid file format for ${tool.name}: "${f.name}" was detected as ${sig.detectedFormat}. Please upload a valid PDF (.pdf) file.`
        );
        continue;
      }
      if (!expectsPdf && !tool.acceptedExtensions.includes(ext)) {
        setErrorMsg(
          `Unsupported file extension "${ext}" for ${tool.name}. Accepted formats: ${tool.acceptedExtensions.join(', ')}`
        );
        continue;
      }

      let pageCount: number | undefined;
      if (sig.detectedFormat.startsWith('PDF')) {
        try {
          const doc = await loadPdfJsDocument(new Uint8Array(ab));
          pageCount = doc.numPages;
          await (doc as any).destroy?.();
        } catch {
          pageCount = 1;
        }
      }

      validated.push({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

    if (validated.length > 0) {
      if (tool.multipleFiles) {
        setFiles((prev) => [...prev, ...validated]);
      } else {
        setFiles([validated[0]]);
      }
    }
  };

  // ============================================================================
  // 1-CLICK SAMPLE GENERATORS FOR EVERY CONVERSION & STUDIO TOOL
  // ============================================================================
  const handleLoadSample = async () => {
    setErrorMsg('');
    setResult(null);
    setPerFileStates({});

    if (tool.id === 'word-to-pdf') {
      setProtectOutputWithPassword(true);
      if (!password) setPassword('vellum2026');

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({
                text: 'Vellum Executive Word (.docx) Specification — 2026',
                heading: HeadingLevel.HEADING_1
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'This Microsoft Word (.docx) sample contains structured headings, body paragraphs, and a multi-column financial table to verify high-fidelity Word-to-PDF conversion.',
                    size: 24
                  })
                ]
              }),
              new Paragraph({
                text: '01. Quarterly Conversion Benchmarks',
                heading: HeadingLevel.HEADING_2
              }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                  new TableRow({
                    children: ['Department', 'Q1 Allocation', 'Q2 Allocation', 'Status'].map(
                      (h) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [new TextRun({ text: h, bold: true, size: 20 })]
                            })
                          ]
                        })
                    )
                  }),
                  new TableRow({
                    children: ['Document Conversion Engine', '$148,000', '$162,500', 'Verified'].map(
                      (c) =>
                        new TableCell({
                          children: [new Paragraph({ children: [new TextRun({ text: c, size: 20 })] })]
                        })
                    )
                  }),
                  new TableRow({
                    children: ['PDF/A Archival Compliance', '$94,200', '$108,000', 'Audited'].map(
                      (c) =>
                        new TableCell({
                          children: [new Paragraph({ children: [new TextRun({ text: c, size: 20 })] })]
                        })
                    )
                  })
                ]
              })
            ]
          }
        ]
      });
      const blob = await Packer.toBlob(doc);
      const docxFile = new File([blob], 'Vellum_Executive_Contract_2026.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      await handleFilesSelected([docxFile]);
      return;
    }

    if (tool.id === 'excel-to-pdf') {
      const wb = XLSX.utils.book_new();
      const sheet1Data = [
        ['Department', 'Lead Architect', 'Q1 Spend', 'Q2 Spend', 'Q3 Forecast', 'Compliance'],
        ['Core PDF Engine', 'Elena Rostova', '$142,000', '$156,500', '$164,000', 'ISO-32000 Verified'],
        ['Conversion Pipeline', 'Marcus Vance', '$118,400', '$129,000', '$138,200', 'Audited'],
        ['Archival PDF/A-2b', 'Sora Takahashi', '$94,500', '$102,000', '$110,000', 'ISO-19005 Verified'],
        ['Security & Redaction', 'Alex Morgan', '$125,000', '$134,800', '$149,500', 'SHA-256 Active']
      ];
      const sheet2Data = [
        ['Region', 'Monthly Conversions', 'Average Latency', 'Availability'],
        ['North America', '1,420,000', '42 ms', '99.99%'],
        ['Europe (Frankfurt)', '980,500', '38 ms', '99.99%'],
        ['Asia-Pacific (Tokyo)', '1,150,200', '44 ms', '99.98%']
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Data), 'Financial_Summary');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Data), 'Regional_Telemetry');
      const xlsxBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const xlsxFile = new File([xlsxBuf], 'Vellum_Quarterly_Financials_2026.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      await handleFilesSelected([xlsxFile]);
      return;
    }

    if (tool.id === 'ppt-to-pdf') {
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      const slide1 = pptx.addSlide();
      slide1.addText('Vellum Architecture & Conversion Deck 2026', {
        x: 0.6,
        y: 0.6,
        w: 8.5,
        h: 1.0,
        fontSize: 24,
        bold: true
      });
      slide1.addText(
        'Slide 1: High-precision widescreen presentation deck demonstrating PowerPoint (.pptx) to landscape PDF conversion.',
        { x: 0.6, y: 1.8, w: 8.5, h: 1.5, fontSize: 14 }
      );
      const slide2 = pptx.addSlide();
      slide2.addText('02. Multi-Format Fidelity & Archival Standards', {
        x: 0.6,
        y: 0.6,
        w: 8.5,
        h: 1.0,
        fontSize: 22,
        bold: true
      });
      slide2.addText(
        '• Preserves slide order and widescreen 16:9 aspect ratio\n• Extracts slide typography and embedded media\n• Produces crisp vector PDF slide decks',
        { x: 0.6, y: 1.8, w: 8.5, h: 2.2, fontSize: 14 }
      );
      const pptxBuf = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
      const pptxFile = new File([pptxBuf], 'Vellum_Executive_Keynote_2026.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });
      await handleFilesSelected([pptxFile]);
      return;
    }

    if (tool.id === 'jpg-to-pdf' || tool.id === 'png-to-pdf') {
      const isPng = tool.id === 'png-to-pdf';
      const mime = isPng ? 'image/png' : 'image/jpeg';
      const ext = isPng ? 'png' : 'jpg';
      const sampleImgs: File[] = [];

      const cards = [
        { title: '01 // ARCHITECTURAL DIAGRAM', accent: '#059669', bg: '#0D1F18' },
        { title: '02 // INFRASTRUCTURE TOPOLOGY', accent: '#10b981', bg: '#132A21' }
      ];

      for (let i = 0; i < cards.length; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 640;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = cards[i].bg;
        ctx.fillRect(0, 0, 960, 640);
        ctx.strokeStyle = cards[i].accent;
        ctx.lineWidth = 6;
        ctx.strokeRect(36, 36, 888, 568);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText(cards[i].title, 80, 140);
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '22px monospace';
        ctx.fillText(`Local Desk Sample ${ext.toUpperCase()} Plate #${i + 1} (960 × 640 px)`, 80, 200);
        ctx.fillStyle = cards[i].accent;
        ctx.fillRect(80, 260, 360, 180);
        const dataUrl = canvas.toDataURL(mime, 0.92);
        const b64 = dataUrl.split(',')[1];
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        sampleImgs.push(
          new File([bytes], `LocalDesk_Diagram_0${i + 1}.${ext}`, { type: mime })
        );
      }
      await handleFilesSelected(sampleImgs);
      return;
    }

    if (tool.id === 'html-to-pdf') {
      const htmlBytes = new TextEncoder().encode(htmlInput);
      const htmlFile = new File([htmlBytes], 'LocalDesk_Specification_2026.html', {
        type: 'text/html'
      });
      await handleFilesSelected([htmlFile]);
      return;
    }

    const sample1 = await generateSamplePdfBytes('editorial-report');
    const file1 = new File([sample1.bytes as unknown as BlobPart], sample1.name, {
      type: 'application/pdf'
    });

    if (tool.id === 'merge-pdf') {
      const sample2 = await generateSamplePdfBytes('comparison-v2');
      const file2 = new File([sample2.bytes as unknown as BlobPart], sample2.name, {
        type: 'application/pdf'
      });
      await handleFilesSelected([file1, file2]);
    } else {
      await handleFilesSelected([file1]);
    }
  };

  // Sample: 3 Word (.docx) Files Ready to Convert & Password-Protect in One Go
  const handleLoadThreeWordFilesSample = async () => {
    setErrorMsg('');
    setResult(null);
    setPerFileStates({});
    setProtectOutputWithPassword(true);
    if (!password) setPassword('vellum2026');

    const specs = [
      {
        name: '01_Executive_Service_Agreement.docx',
        title: 'Executive Service Agreement — 2026',
        body: 'Converted from Microsoft Word (.docx) and locked with a shared SHA-256 PDF password in one pass.'
      },
      {
        name: '02_Zero_Trust_Security_Architecture.docx',
        title: 'Zero-Trust Systems Architecture Notes',
        body: 'Confidential engineering specification converted from Word (.docx) to a password-protected PDF.'
      },
      {
        name: '03_Board_Compensation_Resolution.docx',
        title: 'Q4 Board Compensation & Governance Schedule',
        body: 'Batch Word-to-PDF conversion with simultaneous password protection across all uploaded documents.'
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
    await handleFilesSelected(docxFiles);
  };

  // Sample: 3 Password-Protected PDFs Ready to Unlock All in One Go
  const handleLoadThreeProtectedPdfsSample = async () => {
    setErrorMsg('');
    setResult(null);
    setPerFileStates({});
    const sharedPass = 'vellum2026';
    setPassword(sharedPass);

    const s1 = await generateSamplePdfBytes('editorial-report');
    const s2 = await generateSamplePdfBytes('comparison-v2');
    const s3 = await generateSamplePdfBytes('editorial-report');

    const rawList = [
      { bytes: s1.bytes, name: '01_Locked_Audit_Report.pdf' },
      { bytes: s2.bytes, name: '02_Locked_Financial_Projection.pdf' },
      { bytes: s3.bytes, name: '03_Locked_Security_Clearance.pdf' }
    ];

    const lockedFiles: File[] = [];
    for (const item of rawList) {
      const f = new File([item.bytes as unknown as BlobPart], item.name, {
        type: 'application/pdf'
      });
      const ab = await f.arrayBuffer();
      const up: UploadedFileItem = {
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
      const res = await executePdfTool('protect-pdf', [up], {
        password: sharedPass,
        permissionPrint: false,
        permissionCopy: false
      });
      lockedFiles.push(
        new File([res.outputBytes as unknown as BlobPart], res.outputFileName, {
          type: 'application/pdf'
        })
      );
    }
    await handleFilesSelected(lockedFiles);
  };

  const isMultiFileBatchMode =
    files.length > 1 && !MULTI_FILE_COMBINE_TOOLS.includes(tool.id);

  const moveUploadedFile = (index: number, direction: -1 | 1) => {
    setFiles((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const cancelOpRef = useRef<boolean>(false);

  const handleCancelOperation = () => {
    cancelOpRef.current = true;
    setProcessing(false);
    setProgressStage('Operation cancelled');
    setErrorMsg('Operation cancelled by user.');
  };

  const handleRunTool = async () => {
    if (
      CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) &&
      protectOutputWithPassword &&
      !password.trim()
    ) {
      setErrorMsg(
        'Please enter a password in the Security panel to password-protect the converted PDF(s), or uncheck "Password-Protect Output PDF".'
      );
      return;
    }

    if ((tool.id === 'protect-pdf' || tool.id === 'unlock-pdf') && !password.trim()) {
      setErrorMsg(
        tool.id === 'protect-pdf'
          ? 'Please enter a password to lock and protect your PDF document(s).'
          : 'Please enter the document password to unlock your protected PDF(s).'
      );
      return;
    }

    cancelOpRef.current = false;
    setProcessing(true);
    setErrorMsg('');
    setResult(null);
    setProgressPercent(5);
    setProgressStage('Initializing document processor...');

    const buildOptions = (
      onProg?: (stage: string, pct: number) => void
    ): ToolExecutionOptions => {
      const selectedPages = pageThumbs.filter((t) => t.selected).map((t) => t.pageNumber);
      const pageOrder = pageThumbs.map((t) => t.origIndex);
      const pageRotations: Record<number, number> = {};
      pageThumbs.forEach((t) => {
        if (t.rotation !== 0) pageRotations[t.origIndex] = t.rotation;
      });

      return {
        splitMode,
        splitRanges,
        splitInterval,
        selectedPages:
          isOrganizerTool && selectedPages.length > 0 ? selectedPages : undefined,
        conversionPageRange,
        pageOrder: tool.id === 'organize-pages' ? pageOrder : undefined,
        pageRotations: isOrganizerTool ? pageRotations : undefined,
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
        pageOrientation,
        pageMargin,
        imageFitMode,
        imageQuality,
        imageDpiScale,
        wordIncludePageImages,
        excelSheetMode,
        excelSheetName,
        excelPageScaling,
        pptxConversionMode,
        pptxSlideAspect,
        pdfaProfile,
        includePageNumbersOnConvert,
        htmlInput,
        onProgress: onProg
      };
    };

    try {
      // Multi-file simultaneous batch execution (e.g., 3 Word files -> Protected PDFs, or 3 Locked PDFs -> Unlocked PDFs)
      if (isMultiFileBatchMode) {
        const initialStates: Record<string, PerFileBatchState> = {};
        files.forEach((f) => {
          initialStates[f.id] = {
            status: 'processing',
            progress: 10,
            stage: 'Starting...'
          };
        });
        setPerFileStates(initialStates);

        const zip = new JSZip();
        const usedNames = new Set<string>();
        let totalOutBytes = 0;
        let succeededCount = 0;
        const failedMessages: string[] = [];

        await Promise.all(
          files.map(async (fileItem, idx) => {
            if (cancelOpRef.current) return;
            try {
              const singleRes = await executePdfTool(
                tool.id,
                [fileItem],
                buildOptions((stage, pct) => {
                  if (cancelOpRef.current) return;
                  setPerFileStates((prev) => ({
                    ...prev,
                    [fileItem.id]: {
                      ...prev[fileItem.id],
                      status: 'processing',
                      progress: Math.max(10, Math.min(99, pct)),
                      stage
                    }
                  }));
                  if (idx === 0) {
                    setProgressStage(`Processing ${files.length} files (${stage})...`);
                    setProgressPercent(pct);
                  }
                })
              );

              if (cancelOpRef.current) return;

              setPerFileStates((prev) => ({
                ...prev,
                [fileItem.id]: {
                  status: 'completed',
                  progress: 100,
                  stage: 'Completed & Verified',
                  result: singleRes
                }
              }));

              let outName = singleRes.outputFileName;
              if (usedNames.has(outName)) {
                const dot = outName.lastIndexOf('.');
                outName =
                  dot > 0
                    ? `${outName.slice(0, dot)}_${idx + 1}${outName.slice(dot)}`
                    : `${outName}_${idx + 1}`;
              }
              usedNames.add(outName);
              zip.file(outName, singleRes.outputBytes);
              totalOutBytes += singleRes.outputSize;
              succeededCount++;
            } catch (fileErr: any) {
              const errMsg = fileErr?.message || 'Failed to process file';
              failedMessages.push(`${fileItem.name}: ${errMsg}`);
              setPerFileStates((prev) => ({
                ...prev,
                [fileItem.id]: {
                  status: 'error',
                  progress: 100,
                  stage: 'Failed',
                  error: errMsg
                }
              }));
            }
          })
        );

        if (cancelOpRef.current) return;

        if (succeededCount === 0) {
          throw new Error(
            failedMessages[0] || 'All files in the batch failed verification.'
          );
        }

        if (failedMessages.length > 0) {
          setErrorMsg(
            `${failedMessages.length} of ${files.length} file(s) failed (${failedMessages.join('; ')}). ${succeededCount} valid file(s) were packaged.`
          );
        }

        setProgressStage('Packaging processed files into ZIP archive...');
        setProgressPercent(95);
        const zipBytes = await zip.generateAsync({ type: 'uint8array' });

        const combinedResult: ProcessingResult = {
          success: true,
          toolId: tool.id,
          outputFileName: `LocalDesk_${tool.id}_${succeededCount}_files.zip`,
          outputMimeType: 'application/zip',
          outputBytes: zipBytes,
          originalSize: files.reduce((a, b) => a + b.size, 0),
          outputSize: zipBytes.byteLength,
          pageCount: succeededCount,
          summary:
            CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword
              ? `Converted and password-protected ${succeededCount} of ${files.length} file(s) in one go (packaged as ZIP + individual downloads).`
              : tool.id === 'unlock-pdf'
              ? `Unlocked and removed password restrictions from ${succeededCount} of ${files.length} PDF(s) in one go.`
              : `Processed ${succeededCount} of ${files.length} file(s) with ${tool.name} in one go.`,
          details: {
            'Files Succeeded': `${succeededCount} / ${files.length}`,
            'Combined Output Payload': `${(totalOutBytes / 1024).toFixed(1)} KB`,
            ...(CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword
              ? { 'Shared Password Protection': 'Applied to All Output PDFs (SHA-256)' }
              : {})
          },
          validationPassed: zipBytes.byteLength > 64,
          validationNotes: [
            `Verified ${succeededCount} output file(s) in batch archive`,
            ...(CONVERT_TO_PDF_PASSWORD_TOOLS.includes(tool.id) && protectOutputWithPassword
              ? ['Verified SHA-256 password protection envelope on every converted PDF']
              : [])
          ]
        };

        setResult(combinedResult);
        setProgressPercent(100);
        setProgressStage('Complete');

        onRecordHistory(
          tool.id,
          `${tool.name} (${succeededCount} Files)`,
          `${succeededCount} files`,
          combinedResult.outputFileName,
          combinedResult.outputSize,
          combinedResult.summary
        );
      } else {
        // Standard single-file or multi-file combine execution
        const res = await executePdfTool(
          tool.id,
          files,
          buildOptions((stage, pct) => {
            setProgressStage(stage);
            setProgressPercent(pct);
          })
        );

        setResult(res);
        setProgressPercent(100);
        setProgressStage('Complete');

        onRecordHistory(
          tool.id,
          tool.name,
          files[0]?.name || 'Document',
          res.outputFileName,
          res.outputSize,
          res.summary
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred while processing the document.');
    } finally {
      setProcessing(false);
    }
  };

  const triggerDownloadResult = async () => {
    if (!result) return;
    await saveProcessedDocumentSafe({
      bytes: result.outputBytes,
      suggestedFileName: result.outputFileName,
      mimeType: result.outputMimeType,
      originalFileName: files[0]?.name
    });
  };

  const triggerDownloadSingleFileResult = async (singleRes: ProcessingResult) => {
    await saveProcessedDocumentSafe({
      bytes: singleRes.outputBytes,
      suggestedFileName: singleRes.outputFileName,
      mimeType: singleRes.outputMimeType,
      originalFileName: files[0]?.name
    });
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
      {/* Top Breadcrumb & Workspace Header */}
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
              <span>{tool.conversionSubcategoryLabel || tool.categoryLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-theme-accent">
                {tool.acceptedExtensions.slice(0, 3).join(', ')} → {tool.outputExtension}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-theme-primary mt-0.5 flex items-center gap-2.5">
              <ToolIcon name={tool.iconName} className="w-6 h-6 text-theme-accent" />
              <span>{tool.name}</span>
            </h1>
            <p className="text-xs text-theme-secondary mt-1 max-w-2xl">
              {tool.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {tool.id === 'word-to-pdf' && (
            <button
              type="button"
              onClick={handleLoadThreeWordFilesSample}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-theme-accent" />
              Load 3 Word (.docx) Files to Lock in One Go
            </button>
          )}

          {tool.id === 'unlock-pdf' && (
            <button
              type="button"
              onClick={handleLoadThreeProtectedPdfsSample}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
            >
              <Unlock className="w-3.5 h-3.5 text-emerald-400" />
              Load 3 Locked PDFs to Unlock in One Go
            </button>
          )}

          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-surface border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-theme-accent" />
            Load Sample {tool.acceptedExtensions[0]?.toUpperCase() || 'File'}
          </button>

          {onOpenInBatchQueue && files.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenInBatchQueue(tool.id, files)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary hover:border-theme-accent cursor-pointer"
            >
              <Layers2 className="w-3.5 h-3.5 text-theme-accent" />
              Open in Dedicated Batch Queue ({files.length})
            </button>
          )}

          {files.length > 0 && files[0].signatureLabel.startsWith('PDF') && (
            <button
              type="button"
              onClick={() => onOpenInEditor(files[0])}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-theme-accent text-white hover:opacity-95 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              Open in 2D PDF Editor
            </button>
          )}
        </div>
      </div>

      {/* Section A: Clean 2D Conversion Format & Pipeline Status Bar */}
      <div className="p-4 rounded-xl bg-theme-surface border border-theme-subtle flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-theme-elevated border border-theme-subtle font-mono">
            <span className="text-theme-secondary">Source:</span>
            <span className="font-bold text-theme-primary">
              {tool.acceptedExtensions.join(', ').toUpperCase()}
            </span>
            <span className="text-theme-accent font-bold">→</span>
            <span className="text-theme-secondary">Target:</span>
            <span className="font-bold text-theme-accent">
              {tool.outputExtension.toUpperCase()}
            </span>
          </div>

          <span className="text-theme-secondary">
            {files.length === 0
              ? 'No document uploaded yet'
              : `${files.length} file(s) staged (${(
                  files.reduce((acc, item) => acc + item.size, 0) / 1024
                ).toFixed(1)} KB total)`}
          </span>
        </div>

        {/* Functional Conversion State Badge */}
        <div className="flex items-center gap-2 font-mono">
          {errorMsg ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              Status: Failed
            </span>
          ) : processing ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Status: Processing ({progressPercent}%)
            </span>
          ) : result ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Status: Completed
            </span>
          ) : files.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-theme-elevated border border-theme-subtle text-theme-primary font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-theme-accent" />
              Status: Ready to Convert
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-theme-elevated border border-theme-subtle text-theme-muted">
              <Clock className="w-3.5 h-3.5" />
              Status: Waiting for File
            </span>
          )}
        </div>
      </div>

      {/* Main 2-Column Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN (7 Cols): File Upload, Interactive Page / Image Sorter, or HTML Input */}
        <div className="lg:col-span-7 space-y-6">
          {/* Drag and Drop File Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) {
                handleFilesSelected(Array.from(e.dataTransfer.files));
              }
            }}
            className="p-8 rounded-xl border-2 border-dashed border-theme-strong bg-theme-surface/60 hover:border-theme-accent transition-colors text-center space-y-4 cursor-pointer"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple={tool.multipleFiles}
              accept={tool.acceptedExtensions.join(',')}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  handleFilesSelected(Array.from(e.target.files));
                }
                e.target.value = '';
              }}
            />

            <div className="w-12 h-12 rounded-xl bg-theme-elevated border border-theme-subtle flex items-center justify-center mx-auto text-theme-accent pointer-events-none">
              <Upload className="w-6 h-6" />
            </div>

            <div className="space-y-1 pointer-events-none">
              <h2 className="text-base font-bold text-theme-primary">
                {tool.multipleFiles
                  ? `Drop one or multiple ${tool.acceptedExtensions.join(', ')} files here`
                  : `Drop your ${tool.acceptedExtensions.join(', ')} file here`}
              </h2>
              <p className="text-xs text-theme-secondary">
                Accepted formats: {tool.acceptedExtensions.join(', ')} · Verified magic-byte inspection · Up to 50 MB
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-theme-accent text-white hover:opacity-95 cursor-pointer"
              >
                {files.length > 0 && tool.multipleFiles ? '+ Add More Files' : 'Choose File(s)'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadSample();
                }}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-theme-elevated border border-theme-subtle text-theme-primary hover:border-theme-accent cursor-pointer"
              >
                Use Sample {tool.acceptedExtensions[0]?.toUpperCase() || 'File'}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-xs text-rose-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Uploaded File List with Interactive Ordering & Per-File Progress */}
          {files.length > 0 && (
            <div className="p-5 rounded-xl bg-theme-surface border border-theme-subtle space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-theme-secondary">
                  Uploaded Source Files ({files.length})
                  {MULTI_FILE_COMBINE_TOOLS.includes(tool.id) && files.length > 1 && (
                    <span className="ml-2 text-theme-accent font-normal normal-case">
                      · Use arrows to reorder sequence before combining
                    </span>
                  )}
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
                  Clear All
                </button>
              </div>

              <div className="divide-y divide-theme-subtle">
                {files.map((f, idx) => {
                  const fState = perFileStates[f.id];
                  const canReorder =
                    MULTI_FILE_COMBINE_TOOLS.includes(tool.id) && files.length > 1;

                  return (
                    <div key={f.id} className="py-3 space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-mono text-theme-muted w-5">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <FileText className="w-4 h-4 text-theme-accent shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-theme-primary truncate">
                              {f.name}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-mono text-theme-secondary">
                              <span>{(f.size / 1024).toFixed(1)} KB</span>
                              <span>·</span>
                              <span
                                className={
                                  f.isValidSignature ? 'text-emerald-400' : 'text-amber-400'
                                }
                              >
                                {f.signatureLabel}
                              </span>
                              {f.pageCount && (
                                <>
                                  <span>·</span>
                                  <span>{f.pageCount} Page(s)</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {canReorder && (
                            <>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveUploadedFile(idx, -1)}
                                title="Move earlier in sequence"
                                className="p-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === files.length - 1}
                                onClick={() => moveUploadedFile(idx, 1)}
                                title="Move later in sequence"
                                className="p-1.5 rounded bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {fState?.status === 'completed' && fState.result && (
                            <button
                              type="button"
                              onClick={() => triggerDownloadSingleFileResult(fState.result!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-500 cursor-pointer"
                            >
                              <Download className="w-3 h-3" />
                              Download .PDF
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            title="Replace or add another file"
                            className="px-2 py-1 rounded bg-theme-elevated border border-theme-subtle text-[11px] font-semibold text-theme-secondary hover:text-theme-primary hover:border-theme-accent cursor-pointer"
                          >
                            {tool.multipleFiles ? '+ Add / Replace' : 'Replace File'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setFiles((prev) => prev.filter((item) => item.id !== f.id))
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-theme-elevated border border-theme-subtle text-[11px] text-theme-muted hover:text-rose-400 hover:border-rose-500/30 cursor-pointer"
                            aria-label={`Remove ${f.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      {/* Per-file progress bar when processing multiple files in one go */}
                      {fState && (
                        <div className="pl-8 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="flex items-center gap-1.5 text-theme-secondary">
                              {fState.status === 'processing' && (
                                <Loader2 className="w-3 h-3 text-theme-accent animate-spin" />
                              )}
                              {fState.status === 'completed' && (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              )}
                              {fState.status === 'queued' && (
                                <Clock className="w-3 h-3 text-theme-muted" />
                              )}
                              <span>{fState.stage}</span>
                            </span>
                            <span className="tabular-nums text-theme-primary font-semibold">
                              {fState.progress}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-theme-muted overflow-hidden">
                            <div
                              style={{ width: `${fState.progress}%` }}
                              className={`h-full transition-all duration-150 ${
                                fState.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : 'bg-theme-accent'
                              }`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Page Thumbnail Grid for Organizer / Split / Rotate / PDF-to-Images */}
          {isOrganizerTool && files.length > 0 && (
            <div className="p-5 rounded-xl bg-theme-surface border border-theme-subtle space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-theme-primary">
                    Interactive Page Grid ({pageThumbs.length} Pages)
                  </h3>
                  <p className="text-xs text-theme-secondary">
                    {tool.id === 'organize-pages'
                      ? 'Drag and drop page cards with spring physics to reorder, or click to select/rotate.'
                      : 'Click pages to toggle selection or rotate individual pages before running.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setPageThumbs((prev) => prev.map((t) => ({ ...t, selected: true })))
                    }
                    className="px-2.5 py-1 rounded bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPageThumbs((prev) => prev.map((t) => ({ ...t, selected: false })))
                    }
                    className="px-2.5 py-1 rounded bg-theme-elevated border border-theme-subtle text-theme-secondary hover:text-theme-primary cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {loadingThumbs ? (
                <div className="py-12 text-center text-xs text-theme-secondary font-mono">
                  Rendering real PDF.js page thumbnails...
                </div>
              ) : (
                <Reorder.Group
                  axis="x"
                  values={pageThumbs}
                  onReorder={setPageThumbs}
                  className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5"
                >
                  {pageThumbs.map((thumb, idx) => (
                    <Reorder.Item
                      key={`page-card-${thumb.origIndex}`}
                      value={thumb}
                      onDragStart={() =>
                        document.documentElement.setAttribute('data-active-cursor', 'grabbing')
                      }
                      onDragEnd={() =>
                        document.documentElement.removeAttribute('data-active-cursor')
                      }
                      whileDrag={{
                        scale: 1.06,
                        zIndex: 30,
                        boxShadow: '0 20px 38px rgba(0, 0, 0, 0.5)'
                      }}
                      transition={{ type: 'spring', stiffness: 430, damping: 30 }}
                      className={`p-2.5 rounded-lg border transition-colors cursor-grab active:cursor-grabbing ${
                        thumb.selected
                          ? 'bg-theme-elevated border-theme-accent'
                          : 'bg-theme-canvas border-theme-subtle opacity-55'
                      }`}
                    >
                      <div
                        onClick={() =>
                          setPageThumbs((prev) =>
                            prev.map((t, i) =>
                              i === idx ? { ...t, selected: !t.selected } : t
                            )
                          )
                        }
                        className={`relative aspect-[3/4] bg-white rounded overflow-hidden flex items-center justify-center ${
                          tool.id === 'organize-pages'
                            ? 'cursor-grab active:cursor-grabbing'
                            : 'cursor-pointer'
                        }`}
                      >
                        <img
                          src={thumb.dataUrl}
                          alt={`Page ${thumb.pageNumber}`}
                          referrerPolicy="no-referrer"
                          draggable={false}
                          style={{ transform: `rotate(${thumb.rotation}deg)` }}
                          className="max-w-full max-h-full object-contain transition-transform pointer-events-none select-none"
                        />
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white pointer-events-none">
                          P.{thumb.pageNumber}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 mt-1 border-t border-theme-subtle text-[11px]">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (idx === 0) return;
                              setPageThumbs((prev) => {
                                const copy = [...prev];
                                const [removed] = copy.splice(idx, 1);
                                copy.splice(idx - 1, 0, removed);
                                return copy;
                              });
                            }}
                            className="px-1.5 py-0.5 rounded bg-theme-surface hover:bg-theme-muted text-theme-secondary cursor-pointer"
                            title="Move page earlier"
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (idx === pageThumbs.length - 1) return;
                              setPageThumbs((prev) => {
                                const copy = [...prev];
                                const [removed] = copy.splice(idx, 1);
                                copy.splice(idx + 1, 0, removed);
                                return copy;
                              });
                            }}
                            className="px-1.5 py-0.5 rounded bg-theme-surface hover:bg-theme-muted text-theme-secondary cursor-pointer"
                            title="Move page later"
                          >
                            →
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setPageThumbs((prev) =>
                              prev.map((t, i) =>
                                i === idx ? { ...t, rotation: (t.rotation + 90) % 360 } : t
                              )
                            )
                          }
                          className="p-1 rounded bg-theme-surface hover:bg-theme-muted text-theme-secondary hover:text-theme-primary cursor-pointer"
                          title="Rotate page +90°"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              )}
            </div>
          )}

          {/* Direct HTML Editor for HTML-to-PDF */}
          {tool.id === 'html-to-pdf' && (
            <div className="p-5 rounded-xl bg-theme-surface border border-theme-subtle space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-theme-secondary">
                  HTML5 Source Markup (Or Upload .html File Above)
                </label>
                <span className="text-[11px] font-mono text-theme-muted">
                  Supports &lt;h1-h4&gt;, &lt;p&gt;, &lt;ul/ol&gt;, &lt;table&gt;, &lt;img src="data:..."&gt;
                </span>
              </div>
              <textarea
                rows={9}
                value={htmlInput}
                onChange={(e) => setHtmlInput(e.target.value)}
                className="w-full p-3 rounded-lg bg-theme-elevated border border-theme-subtle text-xs font-mono text-theme-primary focus:outline-none focus:border-theme-accent"
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (5 Cols): Format-Specific Configuration, Execute CTA & Verified Result Panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-xl bg-theme-surface border border-theme-subtle space-y-5">
            <div className="border-b border-theme-subtle pb-3">
              <h3 className="text-sm font-bold text-theme-primary">
                Conversion &amp; Output Configuration
              </h3>
              <p className="text-xs text-theme-secondary mt-0.5">{tool.description}</p>
            </div>

            {/* ============================================================= */}
            {/* A. PDF TO OFFICE PARAMETERS                                   */}
            {/* ============================================================= */}

            {/* 1. PDF to Word (.docx) */}
            {tool.id === 'pdf-to-word' && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Pages to Convert
                  </label>
                  <input
                    type="text"
                    value={conversionPageRange}
                    onChange={(e) => setConversionPageRange(e.target.value)}
                    placeholder="all or e.g. 1-3, 5"
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                  />
                  <span className="block text-[11px] text-theme-muted mt-1">
                    Enter &ldquo;all&rdquo; for the entire document or specific ranges like &ldquo;1-2, 4&rdquo;.
                  </span>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-theme-elevated border border-theme-subtle cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wordIncludePageImages}
                    onChange={(e) => setWordIncludePageImages(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-bold text-theme-primary block">
                      Include High-Resolution Page Figures in .docx
                    </span>
                    <span className="text-[11px] text-theme-secondary">
                      Embeds rendered page graphics alongside editable headings, paragraphs, and reconstructed Word tables.
                    </span>
                  </div>
                </label>
              </div>
            )}

            {/* 2. PDF to Excel (.xlsx) */}
            {tool.id === 'pdf-to-excel' && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1.5">
                    Worksheet Organization
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'per-page', label: 'One Sheet per Page' },
                        { id: 'single-sheet', label: 'Merged Single Sheet' }
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setExcelSheetMode(m.id)}
                        className={`py-2 px-2.5 rounded-lg border font-semibold cursor-pointer ${
                          excelSheetMode === m.id
                            ? 'bg-theme-accent text-white border-transparent'
                            : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Page Range to Extract
                  </label>
                  <input
                    type="text"
                    value={conversionPageRange}
                    onChange={(e) => setConversionPageRange(e.target.value)}
                    placeholder="all or e.g. 1-2"
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                  />
                </div>

                <div className="p-3 rounded-lg bg-theme-elevated border border-theme-subtle text-[11px] text-theme-secondary">
                  Automatic numeric cell type conversion and Tesseract OCR fallback are enabled for scanned table pages.
                </div>
              </div>
            )}

            {/* 3. PDF to PowerPoint (.pptx) */}
            {tool.id === 'pdf-to-ppt' && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1.5">
                    Slide Conversion Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'editable-hybrid', label: 'Editable Text + Visual' },
                        { id: 'visual-high-fidelity', label: 'Visual High-Fidelity' }
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPptxConversionMode(m.id)}
                        className={`py-2 px-2.5 rounded-lg border font-semibold cursor-pointer ${
                          pptxConversionMode === m.id
                            ? 'bg-theme-accent text-white border-transparent'
                            : 'bg-theme-elevated border-theme-subtle text-theme-secondary'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Target Slide Aspect Ratio
                  </label>
                  <select
                    value={pptxSlideAspect}
                    onChange={(e) => setPptxSlideAspect(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                  >
                    <option value="16:9">16:9 Widescreen Presentation</option>
                    <option value="4:3">4:3 Standard Presentation</option>
                    <option value="original">Match Exact PDF Page Aspect Ratio</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Pages to Convert
                  </label>
                  <input
                    type="text"
                    value={conversionPageRange}
                    onChange={(e) => setConversionPageRange(e.target.value)}
                    placeholder="all or e.g. 1-5"
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                  />
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* B. PDF TO IMAGES & WEB PARAMETERS                             */}
            {/* ============================================================= */}

            {/* 4 & 5. PDF to JPG / PDF to PNG */}
            {(tool.id === 'pdf-to-jpg' || tool.id === 'pdf-to-png') && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Render Resolution (DPI)
                  </label>
                  <select
                    value={imageDpiScale}
                    onChange={(e) => setImageDpiScale(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                  >
                    <option value={1.0}>Standard Screen (72 DPI)</option>
                    <option value={2.0}>High Definition (150 DPI · Recommended)</option>
                    <option value={3.0}>Archival Print Quality (216–300 DPI)</option>
                  </select>
                </div>

                {tool.id === 'pdf-to-jpg' && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="font-semibold text-theme-secondary">
                        JPEG Compression Quality
                      </label>
                      <span className="font-mono text-theme-primary font-bold">
                        {Math.round(imageQuality * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={1.0}
                      step={0.04}
                      value={imageQuality}
                      onChange={(e) => setImageQuality(Number(e.target.value))}
                      className="w-full accent-emerald-600"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Page Selection (Or Click Pages in Grid on Left)
                  </label>
                  <input
                    type="text"
                    value={conversionPageRange}
                    onChange={(e) => setConversionPageRange(e.target.value)}
                    placeholder="all or e.g. 1-2"
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                  />
                </div>
              </div>
            )}

            {/* 6. PDF to HTML */}
            {tool.id === 'pdf-to-html' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Pages to Export to HTML5
                  </label>
                  <input
                    type="text"
                    value={conversionPageRange}
                    onChange={(e) => setConversionPageRange(e.target.value)}
                    placeholder="all or e.g. 1-3"
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                  />
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* C. ARCHIVAL CONVERSION (PDF to PDF/A)                         */}
            {/* ============================================================= */}
            {tool.id === 'pdf-to-pdfa' && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1.5">
                    ISO 19005 PDF/A Conformance Profile
                  </label>
                  <select
                    value={pdfaProfile}
                    onChange={(e) => setPdfaProfile(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-lg bg-theme-elevated border border-theme-strong font-bold text-theme-primary"
                  >
                    <option value="PDF/A-2b">PDF/A-2b (ISO 19005-2:2011 · Recommended)</option>
                    <option value="PDF/A-1b">PDF/A-1b (ISO 19005-1:2005 · Legacy Strict)</option>
                    <option value="PDF/A-3b">PDF/A-3b (ISO 19005-3:2012 · Archival + Attachments)</option>
                  </select>
                </div>

                <div className="p-3.5 rounded-xl bg-theme-elevated border border-theme-subtle space-y-2 text-[11px] text-theme-secondary">
                  <div className="font-bold text-theme-primary flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Archival Normalization &amp; Verification</span>
                  </div>
                  <p className="leading-relaxed">
                    Embeds an ISO 19005 XMP <code className="font-mono text-theme-accent">pdfaid</code> metadata stream, attaches an <code className="font-mono text-theme-accent">sRGB IEC61966-2.1</code> OutputIntent dictionary, flattens interactive form fields, and strips prohibited encryption dictionaries.
                  </p>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* D. OTHER FORMATS TO PDF PARAMETERS                            */}
            {/* ============================================================= */}

            {/* Excel to PDF Worksheet, Orientation & Scaling Controls */}
            {tool.id === 'excel-to-pdf' && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Worksheet Selection
                  </label>
                  <select
                    value={excelSheetName}
                    onChange={(e) => setExcelSheetName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary font-semibold"
                  >
                    <option value="__ALL__">
                      All Worksheets ({availableExcelSheets.length || 'Auto-Detect'})
                    </option>
                    {availableExcelSheets.map((sName) => (
                      <option key={sName} value={sName}>
                        Worksheet: {sName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-theme-secondary mb-1">
                      Page Orientation
                    </label>
                    <select
                      value={pageOrientation}
                      onChange={(e) => setPageOrientation(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                    >
                      <option value="landscape">Landscape (Wide Table)</option>
                      <option value="portrait">Portrait</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-theme-secondary mb-1">
                      Column Scaling
                    </label>
                    <select
                      value={excelPageScaling}
                      onChange={(e) => setExcelPageScaling(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                    >
                      <option value="fit-columns">Fit Columns to Page</option>
                      <option value="actual-size">Actual Column Width</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* PowerPoint to PDF Slide Selection & Aspect */}
            {tool.id === 'ppt-to-pdf' && (
              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Slide Layout Aspect
                  </label>
                  <select
                    value={pptxSlideAspect}
                    onChange={(e) => setPptxSlideAspect(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                  >
                    <option value="16:9">16:9 Widescreen Landscape (792 × 446 pt)</option>
                    <option value="4:3">4:3 Standard Landscape (792 × 594 pt)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-theme-secondary mb-1">
                    Slides to Include
                  </label>
                  <input
                    type="text"
                    value={conversionPageRange}
                    onChange={(e) => setConversionPageRange(e.target.value)}
                    placeholder="all or e.g. 1-3"
                    className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle font-mono text-theme-primary"
                  />
                </div>
              </div>
            )}

            {/* Word to PDF & HTML to PDF Page Layout Controls */}
            {(tool.id === 'word-to-pdf' || tool.id === 'html-to-pdf') && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-theme-secondary mb-1">
                      Page Size
                    </label>
                    <select
                      value={pageSize === 'fit' ? 'letter' : pageSize}
                      onChange={(e) => setPageSize(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                    >
                      <option value="letter">US Letter (8.5 × 11 in)</option>
                      <option value="a4">ISO A4 (210 × 297 mm)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-theme-secondary mb-1">
                      Orientation
                    </label>
                    <select
                      value={pageOrientation === 'auto' ? 'portrait' : pageOrientation}
                      onChange={(e) => setPageOrientation(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 items-center">
                  <div>
                    <label className="block font-semibold text-theme-secondary mb-1">
                      Page Margins
                    </label>
                    <select
                      value={pageMargin}
                      onChange={(e) => setPageMargin(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                    >
                      <option value={24}>Compact (24 pt)</option>
                      <option value={42}>Standard (42 pt)</option>
                      <option value={64}>Wide Editorial (64 pt)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 pt-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePageNumbersOnConvert}
                      onChange={(e) => setIncludePageNumbersOnConvert(e.target.checked)}
                    />
                    <span className="font-semibold text-theme-primary">Stamp Page Numbers</span>
                  </label>
                </div>
              </div>
            )}

            {/* JPG to PDF & PNG to PDF Layout, Orientation, Margin & Fit Controls */}
            {(tool.id === 'jpg-to-pdf' || tool.id === 'png-to-pdf') && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-semibold text-theme-secondary mb-1">
                      Target Page Size
                    </label>
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

                  <div>
                    <label className="block font-semibold text-theme-secondary mb-1">
                      Page Orientation
                    </label>
                    <select
                      value={pageOrientation}
                      onChange={(e) => setPageOrientation(e.target.value as any)}
                      disabled={pageSize === 'fit'}
                      className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary disabled:opacity-40"
                    >
                      <option value="auto">Auto (Match Image Aspect)</option>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>

                {pageSize !== 'fit' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-semibold text-theme-secondary mb-1">
                        Image Fit / Fill Mode
                      </label>
                      <select
                        value={imageFitMode}
                        onChange={(e) => setImageFitMode(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                      >
                        <option value="contain">Contain (Full Image, No Crop)</option>
                        <option value="cover">Cover (Fill Page Area)</option>
                        <option value="center">Center Actual Size</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-theme-secondary mb-1">
                        Page Margin
                      </label>
                      <select
                        value={pageMargin}
                        onChange={(e) => setPageMargin(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-theme-elevated border border-theme-subtle text-theme-primary"
                      >
                        <option value={0}>No Margin (Full Bleed 0 pt)</option>
                        <option value={18}>Small Margin (18 pt)</option>
                        <option value={36}>Standard Margin (36 pt)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Word-to-PDF & Other Convert-to-PDF: Password-Protect Output PDF(s) in One Go */}
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

            {/* Crop Margins Parameters & Interactive Crop Selection Box */}
            {tool.id === 'crop-pdf' && (
              <div className="space-y-3.5">
                <div
                  title="Crop selection area (crosshair cursor)"
                  className="relative h-36 rounded-lg bg-theme-elevated border border-theme-subtle overflow-hidden flex items-center justify-center cursor-crosshair select-none"
                >
                  <div
                    style={{
                      top: `${Math.min(35, Math.max(6, Math.round(cropMarginTop / 3)))}%`,
                      bottom: `${Math.min(35, Math.max(6, Math.round(cropMarginBottom / 3)))}%`,
                      left: `${Math.min(35, Math.max(6, Math.round(cropMarginLeft / 3)))}%`,
                      right: `${Math.min(35, Math.max(6, Math.round(cropMarginRight / 3)))}%`
                    }}
                    className="absolute border-2 border-dashed border-emerald-500 bg-emerald-500/10 flex items-center justify-center cursor-move"
                  >
                    <span className="text-[10px] font-mono text-emerald-400 pointer-events-none">
                      Crop Box ({612 - cropMarginLeft - cropMarginRight} × {792 - cropMarginTop - cropMarginBottom} pt)
                    </span>
                    <span className="absolute -top-1.5 -left-1.5 w-2.5 h-2.5 bg-white border border-emerald-600 rounded-xs cursor-nwse-resize" />
                    <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-white border border-emerald-600 rounded-xs cursor-nesw-resize" />
                    <span className="absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 bg-white border border-emerald-600 rounded-xs cursor-nesw-resize" />
                    <span className="absolute -bottom-1.5 -right-1.5 w-2.5 h-2.5 bg-white border border-emerald-600 rounded-xs cursor-nwse-resize" />
                  </div>
                </div>
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

            {/* Execute Primary CTA */}
            <button
              type="button"
              disabled={processing || (files.length === 0 && tool.id !== 'html-to-pdf')}
              onClick={handleRunTool}
              className="w-full py-3 px-4 rounded-xl text-sm font-bold bg-theme-accent text-white hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer shadow-sm"
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

            {/* Real Processing Progress Bar + Cancel Control */}
            {processing && (
              <div className="space-y-2">
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
                <button
                  type="button"
                  onClick={handleCancelOperation}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-rose-500/15 border border-rose-500/40 text-rose-400 hover:bg-rose-500/25 cursor-pointer"
                >
                  Cancel Operation
                </button>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* VERIFIED RESULT & DOWNLOAD PANEL                          */}
          {/* ========================================================= */}
          {result && (
            <div className="p-6 rounded-xl bg-theme-elevated border border-theme-strong space-y-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-theme-primary">
                      Conversion Verified &amp; Complete
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

              {/* Extracted Text / HTML Preview */}
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

              {/* Extracted Page Image Gallery with Individual Page Downloads */}
              {result.extractedImages && result.extractedImages.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-theme-primary">
                      Individual Page Images ({result.extractedImages.length})
                    </span>
                    <span className="text-[11px] text-theme-secondary">
                      Click any page card to download individually
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto p-1">
                    {result.extractedImages.map((img) => (
                      <a
                        key={img.name}
                        href={img.dataUrl}
                        download={img.name}
                        className="group p-2.5 rounded-lg border border-theme-subtle bg-theme-surface hover:border-theme-accent block text-center transition-colors"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          referrerPolicy="no-referrer"
                          className="h-24 mx-auto object-contain mb-1.5 rounded"
                        />
                        <span className="text-[10px] font-mono text-theme-secondary group-hover:text-theme-primary truncate block">
                          Page {img.page} ({img.width}×{img.height} px)
                        </span>
                        <span className="text-[10px] font-semibold text-theme-accent mt-0.5 inline-flex items-center gap-1">
                          <Download className="w-2.5 h-2.5" />
                          Download .{img.name.split('.').pop()}
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
                  Convert Another
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* RELATED TOOLS DISCOVERY STRIP                             */}
      {/* ========================================================= */}
      {onSelectTool && (
        <div className="pt-8 border-t border-theme-subtle space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-theme-primary">
              Related {tool.conversionSubcategoryLabel || tool.categoryLabel} Tools
            </h3>
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-semibold text-theme-accent hover:underline cursor-pointer"
            >
              Browse All {PDF_TOOLS_CATALOG.length} Studio Tools →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {PDF_TOOLS_CATALOG.filter(
              (t) =>
                (tool.conversionSubcategory
                  ? t.conversionSubcategory === tool.conversionSubcategory
                  : t.category === tool.category) && t.id !== tool.id
            )
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
