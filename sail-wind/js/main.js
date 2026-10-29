// 帆船が風で進むしくみ — メイン（表を読み、時間を進めて描く。デバッグ用の窓口）
'use strict';
window.__sawiErr = [];
window.addEventListener('error', e => window.__sawiErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__sawiErr.push(String(e.reason)));

const cv = document.getElementById('cv');
Draw.init(cv);

function step(dt) {
  const S = Sim.S;
  if (S.paused) return;
  const n = Math.max(1, Math.ceil(dt * S.mul / 0.05));   // 1回の刻みは 0.05 秒まで
  for (let i = 0; i < n; i++) Sim.update(dt * S.mul / n);
}
let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // 最初のコマは now が last より前のことがある
  step(dt);
  Draw.frame(Sim.S, Sim.twa(), Sim.S.paused ? 0 : dt * Sim.S.mul);
  UI.hud();
  requestAnimationFrame(loop);
}
window.addEventListener('resize', () => Draw.resize());

loadTable('data/').then(T => {
  Sim.T = T;
  Draw.resize();
  UI.init();
  Sim.update(0);
  requestAnimationFrame(loop);
}).catch(e => { window.__sawiErr.push('表を読めない: ' + e); document.getElementById('tourText').textContent = '計算の表を読めませんでした。ページを読みなおしてください。'; });

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__sawi = {
  Sim, Draw, UI,
  simRun(sec) { Sim.run(sec); Draw.frame(Sim.S, Sim.twa(), 0); UI.hud(); return { vKn: Sim.S.v / KN, twa: Sim.twa(), f: Sim.S.f }; },
  steady: (twa, twsKn = Sim.S.twsKn, mode = Sim.S.mode) => Sim.T.steady(mode, twsKn, twa),
};
