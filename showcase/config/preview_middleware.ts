import type { Express, Request, Response, NextFunction } from 'express';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import type { ViteDevServer } from 'vite';

const PREVIEW_SWITCHER_SNIPPET = `
<style>
  #showcase-preview-switcher {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 2147483647;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 999px;
    background: rgba(9, 13, 22, 0.94);
    border: 1px solid rgba(15, 165, 117, 0.45);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12px;
    color: #E8F5EE;
    backdrop-filter: blur(10px);
  }
  #showcase-preview-switcher .sps-label {
    padding: 0 8px 0 6px;
    font-weight: 700;
    color: #0FA575;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 10px;
  }
  #showcase-preview-switcher a {
    text-decoration: none;
    color: #8FA39B;
    font-weight: 600;
    padding: 5px 10px;
    border-radius: 999px;
    transition: all 0.15s ease;
  }
  #showcase-preview-switcher a:hover {
    color: #E8F5EE;
    background: rgba(255, 255, 255, 0.06);
  }
  #showcase-preview-switcher a.sps-active {
    background: #0FA575;
    color: #04130D;
    font-weight: 700;
  }
</style>
<div id="showcase-preview-switcher" role="navigation" aria-label="Showcase Preview Mode Switcher">
  <span class="sps-label">Preview</span>
  <a href="/" data-sps-route="landing">Landing Page (/)</a>
  <a href="/demo/" data-sps-route="demo">Restricted Demo (/demo/)</a>
  <a href="/studio" data-sps-route="studio">Full Web Studio</a>
</div>
<script>
  (function () {
    var p = window.location.pathname;
    var active = p.indexOf('/demo') === 0 ? 'demo' : p.indexOf('/studio') === 0 ? 'studio' : 'landing';
    var links = document.querySelectorAll('#showcase-preview-switcher a[data-sps-route]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-sps-route') === active) {
        links[i].classList.add('sps-active');
      }
    }
  })();
</script>
`;

export function mountShowcasePreview(app: Express, repoRoot: string, vite?: ViteDevServer): void {
  const siteDir = path.join(repoRoot, 'showcase', 'site');
  const assetsDir = path.join(repoRoot, 'showcase', 'assets');
  const demoHtmlPath = path.join(repoRoot, 'showcase', 'demo', 'index.html');
  const studioHtmlPath = path.join(repoRoot, 'index.html');

  // Serve showcase static assets at both /assets/* and /showcase/assets/*
  app.use('/assets', express.static(assetsDir));
  app.use('/showcase/assets', express.static(assetsDir));
  app.use('/styles.css', express.static(path.join(siteDir, 'styles.css')));
  app.use('/404.html', express.static(path.join(siteDir, '404.html')));

  // 1. Public Showcase Landing Page at / and /showcase
  app.get(['/', '/index.html', '/showcase', '/showcase/'], async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rawHtml = await fs.readFile(path.join(siteDir, 'index.html'), 'utf-8');
      const withSwitcher = rawHtml.replace('</body>', `${PREVIEW_SWITCHER_SNIPPET}\n</body>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(withSwitcher);
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
      const withSwitcher = rawDemoHtml.replace('</body>', `${PREVIEW_SWITCHER_SNIPPET}\n</body>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(withSwitcher);
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
      const withSwitcher = rawStudioHtml.replace('</body>', `${PREVIEW_SWITCHER_SNIPPET}\n</body>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(withSwitcher);
    } catch (err) {
      next(err);
    }
  });
}
