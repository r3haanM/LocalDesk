/**
 * 3D-styled app icon generator — isometric document stack in the Local Desk
 * brand palette (matches the studio launch-animation motif).
 *
 * Regenerates every icon surface from one master SVG:
 *  - public/brand/png/local-desk-app-icon-{s}x{s}.png  (Electron + PE launcher + .ico source)
 *  - public/favicon-{s}x{s}.png + public/favicon.svg + favicon.ico + apple-touch-icon.png
 *  - build/icon.ico + build/local-desk-icon-v103.ico   (electron-builder app/installer icons)
 *
 * Run: npx tsx scripts/generate_3d_icon.ts
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildSpecCompliantIcoBuffer } from './pe64_builder';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Isometric geometry helpers (true isometric: +x → right-down, +y → left-down)
// ---------------------------------------------------------------------------
const CX = 256;
const CY = 281;
const ISO_X = 0.866;
const ISO_Y = 0.5;

const iso = (dx: number, dy: number, z: number): [number, number] => [
  CX + dx * ISO_X - dy * ISO_X,
  CY + dx * ISO_Y + dy * ISO_Y - z
];

const poly = (pts: Array<[number, number]>): string =>
  pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

interface Sheet {
  z: number; // height of top face
  w: number;
  d: number;
  t: number; // thickness (screen px)
  topFill: string;
  rightFill: string;
  leftFill: string;
  lines?: boolean; // draw printed text lines on the top face
  stroke?: string;
}

function sheetSvg(s: Sheet): string {
  const hw = s.w / 2;
  const hd = s.d / 2;
  const N = iso(-hw, -hd, s.z);
  const E = iso(hw, -hd, s.z);
  const S = iso(hw, hd, s.z);
  const W = iso(-hw, hd, s.z);
  const Et: [number, number] = [E[0], E[1] + s.t];
  const St: [number, number] = [S[0], S[1] + s.t];
  const Wt: [number, number] = [W[0], W[1] + s.t];

  const parts: string[] = [];

  // Front-right side face (light catch)
  parts.push(
    `<polygon points="${poly([E, S, St, Et])}" fill="${s.rightFill}" />`
  );
  // Front-left side face (shade)
  parts.push(
    `<polygon points="${poly([S, W, Wt, St])}" fill="${s.leftFill}" />`
  );
  // Top face
  parts.push(
    `<polygon points="${poly([N, E, S, W])}" fill="${s.topFill}"${
      s.stroke ? ` stroke="${s.stroke}" stroke-width="2" stroke-linejoin="round"` : ''
    } />`
  );

  // Printed text lines along the +x axis on the top face
  if (s.lines) {
    const lineAt = (t: number, len: number, wd: number, fill: string) => {
      const ox = -hw + 34;
      const oy = -hd + t;
      const a = iso(ox, oy, s.z);
      const b = iso(ox + len, oy, s.z);
      const c = iso(ox + len, oy + wd, s.z);
      const dd = iso(ox, oy + wd, s.z);
      parts.push(
        `<polygon points="${poly([a, b, c, dd])}" fill="${fill}" opacity="0.85" />`
      );
    };
    lineAt(30, s.w - 78, 12, '#0D1F18');
    lineAt(62, s.w - 130, 12, '#059669');
    lineAt(94, s.w - 96, 12, '#0D1F18');
  }

  return parts.join('\n    ');
}

function masterSvg(): string {
  // Faithful 3D treatment of the ORIGINAL icon composition (public/brand/local-desk-app-icon.svg):
  // same plate, same L-frame, same sheet + fold + text lines — depth added via
  // extrusion (stacked darker copies) and a lifted sheet with soft contact shadow.

  // Extrude helper: stack the same path with incremental offsets, deepest first
  const extrude = (
    pathD: string,
    fill: string,
    steps: number,
    dx: number,
    dy: number,
    opacity = 1
  ): string => {
    const layers: string[] = [];
    for (let i = steps; i >= 1; i--) {
      layers.push(
        `<path d="${pathD}" transform="translate(${(dx * i).toFixed(2)},${(dy * i).toFixed(2)})" fill="${fill}" opacity="${opacity}"/>`
      );
    }
    return layers.join('\n    ');
  };

  const FRAME_D =
    'M14 18C14 15.7909 15.7909 14 18 14H21C22.3807 14 23.5 15.1193 23.5 16.5V38C23.5 39.3807 24.6193 40.5 26 40.5H47.5C48.8807 40.5 50 41.6193 50 43V46C50 48.2091 48.2091 50 46 50H18C15.7909 50 14 48.2091 14 46V18Z';
  const SHEET_D =
    'M28 16.5C28 15.1193 29.1193 14 30.5 14H41L50 23V33.5C50 34.8807 48.8807 36 47.5 36H30.5C29.1193 36 28 34.8807 28 33.5V16.5Z';
  const FOLD_D = 'M41 14V20.5C41 21.8807 42.1193 23 43.5 23H50L41 14Z';

  // The sheet floats above the frame: lift offset applied to the sheet group
  const lift = 'translate(-2,-2.6)';
  const softShadow = (pathD: string, liftT: string): string => {
    // three expanding translucent copies under the lifted sheet (no filters — librsvg-safe)
    return [4.4, 3.2, 2.2]
      .map(
        (o, i) =>
          `<path d="${pathD}" transform="${liftT} translate(${(o * 0.9).toFixed(2)},${o.toFixed(2)})" fill="#020B08" opacity="${(0.16 - i * 0.045).toFixed(3)}"/>`
      )
      .join('\n    ');
  };

  return `<svg width="512" height="512" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="bg" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#142C23"/>
      <stop offset="1" stop-color="#0A1712"/>
    </linearGradient>
    <linearGradient id="frame" x1="14" y1="14" x2="50" y2="50" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#34D399"/>
      <stop offset="0.45" stop-color="#10B981"/>
      <stop offset="1" stop-color="#059669"/>
    </linearGradient>
    <linearGradient id="sheet" x1="28" y1="14" x2="50" y2="36" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F7FCF9"/>
      <stop offset="1" stop-color="#D1FAE5"/>
    </linearGradient>
    <linearGradient id="sheetSide" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9FDEC6"/>
      <stop offset="1" stop-color="#5FC4A4"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.38" r="0.6">
      <stop offset="0" stop-color="#34D399" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#34D399" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Plate: identical to the original icon -->
  <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#bg)"/>
  <rect x="4.75" y="4.75" width="54.5" height="54.5" rx="13.25" stroke="#34D399" stroke-opacity="0.24" stroke-width="1.25"/>
  <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#glow)"/>

  <!-- L-frame with 3D extrusion (depth drops down-right, darkest deepest) -->
  ${extrude(FRAME_D, '#043D2E', 5, 0, 0.9, 0.9)}
  ${extrude(FRAME_D, '#047857', 3, 0, 0.9, 0.95)}
  <path d="${FRAME_D}" fill="url(#frame)"/>
  <!-- Top-edge highlight on the frame -->
  <path d="M18 14H21C22.3807 14 23.5 15.1193 23.5 16.5V16.5C22.5 15.6 20.5 15.2 18 15.6Z" fill="#6EE7B7" opacity="0.55"/>

  <!-- Sheet: lifted off the frame, extruded, with soft floating shadow -->
  ${softShadow(SHEET_D, lift)}
  <g transform="${lift}">
    ${extrude(SHEET_D, 'url(#sheetSide)', 3, 0, 0.9)}
    <path d="${SHEET_D}" fill="url(#sheet)"/>
    <path d="${FOLD_D}" fill="#10B981"/>
    <rect x="32.5" y="23" width="11.5" height="2.6" rx="1.3" fill="#0D1F18"/>
    <rect x="32.5" y="28" width="7.5" height="2.6" rx="1.3" fill="#059669"/>
    <!-- sheet top-edge sheen -->
    <path d="M30.5 14H41L39.4 15.2H30.9C30.2 15.2 29.7 15.4 29.4 15.8C29.2 15.4 29.7 14.6 30.5 14Z" fill="#FFFFFF" opacity="0.6"/>
  </g>
</svg>`;
}

async function main(): Promise<void> {
  const svg = masterSvg();
  const outDir = path.join(ROOT, 'public');

  // favicon.svg (modern browsers prefer it) — same design, compact header
  const faviconSvg = svg.replace(
    '<svg width="512" height="512" viewBox="0 0 512 512"',
    '<svg width="64" height="64" viewBox="0 0 512 512"'
  );
  await fs.writeFile(path.join(outDir, 'favicon.svg'), faviconSvg, 'utf8');

  const master = sharp(Buffer.from(svg)).resize(512, 512);
  const masterPng = await master.png().toBuffer();

  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 180, 256, 512];
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const icoLayers: Array<{ size: number; pngData: Buffer }> = [];

  for (const s of sizes) {
    const png = await sharp(masterPng).resize(s, s).png().toBuffer();

    // Brand app-icon PNGs consumed by build_windows_release.ts + electron/main.cjs
    if (icoSizes.includes(s) || s === 512) {
      const brandDir = path.join(outDir, 'brand', 'png');
      await fs.mkdir(brandDir, { recursive: true });
      await fs.writeFile(path.join(brandDir, `local-desk-app-icon-${s}x${s}.png`), png);
    }
    // Favicon PNG set referenced by index.html + manifest.webmanifest
    if (s !== 180 && s !== 512) {
      await fs.writeFile(path.join(outDir, `favicon-${s}x${s}.png`), png);
    }
    if (s === 180) {
      await fs.writeFile(path.join(outDir, 'apple-touch-icon.png'), png);
    }
    if (icoSizes.includes(s)) {
      icoLayers.push({ size: s, pngData: png });
    }
  }

  // Windows .ico — same builder the release pipeline uses
  const ico = buildSpecCompliantIcoBuffer(icoLayers);
  const buildDir = path.join(ROOT, 'build');
  await fs.mkdir(buildDir, { recursive: true });
  await fs.writeFile(path.join(buildDir, 'icon.ico'), ico);
  await fs.writeFile(path.join(buildDir, 'local-desk-icon-v103.ico'), ico);
  await fs.writeFile(path.join(outDir, 'favicon.ico'), ico);

  await fs.writeFile(path.join(outDir, 'brand', 'png', 'local-desk-app-icon-256x256.png'), await sharp(masterPng).resize(256, 256).png().toBuffer());

  console.log(`[ICON3D] wrote favicon set, brand PNGs, favicon.ico (${ico.byteLength} B), build/icon.ico`);
}

main().catch((err) => {
  console.error('generate_3d_icon failed:', err);
  process.exit(1);
});
