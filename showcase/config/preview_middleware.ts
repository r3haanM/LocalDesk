import type { Express, Request, Response, NextFunction } from 'express';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import type { ViteDevServer } from 'vite';

export function mountShowcasePreview(app: Express, repoRoot: string, vite?: ViteDevServer): void {
  const siteDir = path.join(repoRoot, 'showcase', 'site');
  const siteAssetsDir = path.join(siteDir, 'assets');
  const fallbackAssetsDir = path.join(repoRoot, 'showcase', 'assets');
  const landingDir = path.join(repoRoot, 'landing');
  const landingAssetsDir = path.join(landingDir, 'assets');
  const publicDir = path.join(repoRoot, 'public');
  const demoHtmlPath = path.join(repoRoot, 'showcase', 'demo', 'index.html');
  const studioHtmlPath = path.join(repoRoot, 'index.html');

  // Landing page assets (/assets/desk.css, /assets/fonts/*) resolve first;
  // showcase assets fall through for anything the landing folder doesn't have.
  app.use('/assets', express.static(landingAssetsDir));
  app.use('/assets', express.static(siteAssetsDir));
  app.use('/assets', express.static(fallbackAssetsDir));
  app.use('/showcase/assets', express.static(fallbackAssetsDir));
  // Brand files referenced by the landing favicon (../public/brand/...)
  app.use('/public', express.static(publicDir));

  // Tesseract OCR worker/WASM/language assets are loaded by the engine relative to the
  // page URL, so they must resolve under every app page prefix (/studio, /app, /demo).
  // In the packaged desktop exe dist/ocr/ sits next to index.html (file:) and needs no alias.
  app.use('/studio/ocr', express.static(path.join(publicDir, 'ocr')));
  app.use('/app/ocr', express.static(path.join(publicDir, 'ocr')));
  app.use('/demo/ocr', express.static(path.join(publicDir, 'ocr')));

  // 1. Public Landing Page — "THE DESK" — at / and /index.html
  app.get(['/', '/index.html'], async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rawHtml = await fs.readFile(path.join(landingDir, 'index.html'), 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(rawHtml);
    } catch (err) {
      next(err);
    }
  });

  // 2. Restricted Interactive Demo (sample document only, no uploads) at /demo
  app.get(['/demo', '/demo/', '/demo/index.html'], async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.path === '/demo') {
        res.redirect(302, '/demo/');
        return;
      }
      let rawDemoHtml = await fs.readFile(demoHtmlPath, 'utf-8');
      if (vite) {
        rawDemoHtml = await vite.transformIndexHtml('/showcase/demo/index.html', rawDemoHtml);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(rawDemoHtml);
    } catch (err) {
      next(err);
    }
  });

  // 3. Full Un-restricted Product Studio at /studio (alias: /app)
  app.get(['/studio', '/studio/', '/app', '/app/'], async (_req: Request, res: Response, next: NextFunction) => {
    try {
      let rawStudioHtml = await fs.readFile(studioHtmlPath, 'utf-8');
      if (vite) {
        rawStudioHtml = await vite.transformIndexHtml('/index.html', rawStudioHtml);
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(rawStudioHtml);
    } catch (err) {
      next(err);
    }
  });

  // 4. Previous screenshot-based landing kept available at /showcase
  app.get(['/showcase', '/showcase/', '/showcase/index.html'], async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rawHtml = await fs.readFile(path.join(siteDir, 'index.html'), 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(rawHtml);
    } catch (err) {
      next(err);
    }
  });

  // 5. Landing design gallery + alternates (designs/*.html)
  app.use('/designs', express.static(path.join(landingDir, 'designs')));
}
