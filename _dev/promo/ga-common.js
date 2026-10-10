// 進化の箱庭の台本（ga-creatures.html・ga-creatures-guide.html）で共通の部分
// 場面 SC = [{ a, b, seed, env, gens（先に進める世代）, watch: 'top' | ['member', i] | ['hist', 世代], ev: [{ t, run(w) }] }]
// 乱数のシードを決めているので、毎回同じ進化になる。同じ seed・env・gens の場面が続くときは、計算をやり直さない
'use strict';
const gaScAt = (SC, t) => SC.find(s => t < s.b) || SC[SC.length - 1];
let gaCur = null, gaLast = -1, gaKey = '';
function gaSize(w, sz) {
  const css = Object.entries(sz).map(([sel, [cw, ch]]) => `${sel}{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important;max-width:none!important}`).join('');
  const st = w.document.createElement('style'); st.textContent = css; w.document.head.append(st);
}
function gaStart(w, s) {
  const G = w.__ga, key = [s.seed || 1, s.env || 'flat', s.gens || 0].join('/');
  if (key !== gaKey || s.fresh) {
    w.restart(s.seed || 1);
    if ((s.env || 'flat') !== G.POP.env.key) { w.setEnv(s.env || 'flat'); w.evaluatePending(0); w.afterGeneration(); G.RUN.reeval = false; }
    if (s.gens) G.gens(s.gens);
    gaKey = key;
  }
  const wt = s.watch || 'top';
  if (wt === 'top') { G.VIEW.mode = 'top'; G.watchMember(0, true); }
  else if (wt[0] === 'member') G.watchMember(wt[1]);
  else if (wt[0] === 'hist') G.watchHistory(wt[1]);
}
function gaRender(w, SC, t) {
  const s = gaScAt(SC, t), lt = t - s.a, dt = 1 / FPS, G = w.__ga;
  if (s !== gaCur || t < gaLast || t - gaLast > 0.5) {
    gaStart(w, s);
    let u0 = -1e-6;
    for (let u = 0; u < lt - dt / 2; u += dt) { for (const e of s.ev || []) if (e.t > u0 && e.t <= u) e.run(w); u0 = u; w.stepView(dt); }
    for (const e of s.ev || []) if (e.t > u0 && e.t <= lt) e.run(w);
    gaCur = s;
  } else for (const e of s.ev || []) if (e.t > gaLast - s.a && e.t <= lt) e.run(w);
  w.stepView(dt); w.render();
  gaLast = t;
}
// 世代を進める（その場面の鍵も進める＝次に同じ場面から始めるときは計算し直す）
function gaGens(w, n) { w.__ga.gens(n); gaKey = ''; }
// 何秒かかけて1世代ずつ進める、を時刻の表にする
const gaAuto = (t0, t1, every) => { const ev = []; for (let t = t0; t < t1; t += every) ev.push({ t, run: w => gaGens(w, 1) }); return ev; };
const gaText = (w, sel) => ((w.document.querySelector(sel) || {}).textContent || '').trim();
