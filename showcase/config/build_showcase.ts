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

  if (fs.existsSync(pagesOutDir)) {
    fs.rmSync(pagesOutDir, { recursive: true, force: true });
  }
  fs.mkdirSync(pagesOutDir, { recursive: true });

  // 1. Stage THE DESK landing (landing/index.html + assets) — designs/ excluded
  const landingDir = path.join(repoRoot, 'landing');
  fs.copyFileSync(path.join(landingDir, 'index.html'), path.join(pagesOutDir, 'index.html'));
  copyDirRecursive(path.join(landingDir, 'assets'), assetsOutDir);

  // Brand icon: the landing references ../public/brand/... on the dev server;
  // copy it into the artifact and rewrite the reference for standalone serving
  fs.copyFileSync(
    path.join(repoRoot, 'docs', 'screenshots', 'social-preview.png'),
    path.join(pagesOutDir, 'social-preview.png')
  );

  const brandDir = path.join(pagesOutDir, 'brand');
  fs.mkdirSync(brandDir, { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, 'public', 'brand', 'local-desk-app-icon.svg'),
    path.join(brandDir, 'local-desk-app-icon.svg')
  );

  let landingHtml = fs.readFileSync(path.join(pagesOutDir, 'index.html'), 'utf-8');
  landingHtml = landingHtml.replace(/\.\.\/public\/brand\//g, 'brand/');
  // The interactive demo is deployed at ./demo/ next to the landing
  landingHtml = landingHtml.replace(/href="\/demo\/"/g, 'href="demo/"');
  fs.writeFileSync(path.join(pagesOutDir, 'index.html'), landingHtml, 'utf-8');

  // 3. Add .nojekyll so GitHub Pages serves all static files without Jekyll processing
  fs.writeFileSync(path.join(pagesOutDir, '.nojekyll'), '');

  // 4. Build restricted showcase demo into /demo/ using showcase/config/vite.config.demo.ts
  process.env.SHOWCASE_DEMO_OUT_DIR = demoOutDir;
  process.env.SHOWCASE_BASE_PATH = process.env.SHOWCASE_BASE_PATH || '/LocalDesk/demo/';

  console.log(`[showcase] Building demo bundle with vite -> ${demoOutDir}`);
  await build({
    configFile: path.join(repoRoot, 'showcase/config/vite.config.demo.ts'),
    root: path.join(repoRoot, 'showcase/demo'),
    logLevel: 'info',
  });
  console.log('[showcase] Demo vite build finished');
  // demo/index.html favicon: absolute /showcase/assets path 404s on Pages
  const demoHtmlPath = path.join(demoOutDir, 'index.html');
  let demoHtml = fs.readFileSync(demoHtmlPath, 'utf-8');
  demoHtml = demoHtml.replace('/showcase/assets/logo.png', 'brand/local-desk-app-icon.svg');
  fs.writeFileSync(demoHtmlPath, demoHtml, 'utf-8');

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
