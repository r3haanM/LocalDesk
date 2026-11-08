import zlib from 'zlib';
import http from 'http';
import https from 'https';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { runScannedPageOcr } from '../src/services/scannedOcrEngine';
import { executePdfTool } from '../src/services/pdfToolsProcessor';

// ---------------------------------------------------------------------------
// Clean 8x8 Bitmap Font (scaled 3x -> 24x24px crisp black glyphs on white page)
// for generating a 100% genuine raster scanned PNG & Scanned PDF (0 text streams)
// ---------------------------------------------------------------------------
const FONT_8X8: Record<string, number[]> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '0': [0x3c, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00],
  '1': [0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x7e, 0x00],
  '2': [0x3c, 0x66, 0x06, 0x1c, 0x30, 0x66, 0x7e, 0x00],
  '4': [0x0c, 0x1c, 0x3c, 0x6c, 0x7e, 0x0c, 0x0c, 0x00],
  '5': [0x7e, 0x60, 0x7c, 0x06, 0x06, 0x66, 0x3c, 0x00],
  '6': [0x3c, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x3c, 0x00],
  '8': [0x3c, 0x66, 0x66, 0x3c, 0x66, 0x66, 0x3c, 0x00],
  A: [0x18, 0x3c, 0x66, 0x66, 0x7e, 0x66, 0x66, 0x00],
  C: [0x3c, 0x66, 0x60, 0x60, 0x60, 0x66, 0x3c, 0x00],
  D: [0x78, 0x6c, 0x66, 0x66, 0x66, 0x6c, 0x78, 0x00],
  E: [0x7e, 0x60, 0x60, 0x7c, 0x60, 0x60, 0x7e, 0x00],
  F: [0x7e, 0x60, 0x60, 0x7c, 0x60, 0x60, 0x60, 0x00],
  I: [0x3c, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3c, 0x00],
  K: [0x66, 0x6c, 0x78, 0x70, 0x78, 0x6c, 0x66, 0x00],
  L: [0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x7e, 0x00],
  M: [0x63, 0x77, 0x7f, 0x6b, 0x63, 0x63, 0x63, 0x00],
  N: [0x63, 0x73, 0x7b, 0x6f, 0x67, 0x63, 0x63, 0x00],
  O: [0x3c, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00],
  P: [0x7c, 0x66, 0x66, 0x7c, 0x60, 0x60, 0x60, 0x00],
  R: [0x7c, 0x66, 0x66, 0x7c, 0x6c, 0x66, 0x66, 0x00],
  S: [0x3c, 0x66, 0x60, 0x3c, 0x06, 0x66, 0x3c, 0x00],
  T: [0x7e, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x00],
  U: [0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x00],
  V: [0x66, 0x66, 0x66, 0x66, 0x66, 0x3c, 0x18, 0x00]
};

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function buildScannedPagePng(lines: string[]): { pngBytes: Buffer; width: number; height: number } {
  const width = 900;
  const height = 420;
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255); // Pure white page background

  const scale = 4; // 32x32 px per character
  const charAdvance = 9 * scale;

  lines.forEach((line, lineIdx) => {
    const startX = 60;
    const startY = 70 + lineIdx * 105;
    for (let cIdx = 0; cIdx < line.length; cIdx++) {
      const ch = line[cIdx].toUpperCase();
      const rows = FONT_8X8[ch] || FONT_8X8[' '];
      const gx = startX + cIdx * charAdvance;
      for (let r = 0; r < 8; r++) {
        const rowBits = rows[r];
        for (let b = 0; b < 8; b++) {
          if ((rowBits >> (7 - b)) & 1) {
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const px = gx + b * scale + sx;
                const py = startY + r * scale + sy;
                if (px >= 0 && px < width && py >= 0 && py < height) {
                  const idx = (py * width + px) * 4;
                  rgba[idx] = 15;
                  rgba[idx + 1] = 15;
                  rgba[idx + 2] = 20;
                  rgba[idx + 3] = 255;
                }
              }
            }
          }
        }
      }
    }
  });

  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawScanlines[rowStart] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(rawScanlines, rowStart + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(rawScanlines, { level: 6 });

  const pngBytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);

  return { pngBytes, width, height };
}

async function buildScannedPdfFromPng(pngBytes: Buffer, width: number, height: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([width, height]);
  const pngImage = await pdfDoc.embedPng(pngBytes);
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width,
    height
  });
  return await pdfDoc.save();
}

function installCanvasShimForScannedPng(pngBytes: Buffer, width: number, height: number) {
  const dataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
  const createCanvasObj = () => {
    const canvasObj: any = {
      width,
      height,
      style: {},
      toDataURL: () => dataUrl
    };
    const ctx: any = {
      canvas: canvasObj,
      fillStyle: '#FFFFFF',
      strokeStyle: '#000000',
      lineWidth: 1,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      font: '12px sans-serif',
      fillRect: () => {},
      clearRect: () => {},
      strokeRect: () => {},
      drawImage: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      rect: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (t: string) => ({ width: (t || '').length * 8 }),
      transform: () => {},
      setTransform: () => {},
      resetTransform: () => {},
      getTransform: () => {
        const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, invertSelf: () => m };
        return m;
      },
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(Math.max(1, w * h * 4)).fill(255)
      }),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(Math.max(1, w * h * 4)).fill(255)
      }),
      putImageData: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {},
      rotate: () => {},
      translate: () => {}
    };
    canvasObj.getContext = () => ctx;
    return canvasObj;
  };

  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag.toLowerCase() === 'canvas') {
        return createCanvasObj();
      }
      return {};
    }
  };
}

async function main() {
  console.log('=== STEP 3: LOCAL DESK OFFLINE ENGLISH OCR VERIFICATION SUITE ===\n');

  const scanLines = [
    'LOCAL DESK OFFLINE OCR',
    'INVOICE   2026   1420',
    'AMOUNT    USD    2400'
  ];

  const { pngBytes, width, height } = buildScannedPagePng(scanLines);
  const scannedPdfBytes = await buildScannedPdfFromPng(pngBytes, width, height);
  const scannedPdfBuffer = scannedPdfBytes.buffer.slice(
    scannedPdfBytes.byteOffset,
    scannedPdfBytes.byteOffset + scannedPdfBytes.byteLength
  ) as ArrayBuffer;

  installCanvasShimForScannedPng(pngBytes, width, height);

  const setNavigator = (nav: { onLine: boolean; userAgent: string }) => {
    Object.defineProperty(globalThis, 'navigator', {
      value: nav,
      configurable: true,
      writable: true
    });
  };

  // -------------------------------------------------------------------------
  // TEST 1: Desktop app, normal
  // -------------------------------------------------------------------------
  (globalThis as any).window = globalThis;
  (globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 0);
  (globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
  (globalThis as any).window.localDeskEnv = { shell: 'desktop' };
  (globalThis as any).window.localDeskNative = { isDesktop: true };
  setNavigator({ onLine: true, userAgent: 'Electron/33.0.0' });

  const t1Result = await runScannedPageOcr({
    pdfBuffer: scannedPdfBuffer,
    pageIndex: 0,
    pageWidthPt: width,
    pageHeightPt: height,
    pageRotationDeg: 0,
    docCacheKey: 'test1-desktop-normal',
    preprocessMode: 'none'
  });

  const t1Text = t1Result.regions.map((r) => r.text).join(' | ');
  const t1UsedFallback = t1Result.regions.some(
    (r) => r.ocrGeometry?.recognitionSource === 'connected-components-2d'
  );
  const t1Sources = Array.from(
    new Set(t1Result.regions.map((r) => r.ocrGeometry?.recognitionSource))
  );
  const t1Pass =
    !t1UsedFallback &&
    t1Result.regions.length > 0 &&
    /LOCAL/i.test(t1Text) &&
    /DESK/i.test(t1Text) &&
    /OFFLINE/i.test(t1Text) &&
    /OCR/i.test(t1Text) &&
    /INVOICE/i.test(t1Text) &&
    /2026/.test(t1Text) &&
    /1420/.test(t1Text) &&
    /AMOUNT/i.test(t1Text) &&
    /USD/i.test(t1Text) &&
    /2400/.test(t1Text);

  console.log(`[Test 1] Desktop app (normal): ${t1Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  - Regions recognized: ${t1Result.regions.length}`);
  console.log(`  - Recognition source: ${t1Sources.join(', ')} (fallback used: ${t1UsedFallback})`);
  console.log(`  - Recognized text:    "${t1Text}"\n`);

  // -------------------------------------------------------------------------
  // TEST 2: Desktop app, internet blocked (strict firewall + navigator.onLine=false)
  // -------------------------------------------------------------------------
  let blockedExternalRequests = 0;
  const origFetch = globalThis.fetch;
  const origHttpRequest = http.request;
  const origHttpsRequest = https.request;

  setNavigator({ onLine: false, userAgent: 'Electron/33.0.0' });
  globalThis.fetch = (async (input: any, init?: any) => {
    const urlStr = typeof input === 'string' ? input : String(input?.url || input);
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
      blockedExternalRequests++;
      throw new Error(`FIREWALL BLOCKED OUTBOUND FETCH: ${urlStr}`);
    }
    return origFetch(input, init);
  }) as any;
  (http as any).request = () => {
    blockedExternalRequests++;
    throw new Error('FIREWALL BLOCKED HTTP.REQUEST');
  };
  (https as any).request = () => {
    blockedExternalRequests++;
    throw new Error('FIREWALL BLOCKED HTTPS.REQUEST');
  };

  let t2Result;
  try {
    t2Result = await runScannedPageOcr({
      pdfBuffer: scannedPdfBuffer,
      pageIndex: 0,
      pageWidthPt: width,
      pageHeightPt: height,
      pageRotationDeg: 0,
      docCacheKey: 'test2-desktop-offline-firewall',
      preprocessMode: 'none'
    });
  } finally {
    globalThis.fetch = origFetch;
    (http as any).request = origHttpRequest;
    (https as any).request = origHttpsRequest;
  }

  const t2Text = t2Result.regions.map((r) => r.text).join(' | ');
  const t2UsedFallback = t2Result.regions.some(
    (r) => r.ocrGeometry?.recognitionSource === 'connected-components-2d'
  );
  const t2Sources = Array.from(
    new Set(t2Result.regions.map((r) => r.ocrGeometry?.recognitionSource))
  );
  const t2Pass =
    !t2UsedFallback &&
    blockedExternalRequests === 0 &&
    t2Text === t1Text &&
    /LOCAL/i.test(t2Text) &&
    /OFFLINE/i.test(t2Text) &&
    /INVOICE/i.test(t2Text) &&
    /1420/.test(t2Text) &&
    /2400/.test(t2Text);

  console.log(`[Test 2] Desktop app (internet blocked / air-gapped): ${t2Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  - Outbound network attempts: ${blockedExternalRequests}`);
  console.log(`  - Matches Test 1 identically: ${t2Text === t1Text}`);
  console.log(`  - Recognition source: ${t2Sources.join(', ')} (fallback used: ${t2UsedFallback})`);
  console.log(`  - Recognized text:    "${t2Text}"\n`);

  // -------------------------------------------------------------------------
  // TEST 3: PDF -> Excel on a scanned page (with internet blocked)
  // -------------------------------------------------------------------------
  setNavigator({ onLine: false, userAgent: 'Electron/33.0.0' });
  const excelResult = await executePdfTool(
    'pdf-to-excel',
    [
      {
        id: 'scanned-invoice-1',
        file: null as any,
        name: 'Scanned-Invoice.pdf',
        size: scannedPdfBytes.byteLength,
        type: 'application/pdf',
        isValidSignature: true,
        signatureLabel: 'PDF 1.7',
        addedAt: Date.now(),
        pageCount: 1,
        arrayBuffer: scannedPdfBuffer
      }
    ],
    { excelSheetMode: 'per-page' }
  );

  const wb = XLSX.read(excelResult.outputBytes, { type: 'array' });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const sheetRows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });
  const flatCells = sheetRows.flat().join(' ');
  const t3Pass =
    excelResult.success &&
    Number(excelResult.details?.['OCR Scanned Pages Processed'] || 0) === 1 &&
    !/Scanned Image Layer/i.test(flatCells) &&
    /LOCAL/i.test(flatCells) &&
    /OFFLINE/i.test(flatCells) &&
    /INVOICE/i.test(flatCells) &&
    /1420/.test(flatCells) &&
    /2400/.test(flatCells);

  console.log(`[Test 3] PDF -> Excel on scanned page (offline): ${t3Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  - OCR Scanned Pages Processed: ${excelResult.details?.['OCR Scanned Pages Processed']}`);
  console.log(`  - Extracted .xlsx rows:        ${JSON.stringify(sheetRows)}\n`);

  // -------------------------------------------------------------------------
  // TEST 4: Browser dev mode (online regression check)
  // -------------------------------------------------------------------------
  delete (globalThis as any).window.localDeskEnv;
  delete (globalThis as any).window.localDeskNative;
  setNavigator({ onLine: true, userAgent: 'Mozilla/5.0 Chrome/131.0.0.0' });

  const t4Result = await runScannedPageOcr({
    pdfBuffer: scannedPdfBuffer,
    pageIndex: 0,
    pageWidthPt: width,
    pageHeightPt: height,
    pageRotationDeg: 0,
    docCacheKey: 'test4-browser-dev-online',
    preprocessMode: 'none'
  });

  const t4Text = t4Result.regions.map((r) => r.text).join(' | ');
  const t4UsedFallback = t4Result.regions.some(
    (r) => r.ocrGeometry?.recognitionSource === 'connected-components-2d'
  );
  const t4Pass =
    !t4UsedFallback &&
    t4Text === t1Text &&
    /LOCAL/i.test(t4Text) &&
    /OFFLINE/i.test(t4Text) &&
    /INVOICE/i.test(t4Text) &&
    /1420/.test(t4Text) &&
    /2400/.test(t4Text);

  console.log(`[Test 4] Browser dev mode (online regression): ${t4Pass ? 'PASS' : 'FAIL'}`);
  console.log(`  - Recognition source: ${Array.from(new Set(t4Result.regions.map((r) => r.ocrGeometry?.recognitionSource))).join(', ')} (fallback used: ${t4UsedFallback})`);
  console.log(`  - Recognized text:    "${t4Text}"\n`);

  if (!t1Pass || !t2Pass || !t3Pass || !t4Pass) {
    process.exit(1);
  }
  console.log('=== ALL 4 OFFLINE & ONLINE OCR TESTS PASSED ===');
}

main().catch((err) => {
  console.error('OCR verification failed:', err);
  process.exit(1);
});
