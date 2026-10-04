// micro.js — the micro view (Canvas 2D): a cross-section of the infected tissue, ~100 µm tall.
// World units ≈ 1 µm. Height is always 100 units; width follows the canvas aspect.
// The model (SIM) decides *how many* of each thing there should be; this file only makes the picture follow it:
//   reconcile() spawns / removes agents toward the target counts, choosing how each one disappears
//   in proportion to the model's separate removal terms (flux).
'use strict';

const MI = {
  cv:null, ctx:null, dpr:1, sc:1, W:160, H:100, scene:'flu',
  agents:[], cells:[], fibro:[], rbc:[], fx:[], specks:[], bg:null,
  now:0, labels:true, hover:null, nextDc:0, inflam:0, capR:4,
};

// ---------- small helpers ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// How many dots to draw for an amount x: 0 below x0, then `perDec` more per ×10, capped. (Logarithmic — not real counts.)
function vis(x, x0, perDec, max) { return x < x0 ? 0 : Math.min(max, 1 + Math.floor((Math.log10(x) - Math.log10(x0)) * perDec)); }

// ---------- layout ----------
const LF = { MUC:18, TOP:32, BOT:62, BM:63.5, CAP:90 };      // flu: mucus top, cell top / bottom, basement membrane, capillary centre
const LS = { SC:12, EPI:16, DER:34, CAP:90 };                 // staph: stratum corneum, epidermis, dermis, capillary
const woundX = () => MI.W * 0.5;
const SITE = () => MI.scene === 'flu' ? null : { x:woundX(), y:44 };

function initMicro(cv) {
  MI.cv = cv; MI.ctx = cv.getContext('2d');
  cv.addEventListener('pointermove', e => { MI.hover = pickAt(e); cv.style.cursor = MI.hover ? 'pointer' : 'default'; });
  cv.addEventListener('pointerleave', () => { MI.hover = null; });
  resizeMicro();
}

function resizeMicro() {
  const r = MI.cv.getBoundingClientRect();
  MI.dpr = Math.min(2, window.devicePixelRatio || 1);
  MI.cv.width = Math.max(1, Math.round(r.width * MI.dpr)); MI.cv.height = Math.max(1, Math.round(r.height * MI.dpr));
  MI.sc = MI.cv.height / MI.H;
  const oldW = MI.W;
  MI.W = Math.max(60, MI.cv.width / MI.sc);
  if (Math.abs(oldW - MI.W) > 0.5 || !MI.bg) buildScene(true);
}

// (Re)build the static parts: background image, epithelial cells / fibroblasts, red blood cells.
function buildScene(keepAgents) {
  const W = MI.W;
  if (!keepAgents) { MI.agents = []; MI.fx = []; }
  else for (const a of MI.agents) a.x = clamp(a.x, 1, W - 1);
  MI.cells = []; MI.fibro = []; MI.rbc = []; MI.specks = [];
  if (MI.scene === 'flu') {
    const n = Math.max(6, Math.round(W / 10)), cw = W / n;
    for (let i = 0; i < n; i++) MI.cells.push({ i, x:i * cw, w:cw, st:'U', tr:1, seed:Math.random() * 10 });
  } else {
    const R = mulberry(7);
    for (let i = 0; i < Math.round(W / 9); i++) {
      const x = R() * W, y = LS.DER + 6 + R() * (LS.CAP - LS.DER - 14);
      if (Math.abs(x - woundX()) < 6 && y < 54) continue;
      MI.fibro.push({ x, y, a:R() * Math.PI, len:9 + R() * 6, hurt:0, d:Math.hypot(x - woundX(), (y - 44) * 1.4) });
    }
    MI.fibro.sort((a, b) => a.d - b.d);
    for (let i = 0; i < 26; i++) MI.specks.push({ x:rnd(0, W), y:rnd(LS.DER + 2, LS.CAP - 6), ph:rnd(0, 6) });
  }
  for (let i = 0; i < Math.round(W / 7); i++) MI.rbc.push({ x:rnd(0, W), dy:rnd(-1.6, 1.6), s:rnd(0.85, 1.1) });
  MI.bg = renderBackground();
}

function setScene(pk) { MI.scene = pk; buildScene(false); MI.nextDc = 0; }

// ---------- background (drawn once per resize) ----------
function renderBackground() {
  const c = document.createElement('canvas'); c.width = MI.cv.width; c.height = MI.cv.height;
  const g = c.getContext('2d'), s = MI.sc, W = MI.W, R = mulberry(3);
  g.scale(s, s);
  if (MI.scene === 'flu') {
    let gr = g.createLinearGradient(0, 0, 0, LF.MUC);
    gr.addColorStop(0, '#0d1620'); gr.addColorStop(1, '#16222a');
    g.fillStyle = gr; g.fillRect(0, 0, W, LF.TOP);
    gr = g.createLinearGradient(0, LF.BM, 0, 100);
    gr.addColorStop(0, '#3b2128'); gr.addColorStop(1, '#2a161c');
    g.fillStyle = gr; g.fillRect(0, LF.BOT, W, 100 - LF.BOT);
    fibers(g, R, W, LF.BM + 2, LF.CAP - 7, '#6b3a44');
    g.fillStyle = '#a77a86'; g.fillRect(0, LF.BM - 0.6, W, 1.2);          // basement membrane
  } else {
    g.fillStyle = '#0f141a'; g.fillRect(0, 0, W, LS.SC);
    let gr = g.createLinearGradient(0, LS.DER, 0, 100);
    gr.addColorStop(0, '#45272c'); gr.addColorStop(1, '#2c171c');
    g.fillStyle = gr; g.fillRect(0, LS.DER, W, 100 - LS.DER);
    fibers(g, R, W, LS.DER + 2, LS.CAP - 7, '#73404a');
    // stratum corneum: flat dead layers
    g.fillStyle = '#c9b49a'; g.fillRect(0, LS.SC, W, LS.EPI - LS.SC);
    g.strokeStyle = 'rgba(80,60,40,.5)'; g.lineWidth = 0.25;
    for (let y = LS.SC + 1; y < LS.EPI; y += 1.1) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 6) g.lineTo(x, y + Math.sin(x * 0.3 + y) * 0.2); g.stroke(); }
    // epidermis: keratinocytes in rows (flatter toward the top)
    for (let row = 0; row < 4; row++) {
      const y0 = LS.EPI + row * 4.5, h = 4.3, w = 8 - row * 0.8;
      for (let x = -R() * w; x < W; x += w) {
        g.fillStyle = `hsl(${22 + row * 3},${38 + row * 5}%,${70 - row * 5}%)`;
        rrect(g, x + 0.25, y0 + 0.25, w - 0.5, h - 0.5, 1.4); g.fill();
        g.fillStyle = 'rgba(110,60,60,.55)'; g.beginPath(); g.ellipse(x + w / 2, y0 + h / 2, w * 0.18, h * 0.22, 0, 0, 7); g.fill();
      }
    }
    g.fillStyle = '#a77a86'; g.fillRect(0, LS.DER - 0.5, W, 1);
    // the cut: a wedge through the skin, filled with clot (fibrin mesh and trapped red cells)
    const cx = woundX();
    g.beginPath(); g.moveTo(cx - 9, LS.SC - 0.5); g.lineTo(cx + 9, LS.SC - 0.5); g.lineTo(cx + 2, 52); g.lineTo(cx - 2, 52); g.closePath();
    g.fillStyle = '#4a1a20'; g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(230,200,170,.35)'; g.lineWidth = 0.25;
    for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(cx + rnd(-10, 10), rnd(10, 52)); g.lineTo(cx + rnd(-10, 10), rnd(10, 52)); g.stroke(); }
    g.fillStyle = 'rgba(200,60,70,.7)';
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

// ---------- agents ----------
// type: v (virion) bac (bacterium) mac nk ctl th neu ab dc pus
const RAD = { v:1.1, bac:1.0, mac:7, nk:4.2, ctl:4, th:4, neu:5, ab:1.4, dc:5, pus:4 };
const SPEED = { mac:5, nk:9, ctl:9, th:7, neu:11, ab:18, dc:4 };
function spawn(type, x, y, extra) {
  const a = { type, x, y, vx:0, vy:0, r:RAD[type], st:'free', born:MI.now, alpha:1, seed:Math.random() * 100, meals:0, ...extra };
  MI.agents.push(a); return a;
}
const alive = a => a.st === 'free' || a.st === 'bud' || a.st === 'fall' || a.st === 'squeeze' || a.st === 'busy';
const countOf = type => { let n = 0; for (const a of MI.agents) if (a.type === type && alive(a)) n++; return n; };
const listOf = type => MI.agents.filter(a => a.type === type && alive(a));

// where each kind of thing lives (wander box)
function zone(a) {
  const W = MI.W;
  if (MI.scene === 'flu') {
    switch (a.type) {
      case 'v': return [1, 3, W - 1, LF.TOP - 1.5];
      case 'mac': return [6, LF.MUC + 4, W - 6, LF.TOP - 6];
      case 'ab': return a.iga ? [1, LF.MUC + 1, W - 1, LF.TOP - 1.5] : [1, LF.BM + 2, W - 12, LF.CAP - 7];
      case 'dc': return [6, LF.BM + 5, W - 14, LF.CAP - 10];
      default: return [5, LF.BM + 4, W - 14, LF.CAP - 8];
    }
  }
  const s = SITE(), R = siteRadius();
  switch (a.type) {
    case 'bac': return [s.x - R, Math.max(LS.SC + 3, s.y - R * 0.8), s.x + R, s.y + R * 0.8];
    case 'pus': return [s.x - 10, s.y - 5, s.x + 10, s.y + 8];
    case 'ab': return [1, LS.DER + 2, W - 12, LS.CAP - 7];
    default: return [5, LS.DER + 4, W - 14, LS.CAP - 7];
  }
}
// how far the bacteria have spread (grows with their number)
function siteRadius() { const B = SIM.o ? SIM.o.pathogen : 1; return clamp(6 + 5 * (Math.log10(Math.max(B, 1)) - 4), 5, Math.min(48, MI.W * 0.45)); }

// ---------- reconcile picture with model ----------
// k: fraction of the gap closed per second (fast when the clock runs fast)
function reconcile(dt, speedDaysPerSec) {
  const o = SIM.o, y = SIM.y, P = SIM.P, fx = SIM.path.flux(y, P);
  const k = clamp(dt * (3 + speedDaysPerSec * 6), 0, 1);
  const step = (cur, want) => { const d = want - cur; return d === 0 ? 0 : Math.sign(d) * Math.max(1, Math.round(Math.abs(d) * k)); };
  if (MI.scene === 'flu') reconcileFlu(o, y, P, fx, step);
  else reconcileStaph(o, y, P, fx, step);
}

function pickWeighted(w) {
  let s = 0; for (const k in w) s += Math.max(0, w[k]);
  let r = Math.random() * s;
  for (const k in w) { r -= Math.max(0, w[k]); if (r <= 0) return k; }
  return Object.keys(w)[0];
}

// a free immune agent (of the given types) closest to p, or null
function nearestFree(types, p, maxD) {
  let best = null, bd = maxD || 1e9;
  for (const a of MI.agents) {
    if (!types.includes(a.type) || a.st !== 'free' || a.tgt || a.tgtCell) continue;
    const d = dist(a, p); if (d < bd) { bd = d; best = a; }
  }
  return best;
}
function doom(v, mode, killer) {
  v.st = 'doomed'; v.mode = mode; v.deadline = MI.now + 4;
  if (killer) { killer.tgt = v; v.killer = killer; }
}

// --- flu ---
function cellCounts() { const c = { U:0, R:0, E:0, I:0, D:0 }; for (const z of MI.cells) c[z.st === 'doom' ? 'D' : z.st]++; return c; }
function wantCells(y) {
  const n = MI.cells.length, N0 = PATHOGENS.flu.N0;
  // The view is the spot where infection is happening, so a few real infected cells already show as one (演出).
  const f = (x, real) => x <= 0 ? 0 : Math.max(real >= 1 ? 1 : 0, Math.round(n * Math.min(1, Math.pow(x, 0.6))));
  const w = { D:f(y.D, y.D * N0), I:f(y.I, y.I * N0), E:f(y.E, y.E * N0), R:f(y.R, y.R * N0 * 1e-3) };
  let over = w.D + w.I + w.E + w.R - n;
  if (over > 0) { const r = Math.min(over, w.R); w.R -= r; over -= r; }
  if (over > 0) { const r = Math.min(over, w.D); w.D -= r; over -= r; }
  if (over > 0) { w.E = Math.max(0, w.E - over); }
  return w;
}
// neighbours of infected / dead cells are chosen first, so infection spreads sideways like a plaque
function pickCell(st, preferNear) {
  const c = MI.cells.filter(z => z.st === st && z.tr >= 1);
  if (!c.length) return null;
  if (preferNear) {
    const near = c.filter(z => MI.cells.some(q => (q.st === 'I' || q.st === 'E' || q.st === 'D') && Math.abs(q.i - z.i) === 1));
    if (near.length && Math.random() < 0.85) return near[Math.floor(Math.random() * near.length)];
  }
  return c[Math.floor(Math.random() * c.length)];
}
function setCell(z, st) { z.st = st; z.tr = 0; z.t0 = MI.now; }

function reconcileFlu(o, y, P, fx, step) {
  const W = MI.W;
  // epithelial cell states
  const w = wantCells(y), c = cellCounts();
  let guard = 0;
  while (c.D < w.D && guard++ < 6) {                     // infected cells die (by the infection itself, NK or killer T)
    const z = pickCell('I') || pickCell('E'); if (!z) break;
    c[z.st]--; c.D++;
    const mode = pickWeighted(fx.infected);
    const killer = mode === 'self' ? null : nearestFree(mode === 'nk' ? ['nk'] : ['ctl'], { x:z.x + z.w / 2, y:LF.BOT });
    if (killer) { killer.tgtCell = z; z.st = 'doom'; z.killer = killer; z.deadline = MI.now + 3.5; }
    else killCell(z, 'self');
  }
  guard = 0;
  while (c.I < w.I && guard++ < 6) { const z = pickCell('E'); if (!z) break; setCell(z, 'I'); c.E--; c.I++; }
  guard = 0;
  while (c.E < w.E && guard++ < 6) {
    const z = pickCell('U', true) || pickCell('R', true); if (!z) break;
    c[z.st]--; setCell(z, 'E'); c.E++;
    // a virion flies into this cell
    const v = listOf('v').sort((a, b) => Math.abs(a.x - z.x) - Math.abs(b.x - z.x))[0];
    if (v) { doom(v, 'cell'); v.to = { x:z.x + z.w / 2, y:LF.TOP + 1 }; }
  }
  guard = 0;
  while (c.D > w.D && guard++ < 4) { const z = pickCell('D'); if (!z) break; setCell(z, 'U'); z.regrow = true; c.D--; c.U++; }
  guard = 0;
  while (c.R < w.R && guard++ < 4) { const z = pickCell('U'); if (!z) break; setCell(z, 'R'); c.U--; c.R++; }
  guard = 0;
  while (c.R > w.R && guard++ < 4) { const z = pickCell('R'); if (!z) break; setCell(z, 'U'); c.R--; c.U++; }
  guard = 0;
  while (c.I > w.I && c.D >= w.D && guard++ < 4) { const z = pickCell('I'); if (!z) break; killCell(z, 'self'); c.I--; }

  // virions
  const wantV = vis(o.pathogen, 20, 12, 140), haveV = countOf('v');
  let d = step(haveV, wantV);
  if (d > 0) {
    const prod = MI.cells.filter(z => z.st === 'I' || z.st === 'doom');
    for (let i = 0; i < d; i++) {
      if (prod.length) {
        const z = prod[Math.floor(Math.random() * prod.length)];
        spawn('v', z.x + rnd(0.2, 0.8) * z.w, LF.TOP - 1, { st:'bud', vy:-rnd(2, 5), vx:rnd(-2, 2) });
      } else spawn('v', rnd(2, W - 2), rnd(-4, 2), { st:'fall', to:{ y:rnd(LF.MUC - 6, LF.TOP - 3) } });   // breathed in, lands on the mucus
    }
  } else if (d < 0) {
    const vs = listOf('v').sort(() => Math.random() - 0.5);
    const wts = { mucus:fx.pathogen.mucus, mac:fx.pathogen.mac, ab:fx.pathogen.ab, cell:fx.pathogen.cell };
    for (let i = 0; i < -d && i < vs.length; i++) {
      const v = vs[i], mode = pickWeighted(wts);
      if (mode === 'mac') { const m = nearestFree(['mac'], v, 45); if (m) { doom(v, 'eat', m); continue; } }
      if (mode === 'ab') { const ab = nearestFree(['ab'], v, 60); doom(v, 'ab', ab); continue; }
      if (mode === 'cell') {
        const z = MI.cells.filter(q => q.st === 'U' || q.st === 'R').sort((a, b) => Math.abs(a.x - v.x) - Math.abs(b.x - v.x))[0];
        if (z) { doom(v, 'cell'); v.to = { x:z.x + z.w / 2, y:LF.TOP + 1 }; continue; }
      }
      doom(v, 'mucus');
    }
  }
  // immune cells
  const sync = (type, want, from) => {
    let dd = step(countOf(type), want);
    if (dd > 0) for (let i = 0; i < dd; i++) from();
    else if (dd < 0) { const l = listOf(type).filter(a => !a.tgt && !a.tgtCell); for (let i = 0; i < -dd && i < l.length; i++) { l[i].st = 'fade'; } }
  };
  const fromCap = type => () => spawn(type, rnd(4, W - 16), LF.CAP - MI.capR, { st:'squeeze' });
  sync('mac', clamp(Math.round(y.M * 1.4), 0, 8), () => spawn('mac', rnd(8, W - 8), LF.MUC + 6, { alpha:0, fadeIn:true }));
  sync('nk', clamp(Math.round(y.NK * 1.1), 0, 10), fromCap('nk'));
  sync('ctl', vis(y.T, 3e4, 2.5, 12), fromCap('ctl'));
  const wantAb = vis(y.Ab, 0.004, 7, 46);
  sync('ab', wantAb, () => { const iga = Math.random() < 0.5; spawn('ab', rnd(2, W - 14), iga ? rnd(LF.MUC + 2, LF.TOP - 2) : LF.CAP - MI.capR, { iga, alpha:0, fadeIn:true }); });
  // dendritic cells: one stays on watch; while antigen is around one leaves for the lymph node every few seconds (演出)
  if (countOf('dc') < 1) spawn('dc', rnd(10, W * 0.6), rnd(LF.BM + 8, LF.CAP - 12), { alpha:0, fadeIn:true });
  if (y.A1 > 0.01 && MI.now > MI.nextDc) {
    const dc = listOf('dc').find(a => !a.leaving);
    if (dc) { dc.leaving = true; dc.st = 'busy'; dc.to = { x:W - 6, y:LF.CAP - 14 }; MI.nextDc = MI.now + 7; }
  }
  MI.inflam = HILL(y.F, 0.3);
}

function killCell(z, how) {
  setCell(z, 'D'); z.how = how;
  const cx = z.x + z.w / 2;
  MI.fx.push({ kind: how === 'self' ? 'pop' : 'stab', x:cx, y:(LF.TOP + LF.BOT) / 2, t0:MI.now, col: how === 'nk' ? '#7fe0c0' : how === 'ctl' ? '#4aa8ff' : '#b07cff' });
}

// --- staph ---
function reconcileStaph(o, y, P, fx, step) {
  const W = MI.W, s = SITE();
  const wantB = vis(o.pathogen, 20, 12, 150);
  let d = step(countOf('bac'), wantB);
  if (d > 0) {
    const bs = listOf('bac');
    for (let i = 0; i < d; i++) {
      if (bs.length) {                                           // binary fission next to a parent → grape-like clusters
        const p = bs[Math.floor(Math.random() * bs.length)], a = rnd(0, 6.28);
        const b = spawn('bac', p.x + Math.cos(a) * 1.9, p.y + Math.sin(a) * 1.9, { st:'bud', parent:p });
        b.x = clamp(b.x, 1, W - 1);
      } else spawn('bac', s.x + rnd(-5, 5), rnd(LS.SC - 8, LS.SC - 2), { st:'fall', to:{ y:rnd(28, 48) } });
    }
  } else if (d < 0) {
    const bs = listOf('bac').sort(() => Math.random() - 0.5);
    for (let i = 0; i < -d && i < bs.length; i++) {
      const b = bs[i], mode = pickWeighted(fx.pathogen);
      if (mode === 'neut' || mode === 'mac') {
        const k = nearestFree(mode === 'neut' ? ['neu', 'mac'] : ['mac', 'neu'], b, 70);
        if (k) { doom(b, 'eat', k); continue; }
      }
      doom(b, 'comp');
    }
  }
  const fromCap = type => () => spawn(type, clamp(s.x + rnd(-W * 0.35, W * 0.35), 4, W - 16), LS.CAP - MI.capR, { st:'squeeze' });
  // neutrophils: when fewer are wanted, the extra ones die where they are and become pus
  {
    let dd = step(countOf('neu'), vis(y.N, 2e4, 4.5, 30));
    if (dd > 0) for (let i = 0; i < dd; i++) fromCap('neu')();
    else if (dd < 0) {
      const l = listOf('neu').filter(a => !a.tgt).sort((a, b) => b.meals - a.meals);
      for (let i = 0; i < -dd && i < l.length; i++) { l[i].st = 'dying'; l[i].t0 = MI.now; }
    }
  }
  const sync = (type, want, from) => {
    let dd = step(countOf(type), want);
    if (dd > 0) for (let i = 0; i < dd; i++) from();
    else if (dd < 0) { const l = listOf(type).filter(a => !a.tgt); for (let i = 0; i < -dd && i < l.length; i++) l[i].st = 'fade'; }
  };
  sync('mac', clamp(Math.round(1 + 3 * P.inn + 3 * HILL(y.Pus, 3e7) * P.inn), 0, 8), () => spawn('mac', rnd(8, W - 18), rnd(LS.DER + 8, LS.CAP - 12), { alpha:0, fadeIn:true }));
  sync('th', vis(y.T, 3e4, 2.5, 9), fromCap('th'));
  sync('ab', vis(y.Ab, 0.004, 7, 46), () => spawn('ab', rnd(4, W - 16), LS.CAP - MI.capR, { alpha:0, fadeIn:true }));
  // pus: mostly made from dying neutrophils (see update); extra ones appear at the site if the model has more
  {
    const want = vis(y.Pus, 3e5, 6, 34), have = countOf('pus');
    let dd = step(have, want);
    if (dd > 0 && !MI.agents.some(a => a.type === 'neu' && a.st === 'dying')) for (let i = 0; i < Math.min(dd, 2); i++) spawn('pus', s.x + rnd(-8, 8), s.y + rnd(-4, 6), { alpha:0, fadeIn:true });
    else if (dd < 0) { const l = listOf('pus'); for (let i = 0; i < -dd && i < l.length; i++) l[i].st = 'fade'; }
  }
  // damaged fibroblasts (closest to the wound first)
  const hurt = Math.round(MI.fibro.length * y.D);
  MI.fibro.forEach((f, i) => { f.hurt += ((i < hurt ? 1 : 0) - f.hurt) * 0.05; });
  MI.inflam = HILL(y.S, 0.6);
}

// ---------- motion ----------
function updateMicro(dt, speedDaysPerSec) {
  MI.now += dt;
  if (SIM.y) reconcile(dt, speedDaysPerSec);
  const W = MI.W;
  MI.capR = 4 + 2.2 * MI.inflam;                         // vessels widen with inflammation
  for (const r of MI.rbc) { r.x += dt * (10 - 4 * MI.inflam); if (r.x > W + 4) r.x -= W + 8; }
  // cells
  for (const z of MI.cells) {
    if (z.tr < 1) z.tr = Math.min(1, z.tr + dt / (z.regrow ? 2.5 : 0.8));
    if (z.tr >= 1) z.regrow = false;
    if (z.st === 'doom' && (MI.now > z.deadline)) { if (z.killer) z.killer.tgtCell = null; killCell(z, 'self'); }
  }
  // agents
  for (const a of MI.agents) {
    a.age = MI.now - a.born;
    if (a.fadeIn) { a.alpha = Math.min(1, a.alpha + dt * 1.5); if (a.alpha >= 1) a.fadeIn = false; }
    if (a.st === 'fade') { a.alpha -= dt * 1.2; continue; }
    if (a.st === 'eaten') {
      const h = a.host; a.x += (h.x - a.x) * Math.min(1, dt * 6); a.y += (h.y - a.y) * Math.min(1, dt * 6);
      a.alpha -= dt * 1.5; a.r *= 1 - dt * 0.8; continue;
    }
    if (a.st === 'dying') {                                 // neutrophil → pus
      if (MI.now - a.t0 > 1.2) {
        a.st = 'gone'; a.alpha = 0;
        if (countOf('pus') < vis(SIM.y.Pus, 3e5, 6, 34) + 1) spawn('pus', a.x, a.y, { alpha:0.3, fadeIn:true });
      }
      continue;
    }
    if (a.st === 'doomed') { moveDoomed(a, dt); continue; }
    if (a.st === 'squeeze') {                               // squeezing out through the vessel wall
      a.y -= dt * 3; if (a.age > 1.1) a.st = 'free';
      continue;
    }
    if (a.st === 'bud') { a.x += a.vx * dt * 0.3; a.y += a.vy * dt * 0.3; if (a.age > 0.6) a.st = 'free'; continue; }
    if (a.st === 'fall') { a.y += dt * 14; a.x += Math.sin(a.seed + a.age * 3) * dt * 2; if (a.y >= a.to.y) a.st = 'free'; continue; }
    if (a.type === 'v' || a.type === 'bac' || a.type === 'pus') { drift(a, dt); continue; }
    crawl(a, dt);
  }
  MI.agents = MI.agents.filter(a => a.alpha > 0.01 && a.st !== 'gone');
  MI.fx = MI.fx.filter(f => MI.now - f.t0 < 1.2);
  // interferon ripples from virus-making cells
  if (SIM.pk === 'flu' && SIM.y && SIM.y.F > 0.02) {
    for (const z of MI.cells) if (z.st === 'I' && Math.random() < dt * 0.7) MI.fx.push({ kind:'ifn', x:z.x + z.w / 2, y:(LF.TOP + LF.BOT) / 2, t0:MI.now, a:HILL(SIM.y.F, 0.2) });
  }
}

function drift(a, dt) {
  const z = zone(a), j = a.type === 'v' ? 16 : a.type === 'bac' ? 3 : 0.6;
  a.vx += (Math.random() - 0.5) * j * dt * 8; a.vy += (Math.random() - 0.5) * j * dt * 8;
  a.vx *= 1 - Math.min(1, dt * 2.5); a.vy *= 1 - Math.min(1, dt * 2.5);
  if (a.type === 'v' && a.y > LF.MUC) a.x -= dt * 1.2;                  // mucus creeps toward the throat (left)
  if (a.type === 'pus') { const s = SITE(); a.vx += (s.x - a.x) * dt * 0.02; a.vy += (s.y - a.y) * dt * 0.02; }
  if (a.type === 'bac') {                                                // bacteria stay in loose clusters
    const s = SITE(); a.vx += (s.x - a.x) * dt * 0.004; a.vy += (s.y - a.y) * dt * 0.004;
  }
  a.x += a.vx * dt; a.y += a.vy * dt;
  if (a.x < z[0]) { if (a.type === 'v') a.x += z[2] - z[0]; else { a.x = z[0]; a.vx = Math.abs(a.vx); } }
  if (a.x > z[2]) { if (a.type === 'v') a.x -= z[2] - z[0]; else { a.x = z[2]; a.vx = -Math.abs(a.vx); } }
  if (a.y < z[1]) { a.y += (z[1] - a.y) * Math.min(1, dt * 3); a.vy = Math.abs(a.vy); }
  if (a.y > z[3]) { a.y = z[3]; a.vy = -Math.abs(a.vy); }
}

function moveTo(a, p, sp, dt) {
  const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy) || 1;
  const s = Math.min(d, sp * dt);
  a.x += dx / d * s; a.y += dy / d * s; a.heading = Math.atan2(dy, dx);
  return d;
}

function crawl(a, dt) {
  const sp = SPEED[a.type] || 5;
  if (a.leaving) {                                        // dendritic cell heading to the lymph vessel
    if (moveTo(a, a.to, sp * 1.5, dt) < 2) { a.st = 'fade'; }
    return;
  }
  if (a.tgt) {
    const t = a.tgt;
    if (t.st !== 'doomed' || t.killer !== a) { a.tgt = null; return; }
    const d = moveTo(a, t, sp * 1.4, dt);
    if (d < a.r + t.r + 0.5) {
      if (a.type === 'ab') { t.st = 'coated'; t.coat = (t.coat || 0) + 1; t.t0 = MI.now; t.alpha = 1; t.fadeAt = MI.now + 0.9; a.tgt = null; }
      else { t.st = 'eaten'; t.host = a; a.tgt = null; a.meals++; a.gulp = MI.now; }
    }
    return;
  }
  if (a.tgtCell) {
    const z = a.tgtCell, p = { x:z.x + z.w / 2, y:LF.BOT + a.r * 0.6 };
    if (z.st !== 'doom') { a.tgtCell = null; return; }
    if (moveTo(a, p, sp * 1.5, dt) < 1.5) { killCell(z, a.type); a.tgtCell = null; a.hit = MI.now; }
    return;
  }
  // neutrophils follow the chemical trail toward the bacteria even without a victim yet
  if (a.type === 'neu' && SIM.o && SIM.o.pathogen > 10) {
    const s = SITE(), R = siteRadius();
    if (!a.wp || dist(a, a.wp) < 2 || MI.now > a.wpT) { a.wp = { x:s.x + rnd(-R, R), y:s.y + rnd(-R * 0.5, R * 0.6) }; a.wpT = MI.now + rnd(2, 5); }
    moveTo(a, a.wp, sp * 0.5, dt);
    return;
  }
  const z = zone(a);
  if (!a.wp || dist(a, a.wp) < 1.5 || MI.now > a.wpT) { a.wp = { x:rnd(z[0], z[2]), y:rnd(z[1], z[3]) }; a.wpT = MI.now + rnd(3, 8); }
  moveTo(a, a.wp, sp * (a.type === 'ab' ? 0.15 : 0.35), dt);
}

function moveDoomed(a, dt) {
  if (a.st === 'coated') return;
  if (a.killer) {                                         // waiting to be eaten; give up after the deadline
    if (MI.now > a.deadline) { if (a.killer.tgt === a) a.killer.tgt = null; a.killer = null; a.mode = a.type === 'v' ? 'mucus' : 'comp'; }
    else { drift(a, dt * 0.3); return; }
  }
  switch (a.mode) {
    case 'cell':                                          // enters an epithelial cell
      if (moveTo(a, a.to, 14, dt) < 1) { a.st = 'fade'; a.alpha = 0.6; }
      return;
    case 'mucus':                                         // carried off with the mucus
      a.x -= dt * 16; a.y += (LF.MUC + 6 - a.y) * Math.min(1, dt * 2); a.alpha -= dt * 0.7;
      return;
    case 'ab': case 'comp':                               // neutralized / lysed (antibody may not reach in time → fades)
      a.alpha -= dt * 0.8; a.coat = (a.coat || 0) + dt * 3;
      return;
    default: a.alpha -= dt;
  }
}
// coated (antibody-bound) virions fade shortly after binding
function updateCoated() { for (const a of MI.agents) if (a.st === 'coated' && MI.now > a.fadeAt) { a.alpha -= 0.04; } }

// ---------- drawing ----------
function drawMicro() {
  const g = MI.ctx, s = MI.sc, W = MI.W, t = MI.now;
  updateCoated();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, MI.cv.width, MI.cv.height);
  if (MI.bg) g.drawImage(MI.bg, 0, 0);
  g.setTransform(s, 0, 0, s, 0, 0);
  const cap = MI.scene === 'flu' ? LF.CAP : LS.CAP;
  // inflammation: tissue reddens and swells with fluid
  if (MI.inflam > 0.02) {
    g.fillStyle = `rgba(255,70,70,${0.16 * MI.inflam})`;
    const top = MI.scene === 'flu' ? LF.BM : LS.DER;
    g.fillRect(0, top, W, 100 - top);
  }
  drawCapillary(g, cap, W, t);
  drawLymph(g, W);
  if (MI.scene === 'flu') { drawEpithelium(g, t); drawMucus(g, W, t); }
  else drawDermis(g, t);
  // agents, back to front
  const order = ['pus', 'dc', 'mac', 'neu', 'nk', 'ctl', 'th', 'bac', 'v', 'ab'];
  for (const ty of order) for (const a of MI.agents) if (a.type === ty) drawAgent(g, a, t);
  for (const f of MI.fx) drawFx(g, f, t);
  if (MI.labels) drawLabels(g, W);
  if (MI.hover && MI.hover.a) {
    const a = MI.hover.a; g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 0.35;
    g.beginPath(); g.arc(a.x, a.y, (a.r || 3) + 1.5, 0, 7); g.stroke();
  }
}

function drawCapillary(g, cy, W, t) {
  const r = MI.capR;
  g.fillStyle = '#5a1820'; g.fillRect(0, cy - r, W, 2 * r);
  g.fillStyle = 'rgba(255,200,200,.55)'; g.fillRect(0, cy - r - 0.6, W, 0.8); g.fillRect(0, cy + r - 0.2, W, 0.8);
  for (const c of MI.rbc) {
    g.fillStyle = '#d8404c'; g.beginPath(); g.ellipse(c.x, cy + c.dy * r / 4, 3.6 * c.s, 1.5 * c.s, 0, 0, 7); g.fill();
    g.fillStyle = '#a82a36'; g.beginPath(); g.ellipse(c.x, cy + c.dy * r / 4, 1.8 * c.s, 0.6 * c.s, 0, 0, 7); g.fill();
  }
  // bacteria in the blood stream (bacteremia)
  if (SIM.pk === 'staph' && SIM.o && SIM.o.blood > 0.05) {
    const n = Math.round(SIM.o.blood * 10);
    g.fillStyle = '#ffd84a';
    for (let i = 0; i < n; i++) { const x = ((t * 9 + i * 37.3) % (W + 10)) - 5; g.beginPath(); g.arc(x, cy + Math.sin(i * 2.1) * r * 0.5, 0.9, 0, 7); g.fill(); }
  }
}
function drawLymph(g, W) {
  const x = W - 6, y0 = MI.scene === 'flu' ? LF.BM + 1 : LS.DER + 1;
  g.fillStyle = 'rgba(200,230,210,.08)'; g.fillRect(x - 3, y0, 6, 100 - y0);
  g.strokeStyle = 'rgba(200,230,210,.35)'; g.lineWidth = 0.4;
  g.beginPath(); g.moveTo(x - 3, y0); g.lineTo(x - 3, 100); g.moveTo(x + 3, y0); g.lineTo(x + 3, 100); g.stroke();
}

function drawEpithelium(g, t) {
  for (const z of MI.cells) {
    const x = z.x + 0.35, w = z.w - 0.7, top = LF.TOP, bot = LF.BOT, h = bot - top, cx = z.x + z.w / 2;
    let hh = h, col = '#e9a3b0', nuc = '#7c3a55', alpha = 1, swell = 0;
    switch (z.st) {
      case 'R': col = '#e7aec0'; break;
      case 'E': col = '#dca2c6'; nuc = '#7a3a8a'; break;
      case 'I': case 'doom': col = '#b783e6'; nuc = '#5d2a90'; swell = 1.5; break;
      case 'D':
        if (z.tr < 1) { alpha = 1 - z.tr; hh = h * (1 - 0.4 * z.tr); col = '#9a7aa8'; nuc = '#4a2a5a'; }
        else { alpha = 0; }
        break;
      case 'U': if (z.regrow) hh = h * (0.25 + 0.75 * z.tr); break;
    }
    if (z.st === 'D') {                                  // debris left behind
      g.fillStyle = 'rgba(160,120,150,.55)';
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + w * (0.2 + 0.2 * k), bot - 2 - (k % 2) * 2, 0.9, 0, 7); g.fill(); }
    }
    if (alpha <= 0) continue;
    g.globalAlpha = alpha;
    const y0 = bot - hh - swell;
    const gr = g.createLinearGradient(0, y0, 0, bot);
    gr.addColorStop(0, col); gr.addColorStop(1, shade(col, -0.25));
    g.fillStyle = gr; rrect(g, x, y0, w, hh + swell, 2.2); g.fill();
    if (z.st === 'R') { g.strokeStyle = 'rgba(102,217,255,.85)'; g.lineWidth = 0.6; rrect(g, x + 0.3, y0 + 0.3, w - 0.6, hh + swell - 0.6, 2); g.stroke(); }
    g.fillStyle = nuc; g.beginPath(); g.ellipse(cx, bot - Math.min(9, hh * 0.32), w * 0.27, Math.min(4.5, hh * 0.16), 0, 0, 7); g.fill();
    if (z.st === 'E' || z.st === 'I' || z.st === 'doom') {   // viral RNA being copied
      g.fillStyle = '#e85dff';
      for (let k = 0; k < (z.st === 'E' ? 3 : 7); k++) { g.beginPath(); g.arc(cx + Math.sin(k * 2.3 + z.seed) * w * 0.25, bot - 9 - Math.cos(k * 1.7 + z.seed) * 6 - (z.st === 'I' ? 6 : 0), 0.45, 0, 7); g.fill(); }
    }
    if (z.st === 'I' || z.st === 'doom') {               // budding bumps on the top surface
      g.fillStyle = '#d07cf0';
      for (let k = 0; k < 4; k++) { const bx = x + w * (0.15 + 0.23 * k), ph = (t * 1.3 + k * 0.7 + z.seed) % 1; g.beginPath(); g.arc(bx, y0 + 0.2 - ph * 0.9, 0.9 * ph + 0.2, 0, 7); g.fill(); }
    }
    // cilia (lost when infected)
    if (z.st === 'U' || z.st === 'R' || z.st === 'E') {
      g.strokeStyle = 'rgba(240,200,210,.8)'; g.lineWidth = 0.35;
      for (let k = 0; k < 6; k++) {
        const bx = x + w * (0.1 + 0.16 * k), ph = Math.sin(t * 9 - z.i * 0.6 - k * 0.25);
        g.beginPath(); g.moveTo(bx, y0); g.quadraticCurveTo(bx + ph * 0.8, y0 - 2.4, bx + ph * 2.2 - 0.6, y0 - 4.2); g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
}
function drawMucus(g, W, t) {
  g.fillStyle = 'rgba(190,225,140,.13)';
  g.beginPath(); g.moveTo(0, LF.TOP - 1);
  for (let x = 0; x <= W; x += 2) g.lineTo(x, LF.MUC + Math.sin(x * 0.12 + t * 0.6) * 1.2 + Math.sin(x * 0.05 - t * 0.3) * 0.8);
  g.lineTo(W, LF.TOP - 1); g.closePath(); g.fill();
}
function drawDermis(g, t) {
  for (const f of MI.fibro) {
    const c = f.hurt;
    g.save(); g.translate(f.x, f.y); g.rotate(f.a);
    g.fillStyle = `rgb(${Math.round(201 - 80 * c)},${Math.round(154 - 40 * c)},${Math.round(138 - 20 * c)})`;
    g.globalAlpha = 0.85 - 0.3 * c;
    g.beginPath(); g.ellipse(0, 0, f.len / 2, 1.4, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(90,40,50,.7)'; g.beginPath(); g.ellipse(0, 0, 1.8, 0.8, 0, 0, 7); g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
  // complement proteins drifting in the tissue fluid
  g.fillStyle = 'rgba(102,224,255,.5)';
  for (const p of MI.specks) { g.beginPath(); g.arc(p.x + Math.sin(t * 0.7 + p.ph) * 2, p.y + Math.cos(t * 0.5 + p.ph) * 1.5, 0.35, 0, 7); g.fill(); }
  // abscess wall (fibrin) when pus has built up
  const pus = SIM.o ? SIM.o.pus || 0 : 0;
  if (pus > 0.2) {
    const s = SITE();
    g.strokeStyle = `rgba(235,215,160,${0.5 * pus})`; g.lineWidth = 1.2; g.setLineDash([1.5, 1]);
    g.beginPath(); g.ellipse(s.x, s.y + 1, 15, 10, 0, 0, 7); g.stroke(); g.setLineDash([]);
  }
}

function drawAgent(g, a, t) {
  g.globalAlpha = clamp(a.alpha, 0, 1);
  const sq = a.st === 'squeeze' ? clamp(a.age / 1.1, 0.3, 1) : 1;
  switch (a.type) {
    case 'v': {
      const r = a.r * (a.st === 'bud' ? clamp(a.age / 0.6, 0.3, 1) : 1);
      g.strokeStyle = '#f0a0ff'; g.lineWidth = 0.22;
      for (let k = 0; k < 10; k++) { const an = k * 0.628 + a.seed; g.beginPath(); g.moveTo(a.x + Math.cos(an) * r, a.y + Math.sin(an) * r); g.lineTo(a.x + Math.cos(an) * (r + 0.55), a.y + Math.sin(an) * (r + 0.55)); g.stroke(); }
      g.fillStyle = '#c04ae0'; g.beginPath(); g.arc(a.x, a.y, r, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,220,255,.5)'; g.beginPath(); g.arc(a.x - r * 0.3, a.y - r * 0.3, r * 0.35, 0, 7); g.fill();
      if (a.st === 'coated' || a.mode === 'ab') drawCoat(g, a, '#ffb54a', 5);
      break;
    }
    case 'bac': {
      const r = a.r * (a.st === 'bud' ? clamp(0.5 + a.age, 0.5, 1) : 1);
      const gr = g.createRadialGradient(a.x - r * 0.35, a.y - r * 0.35, r * 0.1, a.x, a.y, r);
      gr.addColorStop(0, '#fff3a8'); gr.addColorStop(1, '#d9a520');
      g.fillStyle = gr; g.beginPath(); g.arc(a.x, a.y, r, 0, 7); g.fill();
      if (a.st === 'bud') { g.strokeStyle = 'rgba(120,80,0,.6)'; g.lineWidth = 0.15; g.beginPath(); g.arc(a.x, a.y, r, 0, 7); g.stroke(); }
      if (a.mode === 'comp' || a.st === 'eaten') drawCoat(g, a, '#66e0ff', 6, 0.35);
      break;
    }
    case 'mac': {
      const n = 14, r = a.r * (a.gulp && t - a.gulp < 0.4 ? 1.08 : 1);
      g.fillStyle = 'rgba(143,214,176,.78)'; g.strokeStyle = 'rgba(200,255,220,.7)'; g.lineWidth = 0.3;
      g.beginPath();
      for (let k = 0; k <= n; k++) {
        const an = k / n * 6.283, rr = r * (1 + 0.16 * Math.sin(an * 3 + t * 1.4 + a.seed) + 0.08 * Math.sin(an * 5 - t * 2 + a.seed));
        const px = a.x + Math.cos(an) * rr, py = a.y + Math.sin(an) * rr * 0.8;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#3f7a5c'; g.beginPath(); g.ellipse(a.x + 1, a.y, 2.6, 1.8, 0.4, 0, 7); g.fill();
      g.fillStyle = 'rgba(60,90,70,.55)';
      for (let k = 0; k < Math.min(6, a.meals); k++) { g.beginPath(); g.arc(a.x - 3 + (k % 3) * 1.6, a.y - 2 + Math.floor(k / 3) * 3, 0.7, 0, 7); g.fill(); }
      break;
    }
    case 'neu': {
      const r = a.r, dy = a.st === 'dying' ? clamp((t - a.t0) / 1.2, 0, 1) : 0;
      g.save(); g.translate(a.x, a.y); g.scale(1, sq);
      g.fillStyle = `rgba(232,226,242,${0.85 - 0.4 * dy})`; g.beginPath(); g.arc(0, 0, r * (1 - 0.2 * dy), 0, 7); g.fill();
      g.fillStyle = 'rgba(150,130,190,.5)';
      for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(Math.cos(k * 2.4 + a.seed) * r * 0.7, Math.sin(k * 2.4 + a.seed) * r * 0.7, 0.3, 0, 7); g.fill(); }
      g.fillStyle = dy ? '#6a5a7a' : '#6a3aa0';
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(-1.6 + k * 1.6 + dy * (k - 1) * 1.2, (k === 1 ? -0.8 : 0.6), 1.2, 0, 7); g.fill(); }
      g.restore();
      break;
    }
    case 'nk': case 'ctl': case 'th': {
      const col = a.type === 'nk' ? '#7fe0c0' : a.type === 'ctl' ? '#4aa8ff' : '#86c6ff';
      g.save(); g.translate(a.x, a.y); g.scale(1, sq);
      g.fillStyle = col; g.globalAlpha *= 0.85; g.beginPath(); g.arc(0, 0, a.r, 0, 7); g.fill();
      g.globalAlpha = clamp(a.alpha, 0, 1);
      g.fillStyle = shade(col, -0.45); g.beginPath(); g.arc(0.3, 0.2, a.r * 0.62, 0, 7); g.fill();
      if (a.type !== 'th') { g.fillStyle = '#ff5a6a'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(Math.cos(k * 1.7 + a.seed) * a.r * 0.75, Math.sin(k * 1.7 + a.seed) * a.r * 0.75, 0.35, 0, 7); g.fill(); } }
      g.restore();
      break;
    }
    case 'ab': drawY(g, a.x, a.y, a.seed + t * 0.3, 1.0, '#ffb54a'); break;
    case 'dc': {
      g.strokeStyle = 'rgba(230,213,138,.75)'; g.lineWidth = 0.9; g.lineCap = 'round';
      for (let k = 0; k < 6; k++) {
        const an = k * 1.047 + a.seed + Math.sin(t * 0.8 + k) * 0.2, L = 6 + 2.5 * Math.sin(t * 0.6 + k * 2);
        g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(a.x + Math.cos(an + 0.3) * L * 0.6, a.y + Math.sin(an + 0.3) * L * 0.6, a.x + Math.cos(an) * L, a.y + Math.sin(an) * L); g.stroke();
      }
      g.fillStyle = '#e6d58a'; g.beginPath(); g.arc(a.x, a.y, 3, 0, 7); g.fill();
      g.fillStyle = '#8a7a3a'; g.beginPath(); g.arc(a.x, a.y, 1.5, 0, 7); g.fill();
      if (a.leaving) { g.fillStyle = '#e85dff'; g.beginPath(); g.arc(a.x + 1, a.y - 1, 0.6, 0, 7); g.fill(); }
      break;
    }
    case 'pus': {
      g.fillStyle = 'rgba(217,207,138,.75)'; g.beginPath(); g.arc(a.x, a.y, a.r * 0.9, 0, 7); g.fill();
      g.fillStyle = 'rgba(120,100,80,.7)';
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(a.x + Math.cos(k * 1.6 + a.seed) * 1.6, a.y + Math.sin(k * 1.6 + a.seed) * 1.6, 0.6, 0, 7); g.fill(); }
      break;
    }
  }
  g.globalAlpha = 1;
}
function drawCoat(g, a, col, n, size) {
  g.fillStyle = col;
  for (let k = 0; k < n; k++) { const an = k / n * 6.28 + a.seed; g.beginPath(); g.arc(a.x + Math.cos(an) * (a.r + 0.4), a.y + Math.sin(an) * (a.r + 0.4), size || 0.45, 0, 7); g.fill(); }
}
function drawY(g, x, y, an, s, col) {
  g.save(); g.translate(x, y); g.rotate(an); g.strokeStyle = col; g.lineWidth = 0.35 * s; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 1.2 * s); g.lineTo(0, 0); g.lineTo(-0.9 * s, -0.9 * s); g.moveTo(0, 0); g.lineTo(0.9 * s, -0.9 * s); g.stroke();
  g.restore();
}
function drawFx(g, f, t) {
  const k = (t - f.t0) / 1.2;
  if (f.kind === 'ifn') {
    g.strokeStyle = `rgba(102,217,255,${0.45 * f.a * (1 - k)})`; g.lineWidth = 0.5;
    g.beginPath(); g.arc(f.x, f.y, 4 + k * 22, 0, 7); g.stroke();
  } else {
    g.strokeStyle = f.col; g.globalAlpha = 1 - k; g.lineWidth = 0.4;
    for (let i = 0; i < 8; i++) { const an = i * 0.785; g.beginPath(); g.moveTo(f.x + Math.cos(an) * (2 + k * 4), f.y + Math.sin(an) * (2 + k * 4)); g.lineTo(f.x + Math.cos(an) * (3 + k * 7), f.y + Math.sin(an) * (3 + k * 7)); g.stroke(); }
    g.globalAlpha = 1;
  }
}
function drawLabels(g, W) {
  g.font = '2.6px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = 'rgba(255,255,255,.55)'; g.textBaseline = 'middle';
  const L = MI.scene === 'flu'
    ? [['空気の通り道（鼻・のど）', 2, 6], ['粘液', 2, LF.MUC + 2.5], ['上皮細胞', 2, LF.TOP + 5], ['基底膜', 2, LF.BM + 2.2], ['毛細血管', 2, LF.CAP - MI.capR - 2]]
    : [['皮膚の外', 2, 6], ['角質', 2, LS.SC + 2], ['表皮', 2, LS.EPI + 4], ['真皮', 2, LS.DER + 3], ['毛細血管', 2, LS.CAP - MI.capR - 2], ['傷', woundX() + 9.5, LS.SC + 3]];
  for (const [s, x, y] of L) g.fillText(s, x, y);
  g.save(); g.translate(W - 2.2, (MI.scene === 'flu' ? LF.BM : LS.DER) + 3); g.rotate(Math.PI / 2); g.fillText('リンパ管→', 0, 0); g.restore();
  // scale bar: 10 µm
  g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(W - 24, 4, 10, 0.5); g.fillText('10µm', W - 24, 6.5);
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = c => clamp(Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k), 0, 255);
  return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`;
}

// ---------- picking (hover / tap) ----------
function pickAt(e) {
  const r = MI.cv.getBoundingClientRect();
  const x = (e.clientX - r.left) * MI.dpr / MI.sc, y = (e.clientY - r.top) * MI.dpr / MI.sc;
  let best = null, bd = 1e9;
  for (const a of MI.agents) {
    if (a.alpha < 0.3) continue;
    const d = Math.hypot(a.x - x, a.y - y) - Math.max(a.r, 1.6);
    if (d < 1.2 && d < bd) { bd = d; best = a; }
  }
  if (best) return { a:best, key:agentKey(best), x, y };
  if (MI.scene === 'flu') {
    if (y > LF.TOP - 1 && y < LF.BOT) {
      const z = MI.cells.find(c => x >= c.x && x < c.x + c.w);
      if (z && z.st !== 'D') return { key: z.st === 'R' ? 'protectedCell' : z.st === 'U' ? 'cell' : 'infected', x, y };
    }
    if (y >= LF.MUC && y < LF.TOP) return { key:'mucus', x, y };
    if (Math.abs(y - LF.CAP) < MI.capR + 1) return { key:'rbc', x, y };
  } else {
    if (Math.abs(y - LS.CAP) < MI.capR + 1) return { key:'rbc', x, y };
    for (const f of MI.fibro) if (Math.hypot(f.x - x, f.y - y) < 4) return { key:'fibroblast', x, y };
    if (y > LS.SC && y < LS.DER) return { key:'keratinocyte', x, y };
    if (y > LS.DER && y < LS.CAP - 6) return { key:'complement', x, y };
  }
  return null;
}
function agentKey(a) {
  return { v:'virion', bac:'bacterium', mac:'macrophage', nk:'nk', ctl:'ctl', th:'helper', neu:'neutrophil', ab:'antibody', dc:'dc', pus:'pus' }[a.type];
}
