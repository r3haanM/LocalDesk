/**
 * Restores the ORIGINAL flat app icon set from the untouched master SVG
 * (public/brand/local-desk-app-icon.svg) — reverses scripts/generate_3d_icon.ts.
 * Run: npx tsx scripts/restore_flat_icon.ts
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildSpecCompliantIcoBuffer } from './pe64_builder';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const masterSvgPath = path.join(ROOT, 'public', 'brand', 'local-desk-app-icon.svg');
  const svg = await fs.readFile(masterSvgPath, 'utf8');
  const outDir = path.join(ROOT, 'public');

  // favicon.svg — same design at 64px viewport (identical to the original file's role)
  const faviconSvg = svg.replace(
    '<svg width="64" height="64" viewBox="0 0 64 64"',
    '<svg width="64" height="64" viewBox="0 0 64 64"'
  );
  await fs.writeFile(path.join(outDir, 'favicon.svg'), faviconSvg, 'utf8');

  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const icoLayers: Array<{ size: number; pngData: Buffer }> = [];

  for (const s of icoSizes) {
    const png = await sharp(Buffer.from(svg), { density: 72 * (s / 64) * 4 })
      .resize(s, s)
      .png()
      .toBuffer();

    const brandDir = path.join(outDir, 'brand', 'png');
    await fs.writeFile(path.join(brandDir, `local-desk-app-icon-${s}x${s}.png`), png);
    await fs.writeFile(path.join(outDir, `favicon-${s}x${s}.png`), png);
    icoLayers.push({ size: s, pngData: png });
  }

  // 512 brand asset
  const png512 = await sharp(Buffer.from(svg)).resize(512, 512).png().toBuffer();
  await fs.writeFile(path.join(outDir, 'brand', 'png', 'local-desk-app-icon-512x512.png'), png512);

  // apple-touch-icon (180)
  const png180 = await sharp(Buffer.from(svg)).resize(180, 180).png().toBuffer();
  await fs.writeFile(path.join(outDir, 'apple-touch-icon.png'), png180);

  // favicon.ico + electron-builder icons
  const ico = buildSpecCompliantIcoBuffer(icoLayers);
  const buildDir = path.join(ROOT, 'build');
  await fs.writeFile(path.join(buildDir, 'icon.ico'), ico);
  await fs.writeFile(path.join(buildDir, 'local-desk-icon-v103.ico'), ico);
  await fs.writeFile(path.join(outDir, 'favicon.ico'), ico);

  console.log(`[ICON-RESTORE] original flat icon set restored (ico ${ico.byteLength} B)`);
}

main().catch((err) => {
  console.error('restore_flat_icon failed:', err);
  process.exit(1);
});
