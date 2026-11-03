// ヘビが進むしくみ — 水平な枝をわたる（枝の上のアコーディオン＋枝のまわりに転がらないつりあい）
// 枝にそった動き（つかむ・のばす・ちぢめる）は木登りの計算 js/tree.js を傾き 0° で使う。
// 新しく解くのは、体全体が枝の軸のまわりに回る角度 φ:
//   重さが回そうとする力 τ = Σ w R sin(θ + φ)（θ = 区切りの、枝のまわりの角度。0 = 真上。ヘビが決める形）
//   止まっている所が出せる、まわりの向きの摩擦の上限 Σ μ N R（N = 重さの押しつけ＋締めつけ）
//   |τ| が上限をこえたら回りだす（勢い I φ'' = τ − 動摩擦）。
// 実物（Astley & Jayne 2007）: 水平ではどの太さでも、左右に曲げたループが枝の上をまたぐアコーディオン。腹の静止摩擦 0.28。
// node でも読める（tools/verify.js branch）。
'use strict';
(function (root) {
  const TREE = typeof window !== 'undefined' && window.TREE ? window.TREE : require('./tree.js');
  const N = TREE.N, G = 9.81;
  const MU_ROLL = 0.28;          // 枝のまわりの向きの静止摩擦（Astley & Jayne 2007 がダクトテープの上で測った腹の静止摩擦）
  const MU_ROLL_K = 0.25;        // 回りだしたあとの動摩擦（推定。静止より少し小さく）
  const FOLD_HALF = 0.03;        // まん中を折りたたむ所の、左右のゆれの半波（m。図の木登りと同じ推定）
  const FELL = 100 * Math.PI / 180;   // これより回ったら「横へ回り落ちた」（そこで計算を止める。実物のラットスネークは逆さまのまま進むこともある）

  function make(o = {}) {
    const p = Object.assign({
      D: 0.03,          // 枝の太さ（直径 m）。実物は 1.6〜21 cm のどれも渡れた
      side: 'both',     // 'both' = ループを左右交互に垂らす、'one' = 片がわだけ
      loop: 0.04,       // つかむループが、枝の真上から左右へ回りこむ長さ（m。枝の表面にそって。推定）
      fold: 0.02,       // まん中を折りたたむ所の左右の幅（m。推定）
      pinch: true,      // つかむ所で枝をはさむか（腹がわへ曲げてつかむ。強さは木登りと同じ余裕 4倍＝推定）
    }, o);
    const t = TREE.make({ D: p.D, slope: 0, horiz: true, safety: p.pinch ? 4 : 1e-6 });
    const s = { p, t, phi: 0, om: 0, rolling: false, fell: false, fallT: 0, th: new Float64Array(N), N: new Float64Array(N), tau: 0, cap: 0 };
    angles(s); balance(s, 0);
    return s;
  }

  // 区切りの、枝のまわりの角度 θ（ヘビが決める形）
  //  つかむ所: 左右に曲げたループが枝の上をまたぐ（1か所で S 字1つ）。巻く途中は、頭がわから先にできていく（形ができかけの間は左右がそろわない）
  //  まん中: 折りたたんだ分だけ、左右に小さくゆれる
  function angles(s) {
    const p = s.p, t = s.t, R = (p.D + t.p.d) / 2, ds = t.p.L / N;
    const Tg = Math.min(Math.PI * 0.95, p.loop / R), Tm = Math.min(Math.PI * 0.9, p.fold / R);
    const zr = [], zf = [];
    for (let i = 0; i < N; i++) { if (t.zone[i] === 1) zr.push(i); if (t.zone[i] === 3) zf.push(i); }
    let sM = 0;
    for (let i = 0; i < N; i++) s.th[i] = 0;
    for (const [list, w, sg] of [[zr, t.wrapR, -1], [zf, t.wrapF, 1]]) {
      list.forEach((i, k) => {
        const q = (k + 0.5) / list.length;
        const a = Math.max(0, Math.min(1, (w * 1.5 - (1 - q)) / 0.5));   // 頭がわ（q = 1）から先に曲がる
        s.th[i] = sg * Tg * a * Math.sin(2 * Math.PI * q);
      });
    }
    for (let i = 0; i < N; i++) if (t.zone[i] === 2) { sM += ds; s.th[i] = t.foldM * Tm * Math.sin(Math.PI * sM / FOLD_HALF); }
    if (p.side === 'one') for (let i = 0; i < N; i++) s.th[i] = Math.abs(s.th[i]);
    s.R = R;
  }

  // まわりの向きのつりあい
  // 枝を押す力 N: 枝にふれている所（枝の真上から ±90° の中）だけが押す。垂れて下にある所の重さは、体（の張り）を伝わってふれている所を押す。
  //   配り方は「N ∝ cos(θ+φ)」として、たての力のつりあい Σ N cos ds = 体重 になるように大きさを決める（推定。体のどこに張りがかかるかは測られていない）
  // 摩擦は枝の表面（半径 D/2）にかかり、重さは体のまん中（半径 R = (D+d)/2）にかかる
  function balance(s, dt) {
    const p = s.p, t = s.t, ds = t.p.L / N, w = t.p.mass * G / t.p.L, R = s.R, r = p.D / 2, mu = TREE.MU[t.p.scales];
    let tau = 0, xc = 0, yc = 0, cc = 0;
    for (let i = 0; i < N; i++) {
      const a = s.th[i] + s.phi;
      tau += w * ds * R * Math.sin(a);
      xc += R * Math.sin(a) / N; yc += R * Math.cos(a) / N;
      cc += Math.max(0, Math.cos(a)) ** 2 * ds;
    }
    const lam = cc > 1e-9 ? t.p.mass * G / cc : 0;
    let cap = 0, kin = 0;
    const Rw = r * s.om;
    for (let i = 0; i < N; i++) {
      const n = lam * Math.max(0, Math.cos(s.th[i] + s.phi)) + Math.max(0, t.n[i] - w);   // 重さの分＋はさむ分
      s.N[i] = n;
      if (t.stuck[i]) {
        // 摩擦は向きごとに上限がある（だ円の範囲）: 枝にそった向きに使っている分だけ、まわりの向きに使える分が減る
        const fa = Math.abs(t.f[i]), ua = mu.bs * n;
        const left = ua > 1e-12 ? Math.max(0, 1 - (fa / ua) ** 2) : 0;
        cap += MU_ROLL * n * Math.sqrt(left) * ds * r;
      }
      // 回っているときの動摩擦: すべる向き（枝にそった速さと、まわりの速さの合成）のうち、まわりの向きの分
      const v = t.v[i], sp = Math.hypot(v, Rw);
      kin += MU_ROLL_K * n * ds * r * (sp > 1e-9 ? Math.abs(Rw) / sp : 1);
    }
    s.tau = tau; s.cap = cap; s.xc = xc; s.yc = yc;
    if (!dt) return;
    const I = t.p.mass * (R * R + t.p.d * t.p.d / 8);   // 体のまん中が半径 R のまわりを回る＋体の太さの分
    if (!s.rolling && Math.abs(tau) > cap) s.rolling = true;
    if (s.rolling) {
      const dir = Math.abs(s.om) > 1e-6 ? Math.sign(s.om) : Math.sign(tau);
      const om1 = s.om + (tau - dir * kin) / I * dt;
      // 動摩擦で回る向きが反対になることはない: 0 をまたいだら止める。回す力がまだ上限をこえていれば、次のコマに回す力の向きへ回りだす
      if (Math.sign(om1) !== dir) { s.om = 0; if (Math.abs(tau) <= cap) s.rolling = false; }
      else s.om = om1;
      s.phi += s.om * dt;
    }
  }

  function step(s, dt) {
    if (s.fell) { s.fallT += dt; return; }
    TREE.step(s.t, dt);
    angles(s); balance(s, dt);
    if (Math.abs(s.phi) > FELL) { s.fell = true; s.fallT = 0; }
  }

  // まとめ: 何秒か進めて、進んだ距離・落ちたか・回る力が上限の何割まで来たか
  function measure(o, sec = 16, dt = 0.004) {
    const s = make(o), x0 = s.t.Z;
    let useMax = 0, phiMax = 0, fellAt = null;
    for (let tt = 0; tt < sec; tt += dt) {
      step(s, dt);
      if (s.cap > 1e-12) useMax = Math.max(useMax, Math.abs(s.tau) / s.cap);
      phiMax = Math.max(phiMax, Math.abs(s.phi));
      if (s.fell && fellAt === null) fellAt = s.t.t;
    }
    return { speed: (s.t.Z - x0) / sec, fellAt, useMax, phiMax: phiMax * 180 / Math.PI };
  }

  const API = { N, make, step, measure, MU_ROLL };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.BRANCH = API;
})(typeof window !== 'undefined' ? window : globalThis);
