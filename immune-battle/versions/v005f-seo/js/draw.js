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

// ---------- background (vector, drawn every frame so it stays sharp when zoomed) ----------
function renderBackground(g) {
  const W = MI.W, R = mulberry(3);
  if (MI.scene === 'alveolus') { alveolusBackground(g, W, R); return; }
  if (MI.scene === 'bladder') { bladderBackground(g, W, R); return; }
  if (EPI()) {
    let gr = g.createLinearGradient(0, 0, 0, LF.GEL);
    if (MI.scene === 'gut') { gr.addColorStop(0, '#2a2416'); gr.addColorStop(1, '#3a301c'); }   // contents of the small intestine
    else { gr.addColorStop(0, '#0b131b'); gr.addColorStop(1, '#13202a'); }
    g.fillStyle = gr; g.fillRect(0, 0, W, LF.TOP);
    if (MI.scene === 'gut') {                                            // bits of digested food drifting along
      g.fillStyle = 'rgba(200,170,110,.25)';
      for (let i = 0; i < W / 3; i++) { const x = ((R() * W + MI.now * FLOW * 0.6) % (W + 6)) - 3; g.beginPath(); g.ellipse(x, 2 + R() * (LF.GEL - 4), 0.6 + R() * 1.4, 0.4 + R() * 0.8, R() * 3, 0, 7); g.fill(); }
    }
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
    g.fillStyle = '#c4b29c'; g.fillRect(0, LS.SC, W, LS.EPI - LS.SC);   // stratum corneum: flat dead layers
    g.strokeStyle = 'rgba(80,60,40,.5)'; g.lineWidth = 0.25;
    for (let y = LS.SC + 1; y < LS.EPI; y += 1.1) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 6) g.lineTo(x, y + Math.sin(x * 0.3 + y) * 0.2); g.stroke(); }
    for (let row = 0; row < 4; row++) {                                  // epidermis: keratinocytes (flatter toward the top)
      const y0 = LS.EPI + row * 4.5, h = 4.3, w = 8 - row * 0.8;
      for (let x = -R() * w; x < W; x += w) {
        g.fillStyle = `hsl(${24 + row * 2},${22 + row * 4}%,${70 - row * 5}%)`;
        rrect(g, x + 0.25, y0 + 0.25, w - 0.5, h - 0.5, 1.4); g.fill();
        g.fillStyle = 'rgba(110,80,80,.55)'; g.beginPath(); g.ellipse(x + w / 2, y0 + h / 2, w * 0.18, h * 0.22, 0, 0, 7); g.fill();
      }
    }
    g.fillStyle = '#9d8a8f'; g.fillRect(0, LS.DER - 0.5, W, 1);
    const cx = woundX();                                                 // the cut, filled with clot (fibrin and red cells)
    g.save();
    g.beginPath(); g.moveTo(cx - 9, LS.SC - 0.5); g.lineTo(cx + 9, LS.SC - 0.5); g.lineTo(cx + 2, 52); g.lineTo(cx - 2, 52); g.closePath();
    g.fillStyle = '#3e1d22'; g.fill();
    g.clip(); g.strokeStyle = 'rgba(230,210,180,.3)'; g.lineWidth = 0.25;
    for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(cx + (R() - 0.5) * 20, 10 + R() * 42); g.lineTo(cx + (R() - 0.5) * 20, 10 + R() * 42); g.stroke(); }
    g.fillStyle = 'rgba(150,60,70,.7)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(cx + (R() - 0.5) * 12, 16 + R() * 28, 2.2, 1.5, R() * 3, 0, 7); g.fill(); }
    g.restore();
  }
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

// ---------- the tissue view ----------
// Draws the tissue into the device-pixel rectangle `rect`, magnified z× around world point (cx, cy).
// main = true when it is the main view (then picking, labels and call-outs use MI.view).
function drawTissue(g, rect, z, cx, cy, main) {
  const W = MI.W, t = MI.now, k = rect.h / 100 * z;
  if (cx == null) { cx = W / 2; cy = 50; }
  const ox = rect.x + rect.w / 2 - cx * k, oy = rect.y + rect.h / 2 - cy * k;
  if (main) MI.view = { k, ox, oy, z };
  MI.detail = k / MI.dpr;                                   // CSS px per µm: decides how much detail to draw
  g.setTransform(k, 0, 0, k, ox, oy);
  renderBackground(g);
  const cap = CAPY();
  if (MI.inflam > 0.02) {                                 // inflammation: tissue reddens and swells with fluid
    g.fillStyle = `rgba(255,80,80,${0.14 * MI.inflam})`;
    const top = TISSUE_TOP();
    g.fillRect(0, top, W, (MI.scene === 'alveolus' ? LA.LOW : 100) - top);
  }
  drawCapillary(g, cap, W, t);
  if (MI.scene !== 'alveolus') drawLymph(g, W);
  if (EPI()) { drawEpithelium(g, t); drawMucus(g, W, t); }
  else if (MI.scene === 'alveolus') drawAlveolus(g, W, t);
  else if (MI.scene === 'bladder') drawBladder(g, W, t);
  else drawDermis(g, t);
  const order = ['drug', 'pus', 'dc', 'pc', 'macB', 'neu', 'nk', 'ctl', 'th', 'bac', 'stuck', 'v', 'ab', 'macS'];
  for (const ty of order) for (const a of MI.agents) {
    const kk = a.type === 'mac' ? (a.surf ? 'macS' : 'macB') : a.type;
    if (kk === ty) drawAgent(g, a, t);
  }
  for (const f of MI.fx) drawFx(g, f, t);
  if (main) {
    for (const c of MI.callouts) if (c.focus) drawFocusRing(g, c, t);
    if (MI.hover && MI.hover.a) {
      const a = MI.hover.a; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.35;
      g.beginPath(); g.arc(a.x, a.y, (a.r || 3) + 1.5, 0, 7); g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (MI.labels) drawLabels(g, W);
    drawCallouts(g, t);
  }
}
const toScreen = (x, y) => [x * MI.view.k + MI.view.ox, y * MI.view.k + MI.view.oy];

function drawCapillary(g, cy, W, t) {
  const r = MI.capR;
  g.fillStyle = '#4a1d24'; g.fillRect(0, cy - r, W, 2 * r);
  g.fillStyle = 'rgba(230,200,200,.45)'; g.fillRect(0, cy - r - 0.6, W, 0.8); g.fillRect(0, cy + r - 0.2, W, 0.8);
  for (const c of MI.rbc) {
    g.fillStyle = PAL.rbc; g.beginPath(); g.ellipse(c.x, cy + c.dy * r / 4, 3.6 * c.s, 1.5 * c.s, 0, 0, 7); g.fill();
    g.fillStyle = '#6e2a33'; g.beginPath(); g.ellipse(c.x, cy + c.dy * r / 4, 1.8 * c.s, 0.6 * c.s, 0, 0, 7); g.fill();
  }
  if (SIM.path.kind === 'bacteria' && SIM.o && SIM.o.blood > 0.05) {          // bacteria in the blood stream (bacteremia)
    const n = Math.round(SIM.o.blood * 10);
    for (let i = 0; i < n; i++) { const x = ((t * 9 + i * 37.3) % (W + 10)) - 5; staphBody(g, x, cy + Math.sin(i * 2.1) * r * 0.5, 0.9, 1); }
  }
}
function drawLymph(g, W) {
  const x = W - 6, y0 = TISSUE_TOP() + 1;
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
    cellDetail(g, z, x, y0, w, hh, t, z.st === 'I' || z.st === 'doom');
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
    if (MI.scene === 'gut') {                             // gut: a brush border of short, dense microvilli (thinned when infected)
      if (!z.goblet) {
        const keep = z.st === 'I' || z.st === 'doom' ? 0.35 : 1;
        g.strokeStyle = 'rgba(236,214,200,.75)'; g.lineWidth = 0.22;
        for (let k = 0; k < 16 * keep; k++) { const bx = x + w * (0.05 + 0.06 * k / keep); g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y0 - 1.4); g.stroke(); }
      }
    } else if (!z.goblet && (z.st === 'U' || z.st === 'R' || z.st === 'E')) {
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
  const gut = MI.scene === 'gut', sh = -FLOWDIR() * t * FLOW;
  g.fillStyle = gut ? 'rgba(200,190,150,.06)' : 'rgba(120,170,200,.07)'; g.fillRect(0, LF.PCL, W, LF.TOP - LF.PCL);
  g.fillStyle = gut ? 'rgba(210,200,150,.13)' : 'rgba(180,205,160,.15)';
  g.beginPath(); g.moveTo(0, LF.PCL + 0.4);
  for (let x = 0; x <= W; x += 2) g.lineTo(x, (gut ? LF.GEL + 3 : LF.GEL) + Math.sin((x + sh) * 0.12) * 1.1 + Math.sin((x + sh) * 0.05) * 0.8);
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
    case 'v': case 'stuck': MI.look === 'corona' ? drawCorona(g, a, t) : MI.look === 'noro' ? drawNoro(g, a, t) : drawVirion(g, a, t); break;
    case 'bac': MI.look === 'pneumo' ? drawPneumo(g, a) : MI.look === 'ecoli' ? drawEcoli(g, a, t) : drawStaph(g, a); break;
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
  if (EPI() && !a.leaving && MI.cells.length) {
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

// ---------- labels and call-outs (screen space, so text stays the same size at any zoom) ----------
function drawLabels(g, W) {
  const d = MI.dpr;
  g.font = `${11 * d}px "Zen Kaku Gothic New", sans-serif`; g.fillStyle = 'rgba(255,255,255,.5)'; g.textBaseline = 'middle'; g.textAlign = 'left';
  const cap = [L('毛細血管', 'Capillary'), 2, CAPY() - MI.capR - 2];
  const rows = {
    airway: [[L('空気の通り道（鼻・のど）', 'Airway (nose, throat)'), 2, 5], [L('粘液', 'Mucus'), 2, LF.GEL + 3], [L('水の層（線毛が動く）', 'Watery layer (cilia beat here)'), 2, LF.PCL + 3.2], [L('上皮細胞', 'Lining cells'), 2, LF.TOP + 5], [L('基底膜', 'Basement membrane'), 2, LF.BM + 2.2], cap],
    gut:    [[L('小腸の中（消化された食べ物）', 'Inside the small intestine (digested food)'), 2, 5], [L('粘液', 'Mucus'), 2, LF.GEL + 5], [L('微じゅう毛（栄養を吸う）', 'Microvilli (absorb nutrients)'), 2, LF.PCL + 4.5], [L('上皮細胞', 'Lining cells'), 2, LF.TOP + 5], [L('基底膜', 'Basement membrane'), 2, LF.BM + 2.2], cap],
    skin:   [[L('皮膚の外', 'Outside the skin'), 2, 6], [L('角質', 'Stratum corneum'), 2, LS.SC + 2], [L('表皮', 'Epidermis'), 2, LS.EPI + 4], [L('真皮', 'Dermis'), 2, LS.DER + 3], cap, [L('傷', 'Wound'), woundX() + 9.5, LS.SC + 3]],
    alveolus: [[L('肺胞の中（空気）', 'Inside the alveolus (air)'), 2, 5], [L('肺胞の壁（とても薄い）', 'Alveolar wall (very thin)'), 2, LA.WALL + 2.2], cap, [L('となりの肺胞', 'Neighboring alveolus'), 2, LA.LOW + 6]],
    bladder: [[L('膀胱の中（尿）', 'Inside the bladder (urine)'), 2, 5], [L('傘細胞（膀胱の表面）', 'Umbrella cells (bladder surface)'), 2, LB.URO + 3.5], [L('下の層の細胞', 'Cells of the lower layers'), 2, LB.UBOT + 4], [L('粘膜の下', 'Under the lining'), 2, LB.BASE + 3], cap],
  }[MI.scene];
  const left = Math.max(0, -MI.view.ox / MI.view.k);                      // keep row labels at the visible left edge
  for (const [s, x, y] of rows) { const [px, py] = toScreen(Math.max(x, left + 2 / MI.view.z), y); if (py > 0 && py < MI.cv.height) g.fillText(s, px, py); }
  const note = { airway:[L('← 粘液はのどへ流れ、飲みこまれて胃で分解される', '← Mucus flows to the throat, is swallowed and broken down in the stomach'), LF.GEL + 6.5], gut:[L('中身は先へ進み、便になって外へ出る →', 'Contents move on and leave as stool →'), LF.GEL + 9],
    alveolus:[L('壁の向こうの血管へ酸素が入る', 'Oxygen passes into the blood vessels behind the wall'), 18], bladder:[L('ためた尿は、おしっこで外へ出る →', 'Stored urine leaves when you pee →'), 10] }[MI.scene];
  if (note) {
    const [px, py] = toScreen(Math.max(left + 2 / MI.view.z, 2), note[1]);
    g.fillStyle = 'rgba(200,225,170,.6)'; g.fillText(note[0], px, py);
  }
}

// Short explanations that pop up next to what just happened (managed in micro.js: MI.callouts)
function calloutPos(c) {
  const tg = c.target;
  if (!tg) return null;
  if (tg.cellRef) { const z = tg.cellRef; return { x:z.x + z.w / 2, y:tg.y }; }
  return { x:tg.x, y:tg.y };
}
function drawFocusRing(g, c, t) {
  const p = calloutPos(c); if (!p) return;
  const k = (t - c.t0) / c.dur, r = (c.r || 4) + 1.2 + Math.sin(t * 6) * 0.4;
  g.strokeStyle = c.col; g.globalAlpha = Math.min(1, 3 * (1 - k)); g.lineWidth = 0.4; g.setLineDash([1, 0.7]);
  g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
}
// panels floating over the picture (status, body window, zoom buttons…) in canvas pixels, so call-outs avoid them
function overlayRects() {
  const cr = MI.cv.getBoundingClientRect(), d = MI.dpr, out = [];
  for (const id of ['status', 'bodyWin', 'zoomCtl', 'timebar', 'teamKey', 'pickCard']) {
    const el = document.getElementById(id); if (!el || el.hidden || !el.offsetParent) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    out.push({ x:(r.left - cr.left) * d, y:(r.top - cr.top) * d, w:r.width * d, h:r.height * d });
  }
  return out;
}
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function drawCallouts(g, t) {
  if (!MI.callouts.length) return;
  const d = MI.dpr, placed = [], obst = overlayRects(), Wc = MI.cv.width, Hc = MI.cv.height;
  g.font = `600 ${12.5 * d}px "Zen Kaku Gothic New", sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
  for (const c of MI.callouts) {
    const p = calloutPos(c); if (!p) continue;
    const [sx, sy] = toScreen(p.x, p.y);
    if (sx < -20 || sy < -20 || sx > Wc + 20 || sy > Hc + 20) continue;
    const a = Math.min(1, (t - c.t0) / 0.25, (c.t0 + c.dur - t) / 0.6);
    let lines = c.text.split('\n');
    if (LANG === 'en') {                                        // English is longer: wrap at spaces to fit the screen
      const maxW = Math.min(Wc * 0.86, 300 * d), out = [];
      for (const s of lines) { let cur = ''; for (const wd of s.split(' ')) { const tr = cur ? cur + ' ' + wd : wd; if (cur && g.measureText(tr).width > maxW) { out.push(cur); cur = wd; } else cur = tr; } out.push(cur); }
      lines = out;
    }
    const w =Math.max(...lines.map(s => g.measureText(s).width)) + 22 * d, h = lines.length * 17 * d + 10 * d;
    // try spots around the target; take the first that stays on screen and clear of panels and other call-outs
    const off = 24 * d, cands = [[sx + off, sy - h - off], [sx - w - off, sy - h - off], [sx + off, sy + off], [sx - w - off, sy + off], [sx + off, sy - h / 2], [sx - w - off, sy - h / 2]];
    // when no spot is completely free, take the one that covers the panels the least
    const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    let bx = cands[0][0], by = cands[0][1], best = Infinity;
    for (let [x, y] of cands) {
      x = clamp(x, 4 * d, Wc - w - 4 * d); y = clamp(y, 4 * d, Hc - h - 4 * d);
      const r = { x, y, w, h };
      const cover = obst.reduce((s, o) => s + area(r, o), 0) + placed.reduce((s, o) => s + 3 * area(r, o), 0) + Math.hypot(x - sx, y - sy) * 0.01;
      if (cover < best) { best = cover; bx = x; by = y; }
    }
    bx = clamp(bx, 4 * d, Wc - w - 4 * d); by = clamp(by, 4 * d, Hc - h - 4 * d);
    placed.push({ x:bx, y:by, w, h });
    g.globalAlpha = a;
    g.strokeStyle = c.col; g.lineWidth = 1.5 * d; g.beginPath(); g.moveTo(sx, sy); g.lineTo(bx + (bx > sx ? 0 : w), by + h / 2); g.stroke();
    g.fillStyle = 'rgba(8,12,16,.9)'; rrect(g, bx, by, w, h, 6 * d); g.fill();
    g.fillStyle = c.col; g.fillRect(bx, by + 4 * d, 3.5 * d, h - 8 * d);
    g.fillStyle = '#fff';
    lines.forEach((s, i) => g.fillText(s, bx + 12 * d, by + 5 * d + 8.5 * d + i * 17 * d));
    g.globalAlpha = 1;
  }
}

// ---------- extra detail when zoomed in close (organelles, what the virus does inside a cell) ----------
function cellDetail(g, z, x, y0, w, hh, t, take) {
  if (MI.detail < 9) return;
  const a = clamp((MI.detail - 9) / 6, 0, 1), R = mulberry(z.i * 97 + 5);
  g.globalAlpha *= a;
  g.fillStyle = 'rgba(120,90,95,.5)';                       // ribosomes / rough ER (dots)
  for (let k = 0; k < 40; k++) { g.beginPath(); g.arc(x + 1 + R() * (w - 2), y0 + 2 + R() * (hh - 14), 0.12, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(190,130,110,.55)'; g.strokeStyle = 'rgba(140,80,70,.6)'; g.lineWidth = 0.08;   // mitochondria
  for (let k = 0; k < 4; k++) { const mx = x + 1.5 + R() * (w - 3), my = y0 + 4 + R() * (hh - 16); g.beginPath(); g.ellipse(mx, my, 0.9, 0.4, R() * 3, 0, 7); g.fill(); g.stroke(); }
  if (take) {                                              // viral proteins heading to the top membrane; RNA copies leaving the nucleus
    g.fillStyle = PAL.ha;
    for (let k = 0; k < 14; k++) { const ph = (t * 0.25 + k / 14) % 1; g.beginPath(); g.arc(x + w * (0.2 + 0.6 * ((k * 0.37) % 1)), y0 + hh - 10 - ph * (hh - 12), 0.16, 0, 7); g.fill(); }
  }
  g.globalAlpha /= a || 1;
}

// ---------- alveolus (pneumococcus) ----------
function alveolusBackground(g, W, R) {
  let gr = g.createLinearGradient(0, 0, 0, LA.WALL);
  gr.addColorStop(0, '#0b141c'); gr.addColorStop(1, '#122230');
  g.fillStyle = gr; g.fillRect(0, 0, W, LA.WALL);
  g.fillStyle = '#35252a'; g.fillRect(0, LA.WALL, W, LA.LOW - LA.WALL);       // thin wall with its capillary
  g.fillStyle = '#0d1820'; g.fillRect(0, LA.LOW, W, 100 - LA.LOW);              // the next air space
}
function drawAlveolus(g, W, t) {
  const D = SIM.y ? SIM.y.D || 0 : 0;
  // fluid and cells seeping in from the vessels fill the air space from the wall upward (pneumonia)
  if (D > 0.01) {
    const h = 4 + 44 * D, top = LA.WALL - h;
    g.fillStyle = 'rgba(150,185,215,.16)';
    g.beginPath(); g.moveTo(0, LA.WALL);
    for (let x = 0; x <= W; x += 2) g.lineTo(x, top + Math.sin(x * 0.15 + t * 0.8) * 0.6);
    g.lineTo(W, LA.WALL); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(200,225,240,.25)'; g.lineWidth = 0.25; g.stroke();
  }
  // surfactant film (keeps the alveolus from collapsing)
  g.fillStyle = 'rgba(230,240,210,.35)'; g.fillRect(0, LA.WALL - 0.6, W, 0.6);
  // the wall: flat type I cells (gas passes through them), here and there a rounded type II cell making surfactant
  for (const [y0, flip] of [[LA.WALL, 1], [LA.LOW - 1.6, -1]]) {
    g.fillStyle = '#d8b8b6'; g.fillRect(0, y0, W, 1.6);
    for (let x = 6; x < W; x += 26) { g.fillStyle = '#8a6670'; g.beginPath(); g.ellipse(x, y0 + 0.8, 2.6, 0.55, 0, 0, 7); g.fill(); }
    if (flip > 0) for (let x = 19; x < W; x += 48) {
      g.fillStyle = '#e6c9bf'; g.beginPath(); g.ellipse(x, y0 - 1.6, 3.4, 2.6, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,240,.7)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x - 1.6 + k * 1.1, y0 - 2.2, 0.35, 0, 7); g.fill(); }
      g.fillStyle = '#8a6670'; g.beginPath(); g.arc(x, y0 - 0.8, 0.9, 0, 7); g.fill();
    }
  }
}

// ---------- bladder (E. coli) ----------
function bladderBackground(g, W, R) {
  let gr = g.createLinearGradient(0, 0, 0, LB.URO);
  gr.addColorStop(0, '#2a2614'); gr.addColorStop(1, '#383218');
  g.fillStyle = gr; g.fillRect(0, 0, W, LB.URO);
  g.fillStyle = 'rgba(240,220,120,.12)';                                        // urine: specks drifting
  for (let i = 0; i < W / 3; i++) { const x = ((R() * W + MI.now * 0.8) % (W + 4)) - 2; g.beginPath(); g.arc(x, 2 + R() * (LB.URO - 4), 0.25 + R() * 0.3, 0, 7); g.fill(); }
  gr = g.createLinearGradient(0, LB.BASE, 0, 100);
  gr.addColorStop(0, '#33252a'); gr.addColorStop(1, '#241a1e');
  g.fillStyle = gr; g.fillRect(0, LB.UBOT, W, 100 - LB.UBOT);
  for (let row = 0; row < 2; row++) {                                            // deeper layers of the urothelium
    const y0 = LB.UBOT + row * 4, w = 6 - row;
    for (let x = -R() * w; x < W; x += w) {
      g.fillStyle = `hsl(${352 + row * 4},${22 - row * 4}%,${70 - row * 8}%)`; rrect(g, x + 0.2, y0 + 0.2, w - 0.4, 3.6, 1.3); g.fill();
      g.fillStyle = 'rgba(110,80,90,.55)'; g.beginPath(); g.ellipse(x + w / 2, y0 + 2, w * 0.2, 0.9, 0, 0, 7); g.fill();
    }
  }
  fibers(g, R, W, LB.BASE + 2, LB.CAP - 7, '#5d4248');
  g.fillStyle = '#9d8a8f'; g.fillRect(0, LB.BASE - 0.5, W, 1);
}
function drawBladder(g, W, t) {
  for (const u of MI.umb) {
    const x = u.x + 0.3, w = u.w - 0.6, h = LB.UBOT - LB.URO;
    let dy = 0, sh = 1, a = 1;
    if (u.st === 'shed') { dy = -10 * u.tr; a = 1 - u.tr; }
    else if (u.st === 'grow') sh = 0.3 + 0.7 * u.tr;
    if (a <= 0.02) continue;
    g.globalAlpha = a;
    const y0 = LB.UBOT - h * sh + dy, hurt = SIM.y && SIM.y.D ? Math.min(0.5, SIM.y.D) : 0;
    g.fillStyle = mix('#ecd3cf', '#c98a92', hurt); rrect(g, x, y0, w, h * sh, 3); g.fill();
    g.strokeStyle = 'rgba(255,240,235,.6)'; g.lineWidth = 0.35;                   // the tough top membrane (uroplakin plaques)
    g.beginPath(); g.moveTo(x + 2, y0 + 0.3); g.lineTo(x + w - 2, y0 + 0.3); g.stroke();
    g.fillStyle = PAL.nucleus;
    if (u.two) { g.beginPath(); g.ellipse(x + w * 0.35, y0 + h * sh * 0.55, 1.6, 1.1, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(x + w * 0.65, y0 + h * sh * 0.55, 1.6, 1.1, 0, 0, 7); g.fill(); }
    else { g.beginPath(); g.ellipse(x + w / 2, y0 + h * sh * 0.55, 1.9, 1.2, 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  }
  if (MI.voidT && MI.now - MI.voidT < 1.4) {                                     // urination: the urine rushes out
    const k = (MI.now - MI.voidT) / 1.4;
    g.strokeStyle = `rgba(240,225,140,${0.5 * (1 - k)})`; g.lineWidth = 0.4;
    for (let i = 0; i < 9; i++) { const y = 5 + i * 4.6, x = (k * 1.4 * W + i * 13) % (W + 20) - 10; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12, y); g.stroke(); }
  }
}

// ---------- other enemies ----------
// SARS-CoV-2 (~100 nm): envelope with ~25 club-shaped spike proteins (S) — the "crown"; RNA coiled inside
function drawCorona(g, a, t) {
  const inside = a.mode === 'cell' && a.phase === 2;
  const r = a.r * (a.st === 'bud' ? 0.45 + 0.55 * clamp(a.age / 0.9, 0, 1) : 1) * (inside ? 0.8 : 1);
  if (inside) { g.fillStyle = 'rgba(255,255,255,.12)'; g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 0.2; g.beginPath(); g.arc(a.x, a.y, r + 0.9, 0, 7); g.fill(); g.stroke(); }
  else halo(g, a.x, a.y, r + 0.3);
  if (!inside) {
    g.strokeStyle = PAL.ha; g.fillStyle = PAL.ha; g.lineWidth = 0.13;
    for (let k = 0; k < 16; k++) {
      const th = k / 16 * 6.283 + a.seed, c = Math.cos(th), s = Math.sin(th);
      g.beginPath(); g.moveTo(a.x + c * r, a.y + s * r); g.lineTo(a.x + c * (r + 0.6), a.y + s * (r + 0.6)); g.stroke();
      g.beginPath(); g.arc(a.x + c * (r + 0.75), a.y + s * (r + 0.75), 0.22, 0, 7); g.fill();
    }
  }
  g.fillStyle = PAL.virusDark; g.strokeStyle = PAL.virus; g.lineWidth = 0.28;
  g.beginPath(); g.arc(a.x, a.y, r, 0, 7); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,190,205,.7)'; g.lineWidth = 0.12;
  g.beginPath(); for (let k = 0; k <= 24; k++) { const th = k / 24 * 6.283 * 2 + a.seed, rr = r * (0.25 + 0.3 * (k / 24)); k ? g.lineTo(a.x + Math.cos(th) * rr, a.y + Math.sin(th) * rr) : g.moveTo(a.x + Math.cos(th) * rr, a.y + Math.sin(th) * rr); } g.stroke();
  if (a.st === 'coated' || (a.mode === 'ab' && a.st === 'doomed')) for (let k = 0; k < 3; k++) { const th = k * 2.1 + a.seed; drawIgA(g, a.x + Math.cos(th) * (r + 1.4), a.y + Math.sin(th) * (r + 1.4), th + Math.PI / 2, 0.5); }
}
// Norovirus (~30 nm, much smaller than influenza): no envelope; a 20-sided protein shell with knobby "P domains"
function drawNoro(g, a, t) {
  const inside = a.mode === 'cell' && a.phase === 2;
  const r = a.r * (a.st === 'bud' ? 0.5 + 0.5 * clamp(a.age / 0.9, 0, 1) : 1);
  if (inside) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 0.15; g.beginPath(); g.arc(a.x, a.y, r + 0.6, 0, 7); g.stroke(); }
  else halo(g, a.x, a.y, r);
  g.save(); g.translate(a.x, a.y); g.rotate(a.seed);
  g.fillStyle = PAL.virus; g.strokeStyle = PAL.ha; g.lineWidth = 0.08;
  g.beginPath(); for (let k = 0; k < 6; k++) { const th = k / 6 * 6.283; k ? g.lineTo(Math.cos(th) * r, Math.sin(th) * r) : g.moveTo(Math.cos(th) * r, Math.sin(th) * r); } g.closePath(); g.fill(); g.stroke();
  g.beginPath(); for (let k = 0; k < 6; k += 2) { const th = k / 6 * 6.283; g.moveTo(0, 0); g.lineTo(Math.cos(th) * r, Math.sin(th) * r); } g.stroke();
  g.fillStyle = PAL.ha;
  for (let k = 0; k < 6; k++) { const th = (k + 0.5) / 6 * 6.283; g.beginPath(); g.arc(Math.cos(th) * r * 1.05, Math.sin(th) * r * 1.05, 0.14, 0, 7); g.fill(); }
  g.restore();
  if (a.st === 'coated' || (a.mode === 'ab' && a.st === 'doomed')) for (let k = 0; k < 2; k++) { const th = k * 3.1 + a.seed; drawIgA(g, a.x + Math.cos(th) * (r + 1.1), a.y + Math.sin(th) * (r + 1.1), th + Math.PI / 2, 0.45); }
}
// Streptococcus pneumoniae: lancet-shaped cocci in pairs, wrapped in a thick slippery capsule (sugar coat)
function drawPneumo(g, a) {
  const sw = a.swell || 0, r = a.r * (a.st === 'bud' ? 0.75 + 0.25 * clamp(a.age / 0.9, 0, 1) : 1) * (1 + 0.3 * sw);
  halo(g, a.x, a.y, r * 1.6);
  g.save(); g.translate(a.x, a.y); g.rotate(a.seed);
  const coated = SIM.y && SIM.y.Ab > 0.3;
  g.fillStyle = coated ? 'rgba(205,239,255,.18)' : 'rgba(255,255,255,.14)'; g.strokeStyle = coated ? 'rgba(205,239,255,.55)' : 'rgba(255,255,255,.35)'; g.lineWidth = 0.12;
  g.beginPath(); g.ellipse(0, 0, r * 2.1, r * 1.3, 0, 0, 7); g.fill(); g.stroke();   // capsule
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(s * r * 0.75, -r * 0.2, r * 0.1, s * r * 0.75, 0, r);
    gr.addColorStop(0, '#ffd0a0'); gr.addColorStop(1, '#d9661e');
    g.fillStyle = sw ? 'rgba(255,170,90,.6)' : gr;
    g.beginPath(); g.moveTo(s * r * 1.7, 0); g.quadraticCurveTo(s * r * 0.9, -r * 1.1, 0, -r * 0.6); g.lineTo(0, r * 0.6); g.quadraticCurveTo(s * r * 0.9, r * 1.1, s * r * 1.7, 0); g.fill();
  }
  g.strokeStyle = PAL.bactWall; g.lineWidth = 0.12; g.beginPath(); g.moveTo(0, -r * 0.6); g.lineTo(0, r * 0.6); g.stroke();
  g.restore();
  if ((a.mode === 'comp' && a.st === 'doomed') || a.st === 'eaten') { g.fillStyle = PAL.comp; for (let k = 0; k < 6; k++) { const th = k / 6 * 6.28 + a.seed; g.beginPath(); g.arc(a.x + Math.cos(th) * r * 1.9, a.y + Math.sin(th) * r * 1.2, 0.26, 0, 7); g.fill(); } }
}
// Uropathogenic E. coli: a rod (2 µm × 0.8 µm drawn larger), flagella to swim, sticky pili (FimH) to hold on
function drawEcoli(g, a, t) {
  const sw = a.swell || 0, r = a.r * (a.inside ? 0.8 : 1) * (1 + 0.3 * sw);
  if (!a.inside) halo(g, a.x, a.y, r * 1.4);
  g.save(); g.translate(a.x, a.y); g.rotate(a.att ? a.an : (a.heading || a.seed));
  if (!a.att) {                                          // flagella trailing behind
    g.strokeStyle = 'rgba(255,170,110,.6)'; g.lineWidth = 0.1;
    for (let k = -1; k <= 1; k++) { g.beginPath(); for (let i = 0; i <= 12; i++) { const x = -r * 1.2 - i * 0.35, y = k * 0.3 + Math.sin(i * 0.9 - t * 18 + k) * 0.25; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  } else {                                               // pili holding on
    g.strokeStyle = 'rgba(255,190,140,.75)'; g.lineWidth = 0.08;
    for (let k = 0; k < 10; k++) { const x = -r * 1.1 + k * r * 0.24; g.beginPath(); g.moveTo(x, r * 0.45); g.lineTo(x, r * 0.85); g.stroke(); }
  }
  const gr = g.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
  gr.addColorStop(0, '#ffc08a'); gr.addColorStop(1, '#d4601e');
  g.fillStyle = sw ? 'rgba(255,170,90,.6)' : gr; rrect(g, -r * 1.2, -r * 0.45, r * 2.4, r * 0.9, r * 0.45); g.fill();
  g.strokeStyle = PAL.bactWall; g.lineWidth = 0.12; rrect(g, -r * 1.2, -r * 0.45, r * 2.4, r * 0.9, r * 0.45); g.stroke();
  g.restore();
  if ((a.mode === 'comp' && a.st === 'doomed') || a.st === 'eaten') { g.fillStyle = PAL.comp; for (let k = 0; k < 5; k++) { const th = k / 5 * 6.28 + a.seed; g.beginPath(); g.arc(a.x + Math.cos(th) * r * 1.3, a.y + Math.sin(th) * r * 0.8, 0.24, 0, 7); g.fill(); } }
}
