// 変化球のしくみ — 描画（3つの図・ボールの拡大）
'use strict';

const COL = {
  path: '#ffd166', noAir: 'rgba(160,190,210,.55)', plain: 'rgba(240,240,230,.75)', many: 'rgba(255,209,102,.6)',
  grav: '#7fb8ff', drag: '#c8a2ff', magnus: '#ff6b5a', seam: '#5ce0a0',
  grid: 'rgba(255,255,255,.08)', text: '#a3b4bf', zone: 'rgba(255,255,255,.45)', ground: '#2a3f2f',
};
const ARROW_PX_PER_N = 26;
let LAY = null;
const HITS = [];   // マウスの説明用 { kind:'pt'|'rect', x, y, r | w,h, key }

function hit(key, x, y, r) { HITS.push({ kind: 'pt', x, y, r, key }); }
function hitRect(key, x, y, w, h) { HITS.push({ kind: 'rect', x, y, w, h, key }); }

function layout(w, h) {
  const narrow = w < 640;
  const pad = 12;
  if (narrow) {
    const sideH = Math.round(h * 0.30), topH = Math.round(h * 0.26);
    LAY = { narrow, side: { x: pad, y: 22, w: w - pad * 2, h: sideH - 30 }, top: { x: pad, y: sideH + 22, w: w - pad * 2, h: topH - 30 },
      catcher: { x: pad, y: sideH + topH + 22, w: w - pad * 2, h: h - sideH - topH - 30 } };
  } else {
    const cw = Math.round(Math.min(w * 0.36, h * 0.95));
    const lw = w - cw - pad * 3;
    LAY = { narrow, side: { x: pad, y: 24, w: lw, h: h * 0.5 - 36 }, top: { x: pad, y: h * 0.5 + 18, w: lw, h: h * 0.5 - 30 },
      catcher: { x: pad * 2 + lw, y: 24, w: cw, h: h - 36 } };
  }
  // 横から: y（投手 → 捕手）を横、z を縦（高さは広げて表示）
  const sd = LAY.side, yMax = PHY.rubberY + 0.4, yMin = -0.6;
  sd.sx = sd.w / (yMax - yMin); sd.yMax = yMax;
  sd.sz = Math.min(sd.h / 2.3, sd.sx * 4); sd.ex = sd.sz / sd.sx;
  sd.X = y => sd.x + (yMax - y) * sd.sx; sd.Y = z => sd.y + sd.h - 6 - z * sd.sz;
  // 上から: y を横、x を縦（捕手から見て右 = 下）
  const tp = LAY.top;
  tp.sx = sd.sx; tp.sz = Math.min(tp.h / 2.0, tp.sx * 4); tp.ex = tp.sz / tp.sx;
  tp.X = y => tp.x + (yMax - y) * tp.sx; tp.Y = x => tp.y + tp.h / 2 + x * tp.sz;
  // 捕手の目線: 目の位置から +y を見る透視
  const ct = LAY.catcher;
  ct.eye = [0, -0.85, 0.80];
  ct.f = Math.min(ct.w, ct.h) * 0.30 * (PHY.plateY - ct.eye[1]) / 0.30;
  ct.cx = ct.x + ct.w / 2; ct.cy = ct.y + ct.h * 0.42;
  ct.P = p => { const d = p[1] - ct.eye[1]; return d <= 0.05 ? null : [ct.cx + ct.f * (p[0] - ct.eye[0]) / d, ct.cy - ct.f * (p[2] - ct.eye[2]) / d, ct.f / d]; };
}

function label(g, text, x, y, color, align) {
  g.fillStyle = color || COL.text; g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = align || 'left'; g.fillText(text, x, y);
}
function arrow(g, x, y, dx, dy, color, w = 2.5) {
  const L = Math.hypot(dx, dy); if (L < 2) return;
  const ux = dx / L, uy = dy / L, hx = x + dx, hy = y + dy, s = Math.min(9, L * 0.45);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w;
  g.beginPath(); g.moveTo(x, y); g.lineTo(hx - ux * s * 0.8, hy - uy * s * 0.8); g.stroke();
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - ux * s - uy * s * 0.5, hy - uy * s + ux * s * 0.5); g.lineTo(hx - ux * s + uy * s * 0.5, hy - uy * s - ux * s * 0.5); g.closePath(); g.fill();
}
function polyline(g, res, map, color, width, dash, tMax) {
  if (!res) return;
  g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []);
  g.beginPath();
  const pts = res.pts, step = 4;
  let first = true;
  for (let i = 0; i < pts.length; i += step) {
    if (tMax != null && pts[i].t > tMax) break;
    const q = map(pts[i].p); if (!q) { first = true; continue; }
    if (first) { g.moveTo(q[0], q[1]); first = false; } else g.lineTo(q[0], q[1]);
  }
  const lastPt = tMax != null ? sampleAt(res, Math.min(tMax, res.tPlate)) : pts[pts.length - 1];
  const q = map(lastPt.p); if (q && !first) g.lineTo(q[0], q[1]);
  g.stroke(); g.setLineDash([]);
}

function panelBg(g, b, title, sub) {
  g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(b.x, b.y, b.w, b.h);
  label(g, title, b.x + 6, b.y - 7, '#e8f0f4');
  if (sub) label(g, sub, b.x + b.w - 4, b.y - 7, COL.text, 'right');
}

// 横から・上から（2D の図）
function drawSideTop(g, which) {
  const b = LAY[which], side = which === 'side';
  panelBg(g, b, side ? '横から（三塁側から見る）' : '上から', (side ? '高さ' : '左右') + 'は ×' + b.ex.toFixed(1) + ' に広げて表示');
  g.save(); g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
  // 目盛り（1 m ごと）
  g.strokeStyle = COL.grid; g.lineWidth = 1;
  for (let y = 0; y <= 18; y += 1) { const X = b.X(y); g.beginPath(); g.moveTo(X, b.y); g.lineTo(X, b.y + b.h); g.stroke(); }
  if (side) {
    g.fillStyle = COL.ground; g.fillRect(b.x, b.Y(0), b.w, b.y + b.h - b.Y(0));
    // マウンド（高さ 10 インチ）
    g.fillStyle = '#3a4f3a'; g.beginPath(); g.moveTo(b.X(PHY.rubberY + 0.4), b.Y(0.254)); g.lineTo(b.X(PHY.rubberY - 1.8), b.Y(0)); g.lineTo(b.X(PHY.rubberY + 0.6), b.Y(0)); g.fill();
    // ゾーン
    g.strokeStyle = COL.zone; g.lineWidth = 2; g.beginPath(); g.moveTo(b.X(PHY.plateY), b.Y(ZONE.zLo)); g.lineTo(b.X(PHY.plateY), b.Y(ZONE.zHi)); g.stroke();
    hitRect('zone', b.X(PHY.plateY) - 6, b.Y(ZONE.zHi), 12, b.Y(ZONE.zLo) - b.Y(ZONE.zHi));
  } else {
    g.strokeStyle = COL.grid; g.beginPath(); g.moveTo(b.x, b.Y(0)); g.lineTo(b.x + b.w, b.Y(0)); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(b.X(PHY.plateY) - 2, b.Y(-ZONE.x), 4, b.Y(ZONE.x) - b.Y(-ZONE.x));
    hitRect('zone', b.X(PHY.plateY) - 6, b.Y(-ZONE.x), 12, b.Y(ZONE.x) - b.Y(-ZONE.x));
    label(g, '捕手から見て右 ↓', b.x + b.w - 4, b.y + b.h - 6, COL.text, 'right');
  }
  // 投手板・ホーム
  g.fillStyle = '#e8f0f4';
  const yr = side ? b.Y(0.254) : b.Y(0);
  g.fillRect(b.X(PHY.rubberY) - 2, yr - 3, 4, 6); hit('rubber', b.X(PHY.rubberY), yr, 10);
  g.fillRect(b.X(0) - 2, (side ? b.Y(0) : b.Y(0)) - 3, b.X(PHY.plateY) - b.X(0) + 4, 6); hit('plate', b.X(PHY.plateY), side ? b.Y(0) : b.Y(0), 10);
  const map = side ? p => [b.X(p[1]), b.Y(p[2])] : p => [b.X(p[1]), b.Y(p[0])];
  if (S.show.noAir) polyline(g, S.ghostNoAir, map, COL.noAir, 2, [2, 4]);
  if (S.show.plain) polyline(g, S.ghostPlain, map, COL.plain, 2, [7, 5]);
  if (S.many) for (const r of S.many) polyline(g, r, map, COL.many, 1.5, null, S.t);
  polyline(g, S.res, map, COL.path, 1, [1, 3]);
  polyline(g, S.res, map, COL.path, 3, null, S.t);
  for (const r of [S.res]) {
    // 線の上にマウスを置いたときの説明（数点だけ）
    for (let i = 0; i < r.pts.length; i += 40) { const q = map(r.pts[i].p); hit('path', q[0], q[1], 6); }
  }
  if (S.show.noAir) for (let i = 0; i < S.ghostNoAir.pts.length; i += 40) { const q = map(S.ghostNoAir.pts[i].p); hit('noAir', q[0], q[1], 5); }
  if (S.show.plain) for (let i = 0; i < S.ghostPlain.pts.length; i += 40) { const q = map(S.ghostPlain.pts[i].p); hit('plain', q[0], q[1], 5); }
  if (S.many) for (const r of S.many) { const q = map(r.pPlate); hit('many', q[0], q[1], 6); }
  // ボールと力
  const s = sampleAt(S.res, S.t), q = map(s.p);
  g.fillStyle = '#f2f0e6'; g.beginPath(); g.arc(q[0], q[1], 5, 0, 7); g.fill(); hit('ball', q[0], q[1], 8);
  if (S.show.forces) {
    const F = forces(S.res.st, s.t, s.v, S.res.opt);
    const pr = side ? f => [-f[1] * ARROW_PX_PER_N, -f[2] * ARROW_PX_PER_N * 1] : f => [-f[1] * ARROW_PX_PER_N, f[0] * ARROW_PX_PER_N];
    for (const k of ['grav', 'drag', 'magnus', 'seam']) {
      const d = pr(F[k]); if (Math.hypot(d[0], d[1]) < 3) continue;
      arrow(g, q[0], q[1], d[0], d[1], COL[k]); hit(k, q[0] + d[0], q[1] + d[1], 9);
    }
  }
  g.restore();
}

// 捕手の目線（本当の大きさの透視）
function drawCatcher(g) {
  const b = LAY.catcher;
  panelBg(g, b, '捕手の目線', '大きさは本物どおり');
  g.save(); g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
  // 地面の目安線（ホーム → 投手板）
  const P = b.P;
  g.strokeStyle = COL.grid; g.lineWidth = 1;
  for (const y of [PHY.plateY, 3, 6, 9, 12, 15, PHY.rubberY]) {
    const a = P([-1.5, y, 0]), c = P([1.5, y, 0]); if (a && c) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke(); }
  }
  const gl = P([0, PHY.rubberY, 0]);
  if (gl) { g.fillStyle = 'rgba(42,63,47,.45)'; g.fillRect(b.x, gl[1], b.w, b.y + b.h - gl[1]); }
  // ゾーン
  const z1 = P([-ZONE.x, PHY.plateY, ZONE.zHi]), z2 = P([ZONE.x, PHY.plateY, ZONE.zLo]);
  g.strokeStyle = COL.zone; g.lineWidth = 1.5; g.strokeRect(z1[0], z1[1], z2[0] - z1[0], z2[1] - z1[1]);
  hitRect('zone', z1[0], z1[1], z2[0] - z1[0], z2[1] - z1[1]);
  // 投手板
  const rb = P([0, PHY.rubberY, 0.254]); g.fillStyle = '#e8f0f4'; g.fillRect(rb[0] - 4, rb[1] - 1, 8, 2);
  const map = p => P(p);
  if (S.show.noAir) polyline(g, S.ghostNoAir, map, COL.noAir, 1.5, [2, 4]);
  if (S.show.plain) polyline(g, S.ghostPlain, map, COL.plain, 1.5, [7, 5]);
  polyline(g, S.res, map, COL.path, 1, [1, 3]);
  polyline(g, S.res, map, COL.path, 2, null, S.t);
  // 比べる道すじのホームでの位置
  const dot = (r, col, key) => { const q = P(r.pPlate); g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.arc(q[0], q[1], q[2] * PHY.r, 0, 7); g.stroke(); hit(key, q[0], q[1], Math.max(8, q[2] * PHY.r)); };
  if (S.show.noAir) dot(S.ghostNoAir, COL.noAir, 'noAir');
  if (S.show.plain) dot(S.ghostPlain, COL.plain, 'plain');
  if (S.many) for (const r of S.many) {
    polyline(g, r, map, COL.many, 1, null, S.t);
    if (S.t >= r.tPlate - 1e-6) { const q = P(r.pPlate); g.fillStyle = 'rgba(255,209,102,.55)'; g.beginPath(); g.arc(q[0], q[1], q[2] * PHY.r, 0, 7); g.fill(); hit('many', q[0], q[1], 8); }
  }
  // ボール（本物の大きさ）
  const s = sampleAt(S.res, S.t), q = P(s.p);
  if (q) {
    const rr = Math.max(2, q[2] * PHY.r);
    g.fillStyle = '#f2f0e6'; g.beginPath(); g.arc(q[0], q[1], rr, 0, 7); g.fill(); hit('ball', q[0], q[1], rr + 4);
  }
  if (S.t >= S.res.tPlate - 1e-6 && S.mv) {
    label(g, 'ホームを通った位置', b.x + 6, b.y + b.h - 8, COL.text);
  }
  g.restore();
}

function drawViews(g, w, h) {
  HITS.length = 0;
  g.clearRect(0, 0, w, h);
  drawSideTop(g, 'side');
  drawSideTop(g, 'top');
  drawCatcher(g);
}

// ---- ボールの拡大（捕手から見る）----
// 縫い目の曲線（単位球の上。a + b = 1 のテニスボールの曲線で近似）
const SEAM = (() => {
  const a = 0.75, b = 0.25, c = 2 * Math.sqrt(a * b), pts = [];
  for (let i = 0; i <= 240; i++) { const t = i / 240 * Math.PI * 2; pts.push([a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), c * Math.sin(2 * t)]); }
  return pts;
})();
function rotAxis(v, k, ang) {   // ロドリゲスの回転
  const c = Math.cos(ang), s = Math.sin(ang), kv = V.cross(k, v), kd = V.dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}
// 縫い目のもとの向き: 曲線の z 軸（4本の縫い目が回る軸）を回転軸にそろえる
function baseSeam(axis) {
  const z = [0, 0, 1], k = V.cross(z, axis), s = V.len(k), c = V.dot(z, axis);
  if (s < 1e-6) return c > 0 ? SEAM : SEAM.map(p => [p[0], -p[1], -p[2]]);
  const kk = V.mul(k, 1 / s), ang = Math.atan2(s, c);
  return SEAM.map(p => rotAxis(p, kk, ang));
}

function drawBall(g, w, h) {
  g.clearRect(0, 0, w, h); HITS2.length = 0;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.30;
  const st = S.res.st, s = sampleAt(S.res, S.t), wv = V.len(st.omega);
  const axis = wv > 1e-9 ? V.mul(st.omega, 1 / wv) : [0, 0, 1];
  // 捕手から見る: 画面の右 = +x、上 = +z、手前 = −y
  const P2 = p => [cx + p[0] * R, cy - p[2] * R];
  const grd = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#bdb8a8');
  g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
  // 縫い目（いまの時刻の向き。ナックルは θ0 から）
  const ang = (st.knuckle ? st.seam0 : 0) + wv * s.t;
  const seam = baseSeam(axis).map(p => rotAxis(p, axis, ang));
  g.strokeStyle = '#d8473f'; g.lineWidth = Math.max(1.5, R * 0.035); g.lineCap = 'round';
  g.beginPath(); let pen = false;
  for (const p of seam) { if (p[1] < 0.02) { const q = P2(p); if (!pen) { g.moveTo(q[0], q[1]); pen = true; } else g.lineTo(q[0], q[1]); } else pen = false; }
  g.stroke();
  hit2('ball', cx, cy, R);
  // 回転軸
  if (wv > 1e-9) {
    const ax2 = [axis[0] * R * 1.35, -axis[2] * R * 1.35], L = Math.hypot(ax2[0], ax2[1]);
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx - ax2[0], cy - ax2[1]); g.lineTo(cx + ax2[0], cy + ax2[1]); g.stroke(); g.setLineDash([]);
    if (L > R * 0.25) arrow(g, cx + ax2[0] * 0.75, cy + ax2[1] * 0.75, ax2[0] * 0.25, ax2[1] * 0.25, 'rgba(255,255,255,.85)', 2);
    else { g.strokeStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(cx, cy, 2, 0, 7); g.fill(); }
    hit2('axis', cx + ax2[0], cy + ax2[1], 12);
  }
  // 力（捕手から見た面に写す）
  const F = forces(st, s.t, s.v, S.res.opt), k = R / 1.0 / 1.2;
  for (const key of ['grav', 'magnus', 'seam']) {
    const d = [F[key][0] * k, -F[key][2] * k]; if (Math.hypot(d[0], d[1]) < 3) continue;
    arrow(g, cx, cy, d[0], d[1], COL[key], 3); hit2(key, cx + d[0], cy + d[1], 10);
  }
  // 抗力は向こう向き（⊗）
  g.strokeStyle = COL.drag; g.lineWidth = 2; const dx = cx + R * 0.82, dy = cy + R * 0.82;
  g.beginPath(); g.arc(dx, dy, 8, 0, 7); g.moveTo(dx - 5.5, dy - 5.5); g.lineTo(dx + 5.5, dy + 5.5); g.moveTo(dx + 5.5, dy - 5.5); g.lineTo(dx - 5.5, dy + 5.5); g.stroke();
  hit2('drag', dx, dy, 10);
  g.fillStyle = COL.text; g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
  g.fillText('捕手から見たボール（' + (S.playing ? '再生中' : 'いまの時刻の向き') + '）', cx, h - 6);
  return { cx, cy, R };
}
const HITS2 = [];
function hit2(key, x, y, r) { HITS2.push({ kind: 'pt', x, y, r, key }); }
