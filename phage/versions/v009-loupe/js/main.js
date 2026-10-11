// 細菌にとりつくウイルス — 始め方・描画ループ・デバッグ用の窓口
'use strict';
window.__phErr = window.__phErr || [];
window.addEventListener('error', e => window.__phErr.push(String(e.message)));

Land.reset('k12'); UI.markHost();
Inside.reset({ host: 'k12', variant: 'wt' }); Inside.S.playing = false; UI.markIn();

Zoom.buildList(); Zoom.open('form');

function resizeAll() { Land.resize(); Inside.resize(); Zoom.fit(); }
UI.onTab(t => {
  requestAnimationFrame(resizeAll);
  if (t === 'inside' && Inside.S.t === 0 && !Inside.S.failed) Inside.S.playing = true;
  if (t === 'inside') setTimeout(() => UI.hideHint('in'), 5000);
});

let last = performance.now();
function frame(dt) {
  if (UI.tab === 'land') { Land.step(dt); Land.draw(); }
  else if (UI.tab === 'inside') { Inside.step(dt); Inside.draw(); }
  else if (UI.tab === 'zoom') { Zoom.step(dt); Zoom.draw(); }
}
function loop(now) {
  // 最初のコマは now が last より前のことがあり、dt がマイナスになる（√ が NaN になってファージの位置が壊れた）→ 0〜0.05秒に収める
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  try { frame(dt); } catch (e) { window.__phErr.push(String(e && e.stack || e)); }
  requestAnimationFrame(loop);
}
window.addEventListener('resize', resizeAll);
// 隠れているタブの絵は大きさ0になるので、見えて大きさが変わったときに測り直す（タブの切りかえ・画面の回転・欄の高さの変化）
if (window.ResizeObserver) {
  const ro = new ResizeObserver(es => {
    for (const e of es) {
      const id = e.target.id, w = e.contentRect.width;
      if (w < 2) continue;
      if (id === 'cvLand') Land.resize(); else if (id === 'cvIn') Inside.resize(); else if (id === 'cvZoom') Zoom.fit();
    }
    try { frame(0); } catch (err) { window.__phErr.push(String(err && err.stack || err)); }
  });
  ['cvLand', 'cvIn', 'cvZoom'].forEach(id => ro.observe(document.getElementById(id)));
}
resizeAll(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__ph = {
  Land, Inside, UI, Zoom,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) frame(dt); },
  // 着陸を手早く: ファージを表面のすぐ上に置く
  dropNear() { Land.S.B.y = 40; Land.S.th = 0; },
};
