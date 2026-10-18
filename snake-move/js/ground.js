// ヘビが進むしくみ — 地面の横うねり（Hu, Nirody, Scott & Shelley 2009 の式）
// 体の形（曲がり κ(s,t)）はヘビが決める。体がどこへ・どれだけ進むか・回るかは、
// 「地面からの摩擦の合計が 0、回す力の合計が 0」になるように毎コマ解いて決める（慣性は小さいので入れない。Fr ≈ 0.1）。
// node でも読める（tools/verify.js）。
'use strict';
(function (root) {
  const N = 80;                 // 体を 80 個に区切る（s = 0 が尾、s = L が頭）
  const G = 9.81;

  // 計算に入れる値（出どころは index.html の「このアプリについて」）
  const SURF = {
    cloth: { name: '布（ざらざら）', mf: 0.11, mb: 0.14, mt: 0.19 },   // Hu 2009 の当てはめ値（静止摩擦の測定 0.11 / 0.14 / 0.20）
    board: { name: 'なめらかな板', mf: 0.14, mb: 0.14, mt: 0.16 },     // Hu 2009（どの向きもほぼ同じ）
    same:  { name: 'どの向きも同じ', mf: 0.15, mb: 0.15, mt: 0.15 },   // ためし（ウロコの向きがないとしたら）
    grip:  { name: '布・ウロコを立てる', mf: 0.30, mb: 0.39, mt: 0.54 }, // Hu 2009 の坂の計算（μf 0.3、μt = 1.8 μf、μb = 1.3 μf が坂の実測に合う）
  };

  function make(o = {}) {
    const p = Object.assign({
      L: 0.30, mass: 0.0152, tau: 2.0,  // Hu 2009 の模型の長さ 30 cm・周期 2 秒、ミルクヘビ 15.2 g
      alpha: 7, k: 2,                   // κ L = α cos kπ(s/L + t/τ)（Hu 2009 の値）
      surf: 'cloth', lift: true, slope: 0, // 坂（度）。+ のとき、頭のはじめの向き（+x）が上り
      gait: 'slither', delta: 1.51, contact: 0.3,   // 'side' = 横ばい（上下の波の位相のずれ・ふれる長さの割合）
    }, o);
    const s = {
      p, t: 0, X: 0, Y: 0, TH: 0,       // 体の重心の位置（m）と、体全体の向き（rad）
      x: new Float64Array(N), y: new Float64Array(N),   // 世界での各区切りの位置
      vx: new Float64Array(N), vy: new Float64Array(N), // 世界での各区切りの速さ（m/s）
      fx: new Float64Array(N), fy: new Float64Array(N), // 地面からの摩擦（N/m）
      tx: new Float64Array(N), ty: new Float64Array(N), // 頭へ向く接線
      nu: new Float64Array(N),          // 地面を押す重さ（N/m）
      kap: new Float64Array(N),         // 曲がり（1/m）
      U: 0, V: 0, W: 0,                 // 重心の速さ・回る速さ
      dist: 0, ok: true,
    };
    place(s, 0);
    return s;
  }

  // 体のかたち（重心が原点・平均の向きが 0 になるよう置いた形）
  function shapeAt(s, t, out) {
    const p = s.p, ds = p.L / N;
    const bx = out._bx || (out._bx = new Float64Array(N)), by = out._by || (out._by = new Float64Array(N));
    const bt = out._bt || (out._bt = new Float64Array(N));
    let th = 0, x = 0, y = 0;
    const kap = out === s ? s.kap : (out._k || (out._k = new Float64Array(N)));
    for (let i = 0; i < N; i++) {
      const si = (i + 0.5) / N;
      kap[i] = p.alpha / p.L * Math.cos(p.k * Math.PI * (si + t / p.tau));
    }
    for (let i = 0; i < N; i++) {
      if (i > 0) { const th0 = th; th += 0.5 * (kap[i - 1] + kap[i]) * ds; const tm = 0.5 * (th0 + th); x += Math.cos(tm) * ds; y += Math.sin(tm) * ds; }
      bx[i] = x; by[i] = y; bt[i] = th;
    }
    // 重心を原点へ、平均の向き（尾から頭の弦ではなく、接線の向きの平均）を 0 へ
    let mx = 0, my = 0, mt = 0;
    for (let i = 0; i < N; i++) { mx += bx[i]; my += by[i]; mt += bt[i]; }
    mx /= N; my /= N; mt /= N;
    const c = Math.cos(-mt), sn = Math.sin(-mt);
    for (let i = 0; i < N; i++) {
      const X = bx[i] - mx, Y = by[i] - my;
      bx[i] = c * X - sn * Y; by[i] = sn * X + c * Y; bt[i] -= mt;
    }
    return { bx, by, bt, kap };
  }

  // 地面を押す重さの配りかた
  function weights(s, kap, out) {
    const p = s.p, w = p.mass * G / p.L * Math.cos(p.slope * Math.PI / 180);
    if (p.gait === 'side') {
      // 横ばい: 曲がりの波と同じ速さで流れる「上下の波」の低い所だけが地面にふれる（Marvi ほか 2014: 2つの波・位相のずれ 1.51 rad）
      const c0 = Math.cos(Math.PI * p.contact);   // ふれる長さの割合 contact になるしきい値
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const ph = p.k * Math.PI * ((i + 0.5) / N + s.t / p.tau) + p.delta;
        out[i] = Math.max(0, Math.cos(ph) - c0); sum += out[i];
      }
      for (let i = 0; i < N; i++) out[i] = sum > 0 ? out[i] / sum * N * w : w;
      return;
    }
    if (!p.lift) { for (let i = 0; i < N; i++) out[i] = w; return; }
    // 持ち上げ: 曲がりのいちばん強い所を浮かせ、まっすぐな所（曲がり 0）に重さをかける（Hu 2009 の「持ち上げ」の形。くわしい配り方は推定）
    let sum = 0;
    const kmax = p.alpha / p.L;
    for (let i = 0; i < N; i++) { const r = kap[i] / kmax; out[i] = Math.max(0, 1 - r * r); sum += out[i]; }
    for (let i = 0; i < N; i++) out[i] = out[i] / sum * N * w;
  }

  const EPS = 1e-5;             // 速さが 0 のときの割り算よけ（m/s）
  // 速さ (vx,vy)・接線 (tx,ty)・重さ nu から摩擦（Hu 2009 の式 f = −ν[μt(û·n̂)n̂ + μf|b (û·t̂)t̂]）
  function fric(sf, vx, vy, tx, ty, nu, o) {
    const sp = Math.sqrt(vx * vx + vy * vy + EPS * EPS);
    const ux = vx / sp, uy = vy / sp;
    const ut = ux * tx + uy * ty;          // 前向きの成分
    const nx = -ty, ny = tx, un = ux * nx + uy * ny;
    const mtan = ut > 0 ? sf.mf : sf.mb;
    o[0] = -nu * (sf.mt * un * nx + mtan * ut * tx);
    o[1] = -nu * (sf.mt * un * ny + mtan * ut * ty);
  }

  // 重心の速さ (U,V) と回る速さ W を決めると、摩擦と坂の合計（力と回す力）がいくつになるか
  const tmp = [0, 0];
  // inr があれば慣性も入れる（m dU/dt を後退オイラーで。急な坂ですべり落ちるときに要る）
  function resid(s, sh, dsh, nu, U, V, W, out, keep, inr) {
    const p = s.p, sf = SURF[p.surf], ds = p.L / N;
    const c = Math.cos(s.TH), sn = Math.sin(s.TH);
    const gx = -p.mass * G / p.L * Math.sin(p.slope * Math.PI / 180); // 坂: 下り（−x）へ引く力（N/m）
    let Fx = 0, Fy = 0, M = 0, I = 0;
    for (let i = 0; i < N; i++) {
      const rx = c * sh.bx[i] - sn * sh.by[i], ry = sn * sh.bx[i] + c * sh.by[i];
      const dvx = c * dsh.bx[i] - sn * dsh.by[i], dvy = sn * dsh.bx[i] + c * dsh.by[i];
      const vx = U - W * ry + dvx, vy = V + W * rx + dvy;
      const th = sh.bt[i] + s.TH, tx = Math.cos(th), ty = Math.sin(th);
      fric(sf, vx, vy, tx, ty, nu[i], tmp);
      const fx = tmp[0] + gx, fy = tmp[1];
      Fx += fx * ds; Fy += fy * ds; M += (rx * fy - ry * fx) * ds; I += (rx * rx + ry * ry) * ds;
      if (keep) { s.vx[i] = vx; s.vy[i] = vy; s.fx[i] = tmp[0]; s.fy[i] = tmp[1]; s.tx[i] = tx; s.ty[i] = ty; s.x[i] = s.X + rx; s.y[i] = s.Y + ry; }
    }
    if (inr) {
      const rho = p.mass / p.L;
      Fx -= p.mass * (U - inr.U) / inr.dt; Fy -= p.mass * (V - inr.V) / inr.dt; M -= rho * I * (W - inr.W) / inr.dt;
    }
    out[0] = Fx; out[1] = Fy; out[2] = M / p.L;
  }

  // 3つの式をニュートン法で解く
  function solve(s, sh, dsh, nu, inr) {
    let x = [s.U, s.V, s.W * s.p.L];
    const r = [0, 0, 0], r2 = [0, 0, 0], L = s.p.L;
    const f = (x, o) => resid(s, sh, dsh, nu, x[0], x[1], x[2] / L, o, false, inr);
    let ok = false;
    for (let it = 0; it < 40; it++) {
      f(x, r);
      const nr = Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]);
      if (nr < 1e-8 * s.p.mass * G) { ok = true; break; }
      const J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h = 1e-6;
      for (let j = 0; j < 3; j++) {
        const y = x.slice(); y[j] += h; f(y, r2);
        for (let k = 0; k < 3; k++) J[k][j] = (r2[k] - r[k]) / h;
      }
      const d = lin3(J, r);
      if (!d) break;
      // 1回に動かす量をおさえる（摩擦は速さの向きで急に変わるので）
      let lam = 1;
      const big = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2]));
      if (big > 0.2) lam = 0.2 / big;
      x = [x[0] - lam * d[0], x[1] - lam * d[1], x[2] - lam * d[2]];
    }
    s.U = x[0]; s.V = x[1]; s.W = x[2] / L;
    return ok;
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

  // 時刻 t のかたちと、そのかたちの変わる速さ（体の中から見た）。dt > 0 なら速さを解きなおす（慣性つき）
  const SH2 = {};
  function place(s, dt) {
    const sh = shapeAt(s, s.t, s);
    const h = 1e-4 * s.p.tau;
    const a = shapeAt(s, s.t + h, SH2);
    const dsh = s._dsh || (s._dsh = { bx: new Float64Array(N), by: new Float64Array(N) });
    for (let i = 0; i < N; i++) { dsh.bx[i] = (a.bx[i] - sh.bx[i]) / h; dsh.by[i] = (a.by[i] - sh.by[i]) / h; }
    weights(s, s.kap, s.nu);
    if (dt > 0) s.ok = solve(s, sh, dsh, s.nu, { U: s.U, V: s.V, W: s.W, dt });
    s._sh = sh;
    keep(s);
  }
  function keep(s) { resid(s, s._sh, s._dsh, s.nu, s.U, s.V, s.W, [0, 0, 0], true, null); }

  // dt 秒すすめる（かたちを t+dt にして速さを解き、その速さで動かす）
  function step(s, dt) {
    const X0 = s.X, Y0 = s.Y;
    s.t += dt;
    place(s, dt);
    s.X += s.U * dt; s.Y += s.V * dt; s.TH += s.W * dt;
    s.dist += Math.hypot(s.X - X0, s.Y - Y0);
    keep(s);
  }

  // まとめの数: 1周期で進んだ距離（体長あたり）など
  function measure(o, periods = 6, dt) {
    const s = make(o);
    dt = dt || s.p.tau / 200;
    for (let t = 0; t < s.p.tau * 2; t += dt) step(s, dt); // はじめの2周期は、形になじむまで捨てる
    const x0 = s.X, y0 = s.Y, th0 = s.TH;
    let work = 0;
    const ds = s.p.L / N;
    for (let t = 0; t < s.p.tau * periods; t += dt) {
      step(s, dt);
      for (let i = 0; i < N; i++) work -= (s.fx[i] * s.vx[i] + s.fy[i] * s.vy[i]) * ds * dt;
    }
    const dx = s.X - x0, dy = s.Y - y0, d = Math.hypot(dx, dy);
    // 進んだ向き（頭の向きの平均に対して前か）: 体の向き TH の平均の向きに沿った成分
    const thm = (th0 + s.TH) / 2;
    const fwd = dx * Math.cos(thm) + dy * Math.sin(thm);
    const up = dx;   // 坂の上り（+x）へ
    const U = fwd / s.p.L / periods;      // 体長／周期
    // 効率（Hu 2009 の η = 速さ／摩擦の仕事率。無次元: 速さ L/τ・力 μ? ではなく、ここでは重さ mg と速さの比で表す）
    const P = work / (s.p.tau * periods);
    return { U, up: up / s.p.L / periods, turn: (s.TH - th0) * 180 / Math.PI / periods, P, eff: (Math.abs(fwd) / (s.p.tau * periods)) * s.p.mass * G / P, ok: s.ok };
  }

  const API = { N, SURF, make, step, place, measure };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.GROUND = API;
})(typeof window !== 'undefined' ? window : globalThis);
