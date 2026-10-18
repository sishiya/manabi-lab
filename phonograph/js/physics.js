// エジソンの蓄音機 — 物理（振動板・針・すず箔・溝・なぞる・空気へ）
// AudioWorklet（worklet.js が import）・ページ（<script>）・node（tools/verify.js が require）のどこでも動くように、window を使わない。
// 単位は SI（m・s・kg・N・Pa）。深さ z・溝 s は「箔の面から筒の中へ」を正。振動板のまん中の変位 w も筒へ向かう向きを正。
'use strict';
(function (root) {

// ---------- 値（出どころ・推定は PLAN.md と画面の「簡単にするところ」） ----------
const P = {
  // 筒（1878 年 Bergmann の展示用。The Henry Ford の目録で直径 約 5.55 in、Edisonium で 約 140 mm）
  R: 0.0705,                 // 筒の半径 m
  pitch: 0.0254 / 24,        // らせんのピッチ（1インチに24山。Edisonium・edisontinfoil.com）
  nRev: 40,                  // 箔に刻める回転の数（このアプリの都合。毎分60回転で約40秒）
  dx: 8e-6,                  // 溝の記録の間隔 m（らせんにそって）
  // 振動板（雲母。直径 50 mm は Edisonium。厚み・減衰は推定）
  a: 0.025,                  // ふちを留めた半径 m
  h: 0.1e-3,                 // 厚み m（推定）
  E: 170e9,                  // 雲母の面内のヤング率 Pa（薄い板の測定 約 178 GPa、厚いと下がる。丸めた値）
  nu: 0.25,                  // ポアソン比（推定）
  rho: 2830,                 // 雲母の密度 kg/m³
  zeta: 0.04,                // 各モードの減衰比（推定。ふちのゴム・空気）
  nModes: 5,                 // 軸対称のモードの数
  ms: 30e-6,                 // 針の質量 kg（推定）
  rTip: 0.15e-3,             // 針の先の丸みの半径 m（推定）
  // すず箔（厚み 1.3〜1.5 mil は edisontinfoil.com。流れる強さはすずの降伏 7 MPa と引っぱり強さ 14.5 MPa のあいだ）
  tFoil: 35e-6,              // 箔の厚み m
  sigY: 10e6,                // すずが流れ出す強さ Pa（推定）
  wChan: 0.5e-3,             // 筒の溝（箔の下のすきま）の幅 m（推定）
  keRatio: 10,               // 箔の弾性のかたさ ÷ 塑性のかたさ（推定）
  cContact: 0,               // 針と箔がふれているときの減衰 N·s/m（ためし用。0 = 入れない。0.5〜1.5 にしても跳ね方はほとんど変わらなかった）
  // 針のおしこみ（ねじで合わせる。録音は溝が 0.05 mm になるように＝セントルイスのすず箔の測定）
  depthRec: 0.05e-3,         // 録音のときの針の先の深さの目安 m
  trackRatio: 0.3,           // 再生のときの押す力 ÷ 0.05 mm を刻む力（再生は浅め＝Iowa 大の演示資料。0.3 は推定）
  // 空気
  rho0: 1.2,                 // 空気の密度 kg/m³
  rListen: 0.3,              // 聞く人の耳までの距離 m
  // クランクとはずみ車（推定）
  tauHand: 0.15,             // 手で回すとき、速さが手に追いつくまでの時間 s
  tauCoast: 3.0,             // 手を離したあと、速さが 1/e になるまでの時間 s
  over: 4,                   // 1サンプルを何回に分けて計算するか
};

// ---------- ふちを留めた円板の軸対称モード ----------
function besselJ0(x) { let s = 1, t = 1; const q = x * x / 4; for (let k = 1; k < 80; k++) { t *= -q / (k * k); s += t; if (Math.abs(t) < 1e-17 * Math.abs(s) && k > 10) break; } return s; }
function besselJ1(x) { let t = x / 2, s = t; const q = x * x / 4; for (let k = 1; k < 80; k++) { t *= -q / (k * (k + 1)); s += t; if (Math.abs(t) < 1e-17 && k > 10) break; } return s; }
function besselI0(x) { let s = 1, t = 1; const q = x * x / 4; for (let k = 1; k < 80; k++) { t *= q / (k * k); s += t; if (t < 1e-17 * s) break; } return s; }
function besselI1(x) { let t = x / 2, s = t; const q = x * x / 4; for (let k = 1; k < 80; k++) { t *= q / (k * (k + 1)); s += t; if (t < 1e-17 * s) break; } return s; }
// ふちで変位も傾きも 0: J0(λ)I1(λ) + I0(λ)J1(λ) = 0 の根
function plateRoots(n) {
  const f = x => besselJ0(x) * besselI1(x) + besselI0(x) * besselJ1(x), out = [];
  let x0 = 0.5, f0 = f(x0);
  for (let x = 0.5 + 0.01; out.length < n && x < 40; x += 0.01) {
    const f1 = f(x);
    if (f0 * f1 < 0) { let lo = x - 0.01, hi = x; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } out.push((lo + hi) / 2); }
    f0 = f1;
  }
  return out;
}
function makePlate(p) {
  const D = p.E * p.h ** 3 / (12 * (1 - p.nu ** 2)), mu = p.rho * p.h, lams = plateRoots(p.nModes), modes = [];
  for (const lam of lams) {
    const c = besselJ0(lam) / besselI0(lam), w0 = 1 - c;
    const W = r => (besselJ0(lam * r / p.a) - c * besselI0(lam * r / p.a)) / w0;   // まん中で 1
    let M = 0, G = 0; const N = 600;
    for (let i = 0; i < N; i++) { const r = (i + 0.5) / N * p.a, wr = W(r), dA = 2 * Math.PI * r * p.a / N; M += mu * wr * wr * dA; G += wr * dA; }
    const om = lam * lam / (p.a * p.a) * Math.sqrt(D / mu);
    modes.push({ lam, lam2: lam * lam, W, M, G, om, f: om / (2 * Math.PI), K: M * om * om, C: 2 * p.zeta * M * om });
  }
  let comp = 0, compP = 0; for (const m of modes) { comp += 1 / m.K; compP += m.G / m.K; }
  return { D, mu, modes, kPoint: 1 / comp, wPerPa: compP,   // まん中を押したときのかたさ、一様な圧力 1 Pa でのまん中の変位（どちらもモードの和）
    kPointExact: 16 * Math.PI * D / (p.a * p.a), wPerPaExact: p.a ** 4 / (64 * D) };   // 板の式そのもの（くらべる用）
}

// ---------- 箔: 押す力と深さ ----------
// 箔を幅 wChan のすきまへ押しこむ。曲げで流れ出す分（2σt²）＋のびの分（両側の張力 σt × 傾き 2z/w × 2 × 長さ w ≒ 4σt z）。
function foilModel(p) {
  const F0 = 2 * p.sigY * p.tFoil ** 2, Kp = 4 * p.sigY * p.tFoil;
  return { F0, Kp, ke: p.keRatio * Kp, Fp: z => F0 + Kp * Math.max(0, z) };
}

// ---------- 蓄音機 1台 ----------
function Phono(fs, opt) {
  const p = this.p = Object.assign({}, P, opt || {});
  this.fs = fs; this.dt = 1 / (fs * p.over);
  this.plate = makePlate(p); this.foil = foilModel(p);
  const n = this.nm = this.plate.modes.length;
  this.q = new Float64Array(n); this.v = new Float64Array(n); this.acc = new Float64Array(n);
  this.circ = 2 * Math.PI * p.R;
  this.len = Math.floor(p.nRev * this.circ / p.dx);
  this.s = new Float32Array(this.len);                // 溝の深さ（らせんにそった位置ごと）
  this.segN = 256; this.seg = new Float32Array(p.nRev * this.segN); this.segDirty = new Uint8Array(p.nRev);
  this.x = 0; this.om = 0; this.omT = 0; this.hand = false;
  this.mode = 'up'; this.z0 = -0.4e-3; this.z0T = -0.4e-3;
  this.Fc = 0; this.pen = 0; this.penPrev = 0; this.contact = false; this.wear = 0; this.atEnd = false;
  const k = this.plate.kPoint, f = this.foil;
  this.z0Rec = p.depthRec + f.Fp(p.depthRec) / k;                         // 押しこみのねじ（録音）
  this.z0Play = p.depthRec + p.trackRatio * f.Fp(p.depthRec) / k;         // 押しこみのねじ（再生。浅め）
  this.pPrev = 0; this.lastOut = 0;
}
Phono.P = P;
Phono.prototype.setMode = function (m) {   // 'up'（針を上げる）・'rec'・'play'
  this.mode = m; this.z0T = m === 'rec' ? this.z0Rec : m === 'play' ? this.z0Play : -0.4e-3;
};
Phono.prototype.rewind = function () { this.x = 0; this.atEnd = false; };
Phono.prototype.resetFoil = function () { this.s.fill(0); this.seg.fill(0); this.segDirty.fill(0); this.x = 0; this.wear = 0; this.atEnd = false; };
Phono.prototype.setCrank = function (hand, om) { this.hand = !!hand; this.omT = om; };
Phono.prototype.wCenter = function () { let w = 0; for (let i = 0; i < this.nm; i++) w += this.q[i]; return w; };

// 針の先（丸い）と溝のふれあい。録音もすり減りも同じ式: 弾性で押し返し、力が「その深さを刻む力」をこえたら箔が流れて溝が深くなる。
Phono.prototype.contactForce = function (z) {
  const p = this.p, s = this.s, r = p.rTip, dx = p.dx, f = this.foil;
  const i0 = Math.round(this.x / dx), nr = Math.ceil(r / dx), c = z - r;
  const lo = Math.max(0, i0 - nr), hi = Math.min(this.len - 1, i0 + nr);
  let pen = -1;
  for (let j = lo; j <= hi; j++) { const u = j * dx - this.x; if (u * u >= r * r) continue; const d = c + Math.sqrt(r * r - u * u) - s[j]; if (d > pen) pen = d; }
  this.pen = pen; const rate = (pen - this.penPrev) / this.dt; this.penPrev = pen;
  if (pen <= 0) { this.contact = false; return 0; }
  this.contact = true;
  const Fe = Math.max(0, f.ke * pen + p.cContact * rate), Fp = f.Fp(z);   // ぶつかるときの減衰（すずはやわらかく、跳ね返りが小さい）
  if (Fe <= Fp) return Fe;
  const de = Fp / f.ke; let worn = 0;
  for (let j = lo; j <= hi; j++) {
    const u = j * dx - this.x; if (u * u >= r * r) continue;
    const zz = c + Math.sqrt(r * r - u * u) - de;
    if (zz > s[j]) { worn += zz - s[j]; s[j] = zz; }
  }
  if (worn > 0) { this.wear += worn * dx; this.segDirty[Math.min(p.nRev - 1, Math.floor(this.x / this.circ))] = 1; }
  this.pen = de;
  return Fp;
};

// n サンプルを進める。pin: マウスピースの中の圧力 Pa（null なら 0）、pout: 耳もと（rListen）の圧力 Pa を書く。
Phono.prototype.process = function (pin, pout, n) {
  const p = this.p, ov = p.over, dt = this.dt, modes = this.plate.modes, nm = this.nm, q = this.q, v = this.v, acc = this.acc;
  let sumInvM = 0; for (let i = 0; i < nm; i++) sumInvM += 1 / modes[i].M;
  const kRad = p.rho0 / (4 * Math.PI * p.rListen), maxX = this.len * p.dx - 2 * p.rTip;
  for (let k = 0; k < n; k++) {
    const pk = pin ? pin[k] : 0, pa = this.pPrev; this.pPrev = pk;
    let out = 0;
    for (let o = 0; o < ov; o++) {
      const pr = pa + (pk - pa) * (o + 1) / ov;
      // クランクとはずみ車
      if (this.hand) this.om += (this.omT - this.om) * dt / p.tauHand; else this.om -= this.om * dt / p.tauCoast;
      if (this.om < 0) this.om = 0;
      this.x += this.om * p.R * dt;
      if (this.x > maxX) { this.x = maxX; this.om = 0; this.atEnd = true; }
      this.z0 += (this.z0T - this.z0) * dt / 0.05;                       // 針をおろす・上げる（0.05 秒で）
      // 振動板＋針
      let w = 0; for (let i = 0; i < nm; i++) w += q[i];
      const Fc = this.contactForce(this.z0 + w); this.Fc = Fc;
      let sumA = 0;
      for (let i = 0; i < nm; i++) { const m = modes[i]; acc[i] = (m.G * pr - Fc - m.C * v[i] - m.K * q[i]) / m.M; sumA += acc[i]; }
      const wdd = sumA / (1 + p.ms * sumInvM);
      let dQ = 0;
      for (let i = 0; i < nm; i++) { const m = modes[i]; acc[i] -= p.ms * wdd / m.M; v[i] += acc[i] * dt; q[i] += v[i] * dt; dQ += m.G * acc[i]; }
      out += kRad * dQ;   // 小さな円板が片側の空気を押す（遠くでの圧力 = ρ/(4πr)·dQ/dt）
    }
    if (pout) pout[k] = out / ov;
  }
};

// 溝の窓（いまの針の位置のまわり）と、箔をひろげた図用の「区切りごとの刻みの大きさ」
Phono.prototype.window = function (half, out) {
  const i0 = Math.round(this.x / this.p.dx);
  for (let j = -half; j <= half; j++) { const i = i0 + j; out[j + half] = i >= 0 && i < this.len ? this.s[i] : 0; }
  return out;
};
Phono.prototype.updateSegs = function () {
  const per = this.circ / this.p.dx, sn = this.segN, changed = [];
  for (let r = 0; r < this.p.nRev; r++) {
    if (!this.segDirty[r]) continue; this.segDirty[r] = 0; changed.push(r);
    for (let g = 0; g < sn; g++) {
      const a = Math.floor((r + g / sn) * per), b = Math.min(this.len, Math.floor((r + (g + 1) / sn) * per));
      let mx = 0, mn = 1, sum = 0; for (let i = a; i < b; i++) { const v = this.s[i]; if (v > mx) mx = v; if (v < mn) mn = v; sum += v; }
      this.seg[r * sn + g] = mx > 0 ? (mx - Math.max(0, mn)) : 0;   // 区切りの中のでこぼこ（深い所と浅い所の差）
    }
  }
  return changed;
};

const api = { P, Phono, makePlate, foilModel, plateRoots, besselJ0, besselI0 };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.PhonoPhys = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
