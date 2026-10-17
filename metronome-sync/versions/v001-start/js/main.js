// メトロノームがそろうまで — メイン（描画ループと、デバッグ用の窓口）
'use strict';
window.__mesyErr = [];
window.addEventListener('error', e => window.__mesyErr.push(String(e.message)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const S = { t: 0 };

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function step(dt) { S.t += dt; }
function draw() {
  const w = cv.clientWidth, h = cv.clientHeight;
  g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--acc');
  g.beginPath(); g.arc(w / 2, h / 2, 30 + 6 * Math.sin(S.t * 2), 0, Math.PI * 2); g.fill();
}
let last = performance.now();
function loop(now) { step(Math.max(0, Math.min(0.05, (now - last) / 1000))); last = now; /* 最初のコマは now が last より前のことがある */ draw(); requestAnimationFrame(loop); }
window.addEventListener('resize', resize);
resize(); requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__mesy = { S, simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); draw(); } };