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
  touched = true; reachId++;
  if (!V.vis.includes(n)) { T.ancestors(n).forEach(a => a.open = true); V.focus(n); }   // まだ見えていない（道すじ・デバッグから）
  const [bx, by] = V.screenOf(n);
  if (n.more) {
    n.loading = true; redraw();
    try { await T.loadKids(n.parent, n.offset); } catch (e) { warn(); }
    n.loading = false; V.layout(); V.draw(); return;
  }
  const wasSel = V.selected === n;
  V.selected = n; UI.show(n);
  // 配置しなおしても、押した名前は画面の同じ場所に。まわりは今見えている場所から新しい場所へすべっていく
  const stay = () => {
    const k = V.cam.k, ox = (bx - V.cam.x) / k, oy = (by - V.cam.y) / k;
    V.layout();
    const dx = n.x - ox, dy = V.labelY(n, n.y) - oy;
    V.shift(dx, dy); V.cam.x -= dx * k; V.cam.y -= dy * k;
    V.draw();
  };
  if (!T.expandable(n)) { V.draw(); return; }
  if (n.open && wasSel) { n.open = false; stay(); return; }   // 閉じる: 子は親へ吸いこまれる（view.js の leaving）
  if (!n.open) {
    const p = T.open(n);
    stay(); V.pop(n);
    try { await p; } catch (e) { n.open = false; warn(); }
    stay();
    reach(n);
    UI.show(n);
  } else V.draw();
}
// 開いた子が画面の右の外なら、なめらかに左へ寄せる（スマホのせまい幅で、開いたのに見えないことがないように）
let reachId = 0;
function reach(n) {
  const [W] = V.size, k = V.cam.k;
  const need = (n.jx + 38) * k + V.cam.x + 160 - W;     // 子の名前の頭が 160px 見えるまで
  const most = n.x * k + V.cam.x - 12;                  // 押した名前の頭は画面に残す
  const dx = Math.min(need, most);
  if (dx <= 0) return;
  const x0 = V.cam.x, t0 = performance.now(), id = ++reachId;
  (function anim(t) {
    if (id !== reachId) return;   // あとから押した・検索したときは、前の寄せはやめる
    const u = Math.min(1, (t - t0) / 250), e = u * (2 - u);
    V.cam.x = x0 - dx * e; V.draw();
    if (u < 1) requestAnimationFrame(anim);
  })(t0);
}
function warn() { const s = document.getElementById('status'); s.textContent = '読みこめませんでした。通信を確かめて、もう一度押してください。'; setTimeout(() => s.textContent = '', 5000); }
// 検索や道すじから: 開いて真ん中に
UI.onPick = (n, fromSearch) => {
  touched = true; reachId++;
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

// ---------- 全体ボタンと、大きさのつまみ（たて。上が大きい） ----------
const [W0, H0] = [() => V.size[0], () => V.size[1]];
document.getElementById('zfit').onclick = () => { touched = true; reachId++; V.fit(); };
const zs = document.getElementById('zs');
const KMIN = V.KMIN, KMAX = V.KMAX;
const k2v = k => Math.round(1000 * Math.log(k / KMIN) / Math.log(KMAX / KMIN));
const v2k = v => KMIN * Math.pow(KMAX / KMIN, v / 1000);
zs.addEventListener('input', () => { touched = true; V.zoomAt(W0() / 2, H0() / 2, v2k(+zs.value) / V.cam.k); });
V.onDraw = () => { if (document.activeElement !== zs) zs.value = k2v(V.cam.k); };   // ホイール・ピンチ・全体で変わったら、つまみも動かす

// ---------- 使い方（？）のポップアップ ----------
const helpBtn = document.getElementById('helpbtn'), help = document.getElementById('help');
helpBtn.onclick = e => { e.stopPropagation(); help.hidden = !help.hidden; helpBtn.setAttribute('aria-expanded', String(!help.hidden)); };
document.addEventListener('click', e => { if (!help.hidden && !e.target.closest('#help')) { help.hidden = true; helpBtn.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !help.hidden) helpBtn.click(); });

// 大きさが変わったら描きなおす。まだだれもさわっていなければ、はじめの場所に置きなおす（最初は CSS が効く前で大きさ 0 のことがある）
cv.addEventListener('pointerdown', () => touched = true);
cv.addEventListener('wheel', () => touched = true);
new ResizeObserver(() => { V.resize(); if (!touched && replace) replace(); }).observe(cv);
// はじめ: ドメインからではなく、なじみのある所から。哺乳類を開いて、ネコ目・サル目などの「目」がならんだところ
//   （哺乳類 → 獣亜綱 → 真獣下綱 → 目。真獣下綱から下は COL から読む。読めなかったら哺乳類のところで止まる）
let replace = null;   // はじめの場所に置きなおす（ResizeObserver から）
async function startView() {
  const mam = T.nodes.find(n => n.name === 'Mammalia');
  if (!mam) { T.root.open = true; V.fit(); return; }
  T.ancestors(mam).forEach(a => a.open = true);
  V.selected = mam; UI.show(mam);
  // 哺乳類から下の、いま見えている枝の囲み。入るなら画面の真ん中に、入らなければ narrow を左はしに
  const place = narrow => {
    replace = () => place(narrow);
    V.resize(); V.layout(); V.settle();
    const [W, H] = V.size;
    const b = V.bbox(V.vis.filter(n => n === mam || T.ancestors(n).includes(mam)));
    const k = W < 600 ? 0.78 : Math.max(0.72, Math.min(0.92, (H - 40) / (b.bottom - b.top)));
    V.cam.k = k;
    const AW = W - 56;   // 右のつまみの分をのぞいた幅
    V.cam.x = (b.right - b.left) * k <= AW - 24 ? (AW - (b.right - b.left) * k) / 2 - b.left * k : 12 - narrow.x * k;
    V.cam.y = H / 2 - (b.top + b.bottom) / 2 * k;
    V.draw();
  };
  place(mam);
  let n = mam;
  try {
    for (const name of ['Theria', 'Eutheria']) {
      await T.open(n);
      const next = n.kids.find(k => k.name === name);
      if (!next || touched) break;
      n = next;
    }
    await T.open(n);
  } catch (e) { warn(); }
  if (touched) return;   // 読みこみの間にさわっていたら、そのまま
  place(n);
}
V.resize();
startView();

// デバッグ用（RULES 5）: 状態を見る・押す・探す
window.__trofli = {
  T, V, UI,
  find: name => T.nodes.find(n => n.name === name || n.ja === name),
  press: name => press(window.__trofli.find(name)),
  reveal: async colId => { const n = await T.reveal(colId); UI.onPick(n); return n; },
};
