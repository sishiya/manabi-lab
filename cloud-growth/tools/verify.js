// 雲ができるまで — 物理の確かめ（node cloud-growth/tools/verify.js）
'use strict';
const path = require('path');
require(path.join(__dirname, '../js/thermo.js'));
require(path.join(__dirname, '../js/solver.js'));
const CT = globalThis.CT, makeSim = globalThis.makeSim;
let bad = 0;
function check(name, ok, detail) { console.log((ok ? 'OK  ' : 'NG  ') + name + (detail ? '  ' + detail : '')); if (!ok) bad++; }

// 1. 飽和蒸気圧（よく知られた値と比べる: 水 20℃ 2339 Pa、0℃ 611 Pa、氷 −20℃ 103 Pa）
check('水の飽和 20℃', Math.abs(CT.eswRaw(293.15) - 2339) < 15, CT.eswRaw(293.15).toFixed(1) + ' Pa');
check('水の飽和 0℃', Math.abs(CT.eswRaw(273.15) - 611.2) < 2, CT.eswRaw(273.15).toFixed(1) + ' Pa');
check('氷の飽和 −20℃', Math.abs(CT.esiRaw(253.15) - 103.2) < 1.5, CT.esiRaw(253.15).toFixed(1) + ' Pa');

// 2. 温度の逆算: h から T に戻せるか
{
  const z = 2000, p = 80000, T = 280, qs = CT.qstar(T, p), qn = 1e-3, qt = qs + qn, qp = 5e-4;
  const h = CT.cp * T + CT.g * z - CT.LnOf(T) * qn - CT.LpOf(T) * qp;
  const d = CT.diag(h, qt, qp, z, p, 270);
  check('h → T の逆算', Math.abs(d.T - T) < 0.01 && Math.abs(d.qn - qn) < 1e-6, `T=${d.T.toFixed(3)} qn=${(d.qn * 1e3).toFixed(4)}`);
}

// 3. 空気がじっとしているとき、何も起きない（静止大気の保存）
{
  const G0 = 0.0001;
  const sim = makeSim({ nx: 64, nz: 40, Lx: 12800, Lz: 8000, seed: false, micro: true, sounding: z => ({ theta: 300 * Math.exp(G0 * z / 9.81), rh: 0.3 }) });
  for (let i = 0; i < 200; i++) sim.step(2);
  let m = 0; for (const v of sim.w) m = Math.max(m, Math.abs(v));
  check('静止した空が動きださない', m < 1e-3, 'max|w|=' + m.toExponential(2));
}

// 4. Bryan & Fritsch 2002 の形: 飽和した空気の中の暖気塊。雨なし
//    基本の空は 相当温位が一定（θe=320K の湿潤断熱の空）、全水量 0.02。暖気塊 +2K（半径 2km・高さ 2km）。
//    論文の結果: 1000 s で最上部は約 8 km 近く（ここでは 6.5〜9 km を合格に）
{
  const qtBF = 0.02;
  const thetaE = 320;
  // 湿潤中立の空 = 保存量 h が高さによらず一定（このモデルの持ち上げの線そのもの）。地面の T は θe=320K から
  const pS = 1e5, Ts = (() => { let lo = 270, hi = 310; for (let i = 0; i < 50; i++) { const T = 0.5 * (lo + hi), qs = CT.qsw(T, pS); if (T * Math.exp(CT.Lv * qs / (CT.cp * T)) > thetaE) hi = T; else lo = T; } return 0.5 * (lo + hi); })();
  const hBF = CT.cp * Ts - CT.Lv * Math.max(0, qtBF - CT.qsw(Ts, pS));
  const sounding = (z, p) => ({ thl: (hBF - CT.g * z) / CT.cp / Math.pow(p / CT.p00, CT.KAP), qt: qtBF });
  // 飽和の式の違いで 雲が氷にならないよう 水だけの範囲で見る（高さ 10km まで）
  const sim = makeSim({ nx: 128, nz: 100, Lx: 20000, Lz: 10000, seed: false, micro: false, iceFall: false, sounding, force: {} });
  // BF02 の暖気塊は 温度そのものを +2K（飽和のまま）。qt は同じなので、そのぶん雲が減る → h には蒸発の熱も足す
  for (let k = 0; k < sim.nz; k++) for (let i = 0; i < sim.nx; i++) {
    const r = Math.hypot(((i + 0.5) * sim.dx - 10000) / 2000, (sim.zc[k] - 2000) / 2000);
    if (r >= 1) continue;
    const c = k * sim.nx + i, dT = 2 * Math.pow(Math.cos(Math.PI * r / 2), 2), T = sim.T[c], p = sim.pc[k];
    sim.h[c] += CT.cp * dT + CT.Lv * (CT.qsw(T + dT, p) - CT.qsw(T, p));
  }
  const q0 = (() => { let s = 0; for (let k = 0; k < sim.nz; k++) for (let i = 0; i < sim.nx; i++) s += sim.rhoc[k] * sim.qt[k * sim.nx + i]; return s; })();
  const e0 = (() => { let s = 0; for (let k = 0; k < sim.nz; k++) for (let i = 0; i < sim.nx; i++) s += sim.rhoc[k] * sim.h[k * sim.nx + i]; return s; })();
  let wMax = 0, t0 = Date.now(), nst = 0;
  while (sim.S.t < 1000) { sim.step(); nst++; for (let c = 0; c < sim.NW; c++) wMax = Math.max(wMax, sim.w[c]); }
  const ms = Date.now() - t0;
  // 暖気塊の上のふち: 保存量 h の差（中立の空では h は一様なので、暖気塊の空気だけが残る）が 0.5K ぶんより大きい いちばん上
  let top = 0;
  for (let k = sim.nz; k-- > 0;) { let f = false; for (let i = 0; i < sim.nx; i++) if (sim.h[k * sim.nx + i] - sim.h0[k] > 500) f = true; if (f) { top = sim.zc[k]; break; } }
  const q1 = (() => { let s = 0; for (let k = 0; k < sim.nz; k++) for (let i = 0; i < sim.nx; i++) s += sim.rhoc[k] * sim.qt[k * sim.nx + i]; return s; })();
  const e1 = (() => { let s = 0; for (let k = 0; k < sim.nz; k++) for (let i = 0; i < sim.nx; i++) s += sim.rhoc[k] * sim.h[k * sim.nx + i]; return s; })();
  check('水の保存', Math.abs(q1 / q0 - 1) < 1e-4, 'ずれ ' + ((q1 / q0 - 1) * 100).toExponential(2) + '%');
  check('エネルギーの保存', Math.abs(e1 / e0 - 1) < 1e-5, 'ずれ ' + ((e1 / e0 - 1) * 100).toExponential(2) + '%');
  check('BF02: 1000秒で 暖気塊が約8kmへ', top > 6500 && top < 9500, `上のふち ${(top / 1000).toFixed(2)} km, max w ${wMax.toFixed(1)} m/s`);
  console.log(`    (128×100 ${nst} 歩 ${ms} ms, 1歩 ${(ms / nst).toFixed(2)} ms)`);
}

// 5. 雨: 雲の水が雨になり、地面に落ちる
{
  const sim = makeSim({ nx: 32, nz: 40, Lx: 6400, Lz: 8000, seed: false, sounding: z => ({ theta: 300 + z * 0.006, rh: z > 1500 && z < 5000 ? 1.5 : 0.7 }), force: {} });
  const qtStart = (() => { let s = 0; for (let k = 0; k < sim.nz; k++) for (let i = 0; i < sim.nx; i++) s += sim.rhoc[k] * sim.qt[k * sim.nx + i] * sim.dz; return s / sim.nx; })();
  for (let i = 0; i < 2000; i++) sim.step(2);
  let q = 0; for (let k = 0; k < sim.nz; k++) for (let i = 0; i < sim.nx; i++) q += sim.rhoc[k] * (sim.qt[k * sim.nx + i] + sim.qp[k * sim.nx + i]) * sim.dz;
  q /= sim.nx;
  const rain = sim.rainCol.reduce((a, b) => a + b, 0) / sim.nx;
  check('雨が地面に届き 水がつじつまが合う', rain > 0 && Math.abs((q + rain) / qtStart - 1) < 2e-3, `地面に ${rain.toFixed(2)} mm, ずれ ${(((q + rain) / qtStart - 1) * 100).toFixed(3)}%`);
}

// 6. 山の波: 重力波の波長（一様な風と安定度なら λ = 2πU/N）
{
  const N = 0.012, U = 12;
  const sim = makeSim({ nx: 256, nz: 80, Lx: 64000, Lz: 16000, seed: false, micro: false, wind: () => U, terrain: { h: 400, a: 4000, x0: 20000 }, sounding: z => ({ theta: 290 * Math.exp(N * N * z / 9.81), rh: 0.1 }), force: { spongeTop: 5000, spongeSide: 8000, spongeTau: 80 } });
  while (sim.S.t < 7200) sim.step();
  // 山の風下でなく真上の鉛直波長: 2πU/N = 6.3km。w の山の風上側の列で符号の変わる間隔を測る
  const iC = Math.round(20000 / sim.dx);
  const w = []; for (let k = 2; k < sim.nz - 18; k++) { let m = 0; for (let i = iC - 2; i <= iC + 2; i++) m += sim.w[k * sim.nx + i]; w.push(m / 5); }
  const zeros = []; for (let k = 1; k < w.length; k++) if (w[k - 1] * w[k] < 0) zeros.push(sim.zf[k + 2]);
  const lamZ = zeros.length >= 3 ? (zeros[2] - zeros[0]) : NaN;
  check('山の波の縦の波長', lamZ > 4500 && lamZ < 8500, `計算 ${(lamZ / 1000).toFixed(2)} km, 理論 ${(2 * Math.PI * U / N / 1000).toFixed(2)} km`);
}

console.log(bad ? `NG ${bad} 件` : 'すべて OK');
process.exit(bad ? 1 : 0);
