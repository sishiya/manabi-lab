// ヘビが進むしくみ — 横ばい（立体）。体を持ち上げた立体の形まで入れて計算する
// 体の形: 左右に曲げる波（ヨー）と上下に曲げる波（ピッチ）を、同じ波長・同じ速さで頭から尾へ送る（Marvi ほか 2014・Astley ほか 2015 の「2つの波」）。
//   接線の向き = (cos ψ cos φ, sin ψ cos φ, sin φ)、ψ = ∫ 左右の曲がり、φ = ∫ 上下の曲がり。体の長さは立体の線の長さ（上から見ると、傾いた所は短い）。
// 地面: 体がめりこんだ深さに比例して押し返す（ばね）。重さ・傾き2つのつりあい（3式）から、体の高さと傾きを毎コマ決める → どこがふれ、どれだけ押すかが決まる。
// 地面にそった動き（重心の速さ U,V・回る速さ W）は、ふれている所の摩擦（すべる向きと逆、押す力 × μ）と勢いのつりあいをニュートン法で解く（ground.js と同じ）。
// node でも読める（tools/verify.js side）。
'use strict';
(function (root) {
  const N = 80;            // ground.js と同じ（図・説明の部品を共通に使う）
  const G = 9.81;

  function make(o = {}) {
    const p = Object.assign({
      L: 0.48, mass: 0.098,     // ヨコバイガラガラヘビ（Marvi ほか 2014: 48 cm・98 g）
      tau: 2,                   // 波1回の時間（推定）
      lam: 0.5,                 // 波長（体長あたり。ロボットの 0.5 L。体に2波 → いつも2か所でふれる）
      Ah: 2.2, Av: 1.0,         // アーチの左右のふくらみ・上下の傾き（rad。推定: 跡の角度 33°・止まる所 44% に合うよう選んだ）
      delta: 1.51,              // 2つの波のずれ（Marvi ほか 2014: 1.51 ± 0.17 rad）
      sink: 0.004,              // 体を平らに置いたときのめりこみ（m。地面のやわらかさ。0.004 で、ふれている所が約 1.2 cm めりこむ = 砂の実測 1.4 ± 1.3 cm（Marvi ほか 2014））
      mu: 0.5, aniso: 1, shape: 'arch', contact: 0.4, inert: 1,   // 'arch' = ふれる所はまっすぐ・持ち上げた所はアーチ、'wave' = なめらかな2つの波（くらべる用）        // 摩擦（どの向きも同じ。大きさは動き方に効かない）
    }, o);
    const s = { p, t: 0, X: 0, Y: 0, TH: 0, U: 0, V: 0, W: 0,
      x: new Float64Array(N), y: new Float64Array(N), z: new Float64Array(N),
      vx: new Float64Array(N), vy: new Float64Array(N), fx: new Float64Array(N), fy: new Float64Array(N),
      tx: new Float64Array(N), ty: new Float64Array(N), nu: new Float64Array(N), kap: new Float64Array(N), ok: true };
    place(s, 0);
    return s;
  }

  // 体の中から見た立体の形（重心が原点・左右の向きの平均が 0）
  function shapeAt(s, t, out) {
    const p = s.p, ds = p.L / N, L = p.L, k = 2 * Math.PI / (p.lam * L);
    const bx = out.bx || (out.bx = new Float64Array(N)), by = out.by || (out.by = new Float64Array(N)), bz = out.bz || (out.bz = new Float64Array(N));
    const bt = out.bt || (out.bt = new Float64Array(N)), kh = out.kh || (out.kh = new Float64Array(N));
    // まず向き（左右 ψ・上下 φ）を積み上げ、それぞれの平均を引く（体全体が傾かないように）
    const PS = out.ps || (out.ps = new Float64Array(N)), PH = out.ph || (out.ph = new Float64Array(N));
    let psi = 0, phi = 0, kv0 = 0;
    for (let i = 0; i < N; i++) {
      const si = (i + 0.5) * ds, w = k * si + 2 * Math.PI * t / p.tau;     // s を尾から測るので、波は頭から尾へ
      if (p.shape === 'arch') {
        // ふれる所はまっすぐ・平ら、持ち上げた所はアーチ（上から見ると片がわへふくらみ、横から見ると山）
        const f = ((w / (2 * Math.PI)) % 1 + 1) % 1, c = p.contact;
        let ya = 0, pa = 0;
        if (f >= c / 2 && f < 1 - c / 2) { const q = (f - c / 2) / (1 - c); ya = p.Ah * (1 - Math.cos(2 * Math.PI * q)) / 2; pa = p.Av * Math.sin(2 * Math.PI * q); }
        PS[i] = ya; PH[i] = pa; kh[i] = 0;
      } else {
        kh[i] = p.Ah * k * Math.cos(w);
        const kv = p.Av * k * Math.cos(w + p.delta);
        if (i > 0) { psi += 0.5 * (kh[i - 1] + kh[i]) * ds; phi += 0.5 * (kv0 + kv) * ds; }
        kv0 = kv; PS[i] = psi; PH[i] = phi;
      }
    }
    let mp = 0, mf = 0;
    for (let i = 0; i < N; i++) { mp += PS[i] / N; mf += PH[i] / N; }
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < N; i++) {
      PS[i] -= mp; PH[i] -= mf;
      if (i > 0) {
        const pm = 0.5 * (PS[i - 1] + PS[i]), fm = 0.5 * (PH[i - 1] + PH[i]);
        x += Math.cos(pm) * Math.cos(fm) * ds; y += Math.sin(pm) * Math.cos(fm) * ds; z += Math.sin(fm) * ds;
      }
      bx[i] = x; by[i] = y; bz[i] = z; bt[i] = PS[i];
    }
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < N; i++) { mx += bx[i] / N; my += by[i] / N; mz += bz[i] / N; }
    for (let i = 0; i < N; i++) { bx[i] -= mx; by[i] -= my; bz[i] -= mz; }
    return out;
  }

  // 地面にのせる: 高さ z0 と傾き a（x 向き）・b（y 向き）を、重さと2つの傾きのつりあいで決める
  function support(s, sh) {
    const p = s.p, ds = p.L / N, W = p.mass * G;
    const kk = W / (p.L * p.sink);              // ばねの固さ（1 m あたり・めりこみ 1 m あたり）
    let z0 = -Math.min(...sh.bz), a = 0, b = 0;
    const act = new Uint8Array(N);
    for (let it = 0; it < 30; it++) {
      // めりこむ所 = 高さが 0 より下
      let changed = false;
      for (let i = 0; i < N; i++) {
        const zw = z0 + sh.bz[i] + a * sh.bx[i] + b * sh.by[i], on = zw < 0 ? 1 : 0;
        if (on !== act[i]) { act[i] = on; changed = true; }
      }
      if (!changed && it > 0) break;
      // Σ k(−z) ds = W、Σ k(−z) x ds = 0、Σ k(−z) y ds = 0（z = z0 + bz + a x + b y）
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
      let n = 0;
      for (let i = 0; i < N; i++) {
        if (!act[i]) continue; n++;
        const v = [1, sh.bx[i], sh.by[i]];
        for (let r1 = 0; r1 < 3; r1++) { for (let c1 = 0; c1 < 3; c1++) M[r1][c1] += v[r1] * v[c1] * kk * ds; r[r1] += -v[r1] * sh.bz[i] * kk * ds; }
      }
      r[0] -= W;
      if (n < 3) { z0 -= p.sink; continue; }   // 3点より少ないと傾きが決まらない → 少し下げてもう一度
      // M [z0 a b] = r（M は −k を外に出した形）
      const sol = lin3(M, r);
      if (!sol) break;
      z0 = sol[0]; a = sol[1]; b = sol[2];
    }
    for (let i = 0; i < N; i++) {
      const zw = z0 + sh.bz[i] + a * sh.bx[i] + b * sh.by[i];
      s.z[i] = Math.max(0, zw);
      s.nu[i] = zw < 0 ? -zw * kk : 0;
    }
    s.tilt = [a, b];
  }

  function lin3(A, b) {
    const m = A.map((r, i) => [r[0], r[1], r[2], b[i]]);
    for (let c = 0; c < 3; c++) {
      let piv = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
      if (Math.abs(m[piv][c]) < 1e-14) return null;
      [m[c], m[piv]] = [m[piv], m[c]];
      for (let r = 0; r < 3; r++) if (r !== c) { const q = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= q * m[c][k]; }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }

  const EPS = 1e-5;
  function resid(s, sh, dsh, U, V, W, out, keep, inr) {
    const p = s.p, ds = p.L / N;
    const c = Math.cos(s.TH), sn = Math.sin(s.TH);
    let Fx = 0, Fy = 0, M = 0, I = 0;
    for (let i = 0; i < N; i++) {
      const rx = c * sh.bx[i] - sn * sh.by[i], ry = sn * sh.bx[i] + c * sh.by[i];
      const dvx = c * dsh.bx[i] - sn * dsh.by[i], dvy = sn * dsh.bx[i] + c * dsh.by[i];
      const vx = U - W * ry + dvx, vy = V + W * rx + dvy;
      const sp = Math.sqrt(vx * vx + vy * vy + EPS * EPS);
      const fx = -p.mu * s.nu[i] * vx / sp, fy = -p.mu * s.nu[i] * vy / sp;
      Fx += fx * ds; Fy += fy * ds; M += (rx * fy - ry * fx) * ds; I += (rx * rx + ry * ry) * ds;
      if (keep) {
        const th = sh.bt[i] + s.TH;
        s.vx[i] = vx; s.vy[i] = vy; s.fx[i] = fx; s.fy[i] = fy; s.tx[i] = Math.cos(th); s.ty[i] = Math.sin(th);
        s.x[i] = s.X + rx; s.y[i] = s.Y + ry; s.kap[i] = sh.kh[i];
      }
    }
    if (inr) {
      const m = p.mass * p.inert, rho = m / p.L;
      Fx -= m * (U - inr.U) / inr.dt; Fy -= m * (V - inr.V) / inr.dt; M -= rho * I * (W - inr.W) / inr.dt;
    }
    out[0] = Fx; out[1] = Fy; out[2] = M / p.L;
  }

  // つりあいの解き方: 摩擦（どの向きも同じ）は「すべりの仕事率 Σ μ n |v| がいちばん小さい動き」と同じ。
  // くり返し重みつき最小二乗（重み = μ n / √(|v|² + ε²)）で探す。止まる所（|v| → 0）でも安定に解ける。勢いは前の速さへ引きもどす項として入れる
  const VEPS = 2e-4;   // m/s
  function solve(s, sh, dsh, inr) {
    const p = s.p, ds = p.L / N, c = Math.cos(s.TH), sn = Math.sin(s.TH);
    const R = [], D = [], Wn = [];
    let I = 0;
    for (let i = 0; i < N; i++) {
      const rx = c * sh.bx[i] - sn * sh.by[i], ry = sn * sh.bx[i] + c * sh.by[i];
      I += (rx * rx + ry * ry) * ds;
      if (s.nu[i] <= 0) continue;
      R.push([rx, ry]); D.push([c * dsh.bx[i] - sn * dsh.by[i], sn * dsh.bx[i] + c * dsh.by[i]]); Wn.push(p.mu * s.nu[i] * ds);
    }
    const m = p.mass * p.inert, Iz = m / p.L * I;
    let x = [s.U, s.V, s.W];
    for (let it = 0; it < 60; it++) {
      const A = [[m / inr.dt, 0, 0], [0, m / inr.dt, 0], [0, 0, Iz / inr.dt]], b = [m / inr.dt * inr.U, m / inr.dt * inr.V, Iz / inr.dt * inr.W];
      for (let j = 0; j < R.length; j++) {
        const [rx, ry] = R[j], [dvx, dvy] = D[j];
        const vx = x[0] - x[2] * ry + dvx, vy = x[1] + x[2] * rx + dvy;
        const w = Wn[j] / Math.sqrt(vx * vx + vy * vy + VEPS * VEPS);
        // v = a·x + d、a の行: [1, 0, −ry] と [0, 1, rx]
        const ax = [1, 0, -ry], ay = [0, 1, rx];
        for (let r = 0; r < 3; r++) { for (let q = 0; q < 3; q++) A[r][q] += w * (ax[r] * ax[q] + ay[r] * ay[q]); b[r] -= w * (ax[r] * dvx + ay[r] * dvy); }
      }
      const nx = lin3(A, b);
      if (!nx) break;
      const ch = Math.abs(nx[0] - x[0]) + Math.abs(nx[1] - x[1]) + Math.abs(nx[2] - x[2]) * p.L;
      x = nx;
      if (ch < 1e-7) break;
    }
    s.U = x[0]; s.V = x[1]; s.W = x[2];
    return true;
  }

  const A1 = {}, A2 = {};
  function place(s, dt) {
    const sh = shapeAt(s, s.t, A1), h = 1e-4 * s.p.tau, sh2 = shapeAt(s, s.t + h, A2);
    const dsh = s._dsh || (s._dsh = { bx: new Float64Array(N), by: new Float64Array(N) });
    for (let i = 0; i < N; i++) { dsh.bx[i] = (sh2.bx[i] - sh.bx[i]) / h; dsh.by[i] = (sh2.by[i] - sh.by[i]) / h; }
    support(s, sh);
    if (dt > 0) s.ok = solve(s, sh, dsh, { U: s.U, V: s.V, W: s.W, dt });
    // 体の中の向きの変化を shapeAt の結果から取り出すため、毎回作りなおす
    s._sh = { bx: Float64Array.from(sh.bx), by: Float64Array.from(sh.by), bt: Float64Array.from(sh.bt), kh: Float64Array.from(sh.kh) };
    resid(s, s._sh, dsh, s.U, s.V, s.W, [0, 0, 0], true, null);
  }

  function step(s, dt) {
    s.t += dt;
    place(s, dt);
    s.X += s.U * dt; s.Y += s.V * dt; s.TH += s.W * dt;
    resid(s, s._sh, s._dsh, s.U, s.V, s.W, [0, 0, 0], true, null);
  }

  // まとめ: 速さ・跡と進む向きの角度・止まっている所の割合・ふれている所のすべり・めりこみ
  function measure(o, periods = 4) {
    const s = make(o), dt = s.p.tau / 200;
    for (let t = 0; t < s.p.tau * 2; t += dt) step(s, dt);
    const x0 = s.X, y0 = s.Y, t0 = s.t;
    let cx = 0, cy = 0, sl = 0, sw = 0, cont = 0, n = 0, sink = 0, zmax = 0, ncont = 0;
    const samples = [];
    for (let t = 0; t < s.p.tau * periods; t += dt) {
      step(s, dt);
      let groups = 0, prev = false;
      for (let i = 0; i < N; i++) {
        const on = s.nu[i] > 0;
        if (on) { const w = s.nu[i], a = 2 * Math.atan2(s.ty[i], s.tx[i]); cx += w * Math.cos(a); cy += w * Math.sin(a); sl += w * Math.hypot(s.vx[i], s.vy[i]); sw += w; cont++; sink = Math.max(sink, s.nu[i]); }
        if (on && !prev) groups++;
        prev = on; zmax = Math.max(zmax, s.z[i]); n++;
      }
      ncont += groups;
      samples.push(Array.from(s.vx, (v, i) => Math.hypot(v, s.vy[i])));
    }
    const dx = s.X - x0, dy = s.Y - y0, v = Math.hypot(dx, dy) / (s.t - t0), dir = Math.atan2(dy, dx);
    let still = 0, tot = 0;
    for (const row of samples) for (const sp of row) { tot++; if (sp < 0.1 * v) still++; }
    const ang = d => { let a = Math.abs(d * 180 / Math.PI) % 180; return a > 90 ? 180 - a : a; };
    const kk = s.p.mass * G / (s.p.L * s.p.sink);
    return { speed: v, perCycle: v * s.p.tau / s.p.L, track: ang(dir - Math.atan2(cy, cx) / 2), body: ang(dir - s.TH),
      still: still / tot, contact: cont / n, slip: sl / sw / v, contacts: ncont / samples.length, sinkMax: sink / kk, lift: zmax, ok: s.ok };
  }

  // しらべる用: ふれている所の速さを全部 0 にできる体の動きがあるか（重みつき最小二乗。のこりのすべり / 体の速さ）
  function kinCheck(s) {
    const sh = s._sh, dsh = s._dsh, c = Math.cos(s.TH), sn = Math.sin(s.TH);
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    const rows = [];
    for (let i = 0; i < N; i++) {
      if (s.nu[i] <= 0) continue;
      const w = s.nu[i];
      const rx = c * sh.bx[i] - sn * sh.by[i], ry = sn * sh.bx[i] + c * sh.by[i];
      const dvx = c * dsh.bx[i] - sn * dsh.by[i], dvy = sn * dsh.bx[i] + c * dsh.by[i];
      rows.push([w, [1, 0, -ry], -dvx], [w, [0, 1, rx], -dvy]);
    }
    for (const [w, a, r] of rows) for (let j = 0; j < 3; j++) { b[j] += w * a[j] * r; for (let k = 0; k < 3; k++) A[j][k] += w * a[j] * a[k]; }
    const x = lin3(A, b); let res = 0, ws = 0;
    for (const [w, a, r] of rows) { const e = a[0] * x[0] + a[1] * x[1] + a[2] * x[2] - r; res += w * e * e; ws += w; }
    return { slip: Math.sqrt(res / ws), U: Math.hypot(x[0], x[1]), x };
  }
  const API = { N, make, step, measure, kinCheck };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SIDE3D = API;
})(typeof window !== 'undefined' ? window : globalThis);
