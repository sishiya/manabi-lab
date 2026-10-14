// ほこりが積もるまで — 図の見え方（ズーム・移動）と、図をさわる操作
// 横から見た部屋（side）を拡大していき、見えている幅が MICRO_IN より狭くなると、
// いちばん近い面を真上から見た顕微鏡の絵（micro.js）に切りかわる。
'use strict';

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const OUT_L = 0.42, OUT_R = 0.16, PAD_T = 0.1, PAD_B = 0.16;
const WORLD = { x0: -OUT_L, x1: ROOM_W + OUT_R, y0: -PAD_B, y1: ROOM_H + PAD_T };
const MICRO_IN = 0.03, MICRO_FULL = 0.015;   // 見えている幅（m）: これより狭いと顕微鏡の絵がまざり始める / 全部になる
const Z_MAX = 2e5;
// s = px/m、(cx, cy) = 画面のまん中に来る場所、cv_ = 顕微鏡の絵の奥行き方向の位置 m、mf = 顕微鏡で見ている面
const VIEW = { w: 0, h: 0, s0: 100, z: 1, cx: 0, cy: 0, cvz: DEPTH / 2, s: 100, ox: 0, oy: 0, mf: -1, aim: null, hover: null };

function fitView() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  VIEW.w = r.width; VIEW.h = r.height;
  VIEW.s0 = Math.min(r.width / (WORLD.x1 - WORLD.x0), r.height / (WORLD.y1 - WORLD.y0));
  if (VIEW.z <= 1.0001) { VIEW.cx = (WORLD.x0 + WORLD.x1) / 2; VIEW.cy = (WORLD.y0 + WORLD.y1) / 2; }
  updateView();
}
function fieldW() { return VIEW.w / VIEW.s; }
function microAlpha() { const f = fieldW(); return Math.max(0, Math.min(1, (MICRO_IN - f) / (MICRO_IN - MICRO_FULL))); }
function updateView() {
  VIEW.z = Math.max(1, Math.min(Z_MAX, VIEW.z));
  VIEW.s = VIEW.s0 * VIEW.z;
  // 部屋の外へ行きすぎないように
  const hw = VIEW.w / 2 / VIEW.s, hh = VIEW.h / 2 / VIEW.s;
  const cl = (c, a, b, h) => (b - a) / 2 <= h ? (a + b) / 2 : Math.max(a + h, Math.min(b - h, c));
  VIEW.cx = cl(VIEW.cx, WORLD.x0, WORLD.x1, hw);
  VIEW.cy = cl(VIEW.cy, WORLD.y0, WORLD.y1, hh);
  VIEW.cvz = Math.max(0, Math.min(DEPTH, VIEW.cvz));
  VIEW.ox = VIEW.w / 2 - VIEW.cx * VIEW.s; VIEW.oy = VIEW.h / 2 + VIEW.cy * VIEW.s;
  // 顕微鏡の絵へ入るとき、見る面を決める（いちばん近い上向きの面）
  if (fieldW() < MICRO_IN) { if (VIEW.mf < 0) VIEW.mf = nearestUpFace(VIEW.cx, VIEW.cy); }
  else VIEW.mf = -1;
}
const X = x => VIEW.ox + x * VIEW.s, Y = y => VIEW.oy - y * VIEW.s;
function toWorld(px, py) { return { x: (px - VIEW.ox) / VIEW.s, y: (VIEW.oy - py) / VIEW.s }; }
function nearestUpFace(x, y) {
  let best = -1, bd = 1e9;
  for (let f = 0; f < FACES.length; f++) {
    const F = FACES[f]; if (F.o !== 'up') continue;
    const dy = y - F.y, d = Math.abs(F.x - x) + (dy < -0.01 ? 3 * -dy : dy);   // 下にある面を優先
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// 画面の点 (px, py) を中心に f 倍
function zoomAt(px, py, f) {
  const s1 = VIEW.s, micro = fieldW() < MICRO_FULL;
  const wx = VIEW.cx + (px - VIEW.w / 2) / s1;
  const wy = VIEW.cy - (py - VIEW.h / 2) / s1, wv = VIEW.cvz + (py - VIEW.h / 2) / s1;
  VIEW.z *= f; VIEW.s = VIEW.s0 * Math.max(1, Math.min(Z_MAX, VIEW.z));
  VIEW.cx = wx - (px - VIEW.w / 2) / VIEW.s;
  if (micro) VIEW.cvz = wv - (py - VIEW.h / 2) / VIEW.s;
  else VIEW.cy = wy + (py - VIEW.h / 2) / VIEW.s;
  VIEW.aim = null;
  updateView();
}
function panBy(dx, dy) {
  VIEW.cx -= dx / VIEW.s;
  if (fieldW() < MICRO_FULL) VIEW.cvz -= dy / VIEW.s; else VIEW.cy += dy / VIEW.s;
  VIEW.aim = null;
  updateView();
}
function resetView() { VIEW.z = 1; VIEW.aim = null; VIEW.cx = (WORLD.x0 + WORLD.x1) / 2; VIEW.cy = (WORLD.y0 + WORLD.y1) / 2; updateView(); }
// なめらかに寄る（毎コマ viewTick で近づける）
function aimAt(x, y, z) { VIEW.aim = { x, y, z }; }
function viewTick() {
  if (VIEW.pendingHover) { VIEW.pendingHover = false; VIEW.hover = microHit(VIEW.w / 2, VIEW.h / 2); }
  const A = VIEW.aim; if (!A) return;
  VIEW.z *= Math.pow(A.z / VIEW.z, 0.14);
  const r = A.micro ? 0.25 : 0.2;
  VIEW.cx += (A.x - VIEW.cx) * r;
  if (A.micro) VIEW.cvz += (A.v - VIEW.cvz) * r; else VIEW.cy += (A.y - VIEW.cy) * r;
  const near = Math.abs(A.x - VIEW.cx) < 2e-7 + 0.002 / VIEW.s * 0 + 1 / VIEW.s && (!A.micro || Math.abs(A.v - VIEW.cvz) < 1 / VIEW.s);
  if (Math.abs(Math.log(A.z / VIEW.z)) < 0.01 && near) { VIEW.z = A.z; VIEW.cx = A.x; if (A.micro) { VIEW.cvz = A.v; VIEW.pendingHover = true; } VIEW.aim = null; }
  updateView();
}
// 顕微鏡の絵で、いちばん近い kind の粒へ寄る
function jumpTo(kind, selFace) {
  if (fieldW() >= MICRO_IN) {   // まだ部屋の絵なら、えらんでいる面の上へ一気に寄る
    const f = selFace >= 0 && FACES[selFace].o === 'up' ? selFace : nearestUpFace(VIEW.cx, VIEW.cy);
    VIEW.mf = -1; VIEW.cx = FACES[f].x; VIEW.cy = FACES[f].y + 0.002; VIEW.cvz = DEPTH / 2;
    VIEW.z = VIEW.w / 0.004 / VIEW.s0; updateView(); VIEW.mf = f;
  }
  const p = findNearest(kind);
  if (!p) return false;
  const field = Math.max(p.C.size * p.wob * (p.C.k === 'fiber' ? 1.6 : 4), 40e-6);
  VIEW.aim = { micro: true, x: p.u, v: p.v, z: VIEW.w / field / VIEW.s0 };
  VIEW.hover = null;
  return true;
}

// ---------- 図をさわる（ホイール・つまむ・ドラッグ・タップ） ----------
function setupInput(onTap, onHover) {
  const pts = new Map();
  let moved = false, pinch = null;
  const pos = ev => { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  cv.addEventListener('wheel', ev => { ev.preventDefault(); const p = pos(ev); zoomAt(p.x, p.y, Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.0015))); }, { passive: false });
  cv.addEventListener('pointerdown', ev => {
    cv.setPointerCapture(ev.pointerId);
    pts.set(ev.pointerId, pos(ev)); moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
  });
  cv.addEventListener('pointermove', ev => {
    const p = pos(ev);
    if (!pts.has(ev.pointerId)) { onHover(p.x, p.y); return; }
    const q = pts.get(ev.pointerId);
    if (pts.size === 2 && pinch) {
      pts.set(ev.pointerId, p);
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 10) { zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d); pinch.d = d; }
      moved = true; return;
    }
    const dx = p.x - q.x, dy = p.y - q.y;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true; pts.set(ev.pointerId, p);
    if (VIEW.z > 1.001) panBy(dx, dy);
  });
  const up = ev => {
    const p = pos(ev);
    if (pts.has(ev.pointerId) && !moved && pts.size === 1) onTap(p.x, p.y);
    pts.delete(ev.pointerId); if (pts.size < 2) pinch = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', ev => { pts.delete(ev.pointerId); pinch = null; });
  cv.addEventListener('pointerleave', () => { if (!pts.size) VIEW.hover = null; });
  cv.addEventListener('dblclick', ev => { const p = pos(ev); zoomAt(p.x, p.y, 3); });
}
