import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Deterministic 4x Supersampled Vector-to-PNG Generator for Local Desk Refined Brand Assets (Version B)
 * Produces genuine, anti-aliased RGBA PNG files with transparent backgrounds across:
 * - Desktop application icon sizes: 16, 24, 32, 48, 64, 128, 256px (with optical simplification at <=24px)
 * - Standalone symbol PNGs (64, 128, 256px)
 * - Monochrome Black & White PNGs
 * - Favicons (/public/favicon-16x16.png, /public/favicon-32x32.png, /public/apple-touch-icon.png)
 */

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
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

function encodeRGBAtoPNG(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const rawData = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      rawData,
      y * (stride + 1) + 1
    );
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

type RGBA = [number, number, number, number];

function hexToRgba(hex: string, alpha = 255): RGBA {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b, alpha];
}

function lerpColor(a: RGBA, b: RGBA, t: number): RGBA {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
    Math.round(a[3] + (b[3] - a[3]) * clamped)
  ];
}

function inRoundedRect(
  x: number,
  y: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  radius: number
): boolean {
  if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false;
  const r = Math.min(radius, rw / 2, rh / 2);
  const cx = Math.max(rx + r, Math.min(x, rx + rw - r));
  const cy = Math.max(ry + r, Math.min(y, ry + rh - r));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Evaluates a point (u, v) in normalized 256x256 space (4x of 64x64 master grid)
 * for the Refined Local Desk symbol / app icon (Version B).
 * - Grounded L-Frame: x: 56..94 (14..23.5 * 4), y: 162..200 (40.5..50 * 4)
 * - Uniform 18px (4.5px * 4) negative-space channel on both horizontal and vertical axes
 * - Active Document Sheet: x: 112..200 (28..50 * 4), y: 56..144 (14..36 * 4) with 36x36 fold
 */
function sampleLocalDeskIcon(
  u: number,
  v: number,
  variant: 'app-icon' | 'symbol' | 'mono-black' | 'mono-white' | 'light-badge',
  isMicro: boolean
): RGBA {
  // 1. Active Document Sheet Plane (x: 112..200, y: 56..144, top-right chamfer (164,56)->(200,92))
  const inSheetRect = inRoundedRect(u, v, 112, 56, 88, 88, 10);
  const inSheetBounds = inSheetRect && u - v <= 108; // u - 164 <= v - 56 => u - v <= 108

  // Chamfer fold flap: u >= 164, v <= 92, u - v <= 108
  const inChamfer =
    inSheetBounds &&
    u >= 164 &&
    v <= 92 &&
    inRoundedRect(u, v, 164, 56, 36, 36, 0) &&
    (u >= 174 || v <= 82 || (u - 174) ** 2 + (v - 82) ** 2 <= 10 ** 2);

  // Internal calibration bars on document plane (simplified at <=24px)
  const inBar1 = isMicro
    ? inRoundedRect(u, v, 130, 96.8, 42, 13.6, 6.8)
    : inRoundedRect(u, v, 130, 92, 46, 10.4, 5.2);
  const inBar2 = isMicro ? false : inRoundedRect(u, v, 130, 112, 30, 10.4, 5.2);

  // 2. Grounded L-Frame Desk Datum:
  // Vertical stem: x: 56..94, y: 56..200
  // Horizontal base: x: 56..200, y: 162..200
  // Inner fillet at (94, 162) with r=10
  const inOuterL = inRoundedRect(u, v, 56, 56, 144, 144, 16);
  const inCutout =
    u > 94 &&
    v < 162 &&
    (u >= 104 || v <= 152 || (u - 104) ** 2 + (v - 152) ** 2 > 10 ** 2);
  const inLAnchor = inOuterL && !inCutout && (u <= 94 || v >= 162 || (u < 104 && v > 152));

  if (variant === 'mono-black') {
    if (inLAnchor) return hexToRgba('#0D1F18');
    if (inSheetBounds) {
      if (inBar1 || inBar2 || inChamfer) return [0, 0, 0, 0];
      return hexToRgba('#0D1F18');
    }
    return [0, 0, 0, 0];
  }

  if (variant === 'mono-white') {
    if (inLAnchor) return hexToRgba('#F2F7F4');
    if (inSheetBounds) {
      if (inBar1 || inBar2 || inChamfer) return [0, 0, 0, 0];
      return hexToRgba('#F2F7F4');
    }
    return [0, 0, 0, 0];
  }

  if (variant === 'symbol') {
    if (inLAnchor) {
      return lerpColor(hexToRgba('#34D399'), hexToRgba('#059669'), (u + v - 112) / 288);
    }
    if (inSheetBounds) {
      if (inBar1 || inBar2) return hexToRgba('#F2F7F4', 245);
      if (inChamfer) return hexToRgba('#047857', 255);
      return lerpColor(hexToRgba('#10B981'), hexToRgba('#059669'), (u + v - 168) / 176);
    }
    return [0, 0, 0, 0];
  }

  // App Icon or Light Badge (inside squircle x: 16..240, y: 16..240, r: 56)
  const inSquircle = inRoundedRect(u, v, 16, 16, 224, 224, 56);
  if (!inSquircle) return [0, 0, 0, 0];

  if (inLAnchor) {
    return lerpColor(hexToRgba('#34D399'), hexToRgba('#059669'), (u + v - 112) / 288);
  }

  if (inSheetBounds) {
    if (inBar1) return hexToRgba('#0D1F18');
    if (inBar2) return hexToRgba('#059669');
    if (inChamfer) return hexToRgba('#10B981');
    return lerpColor(hexToRgba('#F7FCF9'), hexToRgba('#D1FAE5'), (v - 56) / 88);
  }

  // Inner structural rim check
  const inInnerSquircle = inRoundedRect(u, v, 21, 21, 214, 214, 51);
  if (!inInnerSquircle) {
    return variant === 'light-badge' ? hexToRgba('#059669', 95) : hexToRgba('#34D399', 96);
  }

  if (variant === 'light-badge') {
    return lerpColor(hexToRgba('#F6F8F7'), hexToRgba('#E4EFEA'), (u + v) / 512);
  }

  return lerpColor(hexToRgba('#142C23'), hexToRgba('#0A1712'), (u + v) / 512);
}

function renderPNG(
  size: number,
  variant: 'app-icon' | 'symbol' | 'mono-black' | 'mono-white' | 'light-badge'
): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const samples = 4; // 4x4 = 16x supersampling anti-aliasing
  const scale = 256 / size;
  const isMicro = size <= 24;

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
          const [r, g, b, a] = sampleLocalDeskIcon(u, v, variant, isMicro);
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
        const aWeight = aSum / 255;
        rgba[idx] = Math.min(255, Math.round(rSum / aWeight));
        rgba[idx + 1] = Math.min(255, Math.round(gSum / aWeight));
        rgba[idx + 2] = Math.min(255, Math.round(bSum / aWeight));
        rgba[idx + 3] = finalA;
      }
    }
  }

  return encodeRGBAtoPNG(size, size, rgba);
}

const outDir = path.resolve(process.cwd(), 'public/brand/png');
fs.mkdirSync(outDir, { recursive: true });

// 1. Desktop App Icons at 16, 24, 32, 48, 64, 128, 256px
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
for (const sz of iconSizes) {
  const png = renderPNG(sz, 'app-icon');
  fs.writeFileSync(path.join(outDir, `local-desk-app-icon-${sz}x${sz}.png`), png);
}

// 2. Standalone Symbol Transparent PNGs
for (const sz of [64, 128, 256]) {
  fs.writeFileSync(
    path.join(outDir, `local-desk-symbol-${sz}x${sz}.png`),
    renderPNG(sz, 'symbol')
  );
}

// 3. Monochrome Black & White Transparent PNGs
fs.writeFileSync(
  path.join(outDir, 'local-desk-mono-black-256x256.png'),
  renderPNG(256, 'mono-black')
);
fs.writeFileSync(
  path.join(outDir, 'local-desk-mono-white-256x256.png'),
  renderPNG(256, 'mono-white')
);
fs.writeFileSync(
  path.join(outDir, 'local-desk-light-badge-256x256.png'),
  renderPNG(256, 'light-badge')
);

// 4. Root Favicons (/public/favicon-16x16.png, /public/favicon-32x32.png, /public/apple-touch-icon.png)
const publicDir = path.resolve(process.cwd(), 'public');
fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), renderPNG(16, 'app-icon'));
fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), renderPNG(32, 'app-icon'));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderPNG(180, 'app-icon'));

console.log('Generated all refined Local Desk PNG brand assets in /public/brand/png and /public.');
