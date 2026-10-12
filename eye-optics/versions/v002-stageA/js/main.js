// 目のなかの光の道 — メイン（計算 → 描画のループと、デバッグ用の窓口）
'use strict';
window.__eyopErr = [];
window.addEventListener('error', e => window.__eyopErr.push(String(e.message)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// 状態を進めて、光線を計算し直す
function step(dt) {
  S.t += dt;
  if (S.anim) {   // 案内の「物を近づける」
    const a = S.anim; a.t += dt; const f = Math.min(1, a.t / a.sec), e = f * f * (3 - 2 * f);
    S.d = a.from * Math.pow(a.to / a.from, e); retarget();
    if (f >= 1) S.anim = null;
  }
  // 調節は 0.3 秒、ひとみは 0.6 秒ほどでねらいへ近づける（なめらかに見せるための値。反応の速さの実測ではない）
  S.A += (S.At - S.A) * (1 - Math.exp(-dt / 0.3));
  S.stopR += (S.stopRt - S.stopR) * (1 - Math.exp(-dt / 0.6));
  compute();
}
function compute() {
  const dL = lenOf().dL, eye = buildEye(S.A, dL, S.stopR);
  const main = traceBundle(eye, { d: S.d, ang: 0 }, S.P, 25);
  const top = S.showTop ? traceBundle(eye, { d: S.d, ang: TOP_ANG }, S.P, 9) : null;
  const scale = retinaScale(eye);
  const zf = paraxialFocus(eye, { d: S.d }, S.P), blurArcmin = main.blurD / scale * 3437.75;
  let state = 'ok', stateText = 'くっきり見える';
  if (blurArcmin > 2) {   // ぼけの円が 2 分より大きいとき「ぼやける」（このアプリの目安）
    state = 'blur';
    stateText = zf < eye.L ? 'ぼやける: 像が網膜の手前にできている' :
      (S.At >= maxAccommodation(S.age) - 0.01 ? 'ぼやける: 水晶体がこれ以上ふくらめず、像が網膜のうしろ' : 'ぼやける: 像が網膜のうしろにできている');
    if (Math.abs(S.A - S.At) > 0.3) stateText = 'ピントを合わせているところ…';
  }
  S.res = { eye, main, top: top || main, scale, zf, state, stateText };
}
function draw() { drawAll(g, cv.clientWidth, cv.clientHeight); updateView(); }

let last = performance.now();
function loop(now) {
  try { step(Math.max(0, Math.min(0.05, (now - last) / 1000))); draw(); }
  catch (e) { window.__eyopErr.push(String(e && e.stack || e)); }
  last = now; /* 最初のコマは now が last より前のことがある */
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
buildControls(); initPointer();
document.getElementById('next').onclick = () => setTour((S.tour + 1) % TOUR.length);
resize(); drawChart();
setTour(0);
S.A = S.At; S.stopR = S.stopRt; compute();
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__eyop = {
  S, OPT, LAY,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); draw(); },
  tour(i) { setTour(i); },
  set(o) { Object.assign(S, o); recompute(); syncControls(); },
};
