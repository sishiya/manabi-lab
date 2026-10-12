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

// 状態を進めて、光線を計算し直す。dtReal は実時間、S.speed 倍してシミュレーションの時間にする
function step(dtReal) {
  const dt = dtReal * S.speed;
  S.t += dt;
  if (S.anim) {   // 案内の「物を近づける」
    const a = S.anim; a.t += dt; const f = Math.min(1, a.t / a.sec), e = f * f * (3 - 2 * f);
    S.d = a.from * Math.pow(a.to / a.from, e); retarget();
    if (f >= 1) S.anim = null;
  }
  while (S.sched && S.sched.length && S.sched[0].t <= S.t) applyCond(S.sched.shift().o);   // 案内の「この時刻に切りかえる」
  dynStep(S, S.t, dt, S.At, S.stopRt);   // 調節とひとみは、測られた遅れと速さで追いかける（dynamics.js）
  compute();
  tlRecord();
}
function compute() {
  const dL = lenOf().dL, a = astigOf(), astig = a.cv !== a.ch;
  const cyl = S.sec === 'h' ? a.ch : a.cv, eye = buildEye(S.A, dL, S.stopR, cyl);   // 図に描く断面
  const main = traceBundle(eye, { d: S.d, ang: 0 }, S.P, 25);
  const top = S.showTop ? traceBundle(eye, { d: S.d, ang: TOP_ANG }, S.P, 9) : null;
  const scale = retinaScale(eye);
  const zf = paraxialFocus(eye, { d: S.d }, S.P);
  // もう一方の断面（乱視のときだけ別に計算）。ぼけの円の直径（ラジアン）は縦・横それぞれの断面の光線から
  let other = main;
  if (astig) { const oc = S.sec === 'h' ? a.cv : a.ch, oP = S.sec === 'h' ? S.Pv : S.Ph; other = traceBundle(buildEye(S.A, dL, S.stopR, oc), { d: S.d, ang: 0 }, oP, 17); }
  const dMain = main.blurD / scale, dOther = other.blurD / scale;
  const diamV = S.sec === 'h' ? dOther : dMain, diamH = S.sec === 'h' ? dMain : dOther;
  const blurArcmin = Math.max(diamV, diamH) * 3437.75;
  let state = 'ok', stateText = 'くっきり見える';
  if (blurArcmin > BLUR_OK) {   // ぼけの円が 2 分より大きいとき「ぼやける」（このアプリの目安）
    state = 'blur';
    stateText = astig && Math.max(diamV, diamH) > 1.6 * Math.min(diamV, diamH) ? `ぼやける: 縦と横でピントの合う所がちがう（乱視）。${diamV > diamH ? '縦' : '横'}の向きに広がるぼけ` :
      zf < eye.L ? 'ぼやける: 像が網膜の手前にできている' :
      (S.At >= maxAccommodation(S.age) - 0.01 ? 'ぼやける: 水晶体がこれ以上ふくらめず、像が網膜のうしろ' : 'ぼやける: 像が網膜のうしろにできている');
    if (Math.abs(S.A - S.At) > 0.3) stateText = Math.abs(S.aEff - S.At) > 0.01 && Math.abs(S.A - S.aEff) < 0.05 && !S.replay ? 'ぼやける: 目がまだ反応していない（遅れ）' : 'ピントを合わせているところ…';
  }
  S.res = { eye, main, top: top || main, scale, zf, state, stateText, diamV, diamH, blurArcmin, astig };
}
function draw() { drawAll(g, cv.clientWidth, cv.clientHeight); updateView(); tlDraw(); syncSlider(); }

let last = performance.now();
function loop(now) {
  try { if (!S.replay) step(Math.max(0, Math.min(0.05, (now - last) / 1000))); draw(); }
  catch (e) { window.__eyopErr.push(String(e && e.stack || e)); }
  last = now; /* 最初のコマは now が last より前のことがある */
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
buildControls(); tlInit(); initPointer();
document.getElementById('next').onclick = () => setTour((S.tour + 1) % TOUR.length);
resize(); drawChart();
setTour(0);
compute();
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__eyop = {
  S, OPT, LAY, TL, DYN,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt * S.speed) step(dt); draw(); },   // sec はシミュレーションの秒
  tour(i) { setTour(i); },
  set(o) { applyCond(o); },
  settle() { dynSettle(S, S.At, S.stopRt); compute(); draw(); },
};
