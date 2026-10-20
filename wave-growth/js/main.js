// 波が育つまで — メイン（つまみ・時間・カメラ・描画ループと、デバッグ用の窓口）
'use strict';
window.__wagrErr = [];
window.addEventListener('error', e => window.__wagrErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const W = window.WGgrowth, HOUR = 3600, TMAX = 72 * HOUR;
const WIND_ANG = Math.PI + 0.5;          // 波が進む向き（左前からこちらへ）
const SUN = { sunEl: 25 * Math.PI / 180, sunAz: 0, cloud: 0.35, expo: 0.45, rough0: 0.012 };

// ---- 状態 ----
const S = {
  t: 0,                                   // 風が吹きはじめてからの時間（秒）
  sched: [{ t: 0, U: 10 }],               // 風の記録（いつから何 m/s）
  play: false, speed: HOUR,               // ▶ のとき 1 秒で進む時間
  simT: 0,                                // 画面の波の時計（ふつうの速さ）
  st: null,
};

// ---- 海とカメラ ----
const cv = $('cv'), ov = $('ov');
let ocean = null;
try { ocean = window.WGocean.create(cv); }
catch (e) { $('glerr').hidden = false; $('glerr').textContent = 'この画面では海を描けません（' + e.message + '）。グラフと数字は使えます。'; }
const cam = window.WGcamera.create(cv);
let rscale = 1;
function resize() {
  const r = cv.getBoundingClientRect(), cap = Math.sqrt(1920 * 1080 / Math.max(1, r.width * r.height));
  const k = Math.min(devicePixelRatio || 1, 2, cap) * rscale;
  cv.width = Math.max(1, Math.round(r.width * k)); cv.height = Math.max(1, Math.round(r.height * k));
}
addEventListener('resize', resize); resize();

// ---- 時間のつまみ（目盛りは平方根: はじめの数時間を見やすく） ----
const tSlider = $('tSlider');
const t2v = t => Math.round(Math.sqrt(t / TMAX) * 1000), v2t = v => TMAX * (v / 1000) ** 2;
tSlider.addEventListener('input', () => { S.t = v2t(+tSlider.value); S.play = false; S.free = true; update(); });
$('play').onclick = () => { if (S.t >= TMAX) S.t = 0; S.play = !S.play; S.free = true; update(); };
document.querySelectorAll('#speeds button').forEach(b => b.onclick = () => { S.speed = +b.dataset.s; update(); });

// ---- 風（ここから先の風を変える） ----
const wSlider = $('wSlider');
function windAt(t) { let U = 0; for (const e of S.sched) if (e.t <= t) U = e.U; return U; }
wSlider.addEventListener('input', () => {
  const U = +wSlider.value;
  S.sched = S.sched.filter(e => e.t < S.t - 1); S.sched.push({ t: S.t, U });
  if (S.sched[0].t > 0) S.sched.unshift({ t: 0, U });
  S.free = true; update();
});
function resetWind(U) { S.sched = [{ t: 0, U }]; }

// ---- 数字・表示 ----
function fmtTime(t) {
  if (t < HOUR) return Math.round(t / 60) + ' 分';
  const h = Math.floor(t / HOUR), m = Math.round((t - h * HOUR) / 60);
  return h + ' 時間' + (m && h < 10 ? ' ' + m + ' 分' : '');
}
let lastSea = { H: -1, T: -1, at: 0 };
function update() {
  const st = S.st = W.stateAt(S.sched, S.t), U = windAt(S.t);
  tSlider.value = t2v(S.t);
  $('tLabel').textContent = fmtTime(S.t);
  $('play').textContent = S.play ? '❚❚' : '▶';
  document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.s === S.speed));
  wSlider.value = U; $('wLabel').textContent = U.toFixed(1) + ' m/s';
  const lam = W.G * st.Tp ** 2 / (2 * Math.PI), c = W.G * st.Tp / (2 * Math.PI);
  $('nH').textContent = st.Hm0 > 0 ? (st.Hm0 < 0.1 ? (st.Hm0 * 100).toFixed(1) + ' cm' : st.Hm0.toFixed(2) + ' m') : '0';
  $('nT').textContent = st.Tp > 0 ? st.Tp.toFixed(1) + ' 秒' : '—';
  $('nL').textContent = st.Tp > 0 ? (lam < 1 ? (lam * 100).toFixed(0) + ' cm' : lam.toFixed(lam < 10 ? 1 : 0) + ' m') : '—';
  $('nC').textContent = st.Tp > 0 ? c.toFixed(1) + ' m/s' + (U > 0 ? `（風の ${(c / U).toFixed(2)} 倍）` : '') : '—';
  $('nS').textContent = st.Hm0 <= 0 ? '凪' : st.kept ? '前の強い風の波が残っている' : st.full ? '発達しきった' : '育っている途中';
  cam.minY = 1.5 + 1.2 * st.Hm0;
  // 自分でつまみを動かしたら、案内の文のかわりに、いまの様子をひとことで
  if (S.free) { window.WGguide.clear(); $('stepNo').textContent = '';
    $('cap').textContent = st.Hm0 <= 0 ? (U > 0 ? '風が吹く前。海は鏡のように平ら。' : '風がない。海は鏡のように平ら。')
      : `風速 ${U.toFixed(U % 1 ? 1 : 0)} m/s の風が吹いて ${fmtTime(S.t)}。波の高さ ${$('nH').textContent}、いちばん多い波の長さ ${$('nL').textContent}。`
        + (st.full ? 'もうこれ以上は育ちません。' : st.kept ? '前の強い風の波が残っています。' : ''); }
  window.WGgraph.draw($('graph'), Object.assign({ U }, st), S.sched, S.t);
  drawTimeline();
}
// 海の分布を GPU へ（毎コマ見て、変わっていたら。続けて動かしているときは 90 ms に1回）
function syncSea() {
  const st = S.st, now = performance.now();
  if (ocean && (Math.abs(st.Hm0 - lastSea.H) > 0.004 * Math.max(st.Hm0, 0.01) || Math.abs(st.Tp - lastSea.T) > 0.003 * Math.max(st.Tp, 0.1)) && now - lastSea.at > 90) {
    ocean.setSea(st.Hm0, st.Tp, WIND_ANG); lastSea = { H: st.Hm0, T: st.Tp, at: now };
  }
}
// 風の記録の帯（つまみの下）
function drawTimeline() {
  const c = $('tl'), r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  S.sched.forEach((e, i) => {
    const x0 = Math.sqrt(e.t / TMAX) * r.width, x1 = Math.sqrt((i + 1 < S.sched.length ? S.sched[i + 1].t : TMAX) / TMAX) * r.width;
    g.fillStyle = e.U > 0 ? `hsl(${205 - e.U * 2}, 70%, ${28 + e.U * 2.4}%)` : '#2a3a48'; g.fillRect(x0, 0, x1 - x0, r.height);
  });
}

// 風の向きの矢印（画面の右上。カメラを回すと一緒に回る）
function drawOverlay(b) {
  const r = ov.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (ov.width !== Math.round(r.width * dpr) || ov.height !== Math.round(r.height * dpr)) { ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr); }
  const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  const U = windAt(S.t); if (!(U > 0)) return;
  const fx = b.cf[0], fz = b.cf[2], fl = Math.hypot(fx, fz) || 1, rx = b.cr[0], rz = b.cr[2];
  const wx = Math.cos(WIND_ANG), wz = Math.sin(WIND_ANG), sx = wx * rx + wz * rz, sy = -(wx * fx + wz * fz) / fl;   // 画面の上 = カメラの前
  const cx = r.width - 44, cy = 44;
  g.strokeStyle = 'rgba(232,240,244,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#e8f0f4'; g.fillStyle = '#e8f0f4'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx - sx * 18, cy - sy * 18); g.lineTo(cx + sx * 14, cy + sy * 14); g.stroke();
  const a = Math.atan2(sy, sx); g.beginPath(); g.moveTo(cx + sx * 20, cy + sy * 20);
  g.lineTo(cx + sx * 20 - 9 * Math.cos(a - .45), cy + sy * 20 - 9 * Math.sin(a - .45)); g.lineTo(cx + sx * 20 - 9 * Math.cos(a + .45), cy + sy * 20 - 9 * Math.sin(a + .45)); g.fill();
  g.font = '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-body'); g.textAlign = 'center';
  g.fillText('風 ' + U.toFixed(0) + ' m/s', cx, cy + 44);
}

// ---- 案内 ----
let camAnim = null;
const guideApi = {
  resetWind, setTime(t) { S.t = t; S.play = false; update(); },
  camTo(c) { camAnim = { from: { pitch: cam.pitch, dist: cam.dist }, to: Object.assign({ pitch: cam.pitch, dist: cam.dist }, c), k: 0 }; },
  caption(text, step) { S.free = false; $('cap').textContent = text; $('stepNo').textContent = step; },
};
$('next').onclick = () => window.WGguide.next(guideApi);
cv.addEventListener('pointerdown', () => { $('hint').classList.add('gone'); });

// ---- ループ ----
let last = performance.now(), fpsAcc = 0, fpsN = 0, slow = 0;
function step(dt) {
  S.simT += dt;
  if (S.play) { S.t = Math.min(TMAX, S.t + dt * S.speed); if (S.t >= TMAX) S.play = false; update(); }
  if (camAnim) { camAnim.k = Math.min(1, camAnim.k + dt / 1.2); const e = 1 - Math.pow(1 - camAnim.k, 3);
    cam.pitch = camAnim.from.pitch + (camAnim.to.pitch - camAnim.from.pitch) * e; cam.dist = camAnim.from.dist + (camAnim.to.dist - camAnim.from.dist) * e;
    if (camAnim.k >= 1) camAnim = null; }
}
function draw(dt) {
  syncSea();
  const b = cam.basis();
  // 海面の傾きのばらつき（Cox & Munk 1954、きれいな海面）σ² = 0.003 + 5.12×10⁻³ U。描いている波の分を引いた残りで照り返しをにじませる
  if (ocean) { const U = windAt(S.t), tot = S.st.Hm0 > 0 ? 0.003 + 5.12e-3 * U : 0;
    SUN.rough0 = Math.max(0.012, Math.sqrt(Math.max(tot - ocean.fftSlope, 0)));
    ocean.frame(dt, S.simT, b, SUN); }
  drawOverlay(b);
}
function loop(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  step(dt); draw(dt);
  // 1 コマ 22 ms をこえる状態が 2 秒続いたら、描く画素を 85% に（50% まで）
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { const ms = fpsAcc / fpsN * 1000; fpsAcc = 0; fpsN = 0; slow = ms > 22 ? slow + 1 : 0;
    if (slow >= 4 && rscale > 0.5) { rscale = Math.max(0.5, rscale * 0.85); resize(); slow = 0; }
    $('perf').textContent = `1コマ ${ms.toFixed(1)} ms` + (ocean && ocean.gpuMs ? `（GPU ${ocean.gpuMs.toFixed(1)}）` : '') + `・${cv.width}×${cv.height}`; }
  requestAnimationFrame(loop);
}
update();
window.WGguide.show(0, guideApi);
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__wagr = { S, cam, get ocean() { return ocean; }, update,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) step(dt); draw(dt); return S.st; } };
