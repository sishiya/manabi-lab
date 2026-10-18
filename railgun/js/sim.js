// レールガンのしくみ — その場で計算を進める（手でタップした台のスイッチが入る）・焦げ跡・記録の見返し
// 1発の計算は本物の時間（RK4 0.5 µs）。見せる速さだけ 3000 分の1。最初の箱をタップするまで時計は止めておく。
'use strict';
(function () {
  const BASE = {
    atla: { make: () => PRESETS.atla(), E: 5e6, m: 0.32, Emin: 1e6, Emax: 10e6, mMin: 0.1, mMax: 2, limit: 2e6, projLen: 0.16 },
    isl: { make: () => PRESETS.isl(0.1), E: 53e6, m: 8, Emin: 10e6, Emax: 100e6, mMin: 2, mMax: 20, limit: 4.5e6, projLen: 0.5 },
  };
  const DT = 5e-7, NB = 240;   // 計算の刻み・焦げ跡の区切りの数
  const S = {
    cfg: { preset: 'atla', E: 5e6, m: 0.32, auto: false },
    p: null, run: null, sum: null, hist: [],
    t: 0, speed: 1 / 3000,
    phase: 'ready',          // ready（タップ待ち）→ live（計算中）→ after（砲口を出て飛んでいく）→ done（見返し）
    paused: false, after: 2.5e-3, tEnd: 6e-3,
    pol: 1,                  // ＋−の向き（全部の台をまとめて。撃っているあいだは変えられない）
    hold: false,             // 止め板（電機子が動けない）
    scorch: new Float64Array(NB),   // 位置ごとの ∫I²dt [A²s]（焦げ跡の目安。撃つたびに重なる）
    cmp: null,               // 2つ目の箱をタップしたときの比べ: { I0, F0, t0, I1, F1 }
    shots: 0,
  };

  function params() {
    const b = BASE[S.cfg.preset], p = b.make();
    let E0 = 0; for (const r of p.racks) E0 += 0.5 * r.C * r.V0 * r.V0;
    const f = Math.sqrt(S.cfg.E / E0);
    for (const r of p.racks) { r.V0 *= f; if (!S.cfg.auto) r.at = Infinity; }   // 手で撃つときは位置では入らない
    p.m = S.cfg.m; p.every = 20;   // 記録は 10 µs ごと
    return p;
  }

  // 新しい1発（コンデンサをためなおす。焦げ跡はそのまま）
  function reset() {
    S.p = params();
    S.run = PHYS.make(S.p);
    S.run.hold = S.hold;
    S.hist = S.run.hist;
    S.t = 0; S.phase = 'ready'; S.paused = false; S.cmp = null;
    S.sum = PHYS.summary(S.run);
    S.tEnd = 6e-3;
    S.version = (S.version || 0) + 1;
  }

  function current() { let I = 0; for (let k = 0; k < S.run.n; k++) I += S.run.i[k]; return I; }

  // 台 k をタップ
  function tap(k) {
    if (S.phase !== 'ready' && S.phase !== 'live') return false;
    const I0 = current();
    if (!PHYS.fire(S.run, k)) return false;
    if (S.phase === 'ready') { S.phase = 'live'; S.shots++; }
    if (I0 > 1e4) S.cmp = { I0, F0: 0.5 * S.p.Lp * I0 * I0, t0: S.run.t, I1: 0, F1: 0 };
    else S.cmp = null;
    S.paused = false;
    return true;
  }
  function autoFire() {   // おまかせ: はじめの4台をいっしょに、あとは弾の位置で（presets の順）
    S.cfg.auto = true; reset(); S.cfg.auto = false;
    S.phase = 'live'; S.shots++;
  }

  function setHold(on) {
    if (on && S.run.v > 1) return false;   // 動いている弾は止められない
    S.hold = on; S.run.hold = on; return true;
  }
  function setPol(pol) { if (S.phase === 'live' || S.phase === 'after') return false; S.pol = pol; return true; }

  // 本物の時間で dt だけ進める
  function advance(dtSim) {
    const r = S.run;
    if (S.phase === 'live') {
      const n = Math.max(1, Math.round(dtSim / DT));
      for (let j = 0; j < n && !r.out; j++) {
        PHYS.step(r, DT);
        const I = current();
        const b = Math.min(NB - 1, Math.max(0, Math.floor(r.x / S.p.len * NB)));
        S.scorch[b] += I * I * DT;
        if (S.cmp && !S.cmp.done && r.t - S.cmp.t0 > 0.35e-3) { S.cmp.I1 = I; S.cmp.F1 = 0.5 * S.p.Lp * I * I; S.cmp.done = true; }
      }
      S.t = r.t;
      const I = current();
      if (r.out) { S.phase = 'after'; S.sum = PHYS.summary(r); S.tEnd = r.t + S.after; }
      else if (allFired() && I < 2e3 && !S.hold && r.v < 1) { S.phase = 'done'; S.sum = PHYS.summary(r); S.tEnd = r.t; }   // 弾が止まった
    } else if (S.phase === 'after') {
      S.t = Math.min(S.tEnd, S.t + dtSim);
      if (S.t >= S.tEnd) S.phase = 'done';
    }
    if (S.phase !== 'ready') S.sum = PHYS.summary(r);
  }
  function allFired() { const r = S.run; for (let k = 0; k < r.n; k++) if (!r.fired[k] || r.vc[k] > 1) return false; return true; }
  // 電流が流れていないのに弾がまだ筒の中を進んでいるときは早送り（見せる速さだけ。計算は同じ）
  function fast() { return S.phase === 'live' && !S.hold && current() < 2e3 && S.run.v > 1; }

  // 時刻 t の値（見返し用。記録の間は線形補間。砲口を出たあとは同じ速さで飛ぶ）
  function sample(t) {
    if (S.phase === 'live' || S.phase === 'ready') { const o = PHYS.snap(S.run); o.after = -1; return o; }
    const h = S.hist, last = h[h.length - 1];
    if (t >= last.t) {
      const o = Object.assign({}, last);
      o.t = t; o.after = t - last.t;
      if (S.run.out) { o.x = last.x + last.v * o.after; o.I = 0; o.F = 0; o.i = last.i.map(() => 0); }
      else o.after = -1;
      return o;
    }
    let lo = 0, hi = h.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (h[m].t <= t) lo = m; else hi = m; }
    const a = h[lo], b = h[hi], u = (t - a.t) / (b.t - a.t || 1);
    const o = {};
    for (const k in a) {
      if (Array.isArray(a[k])) o[k] = a[k].map((v, j) => v + (b[k][j] - v) * u);
      else o[k] = a[k] + (b[k] - a[k]) * u;
    }
    o.after = -1;
    return o;
  }

  function setPreset(id) {
    const b = BASE[id];
    S.cfg.preset = id; S.cfg.E = b.E; S.cfg.m = b.m;
    S.scorch.fill(0); reset();
  }
  // 「くわしく見る」のグラフ・数字用に、おまかせで1発ぶんを先に計算した値（いまの手の1発とは別）
  function reference() {
    S.cfg.auto = true; const p = params(); S.cfg.auto = false;
    p.every = 20; return PHYS.run(p, DT, 0.05);
  }

  window.SIM = { S, BASE, NB, fast, reset, tap, autoFire, setHold, setPol, advance, sample, setPreset, reference, current, base: () => BASE[S.cfg.preset] };
})();
