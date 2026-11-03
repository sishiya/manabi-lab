// ヘビが進むしくみの台本（snake-move.html・snake-move-guide.html）で共通の部分（2026-11-03）
// アプリの描画ループは止めて（inject.raf）、場面の表 SEG からモード・試す・案内の段を決め、__snmo.simRun(1/60) を1コマずつこちらで呼ぶ
// 場面 SEG = [{ a, b（動画の秒）, mode（ground・side・straight・tree）, set: [[id, 値]]（試す。数はスライダー）, tour（案内の段）,
//   pre（はじめに描かずに進める秒。速さの表示が出るように）, zoom（カメラの寄り）, ev: [{ t（動画の秒）, set, tour }]（その時刻に変える） }]
// とびとびの時刻（確かめ用のコマ）は、その場面のはじめからやり直す（計算に乱数はない）
'use strict';
const SN_INJECT = { raf: true, dpr: 2, top: true };   // top: <head> がなく <header> があるページなので、差しかえを先頭に入れる
const SN_DT = 1 / 60;
const SN_NAME = { ground: '地面をうねる', side: '横ばい', straight: 'まっすぐ', tree: '木を登る' };
const snSeg = (SEG, t) => SEG.find(s => t < s.b) || SEG[SEG.length - 1];
// 同じモードが続く場面のまとまりの [はじめ, おわり]（モードの名前を場面の切れ目でちらつかせない）
function snRun(SEG, s) {
  let i = SEG.indexOf(s), j = i;
  while (i > 0 && SEG[i - 1].mode === s.mode) i--;
  while (j < SEG.length - 1 && SEG[j + 1].mode === s.mode) j++;
  return [SEG[i].a, SEG[j].b];
}
let snK = -1, snT = null, snEv = [];
function snSet(w, list) {
  for (const [id, v] of list || []) typeof v === 'number' ? w.UI.setSlider(id, v) : w.UI.set(id, v);
}
// 試すの値は、モードごとに はじめの値へもどしてから場面の値にする（前の場面の値を引きずらない）
const SN_BASE = {
  ground: [['surf', 'cloth'], ['lift', '1'], ['slope', 0], ['dig', '0']],
  side: [['sdim', '3d'], ['sground', 'sand'], ['av', 1.0], ['c3', 0.4]],
  straight: [['rsurf', 'cloth'], ['duty', 0.42]],
  tree: [['dia', 2], ['order', 'right'], ['safety', 4], ['scales', 'dig'], ['tilt', '90']],
};
function snStart(w, SEG, k) {
  const s = SEG[k], X = w.__snmo, A = X.APP;
  w.document.querySelector(`#modes [data-mode="${s.mode}"]`).click();
  snSet(w, SN_BASE[s.mode]); snSet(w, s.set);
  if (s.zoom) A.cam.zoom[s.mode] = s.zoom;
  A.cam.fix = true; A.play = true; A.speed = s.rate || 1; A.time = 0; A.msgT = 0;
  X.MODES[s.mode].reset();
  X.tour(s.tour || 0);
  A.snapCam();
  if (s.pre) { for (let u = 0; u < s.pre - 1e-6; u += SN_DT) snStep(w); A.snapCam(); }
  snK = k; snT = s.a; snEv = (s.ev || []).slice().sort((x, y) => x.t - y.t);
  w.UI.refresh(); w.draw();
}
// 1コマ進める（アプリの frame と同じ順。描くのは重い（砂の絵）ので、ここでは描かない）
function snStep(w) {
  const X = w.__snmo, A = X.APP;
  A.time += SN_DT;
  if (A.play) X.MODES[A.mode].advance(SN_DT * A.speed, A);
  w.updateCam(SN_DT);
  A.msgT -= SN_DT;
}
// 動画の時刻 t の状態にして描く（もどるときは、その場面のはじめからやり直す）
function snRender(w, SEG, t) {
  const s = snSeg(SEG, t), k = SEG.indexOf(s), want = Math.max(s.a, Math.min(t, s.b));
  if (k !== snK || snT === null || want < snT - 1e-6) snStart(w, SEG, k);
  while (snT + SN_DT <= want + 1e-6) {
    while (snEv.length && snEv[0].t <= snT + 1e-6) { const e = snEv.shift(); snSet(w, e.set); if (e.tour != null) w.__snmo.tour(e.tour); }
    snStep(w); snT += SN_DT;
  }
  w.UI.refresh(); w.draw();
}
// 測る: 場面 k の時刻 t（動画の秒）の、速さの行（#ruler）・結果の文（#result）
function snProbe(w, SEG, t) {
  snRender(w, SEG, t);   // 時刻が進むだけなら続きから（もどるとき・場面が変わるときは、はじめから）
  const d = w.document;
  return { ruler: d.getElementById('ruler').innerText, result: d.getElementById('result').innerText, S: w.__snmo.MODES[snSeg(SEG, t).mode].s };
}
// アプリの図（canvas）の大きさを css px で決める
function snSize(w, cw, ch) {
  const st = w.document.createElement('style');
  st.textContent = `#app{max-width:none!important;margin:0!important}
    #cv{position:fixed!important;left:0!important;top:0!important;width:${cw}px!important;height:${ch}px!important;z-index:50}`;
  w.document.head.append(st);
  w.dispatchEvent(new w.Event('resize'));
}
// 速さの行など（アプリの図の下の1行）を札にして描く。木を登るは「いま: …」も
function snReadout(g, w, x, y, wd, f, size = 30) {
  if (f <= 0) return;
  const d = w.document, A = w.__snmo.APP;
  const lines = [d.getElementById('ruler').innerText.trim()];
  if (A.mode === 'tree') { const r = d.querySelector('#readout b'); if (r && !w.__snmo.MODES.tree.s.fell) lines.push('いま: ' + r.textContent); }
  const L = lines.filter(Boolean); if (!L.length) return;
  setFont(g, size, true);
  const wrapL = [];
  for (const s of L) {   // 幅に入るように折る（閉じかっこ・読点で行を始めない）
    let cur = '';
    for (const ch of s) {
      if (cur && g.measureText(cur + ch).width > wd - 44 && !'）)、。・'.includes(ch)) { wrapL.push(cur); cur = ''; }
      cur += ch;
    }
    if (cur) wrapL.push(cur);
  }
  const bad = /すべり落ち|後ろへすべ|坂の下へ/.test(L[0]);
  const h = 22 + wrapL.length * (size + 14);
  g.shadowBlur = 0; g.globalAlpha = f;
  g.fillStyle = 'rgba(11,20,28,0.9)'; g.strokeStyle = bad ? 'rgba(255,140,110,0.8)' : 'rgba(166,224,122,0.6)'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(x, y, wd, h, 16); g.fill(); g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'middle';
  wrapL.forEach((s, i) => { setFont(g, size, true); g.fillStyle = bad ? '#ffb19a' : i ? '#c9d6de' : '#ffd27a'; g.fillText(s, x + 22, y + 11 + (size + 14) * (i + 0.5)); });
  g.globalAlpha = 1;
  return y + h;
}
// 色の見本（アプリの図の下の凡例を、こちらで描く）
function snLegend(g, w, x, y, f, size = 24, maxW = 1800) {
  if (f <= 0) return;
  const X = w.__snmo, m = X.APP.mode, items = X.MODES[m].legend(m === 'tree' ? w.DRAWT.C : w.DRAWG.C);
  g.shadowBlur = 0; g.globalAlpha = f; setFont(g, size, false); g.textAlign = 'left'; g.textBaseline = 'middle';
  let cx = x, cy = y;
  for (const [col, s] of items) {
    const tw = g.measureText(s).width + size * 1.6;
    if (cx + tw > x + maxW) { cx = x; cy += size * 1.6; }
    g.fillStyle = col; g.fillRect(cx, cy - size * 0.18, size * 0.9, size * 0.36);
    g.fillStyle = '#cfd8de'; g.fillText(s, cx + size * 1.15, cy + 1);
    cx += tw + size * 0.5;
  }
  g.globalAlpha = 1;
}
// モードの名前（大きく）
function snModeName(g, t, a, b, name, x, y, size = 56, align = 'left') {
  const f = fade(t, a, b, 0.4); if (f <= 0) return;
  prep(g); g.globalAlpha = f; g.textAlign = align;
  txt(g, name, x, y, size, '#a6e07a', true);
  g.globalAlpha = 1; g.shadowBlur = 0;
}
