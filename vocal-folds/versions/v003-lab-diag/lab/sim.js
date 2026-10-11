// 声帯の震えを時間で解く（技術検証用）。Zhang (2015) 付録 A〜E の式どおり。Node でもブラウザでも動く。
// 入力: fem.js の buildModel の結果（面の節点・面積・モードの形・固有角振動数）。
// 運動方程式: q_i'' + σ ω_i q_i' + ω_i² q_i = Q_i（モードは質量で正規化、σ = 損失係数 0.4）。
// 流れ: 1次元・準定常。いちばんせまい所の 1.2 倍の面積ではがれ、その先は大気圧。声道はなし。
// 接触: 中心線をこえた分 d に pc = kc1 ω1² d (1 + kc2 ω1² d²)（kc1=600, kc2=6000）。
// 時間: 4次のルンゲ・クッタ、1/44100 秒きざみ。息の圧は 30 きざみで 0 から目標へ。
(function (root) {
'use strict';
const RHO_AIR = 1.2, MU_AIR = 1.8e-5;

function makeSim(model, opt) {
  opt = Object.assign({ Ps: 800, sigma: 0.4, kc1: 600, kc2: 6000, fs: 44100, noise: true, Recrit: 1200, nY: 64, seed: 1 }, opt || {});
  const nm = model.omega.length, nn = model.nodes;
  const { pos, area, phi, lines, nK } = model;
  const om = Float64Array.from(model.omega);
  const L = model.info.g.L;
  // 前後の断面ごとの幅の重み（台形）
  const wz = new Float64Array(nK);
  for (let k = 0; k < nK; k++) wz[k] = L / (nK - 1) * (k === 0 || k === nK - 1 ? 0.5 : 1);
  // 高さのものさし（流れの1次元の格子）
  const T = model.info.g.T;
  const yLo = -Math.max(2.5e-3, 1.0 * T), yHi = T + 2.0e-3;
  const nY = opt.nY, dy = (yHi - yLo) / (nY - 1);
  const Ay = new Float64Array(nY), py = new Float64Array(nY);
  const X = new Float64Array(nn), Y = new Float64Array(nn);
  const q = new Float64Array(nm), v = new Float64Array(nm);
  const k1 = [new Float64Array(nm), new Float64Array(nm)], k2 = [new Float64Array(nm), new Float64Array(nm)],
    k3 = [new Float64Array(nm), new Float64Array(nm)], k4 = [new Float64Array(nm), new Float64Array(nm)];
  const qt = new Float64Array(nm), vt = new Float64Array(nm), Qg = new Float64Array(nm);
  const fx = new Float64Array(nn), fy = new Float64Array(nn), fz = new Float64Array(nn);
  let seed = opt.seed; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  const dt = 1 / opt.fs;
  const w1 = om[0];
  const out = { Q: 0, Amin: 0, Aj: 0, ysep: 0, closed: false, contact: 0, pc: 0 };
  let PsNow = 0, step = 0, noiseNow = 0;

  function positions(qq) {
    for (let i = 0; i < nn; i++) { X[i] = pos[3 * i]; Y[i] = pos[3 * i + 1]; }
    for (let r = 0; r < nm; r++) {
      const a = qq[r]; if (a === 0) continue;
      const base = r * nn * 3;
      for (let i = 0; i < nn; i++) { X[i] += a * phi[base + 3 * i]; Y[i] += a * phi[base + 3 * i + 1]; }
    }
  }
  // 高さ y での声帯の内側の位置（断面 k の線から、y を横切る所のいちばん内側）
  function areaProfile() {
    Ay.fill(0);
    for (let k = 0; k < nK; k++) {
      const Lk = lines[k], w = 2 * wz[k];
      for (let jy = 0; jy < nY; jy++) {
        const y = yLo + jy * dy;
        let xm = Infinity;
        for (let s = 0; s + 1 < Lk.length; s++) {
          const a = Lk[s], b = Lk[s + 1];
          const ya = Y[a], yb = Y[b];
          if ((ya - y) * (yb - y) > 0) continue;
          const t = ya === yb ? 0 : (y - ya) / (yb - ya);
          const x = X[a] + t * (X[b] - X[a]);
          if (x < xm) xm = x;
        }
        if (xm === Infinity) xm = 1e-2; // 線が届かない高さ（ほぼない）
        if (xm > 0) Ay[jy] += w * xm;
      }
    }
  }
  function forces(qq, Qout) {
    positions(qq);
    areaProfile();
    // いちばんせまい所
    let jmin = 0; for (let j = 1; j < nY; j++) if (Ay[j] < Ay[jmin]) jmin = j;
    const Amin = Ay[jmin];
    const Ps = PsNow;
    let closed = Amin <= 1e-12, ysep = yHi, Aj = 0, uj = 0;
    if (!closed) {
      Aj = 1.2 * Amin;
      let js = nY - 1;
      for (let j = jmin + 1; j < nY; j++) if (Ay[j] >= Aj) { js = j; break; }
      ysep = yLo + js * dy;
      uj = Math.sqrt(2 * Math.max(Ps, 0) / RHO_AIR);
      for (let j = 0; j < nY; j++) {
        const y = yLo + j * dy;
        py[j] = y <= ysep ? 0.5 * RHO_AIR * uj * uj * (1 - (Aj * Aj) / Math.max(Ay[j] * Ay[j], 1e-30)) : 0;
      }
    } else {
      const yc = yLo + jmin * dy; ysep = yc;
      for (let j = 0; j < nY; j++) py[j] = (yLo + j * dy) < yc ? Ps : 0;
    }
    // 節点の力
    let cArea = 0, pcMax = 0;
    for (let i = 0; i < nn; i++) {
      const y = Y[i];
      let p;
      if (opt.loadBelow != null && pos[3 * i + 1] < opt.loadBelow) p = 0; // 診断用: この高さより下の面には圧をかけない
      else if (y <= yLo) p = closed ? Ps : 0.5 * RHO_AIR * uj * uj * (1 - (Aj * Aj) / Math.max(1e-30, Ay[0] * Ay[0]));
      else if (y >= yHi) p = 0;
      else { const f = (y - yLo) / dy, j = Math.min(nY - 2, f | 0), t = f - j; p = py[j] * (1 - t) + py[j + 1] * t; }
      let fxi = -p * area[3 * i], fyi = -p * area[3 * i + 1], fzi = -p * area[3 * i + 2];
      if (X[i] < 0) {
        const d = -X[i];
        const pc = opt.kc1 * w1 * w1 * d * (1 + opt.kc2 * w1 * w1 * d * d);
        fxi += pc * Math.abs(area[3 * i]);
        cArea += Math.abs(area[3 * i]); if (pc > pcMax) pcMax = pc;
      }
      fx[i] = fxi; fy[i] = fyi; fz[i] = fzi;
    }
    for (let r = 0; r < nm; r++) {
      const base = r * nn * 3; let s = 0;
      for (let i = 0; i < nn; i++) s += phi[base + 3 * i] * fx[i] + phi[base + 3 * i + 1] * fy[i] + phi[base + 3 * i + 2] * fz[i];
      Qout[r] = s;
    }
    out.Amin = Math.max(0, Amin); out.Aj = Aj; out.ysep = ysep; out.closed = closed; out.contact = cArea; out.pc = pcMax;
    // 流量（雑音つき。Zhang 2015 式 A9）
    let Q = Aj * uj;
    if (opt.noise && !closed) {
      const Re = uj * Aj / (L * (MU_AIR / RHO_AIR));
      if (Re > opt.Recrit) Q += 1e-12 * noiseNow * (Re * Re - opt.Recrit * opt.Recrit);
    }
    out.Q = Math.max(0, Q);
  }
  function deriv(qq, vv, dq, dv) {
    forces(qq, Qg);
    for (let r = 0; r < nm; r++) { dq[r] = vv[r]; dv[r] = Qg[r] - opt.sigma * om[r] * vv[r] - om[r] * om[r] * qq[r]; }
  }
  function advance() {
    PsNow = opt.Ps * Math.min(1, (step + 1) / 30);
    noiseNow = rnd();
    deriv(q, v, k1[0], k1[1]);
    for (let r = 0; r < nm; r++) { qt[r] = q[r] + 0.5 * dt * k1[0][r]; vt[r] = v[r] + 0.5 * dt * k1[1][r]; }
    deriv(qt, vt, k2[0], k2[1]);
    for (let r = 0; r < nm; r++) { qt[r] = q[r] + 0.5 * dt * k2[0][r]; vt[r] = v[r] + 0.5 * dt * k2[1][r]; }
    deriv(qt, vt, k3[0], k3[1]);
    for (let r = 0; r < nm; r++) { qt[r] = q[r] + dt * k3[0][r]; vt[r] = v[r] + dt * k3[1][r]; }
    deriv(qt, vt, k4[0], k4[1]);
    for (let r = 0; r < nm; r++) {
      q[r] += dt / 6 * (k1[0][r] + 2 * k2[0][r] + 2 * k3[0][r] + k4[0][r]);
      v[r] += dt / 6 * (k1[1][r] + 2 * k2[1][r] + 2 * k3[1][r] + k4[1][r]);
    }
    forces(q, Qg); // 記録用に、進めたあとの状態で
    step++;
    return out;
  }
  // 秒数ぶん計算して、流量・最小面積・閉じているか・音を返す
  function run(seconds) {
    const n = Math.round(seconds * opt.fs);
    const Q = new Float32Array(n), A = new Float32Array(n), C = new Float32Array(n);
    for (let i = 0; i < n; i++) { const o = advance(); Q[i] = o.Q; A[i] = o.Amin; C[i] = o.contact; }
    // 30cm での音（単極の音源）: p = ρ/(4π r) dQ/dt
    const p = new Float32Array(n);
    for (let i = 1; i < n; i++) p[i] = RHO_AIR / (4 * Math.PI * 0.3) * (Q[i] - Q[i - 1]) * opt.fs;
    return { Q, A, C, p, fs: opt.fs };
  }
  return { advance, run, forces, setPs: v => { PsNow = v; }, q, v, X, Y, positions, out, opt, get step() { return step; } };
}

const api = { makeSim, RHO_AIR };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VFsim = api;
})(typeof self !== 'undefined' ? self : this);
