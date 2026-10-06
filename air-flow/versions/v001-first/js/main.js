// ================= state, changes, main loop, debug =================
'use strict';
const AGE_CAP = 48 * 3600;   // ages stop growing here (closed-off air)
const S = {
  st: {}, wind: [270, 2], circs: [], scene: null,
  mode: 'age', particles: true, pSpeed: 1, speed: 60, paused: false, tool: 'touch',
  net: null, stats: null, smokeOn: false, iters: 0, t: 0, tChange: 0, fill: null, hover: null,
};

function setState(key, v) {
  S.st[key] = v;
  netChanged(DOORS.some(d => d.key === key));
}
// something that changes how much air moves (states, wind) or where it can go (doors)
function netChanged(faces) {
  if (faces) { buildFaces(S.st); }
  S.net = solveNet(S.st, S.wind, zoneOf, nZones);
  applyNet(S.net);
  S.tChange = S.t;
  syncUI();
}

// jets: circulators, air conditioners, and the push of air coming in through open windows
function jets() {
  const J = [];
  for (const q of S.circs) if (q.lv) J.push({ x: q.x + Math.cos(q.ang * Math.PI / 180) * CIRC_D * .3, y: q.y + Math.sin(q.ang * Math.PI / 180) * CIRC_D * .3, ang: q.ang, speed: CIRC_SPEED[q.lv], width: CIRC_D, len: .2, k: 1 });
  for (const a of ACS) { const lv = S.st[a.key] | 0; if (lv) J.push({ x: a.x, y: a.y, ang: a.ang, speed: AC_SPEED[lv], width: a.w, len: .25, k: 1 }); }
  for (const it of S.net.items) {
    if (it.type !== 'open' || it.q <= 0) continue;
    const ys = it.cells.map(c => ((c / W) | 0) * DX + DX / 2), y = ys.reduce((a, b) => a + b) / ys.length;
    const W_ = it.el.facade === 'W';
    J.push({ x: W_ ? 0.7 : 8.9, y, ang: W_ ? 0 : 180, speed: Math.min(3, it.q / it.area), width: (ys.length) * DX, len: .25, k: .5 });
  }
  return J;
}

function loadScene(key) {
  const sc = SCENES.find(s => s.key === key);
  S.scene = sc; S.st = Object.assign({}, sc.st); S.wind = sc.wind.slice();
  S.circs = (sc.circs || []).map(q => Object.assign({}, q));
  S.pSpeed = key === '24h' || key === 'hood' ? 10 : 1;
  u.fill(0); v.fill(0); psi.fill(0); smoke.fill(0); S.fill = null; S.smokeOn = false;
  netChanged(true);
  prewarm();
  S.t = 0; S.tChange = -1e9;   // start from the settled state
  $('hint').innerHTML = sc.hint; $('nowText').innerHTML = sc.now;
  syncUI(); updateReadout(); drawChart();
}
// run the flow until it settles, then age the air by four days in two implicit steps so the picture starts settled
function prewarm() {
  for (let k = 0; k < 240; k++) flowStep(jets());
  age.fill(0);
  buildCoef(DX / 172800);
  for (let k = 0; k < 2; k++) transport(age, DX / 172800, 1, 800, AGE_CAP);   // two implicit 2-day steps ≈ settled
}

// ---------- loop ----------
let last = performance.now(), frame = 0, flowCap = 3;
function step(simDt) {
  if (simDt <= 0) return;
  // the flow runs at most flowCap × 0.05 s per frame (about 9× real time); faster settings advance only age and smoke
  const nF = Math.max(1, Math.min(flowCap, Math.round(simDt / DT)));
  const dF = Math.min(DT, simDt / nF);
  const J = jets();
  for (let k = 0; k < nF; k++) flowStep(J, dF);
  // implicit steps no longer than about 1/6 of the time the house takes to change its air
  const tau = S.stats && isFinite(S.stats.tau) ? S.stats.tau : 3600;
  const nT = Math.min(2, Math.max(1, Math.ceil(simDt / (Math.max(20, tau) / 6)))), dA = simDt / nT;
  buildCoef(DX / dA);
  for (let k = 0; k < nT; k++) {
    S.iters = transport(age, DX / dA, 1, 30, AGE_CAP, 1e-5);
    if (S.smokeOn) transport(smoke, DX / dA, 0, 30, 1, 1e-5);
  }
  S.t += simDt;
}
function loop(now) {
  try {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (dt > 0.03 && flowCap > 1) flowCap--; else if (dt < 0.02 && flowCap < 3) flowCap++;
    step(S.paused ? 0 : dt * S.speed);
    moveParticles(S.paused ? 0 : dt * S.pSpeed);
    drawFrame(now, S.paused ? 0 : dt);
    if (frame % 10 === 0) updateReadout();
    if (frame % 15 === 0) $('timeCap').textContent = `経過 ${clock(S.t)}`;
    frame++;
  } catch (err) { window.__afErr = err; console.error(err); }
  requestAnimationFrame(loop);
}
function clock(t) { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }

// ---------- start ----------
try {
  buildPlan();
  buildFaces({});
  initParticles();
  buildUI();
  new ResizeObserver(() => { fit(); }).observe($('frame'));
  fit();
  updateLegend(); updateSpeedCap();
  loadScene('24h');
} catch (err) { window.__afErr = err; console.error(err); }

// debug: advance simulated seconds without frames; checks
window.__af = {
  S, u, v, age, smoke, src, exch, cell, zoneOf, ROOMS, loadScene, setState, netChanged, maxDiv, houseStats, jets,
  advance(sec, speed = S.speed) { const n = Math.ceil(sec / (speed / 30)); for (let k = 0; k < n; k++) step(speed / 30); updateReadout(); drawFrame(performance.now(), 0); },
  frame() { drawFrame(performance.now(), 0); },
  get err() { return window.__afErr; },
};
requestAnimationFrame(loop);
