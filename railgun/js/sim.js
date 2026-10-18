// レールガンのしくみ — 設定・計算の実行・再生の時刻・ある時刻の値（補間）
'use strict';
(function () {
  const BASE = {
    atla: { make: () => PRESETS.atla(), E: 5e6, m: 0.32, Emin: 1e6, Emax: 10e6, mMin: 0.1, mMax: 2, limit: 2e6, projLen: 0.16 },
    isl: { make: () => PRESETS.isl(0.1), E: 53e6, m: 8, Emin: 10e6, Emax: 100e6, mMin: 2, mMax: 20, limit: 4.5e6, projLen: 0.5 },
  };
  const S = {
    cfg: { preset: 'atla', E: 5e6, m: 0.32, seq: true },
    p: null, run: null, sum: null, hist: [],
    t: 0, playing: false, speed: 1e-3,   // 再生の速さ（本物の 1000 分の 1）
    tEnd: 0, after: 2.5e-3,                // 砲口を出たあと、飛んでいくのを見せる時間
  };

  function params() {
    const b = BASE[S.cfg.preset], p = b.make();
    let E0 = 0; for (const r of p.racks) E0 += 0.5 * r.C * r.V0 * r.V0;
    const f = Math.sqrt(S.cfg.E / E0);
    for (const r of p.racks) { r.V0 *= f; if (!S.cfg.seq) r.at = 0; }
    p.m = S.cfg.m; p.every = 20;   // 記録は 10 µs ごと
    return p;
  }

  function compute() {
    S.p = params();
    S.run = PHYS.run(S.p, 5e-7, 0.05);
    S.hist = S.run.hist;
    S.sum = PHYS.summary(S.run);
    S.tEnd = S.run.t + S.after;
    if (S.t > S.tEnd) S.t = S.tEnd;
    S.version = (S.version || 0) + 1;
  }

  function setPreset(id) {
    const b = BASE[id];
    S.cfg.preset = id; S.cfg.E = b.E; S.cfg.m = b.m;
    compute();
  }

  // 時刻 t の値。砲口を出たあとは弾が同じ速さで飛び、回路の電流は描かない（砲口の火花は計算していない）
  function sample(t) {
    const h = S.hist, last = h[h.length - 1];
    if (t >= last.t) {
      const o = Object.assign({}, last);
      o.t = t; o.after = t - last.t;
      if (S.run.out) { o.x = last.x + last.v * o.after; o.I = 0; o.F = 0; o.i = last.i.map(() => 0); }
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

  window.SIM = { S, BASE, compute, setPreset, sample, base: () => BASE[S.cfg.preset] };
})();
