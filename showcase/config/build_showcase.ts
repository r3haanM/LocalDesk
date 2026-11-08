import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '../..');

function copyDirRecursive(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  const outDirArg = process.env.PAGES_OUT_DIR || '/tmp/localdesk-pages-dist';
  const pagesOutDir = path.resolve(repoRoot, outDirArg);
  const demoOutDir = path.join(pagesOutDir, 'demo');
  const assetsOutDir = path.join(pagesOutDir, 'assets');
  const siteSrcDir = path.join(repoRoot, 'showcase/site');
  const assetsSrcDir = path.join(repoRoot, 'showcase/assets');

  if (fs.existsSync(pagesOutDir)) {
    fs.rmSync(pagesOutDir, { recursive: true, force: true });
  }
  fs.mkdirSync(pagesOutDir, { recursive: true });

  // 1. Copy static vanilla HTML/CSS landing page into root of Pages artifact
  copyDirRecursive(siteSrcDir, pagesOutDir);

  // 2. Copy showcase assets (logo, dark/light screenshots, sample PDF) into /assets/
  copyDirRecursive(assetsSrcDir, assetsOutDir);

  // 3. Add .nojekyll so GitHub Pages serves all static files without Jekyll processing
  fs.writeFileSync(path.join(pagesOutDir, '.nojekyll'), '');

  // 4. Build restricted showcase demo into /demo/ using showcase/config/vite.config.demo.ts
  process.env.SHOWCASE_DEMO_OUT_DIR = demoOutDir;
  process.env.SHOWCASE_BASE_PATH = process.env.SHOWCASE_BASE_PATH || '/local-desk/demo/';

  await build({
    configFile: path.join(repoRoot, 'showcase/config/vite.config.demo.ts'),
  });

  console.log(`\n[showcase] Built GitHub Pages bundle at: ${pagesOutDir}`);
  console.log(`  - Landing page: ${path.join(pagesOutDir, 'index.html')}`);
  console.log(`  - 404 fallback: ${path.join(pagesOutDir, '404.html')}`);
  console.log(`  - Assets dir:   ${assetsOutDir}`);
  console.log(`  - Demo bundle:  ${path.join(demoOutDir, 'index.html')}`);
}

main().catch((err) => {
  console.error('[showcase] Build failed:', err);
  process.exit(1);
});
