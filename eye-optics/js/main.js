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
  darkStep(S, dt, lightOf().L, S.age);   // 暗さに慣れる（分の単位）
  afterStep(dt);                          // 残像の順応（after.js）
  compute();
  tlRecord();
}
function compute() {
  const dL = lenOf().dL, a = astigOf(), astig = a.on;
  const cyl = S.sec === 'w' ? 0 : a.P, eye = buildEye(S.A, dL, S.stopR, cyl);   // 図に描く断面（強い向き／弱い向き）
  const main = traceBundle(eye, { d: S.d, ang: 0 }, S.P, 25);
  const top = S.showTop ? traceBundle(eye, { d: S.d, ang: TOP_ANG }, S.P, 9) : null;
  const scale = retinaScale(eye);
  const zf = paraxialFocus(eye, { d: S.d }, S.P);
  // もう一方の断面（乱視のときだけ別に計算）。ぼけの円の直径（ラジアン）は縦・横それぞれの断面の光線から
  let other = main;
  if (astig) { const oc = S.sec === 'w' ? a.P : 0, oP = S.sec === 'w' ? S.Ps : S.Pw; other = traceBundle(buildEye(S.A, dL, S.stopR, oc), { d: S.d, ang: 0 }, oP, 17); }
  const dMain = main.blurD / scale, dOther = other.blurD / scale;
  // 強い向き・弱い向きに広がるぼけ（乱視がなければ同じ）
  const diamS = S.sec === 'w' ? dOther : dMain, diamW = S.sec === 'w' ? dMain : dOther;
  const blurArcmin = Math.max(diamS, diamW) * 3437.75;
  let state = 'ok', stateText = L('くっきり見える', 'Sharp');
  if (blurArcmin > BLUR_OK) {   // ぼけの円が 2 分より大きいとき「ぼやける」（このアプリの目安）
    state = 'blur';
    stateText = astig && Math.max(diamS, diamW) > 1.6 * Math.min(diamS, diamW) ? L(`ぼやける: 向きによってピントの合う所がちがう（乱視）。${diamS > diamW ? a.strong : a.weak}の向きに広がるぼけ`, `Blurry: focus differs by direction (astigmatism). The blur spreads ${diamS > diamW ? a.strong : a.weak}ly`) :
      zf < eye.L ? L('ぼやける: 像が網膜の手前にできている', 'Blurry: the image forms in front of the retina') :
      (S.At >= maxAccommodation(S.age) - 0.01 ? L('ぼやける: 水晶体がこれ以上ふくらめず、像が網膜のうしろ', 'Blurry: the lens can’t round up any more; the image is behind the retina') : L('ぼやける: 像が網膜のうしろにできている', 'Blurry: the image forms behind the retina'));
    if (Math.abs(S.A - S.At) > 0.3) stateText = Math.abs(S.aEff - S.At) > 0.01 && Math.abs(S.A - S.aEff) < 0.05 && !S.replay ? L('ぼやける: 目がまだ反応していない（遅れ）', 'Blurry: the eye hasn’t reacted yet (delay)') : L('ピントを合わせているところ…', 'Focusing…');
  }
  // 暗さ: しきい値より暗ければ見えない。桿体だけのときは、まん中（中心窩）が見えない
  const see = darkSee(S, lightOf().L);
  if (see.who === 'none') { state = 'blur'; stateText = L('暗くて見えない: 目がまだ暗さに慣れていない', 'Too dark to see: the eye is not used to the dark yet'); }
  else if (see.who === 'rod') { state = 'blur'; stateText = L('うす暗く見える: 桿体だけで見ている（まん中は見えない）', 'Dim: seeing with rods only (the middle is missing)'); }
  else if (state === 'ok' && lightOf().L < 3) {   // ピントは合っているが、うす暗いので視力が下がる（view.js の acuityAt）
    const pct = Math.round(acuityAt(lightOf().L) / acuityAt(3000) * 100);
    state = 'blur'; stateText = L(`ピントは合っているが、うす暗くて細かい所が見えにくい（視力 ${pct}%）`, `In focus, but too dim to see fine detail (acuity ${pct}%)`);
  }
  if (S.chart === 'after') {   // 残像の表を見ているとき
    state = S.afterMode === 'white' && S.afterA > 0.05 ? 'blur' : 'ok';
    stateText = S.afterMode === 'stare' ? L(`図を見つめている（順応 ${Math.round(S.afterA * 100)}%）`, `Staring at the figure (adapted ${Math.round(S.afterA * 100)}%)`)
      : S.afterA > 0.05 ? L(`残像: 反対の色が見える（強さ ${Math.round(S.afterA * AFTER.k * 100)}%）`, `Afterimage: opposite colors (strength ${Math.round(S.afterA * AFTER.k * 100)}%)`) : L('残像は消えた', 'The afterimage is gone');
  }
  S.res = { eye, main, top: top || main, scale, zf, state, stateText, diamS, diamW, ang: a.ang, blurArcmin, astig, see };
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
document.title = L('目のなかの光の道', 'Light’s Path Inside the Eye');
document.querySelectorAll('#langsw button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
document.getElementById('speeds').setAttribute('aria-label', L('時間の速さ', 'Time speed'));
document.getElementById('wins').setAttribute('aria-label', L('グラフの長さ', 'Graph length'));
buildControls(); tlInit(); initPointer();
darkSettle(S, lightOf().L);
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
  settle() { dynSettle(S, S.At, S.stopRt); darkSettle(S, lightOf().L); S.afterA = 0; compute(); draw(); },
};
