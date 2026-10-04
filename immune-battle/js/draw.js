// draw.js — drawing the micro view (background, tissue, every kind of cell / particle, effects, labels).
// Colour rule: enemies (virus, bacteria, and cells taken over by the virus) are warm red–orange with a faint red halo;
// allies (immune cells, antibodies, complement, interferon shield) are cool blue–cyan; the body's own tissue is muted
// skin tones; medicine is lime green. See PAL.
'use strict';

const PAL = {
  virus:'#ff4f7b', virusDark:'#7a2346', ha:'#ff9db5', na:'#ffd0a0', bact:'#ff9a2e', bactWall:'#b8561a', takenOver:'#d0588c',
  mac:'#4fb3d9', neu:'#bcdcff', nk:'#38cfc4', ctl:'#4d7dff', th:'#86a9ff', dc:'#8f8cff', pc:'#6f9cff', ab:'#cdefff', comp:'#7fe6ff', shield:'#5ad1ff',
  cell:'#e6cbc6', nucleus:'#806b74', goblet:'#ece0cf', rbc:'#8e3a44', pus:'#cfc79a', fibro:'#bfa397', drug:'#a6e86b',
};
const TEAM_HALO = 'rgba(255,60,90,';

// ---------- background (drawn once per resize) ----------
function renderBackground() {
  const c = document.createElement('canvas'); c.width = MI.cv.width; c.height = MI.cv.height;
  const g = c.getContext('2d'), s = MI.sc, W = MI.W, R = mulberry(3);
  g.scale(s, s);
  if (MI.scene === 'flu') {
    let gr = g.createLinearGradient(0, 0, 0, LF.GEL);
    gr.addColorStop(0, '#0b131b'); gr.addColorStop(1, '#13202a');
    g.fillStyle = gr; g.fillRect(0, 0, W, LF.TOP);
    gr = g.createLinearGradient(0, LF.BM, 0, 100);
    gr.addColorStop(0, '#33252a'); gr.addColorStop(1, '#241a1e');
    g.fillStyle = gr; g.fillRect(0, LF.BOT, W, 100 - LF.BOT);
    fibers(g, R, W, LF.BM + 2, LF.CAP - 7, '#5d4248');
    g.fillStyle = '#9d8a8f'; g.fillRect(0, LF.BM - 0.6, W, 1.2);          // basement membrane
  } else {
    g.fillStyle = '#0f141a'; g.fillRect(0, 0, W, LS.SC);
    let gr = g.createLinearGradient(0, LS.DER, 0, 100);
    gr.addColorStop(0, '#3b2a2d'); gr.addColorStop(1, '#271b1e');
    g.fillStyle = gr; g.fillRect(0, LS.DER, W, 100 - LS.DER);
    fibers(g, R, W, LS.DER + 2, LS.CAP - 7, '#644a4f');
    // stratum corneum: flat dead layers
    g.fillStyle = '#c4b29c'; g.fillRect(0, LS.SC, W, LS.EPI - LS.SC);
    g.strokeStyle = 'rgba(80,60,40,.5)'; g.lineWidth = 0.25;
    for (let y = LS.SC + 1; y < LS.EPI; y += 1.1) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 6) g.lineTo(x, y + Math.sin(x * 0.3 + y) * 0.2); g.stroke(); }
    // epidermis: keratinocytes in rows (flatter toward the top)
    for (let row = 0; row < 4; row++) {
      const y0 = LS.EPI + row * 4.5, h = 4.3, w = 8 - row * 0.8;
      for (let x = -R() * w; x < W; x += w) {
        g.fillStyle = `hsl(${24 + row * 2},${22 + row * 4}%,${70 - row * 5}%)`;
        rrect(g, x + 0.25, y0 + 0.25, w - 0.5, h - 0.5, 1.4); g.fill();
        g.fillStyle = 'rgba(110,80,80,.55)'; g.beginPath(); g.ellipse(x + w / 2, y0 + h / 2, w * 0.18, h * 0.22, 0, 0, 7); g.fill();
      }
    }
    g.fillStyle = '#9d8a8f'; g.fillRect(0, LS.DER - 0.5, W, 1);
    // the cut: a wedge through the skin, filled with clot (fibrin mesh and trapped red cells)
    const cx = woundX();
    g.beginPath(); g.moveTo(cx - 9, LS.SC - 0.5); g.lineTo(cx + 9, LS.SC - 0.5); g.lineTo(cx + 2, 52); g.lineTo(cx - 2, 52); g.closePath();
    g.fillStyle = '#3e1d22'; g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(230,210,180,.3)'; g.lineWidth = 0.25;
    for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(cx + rnd(-10, 10), rnd(10, 52)); g.lineTo(cx + rnd(-10, 10), rnd(10, 52)); g.stroke(); }
    g.fillStyle = 'rgba(150,60,70,.7)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(cx + rnd(-6, 6), rnd(16, 44), 2.2, 1.5, rnd(0, 3), 0, 7); g.fill(); }
    g.restore();
  }
  return c;
}
function fibers(g, R, W, y0, y1, col) {
  g.strokeStyle = col; g.lineWidth = 0.45; g.globalAlpha = 0.55;
  for (let i = 0; i < W / 3; i++) {
    const y = y0 + R() * (y1 - y0), x = R() * W, L = 12 + R() * 22, a = (R() - 0.5) * 0.5;
    g.beginPath(); g.moveTo(x, y);
    g.bezierCurveTo(x + L * 0.33, y + Math.sin(a) * L + 2 * (R() - 0.5), x + L * 0.66, y - 2 * (R() - 0.5), x + L, y + Math.sin(a) * L * 0.5);
    g.stroke();
  }
  g.globalAlpha = 1;
}
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = c => clamp(Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k), 0, 255);
  return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`;
}
function mix(h1, h2, k) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const m = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return '#' + ((1 << 24) + (m(16) << 16) + (m(8) << 8) + m(0)).toString(16).slice(1);
}

// ---------- frame ----------
function drawMicro() {
  const g = MI.ctx, s = MI.sc, W = MI.W, t = MI.now;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, MI.cv.width, MI.cv.height);
  if (MI.bg) g.drawImage(MI.bg, 0, 0);
  g.setTransform(s, 0, 0, s, 0, 0);
  const cap = MI.scene === 'flu' ? LF.CAP : LS.CAP;
  if (MI.inflam > 0.02) {                                 // inflammation: tissue reddens and swells with fluid
    g.fillStyle = `rgba(255,80,80,${0.14 * MI.inflam})`;
    const top = MI.scene === 'flu' ? LF.BM : LS.DER;
    g.fillRect(0, top, W, 100 - top);
  }
  drawCapillary(g, cap, W, t);
  drawLymph(g, W);
  if (MI.scene === 'flu') { drawEpithelium(g, t); drawMucus(g, W, t); }
  else drawDermis(g, t);
  const order = ['drug', 'pus', 'dc', 'pc', 'macB', 'neu', 'nk', 'ctl', 'th', 'bac', 'stuck', 'v', 'ab', 'macS'];
  for (const ty of order) for (const a of MI.agents) {
    const k = a.type === 'mac' ? (a.surf ? 'macS' : 'macB') : a.type;
    if (k === ty) drawAgent(g, a, t);
  }
  for (const f of MI.fx) drawFx(g, f, t);
  if (MI.labels) { drawLabels(g, W); if (MI.scene === 'flu') drawSteps(g); }
  if (MI.hover && MI.hover.a) {
    const a = MI.hover.a; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.35;
    g.beginPath(); g.arc(a.x, a.y, (a.r || 3) + 1.5, 0, 7); g.stroke();
  }
}

function drawCapillary(g, cy, W, t) {
  const r = MI.capR;
  g.fillStyle = '#4a1d24'; g.fillRect(0, cy - r, W, 2 * r);
  g.fillStyle = 'rgba(230,200,200,.45)'; g.fillRect(0, cy - r - 0.6, W, 0.8); g.fillRect(0, cy + r - 0.2, W, 0.8);
  for (const c of MI.rbc) {
    g.fillStyle = PAL.rbc; g.beginPath(); g.ellipse(c.x, cy + c.dy * r / 4, 3.6 * c.s, 1.5 * c.s, 0, 0, 7); g.fill();
    g.fillStyle = '#6e2a33'; g.beginPath(); g.ellipse(c.x, cy + c.dy * r / 4, 1.8 * c.s, 0.6 * c.s, 0, 0, 7); g.fill();
  }
  if (SIM.pk === 'staph' && SIM.o && SIM.o.blood > 0.05) {          // bacteria in the blood stream (bacteremia)
    const n = Math.round(SIM.o.blood * 10);
    for (let i = 0; i < n; i++) { const x = ((t * 9 + i * 37.3) % (W + 10)) - 5; staphBody(g, x, cy + Math.sin(i * 2.1) * r * 0.5, 0.9, 1); }
  }
}
function drawLymph(g, W) {
  const x = W - 6, y0 = MI.scene === 'flu' ? LF.BM + 1 : LS.DER + 1;
  g.fillStyle = 'rgba(200,230,240,.07)'; g.fillRect(x - 3, y0, 6, 100 - y0);
  g.strokeStyle = 'rgba(200,230,240,.3)'; g.lineWidth = 0.4;
  g.beginPath(); g.moveTo(x - 3, y0); g.lineTo(x - 3, 100); g.moveTo(x + 3, y0); g.lineTo(x + 3, 100); g.stroke();
}

// ---------- airway epithelium ----------
function drawEpithelium(g, t) {
  const balo = MI.balo || 0;
  for (const z of MI.cells) {
    const x = z.x + 0.35, w = z.w - 0.7, top = LF.TOP, bot = LF.BOT, h = bot - top, cx = z.x + z.w / 2;
    let hh = h, take = 0, alpha = 1, swell = 0;
    switch (z.st) {
      case 'E': take = 0.25 * Math.min(1, z.tr + 0.3); break;
      case 'I': case 'doom': take = 0.6; swell = 1.4; break;
      case 'D':
        if (z.tr < 1) { alpha = 1 - z.tr; hh = h * (1 - 0.35 * z.tr); take = 0.3; } else alpha = 0;
        break;
      case 'U': if (z.regrow) hh = h * (0.25 + 0.75 * z.tr); break;
    }
    if (z.st === 'D') {                                  // remains of the cell (apoptotic bodies) left for macrophages
      g.fillStyle = 'rgba(170,140,150,.55)';
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + w * (0.2 + 0.2 * k), bot - 2 - (k % 2) * 2, 0.9, 0, 7); g.fill(); }
    }
    if (alpha <= 0) continue;
    g.globalAlpha = alpha;
    const y0 = bot - hh - swell;
    const base = z.goblet ? PAL.goblet : PAL.cell, col = take ? mix(base, PAL.takenOver, take) : base;
    const gr = g.createLinearGradient(0, y0, 0, bot);
    gr.addColorStop(0, col); gr.addColorStop(1, shade(col, -0.22));
    g.fillStyle = gr; rrect(g, x, y0, w, hh + swell, 2.2); g.fill();
    if (take) { g.fillStyle = `rgba(208,88,140,${0.35 * take})`; rrect(g, x, y0, w, hh + swell, 2.2); g.fill(); }
    if (z.st === 'R') {                                  // interferon has switched on antiviral defences: shield outline
      g.strokeStyle = PAL.shield; g.lineWidth = 0.6; rrect(g, x + 0.3, y0 + 0.3, w - 0.6, hh + swell - 0.6, 2); g.stroke();
    }
    if (z.goblet && (z.st === 'U' || z.st === 'R')) {    // goblet cell: cup full of mucus granules
      g.fillStyle = 'rgba(255,255,245,.55)';
      for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(cx + Math.sin(k * 2.1 + z.seed) * w * 0.25, y0 + 3 + (k % 4) * 2.2, 1.0, 0, 7); g.fill(); }
    }
    // nucleus; when infected, the viral genes (8 RNA pieces) are copied inside it
    const ny = bot - Math.min(9, hh * 0.32);
    g.fillStyle = PAL.nucleus; g.beginPath(); g.ellipse(cx, ny, w * 0.27, Math.min(4.5, hh * 0.16), 0, 0, 7); g.fill();
    if (z.st === 'E' || z.st === 'I' || z.st === 'doom') {
      const n = z.st === 'E' ? 3 + Math.floor(5 * Math.min(1, (MI.now - (z.t0 || 0)) / 3)) : 9;
      g.fillStyle = PAL.virus; g.globalAlpha = alpha * (1 - 0.75 * balo);
      for (let k = 0; k < n; k++) { g.beginPath(); g.arc(cx + Math.sin(k * 2.3 + z.seed) * w * 0.18, ny + Math.cos(k * 1.7 + z.seed) * 2.6, 0.38, 0, 7); g.fill(); }
      if (z.st !== 'E') {                                 // viral parts gather under the top membrane
        for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(x + w * (0.12 + 0.08 * k), y0 + 1.6 + Math.sin(k * 1.9 + t + z.seed) * 0.7, 0.3, 0, 7); g.fill(); }
      }
      g.globalAlpha = alpha;
    }
    if (z.st === 'I' || z.st === 'doom') {               // budding: new virions push out of the top membrane
      g.fillStyle = PAL.virus;
      const nb = Math.round(4 * (1 - 0.7 * balo));
      for (let k = 0; k < nb; k++) { const bx = x + w * (0.15 + 0.23 * k), ph = (t * 0.8 + k * 0.7 + z.seed) % 1; g.beginPath(); g.arc(bx, y0 + 0.3 - ph * 0.8, 0.9 * ph + 0.2, Math.PI, 0); g.fill(); }
    }
    // cilia (lost when the cell is taken over); the fast stroke pushes the mucus toward the throat (left)
    if (!z.goblet && (z.st === 'U' || z.st === 'R' || z.st === 'E')) {
      g.strokeStyle = 'rgba(236,214,214,.8)'; g.lineWidth = 0.32;
      for (let k = 0; k < 7; k++) {
        const bx = x + w * (0.08 + 0.14 * k), ph = Math.sin(t * 9 - z.i * 0.6 - k * 0.25), tip = -0.8 - 1.6 * ph;
        g.beginPath(); g.moveTo(bx, y0); g.quadraticCurveTo(bx + tip * 0.4, y0 - (y0 - LF.PCL) * 0.55, bx + tip, LF.PCL + 0.5 + Math.abs(ph) * 0.6); g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
}
function drawMucus(g, W, t) {
  // periciliary layer (watery) and the mucus gel riding on the cilia tips
  g.fillStyle = 'rgba(120,170,200,.07)'; g.fillRect(0, LF.PCL, W, LF.TOP - LF.PCL);
  g.fillStyle = 'rgba(180,205,160,.15)';
  g.beginPath(); g.moveTo(0, LF.PCL + 0.4);
  for (let x = 0; x <= W; x += 2) g.lineTo(x, LF.GEL + Math.sin((x + t * FLOW) * 0.12) * 1.1 + Math.sin((x + t * FLOW) * 0.05) * 0.8);
  g.lineTo(W, LF.PCL + 0.4); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(210,225,190,.22)'; g.lineWidth = 0.3;          // mucin strands
  for (const m of MI.mucins) { g.beginPath(); g.moveTo(m.x, m.y); g.quadraticCurveTo(m.x + m.L / 2, m.y + Math.sin(m.ph + t * 0.5) * 1.2, m.x + m.L * Math.cos(m.a), m.y + m.L * Math.sin(m.a) * 0.3); g.stroke(); }
}

// ---------- skin ----------
function drawDermis(g, t) {
  for (const f of MI.fibro) {
    const c = f.hurt;
    g.save(); g.translate(f.x, f.y); g.rotate(f.a);
    g.fillStyle = mix(PAL.fibro, '#6f6a6a', c); g.globalAlpha = 0.85 - 0.3 * c;
    g.beginPath(); g.ellipse(0, 0, f.len / 2, 1.4, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(90,60,60,.7)'; g.beginPath(); g.ellipse(0, 0, 1.8, 0.8, 0, 0, 7); g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(127,230,255,.5)';                                 // complement proteins in the tissue fluid
  for (const p of MI.specks) { g.beginPath(); g.arc(p.x + Math.sin(t * 0.7 + p.ph) * 2, p.y + Math.cos(t * 0.5 + p.ph) * 1.5, 0.35, 0, 7); g.fill(); }
  const pus = SIM.o ? SIM.o.pus || 0 : 0;
  if (pus > 0.2) {                                                       // abscess wall (fibrin)
    const s = SITE();
    g.strokeStyle = `rgba(235,215,160,${0.5 * pus})`; g.lineWidth = 1.2; g.setLineDash([1.5, 1]);
    g.beginPath(); g.ellipse(s.x, s.y + 1, 15, 10, 0, 0, 7); g.stroke(); g.setLineDash([]);
  }
}

// ---------- agents ----------
function halo(g, x, y, r) {
  const gr = g.createRadialGradient(x, y, r * 0.6, x, y, r + 1.6);
  gr.addColorStop(0, TEAM_HALO + '.35)'); gr.addColorStop(1, TEAM_HALO + '0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r + 1.6, 0, 7); g.fill();
}

function drawAgent(g, a, t) {
  g.globalAlpha = clamp(a.alpha, 0, 1);
  const sq = a.st === 'squeeze' ? clamp(a.age / 1.1, 0.3, 1) : 1;
  switch (a.type) {
    case 'v': case 'stuck': drawVirion(g, a, t); break;
    case 'bac': drawStaph(g, a); break;
    case 'mac': drawMacrophage(g, a, t); break;
    case 'neu': drawNeutrophil(g, a, t, sq); break;
    case 'nk': case 'ctl': case 'th': drawLymphocyte(g, a, t, sq); break;
    case 'pc': drawPlasma(g, a); break;
    case 'ab':
      if (a.st === 'tc') { g.strokeStyle = 'rgba(205,239,255,.6)'; g.lineWidth = 0.2; g.beginPath(); g.arc(a.x, a.y, 1.8, 0, 7); g.stroke(); }
      if (a.iga) drawIgA(g, a.x, a.y, a.seed + t * 0.2, 0.8); else drawIgG(g, a.x, a.y, a.seed + t * 0.3, 0.9);
      break;
    case 'dc': drawDC(g, a, t); break;
    case 'pus': drawPus(g, a); break;
    case 'drug': g.fillStyle = PAL.drug; g.beginPath(); g.arc(a.x, a.y, 0.35, 0, 7); g.fill(); break;
  }
  g.globalAlpha = 1;
}

// Influenza A virion: lipid envelope (~100 nm) studded with ~300 HA spikes (rods with a knob) and ~50 NA (mushroom
// shaped); inside, a matrix shell and 8 RNA pieces. Some are long filaments.
function drawVirion(g, a, t) {
  const inside = a.mode === 'cell' && a.phase === 2;
  let r = a.r * (a.st === 'bud' ? 0.45 + 0.55 * clamp(a.age / 0.9, 0, 1) : 1) * (inside ? 0.8 : 1);
  if (inside) {                                           // inside the cell, wrapped in a bubble of membrane (endosome)
    g.fillStyle = 'rgba(255,255,255,.12)'; g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 0.2;
    g.beginPath(); g.arc(a.x, a.y, r + 0.9, 0, 7); g.fill(); g.stroke();
  } else halo(g, a.x, a.y, r + (a.fil ? 1 : 0));
  const L = a.fil ? a.fil * r : 0, an = a.seed;
  g.save(); g.translate(a.x, a.y); g.rotate(an);
  // spikes
  if (!inside) {
    const n = a.fil ? 14 + Math.round(a.fil * 4) : 18;
    for (let k = 0; k < n; k++) {
      let px, py, nx, ny;
      if (a.fil) {
        const per = 2 * L + 2 * Math.PI * r, s = k / n * per;
        if (s < L) { px = -L / 2 + s; py = -r; nx = 0; ny = -1; }
        else if (s < L + Math.PI * r) { const th = -Math.PI / 2 + (s - L) / r; px = L / 2 + Math.cos(th) * r; py = Math.sin(th) * r; nx = Math.cos(th); ny = Math.sin(th); }
        else if (s < 2 * L + Math.PI * r) { px = L / 2 - (s - L - Math.PI * r); py = r; nx = 0; ny = 1; }
        else { const th = Math.PI / 2 + (s - 2 * L - Math.PI * r) / r; px = -L / 2 + Math.cos(th) * r; py = Math.sin(th) * r; nx = Math.cos(th); ny = Math.sin(th); }
      } else { const th = k / n * 6.283; px = Math.cos(th) * r; py = Math.sin(th) * r; nx = Math.cos(th); ny = Math.sin(th); }
      const isNA = k % 5 === 2, len = isNA ? 0.42 : 0.5;
      g.strokeStyle = isNA ? PAL.na : PAL.ha; g.lineWidth = 0.12;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + nx * len, py + ny * len); g.stroke();
      g.fillStyle = isNA ? PAL.na : PAL.ha;
      if (isNA) g.fillRect(px + nx * len - 0.13, py + ny * len - 0.13, 0.26, 0.26);
      else { g.beginPath(); g.arc(px + nx * (len + 0.08), py + ny * (len + 0.08), 0.13, 0, 7); g.fill(); }
    }
  }
  // envelope + matrix + RNA pieces
  g.fillStyle = PAL.virusDark; g.strokeStyle = PAL.virus; g.lineWidth = 0.28;
  if (L) { rrect(g, -L / 2 - r, -r, L + 2 * r, 2 * r, r); } else { g.beginPath(); g.arc(0, 0, r, 0, 7); }
  g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,140,170,.45)'; g.lineWidth = 0.12;
  if (L) { rrect(g, -L / 2 - r * 0.72, -r * 0.72, L + 1.44 * r, 1.44 * r, r * 0.72); } else { g.beginPath(); g.arc(0, 0, r * 0.72, 0, 7); }
  g.stroke();
  g.fillStyle = 'rgba(255,190,205,.75)';
  for (let k = 0; k < 8; k++) { const th = k * 0.785 + 0.3; g.beginPath(); g.arc(Math.cos(th) * r * 0.38 + (L ? (k - 3.5) / 8 * L : 0), Math.sin(th) * r * 0.38, 0.12, 0, 7); g.fill(); }
  g.restore();
  // antibodies stuck to it (neutralized)
  if (a.st === 'coated' || (a.mode === 'ab' && a.st === 'doomed')) {
    for (let k = 0; k < 3; k++) { const th = k * 2.1 + a.seed; drawIgA(g, a.x + Math.cos(th) * (r + 1.2), a.y + Math.sin(th) * (r + 1.2), th + Math.PI / 2, 0.5); }
  }
}

function staphBody(g, x, y, r, alpha) {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffd8a0'); gr.addColorStop(1, '#e07a1e');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.strokeStyle = PAL.bactWall; g.lineWidth = r * 0.22; g.beginPath(); g.arc(x, y, r * 0.89, 0, 7); g.stroke();
}
// Staphylococcus aureus: 1 µm spheres with a thick cell wall, dividing in alternating planes → grape-like clusters
function drawStaph(g, a) {
  const sw = a.swell || 0, r = a.r * (a.st === 'bud' ? 0.75 + 0.25 * clamp(a.age / 0.9, 0, 1) : 1) * (1 + 0.35 * sw);
  halo(g, a.x, a.y, r);
  if (sw > 0) {                                           // antibiotic: wall breaks and the inside spills out
    g.fillStyle = 'rgba(255,170,90,.6)'; g.beginPath(); g.arc(a.x, a.y, r * 0.85, 0, 7); g.fill();
    g.strokeStyle = PAL.bactWall; g.lineWidth = r * 0.2;
    g.beginPath(); g.arc(a.x, a.y, r * 0.9, a.seed, a.seed + 6.283 - 1.2 * sw); g.stroke();
    g.fillStyle = 'rgba(255,200,140,.8)';
    for (let k = 0; k < 4; k++) { const th = a.seed + 6.283 - 0.6 * sw + (k - 1.5) * 0.25; g.beginPath(); g.arc(a.x + Math.cos(th) * r * (1 + sw), a.y + Math.sin(th) * r * (1 + sw), 0.18, 0, 7); g.fill(); }
  } else staphBody(g, a.x, a.y, r);
  if (a.st === 'bud' && a.parent) {                       // the dividing wall (septum) between mother and daughter
    const mx = (a.x + a.parent.x) / 2, my = (a.y + a.parent.y) / 2, nx = -(a.y - a.parent.y), ny = a.x - a.parent.x, d = Math.hypot(nx, ny) || 1;
    g.strokeStyle = PAL.bactWall; g.lineWidth = 0.18;
    g.beginPath(); g.moveTo(mx + nx / d * 0.8, my + ny / d * 0.8); g.lineTo(mx - nx / d * 0.8, my - ny / d * 0.8); g.stroke();
  }
  if ((a.mode === 'comp' && a.st === 'doomed') || a.st === 'eaten' || a.coat) {   // complement / antibody tags
    g.fillStyle = PAL.comp;
    for (let k = 0; k < 6; k++) { const th = k / 6 * 6.28 + a.seed; g.beginPath(); g.arc(a.x + Math.cos(th) * (r + 0.3), a.y + Math.sin(th) * (r + 0.3), 0.28, 0, 7); g.fill(); }
  }
}

// Macrophage (~20 µm): ruffled edge reaching out where it moves, kidney-shaped nucleus, bubbles of eaten material
function drawMacrophage(g, a, t) {
  const n = 22, r = a.r * (a.gulp && t - a.gulp < 0.4 ? 1.08 : 1), hd = a.heading || 0;
  g.fillStyle = 'rgba(79,179,217,.42)'; g.strokeStyle = 'rgba(160,220,245,.85)'; g.lineWidth = 0.3;
  g.beginPath();
  for (let k = 0; k <= n; k++) {
    const an = k / n * 6.283, toward = Math.max(0, Math.cos(an - hd));
    const rr = r * (1 + 0.1 * Math.sin(an * 5 + t * 1.6 + a.seed) + 0.06 * Math.sin(an * 9 - t * 2.2) + 0.28 * toward * toward);
    const px = a.x + Math.cos(an) * rr, py = a.y + Math.sin(an) * rr * 0.8;
    k ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(200,235,250,.35)'; g.strokeStyle = 'rgba(200,235,250,.5)'; g.lineWidth = 0.15;
  const nv = 3 + Math.min(4, a.meals);
  for (let k = 0; k < nv; k++) {
    const vx = a.x - 3.2 + (k % 4) * 1.9, vy = a.y - 2.4 + Math.floor(k / 4) * 3.2 + Math.sin(k) * 0.4;
    g.beginPath(); g.arc(vx, vy, 0.8, 0, 7); g.fill(); g.stroke();
    if (k < a.meals) { g.fillStyle = 'rgba(255,110,120,.45)'; g.beginPath(); g.arc(vx, vy, 0.35, 0, 7); g.fill(); g.fillStyle = 'rgba(200,235,250,.35)'; }
  }
  g.fillStyle = '#2b6f8c';
  g.beginPath(); g.ellipse(a.x + 1.4, a.y + 0.6, 2.4, 1.7, 0.5, 0, 7); g.fill();
  g.fillStyle = 'rgba(79,179,217,.6)'; g.beginPath(); g.ellipse(a.x + 0.4, a.y + 0.2, 0.9, 0.7, 0.5, 0, 7); g.fill();
}

// Neutrophil (~12 µm): fine granules, nucleus in 3–5 lobes joined by thin threads; stretches toward where it crawls
function drawNeutrophil(g, a, t, sq) {
  const dy = a.st === 'dying' ? clamp((t - a.t0) / 1.2, 0, 1) : 0, moving = a.wp && a.st === 'free';
  g.save(); g.translate(a.x, a.y); g.rotate(a.heading || 0); g.scale(moving ? 1.15 : 1, (moving ? 0.88 : 1) * sq);
  g.fillStyle = dy ? `rgba(205,210,215,${0.8 - 0.3 * dy})` : 'rgba(188,220,255,.82)';
  g.beginPath(); g.arc(0, 0, a.r * (1 - 0.15 * dy), 0, 7); g.fill();
  g.fillStyle = 'rgba(120,140,190,.45)';
  for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(Math.cos(k * 2.4 + a.seed) * a.r * 0.75 * ((k % 3 + 1) / 3), Math.sin(k * 2.4 + a.seed) * a.r * 0.75 * ((k % 3 + 1) / 3), 0.25, 0, 7); g.fill(); }
  const lobes = 3 + (Math.floor(a.seed) % 2);
  const pts = []; for (let k = 0; k < lobes; k++) pts.push([-2 + k * (4 / (lobes - 1)) + dy * (k - 1) * 1.2, Math.sin(k * 2 + a.seed) * 1.1]);
  g.strokeStyle = dy ? '#6b6b7a' : '#4e5fb8'; g.lineWidth = 0.35;
  if (!dy) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
  g.fillStyle = dy ? '#6b6b7a' : '#4e5fb8';
  for (const [x, y] of pts) { g.beginPath(); g.ellipse(x, y, 1.05 * (1 - 0.3 * dy), 0.85 * (1 - 0.3 * dy), 0.5, 0, 7); g.fill(); }
  g.restore();
}

// NK cell = large granular lymphocyte; killer / helper T = small lymphocytes (nucleus nearly fills the cell, microvilli)
function drawLymphocyte(g, a, t, sq) {
  const col = a.type === 'nk' ? PAL.nk : a.type === 'ctl' ? PAL.ctl : PAL.th;
  const attacking = a.tgtCell || (a.hit && t - a.hit < 0.8);
  g.save(); g.translate(a.x, a.y); g.scale(1, sq);
  if (a.type !== 'nk') {                                  // microvilli
    g.strokeStyle = col; g.lineWidth = 0.15; g.globalAlpha *= 0.8;
    for (let k = 0; k < 16; k++) { const th = k / 16 * 6.283 + a.seed; g.beginPath(); g.moveTo(Math.cos(th) * a.r, Math.sin(th) * a.r); g.lineTo(Math.cos(th) * (a.r + 0.45), Math.sin(th) * (a.r + 0.45)); g.stroke(); }
    g.globalAlpha = clamp(a.alpha, 0, 1);
  }
  g.fillStyle = col; g.globalAlpha *= 0.55; g.beginPath(); g.arc(0, 0, a.r, 0, 7); g.fill();
  g.globalAlpha = clamp(a.alpha, 0, 1);
  g.fillStyle = shade(col, -0.5);
  if (a.type === 'nk') { g.beginPath(); g.ellipse(-0.9, 0.2, a.r * 0.55, a.r * 0.68, 0.3, 0, 7); g.fill(); }
  else { g.beginPath(); g.arc(-0.15, 0.1, a.r * 0.76, 0, 7); g.fill(); }
  if (a.type !== 'th') {                                  // granules with perforin / granzymes, gathering toward a target
    const toward = attacking ? Math.PI / 2 : 0;
    g.fillStyle = a.type === 'nk' ? '#0f5b57' : '#d6e0ff';
    const ng = a.type === 'nk' ? 9 : 4;
    for (let k = 0; k < ng; k++) {
      const th = attacking ? toward + (k - ng / 2) * 0.22 : k * 1.9 + a.seed, rr = a.type === 'nk' ? a.r * 0.72 : a.r * 0.86;
      g.beginPath(); g.arc(Math.cos(th) * rr + (a.type === 'nk' ? 0.8 : 0), Math.sin(th) * rr, a.type === 'nk' ? 0.42 : 0.28, 0, 7); g.fill();
    }
  }
  g.restore();
}

// Plasma cell: oval, nucleus off to one side with "clock-face" chromatin, pale area beside it (antibody factory)
function drawPlasma(g, a) {
  g.save(); g.translate(a.x, a.y); g.rotate(a.seed);
  g.fillStyle = 'rgba(111,156,255,.6)'; g.beginPath(); g.ellipse(0, 0, a.r, a.r * 0.75, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(220,235,255,.35)'; g.beginPath(); g.ellipse(-0.2, 0, 1.3, 1.1, 0, 0, 7); g.fill();
  g.fillStyle = '#26407a'; g.beginPath(); g.arc(1.8, 0, 1.9, 0, 7); g.fill();
  g.fillStyle = '#5a78c8';
  for (let k = 0; k < 7; k++) { const th = k / 7 * 6.283; g.beginPath(); g.arc(1.8 + Math.cos(th) * 1.25, Math.sin(th) * 1.25, 0.32, 0, 7); g.fill(); }
  g.restore();
}

// Dendritic cell: long branching arms; in the airway one arm reaches between the epithelial cells to the surface
function drawDC(g, a, t) {
  g.strokeStyle = 'rgba(143,140,255,.75)'; g.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const an = k * 1.047 + a.seed + Math.sin(t * 0.8 + k) * 0.2, L = 5 + 2.5 * Math.sin(t * 0.6 + k * 2);
    g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(a.x + Math.cos(an + 0.3) * L * 0.6, a.y + Math.sin(an + 0.3) * L * 0.6, a.x + Math.cos(an) * L, a.y + Math.sin(an) * L); g.stroke();
  }
  if (MI.scene === 'flu' && !a.leaving && MI.cells.length) {
    const cw = MI.cells[0].w, bx = Math.round(a.x / cw) * cw;
    g.lineWidth = 0.45; g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(bx, LF.BM + 2, bx, LF.BOT - 2); g.lineTo(bx, LF.TOP - 0.8); g.stroke();
    g.fillStyle = PAL.dc; g.beginPath(); g.arc(bx, LF.TOP - 0.8, 0.5, 0, 7); g.fill();
  }
  g.fillStyle = PAL.dc; g.beginPath(); g.arc(a.x, a.y, 2.8, 0, 7); g.fill();
  g.fillStyle = '#3f3d8a'; g.beginPath(); g.ellipse(a.x, a.y, 1.5, 1.2, 0.4, 0, 7); g.fill();
  if (a.leaving) { g.fillStyle = PAL.virus; g.beginPath(); g.arc(a.x + 1.2, a.y - 1.2, 0.5, 0, 7); g.fill(); }   // carrying a piece of the enemy
}

function drawPus(g, a) {
  g.fillStyle = 'rgba(207,199,154,.7)'; g.beginPath(); g.arc(a.x, a.y, a.r * 0.9, 0, 7); g.fill();
  g.fillStyle = 'rgba(95,90,100,.75)';                     // dead neutrophils: broken-up nuclei
  for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(a.x + Math.cos(k * 1.4 + a.seed) * 1.7, a.y + Math.sin(k * 1.4 + a.seed) * 1.5, 0.45, 0, 7); g.fill(); }
}

// IgG: Y-shaped — two arms (Fab, each a heavy + light chain) that grip the target, one stem (Fc) that phagocytes grab
function drawIgG(g, x, y, an, s) {
  g.save(); g.translate(x, y); g.rotate(an); g.lineCap = 'round';
  g.strokeStyle = PAL.ab; g.lineWidth = 0.42 * s;
  g.beginPath(); g.moveTo(0, 1.3 * s); g.lineTo(0, 0); g.lineTo(-1.0 * s, -1.0 * s); g.moveTo(0, 0); g.lineTo(1.0 * s, -1.0 * s); g.stroke();
  g.strokeStyle = 'rgba(205,239,255,.55)'; g.lineWidth = 0.22 * s;               // light chains along the outside of the arms
  g.beginPath(); g.moveTo(-0.55 * s, -0.25 * s); g.lineTo(-1.25 * s, -0.95 * s); g.moveTo(0.55 * s, -0.25 * s); g.lineTo(1.25 * s, -0.95 * s); g.stroke();
  g.restore();
}
// Secretory IgA in mucus: two Y's joined at their stems (J chain) and wrapped by the secretory piece
function drawIgA(g, x, y, an, s) {
  g.save(); g.translate(x, y); g.rotate(an);
  drawIgG(g, 0, -1.3 * s, 0, s); drawIgG(g, 0, 1.3 * s, Math.PI, s);
  g.fillStyle = PAL.comp; g.beginPath(); g.arc(0, 0, 0.3 * s, 0, 7); g.fill();
  g.restore();
}

// ---------- effects ----------
function drawFx(g, f, t) {
  const k = (t - f.t0) / 1.2;
  if (f.kind === 'ifn') {                                 // interferon spreading from an infected cell
    g.strokeStyle = `rgba(90,209,255,${0.45 * f.a * (1 - k)})`; g.lineWidth = 0.5;
    g.beginPath(); g.arc(f.x, f.y, 4 + k * 22, 0, 7); g.stroke();
  } else if (f.kind === 'rnp') {                          // the 8 viral RNA pieces enter the nucleus
    g.fillStyle = PAL.virus; g.globalAlpha = 1 - k;
    for (let i = 0; i < 8; i++) { const th = i * 0.785; g.beginPath(); g.arc(f.x + Math.cos(th) * k * 2, f.y + Math.sin(th) * k * 1.4, 0.3, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  } else if (f.kind === 'drain') {
    const kk = (t - f.t0) / 2;
    g.strokeStyle = `rgba(230,220,170,${1 - kk})`; g.lineWidth = 0.6;
    for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(f.x + (i - 3) * 1.2, f.y + 8 - kk * 4); g.lineTo(f.x + (i - 3) * 2, f.y - 6 - kk * 10); g.stroke(); }
  } else if (f.kind === 'stab') {                         // killer cell punches holes (perforin) into the infected cell
    g.strokeStyle = f.how === 'nk' ? PAL.nk : PAL.ctl; g.globalAlpha = 1 - k; g.lineWidth = 0.4;
    for (let i = 0; i < 8; i++) { const an = i * 0.785; g.beginPath(); g.moveTo(f.x + Math.cos(an) * (2 + k * 4), f.y + Math.sin(an) * (2 + k * 4)); g.lineTo(f.x + Math.cos(an) * (3 + k * 7), f.y + Math.sin(an) * (3 + k * 7)); g.stroke(); }
    g.globalAlpha = 1;
  } else {                                                // the cell dies on its own and falls apart
    g.fillStyle = 'rgba(200,170,180,.7)'; g.globalAlpha = 1 - k;
    for (let i = 0; i < 6; i++) { const an = i * 1.05; g.beginPath(); g.arc(f.x + Math.cos(an) * (1.5 + k * 3), f.y + Math.sin(an) * (1.5 + k * 3), 0.7, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }
}

// ---------- labels ----------
function drawLabels(g, W) {
  g.font = '2.6px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = 'rgba(255,255,255,.55)'; g.textBaseline = 'middle'; g.textAlign = 'left';
  const L = MI.scene === 'flu'
    ? [['空気の通り道（鼻・のど）', 2, 5], ['粘液', 2, LF.GEL + 3], ['水の層（線毛が動く）', 2, LF.PCL + 3.2], ['上皮細胞', 2, LF.TOP + 5], ['基底膜', 2, LF.BM + 2.2], ['毛細血管', 2, LF.CAP - MI.capR - 2]]
    : [['皮膚の外', 2, 6], ['角質', 2, LS.SC + 2], ['表皮', 2, LS.EPI + 4], ['真皮', 2, LS.DER + 3], ['毛細血管', 2, LS.CAP - MI.capR - 2], ['傷', woundX() + 9.5, LS.SC + 3]];
  for (const [s, x, y] of L) g.fillText(s, x, y);
  if (MI.scene === 'flu') { g.textAlign = 'right'; g.fillText('← 粘液はのどの方へ流れる', W - 26, LF.GEL + 3); g.textAlign = 'left'; }
  g.save(); g.translate(W - 2.2, (MI.scene === 'flu' ? LF.BM : LS.DER) + 3); g.rotate(Math.PI / 2); g.fillText('リンパ管→', 0, 0); g.restore();
  g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(W - 24, 4, 10, 0.5); g.fillText('10µm', W - 24, 6.5);
}

// How influenza multiplies: numbered tags on one example of each step that is on screen now
function drawSteps(g) {
  const tags = [];
  const v1 = MI.agents.find(a => a.type === 'v' && a.mode === 'cell' && a.phase === 1);
  if (v1) tags.push([1, 'くっつく', v1.x, v1.y - 2.2]);
  const v2 = MI.agents.find(a => a.type === 'v' && a.mode === 'cell' && a.phase === 2);
  if (v2) tags.push([2, '飲みこまれる', v2.x, v2.y]);
  const e = MI.cells.find(z => z.st === 'E');
  if (e) tags.push([3, '核で遺伝子をコピー', e.x + e.w / 2, LF.BOT - 9]);
  const i = MI.cells.find(z => (z.st === 'I' || z.st === 'doom') && z !== e);
  if (i) tags.push([4, '部品を集めて出芽', i.x + i.w / 2, LF.TOP + 2]);
  const s = MI.agents.find(a => a.type === 'stuck');
  const b = s || MI.agents.find(a => a.type === 'v' && a.st === 'bud');
  if (b) tags.push([5, s ? 'はなれられない（薬）' : '切りはなれる', b.x, b.y - 2]);
  g.font = '2.4px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  for (const [n, txt, x, y] of tags) {
    const tx = clamp(x + 2.4, 2, MI.W - 26), ty = y - 3;
    const w = g.measureText(txt).width + 5;
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 0.2; g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
    g.fillStyle = 'rgba(10,14,18,.82)'; rrect(g, tx, ty - 1.7, w, 3.4, 1.2); g.fill();
    g.fillStyle = PAL.virus; g.beginPath(); g.arc(tx + 1.6, ty, 1.15, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(n, tx + 1.6, ty + 0.1); g.textAlign = 'left';
    g.fillText(txt, tx + 3.2, ty + 0.1);
  }
}
