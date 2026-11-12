/* ══════════════════════════════════════════════════════════════════════
   LOCAL DESK — LANDING PAGE INTERACTIONS
   Particle document ⇄ vault morph · reveals · count-ups · terminal
   redaction demo · hash scramble · spotlight cards · magnetic buttons
   ══════════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── 0a. Fresh loads always start at the top ───────────────────────── */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  /* ── 0. Demo links: work both from the dev server and from file:// ── */
  const isFileProto = location.protocol === "file:";
  document.querySelectorAll("[data-demo-link]").forEach((a) => {
    if (isFileProto) a.href = "http://localhost:3000/demo/";
    a.addEventListener("click", (e) => {
      if (isFileProto) {
        e.preventDefault();
        window.open("http://localhost:3000/demo/", "_blank", "noopener");
      }
    });
  });

  /* ── 1. Nav: scrolled state + mobile burger ───────────────────────── */
  const nav = document.getElementById("siteNav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const burger = document.getElementById("navBurger");
  if (burger) {
    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("menu-open");
      burger.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll(".nav-links a, .nav-cta a").forEach((a) =>
      a.addEventListener("click", () => {
        nav.classList.remove("menu-open");
        burger.setAttribute("aria-expanded", "false");
      })
    );
  }

  /* ── 2. Reveal on scroll ──────────────────────────────────────────── */
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      }
    },
    { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* ── 3. Marquee: duplicate track for a seamless loop ──────────────── */
  const track = document.getElementById("marqueeTrack");
  if (track) track.innerHTML += track.innerHTML;

  /* ── 4. Count-up stats ────────────────────────────────────────────── */
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const countIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const el = en.target;
        countIO.unobserve(el);
        const target = parseInt(el.dataset.count || "0", 10);
        if (reduceMotion) { el.textContent = String(target); return; }
        const t0 = performance.now();
        const dur = 1400;
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          el.textContent = String(Math.round(easeOut(p) * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.6 }
  );
  document.querySelectorAll("[data-count]").forEach((el) => countIO.observe(el));

  /* ── 5. Signature hash scramble ───────────────────────────────────── */
  const hashEl = document.getElementById("sigHash");
  if (hashEl && !reduceMotion) {
    const finalHash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
    let hex = "0123456789abcdef";
    let scrambleTick = 0;
    setInterval(() => {
      scrambleTick++;
      if (scrambleTick % 12 < 7) {
        let s = "";
        for (let i = 0; i < 20; i++) s += hex[(Math.random() * 16) | 0];
        hashEl.textContent = s + "…";
      } else {
        hashEl.textContent = finalHash.slice(0, 20) + "…";
      }
    }, 90);
  }

  /* ── 6. Spotlight cards (cursor-tracking glow) ────────────────────── */
  document.querySelectorAll(".spotlight").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
  });

  /* ── 7. Magnetic primary buttons ──────────────────────────────────── */
  if (!reduceMotion) {
    document.querySelectorAll(".magnetic").forEach((btn) => {
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${dx * 0.12}px, ${dy * 0.22 - 2}px)`;
      });
      btn.addEventListener("pointerleave", () => { btn.style.transform = ""; });
    });
  }

  /* ── 8. Interactive redaction demo ────────────────────────────────── */
  const redactBtn = document.getElementById("redactBtn");
  const resetBtn = document.getElementById("redactReset");
  const report = document.getElementById("redactReport");
  const piis = Array.from(document.querySelectorAll(".pii[data-redact]"));

  const runRedaction = () => {
    if (!piis.length) return;
    redactBtn.disabled = true;
    report.textContent = "";
    piis.forEach((pii, i) => {
      setTimeout(() => pii.classList.add("burned"), 260 + i * 340);
    });
    const lines = [
      "→ intercepting content stream operators…",
      `→ purged ${piis.length} string(s) — literal + hex <Tj/TJ> forms`,
      "✓ re-parsed export — verified absent. report attached."
    ];
    lines.forEach((ln, i) => {
      setTimeout(() => { report.textContent += (i ? "\n" : "") + ln; }, 900 + i * 700);
    });
    setTimeout(() => {
      redactBtn.hidden = true;
      resetBtn.hidden = false;
    }, 900 + lines.length * 700);
  };
  const resetRedaction = () => {
    piis.forEach((p) => p.classList.remove("burned"));
    report.textContent = "";
    resetBtn.hidden = true;
    redactBtn.hidden = false;
    redactBtn.disabled = false;
  };
  if (redactBtn) redactBtn.addEventListener("click", runRedaction);
  if (resetBtn) resetBtn.addEventListener("click", resetRedaction);
  // bonus: clicking an individual PII burns just that one
  piis.forEach((pii) =>
    pii.addEventListener("click", () => {
      if (!pii.classList.contains("burned") && !redactBtn.disabled) pii.classList.add("burned");
    })
  );

  /* ── 9. Offline audit terminal (typed) ────────────────────────────── */
  const term = document.getElementById("termBody");
  if (term) {
    const script = [
      { text: "$ localdesk --audit\n", cls: "cmd", pause: 350 },
      { text: "network requests ........ ", cls: "", val: "0" },
      { text: "cloud uploads ........... ", cls: "", val: "0" },
      { text: "telemetry endpoints ..... ", cls: "", val: "0" },
      { text: "ocr engine .............. ", cls: "", val: "bundled WASM (eng.traineddata.gz)" },
      { text: "signing ................. ", cls: "", val: "SHA-256 verified on export" },
      { text: "storage ................. ", cls: "", val: "local memory only — closing the tab clears it" },
      { text: "\nresult: ", cls: "cmd" },
      { text: "NOTHING EVER LEFT THIS MACHINE — OK", cls: "val", pause: 80 },
      { text: "\n\n" }
    ];
    let started = false;
    const typeAll = () => {
      if (started) return;
      started = true;
      if (reduceMotion) {
        term.innerHTML =
          '<span class="cmd">$ localdesk --audit</span>\n' +
          script.slice(1, -1).map((s) =>
            s.text.replace(/\.\.\.\..*$/, "") +
            (s.val ? `<span class="val">${s.val}</span>\n` : "")
          ).join("").replace(/\n\nresult: .*$/, "\n\n") +
          'result: <span class="val">NOTHING EVER LEFT THIS MACHINE — OK</span><span class="cursor"></span>';
        return;
      }
      let idx = 0;
      const nextLine = () => {
        if (idx >= script.length) {
          term.innerHTML += '<span class="cursor"></span>';
          return;
        }
        const line = script[idx++];
        const span = document.createElement("span");
        span.className = line.cls || "";
        term.appendChild(span);
        const value = line.val;
        const label = line.text;
        let ci = 0;
        const typeChar = () => {
          if (ci < label.length) {
            span.textContent += label[ci++];
            setTimeout(typeChar, line.cls === "cmd" ? 26 : 6);
          } else if (value !== undefined) {
            const v = document.createElement("span");
            v.className = "val";
            v.textContent = value;
            span.appendChild(v);
            term.appendChild(document.createTextNode("\n"));
            setTimeout(nextLine, line.pause || 140);
          } else {
            setTimeout(nextLine, line.pause || 140);
          }
        };
        typeChar();
      };
      nextLine();
    };
    const termIO = new IntersectionObserver(
      (en) => { if (en[0].isIntersecting) { termIO.disconnect(); typeAll(); } },
      { threshold: 0.35 }
    );
    termIO.observe(term);
  }

  /* ── 10. Hero particle morph: document ⇄ shield ⇄ padlock ─────────── */
  const canvas = document.getElementById("heroCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  // --- shape sampling via offscreen canvas masks -------------------------
  const MAX = 720;
  const sampleShape = (draw) => {
    const off = document.createElement("canvas");
    off.width = 400; off.height = 400;
    const c = off.getContext("2d");
    c.fillStyle = "#fff";
    c.strokeStyle = "#fff";
    draw(c);
    const img = c.getImageData(0, 0, 400, 400).data;
    const pts = [];
    const step = 4;
    for (let y = 0; y < 400 && pts.length < MAX; y += step) {
      for (let x = 0; x < 400 && pts.length < MAX; x += step) {
        if (img[(y * 400 + x) * 4 + 3] > 128) {
          pts.push({ x: x / 400, y: y / 400 });
        }
      }
    }
    // shuffle for organic morph
    for (let i = pts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [pts[i], pts[j]] = [pts[j], pts[i]];
    }
    return pts;
  };

  const SHAPES = [];

  const buildShapes = () => {
    // DOCUMENT: page with folded corner + text lines
    SHAPES.push(sampleShape((c) => {
      const s = 250, ox = 75, oy = 55, fold = 46;
      c.beginPath();
      c.moveTo(ox, oy);
      c.lineTo(ox + s - fold, oy);
      c.lineTo(ox + s, oy + fold);
      c.lineTo(ox + s, oy + s);
      c.lineTo(ox, oy + s);
      c.closePath();
      c.lineWidth = 14; c.stroke();
      c.save();
      c.translate(ox, oy);
      c.fillRect(s - fold, 0, fold, fold);
      c.restore();
      c.lineWidth = 10; c.lineCap = "round";
      const rows = [40, 78, 116, 154];
      const widths = [150, 190, 120, 165];
      rows.forEach((ry, i) => {
        c.beginPath();
        c.moveTo(ox + 34, oy + ry + 26);
        c.lineTo(ox + 34 + widths[i], oy + ry + 26);
        c.stroke();
      });
    }));

    // SHIELD with check
    SHAPES.push(sampleShape((c) => {
      const cx = 200, top = 70, w = 190, bot = 330;
      c.beginPath();
      c.moveTo(cx, top);
      c.bezierCurveTo(cx + w * 0.55, top + 26, cx + w * 0.62, top + 60, cx + w * 0.5, top + 120);
      c.bezierCurveTo(cx + w * 0.42, top + 190, cx + w * 0.18, top + 226, cx, bot);
      c.bezierCurveTo(cx - w * 0.18, top + 226, cx - w * 0.42, top + 190, cx - w * 0.5, top + 120);
      c.bezierCurveTo(cx - w * 0.62, top + 60, cx - w * 0.55, top + 26, cx, top);
      c.closePath();
      c.lineWidth = 14; c.stroke();
      c.lineWidth = 16; c.lineCap = "round"; c.lineJoin = "round";
      c.beginPath();
      c.moveTo(cx - 52, 178);
      c.lineTo(cx - 12, 218);
      c.lineTo(cx + 58, 142);
      c.stroke();
    }));

    // PADLOCK
    SHAPES.push(sampleShape((c) => {
      c.lineWidth = 14;
      c.beginPath();
      c.arc(200, 148, 62, Math.PI, 0);
      c.stroke();
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(138, 148); c.lineTo(138, 190); c.stroke();
      c.beginPath();
      c.moveTo(262, 148); c.lineTo(262, 190); c.stroke();
      const bx = 108, by = 190, bw = 184, bh = 150, r = 22;
      c.beginPath();
      c.moveTo(bx + r, by);
      c.arcTo(bx + bw, by, bx + bw, by + bh, r);
      c.arcTo(bx + bw, by + bh, bx, by + bh, r);
      c.arcTo(bx, by + bh, bx, by, r);
      c.arcTo(bx, by, bx + bw, by, r);
      c.closePath();
      c.lineWidth = 13; c.stroke();
      c.beginPath();
      c.arc(200, 250, 17, 0, Math.PI * 2);
      c.fill();
      c.fillRect(193, 256, 14, 34);
    }));
  };
  buildShapes();

  // particle state
  const particles = [];
  for (let i = 0; i < MAX; i++) {
    particles.push({
      x: Math.random(), y: Math.random(),
      tx: Math.random(), ty: Math.random(),
      sx: Math.random(), sy: Math.random(),
      size: 1.1 + Math.random() * 1.9,
      delay: Math.random(),
      seed: Math.random() * Math.PI * 2
    });
  }

  let shapeIdx = 0;
  let morphT = 1;              // 0..1 progress of current morph
  let fromShape = SHAPES[0];
  let toShape = SHAPES[0];

  const retarget = (nextIdx) => {
    fromShape = particles.map((p) => ({ x: p.tx, y: p.ty })); // freeze current
    shapeIdx = nextIdx % SHAPES.length;
    toShape = SHAPES[shapeIdx];
    morphT = 0;
    particles.forEach((p, i) => {
      const src = fromShape[i % fromShape.length] || fromShape[0];
      const dst = toShape[i % toShape.length] || toShape[0];
      p.sx = src.x; p.sy = src.y;
      p.tx = dst.x; p.ty = dst.y;
      p.delay = (i / particles.length) * 0.35 + Math.random() * 0.15;
    });
  };
  retarget(0);
  // settle initial state instantly at t=1 for a formed first paint
  morphT = 1;

  const mouse = { x: -1e4, y: -1e4, active: false };
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true;
  });
  canvas.addEventListener("pointerleave", () => { mouse.active = false; mouse.x = -1e4; mouse.y = -1e4; });
  canvas.addEventListener("click", () => retarget(shapeIdx + 1));

  // glow sprite for cheap rendering
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 32;
  {
    const sc = sprite.getContext("2d");
    const g = sc.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(167,243,208,1)");
    g.addColorStop(0.35, "rgba(52,211,153,0.85)");
    g.addColorStop(1, "rgba(16,185,129,0)");
    sc.fillStyle = g;
    sc.fillRect(0, 0, 32, 32);
  }

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (morphT < 1) morphT = Math.min(1, morphT + dt * 0.55);

    const cx = W / 2, cy = H / 2;
    const span = Math.min(W, H) * 0.66;

    for (const p of particles) {
      // eased per-particle morph with stagger
      const local = Math.max(0, Math.min(1, (morphT - p.delay) / (1 - p.delay + 0.0001)));
      const e = easeOut(local);
      let px = (p.sx + (p.tx - p.sx) * e);
      let py = (p.sy + (p.ty - p.sy) * e);

      // gentle organic float
      const t = now / 1000;
      px += Math.sin(t * 0.9 + p.seed) * 0.004;
      py += Math.cos(t * 0.8 + p.seed * 1.3) * 0.004;

      let sx = cx + (px - 0.5) * span;
      let sy = cy + (py - 0.5) * span;

      // mouse repulsion
      if (mouse.active) {
        const dx = sx - mouse.x, dy = sy - mouse.y;
        const d2 = dx * dx + dy * dy;
        const R = 74;
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = ((R - d) / R) * 26;
          sx += (dx / d) * push;
          sy += (dy / d) * push;
        }
      }

      const tw = 0.65 + 0.35 * Math.sin(t * 2.2 + p.seed * 3);
      const s = p.size * (1 + 0.4 * (1 - e)); // particles flare while traveling
      ctx.globalAlpha = 0.5 * tw + 0.3;
      ctx.drawImage(sprite, sx - s * 2, sy - s * 2, s * 4, s * 4);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  };

  if (reduceMotion) {
    // draw one static formed shape, no loop
    morphT = 1;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const cx = W / 2, cy = H / 2, span = Math.min(W, H) * 0.66;
    for (const p of particles) {
      const px = p.tx, py = p.ty;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(sprite, cx + (px - 0.5) * span - 4, cy + (py - 0.5) * span - 4, 8, 8);
    }
    ctx.globalAlpha = 1;
  } else {
    requestAnimationFrame(frame);
  }

  /* ── 11. Footer year ──────────────────────────────────────────────── */
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
