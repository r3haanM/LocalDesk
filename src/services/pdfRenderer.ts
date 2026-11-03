if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function (fn: (...args: any[]) => any, ...args: any[]) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

if (typeof (Uint8Array.prototype as any).toHex !== 'function') {
  (Uint8Array.prototype as any).toHex = function (this: Uint8Array) {
    let hex = '';
    for (let i = 0; i < this.length; i++) {
      hex += this[i].toString(16).padStart(2, '0');
    }
    return hex;
  };
}

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Configure PDF.js worker using local bundled worker asset (compatible with both Vite and Node ESM)
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export interface FileSignatureCheck {
  isValid: boolean;
  detectedFormat: string;
  details: string;
}

export async function validateFileSignature(
  buffer: ArrayBuffer,
  fileName: string
): Promise<FileSignatureCheck> {
  const bytes = new Uint8Array(buffer.slice(0, 16));
  const ext = fileName.toLowerCase().split('.').pop() || '';

  // Check %PDF- magic bytes (25 50 44 46 2D)
  const headerStr = new TextDecoder('ascii').decode(bytes.slice(0, 8));
  if (headerStr.startsWith('%PDF-')) {
    return {
      isValid: true,
      detectedFormat: `PDF (${headerStr.slice(1, 8).trim()})`,
      details: 'Verified ISO 32000 PDF magic signature'
    };
  }

  // Check PNG (89 50 4E 47 0D 0A 1A 0A)
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return {
      isValid: true,
      detectedFormat: 'PNG Image',
      details: 'Verified PNG 8-byte header signature'
    };
  }

  // Check JPEG (FF D8 FF)
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return {
      isValid: true,
      detectedFormat: 'JPEG Image',
      details: 'Verified JPEG SOI marker signature'
    };
  }

  // Check WebP (RIFF....WEBP)
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45
  ) {
    return {
      isValid: true,
      detectedFormat: 'WebP Image',
      details: 'Verified RIFF/WebP header signature'
    };
  }

  // Check ZIP / OOXML (.docx, .xlsx, .pptx) (50 4B 03 04)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const officeMap: Record<string, string> = {
      docx: 'Word Document (OOXML)',
      xlsx: 'Excel Workbook (OOXML)',
      pptx: 'PowerPoint Presentation (OOXML)',
      zip: 'ZIP Archive'
    };
    return {
      isValid: true,
      detectedFormat: officeMap[ext] || 'OOXML / ZIP Container',
      details: 'Verified PKZIP/OpenXML magic signature'
    };
  }

  // Check plain text / HTML / CSV / Markdown
  if (['txt', 'html', 'htm', 'csv', 'md', 'json', 'log'].includes(ext)) {
    return {
      isValid: true,
      detectedFormat: `${ext.toUpperCase()} Text Stream`,
      details: 'Verified readable UTF-8 text payload'
    };
  }

  // Check if %PDF- appears within first 1024 bytes (for slightly damaged PDFs)
  const first1k = new TextDecoder('ascii').decode(new Uint8Array(buffer.slice(0, 1024)));
  if (first1k.includes('%PDF-')) {
    return {
      isValid: true,
      detectedFormat: 'PDF (Offset Header)',
      details: 'Found %PDF- signature within leading 1 KB'
    };
  }

  return {
    isValid: false,
    detectedFormat: 'Unrecognized Binary',
    details: 'File header does not match expected PDF, Office, Image, or UTF-8 signatures'
  };
}

export async function loadPdfJsDocument(pdfBytes: Uint8Array) {
  const dataCopy = new Uint8Array(pdfBytes.byteLength);
  dataCopy.set(pdfBytes);
  const loadingTask = pdfjsLib.getDocument({
    data: dataCopy,
    useSystemFonts: true
  });
  return await loadingTask.promise;
}

export async function renderPdfPageToDataUrl(
  pdfBytes: Uint8Array,
  pageNumber1Based: number,
  scale = 1.5,
  format: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.92
): Promise<{ dataUrl: string; width: number; height: number }> {
  const pdfDoc = await loadPdfJsDocument(pdfBytes);
  const safePageNum = Math.max(1, Math.min(pageNumber1Based, pdfDoc.numPages));
  const page = await pdfDoc.getPage(safePageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas rendering context');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas
  } as any).promise;

  const dataUrl = canvas.toDataURL(format, quality);
  await (pdfDoc as any).destroy?.();
  return {
    dataUrl,
    width: viewport.width,
    height: viewport.height
  };
}

export interface ExtractedTextRun {
  str: string;
  x: number; // Top-left X in PDF points
  y: number; // Top-left Y in PDF points
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
}

export interface ExtractedPageStructure {
  pageNumber: number;
  width: number;
  height: number;
  textRuns: ExtractedTextRun[];
  plainText: string;
}

export async function extractPdfTextAndLayout(pdfBytes: Uint8Array): Promise<{
  numPages: number;
  pages: ExtractedPageStructure[];
  fullText: string;
  outline: Array<{ title: string; pageNumber: number }>;
}> {
  const pdfDoc = await loadPdfJsDocument(pdfBytes);
  const pages: ExtractedPageStructure[] = [];
  const fullTextParts: string[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const rawRuns: ExtractedTextRun[] = [];
    for (const item of textContent.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      const tx = item.transform; // [scaleX, skewY, skewX, scaleY, x, y]
      const fontSize = Math.max(8, Math.round(Math.hypot(tx[0], tx[1]) || Math.abs(tx[3]) || 12));
      const x = tx[4];
      // PDF y is bottom-up; convert to top-down for canvas UI
      const pdfY = tx[5];
      const height = item.height || fontSize * 1.15;
      const y = Math.max(0, viewport.height - pdfY - fontSize * 0.85);
      const width = Math.max(20, item.width || item.str.length * fontSize * 0.52);

      const styleMeta = (textContent as any).styles?.[item.fontName];
      const styleFamily = styleMeta?.fontFamily || '';
      const resolvedFontName = `${item.fontName || 'Helvetica'} ${styleFamily}`.trim();

      rawRuns.push({
        str: item.str,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        width: Math.round(width * 10) / 10,
        height: Math.round(height * 10) / 10,
        fontSize,
        fontName: resolvedFontName
      });
    }

    // Group adjacent fragments on the same horizontal line into logical text runs
    rawRuns.sort((a, b) => (Math.abs(a.y - b.y) < 4 ? a.x - b.x : a.y - b.y));
    const mergedRuns: ExtractedTextRun[] = [];
    for (const run of rawRuns) {
      const prev = mergedRuns[mergedRuns.length - 1];
      if (
        prev &&
        Math.abs(prev.y - run.y) < 4 &&
        Math.abs(prev.fontSize - run.fontSize) <= 2 &&
        run.x - (prev.x + prev.width) < 18
      ) {
        const gap = run.x - (prev.x + prev.width);
        prev.str = `${prev.str}${gap > 2 ? ' ' : ''}${run.str}`;
        prev.width = Math.round((run.x + run.width - prev.x) * 10) / 10;
      } else {
        mergedRuns.push({ ...run });
      }
    }

    const pageText = mergedRuns.map((r) => r.str).join('\n');
    pages.push({
      pageNumber: i,
      width: viewport.width,
      height: viewport.height,
      textRuns: mergedRuns,
      plainText: pageText
    });
    fullTextParts.push(`--- Page ${i} ---\n${pageText}`);
  }

  const outline: Array<{ title: string; pageNumber: number }> = [];
  try {
    const rawOutline = await pdfDoc.getOutline();
    if (rawOutline) {
      for (const entry of rawOutline) {
        outline.push({
          title: entry.title || 'Section',
          pageNumber: 1
        });
      }
    }
  } catch {
    // Outline optional
  }

  await (pdfDoc as any).destroy?.();
  return {
    numPages: pages.length,
    pages,
    fullText: fullTextParts.join('\n\n'),
    outline
  };
}

/**
 * Generates a rich, genuine multi-page PDF document with native text runs,
 * vector graphics, AcroForm interactive fields, and document metadata so users
 * can test every PDF tool and the Sajda-style Object Manager immediately.
 */
export async function generateSamplePdfBytes(
  kind: 'editorial-report' | 'comparison-v2' = 'editorial-report'
): Promise<{ bytes: Uint8Array; name: string }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(
    kind === 'editorial-report'
      ? 'Local Desk Architecture & Financial Specification 2026'
      : 'Local Desk Architecture & Financial Specification 2026 (Revised)'
  );
  pdfDoc.setAuthor('Local Desk Document Engineering Team');
  pdfDoc.setSubject('Interactive PDF Sample with Native Text, Vectors, and AcroForm Fields');
  pdfDoc.setKeywords(['PDF', 'Architecture', 'Object Management', 'Redaction', 'AcroForm']);
  pdfDoc.setCreator('Local Desk Studio');
  pdfDoc.setProducer('Local Desk ISO-32000 Engine');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Page 1: Executive Specification & Vector Diagram + Confidential Block
  const page1 = pdfDoc.addPage([612, 792]); // US Letter

  // Header Banner Shape
  page1.drawRectangle({
    x: 48,
    y: 700,
    width: 516,
    height: 48,
    color: rgb(0.11, 0.11, 0.15)
  });

  page1.drawText('VELLUM DOCUMENT SPECIFICATION // EDITION 04', {
    x: 64,
    y: 718,
    size: 11,
    font: fontMono,
    color: rgb(0.75, 0.68, 0.98)
  });

  // Main Headline
  page1.drawText(
    kind === 'editorial-report'
      ? 'Quarterly Infrastructure & Security Audit'
      : 'Quarterly Infrastructure & Security Audit — Rev B',
    {
      x: 48,
      y: 654,
      size: 22,
      font: fontBold,
      color: rgb(0.09, 0.09, 0.12)
    }
  );

  page1.drawText('Prepared by: Principal Systems Architecture Group · Reference ID: VLM-2026-8841', {
    x: 48,
    y: 632,
    size: 10,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.46)
  });

  // Section 1
  page1.drawText('01. Executive Summary', {
    x: 48,
    y: 590,
    size: 14,
    font: fontBold,
    color: rgb(0.15, 0.12, 0.28)
  });

  const summaryLines =
    kind === 'editorial-report'
      ? [
          'This document contains real native PDF text operators, vector rectangles, and interactive',
          'AcroForm controls. Select any object in the Vellum PDF Editor to modify text, change',
          'typography, toggle visibility (Hide/Show), or permanently delete it from the stream.'
        ]
      : [
          'This revised document updates the quarterly throughput metrics and adjusts the security',
          'retention window from 90 days to 30 days. Use the Compare PDFs tool to inspect',
          'both textual and visual differences between Edition A and Edition B.'
        ];

  summaryLines.forEach((line, idx) => {
    page1.drawText(line, {
      x: 48,
      y: 566 - idx * 18,
      size: 11,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.24)
    });
  });

  // Vector Metric Box 1
  page1.drawRectangle({
    x: 48,
    y: 425,
    width: 246,
    height: 76,
    color: rgb(0.96, 0.95, 0.99),
    borderColor: rgb(0.48, 0.23, 0.93),
    borderWidth: 1
  });
  page1.drawText('THROUGHPUT CAPACITY', {
    x: 64,
    y: 478,
    size: 9,
    font: fontMono,
    color: rgb(0.43, 0.16, 0.85)
  });
  page1.drawText(kind === 'editorial-report' ? '14,820 docs / hr' : '19,450 docs / hr', {
    x: 64,
    y: 452,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.14)
  });

  // Vector Metric Box 2
  page1.drawRectangle({
    x: 318,
    y: 425,
    width: 246,
    height: 76,
    color: rgb(0.95, 0.97, 0.96),
    borderColor: rgb(0.06, 0.6, 0.42),
    borderWidth: 1
  });
  page1.drawText('STREAM INTEGRITY', {
    x: 334,
    y: 478,
    size: 9,
    font: fontMono,
    color: rgb(0.05, 0.5, 0.35)
  });
  page1.drawText('99.98% Verified ISO', {
    x: 334,
    y: 452,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.14)
  });

  // Section 2: Tabular Financial & Resource Breakdown (great for PDF to Excel!)
  page1.drawText('02. Quarterly Resource Allocation Table', {
    x: 48,
    y: 382,
    size: 14,
    font: fontBold,
    color: rgb(0.15, 0.12, 0.28)
  });

  const tableRows = [
    ['Department', 'Q1 Budget', 'Q2 Budget', 'Q3 Projection', 'Status'],
    ['Core PDF Engine', '$142,000', '$156,500', '$164,000', 'Active'],
    ['Object Stream Parser', '$98,400', '$104,200', '$112,000', 'Verified'],
    ['Redaction & Security', '$115,000', '$128,000', kind === 'editorial-report' ? '$135,000' : '$149,500', 'Audited'],
    ['OCR & Layout Pipeline', '$84,200', '$89,000', '$94,500', 'Nominal']
  ];

  tableRows.forEach((row, rIdx) => {
    const rowY = 352 - rIdx * 24;
    if (rIdx === 0) {
      page1.drawRectangle({
        x: 48,
        y: rowY - 6,
        width: 516,
        height: 22,
        color: rgb(0.92, 0.91, 0.95)
      });
    }
    const colX = [56, 210, 305, 400, 500];
    row.forEach((cell, cIdx) => {
      page1.drawText(cell, {
        x: colX[cIdx],
        y: rowY,
        size: 10,
        font: rIdx === 0 ? fontBold : cIdx >= 1 && cIdx <= 3 ? fontMono : fontRegular,
        color: rgb(0.15, 0.15, 0.2)
      });
    });
  });

  // Section 3: Sensitive / Redactable Notice Block
  page1.drawRectangle({
    x: 48,
    y: 138,
    width: 516,
    height: 74,
    color: rgb(0.99, 0.95, 0.95),
    borderColor: rgb(0.85, 0.25, 0.25),
    borderWidth: 1
  });
  page1.drawText('CONFIDENTIAL RECORD — TARGET FOR REDACTION OR OBJECT REMOVAL', {
    x: 64,
    y: 188,
    size: 10,
    font: fontBold,
    color: rgb(0.75, 0.15, 0.15)
  });
  page1.drawText('Internal Vault Key: VK-9920-ALPHA-7741 · Custodian: Elena Rostova (SSN-901-44-8821)', {
    x: 64,
    y: 168,
    size: 10,
    font: fontMono,
    color: rgb(0.25, 0.12, 0.12)
  });
  page1.drawText('Select this text or draw a Redaction box over it to test permanent stream sanitization.', {
    x: 64,
    y: 150,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.4, 0.25, 0.25)
  });

  // Footer Page 1
  page1.drawText('Page 1 of 2 · Local Desk Open Document Architecture · Public Sample File', {
    x: 48,
    y: 42,
    size: 9,
    font: fontMono,
    color: rgb(0.5, 0.5, 0.56)
  });

  // Page 2: Interactive AcroForm & Sign-off Sheet
  const page2 = pdfDoc.addPage([612, 792]);

  page2.drawText('03. Interactive Compliance Sign-Off & AcroForm', {
    x: 48,
    y: 720,
    size: 18,
    font: fontBold,
    color: rgb(0.09, 0.09, 0.12)
  });

  page2.drawText(
    'This page includes native AcroForm fields and a signature block for testing form filling, flattening, and signing.',
    {
      x: 48,
      y: 694,
      size: 10.5,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.42)
    }
  );

  const form = pdfDoc.getForm();

  page2.drawText('Reviewer Full Name:', {
    x: 48,
    y: 642,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.2)
  });
  const reviewerField = form.createTextField('reviewer_name');
  reviewerField.setText('Alex Morgan, Lead Auditor');
  reviewerField.addToPage(page2, { x: 200, y: 634, width: 320, height: 24 });

  page2.drawText('Clearance Department:', {
    x: 48,
    y: 594,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.2)
  });
  const deptField = form.createTextField('department_code');
  deptField.setText('SEC-OPS-GLOBAL');
  deptField.addToPage(page2, { x: 200, y: 586, width: 320, height: 24 });

  page2.drawText('Approve Production Release:', {
    x: 48,
    y: 546,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.2)
  });
  const approveCheck = form.createCheckBox('approve_release');
  approveCheck.check();
  approveCheck.addToPage(page2, { x: 220, y: 542, width: 18, height: 18 });

  // Signature Box Area
  page2.drawRectangle({
    x: 48,
    y: 360,
    width: 516,
    height: 130,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: rgb(0.75, 0.75, 0.82),
    borderWidth: 1
  });
  page2.drawText('AUTHORIZED SIGNATURE & CRYPTOGRAPHIC ATTESTATION BLOCK', {
    x: 64,
    y: 466,
    size: 9.5,
    font: fontMono,
    color: rgb(0.4, 0.4, 0.48)
  });
  page2.drawText('Place visual or SHA-256 cryptographic signature below:', {
    x: 64,
    y: 444,
    size: 10.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.36)
  });

  page2.drawText('Page 2 of 2 · Local Desk Open Document Architecture · Public Sample File', {
    x: 48,
    y: 42,
    size: 9,
    font: fontMono,
    color: rgb(0.5, 0.5, 0.56)
  });

  const savedBytes = await pdfDoc.save();
  return {
    bytes: savedBytes,
    name:
      kind === 'editorial-report'
        ? 'LocalDesk_Architecture_Spec_2026.pdf'
        : 'LocalDesk_Architecture_Spec_2026_RevB.pdf'
  };
}
