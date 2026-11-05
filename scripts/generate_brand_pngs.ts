import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildSpecCompliantIcoBuffer } from './pe64_builder';

/**
 * Local Desk — Pixel-Grid-Locked Multi-Resolution Windows Icon Generator
 *
 * Root-Cause Fixes for Blurry Taskbar & Window Icons:
 * 1. Exact Target-Resolution Integer Grid Snapping:
 *    Previously, icons were sampled from a 256x256 coordinate space. Because 256 is not
 *    divisible by 20, 24, or 40 (common Windows 100%/125%/150% DPI taskbar & caption sizes),
 *    every horizontal and vertical straight edge landed on fractional pixels (.33, .67, .4, .8),
 *    causing severe bilinear blurring across adjacent pixel rows/columns.
 *    Now, every horizontal and vertical edge of the Squircle Vessel, Grounded Emerald L-Frame,
 *    Negative-Space Separation Channel, Document Sheet, and Typography Bars is snapped to
 *    exact integer pixel coordinates on each target size grid (16, 20, 24, 32, 40, 48, 64, 128, 256, 512).
 * 2. True Negative-Space Architectural Channel (Zero Muddy Overlap):
 *    Matches LocalDeskLogo.tsx Version B: the Grounded Emerald L-Frame and the Crisp White
 *    Document Sheet are separated by an integer-pixel dark Forest Green channel rather than
 *    overlapping with a dark smudge shadow.
 * 3. Zero Radial Glow or Fuzzy Outer Rim Halo:
 *    Removed the radial glow and non-integer bright outer stroke that caused a faint smearing
 *    effect on the Windows 11 taskbar.
 */

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

function encodePNG(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawScanlines[rowStart] = 0;
    const srcStart = y * width * 4;
    Buffer.from(rgba.buffer, rgba.byteOffset + srcStart, width * 4).copy(
      rawScanlines,
      rowStart + 1
    );
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function sdRoundedBox(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number
): number {
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = x0 + w * 0.5;
  const cy = y0 + h * 0.5;
  const rad = Math.min(r, w * 0.5, h * 0.5);
  const hx = w * 0.5 - rad;
  const hy = h * 0.5 - rad;
  const dx = Math.max(Math.abs(px - cx) - hx, 0);
  const dy = Math.max(Math.abs(py - cy) - hy, 0);
  const outsideDist = Math.hypot(dx, dy);
  const insideDist = Math.min(Math.max(Math.abs(px - cx) - hx, Math.abs(py - cy) - hy), 0);
  return outsideDist + insideDist - rad;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

interface GridGeometry {
  size: number;
  // Outer squircle vessel bounds (integer pixels)
  v0: number;
  v1: number;
  vRadius: number;
  // L-Frame outer bounds & thickness (integer pixels)
  lLeft: number;
  lTop: number;
  lRight: number;
  lBottom: number;
  lThick: number;
  lOuterRadius: number;
  lInnerRadius: number;
  // Document sheet bounds (integer pixels, separated by integer channel gap from L-Frame)
  docLeft: number;
  docTop: number;
  docRight: number;
  docBottom: number;
  docRadius: number;
  foldSize: number;
  // Internal document typography bars (integer pixel rows & columns)
  bars: Array<{ x0: number; y0: number; x1: number; y1: number }>;
}

/**
 * Computes exact integer-pixel-aligned geometry for each target icon resolution.
 * Every straight horizontal and vertical edge lies on an exact integer pixel coordinate,
 * eliminating subpixel blur on Windows 10/11 taskbars at 100%, 125%, 150%, and 200% DPI.
 */
function computePixelLockedGeometry(size: number): GridGeometry {
  // Windows 11 icon padding: 1px at 16-24px, 2px at 32-40px, 3px at 48px, proportional above
  const pad =
    size <= 20
      ? 1
      : size <= 24
      ? 1
      : size <= 32
      ? 2
      : size <= 40
      ? 2
      : size <= 48
      ? 3
      : Math.round(size * 0.0625);

  const v0 = pad;
  const v1 = size - pad;
  const vRadius = Math.max(3, Math.round((v1 - v0) * 0.24));

  // Inner symbol bounding box [s0 .. s1]
  const innerMargin =
    size <= 16
      ? 2
      : size <= 20
      ? 3
      : size <= 24
      ? 4
      : size <= 32
      ? 5
      : size <= 40
      ? 6
      : size <= 48
      ? 8
      : Math.round(size * 0.16);

  const s0 = v0 + innerMargin;
  const s1 = v1 - innerMargin;
  const span = s1 - s0;

  // L-frame bar thickness and negative-space channel gap (strictly integer pixels!)
  const lThick =
    size <= 16
      ? 2
      : size <= 20
      ? 3
      : size <= 24
      ? 3
      : size <= 32
      ? 4
      : size <= 40
      ? 5
      : size <= 48
      ? 6
      : Math.max(7, Math.round(span * 0.21));

  const gap =
    size <= 20
      ? 1
      : size <= 32
      ? 2
      : size <= 48
      ? 3
      : Math.max(4, Math.round(span * 0.09));

  const lLeft = s0;
  const lTop = s0;
  const lRight = s1;
  const lBottom = s1;

  // Document sheet sits in the top-right quadrant, separated from the L-frame by `gap` pixels
  const docLeft = lLeft + lThick + gap;
  const docTop = s0;
  const docRight = s1;
  const docBottom = lBottom - lThick - gap;

  const lOuterRadius = Math.max(1, Math.round(lThick * 0.45));
  const lInnerRadius = Math.max(1, Math.round(lThick * 0.25));
  const docRadius = Math.max(1, Math.round(lThick * 0.38));

  const docW = docRight - docLeft;
  const docH = docBottom - docTop;
  const foldSize = Math.max(2, Math.round(Math.min(docW, docH) * 0.36));

  // Integer-snapped horizontal document calibration bars inside the white sheet
  const bars: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  if (size >= 20) {
    const barPadX = Math.max(2, Math.round(docW * 0.2));
    const barH = size <= 24 ? 1 : size <= 40 ? 2 : Math.max(2, Math.round(docH * 0.11));
    const barGap = size <= 24 ? 2 : size <= 40 ? 2 : Math.max(2, Math.round(docH * 0.13));

    const firstBarY = docTop + Math.max(foldSize + 1, Math.round(docH * 0.44));
    const bar1X0 = docLeft + barPadX;
    const bar1X1 = docRight - barPadX;

    if (firstBarY + barH <= docBottom - 2 && bar1X1 > bar1X0 + 1) {
      bars.push({
        x0: bar1X0,
        y0: firstBarY,
        x1: bar1X1,
        y1: firstBarY + barH
      });

      const secondBarY = firstBarY + barH + barGap;
      const bar2X1 = bar1X0 + Math.max(2, Math.round((bar1X1 - bar1X0) * 0.68));
      if (secondBarY + barH <= docBottom - 1 && bar2X1 > bar1X0 + 1) {
        bars.push({
          x0: bar1X0,
          y0: secondBarY,
          x1: bar2X1,
          y1: secondBarY + barH
        });
      }
    }
  }

  return {
    size,
    v0,
    v1,
    vRadius,
    lLeft,
    lTop,
    lRight,
    lBottom,
    lThick,
    lOuterRadius,
    lInnerRadius,
    docLeft,
    docTop,
    docRight,
    docBottom,
    docRadius,
    foldSize,
    bars
  };
}

function samplePixelLockedIcon(
  px: number,
  py: number,
  geom: GridGeometry,
  variant: 'app-icon' | 'symbol-dark' | 'symbol-light' | 'symbol-mono-white'
): [number, number, number, number] {
  const {
    size,
    v0,
    v1,
    vRadius,
    lLeft,
    lTop,
    lRight,
    lBottom,
    lThick,
    lOuterRadius,
    lInnerRadius,
    docLeft,
    docTop,
    docRight,
    docBottom,
    docRadius,
    foldSize,
    bars
  } = geom;

  // 1. Active Document Sheet (Top-Right)
  const inDocBox = sdRoundedBox(px, py, docLeft, docTop, docRight, docBottom, docRadius) <= 0;
  const foldStartX = docRight - foldSize;
  const foldEndY = docTop + foldSize;
  const inFoldCutout = px > foldStartX && py < foldEndY && px - foldStartX > py - docTop;

  if (inDocBox && !inFoldCutout) {
    // Check Corner Fold Triangle [foldStartX..docRight, docTop..foldEndY]
    const inFoldTriangle =
      px >= foldStartX &&
      py <= foldEndY &&
      px - foldStartX <= py - docTop &&
      sdRoundedBox(px, py, foldStartX, docTop, docRight, foldEndY, Math.max(1, docRadius * 0.5)) <= 0;

    if (inFoldTriangle) {
      if (variant === 'symbol-mono-white') {
        return [255, 255, 255, 200];
      }
      // Crisp Emerald Fold (#10B981)
      return [16, 185, 129, 255];
    }

    // Check integer-snapped internal typography bars
    if (variant !== 'symbol-mono-white') {
      for (const b of bars) {
        if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) {
          // High-contrast Deep Forest Green bar (#064E3B)
          return [6, 78, 59, 255];
        }
      }
    }

    if (variant === 'symbol-mono-white') {
      return [255, 255, 255, 255];
    }
    if (variant === 'symbol-light') {
      return [6, 95, 70, 255];
    }
    // Crisp high-contrast white document plane (#FFFFFF -> #F0FDF4)
    const tDoc = (px - docLeft + (py - docTop)) / Math.max(1, docRight - docLeft + (docBottom - docTop));
    return [
      Math.round(lerp(255, 240, tDoc)),
      Math.round(lerp(255, 253, tDoc)),
      Math.round(lerp(255, 246, tDoc)),
      255
    ];
  }

  // 2. Grounded Emerald L-Frame Desk Datum (Bottom-Left)
  // Separated from the Document Sheet by the exact integer channel gap
  const inLOuter = sdRoundedBox(px, py, lLeft, lTop, lRight, lBottom, lOuterRadius) <= 0;
  const inLInnerCut =
    sdRoundedBox(
      px,
      py,
      lLeft + lThick,
      lTop - lOuterRadius,
      lRight + lOuterRadius,
      lBottom - lThick,
      lInnerRadius
    ) <= 0;

  if (inLOuter && !inLInnerCut) {
    if (variant === 'symbol-mono-white') {
      return [255, 255, 255, 235];
    }
    const tL = (px - lLeft + (py - lTop)) / Math.max(1, lRight - lLeft + (lBottom - lTop));
    // Vibrant Emerald gradient (#34D399 -> #10B981 -> #059669)
    return [
      Math.round(lerp(52, 5, tL)),
      Math.round(lerp(211, 150, tL)),
      Math.round(lerp(153, 105, tL)),
      255
    ];
  }

  // 3. Outer Squircle Vessel (Only for 'app-icon')
  if (variant === 'app-icon') {
    const dist = sdRoundedBox(px, py, v0, v0, v1, v1, vRadius);
    if (dist <= 0) {
      const tBg = (px + py) / Math.max(1, size * 2);
      // Rich Deep Forest Green background (#102A20 -> #07140F) — high contrast for white sheet & emerald L-frame
      let r = lerp(16, 7, tBg);
      let g = lerp(42, 20, tBg);
      let b = lerp(32, 15, tBg);

      // Clean 1px subtle dark-emerald border definition only on >= 32px icons (no blurry glow!)
      if (size >= 32 && dist >= -1.0) {
        r = lerp(r, 24, 0.35);
        g = lerp(g, 92, 0.35);
        b = lerp(b, 67, 0.35);
      }

      return [Math.round(r), Math.round(g), Math.round(b), 255];
    }
  }

  return [0, 0, 0, 0];
}

function renderPNG(
  size: number,
  variant: 'app-icon' | 'symbol-dark' | 'symbol-light' | 'symbol-mono-white'
): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const geom = computePixelLockedGeometry(size);
  // 4x4 supersampling for smooth corner arcs while integer-snapped straight edges stay 100% sharp
  const samples = 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const [r, g, b, a] = samplePixelLockedIcon(px, py, geom, variant);
          const alphaNorm = a / 255;
          rSum += r * alphaNorm;
          gSum += g * alphaNorm;
          bSum += b * alphaNorm;
          aSum += a;
        }
      }

      const totalSamples = samples * samples;
      const finalA = Math.round(aSum / totalSamples);
      const idx = (y * size + x) * 4;

      if (finalA > 0) {
        const weight = aSum / 255;
        rgba[idx] = Math.min(255, Math.round(rSum / weight));
        rgba[idx + 1] = Math.min(255, Math.round(gSum / weight));
        rgba[idx + 2] = Math.min(255, Math.round(bSum / weight));
        rgba[idx + 3] = finalA;
      }
    }
  }

  return encodePNG(size, size, rgba);
}

const outDir = path.resolve(process.cwd(), 'public/brand/png');
const publicDir = path.resolve(process.cwd(), 'public');
const buildDir = path.resolve(process.cwd(), 'build');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512];
const icoLayers: Array<{ size: number; pngData: Buffer }> = [];

for (const sz of sizes) {
  const appIconBuf = renderPNG(sz, 'app-icon');
  fs.writeFileSync(path.join(outDir, `local-desk-app-icon-${sz}x${sz}.png`), appIconBuf);

  if ([16, 20, 24, 32, 40, 48, 64, 128, 256].includes(sz)) {
    icoLayers.push({ size: sz, pngData: appIconBuf });
  }

  if (
    sz === 16 ||
    sz === 20 ||
    sz === 24 ||
    sz === 32 ||
    sz === 40 ||
    sz === 48 ||
    sz === 64 ||
    sz === 128 ||
    sz === 256
  ) {
    fs.writeFileSync(path.join(publicDir, `favicon-${sz}x${sz}.png`), appIconBuf);
  }
}

// Apple Touch Icon (180x180)
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderPNG(180, 'app-icon'));

// Transparent Symbol Variants (128, 256, 512)
for (const sz of [128, 256, 512]) {
  fs.writeFileSync(
    path.join(outDir, `local-desk-symbol-dark-${sz}x${sz}.png`),
    renderPNG(sz, 'symbol-dark')
  );
  fs.writeFileSync(
    path.join(outDir, `local-desk-symbol-light-${sz}x${sz}.png`),
    renderPNG(sz, 'symbol-light')
  );
  fs.writeFileSync(
    path.join(outDir, `local-desk-symbol-mono-white-${sz}x${sz}.png`),
    renderPNG(sz, 'symbol-mono-white')
  );
}

// Generate spec-compliant Windows .ico (16..128px 32-bit BGRA BITMAPINFOHEADER DIBs + 256px PNG)
const specCompliantIcoBuffer = buildSpecCompliantIcoBuffer(icoLayers);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), specCompliantIcoBuffer);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), specCompliantIcoBuffer);
fs.writeFileSync(path.join(buildDir, 'local-desk-icon-v103.ico'), specCompliantIcoBuffer);
fs.writeFileSync(path.join(buildDir, 'icon.png'), renderPNG(512, 'app-icon'));

console.log(
  `Generated pixel-locked Local Desk PNG & 9-layer DIB+PNG ICO assets (${icoLayers.map((f) => `${f.size}x${f.size}`).join(', ')}) in public/brand/png, public/favicon.ico, and build/icon.ico (${specCompliantIcoBuffer.byteLength} bytes).`
);
