// メトロノームがそろうまで — 物理（板＋N 本の振り子の運動方程式。近似なし）
// 座標: 板の位置 x、振り子の角度 θi（真下が 0、右へふれると +）。
// 運動エネルギー T = ½ Mtot ẋ² + Σ [ S ẋ θ̇i cosθi + ½ Ii θ̇i² ]、位置エネルギー V = −Σ S g cosθi
//   Mtot: 板＋メトロノームの本体ぜんぶ（板の上で横に動く質量）、S = m·r（振り子の質量×重心までの長さ）、Ii: 支点まわりの慣性モーメント
// ラグランジュの式:
//   Ii θ̈i + S cosθi ẍ + S g sinθi = Ii fi            fi = −ε[(θi/θ0)² − 1] θ̇i  （脱進機＋振り子の摩擦。Pantaleone 2002 の式1の van der Pol 項）
//   Mtot ẍ + Σ S (cosθi θ̈i − sinθi θ̇i²) = −c ẋ      （c: 板の動きの摩擦。ぬれた床）
// θ̈i を消すと ẍ が1つの式で決まる（N+1 元の連立を O(N) で厳密に解く）。
'use strict';
const PHYS = (() => {
  const g = 9.81;
  // Pantaleone 2002 の値（本文 II.B）。208 拍/分（104 往復/分）の設定
  const P0 = {
    mMet: 0.094,       // メトロノーム1台 94 g
    mBoard: 0.058,     // 板 58 g
    x0: 0.00088,       // 板のゆれの長さの目安 x0 = m r/(M+2m) = 0.088 cm（2台のとき）
    omegaPen: 2 * Math.PI * 104 / 60, // 振れているときの角振動数（104 往復/分 = 10.9 rad/s）
    theta0: 0.39,      // van der Pol の角度（ふれはばの約半分。最大のふれ約 45°）
    mu: 0.010,         // van der Pol の強さ（無次元。論文が実験に合わせて決めた値）
  };
  // S = m r は x0 から: x0 (M + 2m) = m r
  const S = P0.x0 * (P0.mBoard + 2 * P0.mMet);
  // 小さい振れの角振動数 ω0。ふれはば A の振り子は ω ≈ ω0 (1 − A²/16)。A ≈ 2θ0 で 104 往復/分になるように
  const A = 2 * P0.theta0;
  const omega0 = P0.omegaPen / (1 - A * A / 16);
  const I0 = S * g / (omega0 * omega0);   // 支点まわりの慣性モーメント
  // もう1つの押し方（このアプリの推定）: 振り子の摩擦は、ふれはばが落ちつく速さを van der Pol と同じ μω にそろえる。
  // 押す強さ K は、1往復で摩擦が奪うエネルギー（γ·π·ω·A²、I で割った量）＝ 押す仕事（4·K·θw）から、ふれはば A になるように
  const KICK = { thw: 0.10, gam: P0.mu * omega0 };
  KICK.K = KICK.gam * Math.PI * omega0 * A * A / (4 * KICK.thw);

  // 系を作る。opt: {n, spread（振動数のばらつき、比）, addMass（板に足すおもり kg）, damp（板の摩擦 c、N·s/m）}
  function make(opt) {
    const n = opt.n;
    const sys = {
      n, S, g, theta0: P0.theta0,
      eps: P0.mu * omega0,           // 次元つきの van der Pol の強さ（1/s）
      Mtot: P0.mBoard + n * P0.mMet + (opt.addMass || 0),
      c: opt.damp || 0,
      pinned: false,                 // 板をおさえている
      drive: true,                   // 脱進機（false で摩擦も駆動もなし。保存則の検証用）
      esc: opt.esc || 'vdp',         // 押し方: 'vdp'（論文の式）／'kick'（まん中で押す）
      kgam: KICK.gam, kK: KICK.K,
      I: new Float64Array(n), w0: new Float64Array(n),
      // 状態 y = [x, v, θ0, ω0, θ1, ω1, ...]
      y: new Float64Array(2 + 2 * n), t: 0,
    };
    setSpread(sys, opt.spread || 0, opt.seedDetune);
    return sys;
  }
  // 振動数のばらつき: おもりの位置を変える＝慣性モーメントを変える（S はそのまま）
  function setSpread(sys, spread, detune) {
    for (let i = 0; i < sys.n; i++) {
      const d = detune ? detune[i] : (sys.n === 1 ? 0 : (i / (sys.n - 1) - 0.5) * 2);  // −1〜1
      const w = omega0 * (1 + spread * d * 0.5);
      sys.w0[i] = w; sys.I[i] = sys.S * g / (w * w);
    }
  }

  // 加速度を計算して dy に書く
  function deriv(sys, y, dy) {
    const n = sys.n, S = sys.S, th0 = sys.theta0, eps = sys.drive ? sys.eps : 0;
    const v = y[1];
    let num = -(sys.drive ? sys.c : 0) * v, den = sys.Mtot;
    // fi と、ẍ の式の項をまとめる
    for (let i = 0; i < n; i++) {
      const th = y[2 + 2 * i], om = y[3 + 2 * i], I = sys.I[i];
      const c = Math.cos(th), s = Math.sin(th);
      let f;
      if (sys.esc === 'kick') {
        // まん中で押す形: 振り子の摩擦 −γω ＋ |θ| < θw のあいだ動く向きに一定の押し K
        // （角の切りかえは 0.01 rad・0.05 rad/s の幅でなめらかに。RK4 の精度を保つため）
        const win = 0.5 * (1 - Math.tanh((Math.abs(th) - KICK.thw) / 0.01));
        f = sys.drive ? -sys.kgam * om + sys.kK * win * Math.tanh(om / 0.05) : 0;
      } else {
        const q = th / th0;
        f = -eps * (q * q - 1) * om;
      }
      dy[3 + 2 * i] = f - S * g * s / I;           // あとで −S cos ẍ / I を足す
      num += -S * c * dy[3 + 2 * i] + S * s * om * om;
      den -= S * S * c * c / I;
    }
    const ax = sys.pinned ? 0 : num / den;
    dy[0] = sys.pinned ? 0 : v; dy[1] = ax;
    for (let i = 0; i < n; i++) {
      const th = y[2 + 2 * i];
      dy[2 + 2 * i] = y[3 + 2 * i];
      dy[3 + 2 * i] -= S * Math.cos(th) * ax / sys.I[i];
    }
  }

  // RK4 で dt 進める
  const buf = {};
  function tmp(k, len) { if (!buf[k] || buf[k].length !== len) buf[k] = new Float64Array(len); return buf[k]; }
  function rk4(sys, dt) {
    const y = sys.y, L = y.length;
    const k1 = tmp('k1', L), k2 = tmp('k2', L), k3 = tmp('k3', L), k4 = tmp('k4', L), yt = tmp('yt', L);
    deriv(sys, y, k1);
    for (let j = 0; j < L; j++) yt[j] = y[j] + 0.5 * dt * k1[j];
    deriv(sys, yt, k2);
    for (let j = 0; j < L; j++) yt[j] = y[j] + 0.5 * dt * k2[j];
    deriv(sys, yt, k3);
    for (let j = 0; j < L; j++) yt[j] = y[j] + dt * k3[j];
    deriv(sys, yt, k4);
    for (let j = 0; j < L; j++) y[j] += dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    if (sys.pinned) y[1] = 0;
    sys.t += dt;
  }

  // 保存量（摩擦と駆動を切ったとき一定になるはず）
  function energy(sys) {
    const y = sys.y, v = y[1]; let E = 0.5 * sys.Mtot * v * v;
    for (let i = 0; i < sys.n; i++) {
      const th = y[2 + 2 * i], om = y[3 + 2 * i];
      E += sys.S * v * om * Math.cos(th) + 0.5 * sys.I[i] * om * om - sys.S * g * Math.cos(th);
    }
    return E;
  }
  function momentum(sys) {
    const y = sys.y; let p = sys.Mtot * y[1];
    for (let i = 0; i < sys.n; i++) p += sys.S * y[3 + 2 * i] * Math.cos(y[2 + 2 * i]);
    return p;
  }
  // 位相（表示用）: 角度と角速度から。0 = 右のはしで止まった瞬間
  function phase(sys, i) {
    const th = sys.y[2 + 2 * i], om = sys.y[3 + 2 * i];
    return Math.atan2(-om / sys.w0[i], th);
  }
  return { P0, S, omega0, I0, g, KICK, make, setSpread, deriv, rk4, energy, momentum, phase };
})();
if (typeof module !== 'undefined') module.exports = PHYS;
