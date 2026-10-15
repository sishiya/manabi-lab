// 雑草がふえるまで — 見え方（カメラ・ホイール・つまむ・ドラッグ・タップ）
// 世界の座標: x = 花だんの左はしから右へ m、y = 地面から上へ m（土の中はマイナス）。
'use strict';
const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const VIEW = { s: 300, cx: 1, cy: 0.25, w: 800, h: 500, anim: null, hover: null, follow: false };
const FIELD_MIN = 0.0004;   // いちばん寄ったときの横の幅 0.4mm（根の細胞が見える）

function X(x) { return (x - VIEW.cx) * VIEW.s + VIEW.w / 2; }
function Y(y) { return VIEW.h / 2 - (y - VIEW.cy) * VIEW.s; }
function toWorld(px, py) { return { x: (px - VIEW.w / 2) / VIEW.s + VIEW.cx, y: VIEW.cy - (py - VIEW.h / 2) / VIEW.s }; }
function fieldW() { return VIEW.w / VIEW.s; }
function fitScale() { return Math.min(VIEW.w / (BED_W + 0.1), VIEW.h / (0.8 + SOIL_D + 0.05)); }

function resizeView() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const first = !VIEW.inited;
  VIEW.w = Math.max(1, r.width); VIEW.h = Math.max(1, r.height);
  cv.width = Math.round(VIEW.w * dpr); cv.height = Math.round(VIEW.h * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (first) { resetView(); VIEW.inited = true; } else clampView();
}
function resetView() { VIEW.anim = null; VIEW.s = fitScale(); VIEW.cx = BED_W / 2; VIEW.cy = (0.8 - SOIL_D - 0.05) / 2; clampView(); }
function clampView() {
  const smin = fitScale() * 0.8, smax = VIEW.w / FIELD_MIN;
  VIEW.s = Math.min(smax, Math.max(smin, VIEW.s));
  const hw = VIEW.w / 2 / VIEW.s, hh = VIEW.h / 2 / VIEW.s;
  const x0 = -0.05, x1 = BED_W + 0.05, y0 = -SOIL_D - 0.02, y1 = AIR_H;
  VIEW.cx = (x1 - x0) < 2 * hw ? (x0 + x1) / 2 : Math.min(x1 - hw, Math.max(x0 + hw, VIEW.cx));
  VIEW.cy = (y1 - y0) < 2 * hh ? (y0 + y1) / 2 : Math.min(y1 - hh, Math.max(y0 + hh, VIEW.cy));
}
function zoomAt(px, py, f) {
  VIEW.anim = null;
  const a = toWorld(px, py);
  VIEW.s *= f; clampView();
  const b = toWorld(px, py);
  VIEW.cx += a.x - b.x; VIEW.cy += a.y - b.y; clampView();
}
function panBy(dx, dy) { VIEW.anim = null; VIEW.cx -= dx / VIEW.s; VIEW.cy += dy / VIEW.s; clampView(); }
// ある場所へ、ある幅まで、なめらかに寄る（見どころのボタン）
function aimAt(x, y, fw, dur) {
  VIEW.anim = { t: 0, dur: dur || 1.6, a: { s: VIEW.s, cx: VIEW.cx, cy: VIEW.cy }, b: { s: VIEW.w / fw, cx: x, cy: y } };
}
function viewTick(dt) {
  const A = VIEW.anim; if (!A) return;
  A.t += dt; const u = Math.min(1, A.t / A.dur), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  const ls = Math.log(A.a.s) + (Math.log(A.b.s) - Math.log(A.a.s)) * e;
  // 寄るときは位置を先に合わせる（大きく見えてから動くと目が回る）
  const k = Math.min(1, e * 1.6);
  VIEW.s = Math.exp(ls); VIEW.cx = A.a.cx + (A.b.cx - A.a.cx) * k; VIEW.cy = A.a.cy + (A.b.cy - A.a.cy) * k;
  clampView();
  if (u >= 1) VIEW.anim = null;
}

// 入力: ホイール = ズーム、2本指 = つまむ・動かす、右・中ボタンのドラッグ = 動かす。
// 左ボタン（1本指）のドラッグ: 道具をえらんでいれば道具で塗る（H.isPaint()）、「見る」なら動かす。タップは H.tap
function setupInput(H) {
  const pts = new Map(); let drag = null, pinch = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const endPaint = () => { if (drag && drag.paint) { H.paintEnd(); drag.paint = false; } };
  cv.addEventListener('wheel', e => {
    e.preventDefault(); const p = pos(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)));
  }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); const p = pos(e); pts.set(e.pointerId, p);
    if (pts.size === 1) {
      const paint = e.button === 0 && H.isPaint();
      drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, touch: e.pointerType === 'touch', paint };
      if (paint) H.paintStart(p.x, p.y);
    }
    if (pts.size === 2) {
      endPaint();
      const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null;
    }
  });
  cv.addEventListener('pointermove', e => {
    const p = pos(e);
    if (!pts.has(e.pointerId)) { H.hover(p.x, p.y, false); return; }
    pts.set(e.pointerId, p);
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      panBy(mx - pinch.mx, my - pinch.my); zoomAt(mx, my, d / Math.max(1, pinch.d));
      pinch = { d, mx, my }; return;
    }
    if (drag) {
      if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true;
      if (drag.paint) { H.paint(drag.x, drag.y, p.x, p.y); H.hover(p.x, p.y, false); }
      else if (drag.moved) panBy(p.x - drag.x, p.y - drag.y);
      drag.x = p.x; drag.y = p.y;
    }
  });
  const up = e => {
    const p = pos(e);
    if (drag && !drag.moved && !drag.paint && pts.size === 1) H.tap(p.x, p.y);
    if (drag && drag.touch && !drag.moved) H.hover(p.x, p.y, true);
    if (pts.size === 1) endPaint();
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) drag = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => { if (pts.size === 1) endPaint(); pts.delete(e.pointerId); pinch = null; if (!pts.size) drag = null; });
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) H.hover(-1, -1, false); });
  cv.addEventListener('dblclick', e => { if (H.isPaint()) return; const p = pos(e); zoomAt(p.x, p.y, 2.5); });
}
