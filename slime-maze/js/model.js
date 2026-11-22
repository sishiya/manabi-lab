// 粘菌のモデル: 伸びて迷路を探る（本物の速さ）＋ 管の網の太り・やせ（Physarum ソルバー）
//
// 時間はすべて「本物の時間（時間 h）」で進める。
//  伸びる: 先端は 1時間に約 2 cm（Patino-Ramirez ほか 2019「1時間に数センチ」）。1マス = 5 mm と仮定（画面に書く）。
//          開いた通路を、粘菌がいるマスから連続して伸びる（両はしから伸びた先端が出会えば1本の管になる）。
//          通路ごとに速さを ±25% ばらつかせる（同じ速さで進む機械らしさを消すため。ばらつきの大きさは推定）。
//  管の太り・やせ: Tero, Kobayashi, Nakagaki (2007) J. Theor. Biol. 244 の式 (5)(6)（無次元）をエサが2つのときに解く
//     Q_ij = D_ij / L_ij · (p_i − p_j)（ハーゲン・ポアズイユ）、入口のエサから I0 が入り出口のエサから出る
//     dD/dt = |Q| − D（μ=1）、半陰的に D ← (D + δt|Q|)/(1+δt)、はじめの D は [0.5, 1.0] の一様乱数
//   モデルの時間 1 を 1時間とする（Tero 2007「管は数時間でこわれ、作り直される」から。1時間で e 分の1 にやせ、数時間でほぼ消える）。
//   式どおり D は 0 にしない（下限 FLOOR は行列のためだけ）。
'use strict';

const Model = {
  FLOOR: 1e-9,
  DT: 0.05,          // 管の計算の1回の時間（時間 h）
  L: 1,              // マスとマスのあいだの管の長さ（どれも同じ）
  I0: 1,
  CELL_MM: 5,        // 1マスの大きさ（仮定）
  GROW_MM_H: 20,     // 先端の伸びる速さ（mm/時）。Patino-Ramirez ほか 2019「1時間に数センチ」から 2 cm/時

  create(maze, foods, seed) {
    const N = maze.W * maze.H, nE = maze.nE;
    return {
      m: maze, foods: foods.slice(), rng: makeRng(seed ^ 0x9e3779b9),
      D: new Float64Array(nE), Q: new Float64Array(nE), Qs: new Float64Array(nE),
      fa: new Float64Array(nE), fb: new Float64Array(nE), vk: new Float64Array(nE), // ea 側・eb 側から伸びた長さ（0〜1）、速さのばらつき
      reached: new Uint8Array(N), arrive: new Float64Array(N),   // 粘菌がいるマス、そこへ着いた時刻
      p: new Float64Array(N), pPrev: null,
      t: 0, tFlow: 0, blocked: false, maxRate: 0, swap: false, start: -1, growing: false,
    };
  },

  has(s, e) { return s.m.open[e] && s.D[e] > 0; },   // 管になった通路（どんなに細くても）
  full(s, e) { return s.fa[e] + s.fb[e] >= 1; },

  // 迷路のまん中に1つのかけらを置いて、伸びはじめる
  startGrowth(s) {
    const m = s.m, N = m.W * m.H;
    s.D.fill(0); s.Q.fill(0); s.Qs.fill(0); s.fa.fill(0); s.fb.fill(0); s.reached.fill(0); s.arrive.fill(0);
    s.pPrev = null; s.t = 0; s.tFlow = 0; s.blocked = false; s.maxRate = 0;
    for (let e = 0; e < m.nE; e++) s.vk[e] = 0.75 + 0.5 * s.rng();
    let c0 = Math.floor(m.H / 2) * m.W + Math.floor(m.W / 2);
    if (s.foods.includes(c0)) c0 = (c0 + 1) % N;
    s.start = c0; s.reached[c0] = 1; s.growing = true;
  },

  // 伸びる（dh 時間ぶん）。両はしの長さの和が 1 になった通路は管になる（はじめの太さは [0.5, 1.0] の一様乱数）
  grow(s, dh) {
    const m = s.m, v = Model.GROW_MM_H / Model.CELL_MM * dh;  // マス
    let any = false;
    for (let e = 0; e < m.nE; e++) {
      if (!m.open[e] || Model.full(s, e)) continue;
      const ra = s.reached[m.ea[e]], rb = s.reached[m.eb[e]];
      if (!ra && !rb) continue;
      any = true;
      if (ra) s.fa[e] += v * s.vk[e];
      if (rb) s.fb[e] += v * s.vk[e];
      if (s.fa[e] + s.fb[e] >= 1) {
        const k = s.fa[e] / (s.fa[e] + s.fb[e]); s.fa[e] = k; s.fb[e] = 1 - k;
        s.D[e] = 0.5 + 0.5 * s.rng();
        for (const c of [m.ea[e], m.eb[e]]) if (!s.reached[c]) { s.reached[c] = 1; s.arrive[c] = s.t; }
      }
    }
    s.growing = any;
  },

  // 入口 a から出口 b へ I0 を流したときの圧力と流量を解く（前処理つき共役勾配法。論文は ICCG）
  solve(s, a, b, I0) {
    const m = s.m, N = m.W * m.H;
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

  // エサが2つあって、どちらにも粘菌がいるとき、管の網が流れに合わせて変わる
  flowing(s) { return s.foods.length === 2 && s.foods.every(f => s.reached[f]); },

  // DT（時間）ぶん進める
  // 入口と出口は swap で入れかえられる（Tero 2007: その瞬間、一方のエサが入口・もう一方が出口。|Q| は同じなので太さの変わり方は同じ）
  step(s) {
    const dt = Model.DT, m = s.m;
    Model.grow(s, dt);
    s.t += dt;
    s.maxRate = 0;
    if (!Model.flowing(s)) { s.blocked = false; s.Q.fill(0); return; }
    const a = s.foods[s.swap ? 1 : 0], b = s.foods[s.swap ? 0 : 1];
    if (!Model.solve(s, a, b, Model.I0)) { s.blocked = true; return; }
    s.blocked = false;
    let maxRate = 0;
    for (let e = 0; e < m.nE; e++) {
      if (!Model.has(s, e)) continue;
      const f = Math.abs(s.Q[e]);                       // f(Q) = Q^μ, μ = 1
      const d0 = s.D[e], d1 = Math.max(Model.FLOOR, (d0 + dt * f) / (1 + dt));
      maxRate = Math.max(maxRate, Math.abs(d1 - d0) / dt);
      s.D[e] = d1;
      s.Qs[e] += (Math.abs(s.Q[e]) - s.Qs[e]) * 0.1;    // 粒の速さ用に、ならした流量（表示だけ）
    }
    s.maxRate = maxRate;
    s.tFlow += dt;
  },

  // 粘菌の管の長さ  Σ D·L / I0 。μ=1 で落ち着くと、最短の道の長さになる
  tubeLength(s) { let L = 0; for (let e = 0; e < s.m.nE; e++) if (Model.has(s, e)) L += s.D[e] * Model.L; return L / Model.I0; },

  shortest(s) { return s.foods.length === 2 ? Maze.shortest(s.m, s.foods[0], s.foods[1]) : null; },

  // 落ち着いたか（表示のためだけ。時間は止めない）
  settled(s) { return Model.flowing(s) && !s.growing && !s.blocked && s.tFlow > 1 && s.maxRate < 1e-3; },
};
window.Model = Model;
