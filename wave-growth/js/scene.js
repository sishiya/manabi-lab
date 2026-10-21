// 波が育つまで — 見かた（上から・海面から・自由に動く・浜）・空（時刻と雲）・大きさくらべ・ブイ・断面・しぶき・画面の文字と、毎コマの絵（draw）
'use strict';
const E = window.WGenv, PR = window.WGprops, FL = window.WGfloats;
const fontB = () => getComputedStyle(document.documentElement).getPropertyValue('--f-body');

// ---- 空: 時刻（いる所の、きょうの日付で）と雲の量 ----
function obsLL() { return GL.G.obs; }
function setTod(k) { S.tod = k;
  if (k !== 'auto') { S.clock = E.timeOf(k, obsLL().lat, obsLL().lon);
    // 朝と夕方は太陽のほうへ向く（逆光のきらきら）
    if ((k === 'morning' || k === 'evening') && view === 'orbit') { const L = E.make(S.clock, S.cloud, obsLL().lat, obsLL().lon).L; guideApi.camTo({ yaw: Math.atan2(L[2], L[0]) + 0.8 }); } }   // 少しななめ（真正面だと照り返しで海が一面に光る）
  if (ocean) ocean.skyChanged();
  document.querySelectorAll('#tods button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); }
document.querySelectorAll('#tods button').forEach(b => b.onclick = () => setTod(b.dataset.k));
S.cloud = 0.3;
function setWeather() { const c = $('cloud'); c.value = Math.round(S.cloud * 100); $('cloudL').textContent = Math.round(S.cloud * 100) + '%'; if (ocean) ocean.skyChanged(); }
$('cloud').addEventListener('input', () => { S.cloud = +$('cloud').value / 100; setWeather(); });

// ---- 大きさくらべ（人）・ブイ・断面のボタン ----
const buoyMesh = ocean ? ocean.makeMesh(PR.buoy()) : null, objMeshes = {};
const OBJ_YAW = { human: 1.9, boat: 1.3, fishing: 1.3, ship: 1.3 };   // 人はこちら向き（カメラは yaw 0.35 から見る）
let objPose = null;
function setObj(k) { S.obj = k; objPose = null;
  if (k !== 'none' && ocean && !objMeshes[k]) objMeshes[k] = ocean.makeMesh(PR.TYPES[k].geo());
  if (k !== 'none' && view === 'orbit' && cam.dist < 900) guideApi.camTo({ dist: PR.TYPES[k].dist });
  refreshToggles(); }
$('humanBtn').onclick = () => setObj(S.obj === 'human' ? 'none' : 'human');
// 「浮かべる」の 3 つのボタンの ON/OFF を、いまの状態に合わせる（案内やタップで変わったときも）
function refreshToggles() { const t = (id, on) => { const b = $(id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); };
  t('humanBtn', S.obj === 'human'); t('buoyBtn', FL.list.length > 0); t('secBtn', secOpen); }
// 物の上に「人 身長 1.7 m」などの札（画面に投げて）
function drawPropLabel(g) {
  if (S.obj === 'none' || !objPose || !ocean || !ocean.VP || (SUN.globe && SUN.globe.alpha > 0.3)) return;
  const T = PR.TYPES[S.obj], q = project([objPose.d[0], objPose.d[1] + T.labelY, objPose.d[2]]); if (!q) return;
  const r = ov.getBoundingClientRect(), [x, y] = q; if (x < -60 || x > r.width + 60 || y < -20 || y > r.height + 20) return;
  const text = T.name + ' ' + T.size;
  g.font = '12px ' + fontB(); g.textAlign = 'center';
  const tw = g.measureText(text).width + 12; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x - tw / 2, y - 16, tw, 18); g.fillStyle = '#fff'; g.fillText(text, x, y - 3);
}

// ---- 見かた。どれもドラッグで回す／見回す、ホイール／2本指で近づく（目の高さ・前へ） ----
// 上から: 海の 1 点のまわりを回る（引くと宇宙から見た地球まで）。海面から: 見つめる点がその場の水面と一緒に上下する。
// 自由に動く: W A S D で前後左右・Q E で下と上（スマホは画面のボタン）。水面をこえると、そのまま水の中（カメラの真上の水面の高さで決める）。
let view = 'orbit', camFloat = false, camWater = null, flying = false, diving = false; const FLOAT_AT = [-8, -3];   // 浮かべたカメラの場所（人から少しはなれた所）
const COARSE = matchMedia('(pointer: coarse)').matches;
const VIEW_TXT = { orbit: ['上から見る', 'ドラッグ: 回す・ホイール／2本指: 近づく'], float: ['海面に浮かぶ', 'ドラッグ: 見回す・ホイール／2本指: 目の高さ'],
  fly: ['自由に動く', COARSE ? 'ボタン: 動く・ドラッグ: 見回す' : 'W S: 向いている向きへ・A D: 横・Q E: 下 上・Shift: ゆっくり・ドラッグ: 見回す'],
  beach: ['浜（浅い海）', 'ドラッグ: 回す・ホイール／2本指: 近づく'], beachSec: ['浜（浅い海）の断面図', '坂の急さを右下でえらべます'] };
function viewChip(k) { $('stView').textContent = VIEW_TXT[k][0]; $('stCtl').textContent = VIEW_TXT[k][1]; }
function setView(v) {
  camAnim = null; if (secOpen) closeSection(); if (beachOpen) closeBeach();
  const b0 = cam.basis();
  view = v; camFloat = v === 'float'; flying = v === 'fly'; camWater = null; cam.fly = flying; cam.dive = false; cam.fovY = 52 * Math.PI / 180;
  if (v === 'float') { cam.free = true; cam.eye = 1.6; cam.dist = 0.01; cam.pitch = 0.05; cam.target = [FLOAT_AT[0], 0, FLOAT_AT[1]]; cam.yaw = Math.atan2(-FLOAT_AT[1], -FLOAT_AT[0]); }   // 人のほうを向く
  else if (v === 'fly') { cam.free = false; cam.pos = [b0.pos[0], Math.min(b0.pos[1], 60), b0.pos[2]]; cam.yaw = Math.atan2(b0.cf[2], b0.cf[0]); cam.pitch = Math.min(0.6, -Math.asin(b0.cf[1])); }   // いまの所から続けて
  else { cam.free = false; cam.eye = 3; cam.target = [0, 0, 0]; cam.dist = 16; cam.pitch = 0.12; }
  cam.DMAX = v === 'orbit' ? 2.6e7 : 900;
  if (v === 'beach') openBeach('3d');
  $('flyPad').hidden = !flying;
  document.querySelectorAll('#views button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  viewChip(v === 'beach' && !beach3d ? 'beachSec' : v); }
document.querySelectorAll('#views button').forEach(b => b.onclick = () => setView(b.dataset.v));
// 自由に動く: キー（W A S D Q E・Shift）と画面のボタン。上からのときに W A S D をおすと、自由に動くへ
const keys = new Set();
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'];
addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
  if (MOVE_KEYS.includes(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) { if (!flying && !beachOpen && !secOpen) setView('fly'); keys.add(e.code); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.add('Shift'); });
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.delete('Shift'); });
addEventListener('blur', () => keys.clear());
document.querySelectorAll('#flyPad button').forEach(b => { const k = b.dataset.k;
  b.addEventListener('pointerdown', e => { e.preventDefault(); keys.add(k); b.setPointerCapture(e.pointerId); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => keys.delete(k)); });
function stepFly(dt) {
  if (!flying || !keys.size) return;
  // W S = 向いている向きにまっすぐ（下を向いて W なら水の中へ）、A D = 横、Q E = 真下・真上
  const b = cam.basis(), h = Math.hypot(b.cf[0], b.cf[2]) || 1, fx = b.cf[0] / h, fz = b.cf[2] / h;
  const sp = Math.min(3000, Math.max(8, Math.abs(cam.pos[1]) * 2.4)) * (keys.has('Shift') ? 0.15 : 1) * dt;   // ふだんは速く（水面の近くで 8 m/s、高さ・深さに合わせて速く）、Shift でゆっくり
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), u = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
  cam.move([(b.cf[0] * f - fz * r) * sp, (b.cf[1] * f + u) * sp, (b.cf[2] * f + fx * r) * sp]);
}

// ---- しぶき（風速 13 m/s から。波の山から風下へ飛ぶ白い粒。動きは見た目の目安: 風の 0.6 倍で流され、重力で落ちる） ----
const spray = [], sprayPts = [];
function emitSpray(x, y, z, U) { const wx = Math.cos(WIND_ANG), wz = Math.sin(WIND_ANG);
  for (let n = 0; n < 8 && spray.length < 700; n++) spray.push({ p: [x + (Math.random() - .5) * 3, y + 0.2, z + (Math.random() - .5) * 3], v: [wx * U * (0.4 + 0.4 * Math.random()), 1 + Math.random() * 2.5, wz * U * (0.4 + 0.4 * Math.random())], life: 0.8 + Math.random() * 1.2 }); }
function stepSpray(dt) { for (let i = spray.length - 1; i >= 0; i--) { const s2 = spray[i]; s2.life -= dt; s2.v[1] -= 9.81 * dt;
  for (let c = 0; c < 3; c++) s2.p[c] += s2.v[c] * dt; if (s2.life <= 0) spray.splice(i, 1); } }
function drawSpray(g) { if (!spray.length || SUN.under) return; const P = ocean && ocean.VP; if (!P) return; const b = cam.basis();
  for (const s2 of spray) { const q = project(s2.p); if (!q) continue; const d = Math.hypot(s2.p[0] - b.pos[0], s2.p[1] - b.pos[1], s2.p[2] - b.pos[2]), sz = Math.max(0.6, Math.min(4, 120 / d));
    g.fillStyle = `rgba(240,246,250,${Math.min(0.55, s2.life * 0.5).toFixed(2)})`; g.beginPath(); g.arc(q[0], q[1], sz, 0, 7); g.fill(); } }

// ---- ブイ・通った跡・海をタップ ----
function project(p) { const P = ocean && ocean.VP; if (!P) return null; const r = ov.getBoundingClientRect();
  const cx = P[0] * p[0] + P[4] * p[1] + P[8] * p[2] + P[12], cy = P[1] * p[0] + P[5] * p[1] + P[9] * p[2] + P[13], cw = P[3] * p[0] + P[7] * p[1] + P[11] * p[2] + P[15];
  return cw > 0 ? [(cx / cw * 0.5 + 0.5) * r.width, (0.5 - cy / cw * 0.5) * r.height] : null; }
function drawTrails(g) {
  FL.list.forEach(bu => { const n = bu.trail.length; g.lineWidth = 2;
    for (let i = 1; i < n; i++) { const a = project(bu.trail[i - 1]), b = project(bu.trail[i]); if (!a || !b) continue;
      g.strokeStyle = `rgba(255,201,90,${(0.85 * i / n).toFixed(3)})`; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } });
}
// 海をタップ: 地球儀なら嵐かいる所を置く。ブイの近くなら断面、ほかはブイを浮かべる
cv.addEventListener('pointerup', e => {
  if (cam.wasDrag() || !ocean || beachOpen) return;
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (stormTap(px, py, r)) return;
  const hit = FL.list.find(bu => { const q = bu.pos && project(bu.pos); return q && Math.hypot(q[0] - px, q[1] - py) < 30; });
  if (hit) { openSection(); return; }
  const b = cam.basis(), [tx, ty] = ocean.txty, nx = px / r.width * 2 - 1, ny = 1 - py / r.height * 2;
  const d = [0, 1, 2].map(i => b.cf[i] + nx * tx * b.cr[i] + ny * ty * b.cu[i]);
  if (b.pos[1] <= 0 || d[1] >= -1e-3) return;
  const t = -b.pos[1] / d[1]; if (t > 400) return;
  FL.add(b.pos[0] + d[0] * t, b.pos[2] + d[2] * t, S.simT); refreshToggles();
});
$('buoyBtn').onclick = () => { if (FL.list.length) { FL.clear(); closeSection(); } else { if (view !== 'orbit') setView('orbit'); FL.add(-6, -1.5, S.simT); } refreshToggles(); };   // 断面はブイの真下なので一緒に閉じる

// ---- 断面（ブイの真下）・浜（浅い海） ----
let secOpen = false, secMag = 1, beachOpen = false, beachSlope = 0.033;
let beach3d = false, sandMesh = null, sandKey = '', beachTx = null;
function openBeach(kind) { beachOpen = true; $('beachBar').hidden = false; $('next').hidden = true; setBeachKind(kind); }
// 3D: 上からと同じ回るカメラ（岸と砕ける所のあいだを見る）。断面図: 横から見た図
function setBeachKind(k) { beach3d = k === '3d'; camAnim = null;
  document.querySelectorAll('#beachKinds button').forEach(b => b.classList.toggle('on', b.dataset.b === k));
  $('sec').hidden = beach3d; $('stage').classList.toggle('sec', !beach3d);   // 3D のあいだは文字の層を出す
  if (beach3d) { cam.free = false; cam.yaw = 0.6; cam.pitch = 0.3; cam.dist = 90; beachTx = null;
    if (ocean) { const r = W.fromDuration(4, HOUR); ocean.setSea(r.Hm0, r.Tp, WIND_ANG, 4); lastSea.key = ''; } }   // 浜の 3D の小さな風の波（4 m/s・1 時間）
  if (beachOpen) viewChip(beach3d ? 'beach' : 'beachSec'); }
document.querySelectorAll('#beachKinds button').forEach(b => b.onclick = () => setBeachKind(b.dataset.b));
function drawBeach3d(dt) {
  const st = S.st; if (!(st.Hm0 > 0.02)) { setBeachKind('sec'); return; }   // 波がほとんどないうちは断面図で
  const B = window.WGbeach3d.frame(st, S.simT, beachSlope), M2 = window.WGbeach3d.info(), k2 = st.Hm0.toFixed(3) + '/' + st.Tp.toFixed(3) + '/' + beachSlope;
  if (k2 !== sandKey && ocean) { sandKey = k2; sandMesh = ocean.makeMesh(window.WGbeach3d.sandMesh()); }
  // 見る点: 岸（x = −12）と砕ける所のまん中の水面。カメラは陸の上でも地面の下に入らない
  const bi0 = M2.brkInfo, want = -12 - (bi0 ? (M2.X - bi0.x) / 2 : 20); beachTx = beachTx == null ? want : beachTx + (want - beachTx) * Math.min(1, dt * 3);
  cam.target[0] = beachTx; cam.target[1] = 0; cam.target[2] = 0;
  { const ch = Math.cos(cam.pitch), px = beachTx - Math.cos(cam.yaw) * ch * cam.dist; cam.minY = Math.max(0, px + 12) * beachSlope + 1.5 + 1.2 * st.Hm0; }
  const b = cam.basis();
  skyEnv(); SUN.big = B; B.planeY = 0; SUN.far = 30000; SUN.curvR = 0; SUN.fogH = 0; SUN.globe = null; SUN.under = false; SUN.camD = 0;
  SUN.foamK = 1; SUN.windU = 4; SUN.windA = WIND_ANG; SUN.foamW = 3.84e-6 * Math.pow(4, 3.41); SUN.rough0 = Math.sqrt(Math.max(0.003 + 5.12e-3 * 4 - ocean.fftSlope, 1.5e-4));
  SUN.meshes = sandMesh ? [{ mesh: sandMesh, M: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }] : []; SUN.points = []; SUN.wetRain = 0; SUN.wetSplash = 0;
  ocean.frame(dt, S.simT, b, SUN); SUN.big = null;
  const g = ovCtx();
  const bi = M2.brkInfo, fmt = v => v < 1 ? (v * 100).toFixed(0) + ' cm' : v.toFixed(1) + ' m';
  const lines = [`坂 1/${Math.round(1 / beachSlope)}・沖の波 ${fmt(st.Hm0)}・周期 ${st.Tp.toFixed(1)} 秒`,
    bi ? `砕ける所: 岸から ${(M2.X - bi.x).toFixed(0)} m・水深 ${fmt(bi.h)}・波の高さ ${fmt(bi.H)}` : ''];
  g.font = '13px ' + fontB(); g.textAlign = 'left';
  lines.filter(Boolean).forEach((l, i) => { const tw = g.measureText(l).width; g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(8, 36 + i * 20, tw + 10, 18); g.fillStyle = '#fff'; g.fillText(l, 13, 49 + i * 20); });   // 上の「見かた」の札の下
}
function closeBeach() { const was3d = beach3d; beach3d = false; beachOpen = false; if (was3d) { cam.target = [0, 0, 0]; lastSea.key = ''; } $('beachBar').hidden = true; if (!secOpen) { $('sec').hidden = true; $('next').hidden = false; $('stage').classList.remove('sec'); } }
function setSlope(v) { beachSlope = v; document.querySelectorAll('#slopes button').forEach(b => b.classList.toggle('on', +b.dataset.s === v)); }
document.querySelectorAll('#slopes button').forEach(b => b.onclick = () => setSlope(+b.dataset.s));
$('beachClose').onclick = () => setView('orbit'); setSlope(0.033);
function openSection() { if (beachOpen || view !== 'orbit') setView('orbit'); secOpen = true; $('sec').hidden = false; $('secBar').hidden = false; $('next').hidden = true; $('stage').classList.add('sec'); }
function closeSection() { secOpen = false; $('sec').hidden = true; $('secBar').hidden = true; $('next').hidden = false; $('stage').classList.remove('sec'); }
$('secMag').onclick = () => { secMag = secMag === 1 ? 3 : 1; $('secMag').classList.toggle('on', secMag > 1); $('secMag').textContent = secMag > 1 ? '本当の大きさに' : '動きを3倍に'; };
$('secBtn').onclick = () => { if (secOpen) closeSection(); else { if (!FL.list.length) FL.add(4, 2, S.simT); openSection(); } refreshToggles(); };
$('secClose').onclick = () => { closeSection(); refreshToggles(); };

// ---- 画面の文字（風とうねりの向き・時刻・月） ----
function ovCtx() { const r = ov.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  if (ov.width !== Math.round(r.width * dpr) || ov.height !== Math.round(r.height * dpr)) { ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr); }
  const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height); return g; }
function arrow(g, cx, cy, b, ang, col, label) {
  const fx = b.cf[0], fz = b.cf[2], fl = Math.hypot(fx, fz) || 1, rx = b.cr[0], rz = b.cr[2];
  const wx = Math.cos(ang), wz = Math.sin(ang), sx = wx * rx + wz * rz, sy = -(wx * fx + wz * fz) / fl;   // 画面の上 = カメラの前
  g.strokeStyle = 'rgba(232,240,244,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx - sx * 15, cy - sy * 15); g.lineTo(cx + sx * 11, cy + sy * 11); g.stroke();
  const a = Math.atan2(sy, sx); g.beginPath(); g.moveTo(cx + sx * 17, cy + sy * 17);
  g.lineTo(cx + sx * 17 - 8 * Math.cos(a - .45), cy + sy * 17 - 8 * Math.sin(a - .45)); g.lineTo(cx + sx * 17 - 8 * Math.cos(a + .45), cy + sy * 17 - 8 * Math.sin(a + .45)); g.fill();
  g.font = '11px ' + fontB(); g.textAlign = 'center'; g.fillText(label, cx, cy + 36); }
function drawOverlay(b) {
  const r = ov.getBoundingClientRect(), g = ovCtx();
  stormOverlay(g, b, r);
  drawSpray(g); drawPropLabel(g); drawTrails(g);
  if (flying) { const y = b.pos[1], t2 = SUN.under ? `水の中・深さ ${Math.max(0, SUN.camD).toFixed(1)} m` : `自由に動く・高さ ${y < 1000 ? y.toFixed(1) + ' m' : (y / 1000).toFixed(2) + ' km'}`; if ($('stView').textContent !== t2) $('stView').textContent = t2; }
  else if (camFloat) { const t2 = `海面に浮かぶ・目の高さ ${cam.eye.toFixed(1)} m`; if ($('stView').textContent !== t2) $('stView').textContent = t2; }
  g.font = '12px ' + fontB(); g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.8)';
  g.fillText(E.clockText(S.clock, obsLL().lon) + (S.tod === 'auto' ? '（時間が進む）' : '') + '・月: ' + E.moonText(SUN.elong || 0) + (SUN.Lm && SUN.Lm[1] > 0 ? '' : '・沈んでいる'), 12, r.height - 14);
  const U = windAt(S.t);
  if (U > 0 && S.st.Hm0 > 0) arrow(g, r.width - 40, 40, b, WIND_ANG, '#e8f0f4', '風 ' + U.toFixed(0) + ' m/s');
  if (SW_OBS && SW_OBS.Hm0 > 0.02) arrow(g, r.width - 40, U > 0 && S.st.Hm0 > 0 ? 112 : 40, b, SW_ANG, '#ffc95a', 'うねり');
}

// ---- 毎コマの絵 ----
let wetRain = 0;
function skyEnv() { Object.assign(SUN, E.make(S.clock, S.cloud, obsLL().lat, obsLL().lon)); }
function draw(dt) {
  if (beach3d && ocean) { drawBeach3d(dt); return; }
  syncSea();
  const b = cam.basis(), st = S.st, sw = SW_OBS && SW_OBS.Hm0 > 0.02 ? SW_OBS : null;
  // 物: 大きさくらべ（点を k こ）とブイ。前のコマに読んだ海面の動きで置き、大きい物ほどゆっくり追う
  const pr = ocean ? ocean.probe : [], T = S.obj !== 'none' ? PR.TYPES[S.obj] : null, k = T ? T.pts.length : 0, yaw = T ? OBJ_YAW[S.obj] : 0;
  SUN.meshes = [];
  if (T) { const p = PR.pose(S.obj, pr.slice(0, k), yaw);
    if (p) { if (!objPose) objPose = p; else { const a = 1 - Math.exp(-dt / T.tau);
      for (let i = 0; i < 3; i++) objPose.d[i] += (p.d[i] - objPose.d[i]) * a; for (let i = 0; i < 2; i++) objPose.s[i] += (p.s[i] - objPose.s[i]) * a; }
      if (objMeshes[S.obj]) SUN.meshes.push({ mesh: objMeshes[S.obj], M: PR.matrix(0, 0, objPose, yaw) }); } }
  FL.step(dt, S.simT, pr.slice(k), S.us || 0, WIND_ANG);
  if (buoyMesh) FL.list.forEach(bu => { if (bu.p) SUN.meshes.push({ mesh: buoyMesh, M: PR.matrix(bu.x0 + bu.drift[0], bu.z0 + bu.drift[1], bu.p, 0) }); });
  // ほかに読む点: カメラの真下の水面（自由に動くときはカメラの所。水の上か中かを決める）・浮かべたカメラ・しぶきを出すか見る点（カメラの前に 5 つ）
  const nb = FL.list.length, iCam = k + nb, pc = pr[iCam];
  if (flying && pc) camProbe = [b.pos[0] - pc.d[0], b.pos[2] - pc.d[2]];   // 海面の点は横にも動くので、動いたぶんをもどしてカメラの真下を読む
  if (camFloat && pc) { const wc = pr[iCam + 1] ? pr[iCam + 1].d[1] : pc.d[1]; camWater = camWater == null ? wc : camWater + (wc - camWater) * (1 - Math.exp(-dt / 0.2)); cam.target[1] = camWater; cam.minY = camWater + 1.2; }
  else if (!flying) cam.target[1] = 0;
  const Ueff = st.Hm0 > 0 ? windAt(S.t) : 0;
  if (Ueff >= 13 && !SUN.under) for (let j = 0; j < 5; j++) { const p = pr[iCam + 2 + j], sp = sprayPts[j]; if (p && sp && p.d[1] > 0.3 * st.Hm0 && Math.random() < dt * 6 * (Ueff - 12) / 8) emitSpray(sp.x + p.d[0], p.d[1], sp.z + p.d[2], Ueff); }
  for (let j = 0; j < 5; j++) { const a = Math.random() * 2 * Math.PI, rr = 8 + Math.random() * 60, f = b.cf, fl = Math.hypot(f[0], f[2]) || 1;
    sprayPts[j] = { x: b.pos[0] + f[0] / fl * (rr + 10) + Math.cos(a) * rr * 0.6, z: b.pos[2] + f[2] / fl * (rr + 10) + Math.sin(a) * rr * 0.6, wb: 1, wc: 1 }; }
  stepSpray(dt);
  const cp = flying ? camProbe : [0, 0];
  SUN.points = (T ? PR.worldPts(S.obj, 0, 0, yaw) : []).concat(FL.points(), [{ x: cp[0], z: cp[1], wb: 1, wc: 1 }, { x: FLOAT_AT[0], z: FLOAT_AT[1], wb: 1, wc: 0.5 }], Ueff >= 13 ? sprayPts : []);
  // 濡れ: 波が高いと下のほうがしぶきで（見た目の目安）
  SUN.wetRain = 0; SUN.wetSplash = (T ? T.splash : 0) * Math.min(1, Math.max(0, (Math.hypot(st.Hm0, sw ? sw.Hm0 : 0) - 0.2) / 1.5));
  skyEnv();
  SUN.windU = Ueff; SUN.windA = WIND_ANG; SUN.foamW = 3.84e-6 * Math.pow(Ueff, 3.41); SUN.foamStyle = 0; SUN.foamK = 0;   // 白波の割合（Monahan & O'Muircheartaigh 1980）は数字だけ（沖の泡の絵は外した）
  if (ocean) { const tot = (st.Hm0 > 0 || sw) ? 0.003 + 5.12e-3 * Ueff : 0;   // 海面の傾きのばらつき（Cox & Munk 1954）。描いている波の分を引いた残りで照り返しをにじませる
    SUN.rough0 = Math.max(0.012, Math.sqrt(Math.max(tot - ocean.fftSlope, 0)));
    SUN.globe = null; SUN.far = 0; SUN.curvR = 0; SUN.fogH = 0;
    if (b.pos[1] > 300) stormGlobe(b, dt);   // 高く上がると地球の丸み・見通し・地球儀（js/storm.js）
    const wHere = flying && pc ? pc.d[1] : 0;
    SUN.under = flying && b.pos[1] < wHere; SUN.camD = Math.max(0, wHere - b.pos[1]);
    SUN.wideGrid = camFloat || flying || Math.hypot(st.Hm0, sw ? sw.Hm0 : 0) > 2;   // 波のすぐそばでは網目を画面の外まで広く
    ocean.frame(dt, S.simT, b, SUN); }
  drawOverlay(b);
  if (beachOpen && !beach3d) window.WGbeach.draw($('sec'), S.st, S.simT, beachSlope);
  if (secOpen) window.WGsection.draw($('sec'), S.st, S.simT, FL.list.length > 0, S.us || 0, secMag);
}
let camProbe = [0, 0];
start();
