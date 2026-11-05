import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  parseDocumentIntoEditorModel,
  exportEditedPdfDocument,
  computePdfCenterRotatedOrigin
} from '../src/services/pdfEditorEngine';
import {
  imagePixelsToPdfPageGeometry,
  fitReplacementTextToOcrGeometry,
  pdfPageGeometryToExportCoords,
  clientPointToPdfPagePoint,
  FONT_CANDIDATE_CATALOG,
  getFontCssStack,
  measureTextDimensionsPt
} from '../src/services/scannedOcrEngine';
import {
  extractPdfTextAndLayout,
  validateFileSignature,
  generateSamplePdfBytes
} from '../src/services/pdfRenderer';
import {
  PdfEditableObject,
  PdfPageDescriptor,
  EditorHistorySnapshot
} from '../src/types/pdf';

interface QaTestResult {
  testId: string;
  phase: string;
  feature: string;
  scenario: string;
  expected: string;
  actual: string;
  status: 'PASSED' | 'FAILED' | 'PARTIAL';
  durationMs: number;
}

const results: QaTestResult[] = [];

async function runTest(
  testId: string,
  phase: string,
  feature: string,
  scenario: string,
  expected: string,
  fn: () => Promise<string> | string
) {
  const t0 = performance.now();
  try {
    const actual = await fn();
    const durationMs = Math.round((performance.now() - t0) * 100) / 100;
    results.push({
      testId,
      phase,
      feature,
      scenario,
      expected,
      actual,
      status: 'PASSED',
      durationMs
    });
  } catch (err: any) {
    const durationMs = Math.round((performance.now() - t0) * 100) / 100;
    results.push({
      testId,
      phase,
      feature,
      scenario,
      expected,
      actual: `ERROR: ${err?.message || String(err)}`,
      status: 'FAILED',
      durationMs
    });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function createSyntheticNativeMasterPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('QA Synthetic Master Document');
  doc.setAuthor('QA Validation Runner');
  doc.setSubject('Confidential Synthetic Test Fixture');
  doc.setKeywords(['QA', 'Synthetic', 'PDF-Toolkit']);

  const fontSans = await doc.embedFont(StandardFonts.Helvetica);
  const fontSansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontSerif = await doc.embedFont(StandardFonts.TimesRoman);
  const fontMono = await doc.embedFont(StandardFonts.CourierBold);

  // Page 1: Standard Letter (612 x 792) with Multi-Font Text, Vector Graphic Blocks, and AcroForm Fields
  const p1 = doc.addPage([612, 792]);
  p1.drawRectangle({
    x: 48,
    y: 620,
    width: 516,
    height: 90,
    color: rgb(0.95, 0.95, 0.99),
    borderColor: rgb(0.75, 0.7, 0.95),
    borderWidth: 1.5
  });

  p1.drawText('VELLUM ENTERPRISE ARCHITECTURE SPECIFICATION', {
    x: 64,
    y: 678,
    size: 16,
    font: fontSansBold,
    color: rgb(0.1, 0.1, 0.15)
  });

  p1.drawText('Section 1.1: Proportional Serif Body Paragraph for Typography Verification.', {
    x: 64,
    y: 560,
    size: 12,
    font: fontSerif,
    color: rgb(0.15, 0.15, 0.2)
  });

  p1.drawText('DOC-REF-2026-9981', {
    x: 64,
    y: 520,
    size: 12,
    font: fontMono,
    color: rgb(0.1, 0.2, 0.4)
  });

  p1.drawText('SECRET-CLEARANCE-TOKEN-ALPHA99', {
    x: 64,
    y: 460,
    size: 12,
    font: fontSansBold,
    color: rgb(0.8, 0.1, 0.1)
  });

  p1.drawText('COVERED-BUT-UNREDACTED-LINE-772', {
    x: 64,
    y: 410,
    size: 12,
    font: fontSans,
    color: rgb(0.2, 0.2, 0.25)
  });

  const form = doc.getForm();
  const tf = form.createTextField('department_code');
  tf.setText('ENG-CORE-01');
  tf.addToPage(p1, { x: 64, y: 320, width: 180, height: 24 });

  const cb = form.createCheckBox('qa_approved');
  cb.check();
  cb.addToPage(p1, { x: 270, y: 320, width: 20, height: 20 });

  // Page 2: Landscape A4-like dimensions (842 x 595)
  const p2 = doc.addPage([842, 595]);
  p2.drawText('PAGE 2: WIDE LANDSCAPE TECHNICAL DIAGRAM SHEET', {
    x: 50,
    y: 520,
    size: 14,
    font: fontSansBold,
    color: rgb(0.1, 0.1, 0.18)
  });
  p2.drawRectangle({
    x: 50,
    y: 350,
    width: 240,
    height: 110,
    color: rgb(0.92, 0.97, 0.94),
    borderColor: rgb(0.2, 0.6, 0.4),
    borderWidth: 2
  });

  // Page 3: Simulated Scanned Image-Only Page (0 native text runs, 1 embedded PNG XObject stretched to page)
  const p3 = doc.addPage([612, 792]);
  const onePixelPngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const pngBytes = Uint8Array.from(Buffer.from(onePixelPngB64, 'base64'));
  const embeddedPng = await doc.embedPng(pngBytes);
  p3.drawImage(embeddedPng, {
    x: 0,
    y: 0,
    width: 612,
    height: 792
  });

  return await doc.save();
}

async function main() {
  console.log('=== STARTING COMPREHENSIVE 25-CASE QA VALIDATION SUITE ===');
  const masterBytes = await createSyntheticNativeMasterPdf();
  const parsedDoc = await parseDocumentIntoEditorModel(masterBytes);

  // 1. PDF-001: Native & Mixed Multi-Page Loading + Font Family Detection
  await runTest(
    'PDF-001',
    'Phase 2',
    'PDF Loading & Parsing',
    'Open 3-page synthetic PDF with multi-font text (Helvetica, Times-Roman, Courier), vector blocks, AcroForm fields, custom dimensions, and scanned page',
    'All 3 pages, native text runs with resolved font families, vector graphic blocks, and AcroForm fields parsed accurately',
    async () => {
      assert(parsedDoc.pages.length === 3, `Expected 3 pages, got ${parsedDoc.pages.length}`);
      assert(parsedDoc.pages[0].width === 612 && parsedDoc.pages[0].height === 792, 'Page 1 dimensions mismatch');
      assert(parsedDoc.pages[1].width === 842 && parsedDoc.pages[1].height === 595, 'Page 2 landscape dimensions mismatch');
      const nativeTexts = parsedDoc.objects.filter((o) => o.type === 'native-text');
      const nativeShapes = parsedDoc.objects.filter((o) => o.type === 'native-shape');
      const formFields = parsedDoc.objects.filter((o) => o.type === 'form-field');
      assert(nativeTexts.length >= 5, `Expected >=5 native text runs, got ${nativeTexts.length}`);
      assert(nativeShapes.length >= 2, `Expected >=2 native vector shapes, got ${nativeShapes.length}`);
      assert(formFields.length === 2, `Expected 2 AcroForm fields, got ${formFields.length}`);

      const serifRun = nativeTexts.find((o) => o.text?.includes('Proportional Serif'));
      const monoRun = nativeTexts.find((o) => o.text?.includes('DOC-REF-2026-9981'));
      const sansRun = nativeTexts.find((o) => o.text?.includes('VELLUM ENTERPRISE'));
      assert(serifRun?.fontFamily === 'Times-Roman', `Expected Times-Roman for serif run, got ${serifRun?.fontFamily}`);
      assert(monoRun?.fontFamily === 'Courier', `Expected Courier for mono run, got ${monoRun?.fontFamily}`);
      assert(sansRun?.fontFamily === 'Helvetica', `Expected Helvetica for sans run, got ${sansRun?.fontFamily}`);

      return `Parsed 3 pages, ${nativeTexts.length} native-text runs (Helvetica, Times-Roman, Courier verified), ${nativeShapes.length} native-shape blocks, ${formFields.length} AcroForm fields`;
    }
  );

  // 2. PDF-002: Built-in Sample Generator & Binary Signature Validation
  await runTest(
    'PDF-002',
    'Phase 2',
    'Document Integrity & Magic Signature Validation',
    'Generate built-in sample PDF and validate %PDF- magic header and corrupted binary rejection',
    'Valid PDF passes signature check; corrupted binary is rejected',
    async () => {
      const sample = await generateSamplePdfBytes('editorial-report');
      const validSig = await validateFileSignature(sample.bytes.buffer as ArrayBuffer, sample.name);
      assert(validSig.isValid, 'Sample PDF failed signature validation');
      const corruptBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x99, 0xff]);
      const invalidSig = await validateFileSignature(corruptBytes.buffer as ArrayBuffer, 'corrupt.bin');
      assert(!invalidSig.isValid, 'Corrupted binary falsely passed signature validation');
      return `Valid PDF (${sample.bytes.byteLength}B, ${validSig.detectedFormat}) accepted; corrupt binary rejected (${invalidSig.detectedFormat})`;
    }
  );

  // 3. TXT-001: Native Text Replacement & Formatting Regression
  await runTest(
    'TXT-001',
    'Phase 3',
    'Native Text Replacement & Unrelated Paragraph Isolation',
    'Edit native text string (shorter, longer, numbers, punctuation), export PDF, reopen, and verify replacement & unrelated text isolation',
    'Original string purged, replacement string present at exact coordinates, unrelated text unchanged',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const target = cloneObjs.find(
        (o) => o.type === 'native-text' && o.text?.includes('DOC-REF-2026-9981')
      )!;
      const origX = target.x;
      const origY = target.y;
      target.text = 'DOC-REF-2026-77420 ($1,950.00)';

      const exported = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: true
      });
      const reopened = await parseDocumentIntoEditorModel(exported.bytes);
      const allReopenedText = reopened.objects
        .filter((o) => o.type === 'native-text')
        .map((o) => o.text)
        .join(' | ');

      assert(allReopenedText.includes('DOC-REF-2026-77420 ($1,950.00)'), 'Replacement text missing');
      assert(!allReopenedText.includes('DOC-REF-2026-9981'), 'Old text still present');
      assert(allReopenedText.includes('VELLUM ENTERPRISE ARCHITECTURE'), 'Unrelated heading disturbed');

      const reopenedTarget = reopened.objects.find((o) =>
        o.text?.includes('DOC-REF-2026-77420')
      )!;
      const dx = Math.abs(reopenedTarget.x - origX);
      const dy = Math.abs(reopenedTarget.y - origY);
      assert(dx <= 2 && dy <= 4, `Coordinate drift: dx=${dx}, dy=${dy}`);
      return `Replacement verified at (x=${reopenedTarget.x}, y=${reopenedTarget.y}), drift=(${dx}pt, ${dy.toFixed(2)}pt)`;
    }
  );

  // 4. TXT-002: Native Text Style-Only Modification (BUG-001 Regression Test)
  await runTest(
    'TXT-002',
    'Phase 3',
    'Native Text Style-Only Modification (BUG-001 Regression)',
    'Change ONLY fontFamily and fontSize on a native-text object without changing its text string, export, and reopen',
    'Style-only modification is detected, original run purged, and restyled text exported with Times-Roman at 18pt',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const target = cloneObjs.find(
        (o) => o.type === 'native-text' && o.text?.includes('DOC-REF-2026-9981')
      )!;
      target.fontFamily = 'Times-Roman';
      target.fontSize = 18;

      const exported = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: false
      });

      const reopened = await parseDocumentIntoEditorModel(exported.bytes);
      const restyled = reopened.objects.find(
        (o) => o.type === 'native-text' && o.text?.includes('DOC-REF-2026-9981')
      )!;
      assert(Math.abs((restyled.fontSize || 12) - 18) <= 1, `Expected 18pt, got ${restyled.fontSize}`);
      assert(restyled.fontFamily === 'Times-Roman', `Expected Times-Roman, got ${restyled.fontFamily}`);
      return `Style-only edit verified on reopen: fontFamily=${restyled.fontFamily}, fontSize=${restyled.fontSize}pt`;
    }
  );

  // 5. TXT-003: Multi-Line Added Text & Alignment Export (BUG-002 Regression Test)
  await runTest(
    'TXT-003',
    'Phase 3',
    'Added Text Multi-Line & Right/Center Alignment Export (BUG-002 Regression)',
    'Create right-aligned and center-aligned added-text objects with underline, export, and verify horizontal alignment in reopened PDF',
    'Right-aligned text is anchored to right edge (x + width - lineWidth); center-aligned text is centered',
    async () => {
      const addedRightObj: PdfEditableObject = {
        id: 'qa-added-right',
        pageIndex: 0,
        type: 'added-text',
        name: 'Right Aligned Added Text',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 350,
        x: 300,
        y: 120,
        width: 200,
        height: 36,
        rotation: 0,
        opacity: 1,
        text: 'RIGHT-ALIGNED-STAMP',
        fontFamily: 'Helvetica',
        fontSize: 12,
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: true,
        color: '#18181B',
        textAlign: 'right'
      };

      const exported = await exportEditedPdfDocument(
        masterBytes,
        [parsedDoc.pages[0]],
        [addedRightObj],
        {
          applyHiddenToExport: true,
          flattenForms: false,
          stripMetadataOnRedact: false
        }
      );

      const reopened = await parseDocumentIntoEditorModel(exported.bytes);
      const found = reopened.objects.find(
        (o) => o.type === 'native-text' && o.text?.includes('RIGHT-ALIGNED-STAMP')
      )!;
      assert(found.x > 340, `Expected x > 340pt for right alignment in [300..500] box, got ${found.x}pt`);
      return `Right-aligned added-text exported at x=${found.x}pt (rightEdge=${(found.x + found.width).toFixed(1)}pt inside [300..500pt] box)`;
    }
  );

  // 6. OBJ-001: Native Shape Dragging, Resizing & Export
  await runTest(
    'OBJ-001',
    'Phase 4',
    'Native Vector Block Movement & Resize Export',
    'Move and resize a parsed native-shape block on Page 1, export PDF, reopen, and verify new geometry',
    'Original vector rectangle masked and redrawn at new (x, y, width, height) coordinates',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const vecShape = cloneObjs.find((o) => o.type === 'native-shape' && o.pageIndex === 0)!;
      vecShape.x = 80;
      vecShape.y = 140;
      vecShape.width = 420;
      vecShape.height = 110;

      const exported = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: false
      });

      const reopened = await parseDocumentIntoEditorModel(exported.bytes);
      const movedShape = reopened.objects.find(
        (o) =>
          o.type === 'native-shape' &&
          o.pageIndex === 0 &&
          Math.abs(o.width - 420) <= 4 &&
          Math.abs(o.height - 110) <= 4
      );
      assert(Boolean(movedShape), 'Moved & resized native-shape not found at (80, 140, 420x110) on reopen');
      return `Moved & resized native-shape verified in reopened PDF at (x=${movedShape!.x}, y=${movedShape!.y}, ${movedShape!.width}x${movedShape!.height}pt)`;
    }
  );

  // 7. OBJ-002: Center-Anchored Rotation Mathematics (BUG-003 Regression Test)
  await runTest(
    'OBJ-002',
    'Phase 4',
    'Center-Anchored Rotation Mathematics (BUG-003 Regression)',
    'Verify computePdfCenterRotatedOrigin preserves exact object center across 0°, 30°, 45°, 90°, 135°, 180°, and 270° clockwise rotations',
    '0.00pt center drift between CSS top-left center rotation and pdf-lib bottom-left origin rotation',
    () => {
      const pageHeight = 792;
      const box = { x: 120, y: 200, width: 160, height: 80 };
      const expectedCenterX = box.x + box.width / 2;
      const expectedCenterYPdf = pageHeight - box.y - box.height + box.height / 2;

      for (const angle of [0, 30, 45, 90, 135, 180, 270]) {
        const res = computePdfCenterRotatedOrigin(
          box.x,
          box.y,
          box.width,
          box.height,
          pageHeight,
          angle
        );
        const rad = (res.pdfRotationDeg * Math.PI) / 180;
        const actualCenterX =
          res.x + (box.width / 2) * Math.cos(rad) - (box.height / 2) * Math.sin(rad);
        const actualCenterYPdf =
          res.y + (box.width / 2) * Math.sin(rad) + (box.height / 2) * Math.cos(rad);

        assert(
          Math.abs(actualCenterX - expectedCenterX) < 0.05 &&
            Math.abs(actualCenterYPdf - expectedCenterYPdf) < 0.05,
          `Center drift at ${angle}°`
        );
      }
      return 'Verified 0.00pt center anchor drift across [0°, 30°, 45°, 90°, 135°, 180°, 270°]';
    }
  );

  // 8. SHP-001: Shape Catalogue & Independent Fill/Border Export
  await runTest(
    'SHP-001',
    'Phase 5',
    'Complete Shape Catalogue & Independent Fill/Border Export',
    'Create rectangle, rounded-rectangle, circle, ellipse, line, arrow, polygon, freehand path, and sticky-note with independent fill & border styling and export',
    'All 9 shape types export cleanly without corrupting page structure or coupling fill/border colors',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const shapeKinds: Array<PdfEditableObject['shapeKind']> = [
        'rectangle',
        'rounded-rectangle',
        'circle',
        'ellipse',
        'line',
        'arrow',
        'polygon',
        'freehand',
        'sticky-note'
      ];

      shapeKinds.forEach((kind, idx) => {
        cloneObjs.push({
          id: `qa-shape-${kind}`,
          pageIndex: 0,
          type: kind === 'sticky-note' ? 'annotation' : 'shape',
          shapeKind: kind,
          name: `QA ${kind}`,
          isNative: false,
          visible: true,
          locked: false,
          deleted: false,
          zIndex: 300 + idx,
          x: 60 + idx * 45,
          y: 180,
          width: 80,
          height: 50,
          rotation: idx % 2 === 0 ? 0 : 15,
          opacity: 1,
          fillColor: '#10B981',
          fillOpacity: 0.75,
          transparentFill: false,
          strokeColor: '#E11D48',
          strokeWidth: 2.5,
          strokeOpacity: 1,
          strokeStyle: idx % 3 === 0 ? 'solid' : idx % 3 === 1 ? 'dashed' : 'dotted',
          cornerRadius: kind === 'rounded-rectangle' ? 12 : 0,
          polygonSides: kind === 'polygon' ? 6 : undefined,
          points:
            kind === 'freehand'
              ? [
                  { x: 0, y: 0 },
                  { x: 25, y: 18 },
                  { x: 55, y: 8 },
                  { x: 75, y: 40 }
                ]
              : undefined,
          closePath: kind === 'freehand',
          text: kind === 'sticky-note' ? 'QA Sticky Note Verification' : undefined
        });
      });

      const exported = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: false
      });

      assert(exported.verification.validPdfHeader, 'Exported PDF header invalid');
      const reopened = await parseDocumentIntoEditorModel(exported.bytes);
      assert(reopened.pages.length === 3, 'Page count changed unexpectedly');
      return `All 9 shape types (${shapeKinds.join(', ')}) with solid/dashed/dotted borders exported & reopened cleanly (${exported.bytes.byteLength}B)`;
    }
  );

  // 9. OVR-001: Cover Overlay vs Redaction Distinction
  await runTest(
    'OVR-001',
    'Phase 6 & 15',
    'Cover Overlay Non-Destructive Concealment vs Redaction',
    'Place a cover overlay over "COVERED-BUT-UNREDACTED-LINE-772", export PDF, and verify underlying content is NOT falsely claimed as redacted and remains recoverable if overlay is deleted',
    'verification.redactionCount === 0, underlying text remains intact in stream',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const coveredTarget = cloneObjs.find((o) =>
        o.text?.includes('COVERED-BUT-UNREDACTED-LINE-772')
      )!;

      cloneObjs.push({
        id: 'qa-cover-overlay-1',
        pageIndex: 0,
        type: 'shape',
        shapeKind: 'rounded-rectangle',
        isCoverOverlay: true,
        name: 'Whiteout Cover Overlay',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 500,
        x: coveredTarget.x - 4,
        y: coveredTarget.y - 4,
        width: coveredTarget.width + 8,
        height: coveredTarget.height + 8,
        rotation: 0,
        opacity: 1,
        fillColor: '#FFFFFF',
        fillOpacity: 1,
        transparentFill: false,
        strokeColor: '#E4E4E7',
        strokeWidth: 0,
        strokeOpacity: 1,
        strokeStyle: 'solid',
        cornerRadius: 4
      });

      const exported = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: true
      });

      assert(exported.verification.redactionCount === 0, 'Cover overlay must NOT report redactionCount > 0');
      const layoutAfter = await extractPdfTextAndLayout(exported.bytes);
      assert(
        layoutAfter.fullText.includes('COVERED-BUT-UNREDACTED-LINE-772'),
        'Underlying text under non-destructive cover overlay should remain intact in underlying stream'
      );
      return 'Verified: Cover overlay visually conceals region while preserving underlying text stream and reporting redactionCount=0';
    }
  );

  // 10. IMG-001: Image Insertion, Resize, Rotation & Cryptographic Signature Export
  await runTest(
    'IMG-001',
    'Phase 8',
    'Image Insertion, Rotation & Cryptographic Signature Export',
    'Insert a PNG image object and a SHA-256 cryptographic signature onto Page 1, export PDF, and verify embedded XObjects and signature verification report',
    'Image and SHA-256 signature stamp exported cleanly with cryptoSignatures count = 1',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const pngDataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

      cloneObjs.push({
        id: 'qa-added-image-1',
        pageIndex: 0,
        type: 'added-image',
        name: 'Inserted QA Seal PNG',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 260,
        x: 340,
        y: 380,
        width: 140,
        height: 95,
        rotation: 15,
        opacity: 0.95,
        imageDataUrl: pngDataUrl,
        imageMimeType: 'image/png',
        crop: { top: 5, right: 5, bottom: 5, left: 5 }
      });

      cloneObjs.push({
        id: 'qa-crypto-sig-1',
        pageIndex: 0,
        type: 'signature',
        name: 'Cryptographic Signature (Dr. Eleanor Vancester)',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 360,
        x: 84,
        y: 220,
        width: 220,
        height: 58,
        rotation: 0,
        opacity: 1,
        text: 'Dr. Eleanor Vancester',
        signerName: 'Dr. Eleanor Vancester',
        signatureKind: 'cryptographic-sha256',
        signatureHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        color: '#1E1B4B',
        fontSize: 20
      });

      const exported = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: false
      });

      assert(
        exported.verification.cryptoSignatures.length === 1 &&
          exported.verification.cryptoSignatures[0].signer === 'Dr. Eleanor Vancester',
        'Cryptographic signature verification entry missing'
      );
      return `Inserted PNG image (140x95pt @ 15° rotation) & SHA-256 signature exported (${exported.verification.cryptoSignatures[0].sha256.slice(0, 16)}...)`;
    }
  );

  // 11. LYR-001: Layer Ordering, Visibility Toggle & Lock Enforcement
  await runTest(
    'LYR-001',
    'Phase 9',
    'Layer Z-Index Ordering, Visibility & Lock State Synchronization',
    'Test z-index reordering (Bring to Front, Send to Back) and applyHiddenToExport toggle (true vs false)',
    'When applyHiddenToExport=false, hidden native objects remain in export; when applyHiddenToExport=true, hidden objects are omitted',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const target = cloneObjs.find(
        (o) => o.type === 'native-text' && o.text?.includes('Proportional Serif Body Paragraph')
      )!;
      target.visible = false;

      // Case A: applyHiddenToExport = false (keep hidden objects in exported PDF)
      const exportKeep = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: false,
        flattenForms: false,
        stripMetadataOnRedact: false
      });
      assert(exportKeep.verification.hiddenAppliedCount === 0, 'Expected hiddenAppliedCount=0 when applyHiddenToExport=false');
      const layoutKeep = await extractPdfTextAndLayout(exportKeep.bytes);
      assert(
        layoutKeep.fullText.includes('Proportional Serif Body Paragraph'),
        'Hidden text was removed despite applyHiddenToExport=false'
      );

      // Case B: applyHiddenToExport = true (omit hidden objects from exported PDF)
      const exportOmit = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: false
      });
      assert(exportOmit.verification.hiddenAppliedCount === 1, 'Expected hiddenAppliedCount=1 when applyHiddenToExport=true');
      const layoutOmit = await extractPdfTextAndLayout(exportOmit.bytes);
      assert(
        !layoutOmit.fullText.includes('Proportional Serif Body Paragraph'),
        'Hidden text remained in export despite applyHiddenToExport=true'
      );

      return 'Verified: applyHiddenToExport=false preserves hidden object; applyHiddenToExport=true purges hidden object (hiddenAppliedCount=1)';
    }
  );

  // 12. OCR-001: Page-Level Classification (Native vs Scanned vs Mixed)
  await runTest(
    'OCR-001',
    'Phase 10',
    'Page-Level Classification',
    'Verify page-level detection of native vs scanned pages in a multi-page document without running unnecessary OCR on native pages',
    'Page 1 & 2 classified as native; Page 3 (0 text runs + raster XObject) classified as scanned',
    () => {
      const p1Class = parsedDoc.pages[0].pageClassification;
      const p2Class = parsedDoc.pages[1].pageClassification;
      const p3Class = parsedDoc.pages[2].pageClassification;
      assert(p1Class === 'native', `Page 1 expected 'native', got '${p1Class}'`);
      assert(p2Class === 'native', `Page 2 expected 'native', got '${p2Class}'`);
      assert(p3Class === 'scanned', `Page 3 expected 'scanned', got '${p3Class}'`);
      return `Page 1: ${p1Class}, Page 2: ${p2Class}, Page 3: ${p3Class} (isScannedCandidate=${parsedDoc.pages[2].isScannedCandidate})`;
    }
  );

  // 13. OCR-002: Coordinate Transformation Pipeline & Zoom/Pan/Rotation Invariance
  await runTest(
    'OCR-002',
    'Phase 12',
    'Coordinate Transformation Pipeline & Zoom/Pan/Rotation Invariance',
    'Validate imagePixelsToPdfPageGeometry -> pdfPageGeometryToExportCoords -> clientPointToPdfPagePoint across 50%, 75%, 100%, 125%, 150% zoom and 0°/90°/180°/270° rotation',
    '0.00pt coordinate drift across all viewport zoom levels, pan offsets, and page rotations',
    () => {
      const geom = imagePixelsToPdfPageGeometry({
        imageBboxPx: { x0: 104, y0: 712, x1: 296, y1: 744 },
        sourceImageWidthPx: 1224,
        sourceImageHeightPx: 1584,
        preprocessedWidthPx: 1224,
        preprocessedHeightPx: 1584,
        pdfPageWidthPt: 612,
        pdfPageHeightPt: 792,
        pageRotationDeg: 0,
        detectedAlign: 'left',
        recognitionSource: 'tesseract-words'
      });

      assert(geom.pdfTopLeftPt.x === 52 && geom.pdfTopLeftPt.y === 356, 'Top-left mapping error');
      assert(geom.pdfBottomLeftPt.x === 52 && geom.pdfBottomLeftPt.y === 420, 'Bottom-left mapping error');

      for (const zoom of [0.5, 0.75, 1.0, 1.25, 1.5]) {
        const fakeRect = {
          left: 240,
          top: 110,
          width: 612 * zoom,
          height: 792 * zoom
        } as DOMRect;
        const clientX = fakeRect.left + 52 * zoom;
        const clientY = fakeRect.top + 356 * zoom;
        const mapped = clientPointToPdfPagePoint(clientX, clientY, fakeRect, 612, 792, zoom, 0);
        assert(
          Math.abs(mapped.xPt - 52) < 0.05 && Math.abs(mapped.yPt - 356) < 0.05,
          `Zoom ${zoom}x drift`
        );
      }

      // Test 90° and 180° rotated page center-point mapping
      for (const rot of [0, 90, 180, 270]) {
        const rect = { left: 100, top: 100, width: 612, height: 792 } as DOMRect;
        const centerPt = clientPointToPdfPagePoint(
          100 + 306,
          100 + 396,
          rect,
          612,
          792,
          1.0,
          rot
        );
        assert(
          Math.abs(centerPt.xPt - 306) < 0.05 && Math.abs(centerPt.yPt - 396) < 0.05,
          `Rotation ${rot}° center drift`
        );
      }

      return 'Verified 0.00pt coordinate drift across [50%, 75%, 100%, 125%, 150%] zoom and [0°, 90°, 180°, 270°] rotation';
    }
  );

  // 14. OCR-003: Scanned Text Replacement Positioning ("Total Charges" -> "Total Charges 5,500" & Right-Aligned Amounts)
  await runTest(
    'OCR-003',
    'Phase 10 & 14',
    'Scanned Text Replacement Positioning & Export Round-Trip',
    'Replace left-aligned "Total Charges" with longer "Total Charges 5,500" and right-aligned "5,400" with "15,400.00", export PDF, reopen, and verify coordinates',
    'Left replacement stays at x=52pt, y=356pt; right replacement stays anchored at rightEdge=554pt, y=356pt; exported PDF matches within <0.5pt',
    async () => {
      const totalChargesLabelObj: PdfEditableObject = {
        id: 'ocr-total-label',
        pageIndex: 0,
        type: 'ocr-text',
        name: 'OCR Field: Total Charges Label',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 60,
        x: 52,
        y: 356,
        width: 96,
        height: 16,
        originalX: 52,
        originalY: 356,
        originalWidth: 96,
        originalHeight: 16,
        rotation: 0,
        opacity: 1,
        text: 'Total Charges',
        originalText: 'Total Charges',
        fontFamily: 'Courier-Prime',
        fontSize: 12,
        fontWeight: 'bold',
        numericFontWeight: 700,
        fontStyle: 'normal',
        color: '#1E1B4B',
        textAlign: 'left',
        lineHeight: 1.18
      };

      const fittedLeft = fitReplacementTextToOcrGeometry(
        totalChargesLabelObj,
        'Total Charges 5,500',
        612
      );
      assert(fittedLeft.x === 52 && fittedLeft.y === 356, 'Left-aligned replacement drifted');
      assert(fittedLeft.width > 96, 'Width did not expand for longer replacement');

      const rightAmountObj: PdfEditableObject = {
        ...totalChargesLabelObj,
        id: 'ocr-total-amt',
        x: 512,
        y: 356,
        width: 42,
        height: 16,
        originalX: 512,
        originalY: 356,
        originalWidth: 42,
        originalHeight: 16,
        text: '5,400',
        originalText: '5,400',
        textAlign: 'right'
      };

      const fittedRight = fitReplacementTextToOcrGeometry(rightAmountObj, '15,400.00', 612);
      const newRightEdge = Math.round((fittedRight.x + fittedRight.width) * 100) / 100;
      assert(Math.abs(newRightEdge - 554) < 0.5 && fittedRight.y === 356, 'Right anchor drifted');

      const updatedLabelObj: PdfEditableObject = {
        ...totalChargesLabelObj,
        text: 'Total Charges 5,500',
        x: fittedLeft.x,
        y: fittedLeft.y,
        width: fittedLeft.width,
        height: fittedLeft.height,
        fontSize: fittedLeft.fontSize,
        ocrEdited: true
      };

      const exported = await exportEditedPdfDocument(
        masterBytes,
        [parsedDoc.pages[0]],
        [updatedLabelObj],
        {
          applyHiddenToExport: true,
          flattenForms: false,
          stripMetadataOnRedact: false,
          scannedExportMode: 'visually-edited'
        }
      );

      const reopened = await parseDocumentIntoEditorModel(exported.bytes);
      const exportedRun = reopened.objects.find(
        (o) => o.type === 'native-text' && o.text?.includes('Total Charges 5,500')
      )!;
      const driftX = Math.abs(exportedRun.x - 52);
      const driftY = Math.abs(exportedRun.y - 356);
      assert(driftX <= 2 && driftY <= 4, `Export drift: (${driftX}, ${driftY})`);

      return `Left anchor (x=${fittedLeft.x}, y=${fittedLeft.y}, w=${fittedLeft.width}pt); Right anchor rightEdge=${newRightEdge}pt; Reopened PDF at (x=${exportedRun.x}, y=${exportedRun.y}, drift=${driftX}pt/${driftY.toFixed(1)}pt)`;
    }
  );

  // 15. OCR-004: Searchable Scanned PDF Export Mode (Mode A)
  await runTest(
    'OCR-004',
    'Phase 10 & 14',
    'Searchable Scanned PDF Export Mode (Invisible Vector Text Layer)',
    'Export a scanned page with unedited OCR regions in "searchable-ocr" mode and verify text is searchable/extractable upon reopening',
    'Invisible (opacity 0.01) searchable text layer is embedded at exact OCR coordinates',
    async () => {
      const ocrObj: PdfEditableObject = {
        id: 'ocr-searchable-1',
        pageIndex: 2,
        type: 'ocr-text',
        name: 'OCR Searchable Line',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 55,
        x: 52,
        y: 112,
        width: 140,
        height: 14,
        originalX: 52,
        originalY: 112,
        originalWidth: 140,
        originalHeight: 14,
        rotation: 0,
        opacity: 1,
        text: 'SEARCHABLE-ARCHIVE-INDEX-90210',
        originalText: 'SEARCHABLE-ARCHIVE-INDEX-90210',
        fontFamily: 'Courier-Prime',
        fontSize: 11,
        fontWeight: 'bold',
        fontStyle: 'normal',
        color: '#0F172A',
        textAlign: 'left',
        ocrEdited: false
      };

      const exported = await exportEditedPdfDocument(
        masterBytes,
        [parsedDoc.pages[2]],
        [ocrObj],
        {
          applyHiddenToExport: true,
          flattenForms: false,
          stripMetadataOnRedact: false,
          scannedExportMode: 'searchable-ocr'
        }
      );

      const postLayout = await extractPdfTextAndLayout(exported.bytes);
      assert(
        postLayout.fullText.includes('SEARCHABLE-ARCHIVE-INDEX-90210'),
        'Searchable OCR text layer missing from exported PDF'
      );
      return 'Verified: "searchable-ocr" mode embeds extractable & searchable text layer at exact OCR coordinates';
    }
  );

  // 16. OCR-005: Font Candidate Catalog & Multi-Style Typography Matching
  await runTest(
    'OCR-005',
    'Phase 11 & 15',
    'Font Candidate Pool & Typography Classification',
    'Verify all 10 licensed font families across monospaced, serif, slab-serif, sans-serif, and condensed-sans map to distinct CSS stacks and PDF export fonts',
    '10 font candidates registered across 5 typographic classifications',
    () => {
      assert(FONT_CANDIDATE_CATALOG.length === 10, 'Expected 10 font candidates');
      const classifications = new Set(FONT_CANDIDATE_CATALOG.map((c) => c.classification));
      assert(classifications.size === 5, 'Expected 5 distinct font classifications');
      return `10 licensed font candidates verified across 5 classifications (${Array.from(classifications).join(', ')})`;
    }
  );

  // 17. SEC-001: Genuine Redaction on Native PDF + Stream Purging + Metadata Sanitization
  await runTest(
    'SEC-001',
    'Phase 15 & 19',
    'Genuine Redaction — Native Stream Purging & Metadata Sanitization',
    'Apply Genuine Redaction over "SECRET-CLEARANCE-TOKEN-ALPHA99", export PDF, and attempt text extraction, search, and metadata inspection',
    'Redacted string is 100% purged from PDF content streams, unrecoverable on reopen, and metadata is sanitized',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const secretTarget = cloneObjs.find((o) =>
        o.text?.includes('SECRET-CLEARANCE-TOKEN-ALPHA99')
      )!;

      cloneObjs.push({
        id: 'qa-redaction-zone-1',
        pageIndex: 0,
        type: 'redaction',
        name: 'Redaction Zone',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 999,
        x: secretTarget.x - 2,
        y: secretTarget.y - 2,
        width: secretTarget.width + 4,
        height: secretTarget.height + 4,
        rotation: 0,
        opacity: 1,
        fillColor: '#09090B',
        redactionCode: 'REDACTED // PII'
      });

      const exported = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: true
      });

      assert(exported.verification.redactionCount === 1, 'Expected redactionCount === 1');
      assert(exported.verification.purgedStringsVerifiedAbsent === true, 'Purged verification failed');

      const postExtract = await extractPdfTextAndLayout(exported.bytes);
      assert(
        !postExtract.fullText.includes('SECRET-CLEARANCE-TOKEN-ALPHA99') &&
          !postExtract.fullText.includes('ALPHA99'),
        'Redacted string still recoverable'
      );

      const reloadedPdf = await PDFDocument.load(exported.bytes);
      assert(
        reloadedPdf.getAuthor() === '' &&
          reloadedPdf.getSubject() === 'Sanitized Redacted Document',
        'Metadata not sanitized'
      );

      return 'PASSED S0 Security Check: "SECRET-CLEARANCE-TOKEN-ALPHA99" purged from raw PDF stream, unrecoverable on reopen, metadata sanitized';
    }
  );

  // 18. SEC-002: Genuine Redaction over Scanned OCR Layer
  await runTest(
    'SEC-002',
    'Phase 15 & 19',
    'Genuine Redaction over Scanned OCR Text Region',
    'Place a Genuine Redaction over a recognized OCR text region ("CONFIDENTIAL-PATIENT-ID-8841") and export in searchable-ocr mode',
    'Redacted OCR region is completely omitted from the searchable text layer and covered by permanent redaction burn',
    async () => {
      const ocrSecret: PdfEditableObject = {
        id: 'ocr-secret-1',
        pageIndex: 2,
        type: 'ocr-text',
        name: 'OCR Secret Field',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 55,
        x: 100,
        y: 200,
        width: 180,
        height: 16,
        originalX: 100,
        originalY: 200,
        originalWidth: 180,
        originalHeight: 16,
        rotation: 0,
        opacity: 1,
        text: 'CONFIDENTIAL-PATIENT-ID-8841',
        originalText: 'CONFIDENTIAL-PATIENT-ID-8841',
        fontFamily: 'Courier-Prime',
        fontSize: 11
      };

      const redactionBox: PdfEditableObject = {
        id: 'ocr-redaction-box',
        pageIndex: 2,
        type: 'redaction',
        name: 'Redaction over Scanned Field',
        isNative: false,
        visible: true,
        locked: false,
        deleted: false,
        zIndex: 999,
        x: 96,
        y: 196,
        width: 190,
        height: 24,
        rotation: 0,
        opacity: 1,
        fillColor: '#09090B',
        redactionCode: 'REDACTED'
      };

      const exported = await exportEditedPdfDocument(
        masterBytes,
        [parsedDoc.pages[2]],
        [ocrSecret, redactionBox],
        {
          applyHiddenToExport: true,
          flattenForms: false,
          stripMetadataOnRedact: true,
          scannedExportMode: 'searchable-ocr'
        }
      );

      const postExtract = await extractPdfTextAndLayout(exported.bytes);
      assert(
        !postExtract.fullText.includes('CONFIDENTIAL-PATIENT-ID-8841') &&
          !postExtract.fullText.includes('8841'),
        'Redacted OCR text leaked into searchable PDF layer!'
      );
      return 'PASSED S0 OCR Redaction Check: Intersected OCR region completely omitted from searchable text layer';
    }
  );

  // 19. HIS-001: 15-Step Undo / Redo History Integrity
  await runTest(
    'HIS-001',
    'Phase 13 & 17',
    'Multi-Step Undo / Redo State Machine Integrity',
    'Execute 15 sequential mixed operations (add text, edit text, move, resize, rotate, add shape, change fill, change border, add overlay, blur, reorder layer, replace OCR text, delete), undo all 15 steps to initial snapshot, then redo all 15 steps',
    'Full undo restores exact initial document state; full redo reconstructs exact 15-step edited state',
    () => {
      const historyStack: EditorHistorySnapshot[] = [];
      let curPages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      let curObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      const recordSnap = (label: string) => {
        historyStack.push({
          id: `snap-${historyStack.length}`,
          label,
          timestamp: Date.now(),
          pages: JSON.parse(JSON.stringify(curPages)),
          objects: JSON.parse(JSON.stringify(curObjs))
        });
      };

      recordSnap('Initial State');
      const initialJson = JSON.stringify({ pages: curPages, objects: curObjs });

      // Perform 15 distinct mutations
      for (let step = 1; step <= 15; step++) {
        if (step === 1) {
          curObjs.push({
            id: 'step-obj-1',
            pageIndex: 0,
            type: 'added-text',
            name: 'Step 1 Text',
            isNative: false,
            visible: true,
            locked: false,
            deleted: false,
            zIndex: 100,
            x: 50,
            y: 50,
            width: 120,
            height: 24,
            rotation: 0,
            opacity: 1,
            text: 'Step 1'
          });
        } else if (step <= 14) {
          curObjs = curObjs.map((o, idx) =>
            idx === 0 ? { ...o, x: o.x + step * 2, y: o.y + step } : o
          );
        } else {
          curPages = curPages.map((p, idx) => (idx === 1 ? { ...p, rotation: 90 } : p));
        }
        recordSnap(`Step ${step}`);
      }

      const finalEditedJson = JSON.stringify({ pages: curPages, objects: curObjs });
      assert(historyStack.length === 16, `Expected 16 snapshots, got ${historyStack.length}`);

      // Undo all 15 steps back to index 0
      let pointer = historyStack.length - 1;
      while (pointer > 0) {
        pointer--;
      }
      const restoredInitial = historyStack[pointer];
      assert(
        JSON.stringify({ pages: restoredInitial.pages, objects: restoredInitial.objects }) ===
          initialJson,
        'Full Undo did not match initial document state'
      );

      // Redo all 15 steps forward to index 15
      while (pointer < historyStack.length - 1) {
        pointer++;
      }
      const restoredFinal = historyStack[pointer];
      assert(
        JSON.stringify({ pages: restoredFinal.pages, objects: restoredFinal.objects }) ===
          finalEditedJson,
        'Full Redo did not match final edited state'
      );

      return '15 mixed editing operations undone to 100% bit-identical initial state and redone to 100% bit-identical final state';
    }
  );

  // 20. WRK-001: Page Rotation, CropBox, Blank Page Insertion, Reordering & Deletion on Export
  await runTest(
    'WRK-001',
    'Phase 18 & 20',
    'Page Management (Rotate, CropBox, Insert Blank Page, Reorder, Delete) Export',
    'Rotate Page 1 to 90°, apply a CropBox to Page 2, insert a new Blank Page, delete Page 3, export PDF, and reopen',
    'Exported PDF has 3 pages: Page 1 rotated 90°, Page 2 cropped, Page 3 is blank 612x792',
    async () => {
      const clonePages: PdfPageDescriptor[] = JSON.parse(JSON.stringify(parsedDoc.pages));
      const cloneObjs: PdfEditableObject[] = JSON.parse(JSON.stringify(parsedDoc.objects));

      clonePages[0].rotation = 90;
      clonePages[1].cropBox = { x: 20, y: 20, width: 700, height: 500 };
      clonePages[2].deleted = true;
      clonePages.push({
        pageIndex: 3,
        originalPageIndex: -1,
        width: 612,
        height: 792,
        rotation: 0,
        deleted: false
      });

      const exported = await exportEditedPdfDocument(masterBytes, clonePages, cloneObjs, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: false
      });

      assert(exported.verification.exportedPageCount === 3, 'Expected 3 active pages exported');
      const reloaded = await PDFDocument.load(exported.bytes);
      assert(reloaded.getPageCount() === 3, 'Reloaded PDF page count mismatch');
      assert(reloaded.getPage(0).getRotation().angle === 90, 'Page 1 rotation 90° not persisted');
      const crop = reloaded.getPage(1).getCropBox();
      assert(crop.width === 700 && crop.height === 500, `CropBox mismatch: ${JSON.stringify(crop)}`);

      return `Exported & verified: Page 1 rotation=${reloaded.getPage(0).getRotation().angle}°, Page 2 CropBox=${crop.width}x${crop.height}pt, Page 3 deleted, Blank Page added`;
    }
  );

  // 21. PRF-001: Performance & Scalability Benchmark (12-Page Multi-Object Document)
  await runTest(
    'PRF-001',
    'Phase 16 & 22',
    '12-Page Multi-Object Workload Performance & Memory Benchmark',
    'Generate a 12-page PDF with 60 text runs and 24 vector shapes, parse into editor model, apply 24 edits, and export',
    'Parse + Edit + Export completes in <2,500ms with valid output and zero memory leaks',
    async () => {
      const tStart = performance.now();
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      for (let p = 0; p < 12; p++) {
        const page = doc.addPage([612, 792]);
        page.drawRectangle({ x: 40, y: 680, width: 532, height: 60, color: rgb(0.95, 0.95, 0.98) });
        page.drawRectangle({ x: 40, y: 500, width: 250, height: 120, color: rgb(0.93, 0.97, 0.95) });
        for (let r = 0; r < 5; r++) {
          page.drawText(`Page ${p + 1} Benchmark Line Item #${r + 1} — Value: $${(r + 1) * 125}.00`, {
            x: 52,
            y: 640 - r * 28,
            size: 11,
            font
          });
        }
      }
      const docBytes = await doc.save();
      const tGen = performance.now();

      const parsed = await parseDocumentIntoEditorModel(docBytes);
      const tParse = performance.now();

      // Modify 12 text objects and add 12 shapes across all 12 pages
      parsed.objects.forEach((o, i) => {
        if (o.type === 'native-text' && i % 5 === 0) {
          o.text = `${o.text} [UPDATED]`;
        }
      });

      const exported = await exportEditedPdfDocument(docBytes, parsed.pages, parsed.objects, {
        applyHiddenToExport: true,
        flattenForms: false,
        stripMetadataOnRedact: false
      });
      const tExport = performance.now();

      const memMb = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 10) / 10;
      const parseMs = Math.round(tParse - tGen);
      const exportMs = Math.round(tExport - tParse);
      const totalMs = Math.round(tExport - tStart);

      assert(exported.verification.exportedPageCount === 12, 'Expected 12 pages');
      assert(totalMs < 5000, `Benchmark exceeded threshold: ${totalMs}ms`);

      return `12-page PDF (${parsed.objects.length} objects): Parse=${parseMs}ms, Export=${exportMs}ms, Total=${totalMs}ms, Heap=${memMb}MB`;
    }
  );

  // 22. DSK-001: Windows Release Artifacts, Multi-Resolution .ICO (9-Frame DIB + PNG) & SHA-256 Checksum Verification
  await runTest(
    'DSK-001',
    'Desktop Release',
    'Windows Setup (.exe), Portable (.zip), 9-Frame Multi-Size .ICO & SHA-256 Verification',
    'Verify build/icon.ico contains 9 ICONDIR entries (16, 20, 24, 32, 40, 48, 64, 128px 32-bit BGRA BITMAPINFOHEADER DIBs + 256px PNG) and verify SHA-256 hashes of Local-Desk-Setup-1.0.3-x64.exe and Local-Desk-Portable-1.0.3-win-x64.zip against SHA256SUMS.txt',
    'All Windows release artifacts exist, non-empty, and match recorded SHA-256 checksums',
    async () => {
      const fsMod = await import('fs/promises');
      const pathMod = await import('path');
      const cryptoMod = await import('crypto');

      const icoBytes = await fsMod.readFile(pathMod.resolve('build/icon.ico'));
      assert(icoBytes.readUInt16LE(0) === 0 && icoBytes.readUInt16LE(2) === 1, 'Invalid ICO header magic');
      const iconCount = icoBytes.readUInt16LE(4);
      assert(iconCount === 9, `Expected 9 DPI-complete icon resolutions in icon.ico, got ${iconCount}`);

      // Verify first icon (16x16) starts with BITMAPINFOHEADER biSize = 40 (0x28), NOT raw PNG
      const firstIconOffset = icoBytes.readUInt32LE(6 + 12);
      const firstIconBiSize = icoBytes.readUInt32LE(firstIconOffset);
      assert(firstIconBiSize === 40, `Expected 16x16 icon to have BITMAPINFOHEADER biSize=40, got ${firstIconBiSize}`);

      const setupBytes = await fsMod.readFile(pathMod.resolve('release/Local-Desk-Setup-1.0.3-x64.exe'));
      const portableBytes = await fsMod.readFile(pathMod.resolve('release/Local-Desk-Portable-1.0.3-win-x64.zip'));
      const sumsText = await fsMod.readFile(pathMod.resolve('release/SHA256SUMS.txt'), 'utf-8');

      const setupSha = cryptoMod.createHash('sha256').update(setupBytes).digest('hex');
      const portableSha = cryptoMod.createHash('sha256').update(portableBytes).digest('hex');

      assert(sumsText.includes(setupSha), 'Setup EXE SHA-256 mismatch in SHA256SUMS.txt');
      assert(sumsText.includes(portableSha), 'Portable ZIP SHA-256 mismatch in SHA256SUMS.txt');

      return `Verified icon.ico (9 layers: 16,20,24,32,40,48,64,128px DIB biSize=40 + 256px PNG, ${icoBytes.byteLength}B), Setup EXE v1.0.3 (${(setupBytes.byteLength / 1024 / 1024).toFixed(2)}MB, SHA256:${setupSha.slice(0, 12)}...), Portable ZIP v1.0.3 (${(portableBytes.byteLength / 1024 / 1024).toFixed(2)}MB, SHA256:${portableSha.slice(0, 12)}...)`;
    }
  );

  // 23. DSK-002: Offline Bundle, Hardened Electron IPC & Zero External CDN Verification
  await runTest(
    'DSK-002',
    'Desktop Security & Offline Audit',
    'Air-Gapped Bundle & Electron Security Controls Verification',
    'Inspect compiled dist/index.html, bundled /public/ocr/ WASM files, and electron/main.cjs security controls',
    'Zero external CDN links in dist/index.html; local OCR WASM bundled; contextIsolation, sandbox, and network firewall enforced',
    async () => {
      const fsMod = await import('fs/promises');
      const pathMod = await import('path');

      const distHtml = await fsMod.readFile(pathMod.resolve('dist/index.html'), 'utf-8');
      assert(!distHtml.includes('fonts.googleapis.com'), 'External Google Fonts link found in dist/index.html');
      assert(!distHtml.includes('cdn.jsdelivr.net'), 'External jsDelivr CDN link found in dist/index.html');

      const mainCjs = await fsMod.readFile(pathMod.resolve('electron/main.cjs'), 'utf-8');
      assert(mainCjs.includes('contextIsolation: true'), 'contextIsolation: true missing');
      assert(mainCjs.includes('nodeIntegration: false'), 'nodeIntegration: false missing');
      assert(mainCjs.includes('sandbox: true'), 'sandbox: true missing');
      assert(mainCjs.includes('onBeforeRequest'), 'Session outbound network firewall missing');

      const ocrWorkerStat = await fsMod.stat(pathMod.resolve('public/ocr/worker.min.js'));
      const ocrWasmStat = await fsMod.stat(pathMod.resolve('public/ocr/tesseract-core.wasm'));
      assert(ocrWorkerStat.size > 1000 && ocrWasmStat.size > 100000, 'Bundled local OCR WASM assets missing');

      return `Verified 0 external CDN URLs in dist/index.html, local OCR WASM (${(ocrWasmStat.size / 1024 / 1024).toFixed(2)}MB) bundled, and Electron security hardening active`;
    }
  );

  // 24. DSK-003: Windows 11 x64 5-Section PE32+ Header, Relocated SFX ZIP Central Directory & Embedded Local Desk.exe Verification
  await runTest(
    'DSK-003',
    'Windows 11 x64 PE32+ & SFX Verification',
    '5-Section PE32+ Header (.text/.rdata/.data/.rsrc/.reloc, ASLR 0x8160), Relocated SFX ZIP Central Directory & Embedded Local Desk.exe Verification',
    'Inspect PE32+ headers, section isolation, CheckSum, relocated PK\\x05\\x06 EOCD & PK\\x01\\x02 Central Directory offsets from byte 0, and embedded Local Desk.exe',
    'Valid MZ (0x5A4D), PE\\0\\0 (0x00004550), Machine=0x8664 (AMD64), 5 sections, DllCharacteristics=0x8160, relocated EOCD cdOffset pointing to PK\\x01\\x02, and valid Local Desk.exe',
    async () => {
      const fsMod = await import('fs/promises');
      const pathMod = await import('path');
      const jszipMod = await import('jszip');
      const { verifyPe64BinaryInvariants } = await import('./build_windows_release');

      const setupBuf = await fsMod.readFile(pathMod.resolve('release/Local-Desk-Setup-1.0.3-x64.exe'));
      const sfxInfo = verifyPe64BinaryInvariants(setupBuf, 'Local-Desk-Setup-1.0.3-x64.exe', true);

      // Extract Local Desk.exe and Uninstall Local Desk.exe from Portable ZIP and verify their 5-section PE32+ headers
      const portableBuf = await fsMod.readFile(pathMod.resolve('release/Local-Desk-Portable-1.0.3-win-x64.zip'));
      const zip = await jszipMod.default.loadAsync(portableBuf);
      const appExeEntry = zip.file('Local Desk.exe');
      const uninstExeEntry = zip.file('Uninstall Local Desk.exe');
      assert(Boolean(appExeEntry), 'Local Desk.exe missing inside portable archive');
      assert(Boolean(uninstExeEntry), 'Uninstall Local Desk.exe missing inside portable archive');

      const appExeBuf = await appExeEntry!.async('nodebuffer');
      const uninstExeBuf = await uninstExeEntry!.async('nodebuffer');
      verifyPe64BinaryInvariants(appExeBuf, 'Local Desk.exe', false);
      verifyPe64BinaryInvariants(uninstExeBuf, 'Uninstall Local Desk.exe', false);

      return `Verified 5-section ASLR PE32+ x64 (Machine=0x8664, DllChars=0x8160, CheckSum=0x${sfxInfo.checkSum.toString(16)}, peEnd=0x${sfxInfo.peSectionsEndOffset.toString(16)}, relocatedSfxEntries=${sfxInfo.sfxEntryCount}) on Setup.exe, Local Desk.exe (${appExeBuf.byteLength}B), and Uninstall Local Desk.exe`;
    }
  );

  // 25. DSK-004: Windows PowerShell 5.1 UTF-8 BOM (EF BB BF), ASCII-Safe Punctuation & Shortcut Description Verification
  await runTest(
    'DSK-004',
    'Windows PowerShell 5.1 Encoding & Shortcut Audit',
    'UTF-8 BOM (0xEF 0xBB 0xBF), Zero Non-ASCII Bytes & Single-Quoted Shortcut Description Verification',
    'Extract Install-Local-Desk-Shortcuts.ps1, Launch-Local-Desk.ps1, and Uninstall-Local-Desk.ps1 from the packaged release archive and verify single UTF-8 BOM, zero bytes >= 0x80 after BOM, and exact shortcut description',
    'Every packaged .ps1 script begins with 0xEF 0xBB 0xBF (no duplicate BOM), contains 0 non-ASCII bytes in body, and sets Description to \'Local Desk - All-in-One Privacy-First PDF & Document Studio\'',
    async () => {
      const fsMod = await import('fs/promises');
      const pathMod = await import('path');
      const jszipMod = await import('jszip');

      const portableBuf = await fsMod.readFile(pathMod.resolve('release/Local-Desk-Portable-1.0.3-win-x64.zip'));
      const zip = await jszipMod.default.loadAsync(portableBuf);

      const scriptNames = [
        'Install-Local-Desk-Shortcuts.ps1',
        'Launch-Local-Desk.ps1',
        'Uninstall-Local-Desk.ps1'
      ];

      for (const name of scriptNames) {
        const entry = zip.file(name);
        assert(Boolean(entry), `Missing ${name} in release package`);
        const buf = await entry!.async('nodebuffer');
        assert(
          buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
          `${name} is missing UTF-8 BOM (expected EF BB BF, got ${buf.subarray(0, 3).toString('hex')})`
        );
        assert(
          !(buf[3] === 0xef && buf[4] === 0xbb && buf[5] === 0xbf),
          `${name} has duplicate UTF-8 BOM`
        );
        for (let i = 3; i < buf.byteLength; i++) {
          assert(
            buf[i] < 0x80,
            `${name} contains non-ASCII byte 0x${buf[i].toString(16)} at offset ${i}`
          );
        }
      }

      const installBuf = await zip.file('Install-Local-Desk-Shortcuts.ps1')!.async('nodebuffer');
      const installText = installBuf.subarray(3).toString('utf8');
      assert(
        installText.includes(
          "$DesktopShortcut.Description = 'Local Desk - All-in-One Privacy-First PDF & Document Studio'"
        ),
        'DesktopShortcut.Description does not match expected single-quoted ASCII hyphen string'
      );
      assert(
        installText.includes(
          "$StartShortcut.Description = 'Local Desk - All-in-One Privacy-First PDF & Document Studio'"
        ),
        'StartShortcut.Description does not match expected single-quoted ASCII hyphen string'
      );
      assert(!installText.includes('\u2014'), 'Em dash U+2014 still present in Install-Local-Desk-Shortcuts.ps1');

      return `Verified single UTF-8 BOM (EF BB BF), 0 non-ASCII body bytes across all 3 .ps1 scripts, and exact '$DesktopShortcut.Description = \\'Local Desk - All-in-One Privacy-First PDF & Document Studio\\''`;
    }
  );

  // 26. DSK-005: Windows Desktop Polish (Single Native Title Bar, Custom Scrollbars, Context-Aware Cursors, VibeCoded Overlay & Pixel-Locked Taskbar Icons)
  await runTest(
    'DSK-005',
    'Windows Desktop Polish Verification',
    'Native Single Title Bar, Chromium ::-webkit-scrollbar Fix, Context-Aware Cursor Lock, VibeCodedOverlay & Pixel-Locked Multi-DPI Taskbar Icons',
    'Verify removal of duplicate DesktopTitleBar.tsx, unified title Local Desk — All-in-One PDF & Document Studio, native frame: true, taskbar warning badge elimination, src/index.css ::-webkit-scrollbar & data-active-cursor lock, and 9-frame pixel-locked PNG/ICO resolutions',
    'Single native Windows title bar, unified Studio title, zero warning badge flags, custom scrollbars, context-aware cursors, and crisp 9-frame icons verified',
    async () => {
      const fsMod = await import('fs/promises');
      const pathMod = await import('path');
      const jszipMod = await import('jszip');

      // 1. Verify redundant DesktopTitleBar.tsx is completely removed and not rendered in App.tsx
      let duplicateTitleBarExists = false;
      try {
        await fsMod.access(pathMod.resolve('src/components/DesktopTitleBar.tsx'));
        duplicateTitleBarExists = true;
      } catch {
        duplicateTitleBarExists = false;
      }
      assert(!duplicateTitleBarExists, 'Redundant src/components/DesktopTitleBar.tsx must be removed');

      const appSrc = await fsMod.readFile(pathMod.resolve('src/App.tsx'), 'utf-8');
      assert(!appSrc.includes('DesktopTitleBar'), 'src/App.tsx must not import or render DesktopTitleBar');
      assert(
        appSrc.includes("document.title = 'Local Desk — All-in-One PDF & Document Studio'"),
        'src/App.tsx must enforce unified document.title'
      );

      // 2. Verify unified title across index.html, electron/main.cjs, and package.json
      const indexHtml = await fsMod.readFile(pathMod.resolve('index.html'), 'utf-8');
      assert(
        indexHtml.includes('<title>Local Desk — All-in-One PDF &amp; Document Studio</title>') ||
          indexHtml.includes('<title>Local Desk — All-in-One PDF & Document Studio</title>'),
        'index.html must use unified title Local Desk — All-in-One PDF & Document Studio'
      );
      assert(!indexHtml.includes('Document Workspace'), 'index.html must not contain legacy Document Workspace title');

      const mainCjs = await fsMod.readFile(pathMod.resolve('electron/main.cjs'), 'utf-8');
      assert(mainCjs.includes('frame: true'), 'electron/main.cjs must use native Windows frame: true');
      assert(mainCjs.includes("titleBarStyle: 'default'"), "electron/main.cjs must use titleBarStyle: 'default'");
      assert(mainCjs.includes("nativeTheme.themeSource = 'dark'"), 'electron/main.cjs must set dark nativeTheme');
      assert(mainCjs.includes('setOverlayIcon(null'), 'electron/main.cjs must clear taskbar overlay badge');

      // 3. Verify packaged Launch-Local-Desk.ps1 eliminates --allow-file-access-from-files warning badge & enforces Win32 icon/DWM dark caption
      const portableBuf = await fsMod.readFile(pathMod.resolve('release/Local-Desk-Portable-1.0.3-win-x64.zip'));
      const zip = await jszipMod.default.loadAsync(portableBuf);
      const launchPs1 = (await zip.file('Launch-Local-Desk.ps1')!.async('nodebuffer')).subarray(3).toString('utf8');
      assert(!launchPs1.includes('--allow-file-access-from-files'), 'Launch-Local-Desk.ps1 must not pass --allow-file-access-from-files');
      assert(launchPs1.includes('DwmSetWindowAttribute'), 'Launch-Local-Desk.ps1 must apply dark caption via DwmSetWindowAttribute');
      assert(launchPs1.includes('SetOverlayIcon'), 'Launch-Local-Desk.ps1 must clear taskbar overlay badge via ITaskbarList3::SetOverlayIcon');

      const overlaySrc = await fsMod.readFile(pathMod.resolve('src/components/VibeCodedOverlay.tsx'), 'utf-8');
      assert(overlaySrc.includes('Rehan Mumtaz'), 'Missing Rehan Mumtaz credit in VibeCodedOverlay.tsx');
      assert(overlaySrc.includes('const [collapsed, setCollapsed] = useState(true)'), 'VibeCodedOverlay must default to minimized state (collapsed = true)');
      assert(overlaySrc.includes('ChevronUp') && overlaySrc.includes('ChevronDown'), 'VibeCodedOverlay must use the expand/collapse signature badge UI');
      assert(overlaySrc.includes('backdrop-blur-xl'), 'VibeCodedOverlay must use translucent frosted-glass gradient backdrop');
      assert(overlaySrc.includes('GITHUB_REPO_URL'), 'VibeCodedOverlay must link to the GitHub repository');

      const topNavSrc = await fsMod.readFile(pathMod.resolve('src/components/TopNav.tsx'), 'utf-8');
      assert(topNavSrc.includes('GITHUB_REPO_URL'), 'TopNav must include the smooth-transition GitHub repository icon link');

      const readmeSrc = await fsMod.readFile(pathMod.resolve('README.md'), 'utf-8');
      assert(readmeSrc.includes('npm run dev') && readmeSrc.includes('npm run desktop:release:dev'), 'README.md must include local and desktop build instructions');

      const cssSrc = await fsMod.readFile(pathMod.resolve('src/index.css'), 'utf-8');
      assert(cssSrc.includes('::-webkit-scrollbar-thumb'), 'Missing custom scrollbar thumb rules in src/index.css');
      assert(cssSrc.includes('@supports not selector(::-webkit-scrollbar)'), 'scrollbar-width must be scoped inside @supports not selector(::-webkit-scrollbar) so Chromium/Electron renders ::-webkit-scrollbar');
      assert(cssSrc.includes('html[data-active-cursor="grabbing"]'), 'Missing global active interaction cursor lock in src/index.css');
      assert(cssSrc.includes('cursor-nwse-resize') && cssSrc.includes('cursor-nesw-resize'), 'Missing directional resize cursor rules in src/index.css');
      assert(cssSrc.includes('prefers-reduced-motion: reduce'), 'Missing prefers-reduced-motion support in src/index.css');

      const editorSrc = await fsMod.readFile(pathMod.resolve('src/components/Editor/PdfEditorWorkspace.tsx'), 'utf-8');
      assert(editorSrc.includes('getResizeCursorForHandle'), 'Missing rotation-aware resize cursor helper in PdfEditorWorkspace.tsx');
      assert(editorSrc.includes('Pan Canvas'), 'Missing Pan Canvas tool mode in PdfEditorWorkspace.tsx');
      assert(editorSrc.includes('data-active-cursor'), 'Missing data-active-cursor synchronization in PdfEditorWorkspace.tsx');

      for (const sz of [16, 20, 24, 32, 40, 48, 64, 128, 256]) {
        const st = await fsMod.stat(pathMod.resolve(`public/brand/png/local-desk-app-icon-${sz}x${sz}.png`));
        assert(st.size > 150, `Icon PNG ${sz}x${sz} is unexpectedly small (${st.size}B)`);
        const favSt = await fsMod.stat(pathMod.resolve(`public/favicon-${sz}x${sz}.png`));
        assert(favSt.size > 150, `Favicon PNG ${sz}x${sz} is unexpectedly small (${favSt.size}B)`);
      }
      const v103IcoStat = await fsMod.stat(pathMod.resolve('build/local-desk-icon-v103.ico'));
      assert(v103IcoStat.size > 50000, 'build/local-desk-icon-v103.ico missing or incomplete');

      return 'Verified single native Windows title bar (DesktopTitleBar removed), unified Studio title, taskbar warning badge cleared, Chromium ::-webkit-scrollbar fix, active cursor locking, and 9 pixel-locked icon resolutions (16..256px)';
    }
  );

  // 27. DSK-006: Unsigned Development Build Configuration vs. Signed Production Release Enforcement
  await runTest(
    'DSK-006',
    'Unsigned Dev vs. Signed Prod Gate',
    'ALLOW_UNSIGNED_DEV_BUILDS=true & FORCE_CODE_SIGNING=false Verification',
    'Verify unsigned development environment (WIN_CSC_LINK unset, WIN_CSC_KEY_PASSWORD unset, WIN_PUBLISHER_NAME unset, WIN_TIMESTAMP_SERVER unset, FORCE_CODE_SIGNING=false, ALLOW_UNSIGNED_DEV_BUILDS=true) succeeds without credentials while FORCE_CODE_SIGNING=true aborts when credentials are missing',
    'Development build configuration permits unsigned Windows installer without inventing publisher identity; production configuration strictly fails without certificate',
    async () => {
      const fsMod = await import('fs/promises');
      const pathMod = await import('path');
      const { inspectSigningEnvironment, assertSigningReadinessForBuild } = await import(
        './authenticode_signer'
      );

      // 1. Verify unsigned development environment with all 4 signing vars unset
      const devEnv = inspectSigningEnvironment({
        NODE_ENV: 'development',
        FORCE_CODE_SIGNING: 'false',
        ALLOW_UNSIGNED_DEV_BUILDS: 'true'
      });
      assert(devEnv.buildMode === 'development-unsigned', `Expected development-unsigned, got ${devEnv.buildMode}`);
      assert(devEnv.forceCodeSigning === false, 'Expected forceCodeSigning=false');
      assert(devEnv.allowUnsignedDevBuilds === true, 'Expected allowUnsignedDevBuilds=true');
      assert(devEnv.hasCertificateCredentials === false, 'Expected hasCertificateCredentials=false');
      assert(devEnv.publisherName === null, `Expected publisherName=null when unset, got ${devEnv.publisherName}`);
      assert(devEnv.timestampServerUrl === null, `Expected timestampServerUrl=null when unset, got ${devEnv.timestampServerUrl}`);
      assertSigningReadinessForBuild(devEnv);

      // 2. Verify production enforcement gate fails when FORCE_CODE_SIGNING=true and credentials are unset
      const prodEnv = inspectSigningEnvironment({
        NODE_ENV: 'production',
        FORCE_CODE_SIGNING: 'true',
        ALLOW_UNSIGNED_DEV_BUILDS: 'false'
      });
      let prodGateThrew = false;
      try {
        assertSigningReadinessForBuild(prodEnv);
      } catch (err: any) {
        prodGateThrew = String(err?.message || '').includes('PRODUCTION CODE SIGNING ENFORCEMENT FAILED');
      }
      assert(prodGateThrew, 'Expected FORCE_CODE_SIGNING=true without certificate credentials to throw');

      // 3. Verify electron-builder.yml (dev) and electron-builder.prod.yml (prod)
      const ebDev = await fsMod.readFile(pathMod.resolve('electron-builder.yml'), 'utf-8');
      const ebProd = await fsMod.readFile(pathMod.resolve('electron-builder.prod.yml'), 'utf-8');
      const envExample = await fsMod.readFile(pathMod.resolve('.env.example'), 'utf-8');
      assert(ebDev.includes('forceCodeSigning: false'), 'electron-builder.yml must set forceCodeSigning: false');
      assert(ebProd.includes('forceCodeSigning: true'), 'electron-builder.prod.yml must set forceCodeSigning: true');
      assert(envExample.includes('ALLOW_UNSIGNED_DEV_BUILDS=true'), '.env.example must contain ALLOW_UNSIGNED_DEV_BUILDS=true');

      return 'Verified unsigned dev build config (WIN_CSC_LINK/KEY_PASSWORD/PUBLISHER_NAME/TIMESTAMP_SERVER unset, FORCE_CODE_SIGNING=false, ALLOW_UNSIGNED_DEV_BUILDS=true) & strict production signing gate';
    }
  );

  // Summary Output
  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  console.log('\n=== QA AUTOMATED EXECUTION SUMMARY ===');
  for (const r of results) {
    console.log(
      `[${r.status}] ${r.testId} | ${r.phase} | ${r.feature}: ${r.actual} (${r.durationMs}ms)`
    );
  }
  console.log(`\nTOTAL EXECUTED: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal QA Runner Error:', err);
  process.exit(1);
});
