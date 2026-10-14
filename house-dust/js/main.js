// ほこりが積もるまで — メイン（時間を進める・1時間ごとの記録と巻きもどし・描画ループ・デバッグ用の窓口）
'use strict';
window.__hoduErr = [];
window.addEventListener('error', e => window.__hoduErr.push(String(e.message)));

const T0 = 7 * 3600;   // 1日目の朝7時から
const S = {
  t: T0, speed: 60, playing: true,
  window: false, vent: true, ac: false, purifier: false,
  routine: true, manual: 'sit', spring: false, shoes: false, hepa: false, showFlow: true,
  sel: null, selPlace: '床', events: [],
};
const H = { t0: T0, snaps: [], series: [], nextSnap: T0, nextSer: T0 };
let flowKey = '', flowAcc = 0;

function initBed() {   // シーツを洗って3日目のふとん（3晩ぶんの皮ふと繊維。推定）
  const night = 8 * 3600;
  for (let b = 0; b < NB; b++) {
    D.bed[di(SI.skin, b)] = 3 * night * EMIT.skinShed * EMIT.skinBed * SPLIT.skin[b];
    D.bed[di(SI.fiber, b)] = 3 * night * EMIT.bedFiberNight * SPLIT.fiber[b];
  }
  D.tot.emit[SI.skin] += 3 * night * EMIT.skinShed * EMIT.skinBed;
  D.tot.emit[SI.fiber] += 3 * night * EMIT.bedFiberNight;
}

function configKey() { return [S.window, S.vent, S.ac, S.purifier].join(); }
function ensureFaces() {
  const k = configKey();
  if (k !== flowKey) { flowKey = k; setupFaces(S); }
}

// 時間を simDt 秒進める（1コマぶん）
function advance(simDt) {
  const dtMax = S.speed <= 10 ? 0.2 : S.speed <= 60 ? 0.5 : Math.max(2, simDt / 60);
  const n = Math.max(1, Math.ceil(simDt / dtMax)), dt = simDt / n;
  let flowBudget = 3;
  for (let q = 0; q < n; q++) {
    lifeStep(dt, S);
    ensureFaces();
    JETS = buildJets(S);
    flowAcc += dt;
    while (flowAcc >= FLOW_DT && flowBudget > 0) { flowStep(FLOW_DT); flowAcc -= FLOW_DT; flowBudget--; }
    if (flowBudget === 0) flowAcc = Math.min(flowAcc, FLOW_DT);
    const T = PS.task;
    D.stir = Math.max(PS.state === 'walk' ? 0.4 : 0, S.ac ? 1 : 0, T && T.type === 'vacuum' ? 1 : 0, S.window ? 0.5 : 0);
    D.lamWin = S.window ? windowInflow() / D.V : 0;
    // 窓から入る外の粒（大きい粒は点で）
    if (S.window) {
      const q = windowInflow() * dt;   // m³
      const wy = (WINDOW.j0 + (WINDOW.j1 - WINDOW.j0) * 0.25) * DX;
      emit('win', 0.04, wy, SI.soil, [0, 0, 0, SPLIT.soilAir[3], SPLIT.soilAir[4], 0], q * OUTDOOR.soilAir, 0.2);
      emit('win', 0.04, wy, SI.pollen, SPLIT.pollen, q * (S.spring ? OUTDOOR.pollenSpring : OUTDOOR.pollenOther), 0.2);
    }
    if (S.vent) {   // 給気口から（フィルターを通った分）
      const q = flowInfo.qVent * dt, vy = (VENT.j0 + 0.5) * DX;
      emit('vent', 0.04, vy, SI.soil, [0, 0, 0, SPLIT.soilAir[3] * VENT_PASS[3], SPLIT.soilAir[4] * VENT_PASS[4], 0], q * OUTDOOR.soilAir, 0.02);
      emit('vent', 0.04, vy, SI.pollen, SPLIT.pollen, q * (S.spring ? OUTDOOR.pollenSpring : OUTDOOR.pollenOther) * VENT_PASS_POLLEN, 0.02);
    }
    stepParticles(dt, S);
    stepBox(dt, S);
    windResuspend(dt);
    flushPending();
    S.t += dt;
    if (S.t >= H.nextSer) { recordSeries(); H.nextSer += 600; }
    if (S.t >= H.nextSnap) { takeSnap(); H.nextSnap += 3600; }
  }
  tuneDots();
}

// ---------- 記録 ----------
function recordSeries() {
  const bp = byPlace(), a = airborne(), p = { t: S.t, fine: a.fine, coarse: a.coarse };
  for (const o of CHART_PLACES) p[o.p] = bp[o.p] ? bp[o.p].gm2 : 0;
  H.series.push(p);
}
function takeSnap() {
  const dep = new Float32Array(FACES.length * NS * NB);
  FACES.forEach((F, f) => dep.set(F.dep, f * NS * NB));
  const tot = {}; for (const k in D.tot) tot[k] = Float64Array.from(D.tot[k]);
  H.snaps.push({
    t: S.t, dep, box: Float64Array.from(D.box), bed: Float64Array.from(D.bed), tot,
    pn: P.n, px: P.x.slice(0, P.n), py: P.y.slice(0, P.n), pm: P.m.slice(0, P.n), ps_: P.s.slice(0, P.n), pb: P.b.slice(0, P.n),
    pend: [...D.pend.entries()].map(([k, v]) => [k, { ...v }]),
    ps: { x: PS.x, dir: PS.dir, lastAct: PS.lastAct, turnT: PS.turnT, task: PS.task ? { ...PS.task } : null },
    st: { window: S.window, vent: S.vent, ac: S.ac, purifier: S.purifier, routine: S.routine, manual: S.manual },
    nev: S.events.length,
  });
  if (H.snaps.length > 24 * 30) H.snaps.splice(1, 1);   // 30日をこえたら古いものから（最初は残す）
  const tl = $('tl'); tl.max = H.snaps.length - 1; tl.value = H.snaps.length - 1;
  $('tlInfo').textContent = `${H.snaps.length - 1} 時間ぶん記録`;
}
function restoreSnap(idx) {
  const sn = H.snaps[idx]; if (!sn) return;
  FACES.forEach((F, f) => { for (let k = 0; k < NS * NB; k++) F.dep[k] = sn.dep[f * NS * NB + k]; });
  D.box.set(sn.box); D.bed.set(sn.bed); for (const k in sn.tot) D.tot[k].set(sn.tot[k]);
  P.n = sn.pn; P.x.set(sn.px); P.y.set(sn.py); P.m.set(sn.pm); P.s.set(sn.ps_); P.b.set(sn.pb); P.age.fill(0, 0, P.n);
  D.pend = new Map(sn.pend.map(([k, v]) => [k, { ...v }]));
  Object.assign(PS, sn.ps); PS.task = sn.ps.task ? { ...sn.ps.task } : null;
  Object.assign(S, sn.st);
  S.t = sn.t; S.events.length = sn.nev;
  H.snaps.length = idx + 1; H.series = H.series.filter(p => p.t <= S.t);
  H.nextSnap = S.t + 3600; H.nextSer = S.t + 600;
  $('tl').max = idx; $('tl').value = idx; $('tlInfo').textContent = `${idx} 時間ぶん記録（ここから試しなおし）`;
  ensureFaces(); syncUI(S);
}
function restartSim() {
  dustReset(); initBed();
  Object.assign(PS, { x: 1.7, state: 'walk', dir: 1, task: null, lastAct: null, turnT: 0 });
  S.t = T0; S.events.length = 0;
  H.snaps.length = 0; H.series.length = 0; H.nextSnap = T0; H.nextSer = T0;
  takeSnap(); recordSeries(); H.nextSnap += 3600; H.nextSer += 600;
  syncUI(S);
}

// ---------- ループ ----------
let last = performance.now(), frameN = 0;
function loop(now) {
  const dtR = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (S.playing && dtR > 0) advance(dtR * S.speed);
  frame();
  requestAnimationFrame(loop);
}
function frame() {
  drawScene(S);
  updateReadout(S);
  if (frameN++ % 6 === 0) { drawTimeline(S, H); drawChart(S, H); syncUI(S); }
}

buildRoom();
dustReset();
initBed();
buildUI(S, H);
ensureFaces();
JETS = buildJets(S);
for (let k = 0; k < 200; k++) flowStep(FLOW_DT);
{ const F = FACES.find(F => F.place === '床' && F.x > 1.6); S.sel = { x: F.x, y: F.y + 0.01, f: FACES.indexOf(F) }; }
takeSnap(); recordSeries(); H.nextSnap += 3600; H.nextSer += 600;
syncUI(S);
fitView();
window.addEventListener('resize', fitView);
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__hodu = {
  S, D, P, PS, H, FACES, BINS,
  simRun(sec) { const ch = S.speed / 60; for (let t = 0; t < sec; t += ch) advance(Math.min(ch, sec - t)); frame(); },
  balance: massBalance, byPlace, airborne, maxDiv,
  act(type) { startTask(type, S); }, set(k, v) { S[k] = v; syncUI(S); },
  restart: restartSim, restore: restoreSnap,
};
