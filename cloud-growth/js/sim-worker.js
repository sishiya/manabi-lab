// 雲ができるまで — 計算の Worker（進める・タイムバーの保存・画面へ送る）
'use strict';
importScripts('thermo.js?v=1', 'solver.js?v=1', 'scenes.js?v=1');
const { columnStats, classifyAll, bandName, SCENES } = self.CS;
const CT = self.CT;

const MAX_SNAPS = 90;
let sim = null, scene = null, running = false, speed = 60;
let snaps = [], snapEvery = 60, nextSnap = 0, viewIdx = -1;  // viewIdx>=0 は過去を見ている
let brush = null, humidNow = 0;
let lastFrame = 0, lastProf = 0, lastTick = 0, realSpeed = 0, rainPrev = 0, tPrev = 0, rainRate = 0;

function load(id) {
  scene = SCENES.find(s => s.id === id) || SCENES[0];
  sim = self.makeSim(scene);
  if (scene.init) scene.init(sim);
  sim.diagAll();
  speed = scene.speed; snaps = []; viewIdx = -1; brush = null; humidNow = 0; rainPrev = 0; tPrev = 0; rainRate = 0;
  snapEvery = scene.horizon / (MAX_SNAPS - 2); nextSnap = 0;
  saveSnap();
  running = true;
  postMessage({ type: 'meta', id: scene.id, nx: sim.nx, nz: sim.nz, dx: sim.dx, dz: sim.dz, z0: sim.z0, Lx: scene.Lx, Lz: scene.Lz, horizon: scene.horizon, speed, mask: sim.mask.slice(), z: sim.zc.slice() });
  sendFrame(true, true);
}
function saveSnap() { snaps.push(sim.snapshot()); nextSnap = sim.S.t + snapEvery; if (snaps.length >= MAX_SNAPS) { snaps = snaps.filter((_, i) => i % 2 === 0 || i === snaps.length - 1); snapEvery *= 2; nextSnap = snaps[snaps.length - 1].t + snapEvery; } }
function resumeFromView() { if (viewIdx >= 0) { snaps.length = viewIdx + 1; nextSnap = snaps[viewIdx].t + snapEvery; viewIdx = -1; rainPrev = sumRain(); tPrev = sim.S.t; } }
function sumRain() { let s = 0; for (let i = 0; i < sim.nx; i++) s += sim.rainCol[i]; return s / sim.nx; }

function sendFrame(force, prof) {
  const now = performance.now();
  if (!force && now - lastFrame < 33) return;
  lastFrame = now;
  const { nx, nz, N, qn, qp, T, w, qv, pc, mask, T0 } = sim;
  const A = new Float32Array(N * 4), B = new Float32Array(N * 4);
  let wMax = 0;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c = k * nx + i, o = c * 4, wc = 0.5 * (w[c] + w[c + nx]);
    A[o] = qn[c]; A[o + 1] = qp[c]; A[o + 2] = CT.omN(T[c]); A[o + 3] = mask[c];
    B[o] = wc; B[o + 1] = T[c] - T0[k]; B[o + 2] = qv[c] / Math.max(1e-9, CT.qstar(T[c], pc[k])); B[o + 3] = CT.omP(T[c]);
    if (Math.abs(wc) > wMax) wMax = Math.abs(wc);
  }
  const dtR = sim.S.t - tPrev;
  if (dtR > 300 || (viewIdx < 0 && dtR > scene.speed * 2)) { const r = sumRain(); rainRate = (r - rainPrev) / dtR * 3600; rainPrev = r; tPrev = sim.S.t; }
  const cols = columnStats(sim), cl = classifyAll(cols, sim, rainRate, wMax);
  const msg = { type: 'frame', A, B, t: sim.S.t, nSnap: snaps.length, times: null, viewIdx, running, cl, wMax, rainRate, realSpeed: running ? realSpeed : 0, totalRain: sumRain() };
  if (scene.bands) { const b = new Array(64); for (let j = 0; j < 64; j++) b[j] = bandName(cols[Math.floor((j + 0.5) / 64 * sim.nx)], rainRate); msg.bands = b; }
  if (prof || now - lastProf > 500) { lastProf = now; msg.prof = profile(); }
  const tr = [A.buffer, B.buffer];
  msg.times = snaps.map(s => s.t);
  postMessage(msg, tr);
}

// 高さごとの平均の気温と露点、地面の空気を持ち上げた線
function profile() {
  const { nx, nz, T, qv, zc, pc, kg } = sim;
  const n = nz, Ts = new Float32Array(n), Td = new Float32Array(n), Tp = new Float32Array(n), qcld = new Float32Array(n);
  let hs = 0, qs = 0, cnt = 0, lcl = null;
  for (let k = 0; k < n; k++) {
    let a = 0, b = 0, q = 0, m = 0; for (let i = 0; i < nx; i++) { const c = k * nx + i; if (sim.mask[c]) continue; a += T[c]; b += qv[c]; q += sim.qn[c] > 1e-5 ? 1 : 0; m++; }
    if (!m) continue;
    a /= m; b /= m; Ts[k] = a; qcld[k] = q / m;
    const e = Math.max(1e-3, b * pc[k] / (CT.EPS + b)), l = Math.log(e / 611.2);
    Td[k] = 243.5 * l / (17.67 - l) + 273.15;
  }
  if (sim.z0 === 0) {
    const k0 = Math.min(nz - 1, Math.round(100 / sim.dz));
    for (let k = 0; k <= k0; k++) for (let i = 0; i < nx; i++) { const c = k * nx + i; if (sim.mask[c]) continue; hs += sim.h[c] - CT.g * zc[k]; qs += sim.qt[c]; cnt++; }
    hs /= cnt; qs /= cnt;
    for (let k = 0; k < n; k++) { const d = CT.diag(hs + CT.g * zc[k], qs, 0, zc[k], pc[k], Ts[k]); Tp[k] = d.T; if (lcl === null && d.qn > 1e-6) lcl = zc[k]; }
  }
  return { Ts, Td, Tp: sim.z0 === 0 ? Tp : null, cover: qcld, lcl };
}

let simDebt = 0, spW = 0, spT = 0;
function tick() {
  const now = performance.now();
  if (running && sim && viewIdx < 0) {
    // 実時間のぶんだけ進める（1歩が大きいので、足りないぶんは次へ持ちこす。追いつけないときは捨てる）
    const dtReal = Math.min(0.1, (now - lastTick) / 1000);
    simDebt = Math.min(simDebt + speed * dtReal, speed * 0.25);
    const t0 = sim.S.t;
    while (simDebt > 0 && performance.now() - now < 24) {
      const dt = sim.step();
      simDebt -= dt;
      if (brush) {
        const rate = 2 / (1.5 * speed), rad = scene.Lz * 0.07;
        sim.paint(brush.x, brush.z, Math.max(rad, sim.dz * 3), brush.kind === 'wet' ? 'wet' : 'heat', brush.kind === 'wet' ? rate * 2e-3 : brush.kind === 'cool' ? -rate : rate, dt);
      }
      if (sim.S.t >= nextSnap) saveSnap();
      if (sim.S.t >= scene.horizon) { running = false; saveSnap(); break; }
    }
    if (!Number.isFinite(sim.h[sim.N >> 1])) { running = false; postMessage({ type: 'error', text: '計算が発散しました。はじめからやり直してください。' }); }
    spW += sim.S.t - t0; spT += performance.now() - lastTick;
    if (spT > 1000) { realSpeed = spW / (spT / 1000); spW = 0; spT = 0; }
    sendFrame(false, false);
  }
  lastTick = now;
  setTimeout(tick, 4);
}

onmessage = e => {
  const m = e.data;
  if (m.type === 'load') load(m.id);
  else if (!sim) return;
  else if (m.type === 'play') { if (sim.S.t < scene.horizon) { resumeFromView(); running = true; lastTick = performance.now(); } sendFrame(true); }
  else if (m.type === 'pause') { running = false; sendFrame(true); }
  else if (m.type === 'speed') { speed = m.v; }
  else if (m.type === 'seek') { running = false; const s = snaps[Math.max(0, Math.min(snaps.length - 1, m.i))]; sim.restore(s); viewIdx = snaps.indexOf(s); rainPrev = sumRain(); tPrev = sim.S.t; rainRate = 0; sendFrame(true, true); }
  else if (m.type === 'ctl') {
    if (m.key === 'heat') sim.ctl.heat = m.v;
    if (m.key === 'wind') sim.ctl.wind = m.v;
    if (m.key === 'humid') { const f = (1 + m.v) / (1 + humidNow) - 1; humidNow = m.v; resumeFromView(); sim.moistenAll(f, 1e9); sim.diagAll(); sendFrame(true, true); }
  } else if (m.type === 'brush') { brush = m.b; if (m.b && viewIdx >= 0) resumeFromView(); if (m.b && !running && sim.S.t < scene.horizon) { running = true; lastTick = performance.now(); } }
};
lastTick = performance.now();
tick();
