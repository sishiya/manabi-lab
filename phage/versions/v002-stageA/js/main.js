// 細菌にとりつくウイルス — 始め方・描画ループ・デバッグ用の窓口
'use strict';
window.__phErr = window.__phErr || [];
window.addEventListener('error', e => window.__phErr.push(String(e.message)));

Land.reset('k12'); UI.markHost();
Inside.reset({ host: 'k12', variant: 'wt' }); Inside.S.playing = false; UI.markIn();

function resizeAll() { Land.resize(); Inside.resize(); }
UI.onTab(t => {
  requestAnimationFrame(resizeAll);
  if (t === 'inside' && Inside.S.t === 0 && !Inside.S.failed) Inside.S.playing = true;
  if (t === 'inside') setTimeout(() => UI.hideHint('in'), 5000);
});

let last = performance.now();
function frame(dt) {
  if (UI.tab === 'land') { Land.step(dt); Land.draw(); }
  else if (UI.tab === 'inside') { Inside.step(dt); Inside.draw(); }
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try { frame(dt); } catch (e) { window.__phErr.push(String(e && e.stack || e)); }
  requestAnimationFrame(loop);
}
window.addEventListener('resize', resizeAll);
resizeAll(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__ph = {
  Land, Inside, UI,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) frame(dt); },
  // 着陸を手早く: ファージを表面のすぐ上に置く
  dropNear() { Land.S.B.y = 40; Land.S.th = 0; },
};
