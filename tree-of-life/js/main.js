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
T.onChange = () => { redraw(true); UI.refresh(); Compare.refresh(); };

// ふしを押した: 選んで詳細を出し、閉じていれば開く・選んでいて開いていれば閉じる。押した名前は画面の同じ場所に
async function press(n) {
  touched = true; reachId++; tripId++;
  if (Compare.picking && !n.more) { Compare.choose(n); return; }   // 「どこで分かれた？」の2つめ
  if (Compare.showing) Compare.clear(false);   // くらべ終わったあとに押したら、しぼりこみをやめてふつうにもどる
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
function setStatus(t) { document.getElementById('status').textContent = t || ''; }
function warn() { const s = document.getElementById('status'); s.textContent = '読みこめませんでした。通信を確かめて、もう一度押してください。'; setTimeout(() => s.textContent = '', 5000); }
// 検索や道すじから: 開いて真ん中に
UI.onPick = (n, fromSearch) => {
  touched = true; reachId++; tripId++;
  if (Compare.picking) { T.ancestors(n).forEach(a => a.open = true); Compare.choose(n); return; }
  if (Compare.showing) Compare.clear(false);
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
  cv.style.cursor = h || C.hit((e.offsetX - V.cam.x) / V.cam.k, (e.offsetY - V.cam.y) / V.cam.k) ? 'pointer' : 'grab';
  V.hover = h; redraw(false);
});
function up(e) {
  pts.delete(e.pointerId);
  if (drag && drag.moved <= 5 && e.type === 'pointerup') {
    // いきものを押した: その詳細（枝は開け閉めしない）
    const c = C.hit((e.offsetX - V.cam.x) / V.cam.k, (e.offsetY - V.cam.y) / V.cam.k);
    if (c && !Compare.picking) { touched = true; V.selected = c; UI.show(c); V.draw(); }
    else { const n = c || V.hit(e.offsetX, e.offsetY); if (n) press(n); }
  }
  if (pts.size < 2) pinch = null;
  drag = null;
}
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', () => { V.hover = null; redraw(false); });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  // マウスのホイール = 拡大・縮小。トラックパッドの2本指 = 動かす（ピンチは ctrlKey つきで拡大）。Shift は横へ
  //   見分け方: マウスのホイールは1回の量が大きく（50 以上の整数）、横の量が 0。トラックパッドは小さな量が続き、横もまざる
  const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  if (!e.ctrlKey && e.shiftKey) { V.cam.x -= e.deltaY || e.deltaX; redraw(false); return; }
  if (!e.ctrlKey && !mouseWheel) { V.cam.x -= e.deltaX; V.cam.y -= e.deltaY; redraw(false); return; }
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
V.onDraw = () => {
  if (document.activeElement !== zs) zs.value = k2v(V.cam.k);   // ホイール・ピンチ・全体で変わったら、つまみも動かす
  C.kick();   // 見えている名前が変わったら、いきものを出す・消す
};
V.onWorld = (g, k) => { Compare.draw(g, k); C.draw(g); };

// ---------- ふしぎ旅: 枝をランダムに下って、知らない生きものへ（さわるとそこで止まる） ----------
let tripId = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function glideTo(n, ms = 450) {
  V.layout();
  const [W, H] = V.size, k = Math.max(V.cam.k, 0.8);
  const to = { k, x: W * 0.32 - n.x * k, y: H / 2 - n.y * k }, from = { ...V.cam }, s = performance.now();
  (function f(t) {
    const u = Math.min(1, (t - s) / ms), e = u * u * (3 - 2 * u);
    V.cam.k = from.k + (to.k - from.k) * e; V.cam.x = from.x + (to.x - from.x) * e; V.cam.y = from.y + (to.y - from.y) * e;
    V.draw();
    if (u < 1) requestAnimationFrame(f);
  })(s);
  // ペインがかくれていて requestAnimationFrame が止まっていても、行き先には着くように
  setTimeout(() => { V.cam.k = to.k; V.cam.x = to.x; V.cam.y = to.y; V.draw(); }, ms + 60);
}
// 名前のある子（名前のない分かれ目はくぐる）
const namedKids = n => n.kids.flatMap(k => k.more ? [] : k.name ? [k] : namedKids(k));
async function trip(from) {
  touched = true; reachId++;
  const my = ++tripId, st = document.getElementById('status');
  let n = from || T.root;
  const path = [];
  for (let i = 0; i < 40 && my === tripId; i++) {
    if (!T.expandable(n) || n.rank === 'species') break;   // 「種」に着いたらおしまい（亜種までは下りない）
    try { await T.open(n); } catch (e) { warn(); break; }
    if (my !== tripId) return;
    const ks = namedKids(n);
    if (!ks.length) break;
    n = ks[Math.floor(Math.random() * ks.length)];
    path.push(n.ja || n.name);
    V.selected = n; V.pop(n);
    st.textContent = 'ふしぎ旅: ' + path.slice(-3).join(' › ');
    glideTo(n);
    await sleep(700);
  }
  if (my !== tripId) return;
  st.textContent = '';
  V.selected = n; UI.show(n); glideTo(n);
}
UI.onTrip = n => trip(n);
UI.onOpen = n => press(n);

// ---------- アドレスの # : いま見ている生きもの（共有・ブックマーク用） ----------
//   #t=<COL id> ／ #n=<学名>（COL id のないまとまり）／ #c=<id>,<id>（どこで分かれた？）
const keyOf = n => n.col ? 't=' + encodeURIComponent(n.col) : n.name && n.rank !== 'root' ? 'n=' + encodeURIComponent(n.name) : '';
function setHash(h) { try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { } }
UI.onShown = n => { if (touched) setHash(keyOf(n)); };
Compare.onShown = (a, b) => { const ka = keyOf(a), kb = keyOf(b); if (ka && kb) setHash('c=' + ka.slice(2) + ',' + kb.slice(2) + (ka[0] === 'n' || kb[0] === 'n' ? '&k=' + ka[0] + kb[0] : '')); };
async function fromHash() {
  const h = location.hash.slice(1);
  if (!h) return false;
  const p = new URLSearchParams(h);
  setStatus('リンクの生きものをさがしています…');
  const byKey = async (v, kind) => kind === 'n' ? T.nodes.find(x => x.name === v) : T.reveal(v);
  try {
    if (p.get('c')) {
      const [x, y] = p.get('c').split(','), kinds = p.get('k') || 'tt';
      const na = await byKey(x, kinds[0]), nb = await byKey(y, kinds[1]);
      if (!na || !nb) return false;
      touched = true; Compare.start(na); Compare.choose(nb); return true;
    }
    const n = p.get('t') ? await T.reveal(p.get('t')) : p.get('n') ? T.nodes.find(x => x.name === p.get('n')) : null;
    if (!n) return false;
    touched = true; V.resize(); UI.onPick(n, true); return true;
  } catch (e) { console.warn(e); return false; } finally { setStatus(''); }
}
document.getElementById('ztrip').onclick = () => Compare.clear(false) || trip(V.selected && V.selected.name ? V.selected : T.root);

document.getElementById('critter-on').addEventListener('change', e => { C.on = e.target.checked; V.draw(); });
// ---------- 使い方（？）のポップアップ ----------
const helpBtn = document.getElementById('helpbtn'), help = document.getElementById('help');
helpBtn.onclick = e => { e.stopPropagation(); help.hidden = !help.hidden; helpBtn.setAttribute('aria-expanded', String(!help.hidden)); };
document.addEventListener('click', e => { if (!help.hidden && !e.target.closest('#help')) { help.hidden = true; helpBtn.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !help.hidden) helpBtn.click(); });

// 大きさが変わったら描きなおす。まだだれもさわっていなければ、はじめの場所に置きなおす（最初は CSS が効く前で大きさ 0 のことがある）
cv.addEventListener('pointerdown', () => { touched = true; tripId++; });
cv.addEventListener('wheel', () => touched = true);
document.getElementById('cmpbar').addEventListener('click', () => { touched = true; tripId++; });
document.getElementById('detail').addEventListener('click', () => { touched = true; });
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
    // 入らないとき（スマホ）: 目の名前の右に、シルエットの居場所（約 90）が見えるところまで左へ。ただし枝の分かれ目は画面に残す
    V.cam.x = (b.right - b.left) * k <= AW - 24 ? (AW - (b.right - b.left) * k) / 2 - b.left * k
      : Math.max(Math.min(12 - narrow.x * k, AW - (b.right + 90) * k), 6 - narrow.jx * k);
    V.cam.y = H / 2 - (b.top + b.bottom) / 2 * k;
    V.draw();
  };
  place(mam);
  setStatus('哺乳類のなかまを読みこみ中…');
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
  setStatus('');
  if (touched) return;   // 読みこみの間にさわっていたら、そのまま
  place(n);
  UI.show(mam);   // すぐ下のなかまが読めたので、詳細を出しなおす
}
V.resize();
fromHash().then(ok => { if (!ok) startView(); });

// デバッグ用（RULES 5）: 状態を見る・押す・探す
window.__trofli = {
  T, V, UI, C, Compare, trip,
  find: name => T.nodes.find(n => n.name === name || n.ja === name),
  press: name => press(window.__trofli.find(name)),
  reveal: async colId => { const n = await T.reveal(colId); UI.onPick(n); return n; },
};
