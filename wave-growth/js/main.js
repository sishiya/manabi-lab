// 波が育つまで — メイン（つまみ・時間・カメラ・描画ループと、デバッグ用の窓口）
'use strict';
window.__wagrErr = [];
window.addEventListener('error', e => window.__wagrErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const W = window.WGgrowth, HOUR = 3600, TMAX = 72 * HOUR;
const WIND_ANG = Math.PI + 0.5;          // 波が進む向き（左前からこちらへ）
// 空・光（時刻と天気から js/env.js で毎コマ）。カメラははじめ +x（東）を見ている
const SUN = { rough0: 0.012, meshes: [], points: [] };
const DAY_SEC = 240;                     // 「自動」のとき 1 日を 4 分で

// ---- 状態 ----
const S = {
  t: 0,                                   // 風が吹きはじめてからの時間（秒）
  sched: [{ t: 0, U: 10 }],               // 風の記録（いつから何 m/s）
  play: true, speed: 0,                   // ▶ のとき 1 秒で進む時間（0 = おまかせ: つまみの目盛りで同じ速さ → はじめはゆっくり。72時間を1分で）
  tod: 'morning', clock: 7, weather: 'clear', obj: 'human',
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
if (ocean && ocean.isSoft) rscale = 0.5;   // ソフトの GPU では画素を半分から
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
  const tm = Math.round(t / 60); if (tm < 60) return tm + ' 分';
  const h = Math.floor(tm / 60), m = tm % 60;
  return h + ' 時間' + (m && h < 10 ? ' ' + m + ' 分' : '');
}
let lastSea = { H: -1, T: -1, at: 0 }, bfRow = -1;
// 風力階級の表（この計算の発達しきった海の高さは、その風速の範囲のまん中で）
document.querySelector('#bfTable tbody').innerHTML = window.WGbeaufort.T.map(r => {
  const mid = isFinite(r[2]) ? (r[1] + r[2]) / 2 : r[1], f = mid > 0.4 && r[0] <= 8 ? W.fullyDev(mid).Hm0 : 0;   // この計算の風は 20 m/s まで
  const tb = r[4] == null ? '—' : r[4] + ' m' + (r[5] != null ? `（${r[5]}）` : '');
  return `<tr><td>${r[0]}</td><td>${r[1].toFixed(1)}〜${isFinite(r[2]) ? r[2].toFixed(1) : ''}</td><td>${r[3]}</td><td>${tb}</td><td>${f ? (f < 1 ? f.toFixed(2) : f.toFixed(1)) + ' m' : '—'}</td></tr>`; }).join('');
function update() {
  const st = S.st = W.stateAt(S.sched, S.t), U = windAt(S.t);
  tSlider.value = t2v(S.t);
  $('tLabel').textContent = fmtTime(S.t);
  $('play').textContent = S.play ? '❚❚' : '▶';
  document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.s === S.speed));
  wSlider.value = U; $('wLabel').textContent = U.toFixed(1) + ' m/s';
  const lam = W.G * st.Tp ** 2 / (2 * Math.PI), c = W.G * st.Tp / (2 * Math.PI);
  S.us = W.stokes(st.Hm0, st.Tp);
  $('nH').textContent = st.Hm0 > 0 ? (st.Hm0 < 0.1 ? (st.Hm0 * 100).toFixed(1) + ' cm' : st.Hm0.toFixed(2) + ' m') : '0';
  $('nT').textContent = st.Tp > 0 ? st.Tp.toFixed(1) + ' 秒' : '—';
  $('nL').textContent = st.Tp > 0 ? (lam < 1 ? (lam * 100).toFixed(0) + ' cm' : lam.toFixed(lam < 10 ? 1 : 0) + ' m') : '—';
  $('nC').textContent = st.Tp > 0 ? c.toFixed(1) + ' m/s' + (U > 0 ? `（風の ${(c / U).toFixed(2)} 倍）` : '') : '—';
  $('nS').textContent = st.Hm0 <= 0 ? '凪' : st.kept ? '前の強い風の波が残っている' : st.full ? '発達しきった' : '育っている途中';
  cam.minY = 1.5 + 1.2 * st.Hm0;
  // 風力階級（気象庁）
  const bf = window.WGbeaufort.at(U); $('nB').textContent = '風力 ' + bf[0]; $('nBd').textContent = bf[3];
  if (bfRow !== bf[0]) { bfRow = bf[0]; document.querySelectorAll('#bfTable tbody tr').forEach((tr, i) => tr.classList.toggle('now', i === bf[0])); }
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
function drawOverlay(b, dt = 0) {
  const r = ov.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (ov.width !== Math.round(r.width * dpr) || ov.height !== Math.round(r.height * dpr)) { ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr); }
  const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  if (SUN.rain) drawRain(g, r.width, r.height, dt);
  drawPropLabel(g); drawTrails(g);
  g.font = '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-body'); g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.8)';
  g.fillText(E.clockText(S.clock) + (S.tod === 'auto' ? '（時間が進む）' : ''), 12, r.height - 14);
  const U = mode === 'swell' ? -1 : windAt(S.t); if (!(U > 0) && mode !== 'swell') return;
  const fx = b.cf[0], fz = b.cf[2], fl = Math.hypot(fx, fz) || 1, rx = b.cr[0], rz = b.cr[2];
  const wx = Math.cos(mode === 'swell' ? SW_ANG : WIND_ANG), wz = Math.sin(mode === 'swell' ? SW_ANG : WIND_ANG), sx = wx * rx + wz * rz, sy = -(wx * fx + wz * fz) / fl;   // 画面の上 = カメラの前
  const cx = r.width - 44, cy = 44;
  g.strokeStyle = 'rgba(232,240,244,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#e8f0f4'; g.fillStyle = '#e8f0f4'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx - sx * 18, cy - sy * 18); g.lineTo(cx + sx * 14, cy + sy * 14); g.stroke();
  const a = Math.atan2(sy, sx); g.beginPath(); g.moveTo(cx + sx * 20, cy + sy * 20);
  g.lineTo(cx + sx * 20 - 9 * Math.cos(a - .45), cy + sy * 20 - 9 * Math.sin(a - .45)); g.lineTo(cx + sx * 20 - 9 * Math.cos(a + .45), cy + sy * 20 - 9 * Math.sin(a + .45)); g.fill();
  g.font = '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-body'); g.textAlign = 'center';
  g.fillText(mode === 'swell' ? 'うねり' : '風 ' + U.toFixed(0) + ' m/s', cx, cy + 44);
}

// ---- 景色・大きさくらべ ----
const E = window.WGenv;
function setTod(k) { S.tod = k;
  if (k !== 'auto') { S.clock = E.TIMES[k];
    // 朝と夕方は太陽のほうへ向く（逆光のきらきら）
    if (k === 'morning' || k === 'evening') { const L = E.sunDir(S.clock); guideApi.camTo({ yaw: Math.atan2(L[2], L[0]) + 0.25 }); } }
  if (ocean) ocean.skyChanged();
  document.querySelectorAll('#tods button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); }
function setWeather(k) { S.weather = k; if (ocean) ocean.skyChanged(); rainDrops = null;
  document.querySelectorAll('#weathers button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); }
document.querySelectorAll('#tods button').forEach(b => b.onclick = () => setTod(b.dataset.k));
document.querySelectorAll('#weathers button').forEach(b => b.onclick = () => setWeather(b.dataset.k));
// 雨（画面の手前に落ちるすじ。見た目だけ）
let rainDrops = null;
function drawRain(g, w, h, dt) {
  if (!rainDrops) rainDrops = Array.from({ length: 260 }, () => ({ x: Math.random() * w, y: Math.random() * h, v: 600 + Math.random() * 500, l: 10 + Math.random() * 16 }));
  g.strokeStyle = 'rgba(210,225,235,.32)'; g.lineWidth = 1; g.beginPath();
  for (const d of rainDrops) { d.y += d.v * dt; d.x -= d.v * dt * 0.12; if (d.y > h) { d.y = -d.l; d.x = Math.random() * w * 1.1; }
    g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * 0.12, d.y - d.l); }
  g.stroke();
}
const PR = window.WGprops, FL = window.WGfloats;
const buoyMesh = ocean ? ocean.makeMesh(PR.buoy()) : null, objMeshes = {};
const OBJ_YAW = { human: 1.9, boat: 1.3, fishing: 1.3, ship: 1.3 };   // 人はこちら向き、船は斜め横（カメラは yaw 0.35 から見る）
let objPose = null, wetRain = 0;
function setObj(k) { S.obj = k; objPose = null;
  if (k !== 'none' && ocean && !objMeshes[k]) objMeshes[k] = ocean.makeMesh(PR.TYPES[k].geo());
  if (k !== 'none') guideApi.camTo({ dist: PR.TYPES[k].dist });
  document.querySelectorAll('#objs button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); }
document.querySelectorAll('#objs button').forEach(b => b.onclick = () => setObj(b.dataset.k));
// 物の上に「人 身長 1.7 m」などの札（画面に投げて）
function drawPropLabel(g) {
  if (S.obj === 'none' || !objPose || !ocean || !ocean.VP) return;   // 3D のミラーの惑星でも同じ
  const T = PR.TYPES[S.obj], q = project([objPose.d[0], objPose.d[1] + T.labelY, objPose.d[2]]); if (!q) return;
  const r = ov.getBoundingClientRect(), [x, y] = q; if (x < -60 || x > r.width + 60 || y < -20 || y > r.height + 20) return;
  const text = T.name + ' ' + T.size;
  g.font = '12px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-body'); g.textAlign = 'center';
  const tw = g.measureText(text).width + 12; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x - tw / 2, y - 16, tw, 18); g.fillStyle = '#fff'; g.fillText(text, x, y - 3);
}

// ブイの通った跡（画面に投げて。古いほどうすく）
function project(p) { const P = ocean && ocean.VP; if (!P) return null; const r = ov.getBoundingClientRect();
  const cx = P[0] * p[0] + P[4] * p[1] + P[8] * p[2] + P[12], cy = P[1] * p[0] + P[5] * p[1] + P[9] * p[2] + P[13], cw = P[3] * p[0] + P[7] * p[1] + P[11] * p[2] + P[15];
  return cw > 0 ? [(cx / cw * 0.5 + 0.5) * r.width, (0.5 - cy / cw * 0.5) * r.height] : null; }
function drawTrails(g) {
  FL.list.forEach(bu => { const n = bu.trail.length; g.lineWidth = 2;
    for (let i = 1; i < n; i++) { const a = project(bu.trail[i - 1]), b = project(bu.trail[i]); if (!a || !b) continue;
      g.strokeStyle = `rgba(255,201,90,${(0.85 * i / n).toFixed(3)})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } });
}
// 海をタップ: ブイの近くなら断面、ほかはブイを浮かべる
cv.addEventListener('pointerup', e => {
  if (cam.wasDrag() || !ocean) return;
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  const hit = FL.list.find(bu => { const q = bu.pos && project(bu.pos); return q && Math.hypot(q[0] - px, q[1] - py) < 30; });
  if (hit) { openSection(); return; }
  const b = cam.basis(), [tx, ty] = ocean.txty, nx = px / r.width * 2 - 1, ny = 1 - py / r.height * 2;
  const d = [0, 1, 2].map(i => b.cf[i] + nx * tx * b.cr[i] + ny * ty * b.cu[i]);
  if (d[1] >= -1e-3) return;
  const t = -b.pos[1] / d[1]; if (t > 400) return;
  FL.add(b.pos[0] + d[0] * t, b.pos[2] + d[2] * t, S.simT);
});
$('clearBtn').onclick = () => { FL.clear(); closeSection(); };   // ブイの真下の断面なので一緒に閉じる
// 断面
let secOpen = false;
let secMag = 1, beachOpen = false, beachSlope = 0.033;
function openBeach() { if (beachOpen) { closeBeach(); return; } closeSection(); $('beachBtn').textContent = '浜の断面をとじる'; beachOpen = true; $('sec').hidden = false; $('beachBar').hidden = false; $('next').hidden = true; $('stage').classList.add('sec'); }
function closeBeach() { beachOpen = false; $('beachBtn').textContent = '浜への断面を見る'; $('beachBar').hidden = true; if (!secOpen) { $('sec').hidden = true; $('next').hidden = false; $('stage').classList.remove('sec'); } }
function setSlope(v) { beachSlope = v; document.querySelectorAll('#slopes button').forEach(b => b.classList.toggle('on', +b.dataset.s === v)); }
document.querySelectorAll('#slopes button').forEach(b => b.onclick = () => setSlope(+b.dataset.s));
$('beachBtn').onclick = openBeach; $('beachClose').onclick = closeBeach; setSlope(0.033);
function openSection() { if (beachOpen) closeBeach(); secOpen = true; $('secBtn').textContent = '断面をとじる'; $('sec').hidden = false; $('secBar').hidden = false; $('next').hidden = true; $('stage').classList.add('sec'); }
function closeSection() { secOpen = false; $('secBtn').textContent = '断面を見る'; $('sec').hidden = true; $('secBar').hidden = true; $('next').hidden = false; $('stage').classList.remove('sec'); }
$('secMag').onclick = () => { secMag = secMag === 1 ? 3 : 1; $('secMag').classList.toggle('on', secMag > 1); $('secMag').textContent = secMag > 1 ? '本当の大きさに' : '動きを3倍に'; };
$('secBtn').onclick = () => { if (secOpen) { closeSection(); return; } if (!FL.list.length) FL.add(4, 2, S.simT); openSection(); };
$('secClose').onclick = closeSection;

// ---- ミラーの惑星（映画の水の惑星）の場面 ----
const MI = window.WGmiller; let mode = 'earth', mPlay = true, mSpeed = 300;
const zOf = v => 1000 * Math.pow(10, v / 1000 * 3), zTo = z => Math.round(Math.log10(z / 1000) / 3 * 1000);          // 1 km〜1000 km
const dOf = v => 0.5 * Math.pow(10, v / 1000 * 4.2), dTo = d => Math.round(Math.log10(d / 0.5) / 4.2 * 1000);        // 0.5 m〜8 km
function mLabels() { $('mZl').textContent = MI.fmtM(MI.S.Z); $('mDl').textContent = MI.fmtM(MI.S.hDeep); $('mOl').textContent = MI.S.obsKm + ' km';
  $('mZ').value = zTo(MI.S.Z); $('mD').value = dTo(MI.S.hDeep); $('mO').value = MI.S.obsKm; }
function mPreset(k) { if (k === 'film') Object.assign(MI.S, { Z: 2.5e5, hDeep: 4000, obsKm: 30 }); else Object.assign(MI.S, { hDeep: 0.5 });
  MI.reset(); mLabels(); mNums(); document.querySelectorAll('#mPresets button').forEach(b => b.classList.toggle('on', b.dataset.p === k)); }
$('mZ').addEventListener('input', () => { MI.S.Z = zOf(+$('mZ').value); MI.reset(); mLabels(); mNums(); });
$('mD').addEventListener('input', () => { MI.S.hDeep = Math.max(MI.S.hShelf, dOf(+$('mD').value)); MI.reset(); mLabels(); mNums(); });
$('mO').addEventListener('input', () => { MI.S.obsKm = +$('mO').value; MI.S.maxObs = 0; MI.S.maxSlope = 0; mLabels(); mNums(); });
document.querySelectorAll('#mPresets button').forEach(b => b.onclick = () => mPreset(b.dataset.p));
function setMSpeed(v) { mSpeed = v; document.querySelectorAll('#mSpeeds button').forEach(x => x.classList.toggle('on', +x.dataset.s === v)); }
document.querySelectorAll('#mSpeeds button').forEach(b => b.onclick = () => setMSpeed(+b.dataset.s));
$('mPlay').onclick = () => { mPlay = !mPlay; $('mPlay').textContent = mPlay ? '❚❚' : '▶'; };
$('mReset').onclick = () => { MI.reset(); mNums(); };
function mNums() { const S2 = MI.S, film = 1200;
  const msg = S2.t < 2 * MI.P ? 'ゆれを大きくしているところ（はじめの 2 時間）' : S2.maxObs >= film * 0.8 ? '映画の大波くらいの高さになっています。深い海で育った潮が、浅い棚に押し寄せた「段」（ボア）です。' : S2.maxObs >= 50 ? '大きな段が来ますが、映画の大波（1 km あまり）にはとどきません。' : 'ほとんど何も来ません。浅い海だけでは、水の量が足りず、潮で高く積み上がりません。';
  const deg = Math.atan(S2.maxSlope) * 180 / Math.PI;
  $('mNums').innerHTML = `いる所の水面の最高（2 時間め以降）: <b>${MI.fmtM(S2.maxObs)}</b>（映画の大波の ${(S2.maxObs / film * 100).toFixed(S2.maxObs < film * 0.1 ? 2 : 0)}%）<br>深い海の水面の最高: <b>${MI.fmtM(S2.maxDeep)}</b><br>`
    + `いる所のまわりの水面のいちばん急な所: <b>${deg < 0.1 ? deg.toFixed(3) : deg.toFixed(1)}°</b>（映画の波は切り立った壁。この計算では${deg < 5 ? 'ゆるい山として来る。格子 6.4 km の計算なので、本当はもう少し急になる所がありうる' : '急な前の面ができる'}）<br>${msg}`; }
// 3D で見る: 海は小さい風の波（風速 5 m/s・2 時間）、カメラと物は水面に浮かぶ
let mView = 'section';
function setMView(v) { mView = v; document.querySelectorAll('#mViews button[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('sec').hidden = mode !== 'miller' || v !== 'section';
  if (v === '3d' && ocean) { const r = W.fromDuration(5, 2 * HOUR); ocean.setSea(r.Hm0, r.Tp, WIND_ANG); lastSea = { H: -1, T: -1, at: 0 };
    camAnim = null; setMSpeed(10); camY = null; cam.free = true; cam.eye = 3; cam.dist = 7; cam.pitch = 0.03; cam.yaw = Math.PI + 0.12; ocean.skyChanged(); }   // 深い海のほう（−x）を向く
  else cam.free = false; }
document.querySelectorAll('#mViews button[data-v]').forEach(b => b.onclick = () => setMView(b.dataset.v));
// カメラ: ふつうは水面に浮かぶ（高さは 0.6 秒でならして追う）。止めると空中の一か所から見る（水面が来たら押し上げる）
let camY = null, camHold = null;
$('mHold').onclick = () => { camHold = camHold == null ? (camY == null ? 0 : camY) + cam.eye : null; $('mHold').classList.toggle('on', camHold != null); $('mHold').textContent = camHold != null ? 'カメラを浮かべる' : 'カメラを止める'; };
$('mX10').onclick = () => { camY = null; camHold = null; $('mHold').classList.remove('on'); $('mHold').textContent = 'カメラを止める'; MI.scale = MI.scale > 1 ? 1 : 10; $('mX10').classList.toggle('on', MI.scale > 1); };
$('mTele').onclick = () => { const on = cam.fovY > 0.5; cam.fovY = (on ? 12 : 52) * Math.PI / 180; $('mTele').classList.toggle('on', on); };
// ---- 遠くの嵐から届くうねり ----
const SW = window.WGswell, SW_TMAX = 14 * 86400, SW_ANG = Math.PI + 0.5; let swPlay = true, swSpeed = 3600, swLast = { H: -1, T: -1, at: 0 }, swObs = null;
function swLabels() { const P2 = SW.P; $('swTl').textContent = SW.fmtT(P2.t); $('swT').value = Math.round(P2.t / SW_TMAX * 1000);
  $('swRl').textContent = (P2.R / 1e3).toFixed(0) + ' km'; $('swR').value = P2.R / 1e3; $('swUl').textContent = P2.U + ' m/s'; $('swU').value = P2.U;
  $('swDl').textContent = (P2.Ds / 3600).toFixed(0) + ' 時間'; $('swD').value = P2.Ds / 3600; $('swLl').textContent = (P2.Ls / 1e3).toFixed(0) + ' km'; $('swL').value = P2.Ls / 1e3; }
$('swT').addEventListener('input', () => { SW.P.t = +$('swT').value / 1000 * SW_TMAX; swUpdate(); });
$('swR').addEventListener('input', () => { SW.P.R = +$('swR').value * 1e3; swUpdate(); });
$('swU').addEventListener('input', () => { SW.P.U = +$('swU').value; swUpdate(); });
$('swD').addEventListener('input', () => { SW.P.Ds = +$('swD').value * 3600; swUpdate(); });
$('swL').addEventListener('input', () => { SW.P.Ls = +$('swL').value * 1e3; swUpdate(); });
$('swPlay').onclick = () => { swPlay = !swPlay; $('swPlay').textContent = swPlay ? '❚❚' : '▶'; };
function setSwSpeed(v) { swSpeed = v; document.querySelectorAll('#swSpeeds button').forEach(x => x.classList.toggle('on', +x.dataset.s === v)); }
document.querySelectorAll('#swSpeeds button').forEach(b => b.onclick = () => setSwSpeed(+b.dataset.s));
function swUpdate() {
  swObs = SW.obs(SW.P.t); swLabels(); SW.drawMap($('swMap')); SW.drawChart($('swChart'), SW_TMAX);
  const o = swObs, s2 = o.src, fa = SW.firstArrival(), lam = W.G * o.Tp * o.Tp / (2 * Math.PI);
  $('swNums').innerHTML = `嵐の海: 高さ <b>${s2.Hm0.toFixed(1)} m</b>・周期 <b>${s2.Tp.toFixed(1)} 秒</b><br>`
    + `いちばん早い波（周期 ${fa.T.toFixed(0)} 秒）が着くのは <b>${SW.fmtT(fa.t)}</b> 後<br>`
    + (o.Hm0 > 0.02 ? `いま届いているうねり: 高さ <b>${o.Hm0.toFixed(2)} m</b>・いちばん多い周期 <b>${o.Tp.toFixed(1)} 秒</b>（波長 ${lam.toFixed(0)} m・その波の群れの速さ ${(SW.cg(1 / o.Tp) * 3.6).toFixed(0)} km/時）` : 'いまは、まだ（または、もう）うねりがほとんど届いていない');
}
function swSyncSea() {
  if (!ocean || !swObs) return; const o = swObs, now = performance.now();
  if ((Math.abs(o.Hm0 - swLast.H) > 0.01 * Math.max(o.Hm0, 0.05) || Math.abs(o.Tp - swLast.T) > 0.01 * Math.max(o.Tp, 1)) && now - swLast.at > 120) {
    // うねり＋そよ風（3 m/s・1 時間）のさざ波（表面が鏡にならないように。画面に書く）
    const sw = o.Hm0 > 0.005 ? W.makeSpecKTable(SW.fs, o.E, SW_ANG, o.s) : null, br = W.fromDuration(3, HOUR), loc = W.makeSpecK(br.Hm0, br.Tp, SW_ANG + 0.9);
    ocean.setSpec(sw ? (kx, kz) => sw(kx, kz) + loc(kx, kz) : loc); swLast = { H: o.Hm0, T: o.Tp, at: now }; }
}
function setMode(m) { mode = m; document.body.classList.toggle('miller', m === 'miller'); document.body.classList.toggle('swell', m === 'swell');
  $('swellBox').hidden = m !== 'swell'; if (m === 'swell') { cam.free = false; cam.target[1] = 0; swLast = { H: -1, T: -1, at: 0 }; swUpdate(); guideApi.camTo({ dist: 45, pitch: 0.15 }); }
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  $('millerBox').hidden = m !== 'miller';
  if (m === 'miller') { closeSection(); closeBeach(); if (!MI.S.hist.length) { MI.reset(); } mLabels(); setMView(mView); }
  else { $('sec').hidden = !(secOpen || beachOpen); cam.target[1] = 0; cam.free = false; cam.pitch = 0.12; cam.dist = 16; cam.fovY = 52 * Math.PI / 180; $('mTele').classList.remove('on'); lastSea = { H: -1, T: -1, at: 0 }; } }
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.m));

// ミラーの惑星を 3D で（カメラ・物は水面に浮かぶ。惑星の丸みで遠くは沈む）
function drawMiller3D(dt) {
  const big = MI.bigData(), here = MI.sample(0), r0 = W.fromDuration(5, 2 * HOUR);
  camY = camY == null ? here.eta : camY + (here.eta - camY) * (1 - Math.exp(-dt / 0.6));
  if (camHold != null) { cam.target[1] = camHold - cam.eye; cam.minY = here.eta + 1.6 + 1.2 * r0.Hm0; }
  else { cam.target[1] = camY; cam.minY = here.eta + 1.6 + 1.2 * r0.Hm0; }   // 水の中には入らない
  const b = cam.basis(); big.planeY = MI.sample(b.pos[0]).eta;
  Object.assign(SUN, E.make(S.clock, S.weather)); SUN.fogL = S.weather === 'fog' ? 600 : S.weather === 'rain' ? 30000 : 200000;   // この惑星の空気は澄んでいると仮定 SUN.big = big;
  SUN.rough0 = Math.sqrt(Math.max(0.003 + 5.12e-3 * 5 - ocean.fftSlope, 1.5e-4));
  const pr = ocean.probe, T = S.obj !== 'none' ? PR.TYPES[S.obj] : null, k = T ? T.pts.length : 0, yaw = T ? OBJ_YAW[S.obj] : 0;
  SUN.meshes = [];
  if (T) { const p = PR.pose(S.obj, pr.slice(0, k), yaw);
    if (p) { p.d[1] += here.eta; p.s[0] += here.slope;
      if (!objPose) objPose = p; else { const a = 1 - Math.exp(-dt / T.tau); for (let i = 0; i < 3; i++) objPose.d[i] += (p.d[i] - objPose.d[i]) * a; for (let i = 0; i < 2; i++) objPose.s[i] += (p.s[i] - objPose.s[i]) * a; }
      if (objMeshes[S.obj]) SUN.meshes.push({ mesh: objMeshes[S.obj], M: PR.matrix(0, 0, objPose, yaw) }); } }
  SUN.points = T ? PR.worldPts(S.obj, 0, 0, yaw) : []; SUN.wetRain = 0; SUN.wetSplash = 0.3;
  ocean.frame(dt, S.simT, b, SUN); SUN.big = null;
  // 画面の文字
  const r = ov.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (ov.width !== Math.round(r.width * dpr) || ov.height !== Math.round(r.height * dpr)) { ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr); }
  const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  if (SUN.rain) drawRain(g, r.width, r.height, dt);
  drawPropLabel(g);
  const cr = MI.crest(), tShow = MI.S.t + MI.S.debt, lines = [`惑星の時間 ${(tShow / 3600).toFixed(2)} 時間（地球では ${(tShow / 3600 * 7).toFixed(1)} 年）`,
    `いる所の水面: ふだんより ${MI.fmtM(here.real)}`, `深い海のほう（はじめのカメラの向き）でいちばん高い所: ${cr.km < 1 ? 'ここ' : cr.km.toFixed(0) + ' km 先'}・${MI.fmtM(cr.h)}`];
  g.font = '13px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-body'); g.textAlign = 'left';
  if (MI.scale > 1) lines.push('※ 大波の高さを 10 倍にして見せています（数字は本当の高さ）');
  lines.forEach((l, i) => { const tw = g.measureText(l).width; g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(8, 8 + i * 20, tw + 10, 18); g.fillStyle = '#fff'; g.fillText(l, 13, 21 + i * 20); });
}

// ---- 案内 ----
let camAnim = null;
const guideApi = {
  resetWind, setTime(t) { S.t = t; S.play = false; update(); },
  camTo(c) { let yaw = c.yaw != null ? c.yaw : cam.yaw; yaw = cam.yaw + Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw));   // 近い回りで
    camAnim = { from: { pitch: cam.pitch, dist: cam.dist, yaw: cam.yaw }, to: Object.assign({ pitch: cam.pitch, dist: cam.dist }, c, { yaw }), k: 0 }; },
  addBuoy() { if (!FL.list.length) FL.add(-6, -1.5, S.simT); }, section(on) { on ? openSection() : closeSection(); },
  caption(text, step) { S.free = false; $('cap').textContent = text; $('stepNo').textContent = step; },
};
$('next').onclick = () => window.WGguide.next(guideApi);
cv.addEventListener('pointerdown', () => { $('hint').classList.add('gone'); });

// ---- ループ ----
let last = performance.now(), fpsAcc = 0, fpsN = 0, slow = 0, mNumsTick = 0;
function step(dt) {
  S.simT += dt;
  if (S.tod === 'auto') S.clock = (S.clock + dt * 24 / DAY_SEC) % 24;
  if (S.play) { S.t = Math.min(TMAX, S.speed ? S.t + dt * S.speed : v2t(Math.sqrt(S.t / TMAX) * 1000 + dt * 1000 / 60)); if (S.t >= TMAX) S.play = false; update(); }
  if (camAnim) { camAnim.k = Math.min(1, camAnim.k + dt / 1.2); const e = 1 - Math.pow(1 - camAnim.k, 3);
    cam.pitch = camAnim.from.pitch + (camAnim.to.pitch - camAnim.from.pitch) * e; cam.yaw = camAnim.from.yaw + (camAnim.to.yaw - camAnim.from.yaw) * e; cam.dist = camAnim.from.dist + (camAnim.to.dist - camAnim.from.dist) * e;
    if (camAnim.k >= 1) camAnim = null; }
}
function draw(dt) {
  if (mode === 'swell' && swPlay) { SW.P.t = Math.min(SW_TMAX, SW.P.t + dt * swSpeed); if (SW.P.t >= SW_TMAX) swPlay = false; if (++mNumsTick % 6 === 0) swUpdate(); }
  if (mode === 'miller') { if (mPlay) MI.advance(dt * mSpeed); if (++mNumsTick % 10 === 0) mNums();
    if (mView === 'section' || !ocean) { MI.draw($('sec')); return; }
    drawMiller3D(dt); return; }
  if (mode === 'swell') { swSyncSea(); cam.minY = 1.5 + 1.2 * ((swObs && swObs.Hm0) || 0); } else syncSea();   // カメラは波の中に入らない
  const b = cam.basis();
  // 海面の傾きのばらつき（Cox & Munk 1954、きれいな海面）σ² = 0.003 + 5.12×10⁻³ U。描いている波の分を引いた残りで照り返しをにじませる
  // 物: 浮き台（点 0、さざ波は入れない）とブイ。前のコマに読んだ海面の動きで置く
  // 物: 大きさくらべ（点を k こ）とブイ。前のコマに読んだ海面の動きで置き、大きい物ほどゆっくり追う
  const pr = ocean ? ocean.probe : [], T = S.obj !== 'none' ? PR.TYPES[S.obj] : null, k = T ? T.pts.length : 0, yaw = T ? OBJ_YAW[S.obj] : 0;
  SUN.meshes = [];
  if (T) { const p = PR.pose(S.obj, pr.slice(0, k), yaw);
    if (p) { if (!objPose) objPose = p; else { const a = 1 - Math.exp(-dt / T.tau);
      for (let i = 0; i < 3; i++) objPose.d[i] += (p.d[i] - objPose.d[i]) * a; for (let i = 0; i < 2; i++) objPose.s[i] += (p.s[i] - objPose.s[i]) * a; }
      if (objMeshes[S.obj]) SUN.meshes.push({ mesh: objMeshes[S.obj], M: PR.matrix(0, 0, objPose, yaw) }); } }
  FL.step(dt, S.simT, pr.slice(k), S.us || 0, WIND_ANG);
  if (buoyMesh) FL.list.forEach(bu => { if (bu.p) SUN.meshes.push({ mesh: buoyMesh, M: PR.matrix(bu.x0 + bu.drift[0], bu.z0 + bu.drift[1], bu.p, 0) }); });
  SUN.points = (T ? PR.worldPts(S.obj, 0, 0, yaw) : []).concat(FL.points());
  // 濡れ: 雨で全体が（10 秒ほどで濡れ、1 分ほどで乾く）、波が高いと下のほうがしぶきで（見た目の目安）
  const wantRain = SUN.rain ? 1 : 0; wetRain += (wantRain - wetRain) * (1 - Math.exp(-dt / (wantRain > wetRain ? 10 : 60)));
  SUN.wetRain = wetRain; SUN.wetSplash = (T ? T.splash : 0) * Math.min(1, Math.max(0, (S.st.Hm0 - 0.2) / 1.5));
  Object.assign(SUN, E.make(S.clock, S.weather));
  if (ocean) { const U = mode === 'swell' ? 2 : windAt(S.t), tot = (mode === 'swell' || S.st.Hm0 > 0) ? 0.003 + 5.12e-3 * U : 0;   // 遠くの嵐の場面は風がほとんどない海
    SUN.rough0 = Math.max(0.012, Math.sqrt(Math.max(tot - ocean.fftSlope, 0)));
    ocean.frame(dt, S.simT, b, SUN); }
  drawOverlay(b, dt);
  if (beachOpen) window.WGbeach.draw($('sec'), S.st, S.simT, beachSlope);
  if (secOpen) window.WGsection.draw($('sec'), S.st, S.simT, FL.list.length > 0, S.us || 0, secMag);
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
// はじめ: 朝の景色・人あり・風が吹く前から再生（案内は「つぎへ」で始まる）
setTod('morning'); setWeather('clear'); setObj('human'); setMode('earth'); setSwSpeed(3600);
setMSpeed(300);
S.free = true; update();
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__wagr = { mNums: () => mNums(), S, cam, get ocean() { return ocean; }, update,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) { step(dt); draw(dt); } return S.st; } };   // 毎コマ描く（ブイは描いたコマの海面を読んで動くため）
