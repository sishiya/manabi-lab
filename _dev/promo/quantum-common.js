// 量子の実験室の台本（quantum.html・quantum-guide.html）で共通の部分
'use strict';
// アプリは canvas の細かさを devicePixelRatio 2 までにしている（Math.min(2, dpr)）。録画のときだけ 3 まで使わせる
const QX_PRE = '{ const m = Math.min; Math.min = function (a, b) { return (arguments.length === 2 && a === 2 && b === 3) ? 3 : m.apply(Math, arguments); }; }';
const QX_BG = '#0c1016';
const QX_K = 1.5;   // canvas の CSS の大きさ = 置き場所 ÷ 1.5（dpr 3 なので、画素は置き場所 × 2 ＝ 4K の出力と同じ）

// 図の大きさをアプリの中で決める（LAY = { タブ: [[セレクタ, x, y, w, h], …] }）
function qxSize(w, LAY) {
  const css = Object.values(LAY).flat().map(([sel, , , cw, ch]) =>
    `${sel}{width:${cw / QX_K}px!important;height:${ch / QX_K}px!important;max-width:none!important;flex:none!important}`).join('');
  const st = w.document.createElement('style'); st.textContent = css; w.document.head.append(st);
}
// 実験を切りかえて、最初の状態にもどす
function qxScene(w, name) {
  w.__qx.show(name);
  if (name === 'slit') { clickEl(w, '#slitStd'); clickEl(w, '#slitMode [data-v=both]'); setInput(w, '#slitObs', false); clickEl(w, '#slitClear'); }
  if (name === 'bell') { clickEl(w, '#bellModel [data-v=q]'); clickEl(w, '#bellClear'); }
  if (name === 'uncert') clickEl(w, '#unReset');
}
// 時刻 t まで進める。とびとびの時刻（確かめ用のコマ）は、10秒前から描かずに進め直す
function qxAdvance(w, EV, lastT, t) {
  const dt = 1 / FPS;
  if (lastT < 0 || t < lastT || t - lastT > 0.5) {
    const t0 = Math.max(0, t - 10);
    runEvents(w, EV, -1, t0);
    for (let s = t0; s < t - dt / 2; s += dt) { runEvents(w, EV, s, s + dt); appStep(w, 1); }
  } else runEvents(w, EV, lastT, t);
  appStep(w, 1);
  return t;
}
// いまのタブの図を、置き場所に描く（g は出力の画素の座標）
function qxDraw(g, w, LAY) {
  g.fillStyle = QX_BG; g.fillRect(0, 0, PW * RES, PH * RES);
  for (const [sel, x, y, cw, ch] of LAY[w.__qx.active] || []) {
    const el = qs(w, sel); if (!el || !el.width) continue;
    g.save(); g.scale(RES, RES);
    g.fillStyle = '#10151d'; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(x - 4, y - 4, cw + 8, ch + 8, 10); g.fill(); g.stroke();
    g.restore();
    g.drawImage(el, x * RES, y * RES, cw * RES, ch * RES);
  }
}
