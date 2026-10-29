// いのちの系統樹の台本（tree-of-life.html・tree-of-life-guide.html）で共通の部分
// アプリは通信（COL・Wikidata・PhyloPic）を待ちながら動くので、アプリの時計をこちらの時刻にする:
//   performance.now・setTimeout・requestAnimationFrame を差しかえ（inject.pre）、__tolStep(ms) で動画の時刻だけ進める。
//   押す・検索などの出来事のあとは、通信と絵の読みこみが終わるまで（__pend が 0）時刻を止めて待つ → 通信の遅さは動画に出ない
// 出来事の表 ACT = [{ t（動画の秒）, run(w), wait（待つ秒の幅。既定 2） }]、毎コマの動き CAMS = [{ a, b, each(w, u（0〜1）, t) }]
// もどる時刻（確かめ用のコマのあとの録画など）は、アプリを開きなおしてはじめから進めなおす。乱数は決めておく（同じ絵になるように）
'use strict';
const TOL_PRE = `(() => {
  let vt = 0, tid = 0, seed = 20261030; const tq = [];
  Math.random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  performance.now = () => vt;
  const realST = window.setTimeout.bind(window);
  window.setTimeout = (cb, ms, ...a) => { const id = ++tid; tq.push({ id, at: vt + (+ms || 0), cb: () => typeof cb === 'function' && cb(...a) }); return id; };
  window.clearTimeout = id => { const i = tq.findIndex(x => x.id === id); if (i >= 0) tq.splice(i, 1); };
  window.__pend = 0;
  const of = window.fetch.bind(window);
  window.fetch = (...a) => { window.__pend++; return of(...a).then(r => { const j = r.json.bind(r), tx = r.text.bind(r);
      let done = false; const end = () => { if (!done) { done = true; window.__pend--; } };
      r.json = () => j().finally(end); r.text = () => tx().finally(end); realST(end, 15000); return r; },
    e => { window.__pend--; throw e; }); };
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', { get() { return d.get.call(this); }, set(v) {
    window.__pend++; let done = false; const end = () => { if (!done) { done = true; window.__pend--; } };
    this.addEventListener('load', end, { once: true }); this.addEventListener('error', end, { once: true }); realST(end, 15000);
    // 外の絵（PhyloPic・Commons）は CORS で読む。そのままだと canvas が汚れて録画に写せない
    if (/^https?:/.test(v) && this.crossOrigin === null) this.crossOrigin = 'anonymous';
    d.set.call(this, v); } });
  window.__tolStep = ms => {
    vt += ms;
    for (;;) { tq.sort((a, b) => a.at - b.at || a.id - b.id); if (!tq.length || tq[0].at > vt) break;
      const x = tq.shift(); try { x.cb(); } catch (e) { (window.__trofliErr = window.__trofliErr || []).push(String(e)); } }
    window.__rafStep(vt);
  };
})();`;
const TOL_INJECT = { raf: true, dpr: 2, top: true, pre: TOL_PRE };   // top: <head> のないページなので、差しかえを先頭に入れる
const tolSleep = ms => new Promise(r => setTimeout(r, ms));
// 通信と絵の読みこみが終わるまで待つ（2回つづけて 0 なら終わり。最大 max 秒）
async function tolIdle(w, max = 20) {
  const t0 = performance.now();
  for (let ok = 0; ok < 2 && performance.now() - t0 < max * 1000;) { await tolSleep(60); ok = w.__pend > 0 ? 0 : ok + 1; }
}
// 樹形図だけを決まった大きさで（上の題名・検索、右の詳細、右下の道具は隠す。絵は canvas だけを写す）
function tolSize(w, cw, ch) {
  const st = w.document.createElement('style');
  st.textContent = `#stage{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important;z-index:5}
    #zoom,#status,#guide3d,#cmpbar{display:none!important}`;
  w.document.head.append(st);
  // 裏の iframe では ResizeObserver が届かないことがあるので、測りなおして、はじめの場所に置きなおす（main.js の replace）
  w.document.getElementById('cv').getBoundingClientRect();
  w.__trofli.V.resize(); w.eval('if (replace) replace()');
  w.__tolSized = true;
}
const tolReady = w => !!(w.__trofli && w.__tolStep && w.__trofli.find('Eutheria') && w.__trofli.find('Eutheria').open && w.__trofli.find('Eutheria').loaded);
let tolT = 0, tolBusy = -1, tolReadyOnce = false;
// アプリを開きなおす（同じ iframe。WindowProxy は同じものが使える）
async function tolReload(w, onOpen) {
  const f = w.frameElement; f.srcdoc = f.srcdoc;
  await tolSleep(300);
  for (let i = 0; i < 300 && !tolReady(w); i++) await tolSleep(100);
  if (onOpen) onOpen(w);
}
// 動画の時刻 t まで進める
async function tolRender(w, ACT, CAMS, t, onOpen) {
  if (!tolReadyOnce) { await tolIdle(w, 30); tolReadyOnce = true; }
  if (t < tolT - 1e-6) { await tolReload(w, onOpen); ACT.forEach(a => a.done = false); tolT = 0; tolBusy = -1; await tolIdle(w, 30); }
  const DT = 1 / FPS;
  while (tolT < t - 1e-6) {
    const nt = Math.min(t, tolT + DT);
    for (const a of ACT) if (!a.done && a.t <= nt + 1e-6) {
      a.done = true;
      try { await a.run(w); } catch (e) { (w.__trofliErr || []).push('台本: ' + e); }
      tolBusy = Math.max(tolBusy, a.t + (a.wait ?? 2));
    }
    if (nt <= tolBusy) await tolIdle(w);
    for (const c of CAMS) if (nt >= c.a && nt <= c.b) c.each(w, (nt - c.a) / (c.b - c.a), nt);
    w.__tolStep((nt - tolT) * 1000);
    tolT = nt;
  }
}
const tolPaper = w => w.getComputedStyle(w.document.getElementById('stage')).backgroundColor;
// 2D のカメラを、画面の真ん中の点と大きさで（大きさは対数でなめらかに）
const tolEase = u => u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
function tolCamOf(w) { const V = w.__trofli.V, [W, H] = V.size; return { cx: (W / 2 - V.cam.x) / V.cam.k, cy: (H / 2 - V.cam.y) / V.cam.k, k: V.cam.k }; }
function tolCamSet(w, c) { const V = w.__trofli.V, [W, H] = V.size; V.cam.k = c.k; V.cam.x = W / 2 - c.cx * c.k; V.cam.y = H / 2 - c.cy * c.k; V.draw(); }
function tolCamLerp(a, b, u) { const e = tolEase(u); return { cx: a.cx + (b.cx - a.cx) * e, cy: a.cy + (b.cy - a.cy) * e, k: Math.exp(Math.log(a.k) + (Math.log(b.k) - Math.log(a.k)) * e) }; }
// 「全体」を押したときのカメラ（いまのカメラは変えない）
function tolFitCam(w) { const V = w.__trofli.V, s = { ...V.cam }; V.fit(); const c = tolCamOf(w); Object.assign(V.cam, s); V.draw(); return c; }
// ふしの画面の位置（css px）。名前の札のまん中あたり
function tolScreen(w, n) { const [x, y] = w.__trofli.V.screenOf(n); return { x: x + 40, y }; }
