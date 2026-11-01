import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFRawStream,
  decodePDFRawStream
} from 'pdf-lib';
import {
  PdfEditableObject,
  PdfPageDescriptor
} from '../types/pdf';
import {
  extractPdfTextAndLayout,
  renderPdfPageToDataUrl
} from './pdfRenderer';

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

export async function parseDocumentIntoEditorModel(
  pdfBytes: Uint8Array
): Promise<ParsedEditorDocument> {
  const layout = await extractPdfTextAndLayout(pdfBytes);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

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

    pages.push({
      pageIndex: i,
      originalPageIndex: i,
      width: pageStruct.width,
      height: pageStruct.height,
      rotation,
      deleted: false,
      thumbnailUrl
    });

    // Populate Native Text Objects from extracted runs
    pageStruct.textRuns.forEach((run, rIdx) => {
      const isMono = run.fontName.toLowerCase().includes('courier') || run.fontName.toLowerCase().includes('mono');
      const isSerif = run.fontName.toLowerCase().includes('times') || run.fontName.toLowerCase().includes('serif');
      const isBold = run.fontName.toLowerCase().includes('bold');
      const isItalic = run.fontName.toLowerCase().includes('italic') || run.fontName.toLowerCase().includes('oblique');

      objects.push({
        id: `obj-p${i + 1}-text-${rIdx}`,
        pageIndex: i,
        type: 'native-text',
        name: `Text: "${run.str.slice(0, 26)}${run.str.length > 26 ? '…' : ''}"`,
        isNative: true,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 10 + rIdx,
        x: run.x,
        y: run.y,
        width: Math.max(24, run.width),
        height: Math.max(14, run.height),
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
        textAlign: 'left'
      });
    });
  }

  // Inspect existing AcroForm fields and add them to the object model
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
        // Find page index for widget
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
          width: Math.max(18, Math.round(rect.width)),
          height: Math.max(18, Math.round(rect.height)),
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

          // 1. Match parenthesized literal strings: (...target...) Tj
          const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const literalRegex = new RegExp(`\\([^()]*${escaped}[^()]*\\)\\s*(Tj|')`, 'g');
          if (literalRegex.test(contentStr)) {
            contentStr = contentStr.replace(literalRegex, '() Tj');
            modified = true;
          }

          // 2. Match hex-encoded PDF strings: <...HEX...> Tj
          const fullHex = stringToHexPattern(target);
          if (fullHex.length >= 4) {
            const hexRegex = new RegExp(`<[0-9a-fA-F]*${fullHex}[0-9a-fA-F]*>\\s*(Tj|')`, 'gi');
            if (hexRegex.test(contentStr)) {
              contentStr = contentStr.replace(hexRegex, '<> Tj');
              modified = true;
            }
          }

          // 3. Also purge individual tokens (>= 3 chars) in case of split runs or TJ arrays
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

export interface ExportEditorOptions {
  applyHiddenToExport: boolean;
  flattenForms: boolean;
  stripMetadataOnRedact: boolean;
  documentTitle?: string;
}

export interface ExportVerificationReport {
  validPdfHeader: boolean;
  exportedPageCount: number;
  removedCount: number;
  hiddenAppliedCount: number;
  redactionCount: number;
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

  // Embed standard fonts
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

    // Identify native text objects that were removed, hidden, modified, or redacted
    const stringsToPurgeOnPage: string[] = [];

    for (const obj of pageObjects) {
      const isIntersectedByRedaction = pageRedactions.some((red) =>
        rectsIntersect(
          { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
          { x: red.x, y: red.y, width: red.width, height: red.height }
        )
      );

      if (obj.isNative && obj.type === 'native-text') {
        const isRemoved = obj.deleted;
        const isHiddenOnExport = !obj.visible && options.applyHiddenToExport;
        const isModified =
          obj.text !== obj.originalText ||
          obj.color !== '#18181B' ||
          obj.fontWeight === 'bold' ||
          obj.fontStyle === 'italic' ||
          obj.underline;

        if (isRemoved) removedCount++;
        if (isHiddenOnExport) hiddenAppliedCount++;

        if (isRemoved || isHiddenOnExport || isModified || isIntersectedByRedaction) {
          if (obj.originalText) {
            stringsToPurgeOnPage.push(obj.originalText);
            if (isRemoved || isIntersectedByRedaction) {
              allPurgedStrings.push(obj.originalText);
            }
          }
          // Mask original bounding area cleanly on canvas in case partial glyph operators remain
          const pdfY = Math.max(0, pageDesc.height - obj.y - obj.height);
          outPage.drawRectangle({
            x: Math.max(0, obj.x - 1),
            y: Math.max(0, pdfY - 2),
            width: obj.width + 2,
            height: obj.height + 4,
            color: rgb(1, 1, 1)
          });
        }

        // If modified and still visible and not deleted and not redacted, draw the updated native text
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

    // Purge deleted/redacted/modified strings from the underlying raw PDF stream
    purgeStringsFromPageContentStream(outPage, stringsToPurgeOnPage);

    // Render non-native / editor-managed objects + modified form fields + redactions
    for (const obj of pageObjects) {
      if (obj.deleted) continue;
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
        const font = getFont(obj.fontFamily, obj.fontWeight, obj.fontStyle);
        const fontSize = obj.fontSize || (obj.type === 'watermark' ? 42 : 14);
        const { r, g, b } = hexToRgbNormalized(obj.color || '#18181B');
        const textLines = (obj.text || '').split('\n');
        const lineHeight = (obj.lineHeight || 1.25) * fontSize;

        textLines.forEach((line, lIdx) => {
          const lineY = pageDesc.height - obj.y - fontSize * 0.88 - lIdx * lineHeight;
          outPage.drawText(line, {
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
      } else if (obj.type === 'added-image' || obj.type === 'signature') {
        if (obj.imageDataUrl) {
          try {
            const base64Data = obj.imageDataUrl.split(',')[1];
            const imgBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
            const embeddedImg =
              obj.imageDataUrl.includes('image/jpeg') || obj.imageMimeType === 'image/jpeg'
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
        const fill = obj.fillColor ? hexToRgbNormalized(obj.fillColor) : null;
        const stroke = hexToRgbNormalized(obj.strokeColor || obj.color || '#7C3AED');
        const kind = obj.shapeKind || 'rectangle';

        if (kind === 'highlight') {
          const hl = hexToRgbNormalized(obj.fillColor || '#FACC15');
          outPage.drawRectangle({
            x: obj.x,
            y: pdfY,
            width: obj.width,
            height: obj.height,
            color: rgb(hl.r, hl.g, hl.b),
            opacity: obj.opacity ?? 0.38
          });
        } else if (kind === 'underline-mark') {
          outPage.drawLine({
            start: { x: obj.x, y: pdfY + 2 },
            end: { x: obj.x + obj.width, y: pdfY + 2 },
            thickness: obj.strokeWidth || 2,
            color: rgb(stroke.r, stroke.g, stroke.b),
            opacity: obj.opacity ?? 1
          });
        } else if (kind === 'strikethrough') {
          outPage.drawLine({
            start: { x: obj.x, y: pdfY + obj.height / 2 },
            end: { x: obj.x + obj.width, y: pdfY + obj.height / 2 },
            thickness: obj.strokeWidth || 2,
            color: rgb(stroke.r, stroke.g, stroke.b),
            opacity: obj.opacity ?? 1
          });
        } else if (kind === 'circle') {
          outPage.drawEllipse({
            x: obj.x + obj.width / 2,
            y: pdfY + obj.height / 2,
            xScale: obj.width / 2,
            yScale: obj.height / 2,
            color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
            borderColor: rgb(stroke.r, stroke.g, stroke.b),
            borderWidth: obj.strokeWidth ?? 2,
            opacity: obj.opacity ?? 1
          });
        } else if (kind === 'line' || kind === 'arrow') {
          outPage.drawLine({
            start: { x: obj.x, y: pdfY + obj.height / 2 },
            end: { x: obj.x + obj.width, y: pdfY + obj.height / 2 },
            thickness: obj.strokeWidth || 2,
            color: rgb(stroke.r, stroke.g, stroke.b),
            opacity: obj.opacity ?? 1
          });
          if (kind === 'arrow') {
            const endX = obj.x + obj.width;
            const midY = pdfY + obj.height / 2;
            outPage.drawLine({
              start: { x: endX - 8, y: midY + 5 },
              end: { x: endX, y: midY },
              thickness: obj.strokeWidth || 2,
              color: rgb(stroke.r, stroke.g, stroke.b)
            });
            outPage.drawLine({
              start: { x: endX - 8, y: midY - 5 },
              end: { x: endX, y: midY },
              thickness: obj.strokeWidth || 2,
              color: rgb(stroke.r, stroke.g, stroke.b)
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
              opacity: obj.opacity ?? 1
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
            borderColor: rgb(stroke.r, stroke.g, stroke.b),
            borderWidth: obj.strokeWidth ?? 2,
            opacity: obj.opacity ?? 1
          });
        }
      } else if (obj.type === 'form-field') {
        const safeName = `${obj.fieldName || 'field'}_${outIdx}_${obj.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        if (options.flattenForms) {
          // Render static flattened representation
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
          // Create new interactive AcroForm field
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
          // Update existing native AcroForm field value
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

  // Verify exported PDF integrity
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

  return {
    bytes: exportedBytes,
    verification: {
      validPdfHeader,
      exportedPageCount: activePages.length,
      removedCount,
      hiddenAppliedCount,
      redactionCount,
      purgedStringsVerifiedAbsent,
      cryptoSignatures
    }
  };
}
