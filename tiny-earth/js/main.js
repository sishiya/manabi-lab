// ちいさな地球 — メイン（組み立て・時間を進める・デバッグ用の窓口）
'use strict';
window.__tieaErr = [];
window.addEventListener('error', e => window.__tieaErr.push(String(e.message)));

const LEVEL = 5;                       // 網の細かさ（10242 点）。6 にすると 4 倍重い
const mesh = MESH.build(LEVEL);
const terrain = TERRAIN.build(mesh);
const ocean = OCEAN.create(mesh, terrain.elev);
const S = { playing: true, speed: 3600, wind: 0, lastUI: 0, spin0: 0 };
const cv = document.getElementById('cv');

VIEW.init(cv, mesh, terrain, ocean);
const life = LIFE.create(mesh, terrain, ocean);
LVIEW.init(life);

function setR(R) {
  const keepT = ocean.t;
  OCEAN.reset(ocean, R);
  ocean.t = keepT;
  ocean.wind.U = S.wind;
  UI.setSizeLabel(R);
  VIEW.setAlt(VIEW.st.alt);
  VIEW.rebuildLand();
  UI.nums(ocean); UI.facts(ocean, S.wind);
  LIFE.reset(life); UI.lifePhys(life); UI.life(life);   // 生きものを置きなおす（重力が変わるので）
  HUI.rebuild();   // 正直モードなら、この大きさで計算しなおす
  UI.$('shakeNote').textContent = `押す速さ ${UI.speed(ocean.P.c0)}（この星の長い波の速さと同じ）。水のかたまりは高さ ${UI.len(2 * ocean.P.H0)}・幅 ${UI.len(3 * mesh.Lavg * R)}。`;
  exNote();
}
function exNote() {
  const ex = VIEW.st.ex;
  UI.$('exNote').textContent = ex === 1 ? '本当の高さ。海の深さも波も半径と同じ割合で縮むので、どの大きさでも海の高さはほとんど見えない（色で見る: 明るい水色＝もとの海面より高い、紺＝低い）。' : `地形と海の高さを ${ex} 倍にして描いています（木の大きさと計算はそのまま）。海の色: 明るい水色＝もとの海面より高い、紺＝低い。白は氷（正直モード）。`;
  UI.$('hudX').textContent = ex === 1 ? '高さ ×1（本当）' : `高さ ×${ex} で表示`;
}
const handlers = {
  setR,
  togglePlay() { S.playing = !S.playing; return S.playing; },
  setSpeed(v) { S.speed = v; },
  resetOcean() { OCEAN.reset(ocean, ocean.R); ocean.wind.U = S.wind; LIFE.reset(life); UI.life(life); },
  setWind(U) { S.wind = U; ocean.wind.U = U; UI.facts(ocean, U); },
  // 風 = U·(軸×位置)。軸を画面の上向きにすると、画面のまん中で右向きに吹く
  windDir() { const a = VIEW.screenUpInPlanet(); ocean.wind.ax = a.x; ocean.wind.ay = a.y; ocean.wind.az = a.z; },
  shake() { const r = VIEW.screenRightInPlanet(); const v = ocean.P.c0; OCEAN.shake(ocean, r.x * v, r.y * v, r.z * v); LIFE.startle(life, 0, Math.PI * ocean.R * 2); },   // 星がゆれると、陸の生きものはみなおどろいて跳ぶ
  dropCenter() { const c = centerCell(); if (c >= 0) dropAt(c); },
  setEx(v) { VIEW.st.ex = v; VIEW.rebuildLand(); exNote(); },
  setStyle(v) { VIEW.setStyle(v); VIEW.rebuildLand(); },
};
function dropAt(c) {
  const w = 3 * mesh.Lavg * ocean.R, v = OCEAN.drop(ocean, c, 2 * ocean.P.H0, w);
  VIEW.dropFx(c, w);
  LIFE.startle(life, c, 3 * w);   // 近くの陸の生きものがおどろいて跳ぶ
  toast(`水のかたまりを落とした（約 ${v >= 1e9 ? UI.sig(v / 1e9) + ' km³' : Math.round(v).toLocaleString('ja-JP') + ' m³'}）`);
}
let toastT = 0;
function toast(msg) {
  const el = UI.$('toast'); el.textContent = msg; el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600);
}
function centerCell() {
  const r = cv.getBoundingClientRect();
  return VIEW.pick({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
}
VIEW.onTap = e => { const c = VIEW.pick(e); if (c >= 0) dropAt(c); };
UI.init(handlers);
HUI.init({ mesh, ocean, terrain, life });
UI.$('lifeShow').addEventListener('click', e => { life.on = !life.on; e.target.classList.toggle('on', life.on); e.target.textContent = life.on ? '見せる' : '見せない'; });
UI.$('lifeReset').addEventListener('click', () => { LIFE.reset(life); UI.life(life); });

// 風の向きの初め: 星の軸のまわり（西から東へ）
ocean.wind.ax = 0; ocean.wind.ay = 1; ocean.wind.az = 0;
setR(1000, false);
// 最初は星を少し押した状態から（たっぷん）。最初の一押しでは生きものをおどろかせない
{ const r = VIEW.screenRightInPlanet(), v = ocean.P.c0; OCEAN.shake(ocean, r.x * v, r.y * v, r.z * v); }

function resize() { VIEW.resize(); }
window.addEventListener('resize', resize);
resize();
{ const asp = cv.clientWidth / Math.max(1, cv.clientHeight); VIEW.st.alt = asp < 1 ? 2.3 / asp : 2.3; }   // 縦長の画面でも星が入るように

function step(realDt) {
  HUI.step(realDt);
  if (!S.playing || HUI.on) return;     // 正直モードのあいだ、海の流れの計算は止める（凍る・消える海は別の計算）
  const want = realDt * S.speed;
  const r = OCEAN.advance(ocean, want, 60);
  S.behind = want - r.done;     // 追いつけなかった分（重いとき）
  LIFE.step(life, r.done);
}
function draw(now) {
  VIEW.updateWater();
  LVIEW.update(HUI.on ? HUI.H.lifeHon : null);
  VIEW.render(ocean.t * PHYS.OMEGA);
  if (now - S.lastUI > 250) { UI.live(ocean, terrain); UI.life(life, HUI.on ? HUI.H.lifeHon : null); S.lastUI = now; }
}
let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // 最初のコマは now が last より前のことがある
  step(dt); draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__tiea = {
  S, mesh, terrain, ocean, VIEW, handlers, HUI, life,
  simRun(sec) { let n = 0; while (sec > 0 && n < 100000) { const r = OCEAN.advance(ocean, sec, 400); sec -= r.done; n += r.n; } S.lastUI = -1e9; draw(performance.now()); return n; },
  vol() { return OCEAN.volume(ocean) / ocean.vol0 - 1; },
  cam(o) { Object.assign(VIEW.st, o); draw(performance.now()); },
};
