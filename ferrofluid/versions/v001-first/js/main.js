// 状態・1コマ・ループ・デバッグ用の窓口 window.__ff
'use strict';

const S = {
  src: 'large', gap: 10, mag: { x: 0, y: 0 }, coilB: 0,
  fluid: 'apg', depth: 4, tool: 'move', speed: 1,
  shapeDirty: true, t: 0, path: [], probe: null, coilWasSpiky: false,
  stats: { count: 0, spikeH: 0, Bmax: 0, mound: 0, tilt: 0, dent: 0 },
};
let lastShapeSrc = '';

function srcObj() {
  return S.src === 'coil' ? { kind: 'coil', B: S.coilB / 1000 } : { kind: 'magnet', mg: MAGNETS[S.src], x: S.mag.x, y: S.mag.y, gap: S.gap };
}
function setSrc(v) {
  S.src = v;
  if (v !== 'coil' && !MAGNETS[v].tab) buildTable(MAGNETS[v]);
  if (v !== 'coil') setMagnetMesh(MAGNETS[v]);
  S.shapeDirty = true; syncUI();
}
function setFluid(v) { S.fluid = v; S.shapeDirty = true; S.path.length = 0; syncUI(); }
function setCoil(b) {
  b = Math.round(Math.max(0, Math.min(30, b)) * 10) / 10;
  S.coilWasSpiky = S.stats.count >= 5;   // 変える前にトゲが立っていたか（立ちはじめの判定に使う）
  S.coilB = b; S.shapeDirty = true; syncUI();
}
function probeCell(x, y) {
  const i = Math.floor((x + SPAN / 2) / DXG), j = Math.floor((y + SPAN / 2) / DXG);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1;
  const k = j * N + i; return F.inDish[k] ? k : -1;
}

function tauShape(f) { return 0.05 + 0.25 * Math.sqrt(f.eta / 0.12); }   // 液が動く時間の目安（s）
// トゲが育つ時間の目安（s。ε=1 のとき e 倍になる時間）。粘りの強い液の目安 2ηk/(ρg)（APG512a で 0.0125 s）
function tauSpike(f) { return Math.max(0.006, 2 * f.eta * (2 * Math.PI / (lambdaC(f) * 1e-3)) / (f.rho * G)); }

// 1コマ進める（dt は実時間の秒）
function step(dt) {
  const f = FLUIDS[S.fluid], src = srcObj(), sdt = dt * S.speed;
  if (S.shapeDirty) { solveShape(src, f, S.depth); S.shapeDirty = false; }
  if (S.pokeAt) poke(S.pokeAt.x, S.pokeAt.y, 3.5);
  const a = 1 - Math.exp(-sdt / tauShape(f)), dd = Math.exp(-sdt / 0.35);   // へこみは指を離すと戻る
  for (let k = 0; k < NN; k++) { F.h0[k] += (F.h0eq[k] - F.h0[k]) * a; F.dent[k] *= dd; }
  updateField(src, f);
  if (f.magnetic) {
    let T = sdt / tauSpike(f);
    // 1コマに解く回数は 24 回まで（早送りで重くなりすぎないように。それ以上はゆっくりになる）
    const n = Math.min(24, Math.ceil(T / 0.35));
    for (let i = 0; i < n; i++) shStep(f, Math.min(0.35, T / n));
  } else F.u.fill(0);
  S.t += sdt;
}

// トゲを数える（模様 u の山。半径 4 マスの中でいちばん高く、六角形の振幅の 1/4 を超えるもの）
function countSpikes() {
  const f = FLUIDS[S.fluid]; let n = 0, tilt = 0;
  if (!f.magnetic) return { n, tilt };
  const u = F.u, Rr = 4;
  for (let j = Rr; j < N - Rr; j++) for (let i = Rr; i < N - Rr; i++) {
    const k = j * N + i; if (!F.inDish[k]) continue;
    const v = u[k], e = Math.min(F.eps[k], SH.EPSMAX);
    if (v < 9 * ampSH(Math.max(e, EPS_SUB)) * 0.25 || v < 0.02) continue;
    let top = true;
    for (let b = -Rr; b <= Rr && top; b++) for (let a = -Rr; a <= Rr; a++) {
      if ((a || b) && a * a + b * b <= Rr * Rr && u[k + b * N + a] > v) { top = false; break; }
    }
    if (!top) continue;
    n++;
    tilt = Math.max(tilt, Math.atan2(Math.hypot(F.Bx[k], F.By[k]), F.Bz[k]) * 180 / Math.PI);   // 磁場の傾き（度）
  }
  return { n, tilt };
}
function updateStats(spikeH) {
  const st = S.stats, c = countSpikes();
  st.count = c.n; st.tilt = c.tilt; st.spikeH = spikeH;
  let bm = 0, hm = 0, hmin = 1e9;
  for (let k = 0; k < NN; k++) if (F.inDish[k]) {
    const b = Math.hypot(F.Bx[k], F.By[k], F.Bz[k]); if (b > bm) bm = b;
    if (F.h0[k] > hm) hm = F.h0[k]; if (F.h0[k] < hmin) hmin = F.h0[k];
  }
  st.Bmax = bm; st.mound = hm; st.dent = Math.max(0, S.depth - hmin);
}

let frameNo = 0, lastT = 0, lastPath = 0;
function frame(now) {
  try {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
    resizeIfNeeded();
    step(dt);
    drawOnly();
  } catch (e) { window.__ffErr = window.__ffErr || []; window.__ffErr.push(String(e && e.stack || e)); console.error(e); }
  requestAnimationFrame(frame);
}
function drawOnly() {
  const f = FLUIDS[S.fluid];
  const m = updateFluidMesh(f);
  renderView(srcObj());
  if (++frameNo % 6 === 0) {
    updateStats(m.spikeH);
    updateReadout(S.stats);
    checkQuests(S.stats);
    probeText(S.probe);
    if (S.src === 'coil' && f.magnetic && S.t - lastPath > 0.25) {
      lastPath = S.t;
      const p = [S.coilB, S.stats.count >= 3 ? S.stats.spikeH : 0], q = S.path[S.path.length - 1];
      if (!q || Math.abs(q[0] - p[0]) > 0.01 || Math.abs(q[1] - p[1]) > 0.1) { S.path.push(p); if (S.path.length > 500) S.path.shift(); }
      drawChart();
    }
  }
}
let cw = 0, ch = 0;
function resizeIfNeeded() {
  const fr = document.getElementById('frame'), w = fr.clientWidth, h = fr.clientHeight;
  if (w !== cw || h !== ch) { cw = w; ch = h; if (w > 0 && h > 0) resizeView(w, h); }
}

function init() {
  initView(document.getElementById('view'));
  buildTable(MAGNETS.large); setMagnetMesh(MAGNETS.large);
  buildUI();
  // 開いたときに、もうトゲが立っているように少し進めておく
  for (let i = 0; i < 90; i++) step(1 / 30);
  resizeIfNeeded(); const m = updateFluidMesh(FLUIDS[S.fluid]); updateStats(m.spikeH); updateReadout(S.stats);
  requestAnimationFrame(frame);
}

window.__ff = {
  S, F, FLUIDS, MAGNETS, step, frame: drawOnly, setSrc, setFluid, setCoil, bcFormula, bcUsed, lambdaC, ampPhys, countSpikes,
  advance(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) step(dt); const m = updateFluidMesh(FLUIDS[S.fluid]); renderView(srcObj()); updateStats(m.spikeH); updateReadout(S.stats); return S.stats; },
  get err() { return window.__ffErr; },
};
init();
