// 目のなかの光の道の台本（eye-optics.html・eye-optics-guide.html）で共通の部分
// アプリの描画ループは止めて（inject.raf）、場面の表 SEG から アプリの案内（setTour）を開き、step(1/60) をこちらで呼ぶ
// 場面 SEG = [{ a, b（動画の秒）, tour（案内の段。それより前の段は順に開いて目をすぐ合わせる）, speed（案内の速さを変えるとき）,
//   go: [{ at（シミュレーションの秒）, …条件 }]（案内の go を差しかえる）, ev: [{ t（動画の秒）, set: {…} }]（その時刻に条件を変える）, tag（早送りなどの札） }]
'use strict';
const EO_INJECT = { raf: true, dpr: 2, top: true };   // top: <head> のないページなので、差しかえを先頭に入れる
const EO_DT = 1 / 60;                                  // 1回の step の実時間（アプリの速さ S.speed 倍がシミュレーションの時間）
const eoSeg = (SEG, t) => SEG.find(s => t < s.b) || SEG[SEG.length - 1];
let eoK = -1, eoT = null, eoEv = [];
function eoStart(w, SEG, k) {
  const s = SEG[k], X = w.__eyop;
  for (let j = 0; j < s.tour; j++) { w.setTour(j); X.settle(); }
  w.setTour(s.tour);
  const S = X.S;
  if (s.speed) S.speed = s.speed;
  if (s.go) S.sched = s.go.map(g => { const o = { ...g }; delete o.at; return { t: S.t + g.at, o }; });
  if (s.set) X.set(s.set);
  eoK = k; eoT = s.a; eoEv = (s.ev || []).slice().sort((x, y) => x.t - y.t);
  w.compute(); w.draw();
}
// 動画の時刻 t の状態にして描く（もどるときは、その場面のはじめからやり直す）
function eoRender(w, SEG, t) {
  const s = eoSeg(SEG, t), k = SEG.indexOf(s), want = Math.max(s.a, Math.min(t, s.b));
  if (k !== eoK || eoT === null || want < eoT - 1e-6) eoStart(w, SEG, k);
  while (eoT + EO_DT <= want + 1e-6) {
    while (eoEv.length && eoEv[0].t <= eoT + 1e-6) w.__eyop.set(eoEv.shift().set);
    w.step(EO_DT); eoT += EO_DT;
  }
  w.draw();
}
// 測る: 場面 k をはじめから、cond(S) が true になるまでの動画の秒（max まで）
function eoUntil(w, SEG, k, cond, max = 60) {
  eoStart(w, SEG, k);
  const s = SEG[k];
  for (let t = 0; t < max; t += EO_DT) { eoRender(w, SEG, Math.min(s.b - 1e-3, s.a + t)); if (cond(w.__eyop.S)) return t; if (s.a + t >= s.b) break; }
  return null;
}
// アプリの図の大きさを決める（css px）。見え方の表・時間のグラフの canvas も
function eoSize(w, cw, ch, vw, vh, tw, th) {
  const st = w.document.createElement('style');
  st.textContent = `#app,#stage{max-width:none!important;margin:0!important}
    #cv{position:fixed!important;left:0;top:0;width:${cw}px!important;height:${ch}px!important}
    #view{position:fixed!important;display:block!important;left:0;top:${ch + 10}px!important;width:${vw + 18}px!important;right:auto!important}
    .chartbox{width:${vw}px!important;height:${vh}px!important}
    #tl{position:fixed!important;left:0;top:${ch + vh + 120}px!important;width:${tw}px!important;height:${th}px!important}`;
  w.document.head.append(st);
  w.eval('resize(); drawChart();');
}
// 見え方の表（ぼかした表＋数字の段）を、枠と見出しをつけて描く
function eoChart(g, w, x, y, cw, f, title) {
  if (f <= 0) return;
  const c = w.document.getElementById('chart'), lab = w.document.getElementById('chartLab'), ch = cw * c.height / c.width;
  g.shadowBlur = 0; g.globalAlpha = f;
  g.fillStyle = 'rgba(14,16,24,0.92)'; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x, y, cw + 20, ch + 60, 16); g.fill(); g.stroke();
  setFont(g, 26, true); g.fillStyle = '#b9bfcc'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(title, x + 20, y + 28);
  g.drawImage(c, x + 10, y + 50, cw, ch); g.drawImage(lab, x + 10, y + 50, cw, ch);
  g.globalAlpha = 1;
  return y + ch + 60;
}
// 状態の1行（くっきり・ぼやける…）と調節・ひとみの数字。長い文は区切りで折る
function eoState(g, w, x, y, wd, f, size = 28) {
  if (f <= 0) return;
  const S = w.__eyop.S, r = S.res; if (!r) return;
  const ok = r.state === 'ok';
  const parts = r.stateText.split(/[:：]\s*/), lines = [];
  setFont(g, size, true);
  for (const p of parts) {   // 幅に入るように、読点などで折る
    let cur = '';
    for (const ch of p) {
      if (g.measureText(cur + ch).width > wd - 44 && cur && !'）)、。'.includes(ch)) { lines.push(cur); cur = ''; }
      cur += ch;
    }
    if (cur) lines.push(cur);
  }
  const nums = `調節 ${S.A.toFixed(1)} D・ひとみ ${w.eval('pupilShown(S.stopR)').toFixed(1)} mm`;
  const h = 26 + lines.length * (size + 10) + 44;
  g.shadowBlur = 0; g.globalAlpha = f;
  g.fillStyle = 'rgba(14,16,24,0.92)'; g.strokeStyle = ok ? 'rgba(120,220,150,0.7)' : 'rgba(255,170,90,0.7)'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(x, y, wd, h, 16); g.fill(); g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'middle';
  lines.forEach((s, i) => { setFont(g, size, true); g.fillStyle = ok ? '#9be8b0' : '#ffc28a'; g.fillText(s, x + 22, y + 14 + (size + 10) * (i + 0.5) + 4); });
  setFont(g, size * 0.8, false); g.fillStyle = '#c9d0dc'; g.fillText(nums, x + 22, y + h - 26);
  g.globalAlpha = 1;
}
// 早送り・スローの札
function eoTag(g, s, x, y, f, right) {
  const sp = s.speed || 0, lab = s.tag || '';
  if (!lab || f <= 0) return;
  g.shadowBlur = 0; g.globalAlpha = f; setFont(g, 30, true);
  const tw = g.measureText(lab).width + 40, x0 = right ? x - tw : x;
  g.fillStyle = 'rgba(255,200,80,0.92)'; g.beginPath(); g.roundRect(x0, y - 26, tw, 52, 26); g.fill();
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lab, x0 + tw / 2, y + 1); g.globalAlpha = 1;
}
