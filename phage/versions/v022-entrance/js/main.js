// 細菌にとりつくウイルス — 始め方・描画ループ・デバッグ用の窓口
'use strict';
window.__phErr = window.__phErr || [];
// ResizeObserver のループのお知らせは害がないので記録しない
window.addEventListener('error', e => { if (!/ResizeObserver loop/.test(String(e.message))) window.__phErr.push(String(e.message)); });

View.resize(); View.fitAll(true);
UI.init();
// はじめは、たくさんの細菌が見える大きさから
View.look(0, -2.2e8, 3.6e9, true);

let last = performance.now();
function frame(dt) {
  if (UI.state.tab !== 'view') return;
  UI.advance(dt);
  View.stepCam(dt);
  const st = Story.at(UI.state.u);
  UI.update(st);
  // 時刻もカメラも変わっていなければ描き直さない（止めているときに重くしない）
  const sig = UI.state.u + '|' + View.sig();
  if (sig === lastSig && !force) return;
  lastSig = sig; force = false;
  const t0 = performance.now();
  Scene.draw(st);
  View.drawLoupe(() => { Scene.draw(st); });
  // 描くのにかかった時間の平均。重い（14ms をこえる）なら解像度を下げる（1.5 → 1.25 → 1）
  drawMs = drawMs * 0.92 + (performance.now() - t0) * 0.08;
  if (++drawN > 40 && drawMs > 14 && View.dprCap > 1) { View.setDprCap(View.dprCap > 1.25 ? 1.25 : 1); force = true; drawN = 0; drawMs = 8; }
}
let drawMs = 8, drawN = 0;
let lastSig = '', force = true;
function loop(now) {
  // 画面の書きかえが速い（120Hz など）ときも、描くのは最大で毎秒約60回
  if (now - last < 15) { requestAnimationFrame(loop); return; }
  // 最初のコマは now が last より前のことがあるので、0〜0.05秒に収める
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  try { frame(dt); } catch (e) { window.__phErr.push(String(e && e.stack || e)); }
  requestAnimationFrame(loop);
}
window.addEventListener('resize', () => { View.resize(); force = true; });
if (window.ResizeObserver) new ResizeObserver(() => { View.resize(); force = true; try { frame(0); } catch (e) { window.__phErr.push(String(e && e.stack || e)); } }).observe(document.getElementById('cv'));
requestAnimationFrame(loop);
// 少し待ってから再生（はじめは細菌の全体）
setTimeout(() => { UI.state.playing = true; document.getElementById('play').textContent = '⏸'; }, 900);

// デバッグ用: 時刻を指定して描く・カメラを動かす（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__ph = {
  View, Story, Scene, UI,
  at(u) { UI.state.u = u; UI.state.playing = false; force = true; frame(0); },
  show(u, x, y, w) { UI.state.u = u; UI.state.playing = false; View.setAuto(false); View.setBounds(null); View.look(x, y, w, true); force = true; frame(0); },
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) frame(dt); },
};
