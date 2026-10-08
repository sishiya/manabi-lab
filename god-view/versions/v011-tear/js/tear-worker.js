// tear-worker.js — 「地球をちぎる」の計算を裏で回す（画面が固まらないように）。tear-sim.js を読み込んで使う。
// 画面（tear.js）とのやりとり:
//   受け取る: init {N} / grab {point, Rg} / hand {pos} / release {mode: 'drop'|'away'} / free / run {on} / speed {v} / reset / ack
//   送る: progress {f} / ready {静的な値} / frame {位置・温度・溶け・表面の目印・大きさ・かたまり, stats}
'use strict';
self.GV = {};
importScripts('tear-sim.js');
const T = self.GV.TearSim;
let S = null, base = null, running = false, speed = 60, ready = false, wantFrame = true;
let budget = 0, lastReal = 0, tTear = null, grabInfo = null, melt0 = 0;

function stats() {
  // 地球（かたまり 0）の中心
  let cx = 0, cy = 0, cz = 0, M = 0, vmax = 0, melt = 0, mm = 0, heat = 0;
  for (let i = 0; i < S.n; i++) {
    if (S.grp[i]) continue;
    const m = S.m[i];
    cx += m * S.x[3 * i]; cy += m * S.x[3 * i + 1]; cz += m * S.x[3 * i + 2]; M += m;
    const v = Math.hypot(S.v[3 * i], S.v[3 * i + 1], S.v[3 * i + 2]);
    if (v > vmax) vmax = v;
    if (S.mat[i] === 0) { melt += T.meltFrac(S, i) * m; mm += m; }
    const dT = S.q[i] / T.MAT[S.mat[i]].cp;
    if (dT > heat) heat = dT;
  }
  cx /= M; cy /= M; cz /= M;
  // 穴の深さ: つかんだ向き u の線の近く（粒 1 個分）で、いちばん外にある地球の粒 ↔ 反対側の同じ測り方の半径
  let depth = 0;
  if (grabInfo) {
    const u = grabInfo.u;
    let top = 0, opp = 0;
    for (let i = 0; i < S.n; i++) {
      if (S.grp[i]) continue;
      const dx = S.x[3 * i] - cx, dy = S.x[3 * i + 1] - cy, dz = S.x[3 * i + 2] - cz;
      const al = dx * u[0] + dy * u[1] + dz * u[2];
      const lat2 = dx * dx + dy * dy + dz * dz - al * al;
      if (lat2 > S.s * S.s) continue;
      if (al > top) top = al;
      if (-al > opp) opp = -al;
    }
    depth = Math.max(0, opp - top);
  }
  return { t: S.t, tTear: tTear === null ? null : S.t - tTear, com: [cx, cy, cz], vmax, meltPct: 100 * melt / mm, melt0Pct: melt0, heat, depth, torn: tTear !== null, dt: S.dt || 0 };
}

function sendFrame() {
  const n = S.n, pos = new Float32Array(3 * n), temp = new Float32Array(n), melt = new Float32Array(n), sh = new Float32Array(n), size = new Float32Array(n), grp = new Uint8Array(n);
  for (let i = 0; i < 3 * n; i++) pos[i] = S.x[i];
  for (let i = 0; i < n; i++) {
    temp[i] = T.temperature(S, i); melt[i] = T.meltFrac(S, i); sh[i] = S.sh[i];
    size[i] = Math.cbrt(S.m[i] / S.rho[i]); grp[i] = S.grp[i];
  }
  self.postMessage({ type: 'frame', pos, temp, melt, sh, size, grp, stats: stats() }, [pos.buffer, temp.buffer, melt.buffer, sh.buffer, size.buffer, grp.buffer]);
  wantFrame = false;
}

// 手は、画面で指した所（goal）へ速さの上限つきで近づく（速すぎると、かけらで地球をかきまわして異常に熱くなるため）。
// 近づくほどゆっくりにして、着いたときに止まるように。遠くへ運び終えたら手をはなす
function moveHand(dt) {
  const H = S.hand;
  if (!H || !H.goal) return;
  const d = [H.goal[0] - H.pos[0], H.goal[1] - H.pos[1], H.goal[2] - H.pos[2]], L = Math.hypot(d[0], d[1], d[2]);
  const v = Math.min(H.vmax, L / 200);
  for (let k = 0; k < 3; k++) { H.vel[k] = L > 0 ? d[k] / L * v : 0; H.pos[k] += H.vel[k] * dt; }
  if (L < 600e3 && H.path && H.path.length) H.goal = H.path.shift();    // 途中の点では止まらずに次へ
  else if (H.park && L < 30e3) { S.hand = null; S.a0 = false; }
}
// 運ぶ道すじ: まず地球の中心から外へ（半径の 2.2 倍）離してから、同じ高さのまま置き場所へ回りこむ。
// 一直線に運ぶと地球の表面をかすめて、地面をけずり飛ばしてしまう（v011 の作業中に発生）
function parkPath(goal) {
  const c = stats().com, R = 14e6, H = S.hand;
  const away = p => { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], L = Math.hypot(d[0], d[1], d[2]) || 1; return d.map((v, k) => c[k] + v / L * Math.max(R, L)); };
  const a = away(H.pos), b = away(goal);
  const mid = away([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  const q1 = away([(a[0] + mid[0]) / 2, (a[1] + mid[1]) / 2, (a[2] + mid[2]) / 2]), q2 = away([(mid[0] + b[0]) / 2, (mid[1] + b[1]) / 2, (mid[2] + b[2]) / 2]);
  return [a, q1, mid, q2, b, goal];
}

function loop() {
  if (!ready) return;
  const now = performance.now();
  if (running) {
    budget += (now - lastReal) / 1000 * (S.hand && tTear === null ? Math.max(speed, 300) : speed);   // 引っぱっているあいだ（ちぎれるまで）は速めに
    const t0 = performance.now();
    while (budget > 0 && performance.now() - t0 < 45) {
      moveHand(S.dt || 10);
      const dt = T.step(S, 0);
      budget -= dt;
      if (tTear === null && grabInfo && S.hand) {
        // ちぎれた: つかんだかけらの中心が、つかんだ点から かけらの半径の 0.45 倍より離れた
        let gx = 0, gy = 0, gz = 0, gm = 0;
        for (const i of S.hand.ids) { gx += S.m[i] * S.x[3 * i]; gy += S.m[i] * S.x[3 * i + 1]; gz += S.m[i] * S.x[3 * i + 2]; gm += S.m[i]; }
        const p = grabInfo.c0;
        if (Math.hypot(gx / gm - p[0], gy / gm - p[1], gz / gm - p[2]) > 0.45 * grabInfo.Rg) { tTear = S.t; self.postMessage({ type: 'torn' }); }
      }
    }
    if (speed < 1e6) budget = Math.min(budget, 3 * (S.dt || 10));   // 追いつけないときは、ためこまない（ゆっくりになる）
    else budget = 0;
  }
  lastReal = now;
  if (wantFrame) sendFrame();
  setTimeout(loop, running ? 0 : 30);
}

self.onmessage = async e => {
  const d = e.data;
  if (d.cmd === 'init') {
    S = T.create(d.N || 16000);
    self.postMessage({ type: 'static', n: S.n, s: S.s, mat: S.mat, surf: S.surf, lat: S.lat, lon: S.lon, R: T.R_E });
    await T.relax(S, 300, f => self.postMessage({ type: 'progress', f }));
    let melt = 0, mm = 0;
    for (let i = 0; i < S.n; i++) if (S.mat[i] === 0) { melt += T.meltFrac(S, i) * S.m[i]; mm += S.m[i]; }
    melt0 = 100 * melt / mm;
    base = T.copy(S);
    ready = true; lastReal = performance.now();
    self.postMessage({ type: 'ready' });
    loop();
  } else if (!ready) return;
  else if (d.cmd === 'ack') wantFrame = true;
  else if (d.cmd === 'grab') {
    if (grabInfo) return;                                    // ちぎるのは 1 回だけ（もう一度は「もとに戻す」から）
    const p = d.point, ids = [], off = new Map();
    let cx = 0, cy = 0, cz = 0, M = 0;
    for (let i = 0; i < S.n; i++) { cx += S.m[i] * S.x[3 * i]; cy += S.m[i] * S.x[3 * i + 1]; cz += S.m[i] * S.x[3 * i + 2]; M += S.m[i]; }
    cx /= M; cy /= M; cz /= M;
    for (let i = 0; i < S.n; i++) {
      const dx = S.x[3 * i] - p[0], dy = S.x[3 * i + 1] - p[1], dz = S.x[3 * i + 2] - p[2];
      if (dx * dx + dy * dy + dz * dz < d.Rg * d.Rg) { ids.push(i); off.set(i, [dx, dy, dz]); S.grp[i] = 1; }
    }
    if (!ids.length) return;
    const ul = Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz);
    let gx = 0, gy = 0, gz = 0, gm = 0;
    for (const i of ids) { gx += S.m[i] * S.x[3 * i]; gy += S.m[i] * S.x[3 * i + 1]; gz += S.m[i] * S.x[3 * i + 2]; gm += S.m[i]; }
    grabInfo = { u: [(p[0] - cx) / ul, (p[1] - cy) / ul, (p[2] - cz) / ul], Rg: d.Rg, c0: [gx / gm, gy / gm, gz / gm], count: ids.length, mass: gm };
    S.hand = { ids, off, pos: p.slice(), goal: p.slice(), vel: [0, 0, 0], omega: 0.04, vmax: 8000 };
    S.a0 = false;
    running = true; lastReal = performance.now(); budget = 0;
    self.postMessage({ type: 'grabbed', count: ids.length, mass: gm, u: grabInfo.u });
  } else if (d.cmd === 'hand') { if (S.hand && !S.hand.park) S.hand.goal = d.pos; }
  else if (d.cmd === 'release') {
    if (!S.hand) return;
    if (d.mode === 'drop') {
      S.hand = null; S.a0 = false;
      if (tTear === null) { S.grp.fill(0); grabInfo = null; }   // ちぎれる前にはなした: つかむ前と同じ（もう一度つまめる）
    }
    else {                                                   // 遠くへ運ぶ: 地球とかけらの引き合いを切って、手で goal まで運んではなす
      S.noCross = true;
      const path = parkPath(d.goal);
      Object.assign(S.hand, { goal: path.shift(), path, park: true, vmax: 15000 });
    }
  }
  else if (d.cmd === 'run') { running = d.on; lastReal = performance.now(); budget = 0; }
  else if (d.cmd === 'speed') { speed = d.v; budget = 0; }
  else if (d.cmd === 'reset') {
    T.restore(S, base);
    S.grp.fill(0);
    grabInfo = null; tTear = null; running = false; budget = 0;
    wantFrame = true;
  }
};
