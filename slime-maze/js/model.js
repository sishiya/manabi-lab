// 粘菌の管の網のモデル（Physarum ソルバー）
//   Tero, Kobayashi, Nakagaki (2007) J. Theor. Biol. 244: 553–564 の式 (5)(6) を、迷路のマス目の網にそのまま使う（無次元）
//     Q_ij = D_ij / L_ij · (p_i − p_j)            … 管の流量（ハーゲン・ポアズイユ。D は半径の4乗に比例する「通りやすさ」）
//     Σ_i Q_ij = 0（入口と出口のほかの節）、入口から I0 が入り、出口から I0 が出る … ネットワークのポアソン方程式
//     dD/dt = f(|Q|) − D,  f(Q) = Q^μ, μ = 1      … よく流れる管は太り、流れない管はやせる（Type I。μ=1 なら最短の道が残る、4章）
//   時間の進め方は論文と同じ半陰的: D(n+1) = (D(n) + δt·f(|Q(n)|)) / (1 + δt)
//   式どおり D は 0 にならない（流れのない管は e^(−t) でやせ続ける）。計算のために下限 FLOOR だけ置く
'use strict';

const Model = {
  FLOOR: 1e-9,     // D の下限（式では 0 にならない。行列が解けなくなるのを防ぐためだけの値）
  THIN: 1e-4,      // これより細い管は絵では見えない（draw.js の alpha。数えるのには使わない）
  DT: 0.05,        // 1回の時間の進み（モデルの時間）
  L: 1,            // マスとマスのあいだの管の長さ（どれも同じ）
  I0: 1,           // 入口から入り出口から出る流れの量（無次元で 1）

  create(maze, foods, seed) {
    return {
      m: maze, foods: foods.slice(), rng: makeRng(seed ^ 0x9e3779b9),
      D: new Float64Array(maze.nE), Q: new Float64Array(maze.nE), Qs: new Float64Array(maze.nE),
      p: new Float64Array(maze.W * maze.H), pPrev: null,
      t: 0, blocked: false, maxRate: 0, swap: false,
      spread: null,  // 広がっている途中なら { dist: 辺ごとの順番, k: いまどこまで, max }
    };
  },

  has(s, e) { return s.m.open[e] && s.D[e] > 0; },   // 粘菌がいる通路（どんなに細くても）

  // 迷路いっぱいに広げる（実験と同じはじまり: 迷路を粘菌で埋める）。エサのまわりから、開いた通路を近い順にうめる
  // 広がる速さと順は見やすくした演出で、計算していない（画面の「簡単にしたところ」に書く）
  startSpread(s) {
    const m = s.m, dist = new Int32Array(m.nE).fill(-1), seenN = new Int32Array(m.W * m.H).fill(-1);
    s.D.fill(0); s.Q.fill(0); s.Qs.fill(0); s.pPrev = null; s.t = 0;
    const q = [];
    for (const f of s.foods) { seenN[f] = 0; q.push(f); }
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      for (const e of m.adj[c]) {
        if (!m.open[e]) continue;
        const n = Maze.other(m, e, c);
        if (dist[e] < 0) dist[e] = seenN[c] + 1;
        if (seenN[n] < 0) { seenN[n] = seenN[c] + 1; q.push(n); }
      }
    }
    let max = 0; for (let e = 0; e < m.nE; e++) if (dist[e] > max) max = dist[e];
    s.spread = { dist, k: 0, max };
    s.blocked = false;
  },
  // 広がりを進める。届いた管は、はじめの太さ [0.5, 1.0] の一様乱数（Tero 2007 の4章と同じ）
  stepSpread(s, dk) {
    const sp = s.spread, m = s.m, k0 = sp.k; sp.k += dk;
    for (let e = 0; e < m.nE; e++) {
      const d = sp.dist[e];
      if (d > k0 && d <= sp.k && m.open[e]) s.D[e] = 0.5 + 0.5 * s.rng();
    }
    if (sp.k >= sp.max) s.spread = null;
  },

  // 入口 a から出口 b へ I0 を流したときの圧力と流量を解く（前処理つき共役勾配法。論文は ICCG）
  solve(s, a, b, I0) {
    const m = s.m, N = m.W * m.H;
    // a と管でつながっている節だけを解く
    const idx = new Int32Array(N).fill(-1), list = [a]; idx[a] = 0;
    for (let qi = 0; qi < list.length; qi++) for (const e of m.adj[list[qi]]) {
      if (!Model.has(s, e)) continue; const n = Maze.other(m, e, list[qi]); if (idx[n] < 0) { idx[n] = list.length; list.push(n); }
    }
    s.Q.fill(0); s.p.fill(0);
    if (idx[b] < 0) return false;
    // 出口 b の圧力を 0 に固定し、残りの節で  Σ D/L (p_i − p_j) = 入る量  を解く
    const n = list.length, ib = idx[b], diag = new Float64Array(n), rhs = new Float64Array(n);
    for (let i = 0; i < n; i++) for (const e of m.adj[list[i]]) if (Model.has(s, e)) diag[i] += s.D[e] / Model.L;
    rhs[idx[a]] = I0; diag[ib] = 1; rhs[ib] = 0;
    const mul = (x, y) => {
      for (let i = 0; i < n; i++) {
        if (i === ib) { y[i] = x[i]; continue; }
        const c = list[i]; let v = diag[i] * x[i];
        for (const e of m.adj[c]) { if (!Model.has(s, e)) continue; const j = idx[Maze.other(m, e, c)]; if (j !== ib) v -= s.D[e] / Model.L * x[j]; }
        y[i] = v;
      }
    };
    const x = new Float64Array(n), r = new Float64Array(n), z = new Float64Array(n), pv = new Float64Array(n), Ap = new Float64Array(n);
    if (s.pPrev) for (let i = 0; i < n; i++) if (i !== ib) x[i] = s.pPrev[list[i]]; // 前の答えから始めると速い
    mul(x, Ap); for (let i = 0; i < n; i++) r[i] = rhs[i] - Ap[i];
    for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; pv[i] = z[i]; }
    let rz = 0; for (let i = 0; i < n; i++) rz += r[i] * z[i];
    let r0 = 0; for (let i = 0; i < n; i++) r0 += rhs[i] * rhs[i] / diag[i];
    for (let it = 0; it < 6 * n + 50 && rz > 1e-24 * r0; it++) {
      mul(pv, Ap); let pAp = 0; for (let i = 0; i < n; i++) pAp += pv[i] * Ap[i];
      if (!(pAp > 0)) break;
      const al = rz / pAp;
      for (let i = 0; i < n; i++) { x[i] += al * pv[i]; r[i] -= al * Ap[i]; }
      let rz2 = 0; for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
      const be = rz2 / rz; rz = rz2;
      for (let i = 0; i < n; i++) pv[i] = z[i] + be * pv[i];
    }
    for (let i = 0; i < n; i++) s.p[list[i]] = x[i];
    s.pPrev = s.p.slice();
    for (let e = 0; e < m.nE; e++) if (Model.has(s, e)) s.Q[e] = s.D[e] / Model.L * (s.p[m.ea[e]] - s.p[m.eb[e]]);
    return true;
  },

  // 1回進める。エサが管でつながっていなければ進めずに blocked を立てる
  // 入口と出口は swap で入れかえられる（Tero 2007: その瞬間、一方のエサが入口・もう一方が出口。|Q| は同じなので太さの変わり方は変わらない）
  step(s) {
    if (s.spread) { Model.stepSpread(s, 0.35); return; }
    const a = s.foods[s.swap ? 1 : 0], b = s.foods[s.swap ? 0 : 1];
    if (!Model.solve(s, a, b, Model.I0)) { s.blocked = true; return; }
    s.blocked = false;
    const dt = Model.DT, m = s.m; let maxRate = 0;
    for (let e = 0; e < m.nE; e++) {
      if (!Model.has(s, e)) continue;
      const f = Math.abs(s.Q[e]);                       // f(Q) = Q^μ, μ = 1
      const d0 = s.D[e], d1 = Math.max(Model.FLOOR, (d0 + dt * f) / (1 + dt));
      maxRate = Math.max(maxRate, Math.abs(d1 - d0) / dt);
      s.D[e] = d1;
      s.Qs[e] += (Math.abs(s.Q[e]) - s.Qs[e]) * 0.1;    // 粒の速さ用に、ならした流量（表示だけ）
    }
    s.maxRate = maxRate;
    s.t += dt;
  },

  // 粘菌の管の長さ  Σ D·L / I0 。μ=1 で落ち着くと、最短の道の長さになる（最短の道の管は D=1、ほかは 0 に近づく）
  tubeLength(s) { let L = 0; for (let e = 0; e < s.m.nE; e++) if (Model.has(s, e)) L += s.D[e] * Model.L; return L / Model.I0; },

  shortest(s) { return Maze.shortest(s.m, s.foods[0], s.foods[1]); },

  // 落ち着いたか: 太さの変わる速さが十分小さい（広がっている途中・つながっていないときは落ち着いていない）
  settled(s) { return !s.spread && !s.blocked && s.t > 1 && s.maxRate < 3e-4; },
};
window.Model = Model;
