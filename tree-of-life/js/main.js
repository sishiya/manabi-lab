// いのちの系統樹 — 操作（押す・ドラッグ・ホイール・ピンチ・ボタン）と、デバッグ用の窓口
'use strict';
window.__trofliErr = window.__trofliErr || [];
window.addEventListener('error', e => window.__trofliErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__trofliErr.push('promise: ' + String(e.reason)));

let raf = 0;
let touched = false;   // だれかが動かした・押した（それまでは大きさが変わるたびに全体を入れる）
function redraw(relayout = true) {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; if (relayout) V.layout(); V.draw(); });
}
T.onChange = () => { redraw(true); UI.refresh(); };

// ふしを押した: 選んで詳細を出し、閉じていれば開く・選んでいて開いていれば閉じる。押した名前は画面の同じ場所に
async function press(n) {
  touched = true;
  if (!V.vis.includes(n)) { T.ancestors(n).forEach(a => a.open = true); V.focus(n); }   // まだ見えていない（道すじ・デバッグから）
  const [bx, by] = V.screenOf(n);
  if (n.more) {
    n.loading = true; redraw();
    try { await T.loadKids(n.parent, n.offset); } catch (e) { warn(); }
    n.loading = false; V.layout(); V.draw(); return;
  }
  const wasSel = V.selected === n;
  V.selected = n; UI.show(n);
  const stay = () => { V.layout(); const ly = T.isOpen(n) && n.kids.length ? n.y - 9 : n.y; V.cam.x = bx - n.x * V.cam.k; V.cam.y = by - ly * V.cam.k; V.draw(); };
  if (!T.expandable(n)) { V.draw(); return; }
  if (n.open && wasSel) { n.open = false; stay(); return; }
  if (!n.open) {
    const p = T.open(n);
    stay();
    try { await p; } catch (e) { n.open = false; warn(); }
    stay();
    reach(n);
    UI.show(n);
  } else V.draw();
}
// 開いた子が画面の右の外なら、なめらかに左へ寄せる（スマホのせまい幅で、開いたのに見えないことがないように）
function reach(n) {
  const [W] = V.size, k = V.cam.k;
  const need = (n.jx + 14) * k + V.cam.x + 160 - W;     // 子の名前の頭が 160px 見えるまで
  const most = n.x * k + V.cam.x - 12;                  // 押した名前の頭は画面に残す
  const dx = Math.min(need, most);
  if (dx <= 0) return;
  const x0 = V.cam.x, t0 = performance.now();
  (function anim(t) {
    const u = Math.min(1, (t - t0) / 250), e = u * (2 - u);
    V.cam.x = x0 - dx * e; V.draw();
    if (u < 1) requestAnimationFrame(anim);
  })(t0);
}
function warn() { const s = document.getElementById('status'); s.textContent = '読みこめませんでした。通信を確かめて、もう一度押してください。'; setTimeout(() => s.textContent = '', 5000); }
// 検索や道すじから: 開いて真ん中に
UI.onPick = (n, fromSearch) => {
  touched = true;
  T.ancestors(n).forEach(a => a.open = true);
  V.selected = n; UI.show(n);
  V.focus(n);
  if (fromSearch && T.expandable(n) && !n.open) press(n);
  if (window.matchMedia('(max-width: 899px)').matches) document.getElementById('stage').scrollIntoView({ block: 'nearest' });
};

// ---------- ポインター（マウス・指） ----------
const cv = V.cv;
const pts = new Map();
let drag = null, pinch = null;
cv.addEventListener('pointerdown', e => {
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }   // 作ったイベント（テスト）では失敗する
  pts.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pts.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: V.cam.x, cy: V.cam.y, moved: 0 };
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: V.cam.k, cx: V.cam.x, cy: V.cam.y, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
    drag = null;
  }
});
cv.addEventListener('pointermove', e => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pinch && pts.size === 2) {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const k = Math.max(0.08, Math.min(3, pinch.k * d / pinch.d));
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    V.cam.x = mx - (pinch.mx - pinch.cx) * (k / pinch.k); V.cam.y = my - (pinch.my - pinch.cy) * (k / pinch.k); V.cam.k = k;
    redraw(false); return;
  }
  if (drag) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 5) { V.cam.x = drag.cx + dx; V.cam.y = drag.cy + dy; redraw(false); }
    return;
  }
  const h = V.hit(e.offsetX, e.offsetY);
  cv.style.cursor = h ? 'pointer' : 'grab';
  V.hover = h; redraw(false);
});
function up(e) {
  pts.delete(e.pointerId);
  if (drag && drag.moved <= 5 && e.type === 'pointerup') { const n = V.hit(e.offsetX, e.offsetY); if (n) press(n); }
  if (pts.size < 2) pinch = null;
  drag = null;
}
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', () => { V.hover = null; redraw(false); });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  // ホイール = 拡大・縮小（トラックパッドのピンチは ctrlKey つき）。Shift か横スクロールは移動
  if (!e.ctrlKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) { V.cam.x -= e.deltaX || e.deltaY; redraw(false); return; }
  const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
  V.zoomAt(e.offsetX, e.offsetY, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });

// ---------- ボタン ----------
const [W0, H0] = [() => V.size[0], () => V.size[1]];
document.getElementById('zin').onclick = () => V.zoomAt(W0() / 2, H0() / 2, 1.3);
document.getElementById('zout').onclick = () => V.zoomAt(W0() / 2, H0() / 2, 1 / 1.3);
document.getElementById('zfit').onclick = () => V.fit();
document.getElementById('zclose').onclick = () => {
  for (const n of T.nodes) n.open = false;
  T.root.open = true; V.selected = null; V.fit();
};

// 大きさが変わったら描きなおす。まだだれも動かしていなければ全体が入るように（最初は CSS が効く前で大きさ 0 のことがある）
cv.addEventListener('pointerdown', () => touched = true);
cv.addEventListener('wheel', () => touched = true);
new ResizeObserver(() => { V.resize(); if (!touched) V.fit(); }).observe(cv);
// はじめ: 根もとと真核生物を開いておく
T.root.open = true;
const euk = T.root.kids.find(k => k.name === 'Eukaryota'); if (euk) euk.open = true;
V.resize(); V.fit();
UI.show(T.root); V.selected = T.root; V.draw();

// デバッグ用（RULES 5）: 状態を見る・押す・探す
window.__trofli = {
  T, V, UI,
  find: name => T.nodes.find(n => n.name === name || n.ja === name),
  press: name => press(window.__trofli.find(name)),
  reveal: async colId => { const n = await T.reveal(colId); UI.onPick(n); return n; },
};
