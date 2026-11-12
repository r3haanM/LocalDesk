# Local Desk — Public Landing Page

A standalone, screenshot-free public landing page for **Local Desk**.
Lives in this `landing/` folder plus one route file (`showcase/config/preview_middleware.ts`).
The product itself (`src/`, `electron/`, `server.ts`) is untouched.

## Routes (dev server — `npm run dev`, port 3000)

| Route | What it serves |
|---|---|
| `/` | **THE DESK** flagship landing (this folder) |
| `/demo/` | Restricted interactive demo — real studio UI, sample PDF staged, uploads disabled, banner-free |
| `/studio` (alias `/app`) | **The full unrestricted product** — empty dropzone, every tool |
| `/showcase` | Previous screenshot-based landing (archived) |
| `/designs/` | Landing design gallery + the 5 alternate concepts + font-preview |

Typography: **Instrument Serif** (display, italic gradient flourish) + **Inter** (body/UI)
+ **JetBrains Mono** (annotations) — vendored locally in `assets/fonts/` (latin subsets,
~118 KB, OFL licensed), so the landing page itself still makes **zero external requests**.

## The designs

Browse them all from [`designs/index.html`](designs/index.html):

| # | File | Direction |
|---|---|---|
| 00 | [index.html](index.html) | **THE DESK** (flagship) — the page IS a desk: draggable papers, scanner (conversion), shredder (redaction), drawers (tools), pinboard (formats); scroll pans the camera across the world |
| 01 | [designs/obsidian-editorial.html](designs/obsidian-editorial.html) | **Obsidian Editorial** — particle document ⇄ vault morph, live-drawn bento, interactive redaction, audit terminal |
| 02 | [designs/aurora-glass.html](designs/aurora-glass.html) | **Aurora Glass** — glassmorphism over drifting aurora, orb hero with orbiting format chips |
| 03 | [designs/terminal-vault.html](designs/terminal-vault.html) | **Terminal Vault** — phosphor CRT console, self-typing command transcripts, man-page features |
| 04 | [designs/daylight-editorial.html](designs/daylight-editorial.html) | **Daylight Editorial** — light print-journal serif, numbered figures, dark forest footer |
| 05 | [designs/iso-blueprint.html](designs/iso-blueprint.html) | **ISO Blueprint** — engineering spec sheet: dimensioned A4 drawing, §1–§4 clauses, title block + stamps |

Every design: official logo unchanged · footer mirrors the old showcase landing · no screenshots · zero external resources · demo-first CTAs (`/demo/`).

## THE DESK — how it works

`index.html` is a fixed full-screen `<canvas>` driven by `assets/desk.js`; a 360vh scroll
spacer maps page scroll to a camera pan across a tall desk world (home row → stations →
tools/formats → proof). All props are drawn code — no images:

- **The desk performs itself.** Each zone runs an auto-choreography when it scrolls into
  view: the hero pulls a sheet and stamps it, the scanner converts an ephemeral page into
  a DOCX, the shredder feeds and strips one, the drawers open in sequence, the pinboard
  twitches, the severed cable's sticky sways. Manual dragging still works — it's just optional.
- **Silk scrolling.** Wheel input is intercepted and eased exponentially (Lenis-style)
  before it reaches the page; the camera follows with a near-direct spring. Touch devices
  keep native momentum + camera smoothing.
- Papers are also draggable by hand; stations fire their sequences on drop
- The compressed world (3350→2280 units wide-mode, 4900→3480 compact) keeps zones adjacent
- Chrome (nav, persistent demo CTA, toast, desk-edge footer) is real HTML on top

Reloads always start at the top (`history.scrollRestoration = manual`). Compact
single-column layout under 760px; `prefers-reduced-motion` disables wheel smoothing and
the camera lerp.

## Design language (flagship)

Derived directly from the product's design tokens (`src/index.css`):

| Token | Value | Used for |
|---|---|---|
| Obsidian canvas | `#070B12` / `#090D16` | page background |
| Emerald accent | `#10B981` → `#34D399` | CTAs, gradients, glows |
| Spring highlight | `#A7F3D0` | gradient text tops |
| Forest (light brand) | `#059669` | gradient depth |
| Display font | Segoe UI Variable Display stack | headlines |
| Micro-label font | Cascadia Mono / Consolas | kickers, tags, terminal |

Everything is **100% self-contained**: no external fonts, no CDNs, no images.
All visuals are live HTML/CSS/SVG/Canvas artwork (fitting, for a 100%-local product).

## What's on the page

- **Hero** — editorial headline + interactive particle artwork: a document formed from
  ~700 particles that **morphs into a shield, then a padlock on click**, with mouse repulsion.
- **Format marquee** — infinite ticker of the 13 supported formats.
- **Feature bento** — 5 cards, each drawn live: animated 2D editor SVG (selection marquee,
  snap guides, dragging vector block), OCR scan-beam, batch queue rows, self-drawing
  signature with scrambling SHA-256, and a "zero" architecture strip.
- **Conversion orbit** — format nodes orbiting the PDF kernel, plus three conversion lists.
- **Security section** — an *interactive redaction demo*: click "Run redaction sweep" and
  watch PII burn black while the intercept → purge → verify report types out.
- **Offline audit terminal** — self-typing `$ localdesk --audit` transcript.
- **Steps + big CTA** — every CTA points at the live demo (`/demo/`).

## Run it

**Option A — with the dev server** (recommended, wires up the demo links):

```bash
npm run dev          # repo root
# then visit http://localhost:3000/landing/index.html
```

**Option B — any static server:**

```bash
npx serve landing    # or: python -m http.server --directory landing
```

**Option C — just open `landing/index.html` in a browser.**
The page itself works fully offline; demo CTAs automatically open
`http://localhost:3000/demo/` in a new tab when opened from `file://`.

## Notes

- Demo CTAs link to `/demo/` (the restricted showcase demo) so the public can
  experience the product itself — per design, **no product screenshots are used**.
- Respects `prefers-reduced-motion`: animations collapse to static states.
- Keyboard accessible: focus-visible rings, semantic landmarks, `aria-live` on the
  redaction report.
