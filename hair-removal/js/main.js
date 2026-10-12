// 脱毛のしくみ — メイン（状態・計算のよびだし・描画ループ・デバッグ用の窓口）
'use strict';
window.__hareErr = [];
window.addEventListener('error', e => window.__hareErr.push(String(e.message)));

const cv = $('cv'), g = cv.getContext('2d');
const gr = $('gr'), gg = gr.getContext('2d');
const S = {
  t: SIM.t0, site: 'shin', playing: false, speed: 30, guide: 0,
  pre: { shave: 'once', pluck: 'once', light: 'home' },
  light: { level: 10, skin: 'light', hair: 'black', prep: 'shave', cool: true },
  series: null,   // グラフ用（予定・周期を変えたときだけ計算しなおす）
  scene: null,    // いまの日の毛穴（日を動かすたびに計算しなおす）
  dirty: true, key: '', runners: null,
};

// 列ごとの手入れの日
function laneEvents(id) {
  const days = PRESETS[id].find(p => p.id === S.pre[id]).days();
  if (id === 'light') {
    // 光の前の準備: 前の日に剃る（ケノンの使い方。0日目は同じ日に剃ってから）／剃らない／1週間前に抜く
    const ev = [], prep = S.light.prep;
    for (const d of days) {
      if (prep === 'shave') ev.push({ t: Math.max(0, d - 1), type: 'shave' });
      if (prep === 'pluck') ev.push({ t: Math.max(SIM.t0, d - 7), type: 'pluck' });
      ev.push({ t: d, type: 'light' });
    }
    return ev.sort((a, b) => a.t - b.t || (a.type === 'shave' ? -1 : 1));
  }
  return makeEvents(id, days);
}

function lastAction(ev, t) {
  const NAME = { shave: '剃った', pluck: '抜いた', light: '光をあてた' };
  let last = null;
  for (const e of ev) if (e.t <= t + 1e-9) last = e;   // 同じ日なら後の方（光）
  if (!last) return '手入れなし';
  const d = Math.round(t - last.t);
  return `${NAME[last.type]}（${d === 0 ? '今日' : d + '日前'}）`;
}

function computeSeries() {
  S.series = LANES.map(lane => {
    const ev = laneEvents(lane.id), vis = [];
    simulate(S.site, ev, SIM.tMax, (t, fs) => vis.push(countLane(fs).vis), HOOKS);
    return { lane, vis, marks: ev };
  });
}
// いまの日の毛穴。前に計算した日より先なら続きから進める（再生中に軽い）
function computeScene() {
  if (!S.runners || S.runners.key !== S.key) S.runners = null;
  S.scene = LANES.map((lane, i) => {
    const ev = laneEvents(lane.id);
    let R = S.runners && S.runners[i];
    if (!R || R.t() > S.t + 1e-9) { R = new Runner(S.site, ev, HOOKS); if (S.runners) S.runners[i] = R; }
    const fs = R.advanceTo(S.t);
    if (!S.runners) { S.runners = []; S.runners.key = S.key; }
    S.runners[i] = R;
    const fl = (R.flashes || []).filter(x => x.t <= S.t + 1e-9).pop();
    return { lane, fs, count: countLane(fs), last: lastAction(ev, S.t), flash: fl, since: fl ? S.t - fl.t : Infinity };
  });
}
// 光: 1回ごとに、列の毛穴すべてに light.js の計算を当てはめ、結果を runner に記録する
const _spec = {};
const HOOKS = {
  light(fs, site, e, R) {
    const L = S.light, sk = SKINS[L.skin];
    const spec = _spec[L.skin] || (_spec[L.skin] = lightSpectrum(sk.fmel));
    const opt = { F0: L.level * LIGHT.fPerLevel, spec, fh: HAIRS[L.hair].fh, fmel: sk.fmel };
    const shade = hairShade(fs, opt);                 // 剃っていない毛が表面で光をさえぎる
    const unshaved = shade > 0.01;
    const surf = flashSurface(Object.assign({}, opt), unshaved, L.cool);
    opt.F0 *= 1 - shade;
    let nA = 0, hit = 0, Tm = 0;
    for (const f of fs) {
      const before = f.hitDay, wasA = f.ph === 'A';
      const res = flashFollicle(f, opt);
      if (wasA) { nA++; Tm = Math.max(Tm, res.T.matrix); }
      applyFlash(f, res, e.t);
      if (f.hitDay === e.t && before !== e.t) hit++;
    }
    (R.flashes || (R.flashes = [])).push({ t: e.t, nA, hit, Tm, shade, ...surf });
  },
};

function setTime(t) { S.t = Math.max(SIM.t0, Math.min(SIM.tMax, t)); S.dirty = true; }
function changed(series) { if (series) { S.series = null; S.key = S.site + JSON.stringify(S.pre) + JSON.stringify(S.light); } syncControls(S); S.dirty = true; }

// --- 描画 ---
function fit(c, ctx) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [r.width, r.height];
}
function draw() {
  if (!S.series) computeSeries();
  if (S.dirty || !S.scene) { computeScene(); S.dirty = false; }
  const [w, h] = fit(cv, g);
  drawScene(g, w, h, S.scene, S.t, { K: w < 520 ? 3 : w < 820 ? 4 : 5 });
  const [gw, gh] = fit(gr, gg);
  drawGraph(gg, gw, gh, S.series, S.t);
  $('time').value = S.t;
  $('day').textContent = (S.t < 0 ? '手入れの' + Math.round(-S.t) + '日前' : Math.floor(S.t) + '日目');
  $('play').textContent = S.playing ? '❚❚' : '▶';
}

// --- 案内 ---
function applyGuide(i) {
  S.guide = Math.max(0, Math.min(GUIDE.length - 1, i));
  const st = GUIDE[S.guide];
  S.playing = false;
  if (S.guide < GUIDE.length - 3) { S.pre = { shave: 'once', pluck: 'once', light: 'home' }; S.site = 'shin'; S.light = { level: 10, skin: 'light', hair: 'black', prep: 'shave', cool: true }; changed(true); }
  setTime(st.t);
  $('gtext').innerHTML = st.text;
  $('gnum').textContent = (S.guide + 1) + '/' + GUIDE.length;
  $('gprev').disabled = S.guide === 0;
  $('gnext').textContent = S.guide === GUIDE.length - 1 ? 'はじめから' : 'つぎへ ▶';
}

// --- 操作 ---
buildControls(S, changed);
syncControls(S);
$('time').addEventListener('input', e => { S.playing = false; setTime(+e.target.value); });
$('play').onclick = () => { if (!S.playing && S.t >= SIM.tMax) setTime(SIM.t0); S.playing = !S.playing; };
$('gnext').onclick = () => applyGuide(S.guide === GUIDE.length - 1 ? 0 : S.guide + 1);
$('gprev').onclick = () => applyGuide(S.guide - 1);
function graphPointer(e) { if (e.type === 'pointermove' && !(e.buttons & 1)) return; const r = gr.getBoundingClientRect(); S.playing = false; setTime(Math.round(graphDayAt(e.clientX - r.left, r.width) * 2) / 2); }
gr.addEventListener('pointerdown', graphPointer);
gr.addEventListener('pointermove', graphPointer);
function canvasPointer(e) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, hh = findHit(x, y);
  showTip(x, y, hh && hh.key, $('stage'));
}
cv.addEventListener('pointermove', canvasPointer);
cv.addEventListener('pointerdown', canvasPointer);
cv.addEventListener('pointerleave', () => showTip(0, 0, null));

let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // 最初のコマは now が last より前のことがある
  if (S.playing) { setTime(S.t + dt * S.speed); if (S.t >= SIM.tMax) S.playing = false; }
  draw();
  requestAnimationFrame(loop);
}
applyGuide(0);
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__hare = {
  S, draw, applyGuide, setTime: t => { setTime(t); draw(); },
  simRun(sec) { for (let i = 0; i < sec * 60; i++) { if (S.playing) setTime(S.t + S.speed / 60); } draw(); },
  set(o) { Object.assign(S, o); changed(true); draw(); },
  counts: () => S.scene.map(L => ({ lane: L.lane.id, ...L.count })),
};
