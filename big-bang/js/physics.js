// ビッグバンから惑星まで — 場面④の物理（定数・はじめの円盤・ぶつかりの結果・熱）
// GPU の式（shaders.js）と同じことを JS でも書いておき、検証（tools/verify.mjs と __biba.testGpu）でくらべる。
// 単位: 長さ AU・時間 年・重さ 太陽の重さ（G = 4π²）。熱は J/kg。

export const AU = 1.495978707e11;          // m
export const YR = 3.15576e7;               // s
export const MSUN = 1.98892e30;            // kg
export const MEARTH = 5.9722e24;           // kg
export const GSI = 6.674e-11;
export const G = 4 * Math.PI * Math.PI;    // AU³ / (太陽の重さ・年²)
export const V2SI = (AU / YR) ** 2;        // (AU/年)² → m²/s²（= J/kg）

export const RHO = 3000;          // 岩の密度 kg/m³（推定: コンドライトくらい）
export const SIGMA1 = 71;         // 1 AU での岩の面密度 kg/m²（Hayashi 1981 の 7.1 g/cm²。二次資料で確認）
export const A_IN = 0.4, A_OUT = 2.0;  // 岩をまく範囲（AU）
export const DT = 1 / 256;        // 1歩の時間（年）。0.4 AU の公転を約65歩で
export const EPS2 = (2e-5) ** 2;  // 重力をやわらげる距離²（近づきすぎたときの計算のこわれ止め）
export const R_SUN_EAT = 0.1;     // ここより内側は太陽へ落ちたとする（AU）
export const R_LOST = 12;         // ここより外はとび出したとする（AU）
// ぶつかりを調べる距離²: 1歩で近づける距離（速さ 40 AU/年 まで）＋ふれる距離。これより遠い組は調べない
export const cut2 = F => (40 * DT + F * 3e-4) ** 2;

// ぶつかり（Leinhardt & Stewart 2012, ApJ 745:79。正面衝突として、角度の補正は入れない）
export const CSTAR = 1.9, MUBAR = 0.36, RHO1 = 1000;   // 惑星くらいの大きさの当てはめ（式28・23）
export const MAX_FRAG = 8;        // 1回にできるかけらの数の上限（偶数）
export const ETA_KE = 0.3;        // 砕けたとき、ぶつかるエネルギーのうち少なくともこれだけは かけらの動きに（推定）
const s3 = 1 / Math.sqrt(3);
export const CUBE = [[s3, s3, s3], [s3, s3, -s3], [s3, -s3, s3], [-s3, s3, s3]];
// でたらめな回転（z → y → z の角度）
export function rotOf(key) {
  const a = 2 * Math.PI * rnd(key), b = Math.acos(2 * rnd(key + 1) - 1), c = 2 * Math.PI * rnd(key + 2);
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  return ([x, y, z]) => {
    let x1 = cc * x - sc * y, y1 = sc * x + cc * y;            // z まわり c
    let x2 = cb * x1 + sb * z, z2 = -sb * x1 + cb * z;          // y まわり b
    return [ca * x2 - sa * y1, sa * x2 + ca * y1, z2];          // z まわり a
  };
}

// 熱（推定。DEVNOTES「しくみ」）
export const CP = 1000;           // 比熱 J/kg/K
export const T_MELT = 1500;       // とけはじめ K
export const L_MELT = 4e5;        // とける熱 J/kg
export const T_VAP = 3000;        // 蒸発しはじめ K
export const L_VAP = 1e7;         // 蒸発する熱 J/kg
export const KAPPA = 1e-6;       // 熱の伝わりやすさ（熱拡散率）m²/s
export const SB = 5.670374e-8;
export const AL_H0 = 1.9e-7;      // アルミニウム26 のはじめの発熱 W/kg（26Al/27Al = 5×10⁻⁵・Al 1.13%・3.12 MeV から計算）
export const AL_TAU = 1.034e6;    // 平均寿命 年（半減期 71.7万年）

export const solidMassKg = () => 2 * Math.PI * SIGMA1 * AU * AU * 2 * (Math.sqrt(A_OUT) - Math.sqrt(A_IN));
export const radiusAU = mSun => Math.cbrt(3 * mSun * MSUN / (4 * Math.PI * RHO)) / AU;
export const tEq = r => 278 / Math.sqrt(Math.max(r, 0.05));        // まわりと同じになる温度（黒体）K

// 比エネルギー e（J/kg）→ 温度（固体 → とける間は 1500 K → 液体 → 蒸発する間は 3000 K → 気体）
export function tempOfE(e) {
  const e1 = CP * T_MELT, e2 = e1 + L_MELT, e3 = e2 + CP * (T_VAP - T_MELT), e4 = e3 + L_VAP;
  if (e < e1) return e / CP;
  if (e < e2) return T_MELT;
  if (e < e3) return T_MELT + (e - e2) / CP;
  if (e < e4) return T_VAP;
  return T_VAP + (e - e4) / CP;
}
export function eOfTemp(T) { return T <= T_MELT ? CP * T : CP * T + L_MELT; }

// 同じ乱数を JS と WGSL で（整数のハッシュ）
export function hash(x) {
  x = (x ^ 61) ^ (x >>> 16); x = Math.imul(x, 9) >>> 0; x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d) >>> 0; x = x ^ (x >>> 15); return x >>> 0;
}
export const rnd = x => hash(x) / 4294967296;

// はじめの円盤: 同じ重さの岩 n 個。数は a^-1/2 にそって（面密度 ∝ a^-3/2）。ゆれ e ≈ 0.01・傾き ≈ 0.005
export function initDisk(n, seed = 1) {
  const m = solidMassKg() / MSUN / n, R = radiusAU(m);
  const B = new Float32Array(n * 16);
  const s0 = Math.sqrt(A_IN), s1 = Math.sqrt(A_OUT);
  const gauss = k => { const u = Math.max(1e-9, rnd(k)), v = rnd(k + 7919); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let i = 0; i < n; i++) {
    const k = seed * 1000003 + i * 17;
    const a = (s0 + (s1 - s0) * rnd(k)) ** 2, th = 2 * Math.PI * rnd(k + 1);
    const vk = Math.sqrt(G / a), e = 0.01, inc = 0.005;
    const vr = e * vk * gauss(k + 2), vp = vk * (1 + 0.5 * e * gauss(k + 3)), vz = inc * vk * gauss(k + 4);
    const z = inc * a * gauss(k + 5);
    const c = Math.cos(th), s = Math.sin(th), o = i * 16;
    B[o] = a * c; B[o + 1] = a * s; B[o + 2] = z; B[o + 3] = m;
    B[o + 4] = vr * c - vp * s; B[o + 5] = vr * s + vp * c; B[o + 6] = vz; B[o + 7] = R;
    B[o + 12] = eOfTemp(tEq(a)); B[o + 13] = 0; B[o + 14] = i; B[o + 15] = 0;
  }
  return { B, m0: m, R0: R };
}

// ぶつかりの結果。b1・b2 = {m, R(AU), p:[3], v:[3], e}、F = ぶつかる大きさの倍率、mMin = かけらのいちばん小さい重さ
// 返す: { kind: 'merge'|'frag', lr: {m,R,p,v}, frags: [{m,R,p,v}], dust, heat（太陽の重さ×(AU/年)²）, e（全部に同じ比エネルギー）, qr }
export function collide(b1, b2, F, mMin, key) {
  const M = b1.m + b2.m, mu = b1.m * b2.m / M;
  const pc = [0, 1, 2].map(k => (b1.m * b1.p[k] + b2.m * b2.p[k]) / M);
  const vc = [0, 1, 2].map(k => (b1.m * b1.v[k] + b2.m * b2.v[k]) / M);
  const w = [0, 1, 2].map(k => b2.v[k] - b1.v[k]);
  const Rs = b1.R + b2.R;
  // ぶつかる大きさを F 倍にしているので、F 倍の所から本当の表面まで落ちるあいだに速くなる分を足す
  const vimp2 = w[0] * w[0] + w[1] * w[1] + w[2] * w[2] + 2 * G * M * (1 / Rs - 1 / (F * Rs));
  const vesc2 = 2 * G * M / Rs;
  const Eimp = 0.5 * mu * vimp2;                        // ぶつかるエネルギー
  const qr = Eimp / M * V2SI;                           // Q_R（J/kg）
  const big = b1.m >= b2.m ? b1 : b2, small = big === b1 ? b2 : b1;
  const eIn = b1.m * b1.e + b2.m * b2.e;
  let mlr = M, kind = 'merge';
  if (vimp2 > vesc2) {
    const gam = small.m / big.m;
    const Rc1 = Math.cbrt(3 * M * MSUN / (4 * Math.PI * RHO1));
    const q1 = CSTAR * 0.8 * Math.PI * RHO1 * GSI * Rc1 * Rc1;
    const qs = q1 * Math.pow(0.25 * (gam + 1) ** 2 / gam, 2 / (3 * MUBAR) - 1);
    const x = qr / qs;
    mlr = x < 1.8 ? M * (1 - 0.5 * x) : M * 0.1 * Math.pow(1.8 / x, 1.5);
    mlr = Math.min(M, Math.max(0, mlr));
    kind = 'frag';
  }
  const lr = { m: mlr, R: radiusAU(mlr), p: pc.slice(), v: vc.slice() };
  const frags = [];
  let md = M - mlr, dust = 0, heat = Eimp;
  if (kind === 'frag') {
    let nf = Math.min(MAX_FRAG, Math.floor(md / mMin)); nf -= nf % 2;
    if (nf === 0 || mlr <= 0) { dust = md; }
    else {
      // かけらは立方体の角の向き（たがいに重ならない）を、でたらめに回して置く。2つずつ反対向きなので勢いの合計は変わらない
      const mf = md / nf, Rf = radiusAU(mf), d = 1.2 * F * (lr.R + 2 * Rf);
      const fall = 2 * G * mlr * (1 / (lr.R + Rf) - 1 / d);              // 表面から d まで上がるのに要る速さ²
      const KEmin = 0.5 * md * (1.44 * 2 * G * mlr / d + fall);           // d で逃げる速さの 1.2 倍になるのに要るエネルギー
      const KEf = Math.min(Eimp, Math.max(KEmin, ETA_KE * Eimp));
      const vej = Math.sqrt(Math.max(0, 2 * KEf / md - fall));
      const rot = rotOf(key);
      for (let k = 0; k < nf; k += 2) {
        const dir = rot(CUBE[k / 2]);
        for (const sg of [1, -1]) frags.push({ m: mf, R: Rf, p: pc.map((c, q) => c + sg * dir[q] * d), v: vc.map((c, q) => c + sg * dir[q] * vej) });
      }
      heat = Eimp - KEf;
    }
  }
  return { kind, lr, frags, dust, heat, e: (eIn + heat * V2SI) / M, qr, vimp2, vesc2, big: big.m };
}

// 冷え方: とけている間は表面からそのまま光を出す（ふた（地殻・大気）なし）。固まったら中から伝わる熱で R²/(π²κ)
export function coolRate(e, R_AU, r_AU) {
  const T = tempOfE(e), Te = tEq(r_AU), Rm = R_AU * AU;
  if (T > T_MELT - 1) return -3 * SB * (T ** 4 - Te ** 4) / (RHO * Rm);     // W/kg
  const tau = Rm * Rm / (Math.PI * Math.PI * KAPPA);
  return -(e - eOfTemp(Te)) / tau;
}
export const alHeat = tYr => AL_H0 * Math.exp(-tYr / AL_TAU);

// JS で同じ計算を1歩（検証用。小さい n だけ）。B は initDisk と同じ並び（16 個ずつ）
export function stepCPU(S, F, mMin, stepIdx, tYr) {
  const { B, n } = S, dt = DT;
  const out = { dust: 0, sun: 0, lost: 0, coll: 0, merge: 0, frag: 0 };
  for (let i = 0; i < n; i++) { const o = i * 16; if (B[o + 3] <= 0) continue;
    for (let k = 0; k < 3; k++) B[o + 4 + k] += B[o + 8 + k] * dt / 2;
    for (let k = 0; k < 3; k++) B[o + k] += B[o + 4 + k] * dt;
    const r = Math.hypot(B[o], B[o + 1], B[o + 2]);
    if (r < R_SUN_EAT) { out.sun += B[o + 3]; B[o + 3] = 0; } else if (r > R_LOST) { out.lost += B[o + 3]; B[o + 3] = 0; }
  }
  const partner = forceCPU(S, F);
  for (let i = 0; i < n; i++) { const o = i * 16; if (B[o + 3] <= 0) continue;
    for (let k = 0; k < 3; k++) B[o + 4 + k] += B[o + 8 + k] * dt / 2;
  }
  const free = []; for (let i = 0; i < n; i++) if (B[i * 16 + 3] <= 0) free.push(i);
  for (let i = 0; i < n; i++) {
    const j = partner[i]; if (j <= i || partner[j] !== i) continue;
    const g = q => { const o = q * 16; return { m: B[o + 3], R: B[o + 7], p: [B[o], B[o + 1], B[o + 2]], v: [B[o + 4], B[o + 5], B[o + 6]], e: B[o + 12] }; };
    const res = collide(g(i), g(j), F, mMin, (stepIdx * 2654435761 + i) >>> 0);
    out.coll++; res.lr.m >= res.big ? out.merge++ : out.frag++;   // 大きいほうより重くなれば「くっつく」
    const put = (q, b) => { const o = q * 16; B[o] = b.p[0]; B[o + 1] = b.p[1]; B[o + 2] = b.p[2]; B[o + 3] = b.m; B[o + 4] = b.v[0]; B[o + 5] = b.v[1]; B[o + 6] = b.v[2]; B[o + 7] = b.R; B[o + 12] = res.e; };
    put(i, res.lr); B[j * 16 + 3] = 0;
    res.frags.forEach((f, k) => { const q = k === 0 ? j : free.pop(); if (q === undefined) { out.dust += f.m; return; } put(q, f); });
    out.dust += res.dust;
  }
  return out;
}
// 熱は1コマに1回まとめて（1歩ぶんの増え方は f32 の目より小さいことがあるため）。dtYr = そのコマで進んだ年
export function heatCPU(S, dtYr, tYr) {
  const { B, n } = S;
  for (let i = 0; i < n; i++) { const o = i * 16; if (B[o + 3] <= 0) continue;
    const r = Math.hypot(B[o], B[o + 1], B[o + 2]);
    B[o + 12] = heatStep(B[o + 12], B[o + 7], r, dtYr * YR, alHeat(tYr));
  }
}
// とても熱いと一気に冷えるので、小分けにして（1回で まわりの温度までの残りの 1/4 より多くは冷やさない。最大 24 回）
export function heatStep(e, R, r, sec, h) {
  const floor = eOfTemp(tEq(r));
  for (let k = 0; k < 24 && sec > 0; k++) {
    const rate = coolRate(e, R, r) + h;
    let dt = sec;
    if (rate < 0 && e > floor) dt = Math.min(sec, 0.25 * (e - floor) / -rate);
    e = Math.max(rate < 0 ? Math.min(e, floor) : 0, e + rate * dt); sec -= dt;
  }
  return e;
}
export function forceCPU(S, F) {
  const { B, n } = S, partner = new Int32Array(n).fill(-1), C2 = cut2(F);
  for (let i = 0; i < n; i++) { const o = i * 16; if (B[o + 3] <= 0) { partner[i] = -1; continue; }
    let ax = 0, ay = 0, az = 0, pot = 0, best = -1, bestQ = 1;
    for (let j = 0; j < n; j++) { const q = j * 16; if (j === i || B[q + 3] <= 0) continue;
      const dx = B[q] - B[o], dy = B[q + 1] - B[o + 1], dz = B[q + 2] - B[o + 2];
      const r2 = dx * dx + dy * dy + dz * dz + EPS2, inv = 1 / Math.sqrt(r2), f = B[q + 3] * inv * inv * inv;
      ax += dx * f; ay += dy * f; az += dz * f; pot -= B[q + 3] * inv;
      if (r2 >= C2) continue;
      const wx = B[q + 4] - B[o + 4], wy = B[q + 5] - B[o + 5], wz = B[q + 6] - B[o + 6], ww = wx * wx + wy * wy + wz * wz;
      const rc = F * (B[q + 7] + B[o + 7]);
      const s = ww > 0 ? Math.min(0, Math.max(-DT, -(dx * wx + dy * wy + dz * wz) / ww)) : 0;
      const mx = dx + wx * s, my = dy + wy * s, mz = dz + wz * s, qq = (mx * mx + my * my + mz * mz) / (rc * rc);
      if (qq < bestQ) { bestQ = qq; best = j; }
    }
    const r2 = B[o] ** 2 + B[o + 1] ** 2 + B[o + 2] ** 2 + EPS2, inv = 1 / Math.sqrt(r2), f = inv * inv * inv;
    ax -= B[o] * f; ay -= B[o + 1] * f; az -= B[o + 2] * f;
    B[o + 8] = G * ax; B[o + 9] = G * ay; B[o + 10] = G * az; B[o + 11] = G * pot; partner[i] = best;
  }
  return partner;
}

// 全体のエネルギー（太陽は止めて置いている）。pot は岩どうし（2回数えるので半分）
export function energy(B, n) {
  let ke = 0, pe = 0;
  for (let i = 0; i < n; i++) { const o = i * 16, m = B[o + 3]; if (m <= 0) continue;
    ke += 0.5 * m * (B[o + 4] ** 2 + B[o + 5] ** 2 + B[o + 6] ** 2);
    pe += 0.5 * m * B[o + 11] - G * m / Math.hypot(B[o], B[o + 1], B[o + 2]);
  }
  return ke + pe;
}
