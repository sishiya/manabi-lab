// 波が育つまで — 見かた（上から・海面から・自由に動く・浜）・空（時刻と雲）・大きさくらべ・ブイ・断面・しぶき・画面の文字と、毎コマの絵（draw）
'use strict';
const E = window.WGenv, PR = window.WGprops, FL = window.WGfloats;
const fontB = () => getComputedStyle(document.documentElement).getPropertyValue('--f-body');

// ---- 空: 時刻（いる所の、きょうの日付で）と雲の量 ----
function obsLL() { return GL.G.obs; }
function setTod(k) { S.tod = k;
  if (k !== 'auto') { S.clock = E.timeOf(k, obsLL().lat, obsLL().lon);
    // 朝と夕方は太陽のほうへ向く（逆光のきらきら）
    if ((k === 'morning' || k === 'evening') && view === 'orbit') { const Ls = E.make(S.clock, S.cloud, obsLL().lat, obsLL().lon).L; guideApi.camTo({ yaw: Math.atan2(Ls[2], Ls[0]) + 0.8 }); } }   // 少しななめ（真正面だと照り返しで海が一面に光る）
  if (ocean) ocean.skyChanged();
  document.querySelectorAll('#tods button').forEach(b => b.classList.toggle('on', b.dataset.k === k)); }
document.querySelectorAll('#tods button').forEach(b => b.onclick = () => setTod(b.dataset.k));
S.cloud = 0.5;   // 雲の量のはじめ（2026-10-21 ユーザー「50% をデフォに」）
function setWeather(fromSlider) { const c = $('cloud'); if (!fromSlider) c.value = Math.round(S.cloud * 100); $('cloudL').textContent = Math.round(S.cloud * 100) + '%'; if (ocean) ocean.skyChanged(); }
$('cloud').addEventListener('input', () => { S.cloud = +$('cloud').value / 100; setWeather(true); });

// ---- 水の透明度: 水の中にまざった物（植物プランクトン・細かい粒・とけた色）の量 m（きれいな外洋 = 1）から、光の吸われ方・散らばり方・海の色 ----
// 純水の吸収（Pope & Fry 1997、赤 650・緑 550・青 450 nm）＋まざった物の吸収（青ほど強い）＋散乱。海の色は、後ろへ散らばる光の割合
// R ≈ 0.33 b_b /(a + b_b)（Gordon ほか 1975）。見える深さ（透明度板）は ≈ 1.7 / K（Poole & Atkins 1929、K は緑と青の平均）。まざった物の量の係数は目安
const A_W = [0.34, 0.057, 0.009], A_P = [0.01, 0.013, 0.021], B_P = [0.05, 0.03, 0.03], BB_W = [0.0003, 0.0009, 0.0024];
function waterOptics(m) {
  const KD = A_W.map((a, i) => a + m * A_P[i]), KC = KD.map((k, i) => k + m * B_P[i]);
  const deepC = KD.map((a, i) => { const bb = BB_W[i] + m * 0.0025; return 1.3 * 0.33 * bb / (a + bb); });
  return { KD, KC, deepC, secchi: 1.7 / ((KD[1] + KD[2]) / 2) };
}
const clarOf = v => 0.3 * Math.pow(100, v / 100), clarTo = m => Math.round(Math.log(m / 0.3) / Math.log(100) * 100);   // つまみ 0〜100 → m 0.3〜30
S.murk = 1;
function setClarity(fromSlider) { const w = SUN.water = waterOptics(S.murk), d = w.secchi;
  if (!fromSlider) $('clar').value = clarTo(S.murk);   // つまみを動かしている最中は、つまみの値を書きかえない
  $('clarL').textContent = L(`見える深さ 約 ${d < 10 ? d.toFixed(1) : d.toFixed(0)} m`, `See down to about ${d < 10 ? d.toFixed(1) : d.toFixed(0)} m`);
  $('clarD').textContent = d > 30 ? L('とても澄んだ外洋（南の島の沖のような）', 'Very clear open ocean (like off a tropical island)') : d > 15 ? L('ふつうの外洋', 'Ordinary open ocean') : d > 5 ? L('岸に近い海（プランクトンや細かい砂がまざる）', 'Coastal sea (plankton and fine sand mixed in)') : L('にごった湾・河口の近く', 'Murky bay or near a river mouth'); }
$('clar').addEventListener('input', () => { S.murk = clarOf(+$('clar').value); setClarity(true); });
// パネルの中で、文字や部品をつかんで動かす（ブラウザのドラッグ）が始まらないように（つまみを動かすと 🚫 になって止まっていた）
$('panel').addEventListener('dragstart', e => e.preventDefault());

// ---- 水深と海の底（平らな砂）。つまみ 0〜99 → 2〜200 m（対数）、100 = 底が見えない深い海 ----
// 波の計算も水深に合わせる（js/growth.js の TMA・分散、shaders.js の FS_SPEC）。砂の色は、海の底の砂の反射率の目安（約 0.3〜0.5）
const depthOf = v => v >= 100 ? Infinity : 2 * Math.pow(10, v / 99 * 2);
let bedMesh = null;
function bedGeo() { const v = [], R = 3000, put = (x, z) => v.push(x, 0, z, 0, 1, 0, 0.62, 0.56, 0.44, 0.12, 0.6, 0);   // 1 頂点 12 個（位置・上向き・砂の色・つや・濡れやすさ）
  for (const [x, z] of [[-R, -R], [R, -R], [R, R], [-R, -R], [R, R], [-R, R]]) put(x, z); return v; }
function setDepth() { S.depth = depthOf(+$('depth').value); cam.floor = isFinite(S.depth) ? -S.depth : -1e9;
  if (isFinite(S.depth) && ocean && !bedMesh) bedMesh = ocean.makeMesh(bedGeo());
  if (isFinite(S.depth) && cam.fly && cam.pos[1] < cam.floor + 0.3) cam.pos[1] = cam.floor + 0.3;
  $('depthL').textContent = isFinite(S.depth) ? `${S.depth < 10 ? S.depth.toFixed(1) : S.depth.toFixed(0)} m` : L('深い海（底は見えない）', 'Deep sea (no bottom in sight)'); lastSea.key = ''; update(); }
$('depth').addEventListener('input', setDepth);

// ---- 大きさくらべ（人）・ブイ・断面のボタン ----
const buoyMesh = ocean ? ocean.makeMesh(PR.buoy()) : null, objMeshes = {};
const OBJ_YAW = { human: 1.9, boat: 1.3, fishing: 1.3, ship: 1.3 };   // 人はこちら向き（カメラは yaw 0.35 から見る）
// 人は何人でも（6 人まで）。はじめは 1 人がまん中に。S.put = 海をタップしたときに浮かべる物
const HUMANS = [{ x: 0, z: 0, pose: null }]; S.put = 'buoy'; S.showHuman = true; S.showBuoy = true;   // 見せる（ON/OFF）と置く（タップ）は別
let objPose = null;
function setObj(k) { S.obj = k; objPose = null;
  if (k !== 'none' && ocean && !objMeshes[k]) objMeshes[k] = ocean.makeMesh(PR.TYPES[k].geo());
  if (k !== 'none' && view === 'orbit' && cam.dist < 900) guideApi.camTo({ dist: PR.TYPES[k].dist });
  refreshToggles(); }
function setPut(k) { S.put = k; refreshToggles(); }
document.querySelectorAll('#putSeg button').forEach(b => b.onclick = () => setPut(b.dataset.p));
$('showHuman').onchange = () => { S.showHuman = $('showHuman').checked; refreshToggles(); };
$('showBuoy').onchange = () => { S.showBuoy = $('showBuoy').checked; refreshToggles(); };
$('clearBtn').onclick = () => { HUMANS.length = 0; FL.clear(); closeSection(); refreshToggles(); };
function resetProps() { HUMANS.length = 0; HUMANS.push({ x: 0, z: 0, pose: null }); FL.clear(); }
// 「浮かべる」の 3 つのボタンの ON/OFF を、いまの状態に合わせる（案内やタップで変わったときも）
function refreshToggles() { const t2 = (b, on) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); };
  document.querySelectorAll('#putSeg button').forEach(b => t2(b, b.dataset.p === S.put)); $('secChk').checked = secOpen;
  $('showHuman').checked = S.showHuman; $('showBuoy').checked = S.showBuoy;
  $('propCount').textContent = L(`いま: 人 ${HUMANS.length}・ブイ ${FL.list.length}`, `Now: ${HUMANS.length} people, ${FL.list.length} buoys`); }
// 物の上に「人 身長 1.7 m」などの札（画面に投げて）
function drawPropLabel(g) {
  objPose = HUMANS[0] ? HUMANS[0].pose : null;
  if (S.obj === 'none' || !objPose || !HUMANS.length || !ocean || !ocean.VP || (SUN.globe && SUN.globe.alpha > 0.3)) return;
  const T = PR.TYPES[S.obj], q = project([HUMANS[0].x + objPose.d[0], objPose.d[1] + T.labelY, HUMANS[0].z + objPose.d[2]]); if (!q) return;
  const r = ov.getBoundingClientRect(), [x, y] = q; if (x < -60 || x > r.width + 60 || y < -20 || y > r.height + 20) return;
  const text = T.name + ' ' + T.size;
  g.font = '12px ' + fontB(); g.textAlign = 'center';
  const tw = g.measureText(text).width + 12; g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x - tw / 2, y - 16, tw, 18); g.fillStyle = '#fff'; g.fillText(text, x, y - 3);
}

// ---- 見かた。どれもドラッグで回す／見回す、ホイール／2本指で近づく（目の高さ・前へ） ----
// 上から: 海の 1 点のまわりを回る（引くと宇宙から見た地球まで）。海面から: 見つめる点がその場の水面と一緒に上下する。
// 自由に動く: W A S D で前後左右・Q E で下と上（スマホは画面のボタン）。水面をこえると、そのまま水の中（カメラの真上の水面の高さで決める）。
let view = 'orbit', camFloat = false, camWater = null, flying = false, diving = false; const FLOAT_AT = [-8, -3];   // 浮かべたカメラの場所（人から少しはなれた所）
// 海面から: ホイール／2本指で、向いている向きへ水面の上を進む・もどる（1 目盛り 1.5 m、まん中から 150 m まで）。
// 高さはそこの水面に 0.2 秒でなめらかについていく（前は進むたびに高さを読みなおして、上下にとんでいた）
cam.floatZoom = f => { const s = -Math.log(f) / 0.13 * 1.5; let x = FLOAT_AT[0] + Math.cos(cam.yaw) * s, z = FLOAT_AT[1] + Math.sin(cam.yaw) * s;
  const r = Math.hypot(x, z); if (r > 150) { x *= 150 / r; z *= 150 / r; }
  for (const h of S.showHuman ? HUMANS : []) { const dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz); if (d < 2.5) { const k = 2.5 / Math.max(d, 1e-3); x = h.x + dx * k; z = h.z + dz * k; } }   // 人の中は通りぬけない
  FLOAT_AT[0] = x; FLOAT_AT[1] = z; cam.target[0] = x; cam.target[2] = z; };
const COARSE = matchMedia('(pointer: coarse)').matches;
const VIEW_TXT = { orbit: [L('上から見る', 'From above'), L('ドラッグ: 回す・ホイール／2本指: 近づく', 'Drag: turn · Wheel / two fingers: closer')], float: [L('海面に浮かぶ', 'Floating at the surface'), L('ドラッグ: 見回す・ホイール／2本指: 前へ・うしろへ', 'Drag: look around · Wheel / two fingers: forward or back')],
  fly: [L('自由に動く', 'Free move'), COARSE ? L('ボタン: 動く・ドラッグ: 見回す', 'Buttons: move · Drag: look around') : L('W S: 向いている向きへ・A D: 横・Q E: 下 上・Shift: ゆっくり・ドラッグ: 見回す', 'W S: where you face · A D: sideways · Q E: down, up · Shift: slow · Drag: look around')],
  beach: [L('浜（浅い海）', 'Beach (shallow sea)'), L('ドラッグ: 回す・ホイール／2本指: 近づく', 'Drag: turn · Wheel / two fingers: closer')], beachSec: [L('浜（浅い海）の断面図', 'Beach (shallow sea) cross-section'), L('坂の急さを右下でえらべます', 'Choose the slope at the bottom right')] };
function viewChip(k) { $('stView').textContent = VIEW_TXT[k][0]; $('stCtl').textContent = VIEW_TXT[k][1]; }
function setView(v) {
  camAnim = null; if (secOpen) closeSection(); if (beachOpen) closeBeach();
  const b0 = cam.basis();
  view = v; camFloat = v === 'float'; flying = v === 'fly'; cam.floatZoom = camFloat ? cam.floatZoom0 : null; camWater = null; cam.fly = flying; cam.dive = false; cam.fovY = 52 * Math.PI / 180;
  if (v === 'float') { cam.free = true; cam.eye = 1.6; cam.dist = 0.01; cam.pitch = 0.05; cam.target = [FLOAT_AT[0], 0, FLOAT_AT[1]]; cam.yaw = Math.atan2(-FLOAT_AT[1], -FLOAT_AT[0]); }   // 人のほうを向く
  else if (v === 'fly') { cam.free = false; cam.pos = [b0.pos[0], Math.min(b0.pos[1], 60), b0.pos[2]]; cam.yaw = Math.atan2(b0.cf[2], b0.cf[0]); cam.pitch = Math.min(0.6, -Math.asin(b0.cf[1])); }   // いまの所から続けて
  else { cam.free = false; cam.eye = 3; cam.target = [0, 0, 0]; cam.dist = 16; cam.pitch = 0.12; }
  cam.DMAX = 900;   // 地球の大きさまで引く（2.6e7）のは、いったん外した（js/storm.js の STORM_UI）
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
// 2026-10-21 ユーザー「しぶきがチープ」→ いったん外した（SPRAY = false。人が濡れるしぶきの計算は stepWet に残す）
const SPRAY = false;
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
  const hit = S.showBuoy && FL.list.find(bu => { const q = bu.pos && project(bu.pos); return q && Math.hypot(q[0] - px, q[1] - py) < 30; });
  if (hit) { openSection(); return; }
  const b = cam.basis(), [tx, ty] = ocean.txty, nx = px / r.width * 2 - 1, ny = 1 - py / r.height * 2;
  const d = [0, 1, 2].map(i => b.cf[i] + nx * tx * b.cr[i] + ny * ty * b.cu[i]);
  if (b.pos[1] <= 0 || d[1] >= -1e-3 || SUN.under) return;
  const t = -b.pos[1] / d[1]; if (t > 400) return;
  const x = b.pos[0] + d[0] * t, z = b.pos[2] + d[2] * t;
  if (S.put === 'human') { if (HUMANS.length >= 6) HUMANS.shift(); HUMANS.push({ x, z, pose: null }); S.showHuman = true; }
  else if (S.put === 'buoy') { FL.add(x, z, S.simT); S.showBuoy = true; }
  refreshToggles();
});

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
$('secMag').onclick = () => { secMag = secMag === 1 ? 3 : 1; $('secMag').classList.toggle('on', secMag > 1); $('secMag').textContent = secMag > 1 ? L('本当の大きさに', 'True size') : L('動きを3倍に', 'Motion × 3'); };
$('secChk').onchange = () => { if (!$('secChk').checked) closeSection(); else { if (!FL.list.length) FL.add(4, 2, S.simT); S.showBuoy = true; openSection(); } refreshToggles(); };
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
  stormOverlay(g, b, r); { const gv = !!(SUN.globe && SUN.globe.alpha > 0.4); if ($('globeBar').hidden === gv) $('globeBar').hidden = !gv; }
  drawSpray(g); if (S.showHuman) drawPropLabel(g); if (S.showBuoy) drawTrails(g);
  if (flying) { const y = b.pos[1], t2 = SUN.under ? L(`水の中・深さ ${Math.max(0, SUN.camD).toFixed(1)} m`, `Underwater · depth ${Math.max(0, SUN.camD).toFixed(1)} m`) : L(`自由に動く・高さ ${y < 1000 ? y.toFixed(1) + ' m' : (y / 1000).toFixed(2) + ' km'}`, `Free move · height ${y < 1000 ? y.toFixed(1) + ' m' : (y / 1000).toFixed(2) + ' km'}`); if ($('stView').textContent !== t2) $('stView').textContent = t2; }
  else if (view === 'orbit') { const t2 = SUN.under ? L(`上から見る・水の中 ${Math.max(0, SUN.camD).toFixed(1)} m`, `From above · underwater ${Math.max(0, SUN.camD).toFixed(1)} m`) : L('上から見る', 'From above'); if ($('stView').textContent !== t2) $('stView').textContent = t2; }
  else if (camFloat) { const t2 = L(`海面に浮かぶ・目の高さ ${cam.eye.toFixed(1)} m`, `Floating · eye height ${cam.eye.toFixed(1)} m`); if ($('stView').textContent !== t2) $('stView').textContent = t2; }
  g.font = '12px ' + fontB(); g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.8)';
  g.fillText(E.clockText(S.clock, obsLL().lon) + (S.tod === 'auto' ? L('（時間が進む）', ' (running)') : '') + L('・月: ', ' · Moon: ') + E.moonText(SUN.elong || 0) + (SUN.Lm && SUN.Lm[1] > 0 ? '' : L('・沈んでいる', ' · below the horizon')), 12, r.height - 14);
  const U = windAt(S.t);
  if (U > 0 && S.st.Hm0 > 0) arrow(g, r.width - 40, 40, b, WIND_ANG, '#e8f0f4', L('風 ', 'Wind ') + U.toFixed(0) + ' m/s');
  if (SW_OBS && SW_OBS.Hm0 > 0.02) arrow(g, r.width - 40, U > 0 && S.st.Hm0 > 0 ? 112 : 40, b, SW_ANG, '#ffc95a', L('うねり', 'Swell'));
}

// ---- 濡れて、乾く（人・浮き輪・板） ----
// 物の高さ −0.3〜2.1 m を 16 段。水面より下はいつも濡れている。波がかかった高さまで濡れ（1）、そのあと乾く（うすい水の膜が風で蒸発する目安 4 分。
// 時間のつまみが速く進むときは、進んだ時間で乾かす）。物より短い波（波長 3.2 m より短い）は物といっしょに上下しないので、ふちを洗う:
// その高さは分布の短い波の部分の σ（JONSWAP の f > 0.7 Hz の面積の平方根）で、ゆっくり変わる乱数（時間の目安 0.7 秒）。砕ける波頭をかぶる・風 13 m/s からのしぶきでも濡れる
const WET_N = 16, WET_Y0 = -0.3, WET_DY = 0.15, TAU_DRY = 240;
let shortKey = '', shortSig = 0, lastWetT = 0;
function stepWet(h, p, k1, pr0, dt, U) {
  if (!h.wet) { h.wet = new Float32Array(WET_N); h.e = 0; }
  const st = S.st, key = st.Hm0.toFixed(3) + '/' + st.Tp.toFixed(2);
  if (key !== shortKey) { shortKey = key; let m = 0; if (st.Hm0 > 0) for (let f = 0.7; f < 4; f += 0.01) m += W.Sf(f, st.Hm0, st.Tp) * 0.01; shortSig = Math.sqrt(m); }
  const a = Math.exp(-dt / 0.7); h.e = h.e * a + shortSig * Math.sqrt(1 - a * a) * gauss();
  let mean = 0; for (let i = 0; i < k1; i++) mean += pr0[i] ? pr0[i].d[1] : 0; mean /= k1;
  let level = (mean - h.pose.d[1]) + 1.5 * Math.abs(h.e);   // 物から見た水のとどく高さ
  // 砕ける波頭（白波）にあたると、波の高さの 3 割くらいまで水をかぶる（あたる割合 = 白波の割合 ÷ 周期。高さの割合は目安）
  if (st.Tp > 0 && Math.random() < dt * 3.84e-6 * Math.pow(U, 3.41) / st.Tp) h.wash = 1.2;
  if (h.wash > 0) { h.wash -= dt; level = Math.max(level, Math.min(2, 0.3 * st.Hm0)); }
  const dDry = Math.max(dt, Math.max(0, S.t - lastWetT)), dry = Math.exp(-dDry / TAU_DRY);
  for (let i = 0; i < WET_N; i++) { const y = WET_Y0 + (i + 0.5) * WET_DY;
    let w = y < 0 ? 1 : h.wet[i] * dry; if (y < level) w = 1;
    if (U >= 13 && y < 1.6 && Math.random() < dt * (U - 12) / 8 * 0.6) w = Math.max(w, 0.7);
    h.wet[i] = w; }
}
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += Math.random(); return (u - 3) * Math.SQRT2; };

// ---- 毎コマの絵 ----
let wetRain = 0;
function skyEnv() { Object.assign(SUN, E.make(S.clock, S.cloud, obsLL().lat, obsLL().lon)); if (!SUN.water) SUN.water = waterOptics(S.murk); }
function draw(dt) {
  if (beach3d && ocean) { drawBeach3d(dt); return; }
  syncSea();
  const b = cam.basis(), st = S.st, sw = SW_OBS && SW_OBS.Hm0 > 0.02 ? SW_OBS : null;
  // 物: 大きさくらべ（点を k こ）とブイ。前のコマに読んだ海面の動きで置き、大きい物ほどゆっくり追う
  const T = S.obj !== 'none' && HUMANS.length && S.showHuman ? PR.TYPES[S.obj] : null, k1 = T ? T.pts.length : 0, k = k1 * HUMANS.length, yaw = T ? OBJ_YAW[S.obj] : 0;
  const pr = ocean ? ocean.probe : [];
  SUN.meshes = [];
  if (T) HUMANS.forEach((h, j) => { const p = PR.pose(S.obj, pr.slice(j * k1, (j + 1) * k1), yaw); if (!p) return;
    if (!h.pose) h.pose = p; else { const a = 1 - Math.exp(-dt / T.tau);
      for (let i = 0; i < 3; i++) h.pose.d[i] += (p.d[i] - h.pose.d[i]) * a; for (let i = 0; i < 2; i++) h.pose.s[i] += (p.s[i] - h.pose.s[i]) * a; }
    stepWet(h, p, k1, pr.slice(j * k1, (j + 1) * k1), dt, windAt(S.t) * (S.st.Hm0 > 0 ? 1 : 0));
    if (objMeshes[S.obj]) SUN.meshes.push({ mesh: objMeshes[S.obj], M: PR.matrix(h.x, h.z, h.pose, yaw), wet: h.wet }); });
  lastWetT = S.t;
  FL.step(dt, S.simT, pr.slice(k), S.us || 0, WIND_ANG);
  if (bedMesh && isFinite(S.depth)) { const sx = Math.round(b.pos[0] / 500) * 500, sz = Math.round(b.pos[2] / 500) * 500;   // 底はカメラの下についてくる（500 m ごと）
    SUN.meshes.push({ mesh: bedMesh, M: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, sx, -S.depth, sz, 1]) }); }
  if (buoyMesh && S.showBuoy) FL.list.forEach(bu => { if (bu.p) SUN.meshes.push({ mesh: buoyMesh, M: PR.matrix(bu.x0 + bu.drift[0], bu.z0 + bu.drift[1], bu.p, 0) }); });
  // ほかに読む点: カメラの真下の水面（自由に動くときはカメラの所。水の上か中かを決める）・浮かべたカメラ・しぶきを出すか見る点（カメラの前に 5 つ）
  const nb = FL.list.length, iCam = k + nb, pc = pr[iCam];
  const probeCam = flying || (view === 'orbit' && cam.dist < 900);   // 上から・自由に動くは、カメラの真下の水面で水の上か中かを決める
  if (probeCam && pc) camProbe = [b.pos[0] - pc.d[0], b.pos[2] - pc.d[2]];   // 海面の点は横にも動くので、動いたぶんをもどしてカメラの真下を読む
  if (camFloat && pc) { const wc = pr[iCam + 1] ? pr[iCam + 1].d[1] : pc.d[1]; camWater = camWater == null ? wc : camWater + (wc - camWater) * (1 - Math.exp(-dt / 0.2)); cam.target[1] = camWater; cam.minY = camWater + 1.2; }
  else if (!flying) cam.target[1] = 0;
  const Ueff = st.Hm0 > 0 ? windAt(S.t) : 0;
  if (SPRAY && Ueff >= 13 && !SUN.under && !(view === 'orbit' && cam.pitch < 0)) for (let j = 0; j < 5; j++) { const p = pr[iCam + 2 + j], sp = sprayPts[j]; if (p && sp && p.d[1] > 0.3 * st.Hm0 && Math.random() < dt * 6 * (Ueff - 12) / 8) emitSpray(sp.x + p.d[0], p.d[1], sp.z + p.d[2], Ueff); }
  for (let j = 0; j < 5; j++) { const a = Math.random() * 2 * Math.PI, rr = 8 + Math.random() * 60, f = b.cf, fl = Math.hypot(f[0], f[2]) || 1;
    sprayPts[j] = { x: b.pos[0] + f[0] / fl * (rr + 10) + Math.cos(a) * rr * 0.6, z: b.pos[2] + f[2] / fl * (rr + 10) + Math.sin(a) * rr * 0.6, wb: 1, wc: 1 }; }
  stepSpray(dt);
  const cp = probeCam ? camProbe : [0, 0];
  SUN.points = (T ? HUMANS.flatMap(h => PR.worldPts(S.obj, h.x, h.z, yaw)) : []).concat(FL.points(), [{ x: cp[0], z: cp[1], wb: 1, wc: 1 }, { x: FLOAT_AT[0], z: FLOAT_AT[1], wb: 1, wc: 0.5 }], SPRAY && Ueff >= 13 ? sprayPts : []);
  // 濡れ: 波が高いと下のほうがしぶきで（見た目の目安）
  SUN.wetRain = 0; SUN.wetSplash = 0;   // 濡れは物ごと（stepWet）
  skyEnv();
  SUN.windU = Ueff; SUN.windA = WIND_ANG; SUN.foamW = 3.84e-6 * Math.pow(Ueff, 3.41); SUN.foamK = window.__foamOn ? 1 : 0;   // 沖の白波の泡は描かない（2026-10-22 ユーザー「白波をやめよう」。A・B・C を見くらべたあと。コードは残す: window.__foamOn = true で描く）。割合は数字だけ
  if (ocean) { const tot = (st.Hm0 > 0 || sw) ? 0.003 + 5.12e-3 * Ueff : 0;   // 海面の傾きのばらつき（Cox & Munk 1954）。描いている波の分を引いた残りで照り返しをにじませる
    SUN.rough0 = Math.max(0.012, Math.sqrt(Math.max(tot - ocean.fftSlope, 0)));
    SUN.globe = null; SUN.far = 0; SUN.curvR = 0; SUN.fogH = 0;
    if (Math.hypot(b.pos[0], b.pos[1] + GL.Re, b.pos[2]) - GL.Re > 300) stormGlobe(b, dt);   // 高く上がると地球の丸み・見通し・地球儀（js/storm.js）
    const wHere = probeCam && pc ? pc.d[1] : 0;
    SUN.under = probeCam && b.pos[1] < wHere; SUN.camD = Math.max(0, wHere - b.pos[1]);
    SUN.wideGrid = camFloat || flying || SUN.under || cam.pitch < 0.05 || Math.hypot(st.Hm0, sw ? sw.Hm0 : 0) > 2;   // 波のすぐそばでは網目を画面の外まで広く
    ocean.frame(dt, S.simT, b, SUN); }
  drawOverlay(b);
  if (beachOpen && !beach3d) window.WGbeach.draw($('sec'), S.st, S.simT, beachSlope);
  if (secOpen) window.WGsection.draw($('sec'), S.st, S.simT, FL.list.length > 0, S.us || 0, secMag);
}
let camProbe = [0, 0];
// 言語（I18N.md）: 題名・JP／EN・画面のボタンの文字と title
document.title = L('波が育つまで', 'How Waves Grow');
document.querySelectorAll('#langsw button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.l === LANG); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
$('secMag').textContent = L('動きを3倍に', 'Motion × 3'); $('secClose').textContent = L('× 断面をとじる', '× Close the section'); $('fpQ').textContent = L('下', 'Down'); $('fpE').textContent = L('上', 'Up');
$('tSlider').setAttribute('aria-label', L('風が吹きはじめてからの時間', 'Time since the wind started')); $('wSlider').setAttribute('aria-label', L('風の速さ', 'Wind speed'));
$('depth').setAttribute('aria-label', L('水深', 'Water depth')); $('clar').setAttribute('aria-label', L('水の透明度（にごり）', 'Water clarity')); $('cloud').setAttribute('aria-label', L('雲の量', 'Cloud cover'));
$('spAuto').title = L('はじめはゆっくり、だんだん速く（72時間を1分で）', 'Slow at first, then faster (72 hours in 1 minute)');
document.querySelector('#views [data-v=float]').title = L('海面に浮かんで見る', 'Float at the sea surface'); document.querySelector('#views [data-v=fly]').title = L('W A S D・Q E（スマホは画面のボタン）。水の中にも入れます', 'W A S D and Q E (buttons on phones). You can go underwater too');
document.querySelector('#tods [data-k=now]').title = L('いる所のいまの時刻', 'The current time at this place'); document.querySelector('#tods [data-k=auto]').title = L('1日を4分で', 'One day in 4 minutes');
$('flyPad').setAttribute('aria-label', L('自由に動くボタン', 'Free-move buttons'));
cam.floatZoom0 = cam.floatZoom; cam.floatZoom = null;
start();
