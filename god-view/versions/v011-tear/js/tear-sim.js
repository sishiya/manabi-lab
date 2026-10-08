// tear-sim.js — 段階H「地球をちぎる」の計算。SPH（粒子法の流体）で、地球を約 1.6 万個の粒にして
// 重力・圧力・粘り（人工粘性）・温度を計算する。画面の部品とは切りはなして、数の配列だけを扱う（単位はすべて SI）。
//   密度は連続の式で追いかける（表面で密度が足りなくなる SPH のくせを避ける）。圧力は Murnaghan の状態方程式。
//   重力は「地球」と「ちぎったかけら」の 2 つのかたまりそれぞれについて、中心からの距離より内側の質量で計算する（球対称の近似）。
//   温度 = はじめの温度 ×（いまの密度 ÷ はじめの密度）^γ（断熱の変化）＋ 人工粘性の仕事で出た熱 ÷ 比熱。
'use strict';

(function () {
  const GV = self.GV;            // Worker の中でも動くように window ではなく self
  const G = 6.674e-11;
  const R_ICB = 1.2215e6, R_CMB = 3.48e6, R_E = 6.371e6;    // 内核・外核の境目、核とマントルの境目、地球の半径（PREM）
  // 状態方程式 P = K0/Kp·((ρ/ρ0)^Kp − 1)。PREM の密度（マントルの底 5.6、外核 9.9〜12.2、内核 12.8〜13.1 g/cm³）に近くなるように選んだ値（推定）
  const MAT = [
    { key: 'mantle', rho0: 3500, K0: 160e9, Kp: 4.0, cp: 1200, gam: 1.2 },
    { key: 'outer', rho0: 6100, K0: 90e9, Kp: 4.0, cp: 800, gam: 1.5 },
    { key: 'inner', rho0: 7800, K0: 170e9, Kp: 4.5, cp: 800, gam: 1.5 },
  ];
  const matAt = r => r < R_ICB ? 2 : r < R_CMB ? 1 : 0;
  const rhoOfP = (M, P) => M.rho0 * Math.pow(1 + M.Kp * Math.max(0, P) / M.K0, 1 / M.Kp);

  // ---------- 静水圧のつり合い（はじめの密度の分布） ----------
  // 中心の圧力 Pc から外へ積分して、圧力が 0 になる所が地表。地表が 6371 km になる Pc を二分法で探す
  function integrate(Pc, dr) {
    let r = dr * 0.5, m = 0, P = Pc;
    const rs = [], rhos = [], Ps = [];
    while (P > 0 && r < 9e6) {
      const rho = rhoOfP(MAT[matAt(r)], P);
      rs.push(r); rhos.push(rho); Ps.push(P);
      m += 4 * Math.PI * r * r * rho * dr;
      P -= G * m * rho / (r * r) * dr;
      r += dr;
    }
    return { R: r, M: m, rs, rhos, Ps, dr };
  }
  function hydrostatic() {
    let lo = 1e11, hi = 1e12, best = null;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2, p = integrate(mid, 5e3);
      if (p.R > R_E) hi = mid; else lo = mid;
      best = p;
    }
    best.Pc = (lo + hi) / 2;
    best.at = r => { const i = Math.max(0, Math.min(best.rs.length - 1, Math.round(r / best.dr - 0.5))); return { rho: best.rhos[i], P: best.Ps[i] }; };
    return best;
  }

  // ---------- はじめの温度（推定） ----------
  // マントル: 地表 15℃ → 深さ 100 km で 1600 K（岩石圏）、その下は断熱（ポテンシャル温度 1600 K）、核との境目の 200 km は 3800 K へ上がる。
  // 外核: 核とマントルの境目 4000 K から断熱。内核 5400 K。
  function temp0(r, rho, hs) {
    const d = R_E - r;
    if (r >= R_CMB) {
      const rhoTop = hs.at(R_E - 1e5).rho;
      let T = d < 1e5 ? 288 + (1600 - 288) * d / 1e5 : 1600 * Math.pow(rho / rhoTop, MAT[0].gam);
      if (r < R_CMB + 2e5) T += (3800 - T) * (1 - (r - R_CMB) / 2e5);   // 境目のすぐ上（核は 約 4000 K）
      return T;
    }
    if (r >= R_ICB) return 4000 * Math.pow(rho / hs.at(R_CMB - 1e3).rho, MAT[1].gam);
    return 5400;
  }

  // マントルの溶けはじめる温度（ソリダス、K）: 低い圧力は Hirschmann 2000、高い圧力は Fiquet ほか 2010 を直線でつないだ近似（推定）
  const SOL = [[0, 1393], [5, 1931], [10, 2213], [25, 2600], [60, 3300], [136, 4180], [400, 6000]];
  function solidus(P) {
    const g = P / 1e9;
    for (let k = 1; k < SOL.length; k++) if (g <= SOL[k][0]) {
      const a = SOL[k - 1], b = SOL[k];
      return a[1] + (b[1] - a[1]) * (g - a[0]) / (b[0] - a[0]);
    }
    return 6000;
  }
  const MELT_SPAN = 500 + 6e5 / 1200;      // 溶けきるまで: ソリダスと液相線の差 約 500 K ＋ 溶けるのに使う熱（潜熱 6×10^5 J/kg ÷ 比熱）

  // ---------- 粒の地球を作る ----------
  function create(N) {
    const hs = hydrostatic();
    const s = R_E * Math.cbrt(4 / 3 * Math.PI / N);           // 粒の間隔
    const h = 1.1 * s;                                         // なめらかさの長さ（2h の内側を近所とする）
    const pts = [];
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    const n = Math.ceil(R_E / s) + 1;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) {
      const x = (i + 0.5 + rnd() * 0.1) * s, y = (j + 0.5 + rnd() * 0.1) * s, z = (k + 0.5 + rnd() * 0.1) * s;
      if (x * x + y * y + z * z < R_E * R_E) pts.push(x, y, z);
    }
    const np = pts.length / 3;
    const S = {
      n: np, s, h, hs, t: 0, Mtot: 0,
      x: new Float64Array(pts), v: new Float64Array(3 * np), a: new Float64Array(3 * np),
      m: new Float64Array(np), rho: new Float64Array(np), drho: new Float64Array(np), P: new Float64Array(np), c: new Float64Array(np),
      mat: new Uint8Array(np), T0: new Float64Array(np), rhoI: new Float64Array(np), q: new Float64Array(np), dq: new Float64Array(np),
      sh: new Float64Array(np), grp: new Uint8Array(np), surf: new Uint8Array(np), lat: new Float32Array(np), lon: new Float32Array(np),
      hand: null, chunkFree: false, noCross: false,
    };
    for (let i = 0; i < np; i++) {
      const x = S.x[3 * i], y = S.x[3 * i + 1], z = S.x[3 * i + 2], r = Math.hypot(x, y, z);
      const mt = matAt(r), at = hs.at(r);
      S.mat[i] = mt; S.rho[i] = at.rho; S.m[i] = at.rho * s * s * s; S.Mtot += S.m[i];
      S.T0[i] = temp0(r, at.rho, hs);
      S.surf[i] = r > R_E - 0.9 * s ? 1 : 0;
      S.lat[i] = Math.asin(z / r) * 180 / Math.PI; S.lon[i] = Math.atan2(y, x) * 180 / Math.PI;
    }
    eos(S);
    return S;
  }

  function eos(S) {
    for (let i = 0; i < S.n; i++) {
      const M = MAT[S.mat[i]], r = S.rho[i] / M.rho0;
      const P = M.K0 / M.Kp * (Math.pow(r, M.Kp) - 1);
      S.P[i] = Math.max(0, P);
      S.c[i] = Math.sqrt((M.K0 + M.Kp * S.P[i]) / S.rho[i]);
    }
  }

  // ---------- 重力（2 つのかたまり、それぞれ球対称の近似） ----------
  const NB = 256;
  const binM = [new Float64Array(NB + 1), new Float64Array(NB + 1)];
  function gravity(S) {
    const com = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < S.n; i++) {
      const g = com[S.grp[i]], m = S.m[i];
      g[0] += m * S.x[3 * i]; g[1] += m * S.x[3 * i + 1]; g[2] += m * S.x[3 * i + 2]; g[3] += m;
    }
    const rmax = [0, 0];
    for (const g of com) if (g[3] > 0) { g[0] /= g[3]; g[1] /= g[3]; g[2] /= g[3]; }
    for (let i = 0; i < S.n; i++) {
      const g = com[S.grp[i]], d = Math.hypot(S.x[3 * i] - g[0], S.x[3 * i + 1] - g[1], S.x[3 * i + 2] - g[2]);
      if (d > rmax[S.grp[i]]) rmax[S.grp[i]] = d;
    }
    const dr = [rmax[0] * 1.001 / NB + 1, rmax[1] * 1.001 / NB + 1];
    for (let c = 0; c < 2; c++) binM[c].fill(0);
    for (let i = 0; i < S.n; i++) {
      const c = S.grp[i], g = com[c], d = Math.hypot(S.x[3 * i] - g[0], S.x[3 * i + 1] - g[1], S.x[3 * i + 2] - g[2]);
      binM[c][Math.min(NB - 1, Math.floor(d / dr[c])) + 1] += S.m[i];
    }
    for (let c = 0; c < 2; c++) for (let b = 1; b <= NB; b++) binM[c][b] += binM[c][b - 1];   // binM[c][b] = b 番目の殻より内側の質量
    const menc = (c, d) => {
      const f = d / dr[c];
      if (f >= NB) return binM[c][NB];
      const b = Math.floor(f), w = f - b;
      return binM[c][b] + (binM[c][b + 1] - binM[c][b]) * w;
    };
    const soft2 = S.h * S.h * 0.25;
    for (let i = 0; i < S.n; i++) {
      for (let c = 0; c < 2; c++) {
        if (com[c][3] <= 0) continue;
        if (S.noCross && c !== S.grp[i]) continue;            // かけらを遠くへ運んだときは、地球とかけらの引き合いを切る
        const g = com[c];
        const dx = g[0] - S.x[3 * i], dy = g[1] - S.x[3 * i + 1], dz = g[2] - S.x[3 * i + 2];
        const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2);
        if (d < 1) continue;
        const k = G * menc(c, d) / ((d2 + soft2) * d);
        S.a[3 * i] += k * dx; S.a[3 * i + 1] += k * dy; S.a[3 * i + 2] += k * dz;
      }
    }
    S.com = com;
  }

  // ---------- SPH の力（1 回の近所さがしで、密度の変化・加速度・熱・表面の目印をまとめて） ----------
  // 近所さがし: 一辺 2h の升目に粒を分け、自分の升目と「前向きの」13 個の升目だけを見る（同じ組を 2 回数えない）。
  // 速さのため、計算の前に粒を升目の順に並べた作業用の配列へ写し、終わったら書き戻す（メモリを順に読めるように）
  const ALPHA = 1.0, BETA = 2.0;
  const FWD = [];
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++)
    if (ox > 0 || (ox === 0 && (oy > 0 || (oy === 0 && oz > 0)))) FWD.push([ox, oy, oz]);
  let cellStart = new Int32Array(1), cellOf = null, order = null, W8 = null;

  function forces(S) {
    const n = S.n, h = S.h, cell = 2 * h, x = S.x, H4 = 4 * h * h, h2e = 0.01 * h * h;
    const sig = 1 / (Math.PI * h * h * h), sigh = sig / h;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const X = x[3 * i], Y = x[3 * i + 1], Z = x[3 * i + 2];
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
    }
    const nx = Math.floor((x1 - x0) / cell) + 1, ny = Math.floor((y1 - y0) / cell) + 1, nz = Math.floor((z1 - z0) / cell) + 1, nc = nx * ny * nz;
    if (cellStart.length < nc + 1) cellStart = new Int32Array(nc + 1);
    if (!cellOf || cellOf.length < n) {
      cellOf = new Int32Array(n); order = new Int32Array(n);
      W8 = {}; for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'ax', 'ay', 'az', 'm', 'rho', 'pr', 'c', 'dr', 'dq', 'sh']) W8[k] = new Float64Array(n);
    }
    cellStart.fill(0, 0, nc + 1);
    for (let i = 0; i < n; i++) {
      const c = (Math.floor((x[3 * i] - x0) / cell) * ny + Math.floor((x[3 * i + 1] - y0) / cell)) * nz + Math.floor((x[3 * i + 2] - z0) / cell);
      cellOf[i] = c; cellStart[c + 1]++;
    }
    for (let c = 0; c < nc; c++) cellStart[c + 1] += cellStart[c];
    const fill = cellStart.slice(0, nc);
    for (let i = 0; i < n; i++) order[fill[cellOf[i]]++] = i;
    const { px, py, pz, vx, vy, vz, ax, ay, az, m, rho, pr, c, dr, dq, sh } = W8;
    for (let k = 0; k < n; k++) {
      const i = order[k];
      px[k] = x[3 * i]; py[k] = x[3 * i + 1]; pz[k] = x[3 * i + 2];
      vx[k] = S.v[3 * i]; vy[k] = S.v[3 * i + 1]; vz[k] = S.v[3 * i + 2];
      m[k] = S.m[i]; rho[k] = S.rho[i]; pr[k] = S.P[i] / (S.rho[i] * S.rho[i]); c[k] = S.c[i];
      ax[k] = ay[k] = az[k] = dr[k] = dq[k] = 0; sh[k] = m[k] / rho[k] * sig;
    }
    const pair = (i, j) => {
      const dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j];
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 >= H4 || r2 === 0) return;
      const r = Math.sqrt(r2), q = r / h;
      let W, dW;
      if (q < 1) { W = sig * (1 - 1.5 * q * q + 0.75 * q * q * q); dW = sigh * (-3 * q + 2.25 * q * q); }
      else { const t = 2 - q; W = sig * 0.25 * t * t * t; dW = -sigh * 0.75 * t * t; }
      const F = dW / r, mi = m[i], mj = m[j];
      const vr = (vx[i] - vx[j]) * dx + (vy[i] - vy[j]) * dy + (vz[i] - vz[j]) * dz;
      let Pi = 0;
      if (vr < 0) {
        const mu = h * vr / (r2 + h2e);
        Pi = (-ALPHA * 0.5 * (c[i] + c[j]) * mu + BETA * mu * mu) / (0.5 * (rho[i] + rho[j]));
        const hq = 0.5 * Pi * vr * F;
        dq[i] += mj * hq; dq[j] += mi * hq;
      }
      const f = (pr[i] + pr[j] + Pi) * F, fi = mj * f, fj = mi * f;
      ax[i] -= fi * dx; ay[i] -= fi * dy; az[i] -= fi * dz;
      ax[j] += fj * dx; ay[j] += fj * dy; az[j] += fj * dz;
      dr[i] += mj * vr * F; dr[j] += mi * vr * F;
      sh[i] += mj / rho[j] * W; sh[j] += mi / rho[i] * W;
    };
    for (let cx = 0; cx < nx; cx++) for (let cy = 0; cy < ny; cy++) for (let cz = 0; cz < nz; cz++) {
      const cc = (cx * ny + cy) * nz + cz, s0 = cellStart[cc], s1 = cellStart[cc + 1];
      if (s0 === s1) continue;
      for (let f = 0; f < 13; f++) {
        const X = cx + FWD[f][0], Y = cy + FWD[f][1], Z = cz + FWD[f][2];
        if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
        const d = (X * ny + Y) * nz + Z, d0 = cellStart[d], d1 = cellStart[d + 1];
        if (d0 === d1) continue;
        for (let i = s0; i < s1; i++) for (let j = d0; j < d1; j++) pair(i, j);
      }
      for (let i = s0; i < s1; i++) for (let j = i + 1; j < s1; j++) pair(i, j);
    }
    for (let k = 0; k < n; k++) {
      const i = order[k];
      S.a[3 * i] = ax[k]; S.a[3 * i + 1] = ay[k]; S.a[3 * i + 2] = az[k];
      S.drho[i] = dr[k]; S.dq[i] = dq[k]; S.sh[i] = sh[k];
    }
    gravity(S);
    // ちぎる手: つかんだ粒をばねで手の位置へ
    const Hd = S.hand;
    if (Hd) {
      const k = Hd.omega * Hd.omega, cd = 2 * Hd.omega, a = S.a, v = S.v;
      for (const i of Hd.ids) {
        const o = Hd.off.get(i);
        for (let d = 0; d < 3; d++) a[3 * i + d] += k * (Hd.pos[d] + o[d] - x[3 * i + d]) + cd * (Hd.vel[d] - v[3 * i + d]);
      }
    }
  }

  function timestep(S) {
    let vmax = 0, amax = 0;
    for (let i = 0; i < S.n; i++) {
      const vv = S.c[i] + Math.hypot(S.v[3 * i], S.v[3 * i + 1], S.v[3 * i + 2]);
      if (vv > vmax) vmax = vv;
      const aa = Math.hypot(S.a[3 * i], S.a[3 * i + 1], S.a[3 * i + 2]);
      if (aa > amax) amax = aa;
    }
    return Math.min(30, 0.3 * S.h / vmax, 0.25 * Math.sqrt(S.h / Math.max(amax, 1e-9)));
  }

  // 1 歩（KDK のかえる跳び）。damp はつり合いを作るときだけ（速さを毎歩へらす）
  function step(S, damp) {
    if (!S.a0) { forces(S); S.a0 = true; }
    const dt = S.dt = timestep(S), n = S.n, x = S.x, v = S.v, a = S.a;
    for (let i = 0; i < 3 * n; i++) { v[i] += 0.5 * dt * a[i]; x[i] += dt * v[i]; }
    for (let i = 0; i < n; i++) {
      S.rho[i] = Math.max(0.5 * MAT[S.mat[i]].rho0, S.rho[i] + dt * S.drho[i]);
      S.q[i] = Math.max(0, S.q[i] + dt * S.dq[i]);
    }
    eos(S);
    forces(S);
    for (let i = 0; i < 3 * n; i++) v[i] += 0.5 * dt * a[i];
    if (damp) for (let i = 0; i < 3 * n; i++) v[i] *= damp;
    S.t += dt;
    return dt;
  }

  // つり合いの形にならす（はじめの格子から、SPH と重力がつり合う並びへ）。少しずつ進めて、画面が固まらないように
  async function relax(S, steps, onProgress) {
    for (let k = 0; k < steps; k++) {
      step(S, k < steps * 0.7 ? 0.9 : 0.97);
      if (k % 10 === 9) { onProgress && onProgress((k + 1) / steps); await new Promise(r => setTimeout(r, 0)); }
    }
    S.v.fill(0); S.q.fill(0); S.t = 0;
    for (let i = 0; i < S.n; i++) S.rhoI[i] = S.rho[i];
    S.a0 = false;
  }

  // ---------- 読み出し ----------
  function temperature(S, i) {
    const M = MAT[S.mat[i]];
    return S.T0[i] * Math.pow(S.rho[i] / S.rhoI[i], M.gam) + S.q[i] / M.cp;
  }
  function meltFrac(S, i) {
    if (S.mat[i] === 1) return 1;                   // 外核はもともと液体
    if (S.mat[i] === 2) return 0;
    return Math.max(0, Math.min(1, (temperature(S, i) - solidus(S.P[i])) / MELT_SPAN));
  }
  function copy(S) {     // つり合いの形を覚えておく（「もとに戻す」で使う）
    const o = {};
    for (const k of ['x', 'v', 'rho', 'q', 'rhoI', 'grp']) o[k] = S[k].slice();
    return o;
  }
  function restore(S, o) {
    for (const k in o) S[k].set(o[k]);
    S.t = 0; S.hand = null; S.chunkFree = false; S.noCross = false; S.a0 = false;
    eos(S);
  }

  GV.TearSim = { create, relax, step, temperature, meltFrac, solidus, copy, restore, eos, R_E, R_CMB, R_ICB, MAT, G };
})();
