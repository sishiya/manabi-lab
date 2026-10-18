// ヘビが進むしくみ — 石のあいだを進む（Gray 1946 の「押す点」）
// 体は石のあいだの S 字の道をなぞって、体にそってすべる（横すべりはない）。
// 地面の摩擦は体にそって後ろ向き。石は体を押すだけ（押す力 N ≥ 0、石の表面はなめらか＝Gray と同じ）。
// 「押す力の合計 ＋ 摩擦の合計 = 0、回す力も 0」を満たし、押す力の合計がいちばん小さい組を探す（3つまでの石の組を全部ためす）。
// 満たせなければ前へ押せない → 止める。node でも読める（tools/verify.js stones）。
'use strict';
(function (root) {
  const N = 80;
  const G = 9.81;
  const RB = 0.006, RS = 0.008;   // 体の半径（推定）・石の半径（目印の大きさ）

  function make(o = {}) {
    const p = Object.assign({
      L: 0.30, mass: 0.0152, tau: 2,     // 地面と同じミルクヘビ（Hu 2009）
      lam: 0.12, A: 0.03,                // 道の形: 波長 0.4 L・ふれはば 0.1 L（Hu 2009 の実測）
      surf: 'board',                     // 石があるのは、なめらかな板の上（Gray 1946 も板にくい）
      preset: 'every', ahead: 0.08,     // 石を頂上の何波長ぶん手前に置くか（目印の置き方）
    }, o);
    const s = { p, t: 0, S: p.L + 0.02, U: 0, x: new Float64Array(N), y: new Float64Array(N), tx: new Float64Array(N), ty: new Float64Array(N),
      fx: new Float64Array(N), fy: new Float64Array(N), stones: [], contacts: [], ok: true, Nsum: 0, why: '' };
    buildPath(s);
    s.S = arcAtX(s, 0) + p.L;     // 尾の先が x = 0 から
    placePreset(s, p.preset);
    place(s); solve(s);
    return s;
  }

  // 道（y = A sin 2πx/λ）を弧の長さで引けるように表にしておく
  function buildPath(s) {
    const p = s.p, dx = 0.0005, n = Math.ceil(8 / dx);
    s.px = new Float64Array(n); s.py = new Float64Array(n); s.ps = new Float64Array(n);
    let acc = 0;
    for (let k = 0; k < n; k++) {
      const x = -0.5 + k * dx, y = p.A * Math.sin(2 * Math.PI * x / p.lam);
      if (k) acc += Math.hypot(x - s.px[k - 1], y - s.py[k - 1]);
      s.px[k] = x; s.py[k] = y; s.ps[k] = acc;
    }
    // 1波長ぶんの道の長さ → 1周期にその長さだけ進む
    s.waveLen = arcAtX(s, p.lam) - arcAtX(s, 0);
    s.U0 = s.waveLen / p.tau;
  }
  function arcAtX(s, x) { const k = Math.max(0, Math.min(s.ps.length - 1, Math.round((x + 0.5) / 0.0005))); return s.ps[k]; }
  function at(s, a) {
    const ps = s.ps;
    let lo = 0, hi = ps.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ps[m] < a) lo = m; else hi = m; }
    const f = (a - ps[lo]) / Math.max(1e-12, ps[hi] - ps[lo]);
    const x = s.px[lo] + f * (s.px[hi] - s.px[lo]), y = s.py[lo] + f * (s.py[hi] - s.py[lo]);
    const dx = s.px[hi] - s.px[lo], dy = s.py[hi] - s.py[lo], d = Math.hypot(dx, dy) || 1;
    return [x, y, dx / d, dy / d];
  }

  // 石を、曲がりの外がわの「頂上の少し手前」（体が進んでくる側の斜面）に置く（'every' = どの曲がりにも、'half' = 3つに1つ取る、'none' = なし）
  // 頂上ちょうどだと押す向きが真横で、前へ押す分がない（Gray 1946: 曲がりの後ろがわの面で押す）
  function placePreset(s, kind) {
    const p = s.p;
    s.stones = [];
    if (kind === 'none') return;
    let k = 0;
    for (let xc = p.lam / 4; xc < 7; xc += p.lam / 2, k++) {
      if (kind === 'half' && k % 3 === 2) continue;
      const up = k % 2 === 0;    // 山（y = +A）の外がわは上、谷の外がわは下
      const q = at(s, arcAtX(s, xc - p.lam * p.ahead));
      let nx = -q[3], ny = q[2];
      if ((ny > 0) !== up) { nx = -nx; ny = -ny; }
      s.stones.push({ x: q[0] + nx * (RB + RS), y: q[1] + ny * (RB + RS) });
    }
  }

  // 地面をさわった所に石を置く（道の近くなら体にふれる位置へ寄せる）。石をさわったら取る
  function toggleStone(s, wx, wy, tolHit) {
    for (let k = 0; k < s.stones.length; k++) {
      const st = s.stones[k];
      if (Math.hypot(st.x - wx, st.y - wy) < RS + tolHit) { s.stones.splice(k, 1); return 'remove'; }
    }
    // 道のいちばん近い点
    let best = -1, bd = 1e9;
    const k0 = Math.max(0, Math.round((wx - 0.1 + 0.5) / 0.0005)), k1 = Math.min(s.px.length - 1, Math.round((wx + 0.1 + 0.5) / 0.0005));
    for (let k = k0; k <= k1; k += 2) { const d = Math.hypot(s.px[k] - wx, s.py[k] - wy); if (d < bd) { bd = d; best = k; } }
    if (best >= 0 && bd < 0.03) {
      const q = at(s, s.ps[best]), nx = -q[3], ny = q[2];
      const side = Math.sign((wx - q[0]) * nx + (wy - q[1]) * ny) || 1;
      s.stones.push({ x: q[0] + side * nx * (RB + RS), y: q[1] + side * ny * (RB + RS) });
    } else s.stones.push({ x: wx, y: wy });
    return 'add';
  }

  function place(s) {
    const p = s.p, ds = p.L / N;
    for (let i = 0; i < N; i++) {
      const q = at(s, s.S - p.L + (i + 0.5) * ds);
      s.x[i] = q[0]; s.y[i] = q[1]; s.tx[i] = q[2]; s.ty[i] = q[3];
    }
  }

  // ふれている石と、つりあう押す力を探す
  function solve(s) {
    const p = s.p, sf = GROUND_SURF[p.surf], ds = p.L / N, w = p.mass * G / p.L;
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) { cx += s.x[i] / N; cy += s.y[i] / N; }
    s.cx = cx; s.cy = cy;
    // 地面の摩擦: 前へすべるので、体にそって後ろ向きに μf ν
    let Fx = 0, Fy = 0, M = 0;
    for (let i = 0; i < N; i++) {
      s.fx[i] = -sf.mf * w * s.tx[i]; s.fy[i] = -sf.mf * w * s.ty[i];
      Fx += s.fx[i] * ds; Fy += s.fy[i] * ds; M += ((s.x[i] - cx) * s.fy[i] - (s.y[i] - cy) * s.fx[i]) * ds;
    }
    s.drag = Math.hypot(Fx, Fy);
    // ふれている石（体の中心線から 体の半径＋石の半径 のところにある石）
    const C = [];
    for (const st of s.stones) {
      let bi = -1, bd = 1e9;
      for (let i = 0; i < N; i++) { const d = Math.hypot(s.x[i] - st.x, s.y[i] - st.y); if (d < bd) { bd = d; bi = i; } }
      if (bi < 1 || bi > N - 2 || Math.abs(bd - (RB + RS)) > 0.003) continue;
      const nx = (s.x[bi] - st.x) / bd, ny = (s.y[bi] - st.y) / bd;
      C.push({ st, i: bi, nx, ny, mz: (s.x[bi] - cx) * ny - (s.y[bi] - cy) * nx, N: 0 });
    }
    s.contacts = C;
    const b = [-Fx, -Fy, -M];
    let best = null, bestSum = Infinity;
    const K = C.length;
    const tryN = (idx) => {
      // idx の石だけで b を作れるか（最小二乗で解き、ぴったりかつ N ≥ 0 なら候補）
      const m = idx.length;
      const A = [[], [], []];
      for (const j of idx) { A[0].push(C[j].nx); A[1].push(C[j].ny); A[2].push(C[j].mz); }
      // 正規方程式 (AᵀA) x = Aᵀb
      const ATA = [], ATb = [];
      for (let r = 0; r < m; r++) { ATA.push([]); let t = 0; for (let c = 0; c < m; c++) { let v = 0; for (let k = 0; k < 3; k++) v += A[k][r] * A[k][c]; ATA[r].push(v); } for (let k = 0; k < 3; k++) t += A[k][r] * b[k]; ATb.push(t); }
      const xs = gauss(ATA, ATb);
      if (!xs || xs.some(v => v < -1e-12)) return;
      let res = 0;
      for (let k = 0; k < 3; k++) { let v = -b[k]; for (let r = 0; r < m; r++) v += A[k][r] * xs[r]; res += v * v; }
      const scale = Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[2]) + 1e-12;
      if (Math.sqrt(res) > 1e-6 * scale) return;
      const sum = xs.reduce((a, v) => a + v, 0);
      if (sum < bestSum) { bestSum = sum; best = { idx, xs }; }
    };
    for (let a = 0; a < K; a++) {
      tryN([a]);
      for (let c = a + 1; c < K; c++) { tryN([a, c]); for (let d = c + 1; d < K; d++) tryN([a, c, d]); }
    }
    if (best) {
      best.idx.forEach((j, r) => { C[j].N = best.xs[r]; });
      s.ok = true; s.Nsum = bestSum; s.why = '';
    } else {
      s.ok = false; s.Nsum = 0;
      s.why = K === 0 ? 'ふれている石がない' : K < 3 ? `ふれている石が ${K} つだけ` : '石の向きが前へ押せる並びになっていない';
    }
    s.U = s.ok ? s.U0 : 0;
  }
  function gauss(A, b) {
    const n = b.length, m = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
      if (Math.abs(m[piv][c]) < 1e-14) return null;
      [m[c], m[piv]] = [m[piv], m[c]];
      for (let r = 0; r < n; r++) if (r !== c) { const q = m[r][c] / m[c][c]; for (let k = c; k <= n; k++) m[r][k] -= q * m[c][k]; }
    }
    return m.map((r, i) => r[n] / r[i]);
  }

  function step(s, dt) {
    s.t += dt;
    s.S += s.U * dt;
    place(s); solve(s);
  }

  // まとめ: 何秒か進めて、進んだ距離・押す力の平均と最大・押した石の数
  function measure(o, sec = 6, dt = 0.01) {
    const s = make(o);
    const S0 = s.S, x0 = s.cx;
    let nsum = 0, nmax = 0, n = 0, stop = 0, kmax = 0;
    for (let t = 0; t < sec; t += dt) { step(s, dt); n++; nsum += s.Nsum; nmax = Math.max(nmax, ...s.contacts.map(c => c.N), 0); if (!s.ok) stop++; kmax = Math.max(kmax, s.contacts.filter(c => c.N > 0).length); }
    const W = s.p.mass * G;
    return { speed: (s.S - S0) / sec, vx: (s.cx - x0) / sec, Navg: nsum / n / W, Nmax: nmax / W, stopFrac: stop / n, kmax, drag: s.drag / W };
  }

  // 地面の摩擦の値は ground.js と同じものを使う
  const GROUND_SURF = (typeof GROUND !== 'undefined' ? GROUND : require('./ground.js')).SURF;
  const API = { N, RB, RS, make, step, measure, toggleStone, placePreset, at };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.STONES = API;
})(typeof window !== 'undefined' ? window : globalThis);
