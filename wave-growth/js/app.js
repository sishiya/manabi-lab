// 波が育つまで — 土台（状態・時間と風のつまみ・海の分布を GPU へ・案内・ループ・デバッグ用の窓口）
// js/app.js → js/storm.js（遠くの嵐）→ js/scene.js（見かた・物・画面の絵）の順に読む。ふつうの <script> なので、上の const / let は 3 つで共有する。
'use strict';
window.__wagrErr = [];
window.addEventListener('error', e => window.__wagrErr.push(String(e.message)));

const $ = id => document.getElementById(id);
const W = window.WGgrowth, HOUR = 3600, DAY = 86400, TMAX = 72 * HOUR;   // 遠くの嵐を入れていたときは 14 日（2026-10-21 嵐をいったん外して 72 時間にもどした）
const WIND_ANG = Math.PI + 0.5;          // 風の波が進む向き（左前からこちらへ）
// 空・光（時刻と雲から js/env.js で毎コマ）。カメラははじめ +x（東）を見ている
const SUN = { rough0: 0.012, meshes: [], points: [] };
const DAY_SEC = 240;
const START_T = 2 * 60;                 // 開いたときは、風が吹きはじめて 2 分の海から（さざ波が立ちはじめたところ。凪の鏡は案内の 1 段めで見せる）                     // 「自動」のとき 1 日を 4 分で

// ---- 状態 ----
const S = {
  t: START_T,                             // 風が吹きはじめてからの時間（秒）。遠くの嵐もこの時計で進む
  sched: [{ t: 0, U: 10 }], depth: Infinity,   // depth = 水深（m、Infinity = 底が見えない深い海）               // 風（ずっと同じ。graph.js・growth.js は区切りのある記録も読める）
  play: true, speed: 0,                   // ▶ のとき 1 秒で進む時間（0 = おまかせ: つまみの目盛りで同じ速さ → はじめはゆっくり）
  tod: 'morning', clock: 7, weather: 'clear', obj: 'human',
  simT: 0,                                // 画面の波の時計（ふつうの速さ）
  st: null,
};

// ---- 海とカメラ ----
const cv = $('cv'), ov = $('ov');
let ocean = null;
try { ocean = window.WGocean.create(cv); }
catch (e) { $('glerr').hidden = false; $('glerr').textContent = L('この画面では海を描けません（' + e.message + '）。グラフと数字は使えます。', 'This screen cannot draw the sea (' + e.message + '). The graph and numbers still work.'); }
const cam = window.WGcamera.create(cv);
let rscale = 1;
let foamShortShown = false;   // 白波が観測の式に届かないことを書いているか（変わったら update で書きなおす）
function resize() {
  const r = cv.getBoundingClientRect(), cap = Math.sqrt(1920 * 1080 / Math.max(1, r.width * r.height));
  const k = Math.min(devicePixelRatio || 1, ocean ? ocean.Q.px : 2, cap) * rscale;   // 画質ごとの画素の上限（js/ocean.js の QUALITY）
  cv.width = Math.max(1, Math.round(r.width * k)); cv.height = Math.max(1, Math.round(r.height * k));
}
if (ocean && ocean.isSoft) rscale = 0.5;   // ソフトの GPU では画素を半分から
// ---- 画質（自動・高・中・低）: 自動は、はじめに端末から決め（スマホの GPU・タッチの小さい画面は「中」）、重いと 1 段ずつ下げる。選んだものは覚えておく ----
let qPick = 'auto';
try { qPick = localStorage.getItem('wagr.quality') || 'auto'; } catch (e) {}
if (!['auto', 'high', 'mid', 'low'].includes(qPick)) qPick = 'auto';
function setQualityPick(k) { qPick = k; try { localStorage.setItem('wagr.quality', k); } catch (e) {}
  if (ocean) { ocean.setQuality(k === 'auto' ? ocean.autoQuality() : k); rscale = ocean.isSoft ? 0.5 : 1; resize(); }
  document.querySelectorAll('#quals button').forEach(b => { const on = b.dataset.q === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  qualNote(); }
function qualNote() { const el = $('qualNote'); if (!el || !ocean) return; const n = { high: L('高', 'High'), mid: L('中', 'Medium'), low: L('低', 'Low') }[ocean.quality];
  el.textContent = qPick === 'auto' ? L(`いまは「${n}」`, `Now: ${n}`) : ''; }
document.querySelectorAll('#quals button').forEach(b => b.onclick = () => setQualityPick(b.dataset.q));
setQualityPick(qPick);
addEventListener('resize', resize); resize();

// ---- 時間のつまみ（目盛りは平方根: はじめの数時間を見やすく。72 時間まで） ----
const tSlider = $('tSlider');
const t2v = t => Math.round(Math.sqrt(t / TMAX) * 1000), v2t = v => TMAX * (v / 1000) ** 2;
// つまみを動かすあいだだけ止め、はなしたら前の状態（再生中なら再生）にもどす
tSlider.addEventListener('pointerdown', () => { if (S.resume == null) S.resume = S.play; });
tSlider.addEventListener('input', () => { if (S.resume == null) S.resume = S.play; S.t = v2t(+tSlider.value); S.play = false; S.free = true; update(); });
tSlider.addEventListener('change', () => { if (S.resume) S.play = true; S.resume = null; update(); });
$('play').onclick = () => { if (S.t >= TMAX) S.t = 0; S.play = !S.play; S.free = true; update(); };
document.querySelectorAll('#speeds button').forEach(b => b.onclick = () => { S.speed = +b.dataset.s; update(); });

// ---- 風（ずっと同じ。変えると、はじめからその風だったとして計算しなおす） ----
const wSlider = $('wSlider');
function windAt(t) { let U = 0; for (const e of S.sched) if (e.t <= t) U = e.U; return U; }
wSlider.addEventListener('input', () => { S.sched = [{ t: 0, U: +wSlider.value }]; S.free = true; update(); });
function resetWind(U) { S.sched = [{ t: 0, U }]; }

// ---- 数字・表示 ----
function fmtTime(t) {
  if (t > 72 * HOUR) { const d = t / DAY; return (d < 10 ? d.toFixed(1) : d.toFixed(0)) + L(' 日', ' days'); }
  const tm = Math.round(t / 60); if (tm < 60) return tm + L(' 分', ' min');
  const h = Math.floor(tm / 60), m = tm % 60;
  return h + L(' 時間', ' h') + (m && h < 10 ? ' ' + m + L(' 分', ' min') : '');
}
const fmtLen = v => v < 0.1 ? (v * 100).toFixed(1) + ' cm' : v.toFixed(2) + ' m';
let lastSea = { key: '', at: 0 }, bfRow = -1;
// 風力階級の表（この計算の発達しきった海の高さは、その風速の範囲のまん中で）
document.querySelector('#bfTable tbody').innerHTML = window.WGbeaufort.T.map(r => {
  const mid = isFinite(r[2]) ? (r[1] + r[2]) / 2 : r[1], f = mid > 0.4 && r[0] <= 11 ? W.fullyDev(mid).Hm0 : 0;   // この計算の風は 30 m/s まで（風力 11）
  const tb = r[4] == null ? '—' : r[4] + ' m' + (r[5] != null ? L(`（${r[5]}）`, ` (${r[5]})`) : '');
  return `<tr><td>${r[0]}</td><td>${r[1].toFixed(1)}${L('〜', '–')}${isFinite(r[2]) ? r[2].toFixed(1) : ''}</td><td>${r[3]}</td><td>${tb}</td><td>${f ? (f < 1 ? f.toFixed(2) : f.toFixed(1)) + ' m' : '—'}</td></tr>`; }).join('');
function update() {
  // 深い海の成長（CEM）→ 水深 S.depth の海（TMA: 長い波のエネルギーに上限）。Hm0 = その水深の高さ、Hdeep = 深い海なら
  const st0 = W.stateAt(S.sched, S.t), U = windAt(S.t), dr = st0.Hm0 > 0 ? W.tmaRatio(st0.Hm0, st0.Tp, S.depth) : 1;
  const st = S.st = Object.assign({}, st0, { Hdeep: st0.Hm0, Hm0: st0.Hm0 * dr, depthR: dr });
  stormUpdate();                                            // 遠くの嵐のうねり（js/storm.js）: SW_OBS
  const sw = SW_OBS && SW_OBS.Hm0 > 0.02 ? SW_OBS : null, Hall = Math.hypot(st.Hm0, sw ? sw.Hm0 : 0);
  tSlider.value = t2v(S.t);
  $('tLabel').textContent = fmtTime(S.t);
  $('play').textContent = S.play ? '❚❚' : '▶';
  const ps = $('stPause'); ps.hidden = S.play; ps.textContent = S.t >= TMAX ? L('72 時間まで来ました（▶ でもう一度）', 'Reached 72 hours (▶ to play again)') : S.t < 60 && !sw ? L('止まっています（▶ で風が吹きはじめます）', 'Stopped (▶ to start the wind)') : L('一時停止中（▶ で進む）', 'Paused (▶ to continue)');
  document.querySelectorAll('#speeds button').forEach(b => b.classList.toggle('on', +b.dataset.s === S.speed));
  wSlider.value = U; $('wLabel').textContent = U.toFixed(1) + ' m/s';
  const wp = st.Tp > 0 ? 2 * Math.PI / st.Tp : 1, kp = W.kOfDepth(wp, S.depth), lam = 2 * Math.PI / kp, c = wp / kp;   // 水深の分散 ω² = gk tanh kh
  S.us = W.stokes(st.Hm0, st.Tp);
  $('nH').textContent = st.Hm0 > 0 ? fmtLen(st.Hm0) : '0';
  $('nT').textContent = st.Tp > 0 ? st.Tp.toFixed(1) + L(' 秒', ' s') : '—';
  $('nL').textContent = st.Tp > 0 ? (lam < 1 ? (lam * 100).toFixed(0) + ' cm' : lam.toFixed(lam < 10 ? 1 : 0) + ' m') : '—';
  $('nC').textContent = st.Tp > 0 ? c.toFixed(1) + ' m/s' + (U > 0 ? L(`（風の ${(c / U).toFixed(2)} 倍）`, ` (${(c / U).toFixed(2)}×wind)`) : '') : '—';
  $('nS').textContent = st.Hm0 <= 0 ? (U > 0 ? L('風が吹く前', 'Before the wind') : L('風がない', 'No wind')) : st.full ? L('発達しきった', 'Fully developed') : L('育っている途中', 'Still growing');
  if (!flying) cam.minY = 1.5 + 1.2 * Hall;   // 上から見るときはカメラを波の中に入れない（水の中・自由に動くときはそのまま）
  // 風力階級（気象庁）
  const bf = window.WGbeaufort.at(U); $('nB').textContent = L('風力 ', 'Force ') + bf[0]; $('nBd').textContent = bf[3];
  if (bfRow !== bf[0]) { bfRow = bf[0]; document.querySelectorAll('#bfTable tbody tr').forEach((tr, i) => tr.classList.toggle('now', i === bf[0])); }
  refreshToggles();
  // 自分でつまみを動かしたら、案内の文のかわりに、いまの様子をひとことで
  // 風のつまみの下の注意（白波の割合・水深・強い風）。ひとこと（cap）は短く（スマホで下のパネルが見えるように）
  const notes = [];
  if (U >= 5 && st.Hm0 > 0) notes.push(U <= 20 ? L(`白波（砕けた波の泡）は海面の約 ${(3.84e-4 * Math.pow(U, 3.41)).toFixed(U < 8 ? 1 : 0)}%（観測の式）。`, `Whitecaps (foam of breaking waves) cover about ${(3.84e-4 * Math.pow(U, 3.41)).toFixed(U < 8 ? 1 : 0)}% of the sea (measured formula).`)
    : L('白波が海面の大部分をおおう（観測の式は 20 m/s まで）。', 'Whitecaps cover most of the sea (the measured formula only goes up to 20 m/s).'));
  if (isFinite(S.depth) && dr < 0.97 && st.Hm0 > 0) notes.push(L(`水深 ${S.depth.toFixed(S.depth < 10 ? 1 : 0)} m なので、長い波は底にふれて遅く・短くなり、高さは深い海の ${(dr * 100).toFixed(0)}%。`, `At ${S.depth.toFixed(S.depth < 10 ? 1 : 0)} m depth, long waves feel the bottom and get slower and shorter; the height is ${(dr * 100).toFixed(0)}% of the deep-sea value.`));
  if (U > 20) notes.push(L('※ 風速 20 m/s をこえる風（風力 9〜11）が広い海で何日も吹きつづけることは、実際にはまずありません（台風の中の風は数百 km の範囲で、嵐も動く）。ブイで測られた波の高さ（有義波高）の記録は約 19 m。', '※ Winds over 20 m/s (force 9–11) almost never blow for days over a wide ocean (typhoon winds cover a few hundred km and the storm moves). The highest significant wave height measured by a buoy is about 19 m.'));
  if (ocean && ocean.foam.on && ocean.foam.short && U >= 5 && st.Hm0 > 0) notes.push(L('この絵の白波はこれより少ない（この絵の波は押し縮められた所が足りず、観測の割合まで作れない）。', 'The whitecaps drawn here are fewer than this (the waves in this picture are not squeezed enough to make the observed amount).'));
  foamShortShown = !!(ocean && ocean.foam.short);
  $('windNote').textContent = notes.join(' '); $('windNote').hidden = !notes.length;
  if (S.free) { window.WGguide.clear(); $('stepNo').textContent = L('自由に見ている', 'Exploring'); $('next').textContent = window.WGguide.index < 0 ? L('案内をはじめる ▶', 'Start the tour ▶') : L('案内のつづき ▶', 'Continue the tour ▶');
    const swTxt = sw ? L(`遠くの嵐のうねり ${fmtLen(sw.Hm0)}（周期 ${sw.Tp.toFixed(0)} 秒）も届いています。`, `Swell from a distant storm (${fmtLen(sw.Hm0)}, period ${sw.Tp.toFixed(0)} s) is arriving too.`) : '';
    $('cap').textContent = (st.Hm0 <= 0 ? (U > 0 ? L('風が吹く前。', 'Before the wind.') : L('風がない。', 'No wind.')) + (sw ? '' : L('海は鏡のように平ら。', 'The sea is flat as a mirror.'))
      : L(`風速 ${U.toFixed(U % 1 ? 1 : 0)} m/s の風が吹いて ${fmtTime(S.t)}。波の高さ ${$('nH').textContent}・長さ ${$('nL').textContent}。`, `${U.toFixed(U % 1 ? 1 : 0)} m/s wind for ${fmtTime(S.t)}. Waves ${$('nH').textContent} high, ${$('nL').textContent} long.`)
        + (st.full ? L('もうこれ以上は育ちません。', ' They will not grow any more.') : '')
        ) + swTxt; }
  window.WGgraph.draw($('graph'), Object.assign({ U }, st), S.sched, Math.min(S.t, 72 * HOUR));
}
// 海の分布を GPU へ: 風の波（CEM＋JONSWAP＋短い波）＋遠くの嵐のうねり（js/storm.js）。変わっていたら、続けて動かしているときは 90 ms に1回
function syncSea() {
  if (!ocean) return;
  const st = S.st, U = windAt(S.t), sw = SW_OBS && SW_OBS.Hm0 > 0.005 ? SW_OBS : null, now = performance.now();
  const q = (v, r) => Math.round(Math.log(Math.max(v, 1e-4)) / r);   // 0.4%（風の波）・1%（うねり）ごとに丸めて、変わったかを見る
  const key = [ocean.Q.casc4 ? 4 : 3, U, S.depth, st.Hdeep > 0 ? q(st.Hdeep, 0.004) : 0, st.Tp > 0 ? q(st.Tp, 0.003) : 0, sw ? q(sw.Hm0, 0.01) : 0, sw ? q(sw.Tp, 0.01) : 0, SW_ANG.toFixed(3)].join('/');
  if (key === lastSea.key || now - lastSea.at < 90) return;
  ocean.setDepth(S.depth);
  const ws = st.Hdeep > 0 ? W.makeSpecK(st.Hdeep, st.Tp, WIND_ANG, 10, U, S.depth) : null, ss = sw ? W.makeSpecKTable(SW.fs, sw.E, SW_ANG, sw.s) : null;
  ocean.setSpec(ws && ss ? (kx, kz) => ws(kx, kz) + ss(kx, kz) : ws || ss || (() => 0));
  lastSea = { key, at: now };
}

// ---- 案内 ----
let camAnim = null;
const guideApi = {
  resetWind, setTime(t) { S.t = t; S.play = t === 0; update(); },   // はじめの段は風が吹きはじめるところから再生（止めると波のない海のままになるので）
  view(v) { if (view !== v || beachOpen) setView(v); }, play() { S.play = true; update(); }, storm(on) { if (!on && STORM.on) stopStorm(); },
  camTo(c) { let yaw = c.yaw != null ? c.yaw : cam.yaw; yaw = cam.yaw + Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw));   // 近い回りで
    camAnim = { from: { pitch: cam.pitch, dist: cam.dist, yaw: cam.yaw }, to: Object.assign({ pitch: cam.pitch, dist: cam.dist }, c, { yaw }), k: 0 }; },
  addBuoy() { if (!FL.list.length) FL.add(-6, -1.5, S.simT); S.showBuoy = true; refreshToggles(); }, section(on) { on ? openSection() : closeSection(); refreshToggles(); },
  caption(text, step, last) { S.free = false; $('cap').textContent = text; $('stepNo').textContent = L('案内 ', 'Tour ') + step; $('next').textContent = last ? L('案内をおわる', 'End the tour') : L('つぎへ ▶', 'Next ▶'); },
  // 案内をおわる: はじめの画面にもどす（風 10 m/s・吹く前から再生・上から・ブイと嵐は消す）
  finish() { if (secOpen) closeSection(); resetProps(); S.put = 'buoy'; S.showHuman = true; S.showBuoy = true; if (STORM.on) stopStorm(); setView('orbit'); resetWind(10); S.t = START_T; S.play = true; S.speed = 0; S.free = true; update(); },
};
$('next').onclick = () => window.WGguide.next(guideApi);

// ---- ループ ----
let last = performance.now(), fpsAcc = 0, fpsN = 0, slow = 0, tick = 0;
function step(dt) {
  S.simT += dt;
  if (S.tod === 'auto') { S.clock += dt * 24 / DAY_SEC; if (tick % 30 === 0 && ocean) ocean.skyChanged(); }   // 24 をこえると次の日（月も動く）
  // おまかせ: つまみの目盛りで 1 秒に 1/60（72 時間を 1 分）
  if (S.play) { S.t = Math.min(TMAX, S.speed ? S.t + dt * S.speed : v2t(Math.sqrt(S.t / TMAX) * 1000 + dt * 1000 / 60)); if (S.t >= TMAX) S.play = false; update(); }
  else if (++tick % 20 === 0) stormDrawPanels();
  if (camAnim) { camAnim.k = Math.min(1, camAnim.k + dt / 1.2); const e = 1 - Math.pow(1 - camAnim.k, 3);
    cam.pitch = camAnim.from.pitch + (camAnim.to.pitch - camAnim.from.pitch) * e; cam.yaw = camAnim.from.yaw + (camAnim.to.yaw - camAnim.from.yaw) * e; cam.dist = camAnim.from.dist + (camAnim.to.dist - camAnim.from.dist) * e;
    if (camAnim.k >= 1) camAnim = null; }
  stepFly(dt);   // 自由に動く（js/scene.js）
}
function loop(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  step(dt); draw(dt);
  // 1 コマ 22 ms をこえる状態が 2 秒続いたら、描く画素を 85% に（50% まで）
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { const ms = fpsAcc / fpsN * 1000; fpsAcc = 0; fpsN = 0;
    // 重いか: GPU の時間がわかればそれで（14 ms）。わからないときは 22 ms をこえるか。ただし 33 ms ちょうどにそろうのは、節電で画面が 30 コマに止められているだけなので数えない
    const heavy = ocean && ocean.gpuMs ? ocean.gpuMs > 14 : ms > 22 && Math.abs(ms - 33.3) > 2.5; slow = heavy ? slow + 1 : 0;
    if (slow >= 4 && qPick === 'auto' && rscale <= 0.75 && ocean && ocean.quality !== 'low') {   // 自動: 画素を下げても重いときは画質を 1 段下げる。画素の数は保つ（上限が下がるぶんだけ rscale を上げる）
      const d = devicePixelRatio || 1, k0 = Math.min(d, ocean.Q.px); ocean.setQuality(ocean.quality === 'high' ? 'mid' : 'low'); rscale = Math.min(1, rscale * k0 / Math.min(d, ocean.Q.px)); resize(); qualNote(); slow = 0; }
    else if (slow >= 4 && rscale > 0.5) { rscale = Math.max(0.5, rscale * 0.85); resize(); slow = 0; }
    if (ocean && ocean.foam.short !== foamShortShown) update();
    const sg = ocean && ocean.prof ? ocean.stage : null;   // ?prof=1 のとき段階ごと（波の FFT・泡の地図・海面の読み出し・空の絵・画面）
    $('perf').textContent = L(`1コマ ${ms.toFixed(1)} ms`, `${ms.toFixed(1)} ms/frame`) + (ocean && ocean.gpuMs ? `（GPU ${ocean.gpuMs.toFixed(1)}）` : '') + (sg ? L(`［波 ${sg.fft.toFixed(2)}・泡 ${sg.foam.toFixed(2)}・読み出し ${sg.probe.toFixed(2)}・空の絵 ${sg.skytex.toFixed(2)}・画面 ${sg.draw.toFixed(2)}］`, ` [waves ${sg.fft.toFixed(2)} · foam ${sg.foam.toFixed(2)} · probe ${sg.probe.toFixed(2)} · sky map ${sg.skytex.toFixed(2)} · screen ${sg.draw.toFixed(2)}]`) : '') + L('・', ' · ') + `${cv.width}×${cv.height}`; }
  requestAnimationFrame(loop);
}
function start() {
  // はじめ: 朝の景色・人あり・風が吹いて 2 分の海から再生（案内は「つぎへ」で始まり、1 段めは吹く前の凪）
  setView('orbit'); setObj('human'); setTod('morning'); setWeather(); setClarity(); setDepth();   // 見かたを先に（あとだとカメラを太陽からななめに向ける動きが消える）
  S.free = true; update();
  if (ocean && /[?&]prof=1/.test(location.search)) ocean.prof = true;
  requestAnimationFrame(loop);
  // デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
  window.__wagr = { S, cam, get ocean() { return ocean; }, update, STORM, startStorm, stopStorm,
    simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) { step(dt); draw(dt); } return S.st; } };   // 毎コマ描く（ブイは描いたコマの海面を読んで動くため）
}
