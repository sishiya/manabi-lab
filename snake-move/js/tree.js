// ヘビが進むしくみ — 木の幹を登る（つかんでは伸びる「アコーディオン」）
// 体を幹の向き（上へ z）の1本の線で考える。ヘビが決めるのは「どこを巻きつけるか・どこを折りたたむか・どれだけ締めつけるか」だけ。
// 体全体が上へ・下へどれだけ動くかは、重さと、幹との摩擦（止まっている所は静止摩擦、すべる所は動摩擦）のつりあいで毎コマ解く。
// node でも読める（tools/verify.js tree）。
'use strict';
(function (root) {
  const N = 90;               // 体を 90 個に区切る（i = 0 が尾、N-1 が頭）
  const G = 9.81;

  // 幹の上でのウロコの摩擦（Marvi & Hu 2012 の表2。発泡スチロールの上のコーンスネーク）
  //   起きている（ウロコを立てる）: 前へ 静止 0.51・動 0.49、うしろへ 静止 0.88・動 0.79
  //   眠っている（立てない）     : 前へ 静止 0.30・動 0.21、うしろへ 静止 0.35・動 0.35
  const MU = {
    dig:  { fs: 0.51, fk: 0.49, bs: 0.88, bk: 0.79 },
    flat: { fs: 0.30, fk: 0.21, bs: 0.35, bk: 0.35 },
  };

  function make(o = {}) {
    const p = Object.assign({
      L: 0.61, mass: 0.042,    // Marvi & Hu 2012 のコーンスネーク（61 cm・42 g）
      d: 0.014,                // 体の太さ（推定）
      D: 0.04,                 // 幹の太さ（直径 m）
      slope: 90,               // 幹の傾き（度。90 = まっすぐ立った幹）
      tau: 4,                  // 1回のつかみなおしの時間（秒。推定）
      safety: 4,               // 締めつけの余裕（必要な力の何倍。Marvi & Hu 2012 では最大4倍）
      scales: 'dig',           // ウロコを立てる／立てない
      order: 'right',          // 'right' = 上をつかんでから下を放す、'wrong' = 下を先に放す
      fold: 0.45,              // 折りたたんだ所の、たての長さの割合（推定）
      tailLen: 0.07, headLen: 0.07,
    }, o);
    const s = {
      p, t: 0, Z: 0.4, V: 0,          // Z = 尾の先の高さ（m）、V = その速さ
      z: new Float64Array(N), v: new Float64Array(N),   // 各区切りの高さと速さ
      zeta: new Float64Array(N), zdot: new Float64Array(N),
      n: new Float64Array(N),          // 幹を押す力（N/m）
      f: new Float64Array(N),          // 幹からの摩擦（N/m。+ が上向き）
      zone: new Int8Array(N),          // 0 尾 1 下のつかみ 2 まん中 3 上のつかみ 4 頭
      wrapR: 1, wrapF: 0, foldM: 1, sqR: 1, sqF: 0,
      stuck: new Uint8Array(N), use: 0, cap: 0, need: 0, sqN: 0,
      fell: false, fallT: 0, climbed: 0, ok: true,
    };
    layout(s);
    gait(s, 0);
    shape(s);
    for (let i = 0; i < N; i++) s.z[i] = s.Z + s.zeta[i];
    return s;
  }

  // 体の区切り: 尾・下のつかみ・まん中・上のつかみ・頭。つかむには幹のまわり（πD）くらいの長さがいる（Savidge ほか 2021）
  function layout(s) {
    const p = s.p, circ = Math.PI * (p.D + p.d);
    const free = p.L - p.tailLen - p.headLen;
    const minM = 0.05;                         // まん中は少なくとも 5 cm
    const lg = Math.min(circ, (free - minM) / 2);
    s.lg = lg; s.lm = free - 2 * lg; s.circ = circ;
    s.encircle = lg >= circ * 0.999;           // ひと回りできないと締めつけられない
    // 巻いた所の、たての長さの割合（らせんのピッチを体の太さの2倍とした。推定）
    const pitch = 2 * p.d;
    s.cw = pitch / Math.hypot(circ, pitch);
    const ds = p.L / N;
    for (let i = 0; i < N; i++) {
      const si = (i + 0.5) * ds;
      s.zone[i] = si < p.tailLen ? 0 : si < p.tailLen + lg ? 1 : si < p.tailLen + lg + s.lm ? 2 : si < p.L - p.headLen ? 3 : 4;
    }
  }

  const sm = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  // 1回のつかみなおしの中の、いまの形（u = 0〜1）
  //  ①下でつかんだまま、まん中を伸ばす（頭が上へ） ②上を巻いてつかむ ③下を放してほどく
  //  ④まん中を折りたたむ（下が引き上がる） ⑤下を巻いてつかむ ⑥上を放してほどく
  // 'wrong' は ②と③が入れかわる（上をつかむ前に下を放す）
  const PH = [0, 0.25, 0.375, 0.5, 0.75, 0.875, 1];
  // 巻く・締める・ゆるめる・ほどくは、つかみ1か所ごとに順に: 巻く（7割の時間）→ 締める（3割）／ゆるめる（3割）→ ほどく（7割）
  const grab = x => ({ w: sm(x / 0.7), q: sm((x - 0.7) / 0.3) });
  const release = x => ({ w: 1 - sm((x - 0.3) / 0.7), q: 1 - sm(x / 0.3) });
  function gait(s, t) {
    const u = ((t / s.p.tau) % 1 + 1) % 1;
    const x = k => Math.max(0, Math.min(1, (u - PH[k]) / (PH[k + 1] - PH[k])));
    const HOLD = { w: 1, q: 1 }, OFF = { w: 0, q: 0 };
    let F, R, fM;
    if (u < PH[1]) { R = HOLD; F = OFF; fM = 1 - sm(x(0)); }
    else if (u < PH[3]) {
      fM = 0;
      if (s.p.order === 'right') { F = u < PH[2] ? grab(x(1)) : HOLD; R = u < PH[2] ? HOLD : release(x(2)); }
      else { R = u < PH[2] ? release(x(1)) : OFF; F = u < PH[2] ? OFF : grab(x(2)); }
    }
    else if (u < PH[4]) { R = OFF; F = HOLD; fM = sm(x(3)); }
    else if (u < PH[5]) { F = HOLD; fM = 1; R = grab(x(4)); }
    else { R = HOLD; fM = 1; F = release(x(5)); }
    s.u = u; s.wrapR = R.w; s.wrapF = F.w; s.foldM = fM; s.sqR = R.q; s.sqF = F.q;
    s.phase = u < PH[1] ? 1 : u < PH[2] ? 2 : u < PH[3] ? 3 : u < PH[4] ? 4 : u < PH[5] ? 5 : 6;
  }

  // 各区切りの、たての長さの割合 c（1 = まっすぐ上へ）
  function cOf(s, i) {
    const z = s.zone[i];
    if (z === 1) return 1 - s.wrapR * (1 - s.cw);
    if (z === 3) return 1 - s.wrapF * (1 - s.cw);
    if (z === 2) return 1 - s.foldM * (1 - s.p.fold);
    return 1;
  }
  // 尾の先から積み上げた高さ（ζ）
  function shape(s) {
    const ds = s.p.L / N;
    let z = 0;
    for (let i = 0; i < N; i++) { const c = cOf(s, i); s.zeta[i] = z + 0.5 * c * ds; z += c * ds; }
  }

  // 幹を押す力（N/m）: 締めつけ（巻いてひと回りしている所だけ）＋ 横にねた幹の上にのる重さ
  function normals(s) {
    const p = s.p, mu = MU[p.scales], rho = p.mass / p.L;
    const sn = Math.sin(p.slope * Math.PI / 180), cs = Math.cos(p.slope * Math.PI / 180);
    // 下へすべらないのに必要な締めつけ: 重さの坂の分 m g sinθ と、ほかの所が幹の上をすべる摩擦を、つかみ1か所の静止摩擦だけで支える
    s.need = Math.max(0, p.mass * G * sn + mu.fk * rho * G * cs * (p.L - s.lg) - mu.bs * rho * G * cs * s.lg) / (mu.bs * s.lg);
    s.sqN = s.encircle ? p.safety * s.need : 0;
    for (let i = 0; i < N; i++) {
      const z = s.zone[i];
      const sq = z === 1 ? s.sqR : z === 3 ? s.sqF : 0;
      s.n[i] = sq * s.sqN + rho * G * cs;
    }
  }

  // dt 秒すすめる。新しい速さ V は「m (V − V0)/dt = 摩擦の合計 − 重さの坂の分」を満たすように二分法で探す
  // （摩擦は向きで決まる大きさの一定の力。止まっている区切りでは静止摩擦の範囲の中のどれか、になる）
  function step(s, dt) {
    const p = s.p, ds = p.L / N, mu = MU[p.scales];
    const sn = Math.sin(p.slope * Math.PI / 180);
    const zeta0 = Float64Array.from(s.zeta);
    s.t += dt;
    gait(s, s.t); shape(s); normals(s);
    let zbar = 0;
    for (let i = 0; i < N; i++) { s.zdot[i] = (s.zeta[i] - zeta0[i]) / dt; zbar += s.zdot[i] / N; }
    // 勢い（慣性）は重心の速さ Vc = V + （ζ̇ の平均）で考える（尾の先の速さ V ではなく）
    const Vc0 = s.Vc || 0;
    if (s.fell) {
      s.fallT += dt;
    }
    const V0 = s.V, m = p.mass;
    const TOL = 1e-7;            // これより遅ければ「止まっている」（m/s）
    // 区切り i の速さ v のときの摩擦（+ が上向き）。v ≈ 0 なら kind で静止の上限を返す
    const fk = (n, v) => v > TOL ? -mu.fk * n : v < -TOL ? mu.bk * n : 0;
    // G(V) = m(V−V0)/dt + m g sinθ − Σ 動いている区切りの摩擦。止まっている区切りが受けもてるのは −μs,f n 〜 +μs,b n
    function Gx(V, side) {
      let F = 0;
      for (let i = 0; i < N; i++) {
        const v = V + s.zdot[i];
        if (Math.abs(v) <= TOL) F += side > 0 ? -mu.fs * s.n[i] * ds : mu.bs * s.n[i] * ds;
        else F += fk(s.n[i], v) * ds;
      }
      return m * (V + zbar - Vc0) / dt + m * G * sn - F;
    }
    // 二分法（G は V について増える）
    let lo = V0 - 50 * dt - 1, hi = V0 + 50 * dt + 1;
    for (let it = 0; it < 80; it++) { const mid = 0.5 * (lo + hi); if (Gx(mid, 0) > 0) hi = mid; else lo = mid; }
    let V = 0.5 * (lo + hi);
    // いちばん近い「止まれる速さ」（V = −ζ̇i）へ寄せて、そこで止まれるか確かめる
    let best = null, bd = 1e-4;
    for (let i = 0; i < N; i++) { const c = -s.zdot[i], dd = Math.abs(c - V); if (dd < bd && s.n[i] > 0) { bd = dd; best = c; } }
    if (best !== null && Gx(best, -1) <= 0 && Gx(best, 1) >= 0) V = best;
    s.V = V;
    s.Z += V * dt;
    // 地面より下へは行かない（すべり落ちたら地面で止まる）
    if (s.Z < 0) { s.Z = 0; s.V = 0; s.Vc = 0; if (!s.fell) { s.fell = true; s.fallT = 0; } }
    // 力のまとめ: 止まっている区切りが受けもっている摩擦と、その上限
    let cap = 0, fStatic = 0, Fmove = 0;
    for (let i = 0; i < N; i++) {
      s.v[i] = s.V + s.zdot[i];
      s.z[i] = s.Z + s.zeta[i];
      const st = Math.abs(s.v[i]) <= TOL * 10 && s.n[i] > 0;
      s.stuck[i] = st ? 1 : 0;
      if (st) cap += mu.bs * s.n[i] * ds;
      else { s.f[i] = fk(s.n[i], s.v[i]); Fmove += s.f[i] * ds; }
    }
    fStatic = m * (s.V + zbar - Vc0) / dt + m * G * sn - Fmove;
    s.Vc = s.V + zbar;  // 止まっている所が上向きに出している摩擦
    s.fStatic = fStatic; s.cap = cap;
    s.use = cap > 1e-9 ? Math.min(9, Math.max(0, fStatic) / cap) : 0;
    let nst = 0;
    for (let i = 0; i < N; i++) if (s.stuck[i]) { s.f[i] = cap > 0 ? fStatic * (mu.bs * s.n[i] * ds) / cap / ds : 0; nst++; }
    s.stuckFrac = nst / N;
    s.climbed = s.Z;
  }

  // まとめ: 何周期かで登った高さ・速さ
  function measure(o, periods = 4, dt = 0.004) {
    const s = make(o);
    const z0 = s.Z;
    let fellAt = null, useMax = 0;
    for (let t = 0; t < s.p.tau * periods; t += dt) { step(s, dt); if (s.fell && fellAt === null) fellAt = s.t; useMax = Math.max(useMax, s.use); }
    return { up: (s.Z - z0) / periods, speed: (s.Z - z0) / (s.p.tau * periods), fellAt, lg: s.lg, lm: s.lm, encircle: s.encircle, need: s.need, sqN: s.sqN, useMax, cw: s.cw };
  }

  const API = { N, MU, make, step, measure, layout, PH };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TREE = API;
})(typeof window !== 'undefined' ? window : globalThis);
