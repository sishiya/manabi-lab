// micro.js — the micro view's *behaviour*: layout, agents, keeping the picture in step with the model, motion, picking.
// Drawing is in draw.js. World units ≈ 1 µm; height is always 100 units, width follows the canvas aspect.
// The model (SIM) decides how many of each thing there should be; reconcile() spawns / removes agents toward those
// counts and chooses how each one disappears in proportion to the model's separate removal terms (flux).
'use strict';

const MI = {
  cv:null, ctx:null, dpr:1, sc:1, W:160, H:100, scene:'airway',
  agents:[], cells:[], fibro:[], rbc:[], fx:[], specks:[], mucins:[], callouts:[], cool:{}, lastCallout:0,
  now:0, labels:true, talk:true, hover:null, view:{ k:1, ox:0, oy:0, z:1 }, detail:6, nextDc:0, inflam:0, capR:4, drug:0,
};

// ---------- small helpers ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// How many dots to draw for an amount x: 0 below x0, then `perDec` more per ×10, capped. (Logarithmic — not real counts.)
function vis(x, x0, perDec, max) { return x < x0 ? 0 : Math.min(max, 1 + Math.floor((Math.log10(x) - Math.log10(x0)) * perDec)); }

// ---------- layout ----------
// flu: air | mucus gel (moves toward the throat) | periciliary layer (watery, cilia beat here) | epithelium | basement
// membrane | lamina propria with a capillary
const LF = { GEL:15, PCL:25, TOP:32, BOT:62, BM:63.5, CAP:90 };
// the gut (norovirus) uses the same rows: contents of the intestine | mucus | brush border | epithelium | …
const LS = { SC:12, EPI:16, DER:34, CAP:90 };                 // skin: stratum corneum, epidermis, dermis, capillary
const LA = { WALL:68, CAP:80, LOW:88 };                        // alveolus: air space | lining fluid + thin wall | capillary | next wall
const LB = { URO:48, UBOT:56, BASE:64, CAP:90 };               // bladder: urine | umbrella cells | deeper urothelium | lamina propria
const FLOW = 2.4;          // drawn speed of the mucus gel (units/s). The real one is far faster — see CELLS.mucus (演出)
const EPI = () => MI.scene === 'airway' || MI.scene === 'gut';           // virus-in-epithelium scenes
const FLOWDIR = () => MI.scene === 'gut' ? 1 : -1;                         // airway mucus → throat (left); gut contents → onward (right)
const CAPY = () => ({ airway:LF.CAP, gut:LF.CAP, skin:LS.CAP, alveolus:LA.CAP, bladder:LB.CAP })[MI.scene];
const TISSUE_TOP = () => ({ airway:LF.BM, gut:LF.BM, skin:LS.DER, alveolus:LA.WALL, bladder:LB.BASE })[MI.scene];
const woundX = () => MI.W * 0.5;
const SITE = () => ({ x:woundX(), y:MI.scene === 'alveolus' ? 58 : MI.scene === 'bladder' ? 40 : 44 });

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
  if (Math.abs(oldW - MI.W) > 0.5 || !MI.cells.length) buildScene(true);
}

// (Re)build the static parts: background image, epithelial cells / fibroblasts, red blood cells.
function buildScene(keepAgents) {
  const W = MI.W;
  if (!keepAgents) { MI.agents = []; MI.fx = []; MI.callouts = []; MI.cool = {}; }
  else for (const a of MI.agents) a.x = clamp(a.x, 1, W - 1);
  MI.cells = []; MI.fibro = []; MI.rbc = []; MI.specks = []; MI.mucins = []; MI.umb = [];
  if (EPI()) {
    const n = Math.max(6, Math.round(W / 10)), cw = W / n, gut = MI.scene === 'gut';
    // airway: most surface cells carry cilia, about one in four is a goblet cell that makes mucus.
    // gut: absorbing cells with a brush border of microvilli, about one in five a goblet cell.
    for (let i = 0; i < n; i++) MI.cells.push({ i, x:i * cw, w:cw, st:'U', tr:1, seed:Math.random() * 10, goblet:gut ? i % 5 === 3 : i % 4 === 2 });
    for (let i = 0; i < W / 4; i++) MI.mucins.push({ x:rnd(0, W), y:rnd(LF.GEL + 1.5, LF.PCL - 1), L:rnd(4, 9), a:rnd(-0.4, 0.4), ph:rnd(0, 6) });
  } else if (MI.scene === 'alveolus') {
    for (let i = 0; i < 30; i++) MI.specks.push({ x:rnd(0, W), y:rnd(10, LA.WALL - 2), ph:rnd(0, 6) });
  } else if (MI.scene === 'bladder') {
    // umbrella cells: big flat surface cells (some with two nuclei)
    const n = Math.max(4, Math.round(W / 16)), cw = W / n;
    for (let i = 0; i < n; i++) MI.umb.push({ i, x:i * cw, w:cw, st:'ok', tr:1, two:i % 3 === 1, seed:Math.random() * 10 });
    for (let i = 0; i < 26; i++) MI.specks.push({ x:rnd(0, W), y:rnd(LB.BASE + 3, LB.CAP - 6), ph:rnd(0, 6) });
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
}

function setScene(pk) { const p = PATHOGENS[pk]; MI.scene = p.scene; MI.look = p.look; MI.pk = pk; buildScene(false); MI.nextDc = 0; MI.nextVoid = 4; MI.vacSeen = 0; }

// ---------- agents ----------
// enemies: v (virion) bac (bacterium) · allies: mac nk ctl th neu ab dc pc (plasma cell) · other: pus, stuck (virion held
// on the cell by an antiviral), drug (medicine molecules, decoration)
const RAD = { v:1.1, bac:1.0, mac:7, nk:4.4, ctl:3.8, th:3.8, neu:5, ab:1.6, dc:4, pc:4.6, pus:4, stuck:1.1, drug:0.4 };
const SPEED = { mac:5, nk:9, ctl:9, th:7, neu:11, ab:18, dc:4, pc:1 };
function spawn(type, x, y, extra) {
  const a = { type, x, y, vx:0, vy:0, r:RAD[type], st:'free', born:MI.now, alpha:1, seed:Math.random() * 100, meals:0, ...extra };
  if ((type === 'v' || type === 'stuck') && a.fil == null) a.fil = MI.look === 'flu' && Math.random() < 0.12 ? rnd(2.5, 4.5) : 0;   // some influenza virions are long filaments
  if (type === 'v' || type === 'stuck') a.r = MI.look === 'noro' ? 0.6 : MI.look === 'corona' ? 1.2 : 1.1;
  if (type === 'bac' && MI.look === 'ecoli') a.r = 1.1;
  MI.agents.push(a); return a;
}
const ALIVE = new Set(['free', 'bud', 'fall', 'squeeze', 'busy', 'tc']);
const alive = a => ALIVE.has(a.st);
const countOf = (type, f) => { let n = 0; for (const a of MI.agents) if (a.type === type && alive(a) && (!f || f(a))) n++; return n; };
const listOf = (type, f) => MI.agents.filter(a => a.type === type && alive(a) && (!f || f(a)));

// where each kind of thing lives (wander box)
function zone(a) {
  const W = MI.W;
  if (EPI()) {
    switch (a.type) {
      case 'v': case 'stuck': return [0, LF.GEL + 1, W, LF.TOP - 1.2];
      case 'mac': return a.surf ? [6, LF.PCL - 3, W - 6, LF.TOP - 4] : [6, LF.BM + 6, W - 14, LF.CAP - 10];
      case 'ab': return a.iga ? [0, LF.GEL + 1, W, LF.TOP - 1.2] : [1, LF.BM + 2, W - 12, LF.CAP - 7];
      case 'dc': return [6, LF.BM + 6, W - 14, LF.CAP - 12];
      case 'pc': return [6, LF.BM + 8, W - 14, LF.CAP - 10];
      case 'drug': return [0, LF.TOP, W, LF.CAP];
      default: return [5, LF.BM + 4, W - 14, LF.CAP - 8];
    }
  }
  const s = SITE(), R = siteRadius();
  if (MI.scene === 'alveolus') {
    switch (a.type) {
      case 'bac': return [s.x - R * 1.4, Math.max(8, LA.WALL - 2 - R * 1.3), s.x + R * 1.4, LA.WALL - 1.2];
      case 'pus': return [s.x - 16, LA.WALL - 9 - 20 * (SIM.y ? SIM.y.D : 0), s.x + 16, LA.WALL - 2];
      case 'mac': return [6, LA.WALL - 12, W - 14, LA.WALL - 5];          // alveolar macrophages sit on the wall
      case 'neu': return [6, Math.max(10, LA.WALL - 30), W - 14, LA.WALL - 4];
      case 'ab': return [1, LA.WALL - 14, W - 12, LA.WALL - 1];
      case 'drug': return [0, LA.WALL - 10, W, LA.LOW];
      default: return [5, LA.WALL + 1, W - 14, LA.CAP - 5];
    }
  }
  if (MI.scene === 'bladder') {
    switch (a.type) {
      case 'bac': return a.att ? [0, LB.URO - 1.5, W, LB.UBOT - 1.5] : [2, 4, W - 2, LB.URO - 1.6];
      case 'neu': return a.urine ? [4, 8, W - 4, LB.URO - 3] : [5, LB.BASE + 3, W - 14, LB.CAP - 7];
      case 'ab': return [1, LB.BASE + 2, W - 12, LB.CAP - 7];
      case 'drug': return [0, LB.URO - 6, W, LB.CAP];
      default: return [5, LB.BASE + 4, W - 14, LB.CAP - 7];
    }
  }
  switch (a.type) {
    case 'bac': return [s.x - R, Math.max(LS.SC + 3, s.y - R * 0.8), s.x + R, s.y + R * 0.8];
    case 'pus': return [s.x - 10, s.y - 5, s.x + 10, s.y + 8];
    case 'ab': return [1, LS.DER + 2, W - 12, LS.CAP - 7];
    case 'drug': return [0, LS.EPI, W, LS.CAP];
    default: return [5, LS.DER + 4, W - 14, LS.CAP - 7];
  }
}
// how far the bacteria have spread (grows with their number)
function siteRadius() { const B = SIM.o ? SIM.o.pathogen : 1; return clamp(6 + 5 * (Math.log10(Math.max(B, 1)) - 4), 5, Math.min(48, MI.W * 0.45)); }

// ---------- reconcile picture with model ----------
// k: fraction of the gap closed per frame (faster when the clock runs fast)
function reconcile(dt, speedDaysPerSec) {
  const o = SIM.o, y = SIM.y, P = SIM.P, fx = SIM.path.flux(y, P);
  const k = clamp(dt * (3 + speedDaysPerSec * 6), 0, 1);
  const step = (cur, want) => { const d = want - cur; return d === 0 ? 0 : Math.sign(d) * Math.max(1, Math.round(Math.abs(d) * k)); };
  if (EPI()) reconcileVirus(o, y, P, fx, step);
  else reconcileBact(o, y, P, fx, step);
  // a vaccine dose was given (in the arm, not here): say where the antibodies here come from
  const given = P.vacc ? P.vacc.filter(td => SIM.t >= td).length : 0;
  if (given > (MI.vacSeen || 0)) {
    MI.vacSeen = given; MI.cool.vac = -99; MI.lastCallout = -99; MI.callouts = [];
    callout('vac', L(`${given}回目のワクチンを腕に注射した。ここには病原体はまだいない。\nできた抗体や記憶細胞が、血液に乗ってここにも届くようになる`, `Vaccine shot ${given} was given in the arm. No germs here yet.\nAntibodies and memory cells made will reach here through the blood`), '#9fd9ee', { x:MI.W / 2, y:TISSUE_TOP() + 12, r:6 }, { cd:0.1, dur:6 });
  }
  syncDrugSpecks(dt);
}

function pickWeighted(w) {
  let s = 0; for (const k in w) s += Math.max(0, w[k]);
  let r = Math.random() * s;
  for (const k in w) { r -= Math.max(0, w[k]); if (r <= 0) return k; }
  return Object.keys(w)[0];
}

// a free immune agent (of the given types, passing f) closest to p, or null
function nearestFree(types, p, maxD, f) {
  let best = null, bd = maxD || 1e9;
  for (const a of MI.agents) {
    if (!types.includes(a.type) || a.st !== 'free' || a.tgt || a.tgtCell || (f && !f(a))) continue;
    const d = dist(a, p); if (d < bd) { bd = d; best = a; }
  }
  return best;
}
function doom(v, mode, killer) {
  v.st = 'doomed'; v.mode = mode; v.deadline = MI.now + 4; v.t0 = MI.now;
  if (killer) { killer.tgt = v; v.killer = killer; }
}
// generic "keep `want` of this type": extra ones fade out (unless busy)
function syncCount(type, want, from, step, f) {
  const dd = step(countOf(type, f), want);
  if (dd > 0) for (let i = 0; i < dd; i++) from();
  else if (dd < 0) { const l = listOf(type, f).filter(a => !a.tgt && !a.tgtCell && a.st === 'free'); for (let i = 0; i < -dd && i < l.length; i++) l[i].st = 'fade'; }
}

// --- flu ---
function cellCounts() { const c = { U:0, R:0, E:0, I:0, D:0 }; for (const z of MI.cells) c[z.st === 'doom' ? 'D' : z.st]++; return c; }
function wantCells(y) {
  const n = MI.cells.length, N0 = SIM.path.N0;
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
const cellTop = z => ({ x:z.x + z.w * rnd(0.25, 0.75), y:LF.TOP - 0.6 });

function reconcileVirus(o, y, P, fx, step) {
  const W = MI.W;
  MI.ose = fx.release; MI.balo = fx.make;
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
  while (c.I < w.I && guard++ < 6) { const z = pickCell('E'); if (!z) break; setCell(z, 'I'); c.E--; c.I++; callout('bud', L('④ 部品が集まり、新しいウイルスが表面から出てくる\n1個の細胞から数千個', '④ Parts gather, and new viruses come out of the surface\nThousands from one cell'), PAL.virus, { cellRef:z, y:LF.TOP + 1, r:4 }); }
  guard = 0;
  while (c.E < w.E && guard++ < 6) {
    const z = pickCell('U', true) || pickCell('R', true); if (!z) break;
    c[z.st]--; setCell(z, 'E'); c.E++;
    // a virion from the mucus binds to this cell and is taken in
    const v = listOf('v').sort((a, b) => Math.abs(a.x - z.x) - Math.abs(b.x - z.x))[0];
    if (v) { doom(v, 'cell'); v.to = cellTop(z); v.cell = z; }
  }
  guard = 0;
  while (c.D > w.D && guard++ < 4) { const z = pickCell('D'); if (!z) break; setCell(z, 'U'); z.regrow = true; c.D--; c.U++; callout('regrow', L('すき間を、下の細胞が分かれて埋める（修理）', 'Cells below divide to fill the gap (repair)'), PAL.cell, { cellRef:z, y:LF.BOT - 8, r:5 }, { cd:16 }); }
  guard = 0;
  while (c.R < w.R && guard++ < 4) { const z = pickCell('U'); if (!z) break; setCell(z, 'R'); c.U--; c.R++; callout('shield', L('インターフェロンを受けて守りを固めた\nウイルスが入っても増えにくい', 'Got interferon and is on guard\nViruses that get in multiply poorly'), PAL.shield, cellMid(z), { cd:18 }); }
  guard = 0;
  while (c.R > w.R && guard++ < 4) { const z = pickCell('R'); if (!z) break; setCell(z, 'U'); c.R--; c.U++; }
  guard = 0;
  while (c.I > w.I && c.D >= w.D && guard++ < 4) { const z = pickCell('I'); if (!z) break; killCell(z, 'self'); c.I--; }

  // virions (only those released into the mucus are counted)
  const wantV = vis(o.pathogen, 30, 8, 70), haveV = countOf('v');
  let d = step(haveV, wantV);
  if (d > 0) {
    const prod = MI.cells.filter(z => z.st === 'I' || z.st === 'doom');
    for (let i = 0; i < d; i++) {
      if (prod.length) {
        const z = prod[Math.floor(Math.random() * prod.length)], p = cellTop(z);
        spawn('v', p.x, p.y, { st:'bud', cell:z });
      } else spawn('v', rnd(2, W - 2), rnd(-4, 2), { st:'fall', to:{ y:rnd(LF.GEL + 1, LF.PCL - 1) } });   // breathed in, lands on the mucus
    }
  } else if (d < 0) {
    const vs = listOf('v', a => a.st === 'free').sort(() => Math.random() - 0.5);
    const wts = { mucus:fx.pathogen.mucus, mac:fx.pathogen.mac, ab:fx.pathogen.ab, cell:fx.pathogen.cell };
    for (let i = 0; i < -d && i < vs.length; i++) {
      const v = vs[i], mode = pickWeighted(wts);
      if (mode === 'mac') { const m = nearestFree(['mac'], v, 45, a => a.surf); if (m) { doom(v, 'eat', m); continue; } }
      if (mode === 'ab') { const ab = nearestFree(['ab'], v, 60, a => a.iga); doom(v, 'ab', ab); continue; }
      if (mode === 'cell') {
        const z = MI.cells.filter(q => q.st === 'U' || q.st === 'R').sort((a, b) => Math.abs(a.x - v.x) - Math.abs(b.x - v.x))[0];
        // bound to a cell protected by interferon (or one that does not make it) — taken in but nothing grows
        if (z) { doom(v, 'cell'); v.to = cellTop(z); v.cell = z; continue; }
      }
      doom(v, 'mucus');
      callout('flow', MI.scene === 'gut' ? L('腸の中身といっしょに流され、便として外へ出る\n（便にはウイルスがとても多い）', 'Carried along with the gut contents and out in stool\n(stool is full of virus)') : L('粘液に乗ってのどへ運ばれていく\nのど → 飲みこむ → 胃酸で分解', 'Carried by mucus to the throat\nthroat → swallowed → broken down by stomach acid'), '#c9e3a0', v, { cd:30 });
    }
  }
  // immune cells
  const fromCap = type => () => spawn(type, rnd(4, W - 16), LF.CAP - MI.capR, { st:'squeeze' });
  // macrophages: most sit under the epithelium; a few live on the airway surface (more in the lungs than the nose)
  const nMac = clamp(Math.round(y.M * 1.4), 0, 8), nSurf = MI.scene === 'gut' ? 0 : nMac >= 2 ? Math.min(2, Math.floor(nMac / 3) + 1) : 0;
  syncCount('mac', nSurf, () => spawn('mac', rnd(8, W - 8), LF.PCL + 1, { surf:true, alpha:0, fadeIn:true }), step, a => a.surf);
  syncCount('mac', nMac - nSurf, () => spawn('mac', rnd(8, W - 16), rnd(LF.BM + 8, LF.CAP - 12), { alpha:0, fadeIn:true }), step, a => !a.surf);
  syncCount('nk', clamp(Math.round(y.NK * 1.1), 0, 10), fromCap('nk'), step);
  syncCount('ctl', vis(y.T, 3e4, 2.5, 12), fromCap('ctl'), step);
  // plasma cells (B cells that make antibody) settle under the epithelium; they make IgA that the epithelial cells
  // carry across to the mucus (transcytosis). IgG comes out of the blood.
  syncCount('pc', vis(y.B, 3e4, 1.6, 5), () => spawn('pc', rnd(8, W - 18), rnd(LF.BM + 8, LF.CAP - 12), { alpha:0, fadeIn:true }), step);
  const wantAb = vis(y.Ab, 0.004, 4.5, 24);
  syncCount('ab', Math.ceil(wantAb * 0.55), () => {
    const pc = listOf('pc')[Math.floor(Math.random() * countOf('pc'))];
    const z = MI.cells.filter(q => q.st === 'U' || q.st === 'R')[0] && MI.cells.filter(q => q.st === 'U' || q.st === 'R').sort((a, b) => Math.abs(a.x - (pc ? pc.x : W / 2)) - Math.abs(b.x - (pc ? pc.x : W / 2)))[0];
    if (pc && z) spawn('ab', pc.x, pc.y, { iga:true, st:'tc', cell:z, leg:0 });
    else spawn('ab', rnd(2, W - 2), rnd(LF.GEL + 2, LF.TOP - 2), { iga:true, alpha:0, fadeIn:true });
  }, step, a => a.iga);
  syncCount('ab', Math.floor(wantAb * 0.45), () => spawn('ab', rnd(4, W - 16), LF.CAP - MI.capR, { alpha:0, fadeIn:true }), step, a => !a.iga);
  // dendritic cells: one on watch with a dendrite reaching between the cells to the surface; while antigen is
  // around one leaves for the lymph node every few seconds (演出)
  if (countOf('dc') < 1) spawn('dc', rnd(10, W * 0.6), rnd(LF.BM + 8, LF.CAP - 14), { alpha:0, fadeIn:true });
  if (y.A1 > 0.01 && MI.now > MI.nextDc) {
    const dc = listOf('dc').find(a => !a.leaving);
    if (dc) { dc.leaving = true; dc.st = 'busy'; dc.to = { x:W - 6, y:LF.CAP - 14 }; MI.nextDc = MI.now + 7; callout('dc', L('樹状細胞がウイルスのかけらを持ってリンパ節へ\nそこでキラーT細胞やB細胞に知らせる', 'A dendritic cell takes virus pieces to a lymph node\nto alert killer T cells and B cells there'), PAL.dc, dc, { cd:20 }); }
  }
  // virions held on the surface of infected cells by a neuraminidase inhibitor (decoration, not counted)
  if (MI.ose > 0.2) for (const z of MI.cells) {
    if ((z.st === 'I' || z.st === 'doom') && Math.random() < 0.05 && countOf('stuck', a => a.cell === z) < 5 * MI.ose) {
      const p = cellTop(z); const s = spawn('stuck', p.x, p.y, { st:'bud', cell:z, life:rnd(6, 10) }); callout('stuck', L('くすりで、できたウイルスが細胞から離れられない', 'The medicine keeps new viruses stuck to the cell'), PAL.drug, s, { cd:18 });
    }
  }
  MI.inflam = HILL(y.F, 0.3);
}

function killCell(z, how) {
  setCell(z, 'D'); z.how = how;
  const cx = z.x + z.w / 2;
  MI.fx.push({ kind: how === 'self' ? 'pop' : 'stab', x:cx, y:(LF.TOP + LF.BOT) / 2, t0:MI.now, how });
  if (how === 'self') callout('die', L('乗っ取られた細胞が力尽きて死んだ\n（ウイルスを出しきると壊れる）', 'A hijacked cell wore out and died\n(it breaks after releasing its viruses)'), '#c9a3ad', cellMid(z), { cd:12 });
  else callout('kill-' + how, how === 'nk' ? L('NK細胞が、感染した細胞を見つけて壊した', 'An NK cell found an infected cell and destroyed it') : L('キラーT細胞が、感染した細胞を壊した\n（ウイルス工場をつぶす）', 'A killer T cell destroyed an infected cell\n(wrecking a virus factory)'), how === 'nk' ? PAL.nk : PAL.ctl, cellMid(z), { cd:10 });
  // a macrophage under the epithelium comes to clear the remains (it eats dying cells)
  const m = nearestFree(['mac'], { x:cx, y:LF.BM + 5 }, 50, a => !a.surf);
  if (m) { m.wp = { x:cx, y:LF.BM + m.r * 0.7 }; m.wpT = MI.now + 5; m.meals++; }
}

// --- bacteria (skin, alveolus, bladder) ---
// where bacteria come from when there are none on screen yet
function bactEntry(s) {
  if (MI.scene === 'skin') return { x:s.x + rnd(-5, 5), y:rnd(LS.SC - 8, LS.SC - 2), st:'fall', to:{ y:rnd(28, 48) } };
  if (MI.scene === 'alveolus') return { x:s.x + rnd(-12, 12), y:rnd(-4, 4), st:'fall', to:{ y:rnd(LA.WALL - 12, LA.WALL - 2) } };   // breathed in deep
  return { x:rnd(2, 12), y:rnd(25, LB.URO - 4), vx:rnd(3, 6) };                // bladder: swims in from the urethra side
}
function reconcileBact(o, y, P, fx, step) {
  const W = MI.W, s = SITE(), bl = MI.scene === 'bladder';
  // the bladder has two groups: floating in the urine, and stuck to / inside the umbrella cells
  const groups = bl ? [[false, vis(o.free, 30, 9, 60)], [true, vis(o.att, 30, 7, 40)]] : [[false, vis(o.pathogen, 30, 9, 90)]];
  for (const [att, want] of groups) {
    const inGroup = a => !!a.att === att;
    const d = step(countOf('bac', inGroup), want);
    if (d > 0) {
      const bs = listOf('bac', a => inGroup(a) && a.st === 'free');
      for (let i = 0; i < d; i++) {
        if (att) {                                          // sticks to an umbrella cell with its pili, or grows inside it
          const ok = MI.umb.filter(c => c.st === 'ok'); if (!ok.length) break;
          const homes = ok.filter(c => bs.some(b => b.home === c));
          const u = homes.length && Math.random() < 0.7 ? homes[Math.floor(Math.random() * homes.length)] : ok[Math.floor(Math.random() * ok.length)];
          const crowd = bs.filter(b => b.home === u).length, inside = crowd >= 2;
          const b = spawn('bac', u.x + u.w * rnd(0.2, 0.8), inside ? rnd(LB.URO + 1.8, LB.UBOT - 2) : LB.URO - 0.9, { att:true, home:u, inside, an:rnd(0, 3) });
          bs.push(b);
          if (inside) callout('ibc', L('菌が細胞の中に入りこんで増えている\n（薬も免疫細胞も届きにくい）', 'Bacteria got inside a cell and are multiplying\n(hard for medicine and immune cells to reach)'), PAL.bact, b, { cd:20 });
          else callout('pili', L('菌が線毛（ピリ）で膀胱の細胞にくっついた\nもう尿では流されない', 'A bacterium stuck to a bladder cell with its pili\nUrine can no longer wash it away'), PAL.bact, b, { cd:20 });
          continue;
        }
        if (bs.length) {                                    // binary fission next to a parent
          const p = bs[Math.floor(Math.random() * bs.length)], an = rnd(0, 6.28);
          const b = spawn('bac', p.x + Math.cos(an) * 1.95, p.y + Math.sin(an) * 1.95, { st:'bud', parent:p, an });
          callout('divide', L('菌が2つに分かれて増えた\n（細胞の外で、自分で増える）', 'A bacterium split in two\n(it multiplies by itself, outside cells)'), PAL.bact, b, { cd:16 });
          b.x = clamp(b.x, 1, W - 1);
        } else { const e = bactEntry(s); spawn('bac', e.x, e.y, e); }
      }
    } else if (d < 0) {
      const bs = listOf('bac', a => inGroup(a) && a.st === 'free').sort(() => Math.random() - 0.5);
      const w = { ...fx.pathogen };
      if (bl) { if (att) delete w.wash; else delete w.exfol; }
      for (let i = 0; i < -d && i < bs.length; i++) {
        const b = bs[i], mode = pickWeighted(w);
        if (mode === 'neut' || mode === 'mac') {
          const k = nearestFree(mode === 'neut' ? ['neu', 'mac'] : ['mac', 'neu'], b, 70);
          if (k) { doom(b, 'eat', k); continue; }
        }
        if (mode === 'exfol' && b.home) { shedUmbrella(b.home); continue; }
        if (mode === 'wash') { doom(b, 'wash'); continue; }
        doom(b, mode === 'abx' ? 'lyse' : 'comp');
        if (mode === 'abx') callout('lyse', L('抗生物質: 菌が壁を作れず、破れた', 'Antibiotic: the bacterium could not build its wall and burst'), PAL.drug, b, { cd:12 });
        else callout('comp', L('補体が菌に穴をあけて壊した', 'Complement punched holes in a bacterium and destroyed it'), PAL.comp, b, { cd:18 });
      }
    }
  }
  const capY = CAPY();
  const fromCap = type => () => spawn(type, clamp(s.x + rnd(-W * 0.35, W * 0.35), 4, W - 16), capY - MI.capR, { st:'squeeze', urine:bl && type === 'neu' && Math.random() < 0.6 });
  // neutrophils: when fewer are wanted, the extra ones die where they are (and become pus in skin / alveoli)
  {
    const dd = step(countOf('neu'), vis(y.N, 2e4, 3.2, 18));
    if (dd > 0) for (let i = 0; i < dd; i++) fromCap('neu')();
    else if (dd < 0) {
      const l = listOf('neu', a => !a.tgt && a.st === 'free').sort((a, b) => b.meals - a.meals);
      for (let i = 0; i < -dd && i < l.length; i++) {
        l[i].st = 'dying'; l[i].t0 = MI.now;
        if (!bl) callout('pus', MI.scene === 'alveolus' ? L('好中球が力尽きた。死んだ好中球やしみ出た液が\n肺胞をうめていく（息が苦しくなる）', 'A neutrophil wore out. Dead neutrophils and leaked fluid\nfill the alveoli (breathing gets hard)') : L('好中球が力尽きた。死んだ好中球が「うみ」になる', 'A neutrophil wore out. Dead neutrophils become “pus”'), PAL.pus, l[i], { cd:18 });
      }
    }
  }
  const macTop = MI.scene === 'alveolus' ? LA.WALL - 12 : TISSUE_TOP() + 8, macBot = MI.scene === 'alveolus' ? LA.WALL - 6 : capY - 12;
  syncCount('mac', clamp(Math.round(1 + 3 * P.inn + 3 * HILL(y.Pus || 0, 3e7) * P.inn), 0, 8), () => spawn('mac', rnd(8, W - 18), rnd(macTop, macBot), { alpha:0, fadeIn:true }), step);
  syncCount('th', vis(y.T, 3e4, 2.5, 9), fromCap('th'), step);
  syncCount('ab', vis(y.Ab, 0.004, 4.5, 24), () => spawn('ab', rnd(4, W - 16), capY - MI.capR, { alpha:0, fadeIn:true }), step);
  // pus (skin) / exudate filling the alveoli: mostly made from dying neutrophils (see update)
  if (!bl) {
    const want = vis(y.Pus, 3e5, 4, 20), have = countOf('pus');
    const dd = step(have, want);
    const at = MI.scene === 'alveolus' ? { x:s.x, y:LA.WALL - 4 } : s;
    if (dd > 0 && !MI.agents.some(a => a.type === 'neu' && a.st === 'dying')) for (let i = 0; i < Math.min(dd, 2); i++) spawn('pus', at.x + rnd(-8, 8), at.y + rnd(-4, 4), { alpha:0, fadeIn:true });
    else if (dd < 0) { const l = listOf('pus'); for (let i = 0; i < -dd && i < l.length; i++) l[i].st = 'fade'; }
  }
  // damaged fibroblasts (closest to the wound first)
  const hurt = Math.round(MI.fibro.length * y.D);
  MI.fibro.forEach((f, i) => { f.hurt += ((i < hurt ? 1 : 0) - f.hurt) * 0.05; });
  MI.inflam = HILL(y.S, 0.6);
}

// an infected umbrella cell lets go and is carried off in the urine with the bacteria on / in it (a defence)
function shedUmbrella(u) {
  if (u.st !== 'ok') return;
  u.st = 'shed'; u.tr = 0; u.t0 = MI.now;
  for (const b of MI.agents) if (b.type === 'bac' && b.home === u && alive(b)) { b.st = 'doomed'; b.mode = 'exfol'; b.t0 = MI.now; }
  callout('exfol', L('菌のついた細胞が自分からはがれ落ち、菌ごと尿へ\n（からだの守りの一つ。下の細胞が新しく表面になる）', 'A cell with bacteria peels itself off into the urine, bacteria and all\n(a body defense; the cells below become the new surface)'), PAL.cell, { x:u.x + u.w / 2, y:LB.URO + 3, r:6 }, { cd:18 });
}

// medicine molecules seep out of the capillary while a drug is working (decoration)
function syncDrugSpecks(dt) {
  const P = SIM.P, t = SIM.t;
  let L = 0;
  for (const k of SIM.path.drugs || []) { const D = DRUGS[k]; if (D && (D.eff || D.kill)) L = Math.max(L, drugLevel(P, k, t)); }
  MI.drug = L;
  const want = Math.round(L * 24), have = countOf('drug');
  if (have < want && Math.random() < dt * 20) spawn('drug', rnd(2, MI.W - 12), CAPY() - MI.capR, { vy:-rnd(2, 5) });
  if (have > want) { const l = listOf('drug'); if (l.length) l[0].st = 'fade'; }
}

// incision and drainage: pus and many bacteria leave through the cut (visual for simDrain)
function microDrain() {
  const s = SITE();
  for (const a of MI.agents) {
    if ((a.type === 'pus' && alive(a)) || (a.type === 'bac' && a.st === 'free' && Math.random() < 0.75)) { a.st = 'doomed'; a.mode = 'drain'; a.t0 = MI.now; a.to = { x:s.x + rnd(-3, 3), y:LS.SC - 8 }; }
  }
  MI.fx.push({ kind:'drain', x:s.x, y:LS.SC, t0:MI.now });
}

// ---------- motion ----------
function updateMicro(dt, speedDaysPerSec) {
  MI.now += dt;
  if (SIM.y) reconcile(dt, speedDaysPerSec);
  const W = MI.W;
  MI.capR = 4 + 2.2 * MI.inflam;                         // vessels widen with inflammation
  for (const r of MI.rbc) { r.x += dt * (10 - 4 * MI.inflam); if (r.x > W + 4) r.x -= W + 8; }
  for (const m of MI.mucins) { m.x += FLOWDIR() * dt * FLOW; if (m.x < -10) m.x += W + 20; if (m.x > W + 10) m.x -= W + 20; }
  for (const u of MI.umb) {                                // shed umbrella cells are replaced from below
    if (u.st === 'shed') { u.tr = Math.min(1, u.tr + dt / 1.2); if (u.tr >= 1) { u.st = 'grow'; u.tr = 0; } }
    else if (u.st === 'grow') { u.tr = Math.min(1, u.tr + dt / 3); if (u.tr >= 1) u.st = 'ok'; }
  }
  // bladder: every few seconds an urination washes the floating bacteria and neutrophils away (演出: the model removes
  // them continuously; here the flushes are shown spaced out)
  if (MI.scene === 'bladder' && speedDaysPerSec > 0 && MI.now > MI.nextVoid) {
    MI.nextVoid = MI.now + 9; MI.voidT = MI.now;
    callout('void', L('おしっこで、浮いている菌が流し出される\n（細胞にくっついた菌は残る）', 'Peeing flushes out the floating bacteria\n(bacteria stuck to cells stay)'), '#e8d97a', { x:MI.W * 0.6, y:24, r:8 }, { cd:30 });
  }
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
    if (a.st === 'fade') { a.alpha -= dt * 1.2; if (a.iga || a.type === 'v') a.x += FLOWDIR() * dt * FLOW; continue; }
    if (a.st === 'eaten') {
      const h = a.host; a.x += (h.x - a.x) * Math.min(1, dt * 6); a.y += (h.y - a.y) * Math.min(1, dt * 6);
      a.alpha -= dt * 1.5; a.r *= 1 - dt * 0.8; continue;
    }
    if (a.st === 'dying') {                                 // neutrophil → pus
      if (MI.now - a.t0 > 1.2) {
        a.st = 'gone'; a.alpha = 0;
        if (MI.scene !== 'bladder' && countOf('pus') < vis(SIM.y.Pus || 0, 3e5, 4, 20) + 1) spawn('pus', a.x, a.y, { alpha:0.3, fadeIn:true });
      }
      continue;
    }
    if (a.st === 'doomed') { moveDoomed(a, dt); continue; }
    if (a.st === 'coated') { if (a.type === 'v') carried(a, dt, 2.5); if (MI.now > a.fadeAt) a.alpha -= dt * 0.7; continue; }
    if (a.st === 'squeeze') { a.y -= dt * 3; if (a.age > 1.1) a.st = 'free'; continue; }   // squeezing out through the vessel wall
    if (a.st === 'bud') {                                   // pinching off the cell surface
      if (a.age > 0.9) { a.st = 'free'; if (a.type === 'v') a.vy = -rnd(0.5, 1.5); }
      if (a.type === 'bac') { const p = a.parent; if (p) { a.x = p.x + Math.cos(a.an) * 1.95 * (0.5 + 0.5 * clamp(a.age / 0.9, 0, 1)); a.y = p.y + Math.sin(a.an) * 1.95 * (0.5 + 0.5 * clamp(a.age / 0.9, 0, 1)); } }
      continue;
    }
    if (a.st === 'fall') { a.y += dt * 14; a.x += Math.sin(a.seed + a.age * 3) * dt * 2; if (a.y >= a.to.y) a.st = 'free'; continue; }
    if (a.st === 'tc') { transcytosis(a, dt); continue; }
    if (a.type === 'stuck') { if (a.age > a.life || !a.cell || (a.cell.st !== 'I' && a.cell.st !== 'doom')) a.st = 'fade'; continue; }
    if (a.type === 'drug') { a.vy += (Math.random() - 0.5) * dt * 20; a.vx += (Math.random() - 0.5) * dt * 20; a.vx *= 0.96; a.vy *= 0.96; a.x += a.vx * dt; a.y += a.vy * dt; const z = zone(a); a.y = clamp(a.y, z[1], z[3]); if (a.x < 0) a.x += MI.W; if (a.x > MI.W) a.x -= MI.W; continue; }
    if (a.type === 'v' || (a.type === 'ab' && a.iga && !a.tgt)) { carried(a, dt, 1); continue; }
    if (a.type === 'bac' && a.att) continue;                // stuck on / inside an umbrella cell
    if (MI.voidT && MI.now - MI.voidT < 1.4 && ((a.type === 'bac' && !a.att) || (a.type === 'neu' && a.urine)) && a.st === 'free') {
      a.x += dt * 45; if (a.x > MI.W + 3) { a.st = 'gone'; a.alpha = 0; } continue;   // swept out with the urine
    }
    if (a.type === 'bac' || a.type === 'pus') { drift(a, dt); continue; }
    crawl(a, dt);
  }
  MI.agents = MI.agents.filter(a => a.alpha > 0.01 && a.st !== 'gone');
  MI.fx = MI.fx.filter(f => MI.now - f.t0 < (f.kind === 'drain' ? 2 : 1.2));
  MI.callouts = MI.callouts.filter(c => MI.now - c.t0 < c.dur && (c.target.cellRef || c.target.alpha == null || c.target.alpha > 0.05));
  // interferon ripples from virus-making cells
  if (EPI() && SIM.y && SIM.y.F > 0.02) {
    for (const z of MI.cells) if (z.st === 'I' && Math.random() < dt * 0.7) MI.fx.push({ kind:'ifn', x:z.x + z.w / 2, y:(LF.TOP + LF.BOT) / 2, t0:MI.now, a:HILL(SIM.y.F, 0.2) });
  }
}

// Virions and IgA cannot swim. In the mucus gel they ride along with it toward the throat; in the watery layer
// next to the cells they jiggle (diffusion) and move little. They slowly sink from the gel toward the cells
// (influenza's neuraminidase cuts through the mucus).
function carried(a, dt, k) {
  const inGel = a.y < LF.PCL;
  a.x += FLOWDIR() * dt * FLOW * (inGel ? 1 : 0.15) * k;
  const j = inGel ? 1.2 : 5;
  a.vx += (Math.random() - 0.5) * j * dt * 8; a.vy += (Math.random() - 0.5) * j * dt * 8 + (a.type === 'v' ? dt * 0.35 : 0);
  a.vx *= 1 - Math.min(1, dt * 3); a.vy *= 1 - Math.min(1, dt * 3);
  a.x += a.vx * dt; a.y += a.vy * dt;
  const z = zone(a);
  if (a.x < -2) a.x += MI.W + 4;                          // carried off to the left; new mucus arrives from the right
  if (a.x > MI.W + 2) a.x -= MI.W + 4;
  if (a.y < z[1]) { a.y = z[1]; a.vy = Math.abs(a.vy); }
  if (a.y > z[3]) { a.y = z[3]; a.vy = -Math.abs(a.vy); }
}

function drift(a, dt) {
  const z = zone(a), j = a.type === 'bac' ? 3 : 0.6;
  a.vx += (Math.random() - 0.5) * j * dt * 8; a.vy += (Math.random() - 0.5) * j * dt * 8;
  a.vx *= 1 - Math.min(1, dt * 2.5); a.vy *= 1 - Math.min(1, dt * 2.5);
  const s = SITE();
  if (a.type === 'pus' && MI.scene !== 'bladder') { a.vx += (s.x - a.x) * dt * 0.02; a.vy += (s.y - a.y) * dt * 0.02; }
  if (a.type === 'bac' && MI.scene !== 'bladder') { a.vx += (s.x - a.x) * dt * 0.004; a.vy += (s.y - a.y) * dt * 0.004; }
  if (a.type === 'bac' && MI.scene === 'bladder') { const h = a.seed + MI.now * 0.4; a.vx += Math.cos(h) * dt * 6; a.vy += Math.sin(h * 1.3) * dt * 6; a.heading = Math.atan2(a.vy, a.vx); }   // E. coli swims with its flagella   // loose clusters
  a.x += a.vx * dt; a.y += a.vy * dt;
  if (a.x < z[0]) { a.x = z[0]; a.vx = Math.abs(a.vx); }
  if (a.x > z[2]) { a.x = z[2]; a.vx = -Math.abs(a.vx); }
  if (a.y < z[1]) { a.y += (z[1] - a.y) * Math.min(1, dt * 3); a.vy = Math.abs(a.vy); }
  if (a.y > z[3]) { a.y = z[3]; a.vy = -Math.abs(a.vy); }
}

function moveTo(a, p, sp, dt) {
  const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy) || 1;
  const s = Math.min(d, sp * dt);
  a.x += dx / d * s; a.y += dy / d * s; if (s > 0.01) a.heading = Math.atan2(dy, dx);
  return d;
}

// IgA: plasma cell → base of an epithelial cell → carried up inside it → released into the mucus
function transcytosis(a, dt) {
  const z = a.cell, cx = z.x + z.w / 2;
  if (a.leg === 0) { if (moveTo(a, { x:cx, y:LF.BOT + 1 }, 10, dt) < 0.6) a.leg = 1; }
  else if (a.leg === 1) { if (moveTo(a, { x:cx + Math.sin(a.seed) * z.w * 0.2, y:LF.TOP - 0.5 }, 6, dt) < 0.6) { a.leg = 2; a.st = 'free'; a.vy = -1; callout('iga', L('抗体（IgA）が上皮細胞を通りぬけて粘液へ', 'Antibodies (IgA) pass through the lining cells into the mucus'), PAL.ab, a, { cd:24 }); } }
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
      if (a.type === 'ab') { t.st = 'coated'; t.t0 = MI.now; t.alpha = 1; t.fadeAt = MI.now + 1.6; t.abBy = a; a.tgt = null; a.st = 'fade'; callout('abbind', L('抗体がウイルスをつかまえた\n細胞に入れなくなり、粘液で流される', 'An antibody caught a virus\nIt cannot enter cells and is washed away by mucus'), PAL.ab, t, { cd:14 }); }
      else { t.st = 'eaten'; t.host = a; a.tgt = null; a.meals++; a.gulp = MI.now; callout('eat-' + a.type + t.type, L(`${a.type === 'mac' ? 'マクロファージ' : '好中球'}が${t.type === 'v' ? 'ウイルス' : '菌'}を食べた`, `${a.type === 'mac' ? 'A macrophage' : 'A neutrophil'} ate ${t.type === 'v' ? 'a virus' : 'a bacterium'}`), a.type === 'mac' ? PAL.mac : PAL.neu, a, { cd:12 }); }
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
  if (a.type === 'neu' && SIM.o && SIM.o.pathogen > 10 && MI.scene !== 'bladder') {
    const s = SITE(), R = siteRadius();
    if (!a.wp || dist(a, a.wp) < 2 || MI.now > a.wpT) { a.wp = { x:s.x + rnd(-R, R), y:s.y + rnd(-R * 0.5, R * 0.6) }; a.wpT = MI.now + rnd(2, 5); }
    moveTo(a, a.wp, sp * 0.5, dt);
    return;
  }
  const z = zone(a);
  if (!a.wp || dist(a, a.wp) < 1.5 || MI.now > a.wpT) { a.wp = { x:rnd(z[0], z[2]), y:rnd(z[1], z[3]) }; a.wpT = MI.now + rnd(3, 8); }
  moveTo(a, a.wp, sp * (a.type === 'ab' ? 0.15 : a.type === 'pc' ? 0.3 : 0.35), dt);
}

function moveDoomed(a, dt) {
  if (a.killer) {                                         // waiting to be eaten / bound; give up after the deadline
    if (MI.now > a.deadline) { if (a.killer.tgt === a) a.killer.tgt = null; a.killer = null; a.mode = a.type === 'v' ? 'mucus' : 'comp'; }
    else { if (a.type === 'v') carried(a, dt, 0.3); else drift(a, dt * 0.3); return; }
  }
  switch (a.mode) {
    case 'cell': {                                        // binds the cell surface, then is swallowed in a bubble (endocytosis)
      if (!a.phase) { if (moveTo(a, a.to, 6, dt) < 0.3) { a.phase = 1; a.t1 = MI.now; callout('attach', L('① ウイルスが細胞の表面の糖にくっついた', '① A virus stuck to sugars on the cell surface'), PAL.virus, a, { cd:12 }); } }
      else if (a.phase === 1) { if (MI.now - a.t1 > 1.0) { a.phase = 2; callout('endo', L('② 膜の袋に包まれて、細胞の中へ', '② Wrapped in a membrane bag, into the cell'), PAL.virus, a, { cd:12 }); } }
      else {
        const z = a.cell, n = { x:z.x + z.w / 2, y:LF.BOT - 9 };
        if (moveTo(a, n, 5, dt) < 1.2) {
          a.st = 'gone'; a.alpha = 0;
          if (z.st === 'E' || z.st === 'I') { MI.fx.push({ kind:'rnp', x:n.x, y:n.y, t0:MI.now }); callout('copy', L('③ 遺伝子が核に入り、コピーが始まる\n数時間は外から何も見えない', '③ Its genes enter the nucleus and copying begins\nNothing shows from outside for hours'), PAL.virus, { cellRef:z, y:n.y, r:4 }, { cd:12 }); }
        }
      }
      return;
    }
    case 'mucus':                                         // carried off toward the throat with the mucus
      a.x += FLOWDIR() * dt * FLOW * 4; a.y += (LF.GEL + 5 - a.y) * Math.min(1, dt * 2); a.alpha -= dt * 0.6;
      return;
    case 'ab': case 'comp':                               // neutralized (no antibody reached it) / complement holes
      a.alpha -= dt * 0.8; a.coat = (a.coat || 0) + dt * 3;
      if (a.type === 'v') a.x += FLOWDIR() * dt * FLOW;
      return;
    case 'lyse':                                          // antibiotic: the wall gives way, the cell bursts
      a.swell = Math.min(1, (MI.now - a.t0) / 0.8); if (a.swell >= 1) a.alpha -= dt * 2.5;
      return;
    case 'wash':                                          // washed out with the urine
      a.x += dt * 30; a.alpha -= dt * 0.9;
      return;
    case 'exfol':                                         // leaves with the shed umbrella cell
      a.y -= dt * 6; a.x += dt * 4; a.alpha -= dt * 0.5;
      return;
    case 'drain':
      if (moveTo(a, a.to, 22, dt) < 2) a.alpha -= dt * 3;
      return;
    default: a.alpha -= dt;
  }
}

// ---------- picking (hover / tap) ----------
function pickAt(e) {
  const r = MI.cv.getBoundingClientRect();
  if (!MI.tissueMain) return null;
  const x = ((e.clientX - r.left) * MI.dpr - MI.view.ox) / MI.view.k, y = ((e.clientY - r.top) * MI.dpr - MI.view.oy) / MI.view.k;
  let best = null, bd = 1e9;
  for (const a of MI.agents) {
    if (a.alpha < 0.3) continue;
    const d = Math.hypot(a.x - x, a.y - y) - Math.max(a.r, 1.6);
    if (d < 1.2 && d < bd) { bd = d; best = a; }
  }
  if (best) return { a:best, key:agentKey(best), x, y };
  if (Math.abs(y - CAPY()) < MI.capR + 1) return { key:'rbc', x, y };
  if (EPI()) {
    const gut = MI.scene === 'gut';
    if (y > LF.TOP - 1 && y < LF.BOT) {
      const z = MI.cells.find(c => x >= c.x && x < c.x + c.w);
      if (z && z.st !== 'D') return { key: z.st === 'R' ? 'protectedCell' : z.st === 'U' ? (z.goblet ? 'goblet' : gut ? 'enterocyte' : 'cell') : 'infected', x, y };
    }
    if (y >= LF.GEL && y < LF.TOP) return { key: gut ? 'gutMucus' : 'mucus', x, y };
    if (gut && y < LF.GEL) return { key:'chyme', x, y };
  } else if (MI.scene === 'alveolus') {
    if (y > LA.WALL - 1 && y < LA.WALL + 3) return { key:'alvWall', x, y };
    if (y < LA.WALL) return { key:'airspace', x, y };
  } else if (MI.scene === 'bladder') {
    if (y > LB.URO - 1 && y < LB.UBOT) return { key:'umbrella', x, y };
    if (y < LB.URO) return { key:'urine', x, y };
  } else {
    for (const f of MI.fibro) if (Math.hypot(f.x - x, f.y - y) < 4) return { key:'fibroblast', x, y };
    if (y > LS.SC && y < LS.DER) return { key:'keratinocyte', x, y };
    if (y > LS.DER && y < LS.CAP - 6) return { key:'complement', x, y };
  }
  return null;
}
function agentKey(a) {
  if (a.type === 'drug') return 'drug';
  return { v:LOOK_KEY[MI.look], stuck:LOOK_KEY[MI.look], bac:LOOK_KEY[MI.look], mac:'macrophage', nk:'nk', ctl:'ctl', th:'helper', neu:'neutrophil', ab:'antibody', dc:'dc', pc:'plasma', pus:'pus' }[a.type];
}

// ---------- call-outs: a short explanation next to something that just happened ----------
// kind is a cool-down key (the same kind is not repeated for `cd` seconds); at most two on screen, 1.6 s apart.
function callout(kind, text, col, target, opt) {
  opt = opt || {};
  if (!MI.talk || !MI.tissueMain || !target) return;
  const now = MI.now, cd = opt.cd || 10;
  if (MI.cool[kind] && now - MI.cool[kind] < cd) return;
  if (now - MI.lastCallout < 1.6 || MI.callouts.length >= 2) return;
  if (MI.view.z < 1.6 && !onScreen(target)) return;
  MI.cool[kind] = now; MI.lastCallout = now;
  MI.callouts.push({ kind, text, col, target, t0:now, dur:opt.dur || 4, focus:true, r:opt.r || target.r || 4 });
}
function onScreen(tg) {
  const x = tg.cellRef ? tg.cellRef.x + tg.cellRef.w / 2 : tg.x, y = tg.y;
  const [sx, sy] = toScreen(x, y);
  return sx > 0 && sy > 0 && sx < MI.cv.width && sy < MI.cv.height;
}
const cellMid = z => ({ cellRef:z, y:(LF.TOP + LF.BOT) / 2, r:z.w * 0.7 });
