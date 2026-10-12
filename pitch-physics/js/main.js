// 変化球のしくみ — メイン（描画ループと、デバッグ用の窓口）
'use strict';
window.__piphErr = [];
window.addEventListener('error', e => window.__piphErr.push(String(e.message)));

const cv = document.getElementById('cv'), g = cv.getContext('2d');
const bc = document.getElementById('ball'), gb = bc.getContext('2d');

function fit(c, ctx) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function resize() { fit(cv, g); fit(bc, gb); layout(cv.clientWidth, cv.clientHeight); draw(); }

function step(dt) {
  if (!S.playing) return;
  S.t += dt * S.speed;
  if (S.t >= S.res.tPlate) { S.t = S.res.tPlate; S.playing = false; document.getElementById('play').textContent = '▶'; }
  document.getElementById('time').value = S.t;
  updateNums();
}
function draw() {
  drawViews(g, cv.clientWidth, cv.clientHeight);
  drawBall(gb, bc.clientWidth, bc.clientHeight);
}
let last = performance.now();
function loop(now) { step(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now; /* 最初のコマは now が last より前のことがある */ draw(); requestAnimationFrame(loop); }

setPitch('ff');
buildControls(); buildTime(); bindPointer();
document.getElementById('next').addEventListener('click', () => setTour(S.tour === TOUR.length - 1 ? 0 : S.tour + 1));
window.addEventListener('resize', resize);
setTour(0);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__piph = {
  S, PHY, PITCHES, TOUR, simulate, aim, forces,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); draw(); },
  tour(i) { setTour(i); draw(); },
  pitch(id) { setPitch(id); syncAll(); draw(); },
  set(o) { Object.assign(S.P, o); recompute(); syncAll(); draw(); },
  time(t) { S.t = t; syncAll(); draw(); },
};
