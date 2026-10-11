// 3つのおもりの声帯の模型（体部と表層）と、筋肉から値を決める決まり、気管・声道の音の伝わり。
// もと: LeTalker 1.22（Brad Story, University of Arizona）の MATLAB のコードを、式・係数・計算の順番を変えずに JavaScript に書き直したもの。
//   模型: Story & Titze (1995) J. Acoust. Soc. Am. 97, 1249–1260
//   筋肉の決まり: Titze & Story (2002) J. Acoust. Soc. Am. 112, 1064–1076（rules_consconv.m・calc_stress.m）
//   圧と流れ: Titze (2002)・Titze (1984)（calc_pressures.m・calcflow.m）
//   声道の形: Story, Titze & Hoffman (1996)（bs_origvowels.mat）。気管: LeTalkerTrachea.mat
// 単位は LeTalker と同じ cgs（cm・g・s、圧は dyn/cm²。1 Pa = 10 dyn/cm²）。
// 書き直しで足したもの（LeTalker にはない）: 外側筋（LCA）の値を変えられる窓口（LeTalker は 0.5 で固定）、
//   女性・子どもの大きさ（下の PRESETS。女性の Lo=1.0 は LeTalker の中のコメント、それ以外は推定）。
(function (root) {
'use strict';

// LeTalkerTrachea.mat（気管。32区間、声門から遠い側 → 声門のすぐ下）
const TRACH = [2.2381, 2.1100, 2.0948, 2.1539, 2.2567, 2.3812, 2.5132, 2.6431, 2.7630, 2.8728, 2.9688, 3.0520, 3.1224, 3.1780, 3.2201, 3.2450, 3.2500, 3.2321, 3.1849, 3.1048, 2.9862, 2.8250, 2.6164, 2.3613, 2.0620, 1.7264, 1.3660, 1.0040, 0.6698, 0.4051, 0.3398, 0.3132];
// bs_origvowels.mat（Story, Titze & Hoffman 1996。44区間、声門の側 → 唇）
const VOWELS = {
  ii: [0.466, 0.329, 0.301, 0.358, 0.344, 0.645, 0.522, 1.948, 3.229, 2.752, 2.457, 3.111, 3.788, 3.757, 4.119, 4.545, 4.406, 4.570, 4.696, 4.224, 4.184, 3.797, 3.281, 2.499, 1.807, 1.557, 1.262, 0.887, 0.475, 0.331, 0.268, 0.097, 0.094, 0.216, 0.225, 0.249, 0.427, 0.229, 0.397, 0.700, 1.642, 2.057, 2.007, 1.582],
  eh: [0.387, 0.224, 0.133, 0.141, 0.180, 0.035, 0.356, 1.168, 1.254, 1.181, 0.868, 0.729, 0.725, 1.135, 1.785, 1.957, 2.394, 2.675, 2.857, 3.031, 2.921, 2.793, 2.903, 2.657, 2.230, 2.139, 1.941, 1.770, 1.817, 1.795, 1.519, 1.379, 1.359, 1.411, 1.601, 2.070, 2.253, 2.682, 2.416, 1.985, 2.590, 2.641, 2.186, 1.600],
  aa: [0.563, 0.462, 0.207, 0.270, 0.214, 0.327, 0.322, 0.377, 1.075, 1.076, 0.769, 0.620, 0.393, 0.291, 0.218, 0.283, 0.300, 0.290, 0.298, 0.497, 0.900, 1.170, 1.248, 1.905, 2.376, 2.704, 2.865, 2.895, 3.445, 4.350, 4.967, 5.678, 6.591, 6.309, 6.285, 6.051, 5.363, 4.818, 3.915, 4.099, 4.249, 4.271, 4.673, 5.027],
  oo: [0.202, 0.181, 0.169, 0.233, 0.292, 0.662, 1.555, 1.547, 1.009, 0.821, 1.241, 3.149, 2.311, 1.969, 1.855, 1.652, 1.650, 1.410, 1.292, 1.455, 1.062, 0.962, 1.427, 1.233, 0.885, 0.535, 0.401, 0.352, 0.402, 0.904, 1.264, 1.989, 2.854, 3.528, 4.292, 5.095, 6.956, 7.223, 4.839, 2.891, 1.559, 0.705, 0.395, 0.144],
  uu: [0.378, 0.399, 0.358, 0.294, 0.464, 0.786, 2.295, 3.037, 2.579, 2.166, 2.878, 5.471, 5.736, 5.449, 4.817, 4.559, 4.224, 3.537, 3.324, 3.164, 3.363, 2.853, 2.060, 2.122, 1.756, 0.932, 0.290, 0.145, 0.216, 0.223, 0.394, 0.640, 0.766, 1.058, 2.134, 2.407, 2.911, 4.634, 4.578, 2.274, 0.775, 0.340, 0.114, 0.172],
};
// filter_coeffs.mat（息の乱れの雑音の帯域フィルタ）
const NOISE_CA = [1, -3.4331, 4.4547, -2.6020, 0.5806], NOISE_CB = [0.0289, 0, -0.0578, 0, 0.0289];

// 体の大きさ。male = LeTalker の InitializeLeTalker.m そのまま。
// female: Lo=1.0 は LeTalker のコメント（「cadaveric rest length for female」）。ほかは男性と同じ（LeTalker どおり）。
// child: LeTalker にない。Zhang (2021) の子ども／大人の男性の比（長さ 6/17、厚み 1/3、体部の深さ 4/8）で縮めた推定。
const PRESETS = {
  male: { Lo: 1.6, To: 0.3, Dmo: 0.4, Dlo: 0.2, Dco: 0.2, src: 'LeTalker 1.22 の値' },
  female: { Lo: 1.0, To: 0.3, Dmo: 0.4, Dlo: 0.2, Dco: 0.2, src: '長さだけ LeTalker のコメントの女性の値。ほかは男性と同じ' },
  child: { Lo: 1.6 * 6 / 17, To: 0.3 / 3, Dmo: 0.4 * 0.5, Dlo: 0.2 * 0.5, Dco: 0.2, src: '推定: Zhang (2021) の子どもと大人の男性の大きさの比で縮めた' },
};

function constants(sex) {
  const s = PRESETS[sex] || PRESETS.male;
  return { mu: 5000, mub: 5000, muc: 5000, rho: 1.04, R: 3.0, G: 0.2, H: 0.2, Lo: s.Lo, To: s.To, Dmo: s.Dmo, Dlo: s.Dlo, Dco: s.Dco, zeta: 0.1 };
}

// calc_stress.m
function calcStress(p) {
  const ep1 = [-0.5, -0.5, -0.5], ep2 = [-0.35, 0.0, -0.05];
  const sig0 = [5000, 4000, 10000], sig2 = [300000, 13930, 15000], Ce = [4.4, 17, 6.5];
  const strs = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const lin = (-sig0[i] / ep1[i]) * (p.eps - ep1[i]);
    const nln = p.eps > ep2[i] ? sig2[i] * (Math.exp(Ce[i] * (p.eps - ep2[i])) - 1 - Ce[i] * (p.eps - ep2[i])) : 0;
    strs[i] = lin + nln;
  }
  p.sigmuc = strs[0]; p.sigl = strs[1]; p.sigp = strs[2];
}

// rules_consconv.m（Titze & Story 2002 の決まり。式の番号は論文の番号）
function rules(p, c) {
  p.eps = c.G * (c.R * p.act - p.ata) - c.H * p.alc;          // strain (55)
  p.L = c.Lo * (1 + p.eps);                                    // vibrating length
  p.T = c.To / (1 + 0.8 * p.eps);                              // thickness (59)
  p.Db = (p.ata * c.Dmo + 0.5 * c.Dlo) / (1 + 0.2 * p.eps);    // depth (60)
  p.Dc = (c.Dco + 0.5 * c.Dlo) / (1 + 0.2 * p.eps);            // depth (61)
  p.zn = p.T * (1 + p.ata) / 3;                                // nodal point (58)
  calcStress(p);
  p.sigm = p.ata * p.sigam * Math.max(0, 1 - 1.07 * Math.pow(p.eps - 0.4, 2)) + p.sigp;
  p.sigb = (0.5 * p.sigl * c.Dlo + p.sigm * c.Dmo) / p.Db;
  p.sigc = (p.sigmuc * c.Dco + 0.5 * p.sigl * c.Dlo) / p.Dc;
  const L = p.L, T = p.T;
  p.M = c.rho * L * T * p.Db;                                              // body mass
  p.K = 2 * c.mub * L * T / p.Db + Math.PI * Math.PI * p.sigb * p.Db * T / L; // body stiffness
  p.k1 = 2 * c.muc * (L * T / p.Dc) * p.zn / T + Math.PI * Math.PI * p.sigc * (p.Dc / L) * p.zn;                 // (12)
  p.k2 = 2 * c.muc * (L * T / p.Dc) * (1 - p.zn / T) + Math.PI * Math.PI * p.sigc * (p.Dc / L) * T * (1 - p.zn / T); // (13)
  p.m1 = c.rho * L * T * p.Dc * p.zn / T;
  p.m2 = c.rho * L * T * p.Dc * (1 - p.zn / T);
  const a = p.zn / T;
  p.kc = (0.5 * c.muc * (L * p.Dc / T) / (1 / 3 - a * (1 - a)) - 2 * c.muc * (L * T / p.Dc)) * a * (1 - a);
  p.B = 2 * 0.1 * Math.sqrt(p.M * p.K);
  p.b1 = 2 * 0.1 * Math.sqrt(p.m1 * p.k1);
  p.b2 = 2 * 0.6 * Math.sqrt(p.m2 * p.k2);
}

// calc_pressures.m（Titze 2002）
function calcPressures(p) {
  const ke = (2 * p.ad / p.Ae) * (1 - p.ad / p.Ae);
  p.pkd = (p.psg - p.pe) / (1 - ke);
  p.ph = (p.psg + p.pe) / 2;
  const d = p.delta, L = p.L, T = p.T;
  if (p.a1 > d && p.a2 <= d) {
    if (p.zc >= p.zn) { p.f1 = L * p.zn * p.psg; p.f2 = L * (p.zc - p.zn) * p.psg + L * (T - p.zc) * p.ph; }
    else { p.f1 = L * p.zc * p.psg + L * (p.zn - p.zc) * p.ph; p.f2 = L * (T - p.zn) * p.ph; }
  }
  if (p.a1 <= d && p.a2 > d) {
    if (p.zc < p.zn) { p.f1 = L * p.zc * p.ph + L * (p.zn - p.zc) * p.pe; p.f2 = L * (T - p.zn) * p.pe; }
    if (p.zc >= p.zn) { p.f1 = L * p.zn * p.ph; p.f2 = L * (p.zc - p.zn) * p.ph + L * (T - p.zc) * p.pe; }
  }
  if (p.a1 <= d && p.a2 <= d) { p.f1 = L * p.zn * p.ph; p.f2 = L * (T - p.zn) * p.ph; }
  if (p.a1 > d && p.a2 > d) {
    if (p.a1 < p.a2) {
      if (p.zd <= p.zn) {
        p.f1 = L * p.zn * p.psg - L * (p.zn - p.zd + (p.ad / p.a1) * p.zd) * p.pkd;
        p.f2 = L * (T - p.zn) * (p.psg - p.pkd);
      } else {
        p.f1 = L * p.zn * (p.psg - (p.ad * p.ad / (p.an * p.a1)) * p.pkd);
        p.f2 = L * (T - p.zn) * p.psg - L * ((T - p.zd) + (p.ad / p.an) * (p.zd - p.zn)) * p.pkd;
      }
    } else {
      p.f1 = L * p.zn * (p.psg - (p.a2 * p.a2 / (p.an * p.a1)) * p.pkd);
      p.f2 = L * (T - p.zn) * (p.psg - (p.a2 / p.an) * p.pkd);
    }
  }
}

// eom_3m.m
function eom(y, p, dy) {
  dy[0] = y[3]; dy[1] = y[4]; dy[2] = y[5];
  dy[3] = (p.f1 - p.b1 * (y[3] - y[5]) - p.k1 * (y[0] - y[2]) - p.kc * (y[0] - y[1])) / p.m1;
  dy[4] = (p.f2 - p.b2 * (y[4] - y[5]) - p.k2 * (y[1] - y[2]) - p.kc * (y[1] - y[0])) / p.m2;
  dy[5] = (p.k1 * (y[0] - y[2]) + p.k2 * (y[1] - y[2]) + p.b1 * (y[3] - y[5]) + p.b2 * (y[4] - y[5]) - p.K * y[2] - p.B * y[5]) / p.M;
}
// rk3m.m（4次のルンゲ・クッタ）
const _k = [new Float64Array(6), new Float64Array(6), new Float64Array(6), new Float64Array(6)], _yo = new Float64Array(6), _dy = new Float64Array(6);
function rk4(y, dt, p) {
  for (let i = 0; i < 6; i++) _yo[i] = y[i];
  eom(_yo, p, _dy); for (let i = 0; i < 6; i++) { _k[0][i] = dt * _dy[i]; _yo[i] = y[i] + _k[0][i] / 2; }
  eom(_yo, p, _dy); for (let i = 0; i < 6; i++) { _k[1][i] = dt * _dy[i]; _yo[i] = y[i] + _k[1][i] / 2; }
  eom(_yo, p, _dy); for (let i = 0; i < 6; i++) { _k[2][i] = dt * _dy[i]; _yo[i] = y[i] + _k[2][i]; }
  eom(_yo, p, _dy); for (let i = 0; i < 6; i++) _k[3][i] = dt * _dy[i];
  for (let i = 0; i < 6; i++) y[i] += _k[0][i] / 6 + _k[1][i] / 3 + _k[2][i] / 3 + _k[3][i] / 6;
}

// calcflow.m（Titze 2002・1984）
function calcFlow(ga, Pos, Prg, ar, csnd, rhoc) {
  const Atrch = ar.length - 1 > 44 ? ar[ar.length - 1] : 1000000;
  const Aphrx = ar[1];
  const ke = 2 * ga / Aphrx * (1 - ga / Aphrx), kt = 1 - ke;
  const Astar = (Atrch * Aphrx) / (Atrch + Aphrx);
  const Q = 4.0 * kt * (Pos - Prg) / (csnd * rhoc);
  const R = ga / Astar;
  return Q >= 0 ? (ga * csnd / kt) * (-R + Math.sqrt(R * R + Q)) : (ga * csnd / kt) * (R - Math.sqrt(R * R - Q));
}

// LeTalker.m の本体。opt: sex, act, ata, alc, PL（dyn/cm²、一定でも関数 t→値 でも）, x01, x02（cm）, vowel, SUB, SUPRA, noise, dur（秒）, fs
// 返すもの: 唇での音 po、流量 ug、声門の面積 ga、おもりの位置 x1・x2・xb、模型の値 p、F0（LeTalker と同じゼロ交差）
function run(opt) {
  opt = Object.assign({ sex: 'male', act: 0.25, ata: 0.25, alc: 0.5, PL: 7840, x01: 0.0005, x02: 0.0, vowel: 'uniform', SUB: 1, SUPRA: 1, noise: 0, dur: 0.5, fs: 44100, vtatten: 0.005, seed: 1, onStep: null }, opt || {});
  const c = constants(opt.sex);
  const fs = opt.fs, N = Math.round(opt.dur * fs), dt = 1 / fs;
  const p = { sigam: 1050000, delta: 0.0000001, Ae: 1000000.0, As: 1000000, x01: opt.x01, x02: opt.x02, act: opt.act, ata: opt.ata, alc: opt.alc, f1: 0, f2: 0, ps: 0, psg: 0 };
  // 断面積（1始まり: 1..44 声道、45..76 気管）
  const Nsect = 76, ar = new Float64Array(Nsect + 1);
  const vt = VOWELS[opt.vowel];
  for (let i = 1; i <= 44; i++) ar[i] = vt ? vt[i - 1] : 3;
  if (vt) { // AssignParams.m: smooth(…,3)（MATLAB の移動平均。両はしは短い窓）
    const s = Float64Array.from(ar);
    for (let i = 2; i <= 43; i++) s[i] = (ar[i - 1] + ar[i] + ar[i + 1]) / 3;
    for (let i = 1; i <= 44; i++) ar[i] = s[i];
  }
  for (let i = 45; i <= 76; i++) ar[i] = TRACH[i - 45];
  if (!opt.SUB) ar[Nsect] = 1000000;
  if (!opt.SUPRA) ar[1] = 1000000;
  const ieplx = 1, jmoth = 44, itrch = jmoth + 1, jtrch = Nsect;
  const f = new Float64Array(Nsect + 2), b = new Float64Array(Nsect + 2), r1 = new Float64Array(Nsect + 1), r2 = new Float64Array(Nsect + 1);
  const csnd = 35000, rho = 0.00114, rhoc = rho * csnd, mu = 0.000186;
  const Rrad = 128.0 / (9.0 * Math.PI * Math.PI);
  const alpha = new Float64Array(Nsect + 1);
  for (let i = 1; i <= Nsect; i++) alpha[i] = 1 - opt.vtatten / Math.sqrt(ar[i]);
  for (let k = 1; k <= jtrch - 1; k++) { const D = ar[k] + ar[k + 1]; r1[k] = (ar[k] - ar[k + 1]) / D; r2[k] = -r1[k]; }
  const F = new Float64Array(6);
  let bprev = 0, fprev = 0, Pox = 0;
  const xn = [0, 0, 0, 0, 0], yn = [0, 0, 0, 0, 0];
  let seed = opt.seed; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = { po: new Float32Array(N), ug: new Float32Array(N), ga: new Float32Array(N), x1: new Float32Array(N), x2: new Float32Array(N), xb: new Float32Array(N), fs };
  const tcos = 0.002;
  const PLf = typeof opt.PL === 'function' ? opt.PL : () => opt.PL;
  const ACTf = typeof opt.act === 'function' ? opt.act : null, ATAf = typeof opt.ata === 'function' ? opt.ata : null;
  for (let n = 0; n < N; n++) {
    const t = n * dt;
    if (ACTf) p.act = ACTf(t); if (ATAf) p.ata = ATAf(t);
    p.ps = PLf(t);
    if (t <= tcos) { const fc = 1 / (2 * tcos); p.ps = p.ps * (Math.cos(2 * Math.PI * fc * t - Math.PI) + 1) / 2; }
    rules(p, c);
    p.psg = p.ps;
    // Titze 1
    const znot = p.zn / p.T;
    p.xn = (1 - znot) * (p.x01 + F[0]) + znot * (p.x02 + F[1]);
    p.tangent = (p.x01 - p.x02 + 2 * (F[0] - F[1])) / p.T;
    p.x1 = p.xn - (-p.zn) * p.tangent;
    p.x2 = p.xn - (p.T - p.zn) * p.tangent;
    p.zc = Math.min(p.T, Math.max(0, p.zn + p.xn / p.tangent));
    p.a1 = Math.max(p.delta, 2 * p.L * p.x1);
    p.a2 = Math.max(p.delta, 2 * p.L * p.x2);
    p.an = Math.max(p.delta, 2 * p.L * p.xn);
    p.zd = Math.min(p.T, Math.max(0, -0.2 * p.x1 / p.tangent));
    p.ad = Math.min(p.a2, 1.2 * p.a1);
    p.pe = f[ieplx] + b[ieplx];
    calcPressures(p);
    rk4(F, dt, p);
    p.ga = Math.max(0, Math.min(p.a1, p.a2));
    let ug = calcFlow(p.ga, f[jtrch], b[ieplx], ar, csnd, rhoc);
    if (opt.noise) {
      const RE2 = Math.pow(ug * rho / (mu * p.L), 2), RE2b = 1440000;
      const Anois = 0.000004 * (RE2 - RE2b);
      const tmp1 = NOISE_CB[0] * xn[4] + NOISE_CB[1] * xn[3] + NOISE_CB[2] * xn[2] + NOISE_CB[3] * xn[1] + NOISE_CB[4] * xn[0];
      const tmp2 = NOISE_CA[1] * yn[3] + NOISE_CA[2] * yn[2] + NOISE_CA[3] * yn[1] + NOISE_CA[4] * yn[0];
      yn[4] = tmp1 - tmp2;
      if (Anois > 0) ug += Anois * yn[4];
      for (let i = 0; i < 4; i++) { xn[i] = xn[i + 1]; yn[i] = yn[i + 1]; }
      xn[4] = rnd() - 0.5;
    }
    // 波の伝わり
    f[ieplx] = alpha[ieplx] * b[ieplx] + ug * (rhoc / ar[ieplx]);
    if (!opt.SUPRA) f[ieplx] = 0;
    if (opt.SUB) {
      p.psg = 2 * f[jtrch] * alpha[jtrch] - ug * (rhoc / ar[jtrch]);
      f[itrch] = 0.9 * p.ps - 0.8 * b[itrch] * alpha[itrch];
    } else { p.psg = p.ps; f[jtrch] = p.ps; }
    for (let i = 1; i <= Nsect; i++) { f[i] *= alpha[i]; b[i] *= alpha[i]; }
    if (opt.SUB) {
      for (let k = itrch + 1; k <= jtrch - 2; k += 2) { const Psi = f[k] * r1[k] + b[k + 1] * r2[k]; b[k] = b[k + 1] + Psi; f[k + 1] = f[k] + Psi; }
      b[jtrch] = f[jtrch] * alpha[jtrch] - ug * rhoc / ar[jtrch];
    }
    for (let k = ieplx + 1; k <= jmoth - 2; k += 2) { const Psi = f[k] * r1[k] + b[k + 1] * r2[k]; b[k] = b[k + 1] + Psi; f[k + 1] = f[k] + Psi; }
    if (opt.SUB) for (let k = itrch; k <= jtrch - 1; k += 2) { const Psi = f[k] * r1[k] + b[k + 1] * r2[k]; b[k] = b[k + 1] + Psi; f[k + 1] = f[k] + Psi; }
    for (let k = ieplx; k <= jmoth - 1; k += 2) { const Psi = f[k] * r1[k] + b[k + 1] * r2[k]; b[k] = b[k + 1] + Psi; f[k + 1] = f[k] + Psi; }
    // 唇からの放射
    const am = Math.sqrt(ar[jmoth] / Math.PI);
    const Lr = (2.0 / dt) * 8.0 * am / (3.0 * Math.PI * csnd);
    const a2 = -Rrad - Lr + Rrad * Lr, a1 = -Rrad + Lr - Rrad * Lr, b2 = Rrad + Lr + Rrad * Lr, b1 = -Rrad + Lr + Rrad * Lr;
    b[jmoth] = (1 / b2) * (f[jmoth] * a2 + fprev * a1 + bprev * b1);
    const Pout = (1 / b2) * (Pox * b1 + f[jmoth] * (b2 + a2) + fprev * (a1 - b1));
    Pox = Pout; bprev = b[jmoth]; fprev = f[jmoth];
    out.po[n] = Pout; out.ug[n] = ug; out.ga[n] = p.ga; out.x1[n] = p.x1; out.x2[n] = p.x2; out.xb[n] = F[2];
    if (opt.onStep) opt.onStep(n, p, F);
    if (!isFinite(p.x1) || !isFinite(p.x2) || !isFinite(F[2])) { out.blewUp = n; break; }
  }
  out.p = Object.assign({}, p); out.c = c; out.opt = opt;
  out.f0 = zeroCrossF0(out.x1, fs);
  return out;
}

// LeTalker.m の終わり＋zerocross.m と同じ考え方: 40%〜90% の区間の x1 の上向きのゼロ交差の間隔
function zeroCrossF0(x, fs) {
  const n1 = Math.round(0.4 * x.length), n2 = x.length - Math.round(0.1 * x.length);
  const seg = Array.from(x.subarray(n1, n2));
  let mx = -Infinity, mn = Infinity; for (const v of seg) { if (v > mx) mx = v; if (v < mn) mn = v; }
  const off = mn > 0 ? 0.1 * mx : 0;
  const cr = [];
  for (let i = 1; i < seg.length; i++) { const a = seg[i - 1] - off, b = seg[i] - off; if (a < 0 && b >= 0) cr.push(i - 1 + a / (a - b)); }
  if (cr.length < 3) return 0;
  let s = 0; for (let i = 1; i < cr.length; i++) s += cr[i] - cr[i - 1];
  return fs / (s / (cr.length - 1));
}

const api = { run, rules, constants, PRESETS, VOWELS, TRACH };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LeTalker = api;
})(typeof self !== 'undefined' ? self : this);
