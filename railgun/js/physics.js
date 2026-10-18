// レールガンのしくみ — 回路と運動の計算（node でも読める。tools/verify.js が使う）
// 形は Hundertmark & Liebfried 2017（ISL）の SPICE の回路と同じ:
//   コンデンサの台（rack）= コンデンサ C・スイッチ・波形をととのえるコイル L・抵抗 R・クローバーダイオード。
//   台はレールの根元（breech）につながり、決めた時刻か、弾（電機子）がある位置を通ったときにスイッチが入る。
// レール: インダクタンス L'x（x は根元から電機子までの長さ）、抵抗 R'x。電機子の抵抗 Rarm。
// 力 F = ½ L' I²（ローレンツ力の合計）。摩擦は力を fric の割合だけ減らす（論文と同じ扱い）。
'use strict';
(function (root) {
  const MU0 = 4e-7 * Math.PI;

  // 台の値をそろえて作る（同じ台を n 台。trig は根元からの位置 [m] の配列。0 以下は時刻 0 で入る）
  function racks(n, o, trig) {
    const a = [];
    for (let k = 0; k < n; k++) a.push({ C: o.C, L: o.L, R: o.R, V0: o.V0, at: trig ? trig[k] : 0 });
    return a;
  }

  function make(p) {
    const n = p.racks.length;
    const s = {
      p, n, t: 0, x: p.x0, v: 0,
      i: new Float64Array(n), vc: new Float64Array(n),
      fired: new Uint8Array(n), cb: new Uint8Array(n),   // スイッチが入った・クローバー（コンデンサが空）
      Q: 0, Wf: 0,          // 抵抗の熱、摩擦の熱 [J]
      out: false, tOut: NaN, vOut: NaN,
      hist: [], every: p.every || 10, k: 0,
    };
    for (let k = 0; k < n; k++) s.vc[k] = p.racks[k].V0;
    s.E0 = energyCap(s);
    trigger(s);
    record(s);
    return s;
  }

  function energyCap(s) { let e = 0; for (let k = 0; k < s.n; k++) e += 0.5 * s.p.racks[k].C * s.vc[k] * s.vc[k]; return e; }
  function current(s, i) { let I = 0; for (let k = 0; k < s.n; k++) I += i[k]; return I; }

  function trigger(s) {
    for (let k = 0; k < s.n; k++) {
      const at = s.p.racks[k].at;
      if (!s.fired[k] && (at <= 0 ? true : s.x >= at)) s.fired[k] = 1;
    }
  }

  // 微分。y = { x, v, i[], vc[] }、戻り値 { dx, dv, di[], dvc[], dQ, dWf }
  function deriv(s, x, v, i, vc, out) {
    const p = s.p, n = s.n;
    const Lg = p.Lp * x, Rg = p.Rp * x + p.Rarm;
    const I = current(s, i);
    const Vext = (p.Lp * v + Rg) * I;          // 電機子が動くことで生まれる電圧（L'vI）と抵抗の電圧
    const a = out.a, on = out.on;
    for (let k = 0; k < n; k++) {
      const r = p.racks[k];
      a[k] = (s.cb[k] ? 0 : vc[k]) - r.R * i[k] - Vext;
      on[k] = s.fired[k] ? 1 : 0;
    }
    // 電流が 0 で、さらに逆向きに流そうとする台はダイオードが止める（いなくなるまでくり返す）
    let S = 0;
    for (let it = 0; it < n + 1; it++) {
      let num = 0, den = 0;
      for (let k = 0; k < n; k++) if (on[k]) { const L = p.racks[k].L; num += a[k] / L; den += 1 / L; }
      S = num / (1 + Lg * den);
      let changed = false;
      for (let k = 0; k < n; k++) if (on[k] && i[k] <= 0 && a[k] - Lg * S < 0) { on[k] = 0; changed = true; }
      if (!changed) break;
    }
    let dQ = Rg * I * I;
    for (let k = 0; k < n; k++) {
      const r = p.racks[k];
      out.di[k] = on[k] ? (a[k] - Lg * S) / r.L : 0;
      out.dvc[k] = s.cb[k] ? 0 : -i[k] / r.C;
      dQ += r.R * i[k] * i[k];
    }
    const F = 0.5 * p.Lp * I * I;
    out.dx = v;
    out.dv = (1 - p.fric) * F / p.m;
    out.dQ = dQ;
    out.dWf = p.fric * F * v;
    out.I = I; out.F = F; out.dI = S;
    return out;
  }

  function buf(n) { return { a: new Float64Array(n), on: new Uint8Array(n), di: new Float64Array(n), dvc: new Float64Array(n) }; }

  // RK4 で1歩。ダイオード（i ≥ 0）とクローバー（vc ≥ 0）は歩のあとでそろえる
  function step(s, dt) {
    if (s.out) return;
    const n = s.n;
    if (!s.k1) { s.k1 = buf(n); s.k2 = buf(n); s.k3 = buf(n); s.k4 = buf(n); s.ti = new Float64Array(n); s.tv = new Float64Array(n); }
    const { k1, k2, k3, k4, ti, tv } = s;
    deriv(s, s.x, s.v, s.i, s.vc, k1);
    for (let k = 0; k < n; k++) { ti[k] = s.i[k] + 0.5 * dt * k1.di[k]; tv[k] = s.vc[k] + 0.5 * dt * k1.dvc[k]; }
    deriv(s, s.x + 0.5 * dt * k1.dx, s.v + 0.5 * dt * k1.dv, ti, tv, k2);
    for (let k = 0; k < n; k++) { ti[k] = s.i[k] + 0.5 * dt * k2.di[k]; tv[k] = s.vc[k] + 0.5 * dt * k2.dvc[k]; }
    deriv(s, s.x + 0.5 * dt * k2.dx, s.v + 0.5 * dt * k2.dv, ti, tv, k3);
    for (let k = 0; k < n; k++) { ti[k] = s.i[k] + dt * k3.di[k]; tv[k] = s.vc[k] + dt * k3.dvc[k]; }
    deriv(s, s.x + dt * k3.dx, s.v + dt * k3.dv, ti, tv, k4);
    const w = dt / 6;
    s.x += w * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
    s.v += w * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv);
    s.Q += w * (k1.dQ + 2 * k2.dQ + 2 * k3.dQ + k4.dQ);
    s.Wf += w * (k1.dWf + 2 * k2.dWf + 2 * k3.dWf + k4.dWf);
    for (let k = 0; k < n; k++) {
      s.i[k] += w * (k1.di[k] + 2 * k2.di[k] + 2 * k3.di[k] + k4.di[k]);
      s.vc[k] += w * (k1.dvc[k] + 2 * k2.dvc[k] + 2 * k3.dvc[k] + k4.dvc[k]);
      if (s.i[k] < 0) s.i[k] = 0;
      if (!s.cb[k] && s.vc[k] <= 0) { s.vc[k] = 0; s.cb[k] = 1; }
    }
    s.t += dt;
    trigger(s);
    if (s.x >= s.p.len) { s.out = true; s.tOut = s.t; s.vOut = s.v; s.xOut = s.x; record(s); return; }
    if (++s.k % s.every === 0) record(s);
  }

  // いまの値（記録・表示用）
  function snap(s) {
    const p = s.p, I = current(s, s.i);
    let EL = 0; for (let k = 0; k < s.n; k++) EL += 0.5 * p.racks[k].L * s.i[k] * s.i[k];
    const Eg = 0.5 * p.Lp * s.x * I * I;
    return {
      t: s.t, x: s.x, v: s.v, I, F: 0.5 * p.Lp * I * I,
      i: Array.from(s.i), vc: Array.from(s.vc), fired: Array.from(s.fired),
      Ecap: energyCap(s), EL, Eg, KE: 0.5 * p.m * s.v * s.v, Q: s.Q, Wf: s.Wf,
    };
  }
  function record(s) { s.hist.push(snap(s)); }

  // 電機子が砲口を出るまで（最大 tMax 秒）
  function run(p, dt, tMax) {
    const s = make(p);
    dt = dt || 5e-7; tMax = tMax || 0.03;
    while (!s.out && s.t < tMax) step(s, dt);
    return s;
  }

  // 砲口を出たときの内わけ。残った磁場とコイルのエネルギーは、砲口の火花（アーク）と台の抵抗で熱になる
  function summary(s) {
    const e = snap(s);
    const left = e.Eg + e.EL;
    const sum = e.Ecap + left + e.KE + e.Q + e.Wf;
    let Imax = 0; for (const h of s.hist) Imax = Math.max(Imax, h.I);
    return {
      out: s.out, t: s.t, v: s.v, KE: e.KE, E0: s.E0, eff: e.KE / s.E0,
      Ecap: e.Ecap, left, Q: e.Q, Wf: e.Wf, err: (sum - s.E0) / s.E0, Imax,
      accG: s.v * s.v / (2 * (s.x - s.p.x0)) / 9.80665,
    };
  }

  // 目安の値（画面の説明用。平均の見積もり）
  // レールの間の磁場の平均: F = I·B·w より B ≈ L'I/(2w)。押す圧力 = F / 口径の面積。
  function gauge(p, I) {
    const F = 0.5 * p.Lp * I * I;
    const B = p.Lp * I / (2 * p.w);
    return { F, B, P: F / (p.w * p.h), Pmag: B * B / (2 * MU0) };
  }

  const PHYS = { MU0, racks, make, step, run, snap, summary, gauge, energyCap };
  if (typeof module !== 'undefined' && module.exports) module.exports = PHYS; else root.PHYS = PHYS;
})(typeof window !== 'undefined' ? window : globalThis);
