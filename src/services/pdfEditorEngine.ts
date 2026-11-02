import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFRawStream,
  decodePDFRawStream
} from 'pdf-lib';
import {
  PdfEditableObject,
  PdfPageDescriptor,
  ScannedExportMode
} from '../types/pdf';
import {
  extractPdfTextAndLayout,
  loadPdfJsDocument,
  renderPdfPageToDataUrl
} from './pdfRenderer';
import {
  classifyPdfPageContent,
  hasNonWinAnsiChars,
  renderUnicodeTextToPngDataUrl
} from './scannedOcrEngine';

export interface ParsedEditorDocument {
  pages: PdfPageDescriptor[];
  objects: PdfEditableObject[];
  outline: Array<{ title: string; pageNumber: number }>;
  metadata: {
    title: string;
    author: string;
    subject: string;
    keywords: string;
    creator: string;
    producer: string;
  };
  hasXfa: boolean;
}

function hexToRgbNormalized(hex = '#18181B'): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return {
    r: isNaN(r) ? 0.1 : r,
    g: isNaN(g) ? 0.1 : g,
    b: isNaN(b) ? 0.12 : b
  };
}

/**
 * Extracts significant vector rectangles (`x y w h re`) from a PDF page's content stream
 * so cards, banners, and graphic blocks can be selected, moved, resized, or deleted.
 */
function extractNativeVectorRectanglesFromPage(
  pdfPage: any,
  pageWidth: number,
  pageHeight: number
): Array<{ x: number; y: number; width: number; height: number; fillHex: string; strokeHex: string }> {
  const detected: Array<{ x: number; y: number; width: number; height: number; fillHex: string; strokeHex: string }> = [];
  try {
    const { Contents } = pdfPage.node.normalizedEntries();
    if (!Contents) return detected;
    const context = pdfPage.doc.context;

    const inspectStreamRef = (ref: any) => {
      const stream = context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) return;
      const decodedBytes = decodePDFRawStream(stream).decode();
      const contentStr = new TextDecoder('latin1').decode(decodedBytes);

      // Match `x y w h re` operators
      const reRegex = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+re/g;
      let match: RegExpExecArray | null;
      while ((match = reRegex.exec(contentStr)) !== null) {
        const rx = parseFloat(match[1]);
        const ry = parseFloat(match[2]);
        const rw = parseFloat(match[3]);
        const rh = parseFloat(match[4]);

        if (isNaN(rx) || isNaN(ry) || isNaN(rw) || isNaN(rh)) continue;
        const absW = Math.abs(rw);
        const absH = Math.abs(rh);

        // Ignore full-page background rectangles or tiny hairlines (< 18pt)
        if (absW >= pageWidth * 0.94 && absH >= pageHeight * 0.94) continue;
        if (absW < 28 || absH < 18) continue;

        const normX = Math.max(0, Math.round(rw < 0 ? rx + rw : rx));
        const normBottomY = rh < 0 ? ry + rh : ry;
        const topY = Math.max(0, Math.round(pageHeight - normBottomY - absH));

        // Avoid duplicate rectangles at the exact same coordinates
        const isDup = detected.some(
          (d) =>
            Math.abs(d.x - normX) < 4 &&
            Math.abs(d.y - topY) < 4 &&
            Math.abs(d.width - Math.round(absW)) < 4 &&
            Math.abs(d.height - Math.round(absH)) < 4
        );
        if (!isDup && detected.length < 18) {
          detected.push({
            x: normX,
            y: topY,
            width: Math.round(absW),
            height: Math.round(absH),
            fillHex: '#F4F3FF',
            strokeHex: '#DDD6FE'
          });
        }
      }
    };

    if (typeof Contents.size === 'function') {
      for (let i = 0; i < Contents.size(); i++) {
        inspectStreamRef(Contents.get(i));
      }
    } else {
      inspectStreamRef(Contents);
    }
  } catch {
    // Safe fallback if stream is non-standard
  }
  return detected;
}

export async function parseDocumentIntoEditorModel(
  pdfBytes: Uint8Array
): Promise<ParsedEditorDocument> {
  const layout = await extractPdfTextAndLayout(pdfBytes);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pdfJsDoc = await loadPdfJsDocument(pdfBytes.slice(0));

  const pages: PdfPageDescriptor[] = [];
  const objects: PdfEditableObject[] = [];

  for (let i = 0; i < layout.numPages; i++) {
    const pageStruct = layout.pages[i];
    const pdfLibPage = pdfDoc.getPage(i);
    const rotation = pdfLibPage.getRotation().angle || 0;

    let thumbnailUrl = '';
    try {
      const thumb = await renderPdfPageToDataUrl(pdfBytes, i + 1, 0.35, 'image/jpeg', 0.8);
      thumbnailUrl = thumb.dataUrl;
    } catch {
      thumbnailUrl = '';
    }

    const charCount = pageStruct.textRuns.reduce((acc, r) => acc + r.str.trim().length, 0);
    let pageClassInfo = {
      classification: (pageStruct.textRuns.length === 0 ? 'scanned' : 'native') as
        | 'native'
        | 'scanned'
        | 'mixed',
      nativeTextRunCount: pageStruct.textRuns.length,
      characterCount: charCount,
      imageXObjectCount: 0,
      isScannedCandidate: pageStruct.textRuns.length === 0
    };

    try {
      const pdfJsPage = await pdfJsDoc.getPage(i + 1);
      pageClassInfo = await classifyPdfPageContent(
        pdfJsPage,
        pageStruct.textRuns.length,
        charCount
      );
    } catch {
      // Fallback to text run heuristic
    }

    pages.push({
      pageIndex: i,
      originalPageIndex: i,
      width: pageStruct.width,
      height: pageStruct.height,
      rotation,
      deleted: false,
      isScannedCandidate: pageClassInfo.isScannedCandidate,
      pageClassification: pageClassInfo.classification,
      nativeTextRunCount: pageClassInfo.nativeTextRunCount,
      imageXObjectCount: pageClassInfo.imageXObjectCount,
      ocrProcessed: false,
      ocrRegionCount: 0,
      thumbnailUrl
    });

    // 1. Populate Native Vector Graphic / Box Objects from PDF content stream
    const nativeRects = extractNativeVectorRectanglesFromPage(
      pdfLibPage,
      pageStruct.width,
      pageStruct.height
    );
    nativeRects.forEach((nr, vIdx) => {
      objects.push({
        id: `obj-p${i + 1}-vec-${vIdx}`,
        pageIndex: i,
        type: 'native-shape',
        name: `PDF Graphic Block #${vIdx + 1} (${nr.width}×${nr.height}pt)`,
        isNative: true,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 2 + vIdx,
        x: nr.x,
        y: nr.y,
        width: nr.width,
        height: nr.height,
        originalX: nr.x,
        originalY: nr.y,
        originalWidth: nr.width,
        originalHeight: nr.height,
        rotation: 0,
        opacity: 1,
        shapeKind: 'rectangle',
        fillColor: nr.fillHex,
        fillOpacity: 1,
        transparentFill: false,
        strokeColor: nr.strokeHex,
        strokeWidth: 1,
        strokeOpacity: 1,
        strokeStyle: 'solid',
        cornerRadius: 0
      });
    });

    // 2. Populate Native Text Objects from extracted runs
    pageStruct.textRuns.forEach((run, rIdx) => {
      const isMono =
        run.fontName.toLowerCase().includes('courier') ||
        run.fontName.toLowerCase().includes('mono');
      const isSerif =
        run.fontName.toLowerCase().includes('times') ||
        run.fontName.toLowerCase().includes('serif');
      const isBold = run.fontName.toLowerCase().includes('bold');
      const isItalic =
        run.fontName.toLowerCase().includes('italic') ||
        run.fontName.toLowerCase().includes('oblique');

      const normW = Math.max(24, run.width);
      const normH = Math.max(14, run.height);

      objects.push({
        id: `obj-p${i + 1}-text-${rIdx}`,
        pageIndex: i,
        type: 'native-text',
        name: `Text: "${run.str.slice(0, 26)}${run.str.length > 26 ? '…' : ''}"`,
        isNative: true,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 20 + rIdx,
        x: run.x,
        y: run.y,
        width: normW,
        height: normH,
        originalX: run.x,
        originalY: run.y,
        originalWidth: normW,
        originalHeight: normH,
        rotation: 0,
        opacity: 1,
        text: run.str,
        originalText: run.str,
        fontFamily: isMono ? 'Courier' : isSerif ? 'Times-Roman' : 'Helvetica',
        fontSize: run.fontSize,
        fontWeight: isBold ? 'bold' : 'normal',
        fontStyle: isItalic ? 'italic' : 'normal',
        underline: false,
        color: '#18181B',
        textAlign: 'left',
        lineHeight: 1.2,
        letterSpacing: 0
      });
    });
  }

  try {
    await (pdfJsDoc as any).destroy?.();
  } catch {
    // Ignore cleanup errors
  }

  // 3. Inspect existing AcroForm fields and add them to the object model
  let hasXfa = false;
  try {
    const form = pdfDoc.getForm();
    hasXfa = form.hasXFA();
    const fields = form.getFields();
    fields.forEach((field, fIdx) => {
      const name = field.getName();
      const widgets = field.acroField.getWidgets();
      widgets.forEach((w, wIdx) => {
        const rect = w.getRectangle();
        let pageIdx = 0;
        const pageRef = w.P();
        if (pageRef) {
          const foundIdx = pdfDoc.getPages().findIndex((p) => p.ref === pageRef);
          if (foundIdx >= 0) pageIdx = foundIdx;
        }
        const pageHeight = pages[pageIdx]?.height || 792;
        const topY = Math.max(0, pageHeight - rect.y - rect.height);

        const constructorName = field.constructor.name.toLowerCase();
        const isCheck = constructorName.includes('checkbox');
        let fieldVal: string | boolean = '';
        try {
          if (isCheck && 'isChecked' in field) {
            fieldVal = (field as any).isChecked();
          } else if ('getText' in field) {
            fieldVal = (field as any).getText() || '';
          }
        } catch {
          fieldVal = '';
        }

        const fw = Math.max(18, Math.round(rect.width));
        const fh = Math.max(18, Math.round(rect.height));

        objects.push({
          id: `obj-p${pageIdx + 1}-form-${fIdx}-${wIdx}`,
          pageIndex: pageIdx,
          type: 'form-field',
          name: `Form Field: ${name}`,
          isNative: true,
          visible: true,
          locked: false,
          deleted: false,
          zIndex: 200 + fIdx,
          x: Math.round(rect.x),
          y: Math.round(topY),
          width: fw,
          height: fh,
          originalX: Math.round(rect.x),
          originalY: Math.round(topY),
          originalWidth: fw,
          originalHeight: fh,
          rotation: 0,
          opacity: 1,
          fieldType: isCheck ? 'checkbox' : 'text',
          fieldName: name,
          fieldValue: fieldVal
        });
      });
    });
  } catch {
    // Document may not contain AcroForm
  }

  return {
    pages,
    objects,
    outline: layout.outline,
    metadata: {
      title: pdfDoc.getTitle() || '',
      author: pdfDoc.getAuthor() || '',
      subject: pdfDoc.getSubject() || '',
      keywords: pdfDoc.getKeywords() || '',
      creator: pdfDoc.getCreator() || '',
      producer: pdfDoc.getProducer() || ''
    },
    hasXfa
  };
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function stringToHexPattern(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Strips specific strings from a PDF page's raw content stream (handling both
 * parenthesized literal strings and hex-encoded <...> PDF strings) so removed,
 * modified, or redacted text is genuinely purged from underlying PDF operators.
 */
function purgeStringsFromPageContentStream(pdfPage: any, stringsToPurge: string[]) {
  if (!stringsToPurge.length) return;
  try {
    const { Contents } = pdfPage.node.normalizedEntries();
    if (!Contents) return;
    const context = pdfPage.doc.context;

    const processStreamRef = (ref: any) => {
      const stream = context.lookup(ref);
      if (stream instanceof PDFRawStream) {
        const decodedBytes = decodePDFRawStream(stream).decode();
        let contentStr = new TextDecoder('latin1').decode(decodedBytes);
        let modified = false;

        for (const target of stringsToPurge) {
          if (!target || target.trim().length < 2) continue;

          const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const literalRegex = new RegExp(`\\([^()]*${escaped}[^()]*\\)\\s*(Tj|')`, 'g');
          if (literalRegex.test(contentStr)) {
            contentStr = contentStr.replace(literalRegex, '() Tj');
            modified = true;
          }

          const fullHex = stringToHexPattern(target);
          if (fullHex.length >= 4) {
            const hexRegex = new RegExp(`<[0-9a-fA-F]*${fullHex}[0-9a-fA-F]*>\\s*(Tj|')`, 'gi');
            if (hexRegex.test(contentStr)) {
              contentStr = contentStr.replace(hexRegex, '<> Tj');
              modified = true;
            }
          }

          const tokens = target.split(/\s+/).filter((t) => t.length >= 3);
          for (const tok of tokens) {
            const tokEsc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const tokLitRegex = new RegExp(`\\([^()]*${tokEsc}[^()]*\\)`, 'g');
            if (tokLitRegex.test(contentStr)) {
              contentStr = contentStr.replace(tokLitRegex, '()');
              modified = true;
            }
            const tokHex = stringToHexPattern(tok);
            const tokHexRegex = new RegExp(`<[0-9a-fA-F]*${tokHex}[0-9a-fA-F]*>`, 'gi');
            if (tokHexRegex.test(contentStr)) {
              contentStr = contentStr.replace(tokHexRegex, '<>');
              modified = true;
            }
          }
        }

        if (modified) {
          const updatedBytes = new Uint8Array(contentStr.length);
          for (let i = 0; i < contentStr.length; i++) {
            updatedBytes[i] = contentStr.charCodeAt(i) & 0xff;
          }
          const newStream = context.flateStream(updatedBytes);
          context.assign(ref, newStream);
        }
      }
    };

    if (typeof Contents.size === 'function') {
      for (let i = 0; i < Contents.size(); i++) {
        processStreamRef(Contents.get(i));
      }
    } else {
      processStreamRef(Contents);
    }
  } catch {
    // Fallback handled by stream reconstruction below
  }
}

/**
 * Helper to load a data URL into an HTMLImageElement in browser context
 */
function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

/**
 * Renders a complex shape (with Background Blur of underlying PDF content, Object Blur,
 * Rounded Corners, Polygon sides, Gradient Fill, Dashed/Dotted Borders, or Drop Shadow)
 * to a high-DPI PNG byte array so the exported PDF matches the editor canvas 100%.
 */
async function renderAdvancedShapeToPngBytes(
  obj: PdfEditableObject,
  pageBgImage: HTMLImageElement | null,
  pageWidth: number,
  pageHeight: number
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null;

  const scale = 2; // 2x retina rasterization for crisp vector-grade edges
  const pad = obj.shadow?.enabled ? Math.ceil((obj.shadow.blur + Math.max(Math.abs(obj.shadow.offsetX), Math.abs(obj.shadow.offsetY))) * scale) : 4;
  const w = Math.max(4, Math.round(obj.width * scale));
  const h = Math.max(4, Math.round(obj.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const kind = obj.shapeKind || 'rectangle';
  const strokeW = (obj.strokeWidth ?? 2) * scale;
  const inset = strokeW / 2;

  const defineShapePath = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    if (kind === 'circle' || kind === 'ellipse') {
      c.ellipse(
        pad + w / 2,
        pad + h / 2,
        Math.max(1, w / 2 - inset),
        Math.max(1, h / 2 - inset),
        0,
        0,
        Math.PI * 2
      );
    } else if (kind === 'polygon') {
      const sides = Math.max(3, Math.min(12, obj.polygonSides || 5));
      const cx = pad + w / 2;
      const cy = pad + h / 2;
      const rx = Math.max(2, w / 2 - inset);
      const ry = Math.max(2, h / 2 - inset);
      for (let s = 0; s < sides; s++) {
        const angle = (s * 2 * Math.PI) / sides - Math.PI / 2;
        const px = cx + rx * Math.cos(angle);
        const py = cy + ry * Math.sin(angle);
        if (s === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    } else if (kind === 'rounded-rectangle' || (obj.cornerRadius && obj.cornerRadius > 0)) {
      const r = Math.min((obj.cornerRadius || 12) * scale, w / 2 - inset, h / 2 - inset);
      c.roundRect(pad + inset, pad + inset, Math.max(2, w - inset * 2), Math.max(2, h - inset * 2), Math.max(0, r));
    } else {
      c.rect(pad + inset, pad + inset, Math.max(2, w - inset * 2), Math.max(2, h - inset * 2));
    }
  };

  ctx.save();
  if (obj.objectBlur && obj.objectBlur > 0) {
    ctx.filter = `blur(${obj.objectBlur * scale}px)`;
  }

  // 1. If Background Blur (`backdropBlur > 0`) is enabled and we have the underlying page image,
  // clip strictly to the shape geometry and draw the blurred underlying PDF page region!
  if (obj.backdropBlur && obj.backdropBlur > 0 && pageBgImage) {
    ctx.save();
    defineShapePath(ctx);
    ctx.clip();
    ctx.filter = `blur(${obj.backdropBlur * scale}px)`;

    const imgScaleX = pageBgImage.width / pageWidth;
    const imgScaleY = pageBgImage.height / pageHeight;
    ctx.drawImage(
      pageBgImage,
      0,
      0,
      pageBgImage.width,
      pageBgImage.height,
      pad - obj.x * scale,
      pad - obj.y * scale,
      pageWidth * scale * (imgScaleX / (pageBgImage.width / pageWidth)),
      pageHeight * scale * (imgScaleY / (pageBgImage.height / pageHeight))
    );
    ctx.restore();
  }

  // 2. Apply Drop Shadow if enabled
  if (obj.shadow?.enabled) {
    ctx.shadowColor = obj.shadow.color || 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = (obj.shadow.blur || 8) * scale;
    ctx.shadowOffsetX = (obj.shadow.offsetX || 0) * scale;
    ctx.shadowOffsetY = (obj.shadow.offsetY || 4) * scale;
  }

  // 3. Fill Shape (unless transparentFill is true)
  const fillOpacity = obj.fillOpacity ?? (kind === 'highlight' ? 0.38 : 1);
  if (!obj.transparentFill && obj.fillColor && fillOpacity > 0) {
    ctx.save();
    defineShapePath(ctx);
    ctx.globalAlpha = fillOpacity * (obj.opacity ?? 1);
    if (obj.gradientFill?.enabled && obj.gradientFill.toColor) {
      const grad = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
      grad.addColorStop(0, obj.fillColor);
      grad.addColorStop(1, obj.gradientFill.toColor);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = obj.fillColor;
    }
    ctx.fill();
    ctx.restore();
  }

  // Reset shadow before drawing border
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // 4. Stroke Border (with independent strokeOpacity and strokeStyle)
  const strokeOpacity = obj.strokeOpacity ?? 1;
  if (strokeW > 0 && obj.strokeColor && strokeOpacity > 0 && kind !== 'highlight') {
    ctx.save();
    defineShapePath(ctx);
    ctx.globalAlpha = strokeOpacity * (obj.opacity ?? 1);
    ctx.strokeStyle = obj.strokeColor;
    ctx.lineWidth = strokeW;
    if (obj.strokeStyle === 'dashed') {
      ctx.setLineDash([strokeW * 3, strokeW * 2]);
    } else if (obj.strokeStyle === 'dotted') {
      ctx.setLineDash([strokeW * 1.2, strokeW * 1.8]);
      ctx.lineCap = 'round';
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  if (!base64) return null;
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export interface ExportEditorOptions {
  applyHiddenToExport: boolean;
  flattenForms: boolean;
  stripMetadataOnRedact: boolean;
  scannedExportMode?: ScannedExportMode;
  documentTitle?: string;
}

export interface ExportVerificationReport {
  validPdfHeader: boolean;
  exportedPageCount: number;
  removedCount: number;
  hiddenAppliedCount: number;
  redactionCount: number;
  ocrRegionsExportedCount?: number;
  scannedBgPatchesCount?: number;
  scannedExportModeUsed?: ScannedExportMode;
  purgedStringsVerifiedAbsent: boolean;
  cryptoSignatures: Array<{ signer: string; sha256: string; timestamp: string }>;
}

export async function exportEditedPdfDocument(
  originalBytes: Uint8Array,
  pages: PdfPageDescriptor[],
  objects: PdfEditableObject[],
  options: ExportEditorOptions
): Promise<{ bytes: Uint8Array; verification: ExportVerificationReport }> {
  const srcDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();

  if (options.documentTitle) {
    outDoc.setTitle(options.documentTitle);
  } else if (srcDoc.getTitle()) {
    outDoc.setTitle(srcDoc.getTitle()!);
  }

  const fonts = {
    'Helvetica-normal-normal': await outDoc.embedFont(StandardFonts.Helvetica),
    'Helvetica-bold-normal': await outDoc.embedFont(StandardFonts.HelveticaBold),
    'Helvetica-normal-italic': await outDoc.embedFont(StandardFonts.HelveticaOblique),
    'Helvetica-bold-italic': await outDoc.embedFont(StandardFonts.HelveticaBoldOblique),
    'Times-Roman-normal-normal': await outDoc.embedFont(StandardFonts.TimesRoman),
    'Times-Roman-bold-normal': await outDoc.embedFont(StandardFonts.TimesRomanBold),
    'Times-Roman-normal-italic': await outDoc.embedFont(StandardFonts.TimesRomanItalic),
    'Times-Roman-bold-italic': await outDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
    'Courier-normal-normal': await outDoc.embedFont(StandardFonts.Courier),
    'Courier-bold-normal': await outDoc.embedFont(StandardFonts.CourierBold),
    'Courier-normal-italic': await outDoc.embedFont(StandardFonts.CourierOblique),
    'Courier-bold-italic': await outDoc.embedFont(StandardFonts.CourierBoldOblique)
  };

  const getFont = (
    family: 'Helvetica' | 'Times-Roman' | 'Courier' = 'Helvetica',
    weight: 'normal' | 'bold' = 'normal',
    style: 'normal' | 'italic' = 'normal'
  ) => {
    const key = `${family}-${weight}-${style}` as keyof typeof fonts;
    return fonts[key] || fonts['Helvetica-normal-normal'];
  };

  const activePages = pages.filter((p) => !p.deleted);
  const allPurgedStrings: string[] = [];
  let removedCount = 0;
  let hiddenAppliedCount = 0;
  let redactionCount = 0;
  const cryptoSignatures: Array<{ signer: string; sha256: string; timestamp: string }> = [];

  const outForm = outDoc.getForm();

  for (let outIdx = 0; outIdx < activePages.length; outIdx++) {
    const pageDesc = activePages[outIdx];
    let outPage;

    if (pageDesc.originalPageIndex >= 0 && pageDesc.originalPageIndex < srcDoc.getPageCount()) {
      const [copiedPage] = await outDoc.copyPages(srcDoc, [pageDesc.originalPageIndex]);
      outPage = outDoc.addPage(copiedPage);
    } else {
      outPage = outDoc.addPage([pageDesc.width || 612, pageDesc.height || 792]);
    }

    outPage.setRotation(degrees(pageDesc.rotation % 360));
    if (pageDesc.cropBox) {
      const cb = pageDesc.cropBox;
      const pdfY = Math.max(0, pageDesc.height - cb.y - cb.height);
      outPage.setCropBox(cb.x, pdfY, cb.width, cb.height);
    }

    const pageObjects = objects
      .filter((o) => o.pageIndex === pageDesc.pageIndex)
      .sort((a, b) => a.zIndex - b.zIndex);

    const pageRedactions = pageObjects.filter((o) => o.type === 'redaction' && !o.deleted);
    redactionCount += pageRedactions.length;

    // Pre-render page background image only if at least one object on this page uses backdropBlur
    let pageBgImage: HTMLImageElement | null = null;
    const needsPageBgForBlur = pageObjects.some(
      (o) => !o.deleted && o.visible && o.backdropBlur && o.backdropBlur > 0
    );
    if (needsPageBgForBlur && pageDesc.originalPageIndex >= 0) {
      try {
        const rendered = await renderPdfPageToDataUrl(
          originalBytes,
          pageDesc.originalPageIndex + 1,
          2.0,
          'image/png'
        );
        pageBgImage = await loadImageFromDataUrl(rendered.dataUrl);
      } catch {
        pageBgImage = null;
      }
    }

    const stringsToPurgeOnPage: string[] = [];

    // Pass 1: Handle Native Objects (native-shape, native-image, native-text)
    for (const obj of pageObjects) {
      const isIntersectedByRedaction = pageRedactions.some((red) =>
        rectsIntersect(
          { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
          { x: red.x, y: red.y, width: red.width, height: red.height }
        )
      );

      if (obj.isNative && (obj.type === 'native-shape' || obj.type === 'native-image')) {
        const isRemoved = obj.deleted;
        const isHiddenOnExport = !obj.visible && options.applyHiddenToExport;
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

        if (isRemoved) removedCount++;
        if (isHiddenOnExport) hiddenAppliedCount++;

        if (isRemoved || isHiddenOnExport || hasMovedOrResized || isIntersectedByRedaction) {
          // Cleanly mask original graphic region on page
          const origPdfY = Math.max(0, pageDesc.height - origY - origH);
          outPage.drawRectangle({
            x: Math.max(0, origX - 1),
            y: Math.max(0, origPdfY - 1),
            width: origW + 2,
            height: origH + 2,
            color: rgb(1, 1, 1)
          });
        }

        // If moved/resized/restyled and still active, redraw at new geometry
        if (hasMovedOrResized && !isRemoved && !isHiddenOnExport && !isIntersectedByRedaction) {
          const fill = hexToRgbNormalized(obj.fillColor || '#F4F3FF');
          const stroke = hexToRgbNormalized(obj.strokeColor || '#DDD6FE');
          const pdfY = Math.max(0, pageDesc.height - obj.y - obj.height);
          outPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.width,
            height: obj.height,
            color: obj.transparentFill ? undefined : rgb(fill.r, fill.g, fill.b),
            opacity: (obj.fillOpacity ?? 1) * (obj.opacity ?? 1),
            borderColor: rgb(stroke.r, stroke.g, stroke.b),
            borderWidth: obj.strokeWidth ?? 1,
            borderOpacity: (obj.strokeOpacity ?? 1) * (obj.opacity ?? 1),
            rotate: degrees(obj.rotation || 0)
          });
        }
      }

      if (obj.isNative && obj.type === 'native-text') {
        const isRemoved = obj.deleted;
        const isHiddenOnExport = !obj.visible && options.applyHiddenToExport;
        const origX = obj.originalX ?? obj.x;
        const origY = obj.originalY ?? obj.y;
        const origW = obj.originalWidth ?? obj.width;
        const origH = obj.originalHeight ?? obj.height;
        const hasMoved = Math.abs(obj.x - origX) > 1 || Math.abs(obj.y - origY) > 1;
        const isModified =
          hasMoved ||
          obj.text !== obj.originalText ||
          obj.color !== '#18181B' ||
          obj.fontWeight === 'bold' ||
          obj.fontStyle === 'italic' ||
          obj.underline ||
          (obj.rotation || 0) !== 0 ||
          (obj.opacity ?? 1) < 1;

        if (isRemoved) removedCount++;
        if (isHiddenOnExport) hiddenAppliedCount++;

        if (isRemoved || isHiddenOnExport || isModified || isIntersectedByRedaction) {
          if (obj.originalText) {
            stringsToPurgeOnPage.push(obj.originalText);
            if (isRemoved || isIntersectedByRedaction) {
              allPurgedStrings.push(obj.originalText);
            }
          }
          // Mask original bounding area cleanly on canvas
          const origPdfY = Math.max(0, pageDesc.height - origY - origH);
          outPage.drawRectangle({
            x: Math.max(0, origX - 1),
            y: Math.max(0, origPdfY - 2),
            width: origW + 2,
            height: origH + 4,
            color: rgb(1, 1, 1)
          });
        }

        if (
          isModified &&
          !isRemoved &&
          !isHiddenOnExport &&
          !isIntersectedByRedaction &&
          obj.text &&
          obj.text.trim()
        ) {
          const font = getFont(obj.fontFamily, obj.fontWeight, obj.fontStyle);
          const fontSize = obj.fontSize || 12;
          const { r, g, b } = hexToRgbNormalized(obj.color || '#18181B');
          const pdfY = Math.max(0, pageDesc.height - obj.y - fontSize * 0.88);

          outPage.drawText(obj.text, {
            x: obj.x,
            y: pdfY,
            size: fontSize,
            font,
            color: rgb(r, g, b),
            opacity: obj.opacity ?? 1,
            rotate: degrees(obj.rotation || 0)
          });

          if (obj.underline) {
            outPage.drawLine({
              start: { x: obj.x, y: pdfY - 2 },
              end: { x: obj.x + obj.width, y: pdfY - 2 },
              thickness: 1,
              color: rgb(r, g, b)
            });
          }
        }
      }
    }

    const scannedExportMode: ScannedExportMode =
      options.scannedExportMode || 'visually-edited';

    // Pass 1.5: Handle OCR Scanned Text Regions ('ocr-text') — Background Reconstruction & Replacement
    for (const obj of pageObjects) {
      if (obj.type !== 'ocr-text') continue;

      const isRemoved = obj.deleted;
      const isHiddenOnExport = !obj.visible && options.applyHiddenToExport;
      const isIntersectedByRedaction = pageRedactions.some((red) =>
        rectsIntersect(
          { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
          { x: red.x, y: red.y, width: red.width, height: red.height }
        )
      );

      const origX = obj.originalX ?? obj.x;
      const origY = obj.originalY ?? obj.y;
      const origW = obj.originalWidth ?? obj.width;
      const origH = obj.originalHeight ?? obj.height;
      const hasMoved = Math.abs(obj.x - origX) > 1 || Math.abs(obj.y - origY) > 1;
      const isTextModified = obj.ocrEdited || obj.text !== obj.originalText || hasMoved;

      if (isRemoved) removedCount++;
      if (isHiddenOnExport) hiddenAppliedCount++;

      // Reconstruct background over original scanned text region if modified, moved, deleted, hidden, or redacted
      if (
        (isRemoved || isHiddenOnExport || isTextModified || isIntersectedByRedaction) &&
        scannedExportMode !== 'searchable-ocr'
      ) {
        const pad = obj.bgMaskPadding ?? 2;
        const patchX = Math.max(0, origX - pad);
        const patchY = Math.max(0, origY - pad);
        const patchW = Math.max(6, origW + pad * 2);
        const patchH = Math.max(6, origH + pad * 2);
        const patchPdfY = Math.max(0, pageDesc.height - patchY - patchH);

        if (obj.bgPatchDataUrl && obj.bgReconstructionMethod !== 'manual-solid') {
          try {
            const b64 = obj.bgPatchDataUrl.split(',')[1];
            const patchBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const embeddedPatch = await outDoc.embedPng(patchBytes);
            outPage.drawImage(embeddedPatch, {
              x: patchX,
              y: patchPdfY,
              width: patchW,
              height: patchH
            });
          } catch {
            const bgRgb = hexToRgbNormalized(obj.sampledBgColor || '#FAF8F5');
            outPage.drawRectangle({
              x: patchX,
              y: patchPdfY,
              width: patchW,
              height: patchH,
              color: rgb(bgRgb.r, bgRgb.g, bgRgb.b)
            });
          }
        } else {
          const fillHex =
            obj.bgReconstructionMethod === 'manual-solid' && obj.fillColor
              ? obj.fillColor
              : obj.sampledBgColor || '#FAF8F5';
          const bgRgb = hexToRgbNormalized(fillHex);
          outPage.drawRectangle({
            x: patchX,
            y: patchPdfY,
            width: patchW,
            height: patchH,
            color: rgb(bgRgb.r, bgRgb.g, bgRgb.b)
          });
        }
      }

      if (isRemoved || isHiddenOnExport || isIntersectedByRedaction) {
        continue;
      }

      // Render replacement text (if modified/moved) OR searchable invisible OCR layer
      if (isTextModified && scannedExportMode !== 'searchable-ocr' && obj.text && obj.text.trim()) {
        if (hasNonWinAnsiChars(obj.text) && typeof document !== 'undefined') {
          // High-DPI Unicode / Urdu RTL rasterized glyph layer
          try {
            const rendered = renderUnicodeTextToPngDataUrl(obj);
            const b64 = rendered.dataUrl.split(',')[1];
            const pngBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const embeddedGlyphs = await outDoc.embedPng(pngBytes);
            const glyphPdfY = Math.max(0, pageDesc.height - obj.y - rendered.heightPt);
            outPage.drawImage(embeddedGlyphs, {
              x: obj.x,
              y: glyphPdfY,
              width: rendered.widthPt,
              height: rendered.heightPt,
              opacity: obj.opacity ?? 1,
              rotate: degrees(obj.rotation || 0)
            });
          } catch {
            // Safe fallback
          }
        } else {
          const font = getFont(obj.fontFamily, obj.fontWeight, obj.fontStyle);
          const fontSize = obj.fontSize || 11;
          const { r, g, b } = hexToRgbNormalized(
            obj.color || obj.sampledTextColor || '#18181B'
          );
          const pdfY = Math.max(0, pageDesc.height - obj.y - fontSize * 0.88);
          const safeAscii = (obj.text || '').replace(/[^\x20-\xFF]/g, '');
          if (safeAscii) {
            outPage.drawText(safeAscii, {
              x: obj.x,
              y: pdfY,
              size: fontSize,
              font,
              color: rgb(r, g, b),
              opacity: obj.opacity ?? 1,
              rotate: degrees(obj.rotation || 0)
            });
          }
        }
      } else if (scannedExportMode === 'searchable-ocr' && obj.text && obj.text.trim()) {
        // Mode A: Searchable Scanned PDF — embed invisible selectable text layer at exact OCR coordinates
        const safeWinAnsi = (obj.text || '').replace(/[^\x20-\xFF]/g, '');
        if (safeWinAnsi.trim()) {
          const font = getFont('Helvetica', 'normal', 'normal');
          const fontSize = Math.max(6, obj.fontSize || 10);
          const pdfY = Math.max(0, pageDesc.height - obj.y - fontSize * 0.88);
          outPage.drawText(safeWinAnsi, {
            x: obj.x,
            y: pdfY,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
            opacity: 0.01 // Visually invisible, 100% searchable & selectable in PDF viewers
          });
        }
      }
    }

    // Purge deleted/redacted/modified strings from the underlying raw PDF stream
    purgeStringsFromPageContentStream(outPage, stringsToPurgeOnPage);

    // Pass 2: Render added/editor-managed objects, cover overlays, shapes, images, form fields
    for (const obj of pageObjects) {
      if (obj.deleted || obj.type === 'ocr-text') continue;
      if (!obj.visible && options.applyHiddenToExport) continue;

      const isIntersectedByRedaction =
        obj.type !== 'redaction' &&
        pageRedactions.some((red) =>
          rectsIntersect(
            { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
            { x: red.x, y: red.y, width: red.width, height: red.height }
          )
        );
      if (isIntersectedByRedaction) continue;

      const pdfY = Math.max(0, pageDesc.height - obj.y - obj.height);

      if (obj.type === 'added-text' || obj.type === 'watermark') {
        if (hasNonWinAnsiChars(obj.text || '') && typeof document !== 'undefined') {
          try {
            const rendered = renderUnicodeTextToPngDataUrl(obj);
            const b64 = rendered.dataUrl.split(',')[1];
            const pngBytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const embeddedGlyphs = await outDoc.embedPng(pngBytes);
            const glyphPdfY = Math.max(0, pageDesc.height - obj.y - rendered.heightPt);
            outPage.drawImage(embeddedGlyphs, {
              x: obj.x,
              y: glyphPdfY,
              width: rendered.widthPt,
              height: rendered.heightPt,
              opacity: obj.opacity ?? (obj.type === 'watermark' ? 0.22 : 1),
              rotate: degrees(obj.rotation || 0)
            });
          } catch {
            // Safe fallback
          }
        } else {
          const font = getFont(obj.fontFamily, obj.fontWeight, obj.fontStyle);
          const fontSize = obj.fontSize || (obj.type === 'watermark' ? 42 : 14);
          const { r, g, b } = hexToRgbNormalized(obj.color || '#18181B');
          const textLines = (obj.text || '').split('\n');
          const lineHeight = (obj.lineHeight || 1.25) * fontSize;

          textLines.forEach((line, lIdx) => {
            const safeLine = line.replace(/[^\x20-\xFF]/g, '');
            const lineY = pageDesc.height - obj.y - fontSize * 0.88 - lIdx * lineHeight;
            outPage.drawText(safeLine, {
              x: obj.x,
              y: Math.max(0, lineY),
              size: fontSize,
              font,
              color: rgb(r, g, b),
              opacity: obj.opacity ?? (obj.type === 'watermark' ? 0.22 : 1),
              rotate: degrees(obj.rotation || 0)
            });
          });

          if (obj.underline) {
            outPage.drawLine({
              start: { x: obj.x, y: pageDesc.height - obj.y - fontSize - 2 },
              end: { x: obj.x + obj.width, y: pageDesc.height - obj.y - fontSize - 2 },
              thickness: 1,
              color: rgb(r, g, b),
              opacity: obj.opacity ?? 1
            });
          }
        }
      } else if (obj.type === 'added-image' || obj.type === 'signature') {
        if (obj.imageDataUrl) {
          try {
            let finalDataUrl = obj.imageDataUrl;
            // If image has crop or objectBlur, process through offscreen canvas
            const hasCrop =
              obj.crop &&
              (obj.crop.top > 0 || obj.crop.right > 0 || obj.crop.bottom > 0 || obj.crop.left > 0);
            if ((hasCrop || (obj.objectBlur && obj.objectBlur > 0)) && typeof document !== 'undefined') {
              const srcImg = await loadImageFromDataUrl(obj.imageDataUrl);
              const c = document.createElement('canvas');
              const cropL = ((obj.crop?.left || 0) / 100) * srcImg.width;
              const cropR = ((obj.crop?.right || 0) / 100) * srcImg.width;
              const cropT = ((obj.crop?.top || 0) / 100) * srcImg.height;
              const cropB = ((obj.crop?.bottom || 0) / 100) * srcImg.height;
              const sw = Math.max(4, srcImg.width - cropL - cropR);
              const sh = Math.max(4, srcImg.height - cropT - cropB);
              c.width = sw;
              c.height = sh;
              const cCtx = c.getContext('2d');
              if (cCtx) {
                if (obj.objectBlur && obj.objectBlur > 0) {
                  cCtx.filter = `blur(${obj.objectBlur}px)`;
                }
                cCtx.drawImage(srcImg, cropL, cropT, sw, sh, 0, 0, sw, sh);
                finalDataUrl = c.toDataURL('image/png');
              }
            }

            const base64Data = finalDataUrl.split(',')[1];
            const imgBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
            const embeddedImg =
              finalDataUrl.includes('image/jpeg') && !finalDataUrl.includes('image/png')
                ? await outDoc.embedJpg(imgBytes)
                : await outDoc.embedPng(imgBytes);

            outPage.drawImage(embeddedImg, {
              x: obj.x,
              y: pdfY,
              width: obj.width,
              height: obj.height,
              opacity: obj.opacity ?? 1,
              rotate: degrees(obj.rotation || 0)
            });
          } catch {
            // Fallback if image format differs
          }
        } else if (obj.type === 'signature' && obj.text) {
          const font = getFont('Times-Roman', 'bold', 'italic');
          const { r, g, b } = hexToRgbNormalized(obj.color || '#1E1B4B');
          outPage.drawText(obj.text, {
            x: obj.x + 6,
            y: pdfY + obj.height * 0.3,
            size: obj.fontSize || 22,
            font,
            color: rgb(r, g, b)
          });
        }

        if (obj.type === 'signature' && obj.signatureKind === 'cryptographic-sha256') {
          const hash = obj.signatureHash || 'SHA256-VERIFIED';
          const stampFont = getFont('Courier', 'normal', 'normal');
          outPage.drawRectangle({
            x: obj.x,
            y: Math.max(0, pdfY - 14),
            width: obj.width,
            height: 14,
            color: rgb(0.94, 0.93, 0.98)
          });
          outPage.drawText(`SHA-256: ${hash.slice(0, 24)}...`, {
            x: obj.x + 4,
            y: Math.max(2, pdfY - 10),
            size: 7,
            font: stampFont,
            color: rgb(0.25, 0.15, 0.55)
          });
          cryptoSignatures.push({
            signer: obj.signerName || obj.text || 'Authorized Signer',
            sha256: hash,
            timestamp: new Date().toISOString()
          });
        }
      } else if (obj.type === 'shape' || obj.type === 'annotation') {
        const fill = !obj.transparentFill && obj.fillColor ? hexToRgbNormalized(obj.fillColor) : null;
        const stroke = hexToRgbNormalized(obj.strokeColor || obj.color || '#7C3AED');
        const kind = obj.shapeKind || 'rectangle';
        const fillAlpha = (obj.fillOpacity ?? 1) * (obj.opacity ?? 1);
        const strokeAlpha = (obj.strokeOpacity ?? 1) * (obj.opacity ?? 1);
        const dashArray =
          obj.strokeStyle === 'dashed'
            ? [6, 4]
            : obj.strokeStyle === 'dotted'
            ? [2, 3]
            : undefined;

        // Check if this shape uses advanced visual effects (Background Blur, Object Blur, Shadow, Rounded Rect, Polygon, Gradient)
        const usesAdvancedCanvasRender =
          (obj.backdropBlur && obj.backdropBlur > 0) ||
          (obj.objectBlur && obj.objectBlur > 0) ||
          obj.shadow?.enabled ||
          obj.gradientFill?.enabled ||
          kind === 'rounded-rectangle' ||
          kind === 'polygon' ||
          (obj.cornerRadius && obj.cornerRadius > 0);

        if (
          usesAdvancedCanvasRender &&
          kind !== 'line' &&
          kind !== 'arrow' &&
          kind !== 'freehand' &&
          kind !== 'sticky-note'
        ) {
          const pngBytes = await renderAdvancedShapeToPngBytes(
            obj,
            pageBgImage,
            pageDesc.width,
            pageDesc.height
          );
          if (pngBytes) {
            const embeddedPatch = await outDoc.embedPng(pngBytes);
            const padPt = obj.shadow?.enabled
              ? Math.ceil(obj.shadow.blur + Math.max(Math.abs(obj.shadow.offsetX), Math.abs(obj.shadow.offsetY)))
              : 2;
            outPage.drawImage(embeddedPatch, {
              x: obj.x - padPt,
              y: pdfY - padPt,
              width: obj.width + padPt * 2,
              height: obj.height + padPt * 2,
              rotate: degrees(obj.rotation || 0)
            });
            continue;
          }
        }

        if (kind === 'highlight') {
          const hl = hexToRgbNormalized(obj.fillColor || '#FACC15');
          outPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.width,
            height: obj.height,
            color: rgb(hl.r, hl.g, hl.b),
            opacity: obj.fillOpacity ?? obj.opacity ?? 0.38
          });
        } else if (kind === 'underline-mark') {
          outPage.drawLine({
            start: { x: obj.x, y: pdfY + 2 },
            end: { x: obj.x + obj.width, y: pdfY + 2 },
            thickness: obj.strokeWidth || 2,
            color: rgb(stroke.r, stroke.g, stroke.b),
            opacity: strokeAlpha,
            dashArray
          });
        } else if (kind === 'strikethrough') {
          outPage.drawLine({
            start: { x: obj.x, y: pdfY + obj.height / 2 },
            end: { x: obj.x + obj.width, y: pdfY + obj.height / 2 },
            thickness: obj.strokeWidth || 2,
            color: rgb(stroke.r, stroke.g, stroke.b),
            opacity: strokeAlpha,
            dashArray
          });
        } else if (kind === 'circle' || kind === 'ellipse') {
          outPage.drawEllipse({
            x: obj.x + obj.width / 2,
            y: pdfY + obj.height / 2,
            xScale: obj.width / 2,
            yScale: obj.height / 2,
            color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
            opacity: fill ? fillAlpha : 0,
            borderColor: (obj.strokeWidth ?? 2) > 0 ? rgb(stroke.r, stroke.g, stroke.b) : undefined,
            borderWidth: obj.strokeWidth ?? 2,
            borderOpacity: strokeAlpha,
            borderDashArray: dashArray
          });
        } else if (kind === 'line' || kind === 'arrow') {
          outPage.drawLine({
            start: { x: obj.x, y: pdfY + obj.height / 2 },
            end: { x: obj.x + obj.width, y: pdfY + obj.height / 2 },
            thickness: obj.strokeWidth || 2,
            color: rgb(stroke.r, stroke.g, stroke.b),
            opacity: strokeAlpha,
            dashArray
          });
          if (kind === 'arrow') {
            const endX = obj.x + obj.width;
            const midY = pdfY + obj.height / 2;
            outPage.drawLine({
              start: { x: endX - 8, y: midY + 5 },
              end: { x: endX, y: midY },
              thickness: obj.strokeWidth || 2,
              color: rgb(stroke.r, stroke.g, stroke.b),
              opacity: strokeAlpha
            });
            outPage.drawLine({
              start: { x: endX - 8, y: midY - 5 },
              end: { x: endX, y: midY },
              thickness: obj.strokeWidth || 2,
              color: rgb(stroke.r, stroke.g, stroke.b),
              opacity: strokeAlpha
            });
          }
        } else if (kind === 'freehand' && obj.points && obj.points.length > 1) {
          for (let p = 0; p < obj.points.length - 1; p++) {
            const pt1 = obj.points[p];
            const pt2 = obj.points[p + 1];
            outPage.drawLine({
              start: { x: obj.x + pt1.x, y: pageDesc.height - (obj.y + pt1.y) },
              end: { x: obj.x + pt2.x, y: pageDesc.height - (obj.y + pt2.y) },
              thickness: obj.strokeWidth || 2.5,
              color: rgb(stroke.r, stroke.g, stroke.b),
              opacity: strokeAlpha,
              dashArray
            });
          }
          if (obj.closePath && obj.points.length > 2) {
            const firstPt = obj.points[0];
            const lastPt = obj.points[obj.points.length - 1];
            outPage.drawLine({
              start: { x: obj.x + lastPt.x, y: pageDesc.height - (obj.y + lastPt.y) },
              end: { x: obj.x + firstPt.x, y: pageDesc.height - (obj.y + firstPt.y) },
              thickness: obj.strokeWidth || 2.5,
              color: rgb(stroke.r, stroke.g, stroke.b),
              opacity: strokeAlpha,
              dashArray
            });
          }
        } else if (kind === 'sticky-note') {
          const noteFill = hexToRgbNormalized(obj.fillColor || '#FEF08A');
          outPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.width,
            height: obj.height,
            color: rgb(noteFill.r, noteFill.g, noteFill.b),
            borderColor: rgb(0.85, 0.65, 0.1),
            borderWidth: 1,
            opacity: 0.95
          });
          if (obj.text) {
            const font = getFont('Helvetica', 'normal', 'normal');
            outPage.drawText(obj.text.slice(0, 80), {
              x: obj.x + 8,
              y: pdfY + obj.height - 18,
              size: 9.5,
              font,
              color: rgb(0.15, 0.12, 0.05),
              maxWidth: obj.width - 16,
              lineHeight: 12
            });
          }
        } else {
          outPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.width,
            height: obj.height,
            color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
            opacity: fill ? fillAlpha : 0,
            borderColor: (obj.strokeWidth ?? 2) > 0 ? rgb(stroke.r, stroke.g, stroke.b) : undefined,
            borderWidth: obj.strokeWidth ?? 2,
            borderOpacity: strokeAlpha,
            borderDashArray: dashArray,
            rotate: degrees(obj.rotation || 0)
          });
        }
      } else if (obj.type === 'form-field') {
        const safeName = `${obj.fieldName || 'field'}_${outIdx}_${obj.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        if (options.flattenForms) {
          outPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.width,
            height: obj.height,
            color: rgb(0.97, 0.97, 0.98),
            borderColor: rgb(0.7, 0.7, 0.76),
            borderWidth: 1
          });
          const font = getFont('Helvetica', 'normal', 'normal');
          const valText =
            obj.fieldType === 'checkbox'
              ? obj.fieldValue
                ? 'X'
                : ''
              : String(obj.fieldValue || '');
          if (valText) {
            outPage.drawText(valText, {
              x: obj.x + 4,
              y: pdfY + Math.max(4, (obj.height - 11) / 2),
              size: 10,
              font,
              color: rgb(0.1, 0.1, 0.14)
            });
          }
        } else if (!obj.isNative) {
          try {
            if (obj.fieldType === 'checkbox') {
              const cb = outForm.createCheckBox(safeName);
              if (obj.fieldValue) cb.check();
              cb.addToPage(outPage, { x: obj.x, y: pdfY, width: obj.width, height: obj.height });
            } else {
              const tf = outForm.createTextField(safeName);
              tf.setText(String(obj.fieldValue || ''));
              tf.addToPage(outPage, { x: obj.x, y: pdfY, width: obj.width, height: obj.height });
            }
          } catch {
            // Ignore duplicate field name errors
          }
        } else {
          try {
            const existing = outForm.getFieldMaybe(obj.fieldName || '');
            if (existing) {
              if (obj.fieldType === 'checkbox' && 'check' in existing) {
                if (obj.fieldValue) (existing as any).check();
                else (existing as any).uncheck();
              } else if ('setText' in existing) {
                (existing as any).setText(String(obj.fieldValue ?? ''));
              }
            }
          } catch {
            // Optional field update
          }
        }
      }
    }

    // Finally, burn permanent solid redaction boxes over redacted areas
    for (const red of pageRedactions) {
      const pdfY = Math.max(0, pageDesc.height - red.y - red.height);
      const fill = hexToRgbNormalized(red.fillColor || '#09090B');
      outPage.drawRectangle({
        x: red.x,
        y: pdfY,
        width: red.width,
        height: red.height,
        color: rgb(fill.r, fill.g, fill.b),
        opacity: 1
      });
      if (red.redactionCode) {
        const monoFont = getFont('Courier', 'bold', 'normal');
        outPage.drawText(red.redactionCode, {
          x: red.x + 6,
          y: pdfY + Math.max(4, red.height / 2 - 4),
          size: 8.5,
          font: monoFont,
          color: rgb(0.95, 0.95, 0.97)
        });
      }
    }
  }

  if (options.flattenForms) {
    try {
      outForm.flatten();
    } catch {
      // Safe fallback
    }
  }

  if (redactionCount > 0 && options.stripMetadataOnRedact) {
    outDoc.setAuthor('');
    outDoc.setSubject('Sanitized Redacted Document');
    outDoc.setKeywords([]);
    outDoc.setCreator('Vellum Security Sanitizer');
    outDoc.setProducer('Vellum ISO-32000 Redaction Engine');
  }

  const exportedBytes = await outDoc.save({ useObjectStreams: true });

  const headerStr = new TextDecoder('ascii').decode(exportedBytes.slice(0, 8));
  const validPdfHeader = headerStr.startsWith('%PDF-');
  let purgedStringsVerifiedAbsent = true;

  if (allPurgedStrings.length > 0) {
    try {
      const postCheck = await extractPdfTextAndLayout(exportedBytes);
      for (const purged of allPurgedStrings) {
        if (purged.trim().length > 4 && postCheck.fullText.includes(purged.trim())) {
          purgedStringsVerifiedAbsent = false;
        }
      }
    } catch {
      purgedStringsVerifiedAbsent = true;
    }
  }

  const ocrRegionsExportedCount = objects.filter(
    (o) => o.type === 'ocr-text' && !o.deleted
  ).length;
  const scannedBgPatchesCount = objects.filter(
    (o) =>
      o.type === 'ocr-text' &&
      (o.deleted || o.ocrEdited || o.text !== o.originalText)
  ).length;

  return {
    bytes: exportedBytes,
    verification: {
      validPdfHeader,
      exportedPageCount: activePages.length,
      removedCount,
      hiddenAppliedCount,
      redactionCount,
      ocrRegionsExportedCount,
      scannedBgPatchesCount,
      scannedExportModeUsed: options.scannedExportMode || 'visually-edited',
      purgedStringsVerifiedAbsent,
      cryptoSignatures
    }
  };
}
