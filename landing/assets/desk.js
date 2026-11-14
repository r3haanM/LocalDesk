/* ══════════════════════════════════════════════════════════════════════
   LOCAL DESK — "THE DESK" · canvas world engine
   The page IS a desk. Scroll pans the camera; papers are draggable;
   stations (scanner / shredder) perform the product's two signature
   demos; drawers + pinboard carry tools & formats. Zero dependencies.
   ══════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  /* ── helpers ────────────────────────────────────────────────────────── */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* a landing page always starts at the top — no restored scroll positions,
     no camera sweeping through every zone on reload */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("load", () => window.scrollTo(0, 0));

  /* ── DOM ────────────────────────────────────────────────────────────── */
  const canvas = document.getElementById("desk");
  const ctx = canvas.getContext("2d");
  const ctaEl = document.getElementById("demoCta");
  const footerEl = document.getElementById("deskFooter");
  const hintEl = document.getElementById("scrollHint");
  const toastEl = document.getElementById("deskToast");
  const yearEl = document.getElementById("year");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* file:// fallback for demo links */
  if (location.protocol === "file:") {
    document.querySelectorAll("[data-demo-link]").forEach((a) => {
      a.href = "http://localhost:3000/demo/";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        window.open("http://localhost:3000/demo/", "_blank", "noopener");
      });
    });
  }

  /* ── world / camera ─────────────────────────────────────────────────── */
  const WORLD_W = 1200;
  let worldH = 3350;
  let compact = false;
  let DPR = 1;
  let vw = 0, vh = 0;
  let s = 1;              // world→screen scale
  let offX = 0;           // horizontal centering offset (screen px)
  const cam = { y: 0, ty: 0 };

  function computeScale() {
    if (compact) return clamp(vw / 760, 0.42, 1.0);
    return clamp(vw / 1200, 0.9, 1.15);
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth;
    vh = window.innerHeight;
    compact = vw < 1024;
    s = computeScale();
    offX = Math.max(0, (vw - WORLD_W * s) / 2);
    canvas.width = Math.round(vw * DPR);
    canvas.height = Math.round(vh * DPR);
    layout();
    cam.y = cam.ty = camMax() * scrollProgress();
  }

  const camMax = () => Math.max(0, worldH - vh / s);
  const scrollProgress = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return clamp(window.scrollY / max, 0, 1);
  };

  /* ── tween system ───────────────────────────────────────────────────── */
  const tweens = [];
  function tween(dur, step, ease = easeOut) {
    return new Promise((resolve) => {
      tweens.push({ t: 0, dur: Math.max(1, dur), step, ease, resolve });
    });
  }
  const wait = (ms) => tween(ms, () => {}, (t) => t);
  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const p = clamp(tw.t / tw.dur, 0, 1);
      tw.step(tw.ease(p), p);
      if (p >= 1) {
        tweens.splice(i, 1);
        tw.resolve();
      }
    }
  }

  /* ── toast ──────────────────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  /* ── props ──────────────────────────────────────────────────────────── */
  const INK = "#F2F7F5";
  const INK_DIM = "#D7E4DC";
  const MINT = "#34D399";
  const EMERALD = "#10B981";

  const scanner = { x: 0, y: 0, w: 330, h: 240, lid: 0, beam: 0, led: 0, busy: false };
  const shredder = { x: 0, y: 0, w: 280, h: 215, strips: [], busy: false };
  const tray     = { x: 0, y: 0, w: 190, h: 64 };
  const stampTool = { x: 0, y: 0, held: false, press: 0 };
  const cabinet  = { x: 0, y: 0, w: 300, h: 345, drawers: [
    { open: 0, target: 0, chips: ["2D Editor", "OCR"] },
    { open: 0, target: 0, chips: ["Convert ×13", "Batch"] },
    { open: 0, target: 0, chips: ["Sign", "Protect"] }
  ]};
  const board    = { x: 0, y: 0, w: 440, h: 310 };
  const boardTags = [
    "DOCX", "XLSX", "PPTX", "HTML",      // left rail — PDF → world
    "JPG", "PNG", "CSV", "ZIP",          // right rail — world → PDF
    "PDF/A"                              // archive badge, under the core
  ].map((label) => ({ label, rot: 0, wig: 0 }));

  /* tidy circuit-board slots: two aligned rails + archive badge under the core */
  function boardSlots() {
    const cx = board.x + board.w / 2, cy = board.y + board.h / 2 - 7;
    const colXs = [cx - 130, cx + 130];
    const colYs = [-94, -32, 30, 92];
    const slots = [];
    boardTags.forEach((tag, i) => {
      if (i < 4) slots.push({ i, x: colXs[0], y: cy + colYs[i], label: tag.label });
      else if (i < 8) slots.push({ i, x: colXs[1], y: cy + colYs[i - 4], label: tag.label });
      else slots.push({ i, x: cx, y: cy + 88, label: tag.label, archive: true });
    });
    return slots;
  }

  const stickies = [];
  let stack = null;          // hero paper stack {x,y, count}
  const papers = [];         // loose draggable papers
  let paperSeq = 0;
  let zonePos = { hero: 480, workbench: 1120, tools: 1560, proof: 2020 };

  /* ── auto-choreography: each zone performs itself when scrolled into view ── */
  async function heroAuto() {
    if (!stack || stack.count <= 0) return;
    const spot = compact ? { x: 555, y: 620 } : { x: 620, y: 720 };
    stack.count--;
    const p = makePaper(stack.x + 30, stack.y - 14, { rot: rand(-0.04, 0.04) });
    await wait(420);
    const x0 = p.x, y0 = p.y, r0 = p.rot;
    await tween(700, (e) => { p.x = lerp(x0, spot.x, e); p.y = lerp(y0, spot.y, e); p.rot = lerp(r0, 0.05, e); });
    const sx0 = stampTool.x, sy0 = stampTool.y;
    await tween(650, (e) => { stampTool.x = lerp(sx0, p.x, e); stampTool.y = lerp(sy0, p.y - 24, e); });
    stampTool.press = 1;
    p.stamped = true;
    tween(240, (e) => { stampTool.press = 1 - e; });
    toast("✓ SIGNED — SHA-256 STAMP APPLIED LOCALLY");
    await wait(420);
    await tween(600, (e) => { stampTool.x = lerp(p.x, sx0, e); stampTool.y = lerp(p.y - 24, sy0, e); });
  }

  function spawnEphemeralPaper() {
    const p = makePaper(tray.x + rand(20, 140), tray.y - rand(12, 34), { rot: rand(-0.05, 0.05) });
    p.auto = true;
    return p;
  }

  function scheduleAutoFade(p, delay) {
    setTimeout(() => {
      if (p.state !== "idle" || p.held) return;   // visitor claimed it — let them keep it
      tween(700, (e) => { p.alpha = 1 - e; }).then(() => {
        const i = papers.indexOf(p);
        if (i >= 0 && p.state === "idle" && !p.held) papers.splice(i, 1);
      });
    }, delay);
  }

  async function workbenchAuto() {
    if (scanner.busy || shredder.busy) return;
    await wait(220);
    const p = spawnEphemeralPaper();
    await wait(340);
    await scanSequence(p);
    scheduleAutoFade(p, 3200);
    await wait(850);
    const q = spawnEphemeralPaper();
    await wait(340);
    await shredSequence(q);
  }

  async function toolsAuto() {
    for (let i = 0; i < cabinet.drawers.length; i++) { cabinet.drawers[i].target = 1; await wait(620); }
    await wait(1700);
    const tag = boardTags[(Math.random() * boardTags.length) | 0];
    tag.wig = 1;
    tween(900, (e) => { tag.wig = 1 - e; });
    await wait(600);
    for (let i = 0; i < cabinet.drawers.length; i++) { cabinet.drawers[i].target = 0; await wait(380); }
  }

  async function proofAuto() {
    toast("CUT THE CORD — 0 NETWORK REQUESTS, BY DESIGN");
    await wait(400);
  }

  const autoZones = [
    { get y() { return zonePos.hero; },       playing: false, wasInView: false, cool: 0, active: false, run: heroAuto },
    { get y() { return zonePos.workbench; },  playing: false, wasInView: false, cool: 0, active: false, run: workbenchAuto },
    { get y() { return zonePos.tools; },      playing: false, wasInView: false, cool: 0, active: false, run: toolsAuto },
    { get y() { return zonePos.proof; },      playing: false, wasInView: false, cool: 0, active: false, run: proofAuto }
  ];
  let pinWiggleT = 0;

  const cable = { x: 0, y: 0 };
  const decor = { pencil: null, tape: null, clip: null, coffee: null };

  const FONT_SANS = '"Inter", "Segoe UI", system-ui, sans-serif';
  const FONT_MONO = '"JetBrains Mono", "Cascadia Mono", ui-monospace, monospace';
  const FONT_DISPLAY = '"Instrument Serif", Georgia, "Times New Roman", serif';

  function makePaper(x, y, opts = {}) {
    const p = {
      id: ++paperSeq,
      x, y,
      w: 150, h: 196,
      rot: rand(-0.04, 0.04),
      kind: opts.kind || "blank",       // blank | converted
      stamped: false,
      held: false,
      vx: 0, vy: 0,
      homeStack: opts.homeStack || false,
      alpha: 1,
      state: "idle"                     // idle | held | busy
    };
    papers.push(p);
    dlog(`makePaper #${p.id} @(${Math.round(x)},${Math.round(y)}) kind=${p.kind}`);
    return p;
  }

  /* ── layout (wide vs compact) ───────────────────────────────────────── */
  let laidOut = false;
  let laidOutCompact = null;
  const debugLog = [];
  const dlog = (msg) => {
    debugLog.push(`${(performance.now() / 1000).toFixed(2)}s ${msg}`);
    if (debugLog.length > 60) debugLog.shift();
  };

  function layout() {
    const modeChanged = laidOutCompact !== compact;
    if (laidOut) dlog(`layout() mode=${compact ? "compact" : "wide"} changed=${modeChanged}`);

    const spacer = document.querySelector(".scroll-spacer");
    if (spacer) spacer.style.height = compact ? "400vh" : "360vh";

    stickies.length = 0;
    scanner.busy = false;
    shredder.busy = false;

    if (!compact) {
      worldH = 2280;
      /* Zone A — hero mat */
      stack = { x: 250, y: 640, count: 4 };
      stickies.push({ x: 960, y: 250, rot: -0.07, text: "no cloud.\nno accounts.\nno telemetry.", c: "#F7E9A0" });
      stickies.push({ x: 990, y: 500, rot: 0.05, text: "everything happens\nin this tab", c: "#BFF0D6" });
      decor.coffee = { x: 160, y: 480, r: 44 };
      decor.pencil = { x: 600, y: 762, rot: -0.10 };
      decor.tape   = { x: 140, y: 205, rot: 0.35 };
      decor.clip   = { x: 1080, y: 235, rot: -0.2 };
      stampTool.x = 790; stampTool.y = 680;
      zonePos = { hero: 480, workbench: 1120, tools: 1560, proof: 2020 };

      /* Zone B — stations (group centered on the mat's midline) */
      scanner.x = 120; scanner.y = 990;
      shredder.x = 795; shredder.y = 990;
      tray.x = 545; tray.y = 1030;
      /* Zone C — tools & formats (cabinet + board balanced around center) */
      cabinet.x = 165; cabinet.y = 1380;
      board.x = 595; board.y = 1360;
      cable.x = 600; cable.y = 1900;
    } else {
      worldH = 3480;
      stack = { x: 300, y: 600, count: 3 };
      stickies.push({ x: 650, y: 275, rot: -0.06, text: "no cloud.\nno accounts.\nno telemetry.", c: "#F7E9A0" });
      decor.coffee = { x: 110, y: 500, r: 38 };
      decor.pencil = null;
      decor.tape = { x: 620, y: 175, rot: 0.3 };
      decor.clip = null;
      stampTool.x = 410; stampTool.y = 555;
      zonePos = { hero: 520, workbench: 1250, tools: 2260, proof: 3150 };

      scanner.x = 180; scanner.y = 1120;
      tray.x = 285; tray.y = 1440;
      shredder.x = 240; shredder.y = 1580;
      cabinet.x = 230; cabinet.y = 1980;
      board.x = 160; board.y = 2500;
      cable.x = 380; cable.y = 3060;
    }

    /* Papers survive resizes; they are only (re)seeded on first layout or
       when switching between the wide and compact desk arrangements. */
    if (!laidOut || modeChanged) {
      papers.length = 0;
      shredder.strips.length = 0;
      scanner.lid = scanner.beam = 0;
      cabinet.drawers.forEach((d) => { d.open = 0; d.target = 0; });
      if (!compact) {
        makePaper(tray.x - 20, tray.y - 30, { rot: 0.07 });
        makePaper(tray.x + 62, tray.y - 44, { rot: -0.06 });
        makePaper(tray.x + 144, tray.y - 24, { rot: 0.03 });
      } else {
        makePaper(tray.x - 16, tray.y - 26, { rot: 0.06 });
        makePaper(tray.x + 66, tray.y - 38, { rot: -0.05 });
      }
      laidOut = true;
      laidOutCompact = compact;
    } else {
      /* keep the visitor's desk — just keep everything inside the world */
      for (const p of papers) {
        p.x = clamp(p.x, 70, WORLD_W - 70);
        p.y = clamp(p.y, 130, worldH - 60);
      }
      for (const st of shredder.strips) {
        st.x = clamp(st.x, shredder.x + 30, shredder.x + shredder.w - 30);
        st.y = clamp(st.y, 0, shredder.y + shredder.h - 26);
        st.floor = clamp(st.floor, 0, shredder.y + shredder.h - 26);
      }
    }
  }

  /* ── drawing pieces ─────────────────────────────────────────────────── */
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawShadowRect(c, x, y, w, h, r, lift = 0) {
    c.save();
    c.shadowColor = "rgba(0,0,0,0.5)";
    c.shadowBlur = 16 + lift * 10;
    c.shadowOffsetY = 10 + lift * 14;
    c.fillStyle = "rgba(0,0,0,0.01)";
    roundRect(c, x, y, w, h, r);
    c.fill();
    c.restore();
  }

  function drawBase(c) {
    /* floor beyond the mat */
    const g = c.createLinearGradient(0, 0, 0, worldH);
    g.addColorStop(0, "#0A0F1A");
    g.addColorStop(1, "#070B12");
    c.fillStyle = g;
    c.fillRect(-offX / s - 10, -10, WORLD_W + offX * 2 / s + 20, worldH + 20);

    /* faint architectural grid on the floor */
    c.strokeStyle = "rgba(148,163,184,0.045)";
    c.lineWidth = 1;
    const step = 80;
    const startY = Math.floor(cam.y / step) * step - step;
    const endY = cam.y + vh / s + step;
    const startX = -Math.floor(offX / s / step) * step - step;
    for (let gx = startX; gx < WORLD_W + offX / s; gx += step) {
      c.beginPath(); c.moveTo(gx, startY); c.lineTo(gx, endY); c.stroke();
    }
    for (let gy = startY; gy < endY; gy += step) {
      c.beginPath(); c.moveTo(startX, gy); c.lineTo(WORLD_W + offX / s, gy); c.stroke();
    }

    /* the mat */
    const mx = compact ? 30 : 55, my = 130;
    const mw = compact ? 700 : WORLD_W - 110, mh = compact ? 880 : 700;
    drawShadowRect(c, mx, my, mw, mh, 26);
    const mg = c.createLinearGradient(mx, my, mx + mw, my + mh);
    mg.addColorStop(0, "#0D1626");
    mg.addColorStop(1, "#0A1220");
    c.fillStyle = mg;
    roundRect(c, mx, my, mw, mh, 26);
    c.fill();
    c.strokeStyle = "rgba(52,211,153,0.16)";
    c.lineWidth = 1.5;
    roundRect(c, mx + 8, my + 8, mw - 16, mh - 16, 20);
    c.setLineDash([2, 7]);
    c.stroke();
    c.setLineDash([]);
  }

  function drawTitle(c) {
    const cx = compact ? 380 : WORLD_W / 2;
    const baseY = compact ? 300 : 320;
    const size = compact ? 60 : 94;

    c.textAlign = "center";
    /* kicker */
    c.font = `600 ${compact ? 10 : 12}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = `${compact ? 3 : 4}px`;
    c.fillStyle = MINT;
    c.fillText("100% LOCAL · ZERO UPLOADS · OPEN SOURCE", cx, baseY - 78);
    if ("letterSpacing" in c) c.letterSpacing = "0px";

    /* headline — Instrument Serif, italic gradient on the final line */
    c.font = `400 ${size}px ${FONT_DISPLAY}`;
    if ("letterSpacing" in c) c.letterSpacing = "-1px";
    const lines = ["Your documents.", "Your device.", "Your control."];
    lines.forEach((ln, i) => {
      const y = baseY + i * (size * 1.04);
      if (i === 2) {
        c.font = `italic 400 ${size}px ${FONT_DISPLAY}`;
        const grad = c.createLinearGradient(cx - 320, y - size, cx + 320, y);
        grad.addColorStop(0, "#A7F3D0");
        grad.addColorStop(0.55, MINT);
        grad.addColorStop(1, EMERALD);
        c.fillStyle = grad;
      } else {
        c.fillStyle = "#F4F8FA";
      }
      c.fillText(ln, cx, y);
    });
    if ("letterSpacing" in c) c.letterSpacing = "0px";

    /* caption — eight words, like everything else on this desk */
    c.font = `${compact ? 13 : 15.5}px ${FONT_SANS}`;
    c.fillStyle = "#94A3B8";
    c.fillText("An offline studio · 22 tools · 13 formats · nothing uploaded", cx, baseY + (size * 1.04) * 3 + 30);

    /* engraved zone tag */
    c.font = `600 ${compact ? 9 : 10.5}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "3px";
    c.fillStyle = "rgba(148,163,184,0.55)";
    c.fillText("00 · HOME ROW", cx, compact ? 1035 : 856);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  function drawSticky(c, st, t) {
    const w = 132, h = 118;
    c.save();
    c.translate(st.x, st.y);
    c.rotate(st.rot + (st.sway ? Math.sin((t || 0) * 1.7) * 0.025 : 0));
    drawShadowRect(c, -w / 2, -h / 2, w, h, 4, 0.4);
    c.fillStyle = st.c;
    roundRect(c, -w / 2, -h / 2, w, h, 4);
    c.fill();
    /* subtle top curl */
    c.fillStyle = "rgba(0,0,0,0.07)";
    c.fillRect(-w / 2, -h / 2, w, 7);
    c.fillStyle = "#1D2A22";
    c.font = `500 12.5px ${FONT_SANS}`;
    c.textAlign = "center";
    const lines = st.text.split("\n");
    lines.forEach((ln, i) => c.fillText(ln, 0, -h / 2 + 34 + i * 19));
    c.textAlign = "left";
    c.restore();
  }

  function drawPaperSheet(c, p) {
    const { w, h } = p;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.globalAlpha = p.alpha;

    const lift = p.held ? 1 : 0;
    drawShadowRect(c, -w / 2, -h / 2, w, h, 6, lift * 0.9);

    c.fillStyle = p.kind === "converted" ? "#EFFCF6" : INK;
    roundRect(c, -w / 2, -h / 2, w, h, 6);
    c.fill();

    /* fold corner */
    c.fillStyle = p.kind === "converted" ? "#BFF0D6" : INK_DIM;
    c.beginPath();
    c.moveTo(w / 2 - 26, -h / 2);
    c.lineTo(w / 2, -h / 2 + 26);
    c.lineTo(w / 2 - 26, -h / 2 + 26);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(13,31,24,0.25)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(w / 2 - 26, -h / 2);
    c.lineTo(w / 2 - 26, -h / 2 + 26);
    c.lineTo(w / 2, -h / 2 + 26);
    c.stroke();

    if (p.kind === "converted") {
      /* mint frame + big glyph */
      c.strokeStyle = "rgba(16,185,129,0.55)";
      c.lineWidth = 1.6;
      roundRect(c, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 5);
      c.stroke();
      c.fillStyle = "#0D1F18";
      c.font = `800 64px ${FONT_SANS}`;
      c.textAlign = "center";
      c.fillText("A", 0, 26);
      c.font = `700 ${11}px ${FONT_MONO}`;
      c.fillStyle = EMERALD;
      c.fillText("DOCX · EDITABLE", 0, 58);
      c.textAlign = "left";
    } else {
      /* faint text lines */
      c.fillStyle = "rgba(13,31,24,0.16)";
      const rows = [34, 58, 82, 106, 130];
      const widths = [104, 116, 88, 110, 70];
      rows.forEach((ry, i) => {
        roundRect(c, -w / 2 + 20, -h / 2 + ry, widths[i], 6, 3);
        c.fill();
      });
      c.fillStyle = "rgba(13,31,24,0.4)";
      roundRect(c, -w / 2 + 20, -h / 2 + 14, 62, 8, 4);
      c.fill();
    }

    if (p.stamped) {
      c.save();
      c.translate(6, h / 2 - 44);
      c.rotate(-0.14);
      c.strokeStyle = "rgba(5,150,105,0.8)";
      c.lineWidth = 2.4;
      c.beginPath();
      c.arc(0, 0, 26, 0, TAU);
      c.stroke();
      c.fillStyle = "#047857";
      c.font = `700 10.5px ${FONT_MONO}`;
      c.textAlign = "center";
      c.fillText("SHA-256", 0, -3);
      c.fillText("✓", 0, 12);
      c.textAlign = "left";
      c.restore();
    }
    c.globalAlpha = 1;
    c.restore();
  }

  function drawStack(c) {
    const n = stack.count;
    for (let i = 0; i < n; i++) {
      const off = i * 5;
      c.save();
      c.translate(stack.x + off * 0.7, stack.y + off * 0.8 - (n - 1 - i) * 0);
      c.rotate(i * 0.015);
      drawShadowRect(c, -75, -98, 150, 196, 6, 0);
      c.fillStyle = i === n - 1 ? INK : "#E7EEE9";
      roundRect(c, -75, -98, 150, 196, 6);
      c.fill();
      if (i === n - 1) {
        c.fillStyle = "rgba(13,31,24,0.16)";
        [34, 58, 82].forEach((ry, k) => { roundRect(c, -55, -98 + ry, 104 - k * 14, 6, 3); c.fill(); });
        c.fillStyle = "rgba(13,31,24,0.4)";
        roundRect(c, -55, -84, 62, 8, 4); c.fill();
        c.font = `600 10.5px ${FONT_MONO}`;
        c.fillStyle = EMERALD;
        c.textAlign = "center";
        if ("letterSpacing" in c) c.letterSpacing = "2px";
        c.fillText("DRAG ME", 0, 78);
        if ("letterSpacing" in c) c.letterSpacing = "0px";
        c.textAlign = "left";
      }
      c.restore();
    }
  }

  function drawTray(c) {
    drawShadowRect(c, tray.x, tray.y, tray.w, tray.h, 10);
    c.fillStyle = "#0F1828";
    roundRect(c, tray.x, tray.y, tray.w, tray.h, 10);
    c.fill();
    c.strokeStyle = "rgba(148,163,184,0.2)";
    c.lineWidth = 1;
    roundRect(c, tray.x, tray.y, tray.w, tray.h, 10);
    c.stroke();
    c.fillStyle = "rgba(148,163,184,0.6)";
    c.font = `600 9.5px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "2px";
    c.textAlign = "center";
    c.fillText("FRESH PAGES", tray.x + tray.w / 2, tray.y + tray.h / 2 + 3.5);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  function drawScanner(c, t) {
    const { x, y, w, h } = scanner;
    drawShadowRect(c, x, y, w, h, 14);
    c.fillStyle = "#121B2C";
    roundRect(c, x, y, w, h, 14);
    c.fill();
    c.strokeStyle = "rgba(148,163,184,0.18)";
    c.lineWidth = 1;
    roundRect(c, x, y, w, h, 14);
    c.stroke();

    /* glass bed */
    const bx = x + 28, by = y + 46, bw = w - 56, bh = h - 108;
    c.fillStyle = "#0B241D";
    roundRect(c, bx, by, bw, bh, 8);
    c.fill();
    const glass = c.createLinearGradient(bx, by, bx + bw, by + bh);
    glass.addColorStop(0, "rgba(52,211,153,0.10)");
    glass.addColorStop(1, "rgba(16,185,129,0.04)");
    c.fillStyle = glass;
    roundRect(c, bx, by, bw, bh, 8);
    c.fill();
    c.strokeStyle = "rgba(52,211,153,0.35)";
    roundRect(c, bx, by, bw, bh, 8);
    c.stroke();

    /* scan beam */
    if (scanner.beam > 0 && scanner.beam < 1) {
      const beamY = by + bh * scanner.beam;
      const bg = c.createLinearGradient(0, beamY - 26, 0, beamY);
      bg.addColorStop(0, "rgba(52,211,153,0)");
      bg.addColorStop(1, "rgba(52,211,153,0.45)");
      c.fillStyle = bg;
      c.fillRect(bx + 3, beamY - 26, bw - 6, 26);
      c.strokeStyle = "rgba(167,243,208,0.9)";
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(bx + 3, beamY); c.lineTo(bx + bw - 3, beamY); c.stroke();
    }

    /* lid */
    const lidY = y + 8 + (h - 60) * (1 - scanner.lid) * 0.42;
    c.fillStyle = "#182338";
    roundRect(c, x + 18, lidY - 34, w - 36, 38, 8);
    c.fill();
    c.strokeStyle = "rgba(52,211,153,0.25)";
    roundRect(c, x + 18, lidY - 34, w - 36, 38, 8);
    c.stroke();

    /* led */
    c.fillStyle = scanner.busy ? `rgba(52,211,153,${0.6 + 0.4 * Math.sin(t * 6)})` : "rgba(52,211,153,0.35)";
    c.beginPath(); c.arc(x + w - 22, y + 22, 4.4, 0, TAU); c.fill();

    /* out tray */
    c.fillStyle = "#0F1828";
    roundRect(c, x + w + 8, y + h - 92, 64, 74, 10);
    c.fill();
    c.strokeStyle = "rgba(148,163,184,0.2)";
    roundRect(c, x + w + 8, y + h - 92, 64, 74, 10);
    c.stroke();
    c.fillStyle = "rgba(148,163,184,0.55)";
    c.font = `600 8.5px ${FONT_MONO}`;
    c.textAlign = "center";
    c.fillText("OUT", x + w + 40, y + h - 50);
    c.textAlign = "left";

    /* caption */
    c.font = `600 ${compact ? 9.5 : 10.5}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "2.5px";
    c.fillStyle = "rgba(148,163,184,0.6)";
    c.textAlign = "center";
    c.fillText("01 · THE SCANNER — DROP A PAGE ON THE GLASS", x + (w + 72) / 2, y + h + 26);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  function drawShredder(c) {
    const { x, y, w, h } = shredder;
    drawShadowRect(c, x, y, w, h, 14);
    c.fillStyle = "#121B2C";
    roundRect(c, x, y, w, h, 14);
    c.fill();
    c.strokeStyle = "rgba(148,163,184,0.18)";
    roundRect(c, x, y, w, h, 14);
    c.stroke();

    /* slot */
    const sx = x + 34, sy = y + 38, sw = w - 68;
    c.fillStyle = "#05080F";
    roundRect(c, sx, sy, sw, 16, 8);
    c.fill();
    c.strokeStyle = "rgba(52,211,153,0.4)";
    c.setLineDash([4, 4]);
    roundRect(c, sx - 4, sy - 6, sw + 8, 28, 10);
    c.stroke();
    c.setLineDash([]);

    /* bin window */
    const bwinX = x + 24, bwinY = y + 84, bwinW = w - 48, bwinH = h - 104;
    c.fillStyle = "#0A1220";
    roundRect(c, bwinX, bwinY, bwinW, bwinH, 10);
    c.fill();
    c.save();
    roundRect(c, bwinX, bwinY, bwinW, bwinH, 10);
    c.clip();
    for (const st of shredder.strips) {
      c.save();
      c.translate(st.x, st.y);
      c.rotate(st.rot);
      c.fillStyle = st.mint ? "rgba(52,211,153,0.75)" : "#DCE5DF";
      c.fillRect(-st.w / 2, -st.len / 2, st.w, st.len);
      c.restore();
    }
    c.restore();
    c.strokeStyle = "rgba(148,163,184,0.2)";
    roundRect(c, bwinX, bwinY, bwinW, bwinH, 10);
    c.stroke();

    /* led */
    c.fillStyle = shredder.busy ? `rgba(251,191,36,${0.6 + 0.4 * Math.sin(performance.now() / 120)})` : "rgba(251,191,36,0.3)";
    c.beginPath(); c.arc(x + w - 20, y + 20, 4.4, 0, TAU); c.fill();

    c.font = `600 ${compact ? 9.5 : 10.5}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "2.5px";
    c.fillStyle = "rgba(148,163,184,0.6)";
    c.textAlign = "center";
    c.fillText("02 · THE SHREDDER — FEED IT A PAGE", x + w / 2, y + h + 26);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  function drawStamp(c) {
    const { x, y, press } = stampTool;
    c.save();
    c.translate(x, y);
    c.scale(1, 1 - press * 0.18);
    /* handle */
    c.fillStyle = "#1B2A44";
    c.beginPath();
    c.arc(0, -26, 16, 0, TAU);
    c.fill();
    c.fillStyle = "#22314E";
    roundRect(c, -7, -22, 14, 18, 6);
    c.fill();
    /* head */
    drawShadowRect(c, -34, -8, 68, 40, 8, stampTool.held ? 0.6 : 0);
    c.fillStyle = "#0F1828";
    roundRect(c, -34, -8, 68, 40, 8);
    c.fill();
    c.strokeStyle = "rgba(52,211,153,0.5)";
    c.lineWidth = 1.4;
    roundRect(c, -34, -8, 68, 40, 8);
    c.stroke();
    c.fillStyle = "#34D399";
    c.font = `700 11px ${FONT_MONO}`;
    c.textAlign = "center";
    c.fillText("SHA-256", 0, 12);
    c.fillText("✓", 0, 26);
    c.textAlign = "left";
    c.restore();
    /* caption */
    c.font = `600 ${compact ? 9.5 : 10.5}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "2.5px";
    c.fillStyle = "rgba(148,163,184,0.6)";
    c.textAlign = "center";
    c.fillText("03 · THE STAMP — PRESS IT ON A PAGE", x, y + 56);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  function drawCabinet(c) {
    const { x, y, w, h } = cabinet;
    const dh = 96;
    drawShadowRect(c, x, y, w, h, 14);
    c.fillStyle = "#0F1828";
    roundRect(c, x, y, w, h, 14);
    c.fill();
    c.strokeStyle = "rgba(148,163,184,0.18)";
    roundRect(c, x, y, w, h, 14);
    c.stroke();

    cabinet.drawers.forEach((d, i) => {
      const fy = y + 16 + i * (dh + 12);
      /* cavity behind the drawer front */
      c.fillStyle = "#0A1220";
      roundRect(c, x + 14, fy, w - 28, dh, 8);
      c.fill();
      /* chips revealed when open */
      d.chips.forEach((label, k) => {
        const appear = clamp(d.open * 1.6 - k * 0.35, 0, 1);
        if (appear <= 0) return;
        c.save();
        c.globalAlpha = appear;
        c.translate(x + 34 + k * 128, fy + dh / 2 + (1 - appear) * 14);
        c.rotate((1 - appear) * 0.2);
        c.fillStyle = INK;
        roundRect(c, -52, -17, 104, 34, 7);
        c.fill();
        c.fillStyle = "#0D1F18";
        c.font = `600 12.5px ${FONT_SANS}`;
        c.textAlign = "center";
        c.fillText(label, 0, 4.5);
        c.textAlign = "left";
        c.restore();
      });
      /* drawer front slides down as it opens */
      const slide = d.open * (dh - 18);
      c.fillStyle = "#17233A";
      roundRect(c, x + 14, fy + slide, w - 28, dh - slide, 8);
      c.fill();
      c.strokeStyle = "rgba(148,163,184,0.16)";
      roundRect(c, x + 14, fy + slide, w - 28, Math.max(6, dh - slide), 8);
      c.stroke();
      if (dh - slide > 26) {
        c.fillStyle = MINT;
        roundRect(c, x + w / 2 - 26, fy + slide + (dh - slide) / 2 - 3, 52, 6, 3);
        c.fill();
      }
    });

    c.font = `600 ${compact ? 9.5 : 10.5}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "2.5px";
    c.fillStyle = "rgba(148,163,184,0.6)";
    c.textAlign = "center";
    c.fillText("04 · THE DRAWERS — PULL ONE", x + w / 2, y + h + 26);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  function drawBoard(c, t) {
    const { x, y, w, h } = board;
    drawShadowRect(c, x, y, w, h, 14);
    c.fillStyle = "#221A12";
    roundRect(c, x, y, w, h, 14);
    c.fill();
    c.strokeStyle = "rgba(148,163,184,0.18)";
    roundRect(c, x, y, w, h, 14);
    c.stroke();
    /* cork speckle */
    c.fillStyle = "rgba(255,255,255,0.03)";
    for (let i = 0; i < 46; i++) {
      const px = x + 10 + ((i * 97) % (w - 20));
      const py = y + 10 + ((i * 53) % (h - 20));
      c.fillRect(px, py, 2.4, 1.4);
    }

    const cx = x + w / 2, cy = y + h / 2 - 7;
    const slots = boardSlots();

    /* circuit traces: two rails + horizontal links from the core */
    c.strokeStyle = "rgba(52,211,153,0.22)";
    c.lineWidth = 1.4;
    c.setLineDash([5, 5]);
    c.beginPath();
    c.moveTo(cx - 130, cy - 100); c.lineTo(cx - 130, cy + 98);
    c.moveTo(cx + 130, cy - 100); c.lineTo(cx + 130, cy + 98);
    c.moveTo(cx - 130, cy); c.lineTo(cx - 56, cy);
    c.moveTo(cx + 56, cy); c.lineTo(cx + 130, cy);
    c.moveTo(cx, cy + 48); c.lineTo(cx, cy + 74);
    c.stroke();
    c.setLineDash([]);

    /* core */
    c.save();
    c.translate(cx, cy);
    const pulse = 1 + Math.sin(t * 1.6) * 0.03;
    c.scale(pulse, pulse);
    c.fillStyle = "rgba(16,185,129,0.14)";
    c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.fill();
    c.strokeStyle = "rgba(52,211,153,0.55)";
    c.lineWidth = 1.6;
    c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.stroke();
    c.fillStyle = "#A7F3D0";
    c.font = `800 17px ${FONT_MONO}`;
    c.textAlign = "center";
    c.fillText("PDF", 0, 6);
    c.restore();

    /* tags on their rails */
    for (const s of slots) {
      const tag = boardTags[s.i];
      c.save();
      c.translate(s.x, s.y);
      c.rotate(tag.wig * Math.sin(t * 14) * 0.14);
      if (s.archive) {
        c.fillStyle = "rgba(16,185,129,0.16)";
        roundRect(c, -46, -15, 92, 30, 15);
        c.fill();
        c.strokeStyle = "rgba(52,211,153,0.5)";
        c.lineWidth = 1.4;
        roundRect(c, -46, -15, 92, 30, 15);
        c.stroke();
        c.fillStyle = "#A7F3D0";
        c.font = `700 11px ${FONT_MONO}`;
        c.textAlign = "center";
        c.fillText("PDF/A · ARCHIVE", 0, 4);
      } else {
        c.fillStyle = INK;
        roundRect(c, -37, -15, 74, 30, 15);
        c.fill();
        c.fillStyle = "#0D1F18";
        c.font = `700 11px ${FONT_MONO}`;
        c.textAlign = "center";
        c.fillText(tag.label, 0, 4);
        c.fillStyle = (tag.label === "DOCX" || tag.label === "PNG") ? "#FBBF24" : MINT;
        c.beginPath(); c.arc(0, -15, 3.4, 0, TAU); c.fill();
      }
      c.textAlign = "left";
      c.restore();
    }

    c.font = `600 ${compact ? 9.5 : 10.5}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "2.5px";
    c.fillStyle = "rgba(148,163,184,0.6)";
    c.textAlign = "center";
    c.fillText("05 · THE PINBOARD — 13 FORMATS, ONE CORE", x + w / 2, y + h + 26);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  function drawCable(c, t) {
    const { x, y } = cable;
    const proofOn = autoZones[3] && autoZones[3].active;
    c.save();
    c.strokeStyle = "#2A3850";
    c.lineWidth = 6;
    c.lineCap = "round";
    /* left half */
    c.beginPath();
    c.moveTo(x - 120, y);
    c.bezierCurveTo(x - 80, y - 18, x - 60, y + 14, x - 22, y + 2);
    c.stroke();
    /* right half */
    c.beginPath();
    c.moveTo(x + 26, y - 6);
    c.bezierCurveTo(x + 66, y - 18, x + 88, y + 10, x + 124, y);
    c.stroke();
    /* plug ends */
    c.fillStyle = "#1B2A44";
    roundRect(c, x - 138, y - 9, 22, 18, 4); c.fill();
    roundRect(c, x + 120, y - 9, 22, 18, 4); c.fill();
    /* the cut — pulses while the proof zone is on stage */
    c.strokeStyle = MINT;
    c.lineWidth = 2;
    c.setLineDash([3, 4]);
    if (proofOn) c.lineDashOffset = -((t || 0) * 26) % 14;
    c.beginPath(); c.moveTo(x - 14, y - 12); c.lineTo(x + 18, y + 10); c.stroke();
    c.setLineDash([]);
    c.restore();

    drawSticky(c, { x, y: y + 62, rot: 0.04, text: "cut the cord —\n0 network\nrequests", c: "#F7E9A0", sway: proofOn }, t);
  }

  function drawDecor(c) {
    if (decor.coffee) {
      c.save();
      c.strokeStyle = "rgba(120,84,50,0.16)";
      c.lineWidth = 5;
      c.beginPath();
      c.ellipse(decor.coffee.x, decor.coffee.y, decor.coffee.r, decor.coffee.r * 0.92, 0.3, 0, TAU);
      c.stroke();
      c.strokeStyle = "rgba(120,84,50,0.1)";
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(decor.coffee.x, decor.coffee.y, decor.coffee.r - 12, decor.coffee.r * 0.92 - 12, 0.3, 0, TAU);
      c.stroke();
      c.restore();
    }
    if (decor.pencil) {
      c.save();
      c.translate(decor.pencil.x, decor.pencil.y);
      c.rotate(decor.pencil.rot);
      c.fillStyle = "#0D1F18";
      roundRect(c, -70, -5, 132, 10, 5); c.fill();
      c.fillStyle = "#F2C48D";
      c.beginPath();
      c.moveTo(62, -5); c.lineTo(76, 0); c.lineTo(62, 5); c.closePath();
      c.fill();
      c.fillStyle = "#34D399";
      roundRect(c, -70, -5, 14, 10, 5); c.fill();
      c.restore();
    }
    if (decor.tape) {
      c.save();
      c.translate(decor.tape.x, decor.tape.y);
      c.rotate(decor.tape.rot);
      c.fillStyle = "rgba(226,232,240,0.14)";
      c.beginPath();
      c.arc(0, 0, 34, 0, TAU);
      c.fill();
      c.fillStyle = "#0A0F1A";
      c.beginPath();
      c.arc(0, 0, 15, 0, TAU);
      c.fill();
      c.restore();
    }
    if (decor.clip) {
      c.save();
      c.translate(decor.clip.x, decor.clip.y);
      c.rotate(decor.clip.rot);
      c.strokeStyle = "rgba(148,163,184,0.5)";
      c.lineWidth = 2.6;
      c.beginPath();
      c.roundRect(-6, -16, 12, 32, 6);
      c.stroke();
      c.beginPath();
      c.roundRect(-3, -11, 6, 22, 3);
      c.stroke();
      c.restore();
    }
  }

  function drawZoneCaptions(c) {
    c.font = `600 ${compact ? 9.5 : 10.5}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "3px";
    c.fillStyle = "rgba(148,163,184,0.4)";
    c.textAlign = "center";
    const midX = compact ? 380 : WORLD_W / 2;
    c.fillText(compact ? "WORKBENCH" : "01 · WORKBENCH", midX, compact ? 1075 : 940);
    c.fillText(compact ? "TOOLS & FORMATS" : "02 · TOOLS & FORMATS", midX, compact ? 1900 : 1330);
    c.fillText(compact ? "PROOF" : "03 · PROOF", midX, compact ? 2940 : 1840);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  /* engraved sign-off at the far edge of the desk */
  function drawSignOff(c) {
    const cx = compact ? 380 : WORLD_W / 2;
    const y = compact ? 3320 : 2160;
    c.textAlign = "center";
    c.font = `italic 400 ${compact ? 20 : 30}px ${FONT_DISPLAY}`;
    c.fillStyle = "rgba(148,163,184,0.4)";
    c.fillText("Your documents never leave this desk.", cx, y);
    c.strokeStyle = "rgba(52,211,153,0.35)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx - 120, y + 18);
    c.lineTo(cx + 120, y + 18);
    c.stroke();
    c.font = `600 ${compact ? 9 : 10}px ${FONT_MONO}`;
    if ("letterSpacing" in c) c.letterSpacing = "3px";
    c.fillStyle = "rgba(148,163,184,0.4)";
    c.fillText("MIT LICENSED · SOURCE ON GITHUB · BUILT TO BE CHECKED", cx, y + 44);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.textAlign = "left";
  }

  /* ── grain overlay (pre-rendered once) ──────────────────────────────── */
  const grainTile = document.createElement("canvas");
  grainTile.width = grainTile.height = 180;
  {
    const g = grainTile.getContext("2d");
    const img = g.createImageData(180, 180);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 11;
    }
    g.putImageData(img, 0, 0);
  }
  let grainPattern = null;

  /* ── interactions ───────────────────────────────────────────────────── */
  const drag = { mode: null, obj: null, dx: 0, dy: 0, lastX: 0, lastY: 0, lastT: 0, vx: 0 };

  function screenToWorld(px, py) {
    return { x: (px - offX) / s, y: py / s + cam.y };
  }

  function paperAt(wx, wy) {
    for (let i = papers.length - 1; i >= 0; i--) {
      const p = papers[i];
      if (p.state !== "idle") continue;
      const dx = wx - p.x, dy = wy - p.y;
      if (Math.abs(dx) < p.w / 2 + 2 && Math.abs(dy) < p.h / 2 + 2) return p;
    }
    /* hero stack top sheet */
    if (stack && stack.count > 0) {
      const dx = wx - stack.x, dy = wy - stack.y;
      if (Math.abs(dx) < 84 && Math.abs(dy) < 106) {
        stack.count--;
        const p = makePaper(stack.x + 14, stack.y - 12, { rot: rand(-0.05, 0.05) });
        p.x = wx; p.y = wy;
        return p;
      }
    }
    return null;
  }

  const inRect = (wx, wy, x, y, w, h) => wx > x && wx < x + w && wy > y && wy < y + h;
  const scannerBed = () => ({ x: scanner.x + 28, y: scanner.y + 46, w: scanner.w - 56, h: scanner.h - 108 });
  const shredderSlot = () => ({ x: shredder.x + 30, y: shredder.y + 32, w: shredder.w - 60, h: 28 });
  const outTray = () => ({ x: scanner.x + scanner.w + 8, y: scanner.y + scanner.h - 92, w: 64, h: 74 });

  async function scanSequence(p) {
    p.state = "busy";
    scanner.busy = true;
    const bed = scannerBed();
    const cx = bed.x + bed.w / 2, cy = bed.y + bed.h / 2;
    toast("SCANNING — CONVERTING IN LOCAL MEMORY…");
    const x0 = p.x, y0 = p.y, r0 = p.rot;
    await tween(340, (e) => { p.x = lerp(x0, cx, e); p.y = lerp(y0, cy, e); p.rot = lerp(r0, 0, e); });
    await tween(260, (e) => { scanner.lid = e; });
    await wait(160);
    await tween(1100, (e) => { scanner.beam = e; }, (t) => t);
    scanner.beam = 0;
    await wait(140);
    await tween(240, (e) => { scanner.lid = 1 - e; });
    p.kind = "converted";
    toast("✓ CONVERTED — DOCX · 0 BYTES LEFT THIS TAB");
    const out = outTray();
    await tween(520, (e) => {
      p.x = lerp(cx, out.x + out.w / 2, e);
      p.y = lerp(cy, out.y + out.h / 2, e);
      p.rot = lerp(0, 0.08, e);
    });
    p.state = "idle";
    scanner.busy = false;
  }

  async function shredSequence(p) {
    p.state = "busy";
    shredder.busy = true;
    const slot = shredderSlot();
    const cx = slot.x + slot.w / 2, cy = slot.y + 6;
    toast("SHREDDING — PURGING CONTENT STREAM…");
    const x0 = p.x, y0 = p.y, r0 = p.rot;
    await tween(360, (e) => {
      p.x = lerp(x0, cx, e);
      p.y = lerp(y0, cy, e);
      p.rot = lerp(r0, 0, e);
      p.alpha = 1 - e * 0.55;
    });
    await tween(300, (e) => { p.alpha = 0.45 * (1 - e); p.y = cy + e * 26; });
    papers.splice(papers.indexOf(p), 1);    /* spawn strips */
    const n = 9;
    for (let i = 0; i < n; i++) {
      shredder.strips.push({
        x: slot.x + 14 + (i / (n - 1)) * (slot.w - 28) + rand(-3, 3),
        y: slot.y + 10,
        vy: rand(0.04, 0.10),
        vr: rand(-0.02, 0.02),
        rot: rand(-0.4, 0.4),
        w: rand(7, 11),
        len: rand(52, 96),
        mint: p.kind === "converted" && i % 3 === 0,
        floor: shredder.y + shredder.h - 26 - rand(0, 26)
      });
    }
    await wait(500);
    toast("✓ PURGED — RE-PARSED · VERIFIED ABSENT");
    shredder.busy = false;
    /* respawn a fresh page at the tray shortly after (manual shredding only —
       the auto showcase uses its own ephemeral pages) */
    if (!p.auto) {
      setTimeout(() => {
        const p2 = makePaper(tray.x + rand(30, 150), tray.y - rand(8, 30), { rot: rand(-0.05, 0.05) });
        p2.alpha = 0;
        tween(500, (e) => { p2.alpha = e; });
      }, 1100);
    }
  }

  function stampOnPaper(stamp, paper) {
    paper.stamped = true;
    stamp.press = 1;
    tween(260, (e) => { stamp.press = 1 - e; });
    toast("✓ SIGNED — SHA-256 STAMP APPLIED LOCALLY");
  }

  function pointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
    drag.lastX = e.clientX; drag.lastY = e.clientY; drag.lastT = performance.now(); drag.vx = 0;

    /* paper? */
    const p = paperAt(wx, wy);
    if (p) {
      drag.mode = "paper";
      drag.obj = p;
      p.held = true;
      p.state = "held";
      p.vx = 0;
      drag.dx = wx - p.x; drag.dy = wy - p.y;
      canvas.classList.add("grabbing");
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    /* stamp tool? */
    if (Math.abs(wx - stampTool.x) < 46 && Math.abs(wy - stampTool.y) < 40) {
      drag.mode = "stamp";
      drag.obj = stampTool;
      stampTool.held = true;
      drag.dx = wx - stampTool.x; drag.dy = wy - stampTool.y;
      canvas.classList.add("grabbing");
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    /* cabinet drawers? */
    if (!cabinetOpenHit(wx, wy)) {
      /* fall through to scroll-drag */
    }
    /* board tags? */
    if (boardTagHit(wx, wy)) {
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    /* otherwise: drag the camera */
    drag.mode = "scroll";
    drag.obj = null;
    canvas.setPointerCapture(e.pointerId);
  }

  function cabinetOpenHit(wx, wy) {
    const { x, y, w, h } = cabinet;
    if (!inRect(wx, wy, x, y, w, h)) return false;
    const idx = clamp(Math.floor((wy - (y + 12)) / 108), 0, 2);
    const d = cabinet.drawers[idx];
    d.target = d.target > 0.5 ? 0 : 1;
    toast(d.target > 0.5 ? "DRAWER OPEN — TOOLS LIVE INSIDE" : "DRAWER CLOSED");
    return true;
  }

  function boardTagHit(wx, wy) {
    const { x, y, w, h } = board;
    if (!inRect(wx, wy, x, y, w, h)) return false;
    const cx = x + w / 2, cy = y + h / 2 - 7;
    const dx = wx - cx, dy = wy - cy;
    if (Math.hypot(dx, dy) < 50) { toast("PDF — THE ONE CORE · PDF/A ARCHIVE INSIDE"); return true; }
    for (const s of boardSlots()) {
      const halfW = s.archive ? 50 : 41;
      if (Math.abs(wx - s.x) < halfW && Math.abs(wy - s.y) < 19) {
        const tag = boardTags[s.i];
        tag.wig = 1;
        tween(900, (e) => { tag.wig = 1 - e; });
        return true;
      }
    }
    return false;
  }

  function pointerMove(e) {
    if (!drag.mode) { hoverCursor(e); return; }
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);

    if (drag.mode === "scroll") {
      const dyPx = e.clientY - drag.lastY;
      window.scrollBy(0, -dyPx);
    } else if (drag.mode === "paper") {
      const p = drag.obj;
      const nvx = (e.clientX - drag.lastX) / dt;
      p.vx = lerp(p.vx, nvx, 0.5);
      p.x = wx - drag.dx;
      p.y = wy - drag.dy;
      /* clamp to world */
      p.x = clamp(p.x, 70, WORLD_W - 70);
    } else if (drag.mode === "stamp") {
      stampTool.x = clamp(wx - drag.dx, 70, WORLD_W - 70);
      stampTool.y = wy - drag.dy;
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    drag.lastT = now;
  }

  function hoverCursor(e) {
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
    const overPaper = papers.some((p) => p.state === "idle" &&
      Math.abs(wx - p.x) < p.w / 2 + 8 && Math.abs(wy - p.y) < p.h / 2 + 8) ||
      (stack && stack.count > 0 && Math.abs(wx - stack.x) < 84 && Math.abs(wy - stack.y) < 106);
    const overStamp = Math.abs(wx - stampTool.x) < 46 && Math.abs(wy - stampTool.y) < 40;
    const overDrawer = inRect(wx, wy, cabinet.x, cabinet.y, cabinet.w, cabinet.h);
    const overBoard = inRect(wx, wy, board.x, board.y, board.w, board.h);
    canvas.classList.toggle("grabbable", overPaper || overStamp);
    canvas.classList.toggle("pointable", !overPaper && !overStamp && (overDrawer || overBoard));
  }

  function pointerUp(e) {
    if (!drag.mode) return;
    const obj = drag.obj;
    if (drag.mode === "paper" && obj) {
      obj.held = false;
      obj.state = "idle";
      const { x: wx, y: wy } = obj;
      const bed = scannerBed();
      const slot = shredderSlot();
      if (!scanner.busy && inRect(wx, wy, bed.x - 10, bed.y - 10, bed.w + 20, bed.h + 20)) {
        scanSequence(obj);
      } else if (!shredder.busy && inRect(wx, wy, slot.x - 14, slot.y - 14, slot.w + 28, slot.h + 20)) {
        shredSequence(obj);
      } else {
        obj.rot = rand(-0.05, 0.05);
      }
    } else if (drag.mode === "stamp" && obj) {
      obj.held = false;
      const { x: wx, y: wy } = obj;
      const target = papers.find((p) =>
        p.state === "idle" &&
        Math.abs(wx - p.x) < p.w / 2 + 12 && Math.abs(wy - p.y) < p.h / 2 + 12);
      if (target && !target.stamped) stampOnPaper(obj, target);
    }
    drag.mode = null;
    drag.obj = null;
    canvas.classList.remove("grabbing");
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }

  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);

  /* ── silk scrolling: wheel input is eased exponentially (Lenis-style) ── */
  const smoothScroll = { enabled: !reduceMotion, t: 0, c: 0, active: false, programmaticUntil: 0 };
  const maxScrollY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (smoothScroll.enabled) {
    let lastStep = 0;
    const smoothStep = (now) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - (lastStep || now - 16)) / 1000));
      lastStep = now;
      const diff = smoothScroll.t - smoothScroll.c;
      if (Math.abs(diff) < 0.7) {
        smoothScroll.c = smoothScroll.t;
        window.scrollTo(0, Math.round(smoothScroll.c));
        smoothScroll.active = false;
        smoothScroll.programmaticUntil = performance.now() + 90;
        return;
      }
      smoothScroll.c += diff * (1 - Math.pow(0.0012, dt));
      smoothScroll.programmaticUntil = performance.now() + 70;
      window.scrollTo(0, Math.round(smoothScroll.c));
      requestAnimationFrame(smoothStep);
    };
    window.addEventListener("wheel", (e) => {
      if (e.ctrlKey) return;                       // pinch-zoom stays native
      e.preventDefault();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33;             // lines
      else if (e.deltaMode === 2) dy *= window.innerHeight; // pages
      smoothScroll.t = clamp(smoothScroll.t + dy, 0, maxScrollY());
      if (!smoothScroll.active) {
        smoothScroll.c = window.scrollY;
        smoothScroll.active = true;
        lastStep = 0;
        requestAnimationFrame(smoothStep);
      }
    }, { passive: false });
  }
  window.addEventListener("scroll", () => {
    if (smoothScroll.enabled && performance.now() < smoothScroll.programmaticUntil) return;
    if (smoothScroll.enabled) { smoothScroll.t = smoothScroll.c = window.scrollY; smoothScroll.active = false; }
    cam.ty = camMax() * scrollProgress();
    if (reduceMotion) cam.y = cam.ty;
  }, { passive: true });

  /* ── render loop ────────────────────────────────────────────────────── */
  let lastT = performance.now();
  let chromeState = { cta: false, footer: false, hint: true };
  let frameCount = 0;

  function frame(now) {
    try {
      frameTick(now);
    } catch (err) {
      dlog("FRAME ERROR: " + (err && err.message || err));
      /* keep the loop alive but stop advancing broken state */
    }
    requestAnimationFrame(frame);
  }

  /* Simulation (camera, tweens, physics, chrome) — deliberately separate from
     drawing so interactions keep working when rAF is throttled (hidden tab). */
  function simulate(dt, t) {
    /* camera follows scroll — near-direct when wheel-smoothing is active */
    cam.ty = camMax() * scrollProgress();
    const followK = smoothScroll.enabled ? 1e-6 : 0.001;
    cam.y = reduceMotion ? cam.ty : lerp(cam.y, cam.ty, 1 - Math.pow(followK, dt));

    /* cabinet drawer springs */
    cabinet.drawers.forEach((d) => { d.open = lerp(d.open, d.target, reduceMotion ? 1 : 1 - Math.pow(0.0008, dt)); });

    /* strips physics */
    for (const st of shredder.strips) {
      if (st.y < st.floor) {
        st.vy += 2.4 * dt;
        st.y += st.vy * dt * 60;
        st.rot += st.vr;
        if (st.y >= st.floor) st.y = st.floor;
      }
    }
    if (shredder.strips.length > 64) shredder.strips.splice(0, shredder.strips.length - 64);

    /* idle wobble for held papers */
    for (const p of papers) {
      if (p.held) p.rot = lerp(p.rot, clamp(p.vx * 0.6, -0.18, 0.18), 0.2);
    }

    updateTweens(dt * 1000);

    /* auto-choreography: a zone performs when it scrolls into view */
    const visH = vh / s;
    const userBusy = papers.some((p) => p.held) || stampTool.held;
    const nowMs = performance.now();
    for (const z of autoZones) {
      const inView = z.y > cam.y - 160 && z.y < cam.y + visH + 160;
      if (!inView) {
        z.outSince = z.outSince || nowMs;
        z.wasInView = false;
        z.active = false;
        continue;
      }
      /* must have been fully out of view for a beat before it may play again
         (a zone that has never played needs no dwell) */
      const dwellOk = !z.lastPlay || (z.outSince && nowMs - z.outSince > 1200);
      z.outSince = null;
      z.active = true;
      if (dwellOk && !z.wasInView && !z.playing && !userBusy && nowMs > z.cool) {
        z.playing = true;
        z.wasInView = true;
        z.lastPlay = nowMs;
        Promise.resolve(z.run()).catch(() => {}).finally(() => {
          z.playing = false;
          z.cool = performance.now() + 3200;
        });
      }
      z.wasInView = true;
    }
    /* ambient: pinboard tags twitch while the tools zone is on stage */
    if (autoZones[2].active) {
      pinWiggleT += dt;
      if (pinWiggleT > 1.35) {
        pinWiggleT = 0;
        const tag = boardTags[(Math.random() * boardTags.length) | 0];
        if (tag.wig < 0.2) {
          tag.wig = 1;
          tween(900, (e) => { tag.wig = 1 - e; });
        }
      }
    } else {
      pinWiggleT = 0;
    }
    /* ambient: the severed cable's sticky sways while the proof zone is on stage */
    const proofOn = autoZones[3].active;
    for (const st of stickies) st.sway = proofOn && st.c === "#F7E9A0" && stickies.indexOf(st) === stickies.length - 1;
    const prog = scrollProgress();
    const wantCta = prog > 0.10;
    const wantFooter = prog > 0.88;
    const wantHint = prog < 0.02;
    if (wantCta !== chromeState.cta) { chromeState.cta = wantCta; ctaEl && ctaEl.classList.toggle("show", wantCta); }
    if (wantFooter !== chromeState.footer) { chromeState.footer = wantFooter; footerEl && footerEl.classList.toggle("show", wantFooter); }
    if (wantHint !== chromeState.hint) { chromeState.hint = wantHint; hintEl && hintEl.classList.toggle("gone", !wantHint); }
  }

  function frameTick(now) {
    frameCount++;
    lastFrameAt = now;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const t = now / 1000;

    simulate(dt, t);

    /* ── draw ── */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.setTransform(DPR * s, 0, 0, DPR * s, offX * DPR, -cam.y * s * DPR);

    drawBase(ctx);
    drawZoneCaptions(ctx);
    drawTitle(ctx);
    drawSignOff(ctx);
    if (decor) drawDecor(ctx);
    for (const st of stickies) drawSticky(ctx, st, t);
    drawTray(ctx);
    drawScanner(ctx, t);
    drawShredder(ctx);
    drawCabinet(ctx);
    drawBoard(ctx, t);
    drawCable(ctx, t);
    drawStack(ctx);
    for (const p of papers) drawPaperSheet(ctx, p);
    drawStamp(ctx);

    /* screen-space overlays: vignette + grain */
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.42, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
    if (!grainPattern) grainPattern = ctx.createPattern(grainTile, "repeat");
    ctx.fillStyle = grainPattern;
    ctx.fillRect(0, 0, vw, vh);
  }

  /* Keep interactions alive when rAF is throttled (hidden tab / backgrounded pane):
     the simulation advances on an interval even when drawing is paused. */
  let lastSim = performance.now();
  let lastFrameAt = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.3, (now - lastSim) / 1000);
    lastSim = now;
    if (now - lastFrameAt > 260) {
      try { simulate(dt, now / 1000); } catch { /* keep the interval alive */ }
    }
  }, 180);

  window.addEventListener("resize", () => { dlog(`resize vw=${window.innerWidth} vh=${window.innerHeight}`); resize(); });
  resize();
  requestAnimationFrame(frame);

  /* QA hook: live world state (harmless in production) */
  window.__desk = {
    get papers() { return papers.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), kind: p.kind, state: p.state, stamped: !!p.stamped })); },
    get scanner() { return { ...scanner }; },
    get shredder() { return { busy: shredder.busy, strips: shredder.strips.length }; },
    get cam() { return { y: Math.round(cam.y), max: Math.round(camMax()) }; },
    get scale() { return { s, offX, compact }; },
    get log() { return debugLog.slice(); },
    get frames() { return frameCount; }
  };
})();
