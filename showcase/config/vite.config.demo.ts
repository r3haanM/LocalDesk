import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '../..');
const demoRoot = path.resolve(repoRoot, 'showcase/demo');

export default defineConfig(() => {
  const basePath = process.env.SHOWCASE_BASE_PATH || '/LocalDesk/demo/';
  const outDir = process.env.SHOWCASE_DEMO_OUT_DIR
    ? path.resolve(process.env.SHOWCASE_DEMO_OUT_DIR)
    : path.resolve('/tmp/localdesk-pages-dist/demo');

  return {
    root: demoRoot,
    base: basePath,
    publicDir: path.resolve(repoRoot, 'public'),
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SHOWCASE_BUILD': JSON.stringify('true'),
    },
    resolve: {
      alias: {
        '@': repoRoot,
        '/src': path.resolve(repoRoot, 'src'),
        '/showcase': path.resolve(repoRoot, 'showcase'),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input: path.join(demoRoot, 'index.html'),
      },
    },
  };
});
