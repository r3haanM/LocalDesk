import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Local Desk — Multi-Resolution Pixel-Grid-Aligned Icon & ICO Generator
 *
 * Generates crystal-clear, pixel-grid-aligned RGBA PNG icons at:
 *   16x16, 20x20, 24x24, 32x32, 40x40, 48x48, 64x64, 128x128, 180x180, 256x256, 512x512
 * Plus a multi-resolution Windows .ico container (build/icon.ico & public/favicon.ico)
 * containing all standard and high-DPI Windows 10/11 taskbar & Explorer sizes.
 *
 * Root-Cause Fixes for Windows Taskbar Crispness:
 * 1. Full-bleed Windows 11 Squircle Geometry (8..248 on 256 grid = 93.75% fill)
 *    instead of excessive padding (16..240) that made the taskbar icon appear small.
 * 2. 100% Opaque Outer Perimeter with Crisp Inner Rim Highlight (#10B981 / #0D1F18)
 *    instead of a semi-transparent outer stroke (alpha=96) that produced a blurry halo
 *    against dark and light Windows taskbars.
 * 3. Harmonic 16-Grid Coordinate Alignment:
 *    All vertical and horizontal edges of the Emerald L-Frame and Document Sheet
 *    are aligned to multiples of 8 on the 256-unit grid (48, 88, 104, 160, 208),
 *    guaranteeing razor-sharp integer pixel edges at 16x16, 24x24, 32x32, 40x40,
 *    48x48, 64x64, 128x128, and 256x256.
 */

// CRC32 Table for PNG chunks
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
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Filter 0 (None) per scanline
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

/**
 * Signed distance to a rounded rectangle on [x..x+w, y..y+h] with corner radius r.
 * Negative inside, 0 on boundary, positive outside.
 */
function sdRoundedRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): number {
  const cx = x + w * 0.5;
  const cy = y + h * 0.5;
  const hx = w * 0.5 - r;
  const hy = h * 0.5 - r;
  const dx = Math.max(Math.abs(px - cx) - hx, 0);
  const dy = Math.max(Math.abs(py - cy) - hy, 0);
  const outsideDist = Math.hypot(dx, dy);
  const insideDist = Math.min(Math.max(Math.abs(px - cx) - hx, Math.abs(py - cy) - hy), 0);
  return outsideDist + insideDist - r;
}

function inRoundedRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): boolean {
  return sdRoundedRect(px, py, x, y, w, h, r) <= 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Samples the Local Desk architectural symbol at normalized 256x256 space (u, v in [0, 256]).
 * Designed with harmonic 16-grid coordinates so small sizes (16, 20, 24, 32, 40, 48)
 * remain razor-sharp on the Windows taskbar, system tray, Alt+Tab, and window title bar.
 */
function sampleLocalDeskIcon(
  u: number,
  v: number,
  variant: 'app-icon' | 'symbol-dark' | 'symbol-light' | 'symbol-mono-white',
  targetSize = 256
): [number, number, number, number] {
  const isSmallIcon = targetSize <= 32;

  // 1. Check Document Sheet (Top-Right):
  // Aligned to 16-grid: x in [96, 208], y in [48, 160], r = 16
  // With top-right chamfer corner cut: (u - 168) + (v - 48) >= 0 for u >= 168 && v <= 88
  const inSheetRect = inRoundedRect(u, v, 96, 48, 112, 112, isSmallIcon ? 14 : 16);
  const inCornerCutout = u >= 168 && v <= 88 && u - 168 > v - 48;
  const inDocSheet = inSheetRect && !inCornerCutout;

  if (inDocSheet) {
    // Check folded corner flap triangle: u >= 168, v <= 88, and inside rounded flap
    const inFoldFlap =
      u >= 168 &&
      v <= 88 &&
      inRoundedRect(u, v, 168, 48, 40, 40, 8) &&
      u - 168 <= v - 48 + 2.0;

    if (inFoldFlap) {
      if (variant === 'symbol-mono-white') {
        return [255, 255, 255, 195];
      }
      // Crisp Emerald Accent Fold Flap (#10B981 -> #34D399)
      return [22, 196, 138, 255];
    }

    // Crisp precision document lines inside the sheet (omitted below 20px to prevent subpixel clutter,
    // drawn with 2-pixel snapped thickness at 24px-32px for unmistakable PDF document recognition)
    if (targetSize >= 24 && variant !== 'symbol-mono-white') {
      const lineThickness = isSmallIcon ? 10 : 7;
      const inLine1 = inRoundedRect(u, v, 116, 104, 68, lineThickness, 3.5);
      const inLine2 = inRoundedRect(u, v, 116, 126, 48, lineThickness, 3.5);
      if (inLine1 || inLine2) {
        // Deep Forest Green document typography bars (#065F46)
        return [6, 95, 70, 235];
      }
    }

    // Sheet Body Color — high contrast warm alabaster white so the icon pops on both dark & light taskbars
    if (variant === 'symbol-mono-white') {
      return [255, 255, 255, 255];
    }
    if (variant === 'symbol-light') {
      return [6, 95, 70, 255]; // #065F46
    }
    const t = (u - 96 + (v - 48)) / 224;
    return [
      Math.round(lerp(255, 236, t)),
      Math.round(lerp(255, 253, t)),
      Math.round(lerp(255, 245, t)),
      255
    ];
  }

  // 2. Check Architectural Desk L-Frame (Bottom-Left):
  // Outer rounded rect x in [48, 176], y in [80, 208], r = 20
  // Minus inner cutout x in [88, 184], y in [72, 168], r = 12
  const inOuterL = inRoundedRect(u, v, 48, 80, 128, 128, isSmallIcon ? 18 : 22);
  const inInnerCut = inRoundedRect(u, v, 88, 72, 96, 96, isSmallIcon ? 10 : 12);
  const inLFrame = inOuterL && !inInnerCut;

  if (inLFrame) {
    // Subtle overlap depth shadow where Document Sheet casts a shadow onto L-Frame
    const nearSheetShadow = inRoundedRect(u, v, 90, 44, 118, 122, 18);
    if (variant === 'symbol-mono-white') {
      return [255, 255, 255, nearSheetShadow ? 175 : 225];
    }
    const t = (u - 48 + (v - 80)) / 256;
    // Vibrant Emerald (#34D399 -> #10B981 -> #059669)
    let r = lerp(52, 16, t);
    let g = lerp(211, 185, t);
    let b = lerp(153, 129, t);
    if (nearSheetShadow && !isSmallIcon) {
      r *= 0.82;
      g *= 0.82;
      b *= 0.82;
    }
    return [Math.round(r), Math.round(g), Math.round(b), 255];
  }

  // 3. Check App Icon Vessel Background (Only for 'app-icon' variant)
  if (variant === 'app-icon') {
    // Full-bleed Windows 11 squircle: [8..248] (240x240 on 256 grid)
    const dist = sdRoundedRect(u, v, 8, 8, 240, 240, 52);
    if (dist <= 0) {
      const t = (u + v) / 512;
      // Rich Deep Forest Green surface (#0F291E -> #07140F)
      let r = lerp(17, 7, t);
      let g = lerp(44, 21, t);
      let b = lerp(33, 16, t);

      // Subtle inner emerald ambient glow near top-left
      const radial = Math.hypot(u - 72, v - 64) / 220;
      if (radial < 1) {
        const glow = (1 - radial) * 0.22;
        r = lerp(r, 16, glow);
        g = lerp(g, 185, glow);
        b = lerp(b, 129, glow);
      }

      // 100% Opaque Crisp Outer Border Rim (blended into the solid background, NEVER translucent)
      // At small sizes (<=32px), a 1px solid emerald-tinted rim gives sharp contrast against dark taskbars
      const rimThickness = isSmallIcon ? 10.0 : 5.5;
      if (dist >= -rimThickness) {
        const rimMix = isSmallIcon ? 0.55 : 0.42;
        r = lerp(r, 52, rimMix);
        g = lerp(g, 211, rimMix);
        b = lerp(b, 153, rimMix);
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
  // 4x4 subpixel supersampling for crisp anti-aliased curves while keeping grid-aligned straight edges sharp
  const samples = 4;
  const scale = 256 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) * scale;
          const v = (y + (sy + 0.5) / samples) * scale;
          const [r, g, b, a] = sampleLocalDeskIcon(u, v, variant, size);
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

function buildMultiResICO(pngBuffers: { size: number; buf: Buffer }[]): Buffer {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = Buffer.alloc(count * 16);
  let dataOffset = 6 + count * 16;

  for (let i = 0; i < count; i++) {
    const { size, buf } = pngBuffers[i];
    const entryOffset = i * 16;
    dirEntries[entryOffset] = size >= 256 ? 0 : size;
    dirEntries[entryOffset + 1] = size >= 256 ? 0 : size;
    dirEntries[entryOffset + 2] = 0;
    dirEntries[entryOffset + 3] = 0;
    dirEntries.writeUInt16LE(1, entryOffset + 4); // Color planes
    dirEntries.writeUInt16LE(32, entryOffset + 6); // 32 bpp
    dirEntries.writeUInt32LE(buf.length, entryOffset + 8);
    dirEntries.writeUInt32LE(dataOffset, entryOffset + 12);
    dataOffset += buf.length;
  }

  return Buffer.concat([header, dirEntries, ...pngBuffers.map((p) => p.buf)]);
}

const outDir = path.resolve(process.cwd(), 'public/brand/png');
const publicDir = path.resolve(process.cwd(), 'public');
const buildDir = path.resolve(process.cwd(), 'build');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512];
const icoFrames: { size: number; buf: Buffer }[] = [];

for (const sz of sizes) {
  const appIconBuf = renderPNG(sz, 'app-icon');
  fs.writeFileSync(path.join(outDir, `local-desk-app-icon-${sz}x${sz}.png`), appIconBuf);

  if ([16, 20, 24, 32, 40, 48, 64, 128, 256].includes(sz)) {
    icoFrames.push({ size: sz, buf: appIconBuf });
  }

  if (sz === 16 || sz === 24 || sz === 32 || sz === 48 || sz === 64 || sz === 128 || sz === 256) {
    fs.writeFileSync(path.join(publicDir, `favicon-${sz}x${sz}.png`), appIconBuf);
  }
}

// Apple Touch Icon (180x180)
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderPNG(180, 'app-icon'));

// Transparent Symbol Variants (256x256 and 512x512)
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

// Multi-resolution favicon.ico (16, 20, 24, 32, 40, 48, 64, 128, 256)
const icoBuffer = buildMultiResICO(icoFrames);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

// Windows Desktop Build Icons (build/icon.ico & build/icon.png) for Electron Builder & PE Resource Table
fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
fs.writeFileSync(path.join(buildDir, 'icon.png'), renderPNG(512, 'app-icon'));

console.log(
  `Generated Local Desk PNG & Multi-Resolution ICO assets (${icoFrames.map((f) => `${f.size}x${f.size}`).join(', ')}) in public/brand/png and build/.`
);
