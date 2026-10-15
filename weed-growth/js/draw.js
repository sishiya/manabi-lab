// 雑草がふえるまで — 描く（空・土・タネ・根・芽・株・穂・シート・ものさし）
// 小さすぎて見えないもの（遠くから見たタネ・根・葉）は、見やすいように最低の太さで描く。寄ると本当の大きさ。
'use strict';
const COL = {
  sky0: '#101a24', sky1: '#182736', soil0: '#2c2420', soil1: '#211b18', path: '#1d2229', grid: 'rgba(200,180,150,0.10)',
  dorm: '#b58a52', awake: '#f0cf72', root: 'rgba(236,226,200,', leaf: [[132, 205, 112], [96, 166, 92], [64, 120, 74]],
  dead: [150, 132, 98], pan: [176, 214, 120], ripe: [214, 190, 118], ink: '#e8f0f4', muted: '#a3b4bf', sheet: '#6d7d8c', acc: '#9be37a',
};
const FX = [];   // 落ちるタネの見た目だけ（計算には関係ない）
function fxShed(x, y, k) {
  if (FX.length > 120) return;
  for (let i = 0; i < Math.min(3, k); i++) FX.push({ x, y, vx: (Math.random() - 0.5) * 0.25, vy: 0, t: 0 });
}
// 抜いたときの「すぽん」（見た目と音だけ。計算には関係ない）: 根ごと土から出て、少し跳ねて傾き、消える。土が飛ぶ
const PULLFX = [];
const SND = { on: true, ctx: null, last: 0 };
function popSound(big) {
  if (!SND.on) return;
  const now = performance.now(); if (now - SND.last < 70) return; SND.last = now;
  try {
    const A = SND.ctx || (SND.ctx = new (window.AudioContext || window.webkitAudioContext)()), t = A.currentTime;
    const o = A.createOscillator(), gn = A.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(big ? 180 : 260, t); o.frequency.exponentialRampToValueAtTime(big ? 700 : 950, t + 0.08);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.12, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(gn); gn.connect(A.destination); o.start(t); o.stop(t + 0.15);
  } catch (e) { SND.on = false; }
}
function fxPull(p) {
  if (PULLFX.length > 40) PULLFX.shift();
  const dirt = [];
  for (let i = 0; i < 12; i++) dirt.push({ x: (Math.random() - 0.5) * 0.01, y: 0, vx: (Math.random() - 0.5) * 0.5, vy: 0.4 + Math.random() * 0.7 });
  // 「すぽっ！」の字は、近く（60px）で 0.3秒以内に出ていなければ（なぞって次々に抜くと重なるので）
  const txt = !PULLFX.some(f => f.txt && f.t < 0.3 && Math.abs(X(f.x) - X(p.x)) < 60);
  PULLFX.push({ txt, G: plantGeom(p), R: rootGeom(p), x: p.x, H: Math.max(0.01, p.H), c: plantColor(p), pc: p.st === 3 ? COL.dead : mix(COL.pan, COL.ripe, panState(p).ripeF),
    dir: Math.random() < 0.5 ? -1 : 1, t: 0, dirt });
  popSound(p.W > 1);
}
function pullFxTick(dt) {
  for (const f of PULLFX) { f.t += dt; for (const d of f.dirt) { d.vy -= 3 * dt; d.x += d.vx * dt; d.y = Math.max(0, d.y + d.vy * dt); } }
  for (let i = PULLFX.length - 1; i >= 0; i--) if (PULLFX[i].t > 1.2) PULLFX.splice(i, 1);
}
function drawPullFX() {
  const s = VIEW.s;
  for (const f of PULLFX) {
    const t = f.t, ease = u => 1 - (1 - u) ** 3;
    const u = Math.max(0, Math.min(1, (t - 0.1) / 0.5));
    const rise = (t < 0.1 ? 0.004 * t / 0.1 : 0.004 + (0.06 + f.H * 0.45) * ease(u));   // 少しふんばってから、すぽん
    const rot = f.dir * 0.55 * ease(u), alpha = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.45);
    const L = (wx, wy) => [(wx - f.x) * s, -wy * s];
    g.save(); g.globalAlpha = alpha; g.translate(X(f.x), Y(0)); g.rotate(rot); g.translate(0, -rise * s);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = COL.root + '0.85)'; g.lineWidth = Math.max(0.8, SP.rootDia * s); g.beginPath();   // 根（土がついたまま）
    for (const rt of f.R.roots.slice(0, 40)) { let q = L(rt.pts[0].x, rt.pts[0].y); g.moveTo(q[0], q[1]); for (let i = 1; i < rt.pts.length; i++) { q = L(rt.pts[i].x, rt.pts[i].y); g.lineTo(q[0], q[1]); } }
    g.stroke();
    g.strokeStyle = rgb(f.c); g.lineWidth = Math.max(0.8, 0.0025 * s); g.beginPath();
    for (const st of f.G.stems) { const a = L(st.x0, st.y0), c = L(st.cx, st.cy), b = L(st.x1, st.y1); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], b[0], b[1]); }
    g.stroke();
    g.lineWidth = Math.max(0.9, SP.leafW * s * 0.6); g.beginPath();
    for (const l of f.G.leaves) { const a = L(l.x0, l.y0), c = L(l.cx, l.cy), b = L(l.x1, l.y1); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], b[0], b[1]); }
    g.stroke();
    if (f.G.pans.length) {
      g.strokeStyle = rgb(f.pc); g.lineWidth = Math.max(1.6, 0.008 * s); g.beginPath();
      for (const pn of f.G.pans) { let q = L(pn.pts[0].x, pn.pts[0].y); g.moveTo(q[0], q[1]); for (const pt of pn.pts) { q = L(pt.x, pt.y); g.lineTo(q[0], q[1]); } }
      g.stroke();
    }
    g.fillStyle = '#5a4634'; g.beginPath(); g.ellipse(0, 0.004 * s, Math.max(3, 0.012 * s), Math.max(2, 0.008 * s), 0, 0, Math.PI * 2); g.fill();   // 根もとの土のかたまり
    g.restore();
    g.save(); g.globalAlpha = alpha; g.fillStyle = '#6b5640';
    for (const d of f.dirt) { const r = Math.max(1.5, 0.003 * s); g.fillRect(X(f.x + d.x) - r / 2, Y(d.y) - r / 2, r, r); }
    if (!f.txt) { g.restore(); continue; }
    const fs = Math.round(Math.max(15, Math.min(26, 0.04 * s)));
    g.font = `700 ${fs}px ` + getComputedStyle(document.body).fontFamily; g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(10,18,26,0.8)'; g.fillStyle = COL.acc;
    const ty = Y(0) - Math.min(VIEW.h * 0.4, (f.H * 0.5 + 0.03) * s) - 22 - t * 30;
    g.strokeText('すぽっ！', X(f.x), ty); g.fillText('すぽっ！', X(f.x), ty);
    g.restore();
  }
}
function rgb(c, a) { return a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round); }
function inView(x, y, m) { const px = X(x), py = Y(y); return px > -m && px < VIEW.w + m && py > -m && py < VIEW.h + m; }

function drawScene() {
  const w = VIEW.w, h = VIEW.h, s = VIEW.s;
  // 空
  const gy = Y(0);
  const sg = g.createLinearGradient(0, Y(AIR_H), 0, gy);
  sg.addColorStop(0, COL.sky0); sg.addColorStop(1, COL.sky1);
  g.fillStyle = sg; g.fillRect(0, 0, w, Math.max(0, Math.min(h, gy)));
  // 土（花だんの外は通路）
  if (gy < h) {
    const lg = g.createLinearGradient(0, gy, 0, Y(-SOIL_D));
    lg.addColorStop(0, COL.soil0); lg.addColorStop(1, COL.soil1);
    g.fillStyle = lg; g.fillRect(X(0), gy, (BED_W) * s, h - gy);
    g.fillStyle = COL.path;
    g.fillRect(0, gy + 0.01 * s, X(0), h); g.fillRect(X(BED_W), gy + 0.01 * s, w, h);
    g.fillStyle = '#3a4048'; g.fillRect(X(-0.012), gy - 0.012 * s, 0.012 * s, h); g.fillRect(X(BED_W), gy - 0.012 * s, 0.012 * s, h); // 縁石
    // 深さの線（5cm ごと）
    g.strokeStyle = COL.grid; g.lineWidth = 1; g.beginPath();
    for (let d = 0.05; d <= SOIL_D + 1e-9; d += 0.05) { const yy = Y(-d); g.moveTo(X(0), yy); g.lineTo(X(BED_W), yy); }
    g.stroke();
    if (S.opts.xray) drawSoilLife();
    else drawSurfaceSeeds();
    g.strokeStyle = 'rgba(220,200,170,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(0), gy); g.lineTo(X(BED_W), gy); g.stroke();
  }
  drawSheet();
  drawPlants();
  drawPullFX();
  drawFX();
  drawRulers();
  drawToolPreview();
}

// ---------- 土の中 ----------
// 描くタネの数: 遠くからは奥行き 15cm ぶん全部を重ねて。寄るほど、手前の薄い切り口（1cm）のぶんだけにする（重なって見えすぎないように）
const SLICE = 0.01;
function seedShown(n, cellPx) {
  const f = cellPx <= 15 ? 1 : cellPx >= 60 ? SLICE / BED_D : 1 + (SLICE / BED_D - 1) * (cellPx - 15) / 45;
  return Math.min(Math.round(n * f), seedCap(cellPx));
}
function seedCap(cellPx) { return cellPx < 6 ? 2 : cellPx < 15 ? 6 : cellPx < 40 ? 25 : cellPx < 120 ? 120 : 400; }
function visibleCells() {
  const a = toWorld(0, 0), b = toWorld(VIEW.w, VIEW.h);
  return { x0: Math.max(0, Math.floor(a.x / DXC) - 1), x1: Math.min(NX - 1, Math.floor(b.x / DXC) + 1),
    z0: Math.max(0, Math.floor(-a.y / DZC) - 1), z1: Math.min(NZ - 1, Math.floor(-b.y / DZC) + 1) };
}
function drawSeedsIn(zFrom, zTo) {
  const s = VIEW.s, V = visibleCells(), cellPx = DXC * s, cap = seedCap(cellPx);
  const len = SP.seedLen * s, wid = SP.seedWid * s, big = [];
  const z0 = Math.max(V.z0, zFrom), z1 = Math.min(V.z1, zTo);
  for (const [A, col] of [[S.SD, COL.dorm], [S.SN, COL.awake]]) {
    g.fillStyle = col; g.beginPath();
    for (let z = z0; z <= z1; z++) for (let x = V.x0; x <= V.x1; x++) {
      const i = z * NX + x, n = A[i]; if (!n) continue;
      const m = seedShown(n, cellPx);
      if (n > cap && cellPx > 2 && cellPx <= 15) {   // 描ききれない分は、ます目の濃さで
        g.save(); g.globalAlpha = Math.min(0.45, 0.07 * Math.log2(n / cap + 1)); g.fillRect(X(x * DXC), Y(-z * DZC), cellPx, DZC * s); g.restore();
      }
      for (let k = 0; k < m; k++) {
        const sp = seedSpot(i, k + (A === S.SN ? 50000 : 0)), px = X(sp.x), py = Y(sp.y);
        if (len < 2.4) { const d = Math.max(1.4, len); g.rect(px - d / 2, py - d / 2, d, Math.max(1.1, d * 0.7)); }
        else if (len < 36) { g.moveTo(px + len / 2 * Math.cos(sp.a), py + len / 2 * Math.sin(sp.a)); g.ellipse(px, py, len / 2, wid / 2, sp.a, 0, Math.PI * 2); }
        else if (px > -len && px < VIEW.w + len && py > -len && py < VIEW.h + len) big.push({ x: sp.x, y: sp.y, a: sp.a, awake: A === S.SN, z });
      }
    }
    g.fill();
  }
  for (const b of big) drawSeedDetail(b.x, b.y, b.a, b.awake ? 'awake' : 'dorm', null);
}
function drawSurfaceSeeds() { drawSeedsIn(0, 0); }

function drawSoilLife() {
  drawSeedsIn(0, NZ - 1);
  const s = VIEW.s;
  // 根: 遠くからは生きている株・枯れた株の2つにまとめて1本の線で（横に出る細い根は寄ったときだけ）
  const tipsNear = [], far = SP.rootDia * s * 1.15 < 2.5;
  g.lineCap = 'round';
  for (const dead of [true, false]) {
    if (far) { g.strokeStyle = COL.root + (dead ? 0.18 : 0.42) + ')'; g.lineWidth = Math.max(0.6, SP.rootDia * s); g.beginPath(); }
    for (const p of S.plants) {
      if (p.st === 0 || (p.st === 3) !== dead) continue;
      if (!inView(p.x, -0.1, 0.25 * s)) continue;
      const R0 = rootGeom(p), nMain = Math.max(1, Math.min(14, 1 + 2 * p.til + Math.floor(p.cd / 90)));
      const lim = far ? (p.W < 0.05 ? 1 : Math.min(6, nMain)) : R0.roots.length, st = far ? 2 : 1;
      for (let k = 0; k < lim; k++) {
        const rt = R0.roots[k];
        if (!far) {
          if (!inView(rt.pts[0].x, rt.pts[0].y, 3000) && !inView(rt.pts[rt.pts.length - 1].x, rt.pts[rt.pts.length - 1].y, 3000)) continue;
          g.strokeStyle = COL.root + (dead ? 0.18 : 0.45) + ')'; g.lineWidth = Math.max(0.6, rt.w * s); g.beginPath();
        }
        g.moveTo(X(rt.pts[0].x), Y(rt.pts[0].y));
        for (let i = st; i < rt.pts.length; i += st) g.lineTo(X(rt.pts[i].x), Y(rt.pts[i].y));
        if (!far) g.stroke();
      }
      if (!dead && SP.rootDia * s > 6) for (const t of R0.tips) if (inView(t.x, t.y, 400)) tipsNear.push(t);
    }
    if (far) g.stroke();
  }
  for (const t of tipsNear.slice(0, 40)) drawRootTip(t);
  // 土の中で芽をのばしているところ（幼根・芽・タネをそれぞれまとめて）
  const sp = S.plants.filter(p => p.st === 0 && inView(p.x, -p.z0, 200)), len = SP.seedLen * s, lw = Math.max(0.8, 0.0005 * s);
  g.strokeStyle = 'rgba(236,226,200,0.8)'; g.lineWidth = lw * 0.8; g.beginPath();
  for (const p of sp) { const q = sproutGeom(p); g.moveTo(X(q.sx), Y(q.sy)); g.lineTo(X(q.sx + 0.0006), Y(q.sy - q.rootLen)); }
  g.stroke();
  g.strokeStyle = 'rgba(214,240,190,0.95)'; g.lineWidth = lw; g.beginPath();
  for (const p of sp) { const q = sproutGeom(p); g.moveTo(X(q.sx), Y(q.sy)); g.lineTo(X(q.sx - 0.0004), Y(q.shootTop)); }
  g.stroke();
  if (len >= 36) { for (const p of sp) { const q = sproutGeom(p); drawSeedDetail(q.sx, q.sy, Math.PI / 2 + 0.3, 'sprout', q); } }
  else {
    g.fillStyle = COL.awake; g.beginPath();
    for (const p of sp) { const x = X(p.x), y = Y(-p.z0), d = Math.max(1.4, len); g.rect(x - d / 2, y - d / 3, d, d * 0.66); }
    g.fill();
  }
}

function drawSheet() {
  const s = VIEW.s; let x = 0;
  g.fillStyle = COL.sheet;
  while (x < NX) {
    if (!S.sheet[x]) { x++; continue; }
    let e = x; while (e < NX && S.sheet[e]) e++;
    g.fillRect(X(x * DXC), Y(0) - Math.max(2, 0.004 * s), (e - x) * DXC * s, Math.max(2, 0.004 * s));
    x = e;
  }
}

// ---------- 地上の株 ----------
function leafShape(c, w) {   // 葉を先が細くなる帯として
  const n = 8, L = [], Rr = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = qpt(c, t), u = 1 - t;
    const dx = 2 * u * (c.cx - c.x0) + 2 * t * (c.x1 - c.cx), dy = 2 * u * (c.cy - c.y0) + 2 * t * (c.y1 - c.cy);
    const l = Math.hypot(dx, dy) || 1, hw = w / 2 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) * (t < 0.1 ? 0.7 : 1);
    L.push([X(p.x - dy / l * hw), Y(p.y + dx / l * hw)]); Rr.push([X(p.x + dy / l * hw), Y(p.y - dx / l * hw)]);
  }
  g.moveTo(L[0][0], L[0][1]);
  for (const q of L) g.lineTo(q[0], q[1]);
  for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
  g.closePath();
}
function plantColor(p) {
  const shade = Math.min(2, Math.floor(p.y / BED_D * 3));
  if (p.st === 3) return mix(COL.dead, [80, 72, 60], shade * 0.3);
  return COL.leaf[shade];
}
function drawPlants() {
  const s = VIEW.s, wide = SP.leafW * s > 8;   // 葉の幅が 8px をこえたら1枚ずつ面で
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (!wide) { drawPlantsFar(); return; }
  // 近く: 1本ずつ、葉を面で（奥から手前へ）
  const list = S.plants.filter(p => p.st !== 0 && inView(p.x, p.H / 2, Math.max(60, p.H * s))).sort((a, b) => b.y - a.y);
  for (const p of list) {
    const G = plantGeom(p), c = plantColor(p);
    g.strokeStyle = rgb(c); g.fillStyle = rgb(c);
    g.lineWidth = Math.max(0.7, 0.0025 * s);
    g.beginPath();
    for (const st of G.stems) { g.moveTo(X(st.x0), Y(st.y0)); g.quadraticCurveTo(X(st.cx), Y(st.cy), X(st.x1), Y(st.y1)); }
    g.stroke();
    g.beginPath(); for (const l of G.leaves) leafShape(l, l.w); g.fill();
    if (SP.leafW * s > 25) {   // 葉の平行な葉脈
      g.strokeStyle = 'rgba(220,255,200,0.35)'; g.lineWidth = 1; g.beginPath();
      for (const l of G.leaves) for (const f of [-0.25, 0, 0.25]) {
        for (let i = 0; i <= 10; i++) { const p0 = qpt(l, i / 10), ox = f * l.w * Math.sin(Math.PI * Math.min(1, 0.15 + i / 10 * 0.95)) * 0.8;
          if (i === 0) g.moveTo(X(p0.x + ox), Y(p0.y)); else g.lineTo(X(p0.x + ox), Y(p0.y)); }
      }
      g.stroke();
    }
    if (G.pans.length) drawPanicles(p, G);
  }
}
// 遠く: 奥行きの3段・枯れ の4つの色ごとに、茎と葉を1本の線のまとまりで（数千本でも軽く）
function drawPlantsFar() {
  const s = VIEW.s, groups = [[], [], [], []], heads = [];
  for (const p of S.plants) {
    if (p.st === 0 || !inView(p.x, p.H / 2, Math.max(40, p.H * s))) continue;
    groups[p.st === 3 ? 3 : Math.min(2, Math.floor(p.y / BED_D * 3))].push(p);
  }
  const lwS = Math.max(0.7, 0.0025 * s), lwL = Math.max(0.8, SP.leafW * s * 0.6);
  for (const gi of [3, 2, 1, 0]) {
    const list = groups[gi]; if (!list.length) continue;
    const c = gi === 3 ? COL.dead : COL.leaf[gi];
    g.strokeStyle = rgb(c);
    g.beginPath();
    for (const p of list) {
      if (p.H * s < 3) { g.moveTo(X(p.x), Y(0)); g.lineTo(X(p.x), Y(p.H) - 0.8); continue; }   // 小さな芽は1本の線
      const G = plantGeom(p);
      for (const st of G.stems) { g.moveTo(X(st.x0), Y(st.y0)); g.quadraticCurveTo(X(st.cx), Y(st.cy), X(st.x1), Y(st.y1)); }
    }
    g.lineWidth = lwS; g.stroke();
    g.beginPath();
    for (const p of list) {
      if (p.H * s < 3) continue;
      const G = plantGeom(p);
      for (const l of G.leaves) { g.moveTo(X(l.x0), Y(l.y0)); g.quadraticCurveTo(X(l.cx), Y(l.cy), X(l.x1), Y(l.y1)); }
      if (G.pans.length) heads.push(p);
    }
    g.lineWidth = lwL; g.stroke();
  }
  drawPaniclesFar(heads);
}
function panState(p) {
  let imm = 0, young = 0;
  for (const b of p.batches) { imm += b.n; if (p.cdH - b.cd < 70) young += b.n; }
  const tot = p.ripe + imm;
  return { ripeF: tot ? p.ripe / tot : 0, flower: young > 0, tot };
}
// 遠く: 穂を熟し具合の5つの色ごとにまとめて（ふさふさの棒＋寄ると毛）
function drawPaniclesFar(heads) {
  const s = VIEW.s, pw = 0.008 * s, B = [[], [], [], [], []];
  for (const p of heads) B[p.st === 3 ? 4 : Math.min(3, Math.floor(panState(p).ripeF * 4))].push(p);
  for (let k = 0; k < 5; k++) {
    if (!B[k].length) continue;
    const c = k === 4 ? COL.dead : mix(COL.pan, COL.ripe, k / 3);
    g.strokeStyle = rgb(c); g.lineWidth = Math.max(1.6, pw); g.beginPath();
    for (const p of B[k]) for (const pn of plantGeom(p).pans) {
      g.moveTo(X(pn.pts[0].x), Y(pn.pts[0].y));
      for (let i = 1; i < pn.pts.length; i++) g.lineTo(X(pn.pts[i].x), Y(pn.pts[i].y));
    }
    g.stroke();
    if (pw > 5) {   // 毛（剛毛）
      g.strokeStyle = rgb(c, 0.6); g.lineWidth = 0.7; g.beginPath();
      const L = 0.006 * s;
      for (const p of B[k]) for (const pn of plantGeom(p).pans) for (let i = 1; i < 10; i++) for (const sd of [-1, 1]) {
        const q = pn.pts[i], a = q.a + sd * 0.9;
        g.moveTo(X(q.x), Y(q.y)); g.lineTo(X(q.x) + Math.sin(a) * L, Y(q.y) - Math.cos(a) * L);
      }
      g.stroke();
    }
  }
}
function drawPanicles(p, G) {
  const s = VIEW.s, st = panState(p), dead = p.st === 3;
  const base = dead ? COL.dead : mix(COL.pan, COL.ripe, st.ripeF);
  const pw = 0.008 * s, spk = SP.seedLen * s;
  for (const pn of G.pans) {
    if (!inView(pn.x, pn.y, pn.len * s + 50)) continue;
    if (spk < 7) {   // 遠く: ふさふさの棒
      g.strokeStyle = rgb(base); g.lineWidth = Math.max(1.6, pw); g.beginPath();
      for (let i = 0; i <= 10; i++) { const q = panAt(pn, i / 10); if (i) g.lineTo(X(q.x), Y(q.y)); else g.moveTo(X(q.x), Y(q.y)); }
      g.stroke();
      if (pw > 5) {   // 毛（剛毛）
        g.strokeStyle = rgb(base, 0.6); g.lineWidth = 0.7; g.beginPath();
        for (let i = 1; i < 24; i++) {
          const q = panAt(pn, i / 24), sd = i % 2 ? 1 : -1, a = q.a + sd * 0.9, L = 0.006 * s;
          g.moveTo(X(q.x), Y(q.y)); g.lineTo(X(q.x) + Math.sin(a) * L, Y(q.y) - Math.cos(a) * L);
        }
        g.stroke();
      }
      continue;
    }
    // 近く: 小穂を1つずつ（軸のまわりにびっしり。1mm に7つほど、奥のものは暗く）
    const n = Math.max(20, Math.min(600, Math.round(pn.len * 7000)));
    g.strokeStyle = rgb(mix(base, [90, 120, 70], 0.4)); g.lineWidth = Math.max(1, 0.0006 * s); g.beginPath();
    for (let i = 0; i <= 12; i++) { const q = panAt(pn, i / 12); if (i) g.lineTo(X(q.x), Y(q.y)); else g.moveTo(X(q.x), Y(q.y)); }
    g.stroke();
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    order.sort((a, b) => Math.cos(a * 2.39996) - Math.cos(b * 2.39996));
    for (const i of order) {
      const t = (i + 0.5) / n, q = panAt(pn, t), ph = i * 2.39996, off = Math.sin(ph) * 0.0022, back = Math.cos(ph) < 0;
      const nx = Math.cos(q.a), ny = -Math.sin(q.a);
      const cx = q.x + nx * off, cy = q.y + ny * off;
      const ripe = dead || h01(p.rs + i * 31) < st.ripeF, kind = ripe ? 'ripe' : st.flower && h01(p.rs + i * 17) < 0.35 ? 'flower' : 'green';
      g.globalAlpha = back ? 0.45 : 1;
      drawSpikelet(cx, cy, q.a + Math.sin(ph) * 0.45, kind, p, back);
      g.globalAlpha = 1;
    }
  }
}

// ---------- 見た目だけの動き・ものさし ----------
function drawFX() {
  if (!FX.length) return;
  g.fillStyle = COL.ripe ? rgb(COL.ripe) : '#ccc';
  for (const f of FX) { const d = Math.max(1.5, SP.seedLen * VIEW.s); g.fillRect(X(f.x) - d / 2, Y(f.y) - d / 2, d, d * 0.7); }
}
function fxTick(dt) {
  for (const f of FX) { f.vy -= 2.5 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.t += dt; }
  for (let i = FX.length - 1; i >= 0; i--) if (FX[i].y <= 0 || FX[i].t > 3) FX.splice(i, 1);
}
function niceLen(m) { const e = Math.pow(10, Math.floor(Math.log10(m))), f = m / e; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * e; }
function fmtLen(m) {
  const cm = m * 100, mm = m * 1000;
  if (m >= 1) return +m.toFixed(2) + 'm';
  if (m >= 0.01 && Math.abs(cm - Math.round(cm)) < 1e-6) return Math.round(cm) + 'cm';
  if (mm >= 1) return +mm.toFixed(2) + 'mm';
  return Math.round(m * 1e6) + 'µm';
}
function drawRulers() {
  const s = VIEW.s, L = niceLen(VIEW.w * 0.18 / s), px = L * s;
  g.font = '12px ' + getComputedStyle(document.body).fontFamily;
  g.fillStyle = 'rgba(16,26,36,0.7)'; g.fillRect(VIEW.w - px - 26, VIEW.h - 28, px + 18, 20);
  g.strokeStyle = COL.ink; g.lineWidth = 1.5; g.beginPath();
  g.moveTo(VIEW.w - px - 18, VIEW.h - 14); g.lineTo(VIEW.w - 18, VIEW.h - 14);
  g.moveTo(VIEW.w - px - 18, VIEW.h - 18); g.lineTo(VIEW.w - px - 18, VIEW.h - 10); g.moveTo(VIEW.w - 18, VIEW.h - 18); g.lineTo(VIEW.w - 18, VIEW.h - 10);
  g.stroke();
  g.fillStyle = COL.ink; g.textAlign = 'center'; g.fillText(fmtLen(+L.toPrecision(3)), VIEW.w - 18 - px / 2, VIEW.h - 18);
  // 深さ・高さの目もり（左はし）
  const step = niceLen(VIEW.h * 0.2 / s);
  g.textAlign = 'left'; g.fillStyle = COL.muted;
  const top = toWorld(0, 0).y, bot = toWorld(0, VIEW.h).y;
  for (let v = Math.ceil(bot / step) * step; v <= top; v += step) {
    if (v < -SOIL_D - 1e-9 || v > AIR_H) continue;
    const yy = Y(v); if (yy < 14 || yy > VIEW.h - 30) continue;
    g.fillRect(0, yy, 6, 1);
    const t = Math.abs(v) < step / 2 ? '地面' : (v < 0 ? '深さ ' : '') + fmtLen(+Math.abs(v).toPrecision(3));
    g.fillText(t, 8, yy + 4);
  }
}
let TOOL = 'look', TOOL_W = 0.3, HOVER = null;
function drawToolPreview() {
  if (typeof STROKE !== 'undefined' && STROKE && STROKE.x1 > STROKE.x0 && TOOL !== 'pull') {   // いまのドラッグで塗った範囲
    g.fillStyle = 'rgba(155,227,122,0.10)'; g.fillRect(X(STROKE.x0), 0, (STROKE.x1 - STROKE.x0) * VIEW.s, VIEW.h);
  }
  if (!HOVER || HOVER.px < 0 || TOOL === 'look' || TOOL === 'pull') return;
  const w = toWorld(HOVER.px, HOVER.py), x0 = Math.max(0, w.x - TOOL_W / 2), x1 = Math.min(BED_W, w.x + TOOL_W / 2), s = VIEW.s;
  g.save(); g.setLineDash([5, 4]); g.strokeStyle = COL.acc; g.lineWidth = 1.5;
  if (TOOL === 'mow') { g.beginPath(); g.moveTo(X(x0), Y(0.05)); g.lineTo(X(x1), Y(0.05)); g.stroke(); }
  if (TOOL === 'till') g.strokeRect(X(x0), Y(0), (x1 - x0) * s, 0.15 * s);
  if (TOOL === 'cover') g.strokeRect(X(x0), Y(0) - 8, (x1 - x0) * s, 10);
  g.restore();
}
