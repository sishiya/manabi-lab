// ちいさな地球 — メイン（組み立て・時間を進める・デバッグ用の窓口）
'use strict';
window.__tieaErr = [];
window.addEventListener('error', e => window.__tieaErr.push(String(e.message)));

document.title = L('ちいさな地球', 'A Tiny Earth');
const LEVEL = 5;                       // 網の細かさ（10242 点）。6 にすると 4 倍重い
const mesh = MESH.build(LEVEL);
const terrain = TERRAIN.build(mesh);
const ocean = OCEAN.create(mesh, terrain.elev);
const S = { playing: true, speed: 3600, wind: 0, lastUI: 0, spin0: 0 };
const cv = document.getElementById('cv');

VIEW.init(cv, mesh, terrain, ocean);
const life = LIFE.create(mesh, terrain, ocean);
FOREST.init(VIEW.planet);
CLOSE.init({ mesh, ocean, life, S, setEx: v => { handlers.setEx(v); UI.$('ex').value = Math.round(Math.log10(v) * 100); UI.$('exV').textContent = '×' + v; } });
LVIEW.init(life);

function setR(R) {
  if (typeof CLOSE !== 'undefined' && CLOSE.on) UI.$('closeBtn').click();   // 大きさを変えたら、そばで見るのをやめる
  const keepT = ocean.t;
  OCEAN.reset(ocean, R);
  ocean.t = keepT;
  ocean.wind.U = S.wind;
  UI.setSizeLabel(R);
  VIEW.setAlt(VIEW.st.alt);
  VIEW.rebuildLand();
  UI.nums(ocean); UI.facts(ocean, S.wind);
  LIFE.reset(life); UI.lifePhys(life); UI.life(life);   // 生きものを置きなおす（重力が変わるので）
  FOREST.clear(); UI.forest(ocean, S.wind); UI.$('treeH').value = treeVOf(FOREST.st.H); UI.$('treeHV').textContent = UI.len(FOREST.st.H);
  HUI.rebuild();   // 正直モードなら、この大きさで計算しなおす
  UI.$('shakeNote').textContent = L(`押す速さ ${UI.speed(ocean.P.c0)}（この星の長い波の速さと同じ）。水のかたまりは高さ ${UI.len(2 * ocean.P.H0)}・幅 ${UI.len(3 * mesh.Lavg * R)}。`, `The shove is ${UI.speed(ocean.P.c0)} (the speed of long waves on this planet). The lump of water is ${UI.len(2 * ocean.P.H0)} high and ${UI.len(3 * mesh.Lavg * R)} wide.`);
  exNote();
}
function exNote() {
  const ex = VIEW.st.ex;
  UI.$('exNote').textContent = ex === 1 ? L('本当の高さ。海の深さも波も半径と同じ割合で縮むので、どの大きさでも海の高さはほとんど見えない（色で見る: 明るい水色＝もとの海面より高い、紺＝低い）。', 'True heights. Sea depth and waves shrink with the radius, so at any size you can hardly see the height of the sea (read the colors: light aqua = above the normal sea level, navy = below).') : L(`地形と海の高さを ${ex} 倍にして描いています（木の大きさと計算はそのまま）。海の色: 明るい水色＝もとの海面より高い、紺＝低い。白は氷（正直モード）。`, `Terrain and sea heights are drawn ${ex}× taller (tree sizes and the calculation are unchanged). Sea colors: light aqua = above the normal sea level, navy = below. White is ice (honest mode).`);
  UI.$('hudX').textContent = ex === 1 ? L('高さ ×1（本当）', 'Height ×1 (true)') : L(`高さ ×${ex} で表示`, `Heights shown ×${ex}`);
}
const handlers = {
  setR,
  togglePlay() { S.playing = !S.playing; return S.playing; },
  setSpeed(v) { S.speed = v; },
  resetOcean() { OCEAN.reset(ocean, ocean.R); ocean.wind.U = S.wind; LIFE.reset(life); UI.life(life); },
  setWind(U) { S.wind = U; ocean.wind.U = U; UI.facts(ocean, U); UI.forest(ocean, U); VIEW.swayDir(); },
  // 風 = U·(軸×位置)。軸を画面の上向きにすると、画面のまん中で右向きに吹く
  windDir() { const a = VIEW.screenUpInPlanet(); ocean.wind.ax = a.x; ocean.wind.ay = a.y; ocean.wind.az = a.z; VIEW.swayDir(); },
  shake() {
    const r = VIEW.screenRightInPlanet(), v = ocean.P.c0;
    VIEW.pushFx(r);   // 押した向きの矢印（矢印が星に当たったところで押す）
    setTimeout(() => {
      OCEAN.shake(ocean, r.x * v, r.y * v, r.z * v);
      LIFE.startle(life, 0, Math.PI * ocean.R * 2);   // 星がゆれると、陸の生きものはみなおどろいて跳ぶ
      toast(L(`星を画面の右へ ${UI.speed(v)} で押した（海の水は取り残されて左へ寄る）`, `Shoved the planet to the right at ${UI.speed(v)} (the sea is left behind and piles up on the left)`));
    }, 450);
  },
  dropCenter() { const c = centerCell(); if (c >= 0) dropAt(c); },
  setEx(v) { VIEW.st.ex = v; VIEW.rebuildLand(); exNote(); },
};
function dropAt(c) {
  // 水のかたまりが落ちてきて、海に着いた瞬間に水を足す（それまでは海は動かさない）
  const w = 3 * mesh.Lavg * ocean.R;
  VIEW.dropFx(c, w, () => {
    const v = OCEAN.drop(ocean, c, 2 * ocean.P.H0, w);
    LIFE.startle(life, c, 3 * w);   // 近くの陸の生きものがおどろいて跳ぶ
    const vt = v >= 1e9 ? UI.sig(v / 1e9) + ' km³' : UI.num(v) + ' m³';
    toast(L(`水のかたまりを落とした（約 ${vt}）`, `Dropped a lump of water (about ${vt})`));
  });
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
VIEW.onTap = e => { const c = VIEW.pick(e); if (c < 0) return; if (CLOSE.on) CLOSE.splashAt(c); else dropAt(c); };   // そばで見るときは石が落ちる
UI.init(handlers);
HUI.init({ mesh, ocean, terrain, life });
UI.$('lifeShow').addEventListener('click', e => { life.on = !life.on; e.target.classList.toggle('on', life.on); e.target.textContent = life.on ? L('見せる', 'Show') : L('見せない', 'Hidden'); });
// 森: 木の高さ（ためしに）。スライダー 0〜1000 → 3 m〜（半径 と 10 km の小さい方）、対数
const treeHmax = () => Math.max(60, Math.min(10000, ocean.R));
const treeHOf = v => 3 * Math.pow(treeHmax() / 3, v / 1000), treeVOf = H => Math.round(Math.log(H / 3) / Math.log(treeHmax() / 3) * 1000);
function setTreeH(H) { FOREST.st.H = H; UI.$('treeHV').textContent = UI.len(H); UI.$('treeH').value = treeVOf(H); VIEW.rebuildLand(); UI.forest(ocean, S.wind); }
let treePend = 0;
UI.$('treeH').addEventListener('input', () => { const H = treeHOf(+UI.$('treeH').value); UI.$('treeHV').textContent = UI.len(H); if (!treePend) treePend = requestAnimationFrame(() => { treePend = 0; setTreeH(treeHOf(+UI.$('treeH').value)); }); });
UI.$('treeReset').addEventListener('click', () => setTreeH(30));
UI.$('leafBtn').addEventListener('click', () => FOREST.release(VIEW.st.trees || [], 1500));
// そばで見る
UI.$('closeBtn').textContent = L('画面のまん中に立つ', 'Stand at the center of the view');
UI.$('lifeShow').textContent = L('見せる', 'Show');
UI.$('closeBtn').addEventListener('click', () => {
  if (CLOSE.on) { CLOSE.exit(); UI.$('closeBox').hidden = true; UI.$('closeBtn').textContent = L('画面のまん中に立つ', 'Stand at the center of the view'); UI.$('speed').disabled = false; return; }
  if (HUI.on) { toast(L('正直モードのあいだは、そばで見られません（殻をもどしてから）', 'You cannot look up close in honest mode (put the shell back first)')); return; }
  const c = centerCell(); if (c < 0) { toast(L('星のまん中に向けてから押してください', 'Point the view at the planet first')); return; }
  CLOSE.st.speed = +UI.$('closeSpeed').value;
  CLOSE.enter(c); UI.close(ocean);
  UI.$('closeBox').hidden = false; UI.$('closeBtn').textContent = L('もどる（星を外から見る）', 'Back (view the planet from outside)'); UI.$('speed').disabled = true;
});
UI.$('jumpBtn').addEventListener('click', () => CLOSE.jump());
UI.$('stoneBtn').addEventListener('click', () => { if (!CLOSE.throwAhead()) toast(L('15 m 先は陸でした（海の方を向いて投げてください）', 'There is land 15 m ahead (face the sea and throw)')); });
UI.$('rainBtn').addEventListener('click', () => CLOSE.makeRain());
UI.$('closeSpeed').addEventListener('change', () => { CLOSE.st.speed = +UI.$('closeSpeed').value; if (CLOSE.on) S.speed = CLOSE.st.speed; });
UI.$('lifeReset').addEventListener('click', () => { LIFE.reset(life); UI.life(life); });

// 風の向きの初め: 星の軸のまわり（西から東へ）
ocean.wind.ax = 0; ocean.wind.ay = 1; ocean.wind.az = 0;
setR(1000, false);
// 地形: 本物の地球（ETOPO1 を 1°ごと、data/etopo1deg.bin）と作りもの。本物を読みこめたら、それにする
const terrFake = { elev: Float32Array.from(terrain.elev), forest: Uint8Array.from(terrain.forest) };
let terrEarth = null, terrKind = 'fake';
function setTerrain(kind) {
  if (kind === 'earth' && !terrEarth) return;
  terrKind = kind;
  TERRAIN.apply(terrain, kind === 'earth' ? terrEarth : terrFake, mesh);
  for (const b of UI.$('terrBtns').children) b.classList.toggle('on', b.dataset.t === kind);
  UI.$('terrNote').textContent = kind === 'earth' ? L('本物の地球の地形（ETOPO1、NOAA）を、同じ割合で小さくしています。1°ごと（約 110 km）に間引いているので、高い山の頂上は低くなります。', "The real Earth's terrain (ETOPO1, NOAA), shrunk by the same ratio. It is sampled every 1° (about 110 km), so high peaks come out lower.") : L('作りものの地形（高さの分布だけ地球に近づけた）。', 'Made-up terrain (only the spread of heights is made Earth-like).');
  setR(ocean.R);
}
UI.$('terrBtns').addEventListener('click', e => { const t = e.target.dataset && e.target.dataset.t; if (t) setTerrain(t); });
fetch('data/etopo1deg.bin').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(buf => {
  terrEarth = TERRAIN.fromGrid(mesh, new Int16Array(buf));
  setTerrain('earth');
}).catch(e => { window.__tieaErr.push('地形データ: ' + e); UI.$('terrNote').textContent = L('本物の地球の地形を読みこめませんでした（作りものの地形で表示）。', "Could not load the real Earth's terrain (showing made-up terrain)."); });
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
  FOREST.step(r.done, ocean, VIEW.st.trees || [], true, life);
  CLOSE.step(r.done);
}
function draw(now) {
  VIEW.updateWater();
  LVIEW.update(HUI.on ? HUI.H.lifeHon : null);
  CLOSE.draw();
  if (HUI.on) FOREST.step(0, ocean, [], false, life); else FOREST.draw(ocean);   // 正直モードでは落ち葉を出さない
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
  S, mesh, terrain, ocean, VIEW, handlers, HUI, life, setTreeH, CLOSE, setTerrain,
  simRun(sec) { let n = 0; while (sec > 0 && n < 100000) { const r = OCEAN.advance(ocean, sec, 400); sec -= r.done; n += r.n; } S.lastUI = -1e9; draw(performance.now()); return n; },
  vol() { return OCEAN.volume(ocean) / ocean.vol0 - 1; },
  cam(o) { Object.assign(VIEW.st, o); draw(performance.now()); },
};
