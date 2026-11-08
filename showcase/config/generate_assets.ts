import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const ASSETS_DIR = path.resolve(__dirname, '../assets');
const DEMO_DIR = path.resolve(__dirname, '../demo');

/**
 * Minimal pure-Node CRC32 & PNG encoder for generating deterministic dark/light feature screenshots
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const rawScanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1);
    rawScanlines[rowOff] = 0; // Filter type 0 (None)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      rawScanlines,
      rowOff + 1
    );
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 6 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

type RgbColor = [number, number, number, number?];

function fillRect(
  rgba: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  color: RgbColor
) {
  const [r, g, b, a = 255] = color;
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(w, Math.floor(x + rw));
  const y1 = Math.min(h, Math.floor(y + rh));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const idx = (py * w + px) * 4;
      if (a === 255) {
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      } else {
        const alpha = a / 255;
        const inv = 1 - alpha;
        rgba[idx] = Math.round(r * alpha + rgba[idx] * inv);
        rgba[idx + 1] = Math.round(g * alpha + rgba[idx + 1] * inv);
        rgba[idx + 2] = Math.round(b * alpha + rgba[idx + 2] * inv);
        rgba[idx + 3] = 255;
      }
    }
  }
}

function strokeRect(
  rgba: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  rw: number,
  rh: number,
  thickness: number,
  color: RgbColor
) {
  fillRect(rgba, w, h, x, y, rw, thickness, color);
  fillRect(rgba, w, h, x, y + rh - thickness, rw, thickness, color);
  fillRect(rgba, w, h, x, y, thickness, rh, color);
  fillRect(rgba, w, h, x + rw - thickness, y, thickness, rh, color);
}

function renderFeatureScreenshotPng(
  variant: 'editor' | 'redactor' | 'conversions' | 'batch',
  theme: 'dark' | 'light'
): Buffer {
  const W = 960;
  const H = 540;
  const rgba = new Uint8Array(W * H * 4);

  const isDark = theme === 'dark';
  const bgCanvas: RgbColor = isDark ? [9, 13, 22, 255] : [243, 247, 245, 255];
  const bgSurface: RgbColor = isDark ? [15, 23, 34, 255] : [255, 255, 255, 255];
  const bgElevated: RgbColor = isDark ? [22, 33, 47, 255] : [234, 242, 238, 255];
  const borderSubtle: RgbColor = isDark ? [38, 56, 73, 255] : [206, 220, 213, 255];
  const brandGreen: RgbColor = [15, 165, 117, 255];
  const brandGreenSoft: RgbColor = isDark ? [15, 165, 117, 48] : [15, 165, 117, 36];
  const textPrimary: RgbColor = isDark ? [232, 245, 238, 255] : [14, 24, 20, 255];
  const textSecondary: RgbColor = isDark ? [143, 163, 155, 255] : [92, 112, 104, 255];
  const dangerRed: RgbColor = [225, 45, 75, 255];

  // Fill background
  fillRect(rgba, W, H, 0, 0, W, H, bgCanvas);

  // Outer Studio Frame
  fillRect(rgba, W, H, 24, 20, W - 48, H - 40, bgSurface);
  strokeRect(rgba, W, H, 24, 20, W - 48, H - 40, 2, borderSubtle);

  // Top Header Bar
  fillRect(rgba, W, H, 26, 22, W - 52, 48, bgElevated);
  fillRect(rgba, W, H, 26, 70, W - 52, 1, borderSubtle);
  // Brand Icon square + title bar blocks
  fillRect(rgba, W, H, 44, 34, 24, 24, brandGreen);
  fillRect(rgba, W, H, 78, 38, 140, 8, textPrimary);
  fillRect(rgba, W, H, 78, 50, 90, 6, textSecondary);
  // Right CTA pill
  fillRect(rgba, W, H, W - 160, 34, 116, 24, brandGreen);

  if (variant === 'editor') {
    // Left Object Layer Sidebar
    fillRect(rgba, W, H, 26, 71, 190, H - 93, bgElevated);
    fillRect(rgba, W, H, 216, 71, 1, H - 93, borderSubtle);
    for (let i = 0; i < 6; i++) {
      const y = 92 + i * 44;
      fillRect(rgba, W, H, 40, y, 162, 32, i === 1 ? brandGreenSoft : bgSurface);
      strokeRect(rgba, W, H, 40, y, 162, 32, 1, i === 1 ? brandGreen : borderSubtle);
      fillRect(rgba, W, H, 52, y + 12, 96, 8, i === 1 ? brandGreen : textSecondary);
    }

    // Center PDF Page Canvas
    const pageX = 268;
    const pageY = 96;
    const pageW = 440;
    const pageH = 398;
    fillRect(rgba, W, H, pageX, pageY, pageW, pageH, [255, 255, 255, 255]);
    strokeRect(rgba, W, H, pageX, pageY, pageW, pageH, 2, borderSubtle);

    // Document Header & Selected Editable Text Box with Transform Handles
    fillRect(rgba, W, H, pageX + 36, pageY + 34, 240, 14, [15, 23, 34, 255]);
    fillRect(rgba, W, H, pageX + 36, pageY + 60, 320, 8, [120, 135, 130, 255]);

    // Active selected text/shape bounding box
    fillRect(rgba, W, H, pageX + 32, pageY + 92, 356, 78, [15, 165, 117, 28]);
    strokeRect(rgba, W, H, pageX + 32, pageY + 92, 356, 78, 2, brandGreen);
    // 4 Corner resize handles
    fillRect(rgba, W, H, pageX + 28, pageY + 88, 8, 8, brandGreen);
    fillRect(rgba, W, H, pageX + 384, pageY + 88, 8, 8, brandGreen);
    fillRect(rgba, W, H, pageX + 28, pageY + 166, 8, 8, brandGreen);
    fillRect(rgba, W, H, pageX + 384, pageY + 166, 8, 8, brandGreen);
    fillRect(rgba, W, H, pageX + 48, pageY + 110, 280, 10, [15, 165, 117, 255]);
    fillRect(rgba, W, H, pageX + 48, pageY + 130, 230, 8, [45, 65, 58, 255]);
    fillRect(rgba, W, H, pageX + 48, pageY + 146, 190, 8, [45, 65, 58, 255]);

    // Vector diagram blocks on canvas
    fillRect(rgba, W, H, pageX + 36, pageY + 196, 165, 110, [240, 248, 244, 255]);
    strokeRect(rgba, W, H, pageX + 36, pageY + 196, 165, 110, 2, brandGreen);
    fillRect(rgba, W, H, pageX + 220, pageY + 196, 168, 110, [244, 246, 250, 255]);
    strokeRect(rgba, W, H, pageX + 220, pageY + 196, 168, 110, 1, [180, 195, 205, 255]);

    // Right Inspector Panel
    fillRect(rgba, W, H, 748, 71, 186, H - 93, bgElevated);
    fillRect(rgba, W, H, 748, 71, 1, H - 93, borderSubtle);
    fillRect(rgba, W, H, 766, 94, 150, 12, textPrimary);
    fillRect(rgba, W, H, 766, 122, 150, 28, bgSurface);
    strokeRect(rgba, W, H, 766, 122, 150, 28, 1, brandGreen);
    fillRect(rgba, W, H, 766, 164, 70, 28, bgSurface);
    fillRect(rgba, W, H, 846, 164, 70, 28, bgSurface);
    fillRect(rgba, W, H, 766, 212, 150, 34, brandGreen);
  } else if (variant === 'redactor') {
    // Privacy Redactor View
    const pageX = 180;
    const pageY = 92;
    const pageW = 600;
    const pageH = 402;
    fillRect(rgba, W, H, pageX, pageY, pageW, pageH, [255, 255, 255, 255]);
    strokeRect(rgba, W, H, pageX, pageY, pageW, pageH, 2, borderSubtle);

    // Document lines with black/crimson permanent redaction bars
    fillRect(rgba, W, H, pageX + 44, pageY + 36, 260, 14, [15, 23, 34, 255]);
    fillRect(rgba, W, H, pageX + 44, pageY + 68, 480, 8, [150, 162, 158, 255]);

    // Redaction Box 1 (Permanent Stream Purge)
    fillRect(rgba, W, H, pageX + 44, pageY + 96, 360, 38, [12, 16, 22, 255]);
    strokeRect(rgba, W, H, pageX + 44, pageY + 96, 360, 38, 2, dangerRed);
    fillRect(rgba, W, H, pageX + 58, pageY + 111, 140, 8, dangerRed);

    fillRect(rgba, W, H, pageX + 44, pageY + 154, 490, 8, [150, 162, 158, 255]);
    fillRect(rgba, W, H, pageX + 44, pageY + 174, 420, 8, [150, 162, 158, 255]);

    // Redaction Box 2 (Sensitive Account Number Purged)
    fillRect(rgba, W, H, pageX + 44, pageY + 206, 440, 46, [12, 16, 22, 255]);
    strokeRect(rgba, W, H, pageX + 44, pageY + 206, 440, 46, 2, dangerRed);
    fillRect(rgba, W, H, pageX + 58, pageY + 225, 190, 8, dangerRed);

    // Bottom Verification Bar inside page
    fillRect(rgba, W, H, pageX + 44, pageY + 318, 512, 48, brandGreenSoft);
    strokeRect(rgba, W, H, pageX + 44, pageY + 318, 512, 48, 2, brandGreen);
    fillRect(rgba, W, H, pageX + 64, pageY + 337, 280, 10, brandGreen);
  } else if (variant === 'conversions') {
    // Effortless Conversions Grid (3x2 cards)
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const cx = 56 + col * 288;
        const cy = 104 + row * 188;
        const cw = 264;
        const ch = 164;
        const isHighlighted = row === 0 && col === 0;
        fillRect(rgba, W, H, cx, cy, cw, ch, bgElevated);
        strokeRect(
          rgba,
          W,
          H,
          cx,
          cy,
          cw,
          ch,
          isHighlighted ? 2 : 1,
          isHighlighted ? brandGreen : borderSubtle
        );
        fillRect(rgba, W, H, cx + 20, cy + 20, 36, 36, brandGreenSoft);
        strokeRect(rgba, W, H, cx + 20, cy + 20, 36, 36, 1, brandGreen);
        fillRect(rgba, W, H, cx + 20, cy + 72, 160, 12, textPrimary);
        fillRect(rgba, W, H, cx + 20, cy + 94, 210, 8, textSecondary);
        fillRect(rgba, W, H, cx + 20, cy + 110, 170, 8, textSecondary);
        fillRect(rgba, W, H, cx + 20, cy + 132, 96, 14, brandGreen);
      }
    }
  } else {
    // Batch Operations Queue
    for (let i = 0; i < 4; i++) {
      const ry = 104 + i * 92;
      fillRect(rgba, W, H, 64, ry, W - 128, 74, bgElevated);
      strokeRect(rgba, W, H, 64, ry, W - 128, 74, 1, i < 3 ? brandGreen : borderSubtle);
      fillRect(rgba, W, H, 84, ry + 20, 34, 34, brandGreenSoft);
      fillRect(rgba, W, H, 134, ry + 22, 220, 10, textPrimary);
      fillRect(rgba, W, H, 134, ry + 40, 140, 8, textSecondary);
      // Progress bar
      fillRect(rgba, W, H, 440, ry + 31, 280, 12, bgSurface);
      fillRect(rgba, W, H, 440, ry + 31, i < 3 ? 280 : 190, 12, brandGreen);
      fillRect(rgba, W, H, 750, ry + 25, 110, 24, brandGreenSoft);
    }
  }

  return encodeRgbaPng(W, H, rgba);
}

async function generateSamplePdf(): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Local Desk — Precision Studio Sample Document');
  pdfDoc.setAuthor('Local Desk Showcase');
  pdfDoc.setSubject('Sample Document for Local Desk Browser Demo (In-Memory Only)');
  pdfDoc.setCreator('Local Desk PDF Studio');

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  // Page 1: Editable Text, Shapes & Redaction Target
  const page1 = pdfDoc.addPage([612, 792]);
  page1.drawRectangle({
    x: 42,
    y: 688,
    width: 528,
    height: 62,
    color: rgb(0.04, 0.09, 0.07),
    borderColor: rgb(0.06, 0.65, 0.46),
    borderWidth: 1.5
  });
  page1.drawText('LOCAL DESK — SAMPLE STUDIO DOCUMENT', {
    x: 60,
    y: 722,
    size: 16,
    font: fontBold,
    color: rgb(0.91, 0.96, 0.93)
  });
  page1.drawText('Your documents. Your device. Your control. · No uploads · No accounts · No cloud', {
    x: 60,
    y: 702,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.56, 0.64, 0.61)
  });

  page1.drawText('1. Precision PDF Editor — Live Canvas Objects', {
    x: 48,
    y: 646,
    size: 13,
    font: fontBold,
    color: rgb(0.06, 0.65, 0.46)
  });
  page1.drawText(
    'Click any text block, shape, or annotation in this sample PDF to move, resize, restyle, or edit it directly in your browser tab.',
    {
      x: 48,
      y: 624,
      size: 10.5,
      font: fontRegular,
      color: rgb(0.12, 0.16, 0.15)
    }
  );
  page1.drawText(
    'All changes stay strictly in temporary tab memory and vanish immediately when you close or reset the tab.',
    {
      x: 48,
      y: 606,
      size: 10.5,
      font: fontRegular,
      color: rgb(0.12, 0.16, 0.15)
    }
  );

  // Vector Callout Box
  page1.drawRectangle({
    x: 48,
    y: 500,
    width: 516,
    height: 82,
    color: rgb(0.95, 0.98, 0.96),
    borderColor: rgb(0.06, 0.65, 0.46),
    borderWidth: 1.2
  });
  page1.drawText('2. Privacy Redactor — Sensitive Token Sample', {
    x: 64,
    y: 556,
    size: 12,
    font: fontBold,
    color: rgb(0.05, 0.12, 0.09)
  });
  page1.drawText('Try covering or permanently redacting the sample clearance string below:', {
    x: 64,
    y: 536,
    size: 10,
    font: fontRegular,
    color: rgb(0.25, 0.32, 0.29)
  });
  page1.drawText('CONFIDENTIAL-DEMO-TOKEN-4920-8814-LOCAL-ONLY', {
    x: 64,
    y: 514,
    size: 11,
    font: fontMono,
    color: rgb(0.78, 0.14, 0.24)
  });

  // Page 1 Table Preview
  page1.drawText('3. Structured Financial & Release Metrics Table', {
    x: 48,
    y: 458,
    size: 13,
    font: fontBold,
    color: rgb(0.06, 0.65, 0.46)
  });

  const rows = [
    ['Module', 'Capability', 'Execution Mode', 'Network I/O'],
    ['Precision PDF Editor', '2D Text, Fonts, Shapes & Images', '100% In-Memory', '0 Bytes'],
    ['Privacy Redactor', 'Cover, Blur & Stream Purge', '100% In-Memory', '0 Bytes'],
    ['Effortless Conversions', 'Word, Excel, PPT, Images, HTML', 'Local Desktop / App', '0 Bytes'],
    ['Batch Operations', 'Merge, Split, Compress, Lock', 'Local Desktop / App', '0 Bytes']
  ];

  let tableY = 424;
  rows.forEach((row, rIdx) => {
    const isHeader = rIdx === 0;
    page1.drawRectangle({
      x: 48,
      y: tableY - 6,
      width: 516,
      height: 24,
      color: isHeader ? rgb(0.06, 0.65, 0.46) : rIdx % 2 === 0 ? rgb(0.96, 0.98, 0.97) : rgb(1, 1, 1),
      borderColor: rgb(0.82, 0.88, 0.85),
      borderWidth: 0.75
    });
    const colOffsets = [58, 195, 385, 495];
    row.forEach((cell, cIdx) => {
      page1.drawText(cell, {
        x: colOffsets[cIdx],
        y: tableY + 2,
        size: 9.5,
        font: isHeader ? fontBold : fontRegular,
        color: isHeader ? rgb(1, 1, 1) : rgb(0.12, 0.16, 0.15)
      });
    });
    tableY -= 24;
  });

  // Page 2: Architecture Diagram & Page Operations Target
  const page2 = pdfDoc.addPage([612, 792]);
  page2.drawText('PAGE 2 — PAGE ORGANIZER, WATERMARK & ROTATION SAMPLE', {
    x: 48,
    y: 720,
    size: 14,
    font: fontBold,
    color: rgb(0.06, 0.65, 0.46)
  });
  page2.drawText(
    'Use this second page to test page reordering, rotation, cropping, watermarks, headers, footers, and split ranges.',
    {
      x: 48,
      y: 694,
      size: 10.5,
      font: fontRegular,
      color: rgb(0.15, 0.2, 0.18)
    }
  );
  page2.drawRectangle({
    x: 48,
    y: 480,
    width: 240,
    height: 170,
    color: rgb(0.94, 0.98, 0.96),
    borderColor: rgb(0.06, 0.65, 0.46),
    borderWidth: 1.5
  });
  page2.drawText('Local Canvas Layer A', {
    x: 72,
    y: 565,
    size: 12,
    font: fontBold,
    color: rgb(0.05, 0.12, 0.09)
  });
  page2.drawRectangle({
    x: 324,
    y: 480,
    width: 240,
    height: 170,
    color: rgb(0.95, 0.96, 0.99),
    borderColor: rgb(0.25, 0.35, 0.45),
    borderWidth: 1.5
  });
  page2.drawText('Local Canvas Layer B', {
    x: 348,
    y: 565,
    size: 12,
    font: fontBold,
    color: rgb(0.12, 0.18, 0.24)
  });

  return pdfDoc.save();
}

export async function generateShowcaseAssets() {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.mkdir(DEMO_DIR, { recursive: true });

  // 1. Copy product logo from .github/assets/logo.png
  const logoSrc = path.join(ROOT_DIR, '.github', 'assets', 'logo.png');
  const logoDest = path.join(ASSETS_DIR, 'logo.png');
  await fs.copyFile(logoSrc, logoDest);

  // 2. Generate bundled sample PDF
  const pdfBytes = await generateSamplePdf();
  const samplePdfPath = path.join(ASSETS_DIR, 'sample-document.pdf');
  await fs.writeFile(samplePdfPath, Buffer.from(pdfBytes));

  // 3. Write showcase/demo/samplePdfData.ts so the demo bundles the PDF bytes with zero network requests
  const base64Pdf = Buffer.from(pdfBytes).toString('base64');
  const sampleDataTs = `// Auto-generated bundled sample PDF bytes for Local Desk Showcase Demo (zero network fetch)
export const SAMPLE_PDF_FILENAME = 'Local-Desk-Showcase-Sample.pdf';
export const SAMPLE_PDF_BASE64 = '${base64Pdf}';

export function getBundledSamplePdfBytes(): Uint8Array {
  const binary = atob(SAMPLE_PDF_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
`;
  await fs.writeFile(path.join(DEMO_DIR, 'samplePdfData.ts'), sampleDataTs, 'utf-8');

  // 4. Generate Dark & Light Feature Screenshots
  const variants: Array<'editor' | 'redactor' | 'conversions' | 'batch'> = [
    'editor',
    'redactor',
    'conversions',
    'batch'
  ];
  for (const v of variants) {
    for (const t of ['dark', 'light'] as const) {
      const pngBuf = renderFeatureScreenshotPng(v, t);
      await fs.writeFile(path.join(ASSETS_DIR, `${v}-${t}.png`), pngBuf);
    }
  }

  console.log(
    `[ShowcaseAssets] Generated sample-document.pdf (${pdfBytes.byteLength} B), samplePdfData.ts, logo.png, and 8 dark/light PNG screenshots in showcase/assets/`
  );
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isDirectRun) {
  generateShowcaseAssets().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
