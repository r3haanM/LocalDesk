import type { Express, Request, Response, NextFunction } from 'express';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import type { ViteDevServer } from 'vite';

export function mountShowcasePreview(app: Express, repoRoot: string, vite?: ViteDevServer): void {
  const siteDir = path.join(repoRoot, 'showcase', 'site');
  const siteAssetsDir = path.join(siteDir, 'assets');
  const fallbackAssetsDir = path.join(repoRoot, 'showcase', 'assets');
  const demoHtmlPath = path.join(repoRoot, 'showcase', 'demo', 'index.html');
  const studioHtmlPath = path.join(repoRoot, 'index.html');

  // Serve showcase/site/assets first (for shot-*.webp), then fallback to showcase/assets
  app.use('/assets', express.static(siteAssetsDir));
  app.use('/assets', express.static(fallbackAssetsDir));
  app.use('/showcase/assets', express.static(fallbackAssetsDir));

  // 1. Public Showcase Landing Page at / and /showcase
  app.get(['/', '/index.html', '/showcase', '/showcase/'], async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rawHtml = await fs.readFile(path.join(siteDir, 'index.html'), 'utf-8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(rawHtml);
    } catch (err) {
      next(err);
    }
  });

  // 2. Restricted Showcase Demo at /demo and /demo/
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

  // 3. Full Un-restricted Web Studio at /studio
  app.get(['/studio', '/studio/'], async (_req: Request, res: Response, next: NextFunction) => {
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
}
