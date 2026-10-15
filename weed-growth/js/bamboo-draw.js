// 雑草がふえるまで — 竹を描く（地下茎・タケノコ・稈・枝葉、寄ったときの中: 稈の断面・タケノコの断面・地下茎の節）
// 節の間の長さ・枝の長さ・壁の厚さは、写真や図鑑の形に合わせた目安（推定）。
'use strict';
const BCOL = { rh: [222, 206, 165], young: [168, 206, 176], adult: [126, 176, 104], old: [184, 178, 108], dead: [141, 125, 94], sheath: [122, 90, 74], leaf: [110, 170, 92] };

// 節の高さ（下は短く、なかほどで長く、上でまた短い。推定）
function culmNodes(c) {
  if (c._nk === c.Hf) return c._nodes;
  const out = []; let h = 0.03;
  while (h < c.Hf) {
    out.push(h);
    const f = h / c.Hf, l = (0.04 + 0.32 * Math.sin(Math.PI * Math.min(1, f * 1.4))) * Math.min(1.2, 0.5 + c.D * 6);
    h += Math.max(0.02, l);
  }
  c._nodes = out; c._nk = c.Hf; return out;
}
function culmAngle(c) {
  if (c.st === 2) return Math.sign(c.lean || 1) * Math.min(1.25, (c.dd || 0) / 300 * 1.25 + 0.05);   // 枯れた竹は倒れていく
  return c.lean || 0;
}
function culmColor(c) {
  if (c.st === 2) return BCOL.dead;
  const age = (S.day - c.em) / 365;
  return age < 1 ? BCOL.young : age > 8 ? BCOL.old : BCOL.adult;
}
// 稈にそった点（h: 根もとからの高さ m）
function culmPt(c, h) { const a = culmAngle(c); return { x: c.x + Math.sin(a) * h, y: Math.cos(a) * h }; }

// ---------- 土の中 ----------
function drawBambooUnder() {
  const s = VIEW.s, lw = Math.max(1.4, SP.rhDia * s);
  g.lineCap = 'round';
  // 根止めの板
  g.fillStyle = '#6d7d8c';
  for (const bx of B.barrier) g.fillRect(X(bx) - Math.max(2, 0.01 * s), Y(0.1), Math.max(4, 0.02 * s), (0.1 + SP.barrierDepth) * s);
  // 地下茎（古いほど暗い）
  for (const sg of B.rh) {
    const age = (S.day - sg.born) / 365, a = Math.max(0.35, 1 - age / SP.rhLife);
    g.strokeStyle = `rgba(${BCOL.rh[0]},${BCOL.rh[1]},${BCOL.rh[2]},${0.4 + 0.5 * a})`; g.lineWidth = lw;
    g.beginPath(); g.moveTo(X(sg.x0), Y(-sg.z)); g.lineTo(X(sg.x1), Y(-sg.z)); g.stroke();
    if (sg.prev != null) { const p = segById(sg.prev); if (p) { g.beginPath(); g.moveTo(X(sg.x0), Y(-p.z)); g.lineTo(X(sg.x0), Y(-sg.z)); g.stroke(); } }
    if (SP.nodeGap * s > 6) drawRhNodes(sg, a);
  }
  // のびている先（とがった先）
  g.fillStyle = 'rgba(240,226,190,0.95)';
  for (const t of B.tips) {
    if (!t.alive) continue; const sg = segById(t.seg); if (!sg) continue;
    const x = X(sg.x1), y = Y(-sg.z), L = Math.max(5, 0.05 * s), w = lw * 0.6;
    g.beginPath(); g.moveTo(x + t.dir * L, y); g.lineTo(x, y - w); g.lineTo(x, y + w); g.closePath(); g.fill();
    if (SP.rhDia * s > 30) offerLabel(x, y, () => { caption(x, y + lw + 18, '地下茎の先（とがった先で土をおし進む。7月下旬〜11月上旬にのびる）'); });
  }
  // 竹の根もと（地下茎から地上へ）
  g.strokeStyle = 'rgba(200,190,150,0.7)';
  for (const c of B.culms) {
    if (c.st === 4) {   // 地上に出る前の芽がふくらんでいる
      if (c.em - S.day < 40) { const r = Math.max(2, c.D * 0.6 * s * (1 - (c.em - S.day) / 40)); g.fillStyle = 'rgba(150,110,90,0.9)'; g.beginPath(); g.ellipse(X(c.x), Y(-c.z0 + r / s * 0.6), r * 0.7, r, 0, 0, Math.PI * 2); g.fill(); }
      continue;
    }
    g.lineWidth = Math.max(1, c.D * 0.5 * s); g.beginPath(); g.moveTo(X(c.x), Y(0)); g.lineTo(X(c.x), Y(-c.z0)); g.stroke();
  }
}
function drawRhNodes(sg, a) {
  const s = VIEW.s, r = SP.rhDia / 2 * s, lo = Math.min(sg.x0, sg.x1), hi = Math.max(sg.x0, sg.x1);
  const v0 = toWorld(0, 0).x, v1 = toWorld(VIEW.w, 0).x;
  g.strokeStyle = 'rgba(120,100,70,0.8)'; g.lineWidth = 1; g.beginPath();
  for (let x = Math.ceil(Math.max(lo, v0 - 0.1) / SP.nodeGap) * SP.nodeGap; x <= Math.min(hi, v1 + 0.1); x += SP.nodeGap) {
    const px = X(x), py = Y(-sg.z); g.moveTo(px, py - r); g.lineTo(px, py + r);
    if (SP.nodeGap * s > 14) {   // 節から出る根
      const k = Math.round(x / SP.nodeGap), L = (0.03 + 0.05 * h01(k * 13 + sg.id)) * s;
      g.moveTo(px, py + r); g.quadraticCurveTo(px + L * 0.3, py + r + L * 0.5, px + L * 0.1 * (k % 2 ? 1 : -1), py + r + L);
    }
  }
  g.stroke();
  if (SP.rhDia * s > 30) {   // 芽（節ごとにかわるがわる）
    g.fillStyle = 'rgba(170,130,100,0.9)';
    for (let x = Math.ceil(Math.max(lo, v0) / SP.nodeGap) * SP.nodeGap; x <= Math.min(hi, v1); x += SP.nodeGap) {
      const k = Math.round(x / SP.nodeGap), sd = k % 2 ? -1 : 1, px = X(x) + r * 0.4, py = Y(-sg.z) + sd * r;
      g.beginPath(); g.ellipse(px, py + sd * r * 0.2, r * 0.25, r * 0.35, 0, 0, Math.PI * 2); g.fill();
    }
    const cx = Math.min(hi, Math.max(lo, VIEW.cx)), px = X(Math.round(cx / SP.nodeGap) * SP.nodeGap), py = Y(-sg.z);
    offerLabel(px, py, () => {
      caption(px, py + r + 40, `地下茎 深さ ${Math.round(sg.z * 100)}cm・${Math.max(1, Math.ceil((S.day - sg.born) / 365))}年目`);
      tag(px, py, px + 60, py - 60, '節（ここに芽と根がある）');
      tag(px + r * 0.4, py - r, px - 70, py - 90, '芽（ここからタケノコが出る）');
      if (SP.nodeGap * s > 14) tag(px + r * 0.2, py + r + 20, px + 80, py + r + 60, '節から出る根（水を吸う）');
    });
  }
}

// ---------- 地上 ----------
function drawBamboo() {
  const s = VIEW.s;
  const leaves = [], order = B.culms.filter(c => c.st !== 4).sort((a, b) => (a.st === 2 ? 0 : 1) - (b.st === 2 ? 0 : 1));
  for (const c of order) {
    const h = Math.max(0.03, c.st === 0 ? c.H : (c.H || c.Hf));
    if (!inView(c.x, h / 2, h * s + 50)) continue;
    if (c.st !== 1 && h < 1.6) { drawShoot(c, h); continue; }   // タケノコ（とちゅうで枯れたものも）
    drawCulm(c, h, leaves);
  }
  // 葉はまとめて（細い線の束）
  if (leaves.length) {
    g.strokeStyle = rgb(BCOL.leaf, 0.85); g.lineWidth = Math.max(0.9, 0.012 * s); g.lineCap = 'round'; g.beginPath();
    for (const l of leaves) { g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); }
    g.stroke();
  }
}
function drawCulm(c, h, leaves) {
  const s = VIEW.s, a = culmAngle(c), col = culmColor(c), D = c.D;
  const p0 = culmPt(c, 0), p1 = culmPt(c, h), nx = Math.cos(a), ny = -Math.sin(a);   // 幅の向き（世界）
  const w0 = Math.max(1.4 / s, D) / 2, w1 = Math.max(1 / s, D * 0.3) / 2;
  const cut = D * s > 60;   // 寄ると縦の断面（中は空洞・節に仕切り）
  g.fillStyle = rgb(col);
  g.beginPath();
  g.moveTo(X(p0.x - nx * w0), Y(p0.y - ny * w0)); g.lineTo(X(p1.x - nx * w1), Y(p1.y - ny * w1));
  g.lineTo(X(p1.x + nx * w1), Y(p1.y + ny * w1)); g.lineTo(X(p0.x + nx * w0), Y(p0.y + ny * w0)); g.closePath(); g.fill();
  const nodes = culmNodes(c).filter(z => z < h);
  if (cut) drawCulmSection(c, h, nodes);
  else if (D * s > 2.5) {   // 節の輪
    g.strokeStyle = 'rgba(40,60,30,0.55)'; g.lineWidth = Math.max(1, D * s * 0.06); g.beginPath();
    let last = -1e9;
    for (const z of nodes) {
      const p = culmPt(c, z), py = Y(p.y); if (Math.abs(py - last) < 4) continue; last = py;
      const w = (w0 + (w1 - w0) * z / h); g.moveTo(X(p.x - nx * w), Y(p.y - ny * w)); g.lineTo(X(p.x + nx * w), Y(p.y + ny * w));
    }
    g.stroke();
  }
  if (c.st === 0) {   // のびている途中: 下の節はまだ竹の皮（稈鞘）に包まれている
    g.fillStyle = rgb(BCOL.sheath, 0.9);
    for (const z of nodes) {
      if (z > h * 0.75) break;
      const p = culmPt(c, z), w = w0 * 1.15, L = Math.min(0.4, h * 0.1);
      const q = culmPt(c, Math.min(h, z + L));
      g.beginPath(); g.moveTo(X(p.x - nx * w), Y(p.y - ny * w)); g.lineTo(X(q.x), Y(q.y)); g.lineTo(X(p.x + nx * w), Y(p.y + ny * w)); g.closePath(); g.fill();
    }
    return;
  }
  if (c.st === 2) return;
  // 枝と葉（高さの 45% より上の節から、左右かわるがわる。角度・長さはばらつかせる。推定）
  const r = mulberry(c.id * 7919), bl0 = 0.5 + 9 * D, ls = Math.max(0.05, 0.06 + 0.3 * D);
  g.strokeStyle = rgb(col, 0.9); g.lineWidth = Math.max(0.7, D * 0.12 * s); g.beginPath();
  let k = 0;
  for (const z of nodes) {
    if (z < h * 0.45 || r() < 0.35) continue;
    const f = (z / h - 0.45) / 0.55, sd = (k++) % 2 ? 1 : -1, L = bl0 * (1 - 0.6 * f) * (0.55 + 0.7 * r());
    const p = culmPt(c, z), ba = a + sd * (0.55 + 0.45 * r());
    const m = { x: p.x + Math.sin(ba) * L * 0.55, y: p.y + Math.cos(ba) * L * 0.55 };
    const e = { x: p.x + Math.sin(ba) * L, y: p.y + Math.cos(ba) * L * 0.75 - L * 0.12 };   // 先は少したれる
    g.moveTo(X(p.x), Y(p.y)); g.quadraticCurveTo(X(m.x), Y(m.y), X(e.x), Y(e.y));
    for (let i = 0; i < 7; i++) {   // 葉（長さ 10cm ほど。枝の先のほうに房になって、下へたれる。推定）
      const t = 0.45 + 0.55 * i / 6, qx = p.x + (e.x - p.x) * t, qy = p.y + (e.y - p.y) * t, la = sd * (0.6 + 1.2 * r());
      leaves.push([X(qx), Y(qy), X(qx + Math.sin(la) * ls), Y(qy - Math.cos(la) * ls * 0.8)]);
    }
  }
  const p = culmPt(c, h), ta = a;   // てっぺんの葉
  for (let i = 0; i < 5; i++) { const la = ta + (i - 2) * 0.5; leaves.push([X(p.x), Y(p.y), X(p.x + Math.sin(la) * ls * 1.2), Y(p.y + Math.cos(la) * ls * 0.4)]); }
  g.stroke();
}
// 稈の縦の断面: 壁（厚さ 太さ×0.09。推定）・空洞・節の仕切り（隔壁）
function drawCulmSection(c, h, nodes) {
  const s = VIEW.s, a = culmAngle(c), nx = Math.cos(a), ny = -Math.sin(a), wall = Math.max(0.006, 0.09 * c.D);
  const v = toWorld(0, VIEW.h).y - 0.2, top = toWorld(0, 0).y + 0.2, z0 = Math.max(0, v), z1 = Math.min(h, top);
  if (z1 <= z0) return;
  const wA = c.D / 2 - wall, P = (z, w) => { const p = culmPt(c, z); return [X(p.x + nx * w), Y(p.y + ny * w)]; };
  g.fillStyle = '#1b2a22';   // 空洞
  g.beginPath(); let q = P(z0, -wA); g.moveTo(q[0], q[1]); q = P(z1, -wA); g.lineTo(q[0], q[1]); q = P(z1, wA); g.lineTo(q[0], q[1]); q = P(z0, wA); g.lineTo(q[0], q[1]); g.closePath(); g.fill();
  if (wall * s > 12) {   // 壁の中を縦に走る維管束（繊維の束）
    g.strokeStyle = 'rgba(70,110,60,0.6)'; g.lineWidth = 1; g.beginPath();
    for (const sd of [-1, 1]) for (let i = 1; i < 6; i++) { const w = sd * (wA + wall * i / 6); q = P(z0, w); g.moveTo(q[0], q[1]); q = P(z1, w); g.lineTo(q[0], q[1]); }
    g.stroke();
  }
  g.fillStyle = 'rgba(150,170,110,1)';   // 節の仕切り（厚さ 6mm ほど。推定）
  let near = null, nd = 1e9;
  for (const z of nodes) {
    if (z < z0 - 0.02 || z > z1 + 0.02) continue;
    const A = P(z - 0.003, -wA), Bq = P(z - 0.003, wA), Cq = P(z + 0.003, wA), Dq = P(z + 0.003, -wA);
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(Bq[0], Bq[1]); g.lineTo(Cq[0], Cq[1]); g.lineTo(Dq[0], Dq[1]); g.closePath(); g.fill();
    const d = Math.abs(Y(culmPt(c, z).y) - VIEW.h / 2); if (d < nd) { nd = d; near = z; }
  }
  const mid = culmPt(c, (z0 + z1) / 2), px = X(mid.x), py = Y(mid.y);
  offerLabel(px, py, () => {
    const age = Math.max(1, Math.ceil((S.day - c.em) / 365));
    caption(px, Math.min(VIEW.h - 50, py + 40), `竹（稈） 太さ ${(c.D * 100).toFixed(1)}cm・高さ ${c.Hf.toFixed(1)}m・${age}年目`);
    const cav = P((z0 + z1) / 2 + 0.05, 0); tag(cav[0], cav[1], cav[0] + 80, cav[1] - 50, '中は空洞（からっぽ）');
    if (near != null) { const n = P(near, wA * 0.5); tag(n[0], n[1], n[0] + 90, n[1] + 40, '節の仕切り（隔壁）'); }
    const wl = P((z0 + z1) / 2 - 0.05, -(wA + wall / 2)); tag(wl[0], wl[1], wl[0] - 90, wl[1] + 30, '壁（縦に走る繊維の束）');
  });
}
// タケノコ（地上に出て 1.6m まで）: 竹の皮に包まれたとがった形。寄ると縦の断面（節がもうぜんぶ中にある）
function drawShoot(c, h) {
  const s = VIEW.s, bw = Math.max(2 / s, c.D * 1.6), H = Math.max(0.03, h + 0.06);
  const x = X(c.x), y0 = Y(0), y1 = Y(H), half = bw / 2 * s;
  g.fillStyle = rgb(c.st === 2 ? BCOL.dead : BCOL.sheath);
  g.beginPath(); g.moveTo(x - half, y0); g.quadraticCurveTo(x - half * 0.9, (y0 + y1) / 2, x, y1); g.quadraticCurveTo(x + half * 0.9, (y0 + y1) / 2, x + half, y0); g.closePath(); g.fill();
  if (half > 6) {   // 皮の重なり
    g.strokeStyle = 'rgba(40,25,20,0.6)'; g.lineWidth = 1; g.beginPath();
    for (let i = 1; i < 9; i++) { const f = i / 9, yy = y0 + (y1 - y0) * f, ww = half * (1 - f) * 0.95; g.moveTo(x - ww, yy + ww * 0.4); g.quadraticCurveTo(x, yy - ww * 0.2, x + ww, yy + ww * 0.4); }
    g.stroke();
  }
  if (half > 30) {   // 縦の断面: 中に節がぎっしり（上ほどつまっている）
    const n = 40, core = half * 0.55;
    g.fillStyle = '#e8dcc0'; g.beginPath(); g.moveTo(x - core, y0); g.quadraticCurveTo(x - core * 0.8, (y0 + y1) / 2, x, y1 + (y0 - y1) * 0.08); g.quadraticCurveTo(x + core * 0.8, (y0 + y1) / 2, x + core, y0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,140,80,0.9)'; g.lineWidth = 1.2; g.beginPath();
    for (let i = 1; i < n; i++) { const f = 1 - Math.pow(1 - i / n, 1.8), yy = y0 + (y1 - y0) * f * 0.9, ww = core * (1 - f * 0.9) * 0.9; g.moveTo(x - ww, yy); g.lineTo(x + ww, yy); }
    g.stroke();
  }
  if (half > 8) offerLabel(x, (y0 + y1) / 2, () => {
    const a = Math.max(0, Math.round(S.day - c.em));
    caption(x, Math.min(VIEW.h - 50, y0 + 26), `タケノコ 地上に出て ${a}日・高さ ${(h * 100).toFixed(0)}cm`);
    if (half > 30) {
      tag(x - half * 0.8, y0 - (y0 - y1) * 0.2, x - half - 70, y0 - (y0 - y1) * 0.3, '竹の皮（稈鞘）');
      tag(x, y0 - (y0 - y1) * 0.6, x + half + 60, y0 - (y0 - y1) * 0.75, '節はもうぜんぶ中にある');
      tag(x, y0 - (y0 - y1) * 0.25, x + half + 50, y0 - (y0 - y1) * 0.1, '節と節のあいだが下から順にのびる');
    }
  });
}
// 掘ったタケノコの「すぽっ」（draw.js の PULLFX を使う）
function fxPullBamboo(c) {
  if (typeof PULLFX === 'undefined') return;
  const h = Math.max(0.05, c.H), w = c.D * 0.8;
  const G = { stems: [{ x0: c.x, y0: 0, cx: c.x, cy: h / 2, x1: c.x, y1: h }], leaves: [], pans: [] };
  PULLFX.push({ txt: true, G, R: { roots: [] }, x: c.x, H: h, c: BCOL.sheath, pc: BCOL.sheath, dir: Math.random() < 0.5 ? -1 : 1, t: 0,
    dirt: Array.from({ length: 10 }, () => ({ x: (Math.random() - 0.5) * 0.05, y: 0, vx: (Math.random() - 0.5) * 0.8, vy: 0.5 + Math.random() * 0.8 })), w });
  popSound(true);
}

// 遠くから見たときの「土の中の地図」: 図の上のほうに、土（0〜60cm）をたてに5倍にして地下茎だけ描く（見やすくするため。横は同じ）
function drawBambooMap() {
  if (!S.opts.xray || fieldW() < 4) return;
  const k = 5, top = 32, h = SOIL_D * k * VIEW.s;   // 空の上のほう（竹のてっぺんより上）に置く
  if (h < 30 || h > VIEW.h * 0.3) return;
  const MY = z => top + z * k * VIEW.s;
  g.fillStyle = 'rgba(33,27,24,0.92)'; g.fillRect(X(0), top, BED_W * VIEW.s, h);
  g.strokeStyle = 'rgba(200,180,150,0.15)'; g.lineWidth = 1; g.beginPath();
  for (let d = 0.1; d < SOIL_D; d += 0.1) { g.moveTo(X(0), MY(d)); g.lineTo(X(BED_W), MY(d)); }
  g.stroke();
  g.fillStyle = '#6d7d8c'; for (const bx of B.barrier) g.fillRect(X(bx) - 2, top, 4, SP.barrierDepth * k * VIEW.s);
  g.lineCap = 'round';
  for (const sg of B.rh) {
    const age = (S.day - sg.born) / 365, a = Math.max(0.35, 1 - age / SP.rhLife);
    g.strokeStyle = `rgba(${BCOL.rh[0]},${BCOL.rh[1]},${BCOL.rh[2]},${0.4 + 0.55 * a})`; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(X(sg.x0), MY(sg.z)); g.lineTo(X(sg.x1), MY(sg.z)); g.stroke();
    if (sg.prev != null) { const p = segById(sg.prev); if (p) { g.beginPath(); g.moveTo(X(sg.x0), MY(p.z)); g.lineTo(X(sg.x0), MY(sg.z)); g.stroke(); } }
  }
  g.fillStyle = 'rgba(240,226,190,0.95)';
  for (const t of B.tips) { if (!t.alive) continue; const sg = segById(t.seg); if (!sg) continue; g.beginPath(); g.moveTo(X(sg.x1) + t.dir * 7, MY(sg.z)); g.lineTo(X(sg.x1), MY(sg.z) - 3.5); g.lineTo(X(sg.x1), MY(sg.z) + 3.5); g.fill(); }
  g.strokeStyle = 'rgba(126,176,104,0.9)'; g.lineWidth = 1.5; g.beginPath();   // 竹の根もと
  for (const c of B.culms) if (c.st === 0 || c.st === 1) { g.moveTo(X(c.x), top); g.lineTo(X(c.x), MY(c.z0)); }
  g.stroke();
  g.font = '11px ' + getComputedStyle(document.body).fontFamily; g.fillStyle = COL.muted; g.textAlign = 'left';
  g.fillText('土の中の地図（たてを5倍。深さ 0〜60cm）', X(0) + 6, top + 13);
}
