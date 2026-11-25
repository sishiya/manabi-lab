// ③ 影響の光 — トラス橋の計算（2次元・ピン接合・小さなたわみ＝線形）
// 橋: 長さ 24 m（4 m × 6 区間）、高さ 4 m。内側の4区間はたすきがけ（余分な部材がある＝不静定）なので、1本抜いても崩れないことが多い。
// 鋼 E = 200 GPa、断面積は上下の弦 0.010 m²、ほかは 0.005 m²（代表値）。左はしはピン、右はしはころ（横に動ける）で支える。
// 荷重: 床の重さ 40 kN を下の内側の節点に1つずつ（推定）＋ トラック 20 t（196 kN）を位置に応じて両どなりの節点へ分ける。
// 影響（感度）: コンプライアンス C = f·u（かかる重さ × その点のたわみ の合計）。部材 e をほんの少し弱めたときの C の増え方の割合は
//   2U_e / C（U_e は部材にたまるひずみエネルギー。全部足すと 1）。Bendsøe & Sigmund 2003。これを明るさにする。
// 抜いたときの実際: その部材をなくして解き直す。剛性行列が特異（ピボットが小さい）なら「崩れる」。圧縮材の座屈は計算しない。
'use strict';
const Truss = (() => {
  const E = 200e9, A_CHORD = 0.010, A_WEB = 0.005, DEAD = 40e3, TRUCK = 20e3 * 9.81;
  const nodes = [];          // [x, y]（m）
  const B = i => i, T = i => 7 + (i - 1);   // 下 b0..b6 → 0..6、上 t1..t5 → 7..11
  for (let i = 0; i <= 6; i++) nodes.push([i * 4, 0]);
  for (let i = 1; i <= 5; i++) nodes.push([i * 4, 4]);
  const members = [];        // { a, b, A, kind }
  const add = (a, b, A, kind) => members.push({ a, b, A, kind });
  for (let i = 0; i < 6; i++) add(B(i), B(i + 1), A_CHORD, '下の弦');
  for (let i = 1; i < 5; i++) add(T(i), T(i + 1), A_CHORD, '上の弦');
  for (let i = 1; i <= 5; i++) add(B(i), T(i), A_WEB, 'たて材');
  add(B(0), T(1), A_CHORD, 'はしの斜め材'); add(B(6), T(5), A_CHORD, 'はしの斜め材');
  for (let i = 1; i < 5; i++) { add(B(i), T(i + 1), A_WEB, '斜め材'); add(T(i), B(i + 1), A_WEB, '斜め材'); }
  const fixed = new Set([0, 1, 13]);    // 左はし b0 はピン（x・y）、右はし b6 はころ（y だけ。温度で伸びても押さない、本物の橋と同じ）
  const NDOF = nodes.length * 2;
  const free = [...Array(NDOF).keys()].filter(d => !fixed.has(d));

  function loads(truckX) {
    const f = new Float64Array(NDOF);
    for (let i = 1; i <= 5; i++) f[B(i) * 2 + 1] += DEAD;          // 下向きを＋（y は上が＋なので、たわみは負になる。下で符号をそろえる）
    const xx = Math.max(0, Math.min(24, truckX)), k = Math.min(5, Math.floor(xx / 4)), t = xx / 4 - k;
    f[B(k) * 2 + 1] += TRUCK * (1 - t); f[B(k + 1) * 2 + 1] += TRUCK * t;
    for (let d = 0; d < NDOF; d++) if (d % 2) f[d] = -f[d];        // y は上が＋なので、重さは −
    return f;
  }

  function memberK(m) {
    const [x1, y1] = nodes[m.a], [x2, y2] = nodes[m.b], L = Math.hypot(x2 - x1, y2 - y1), c = (x2 - x1) / L, s = (y2 - y1) / L;
    return { L, c, s, k: E * m.A / L, dofs: [m.a * 2, m.a * 2 + 1, m.b * 2, m.b * 2 + 1], v: [-c, -s, c, s] };
  }

  // 解く。removed: 抜いた部材の集合。戻り値 { ok, u, C, U[], N[] } または { ok:false }（崩れる）
  function solve(truckX, removed) {
    const n = free.length, idx = new Int32Array(NDOF).fill(-1); free.forEach((d, i) => idx[d] = i);
    const K = Array.from({ length: n }, () => new Float64Array(n));
    const mk = members.map(memberK);
    members.forEach((m, e) => {
      if (removed.has(e)) return;
      const q = mk[e];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const I = idx[q.dofs[i]], J = idx[q.dofs[j]];
        if (I >= 0 && J >= 0) K[I][J] += q.k * q.v[i] * q.v[j];
      }
    });
    const fAll = loads(truckX), f = free.map(d => fAll[d]);
    // コレスキー分解（ピボットが小さければ崩れる＝動ける形がある）
    let maxDiag = 0; for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, K[i][i]);
    const Lm = Array.from({ length: n }, () => new Float64Array(n));
    for (let j = 0; j < n; j++) {
      let s = K[j][j]; for (let k = 0; k < j; k++) s -= Lm[j][k] * Lm[j][k];
      if (s <= 1e-9 * maxDiag) return { ok: false };
      Lm[j][j] = Math.sqrt(s);
      for (let i = j + 1; i < n; i++) { let t = K[i][j]; for (let k = 0; k < j; k++) t -= Lm[i][k] * Lm[j][k]; Lm[i][j] = t / Lm[j][j]; }
    }
    const y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = f[i]; for (let k = 0; k < i; k++) s -= Lm[i][k] * y[k]; y[i] = s / Lm[i][i]; }
    const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= Lm[k][i] * x[k]; x[i] = s / Lm[i][i]; }
    const u = new Float64Array(NDOF); free.forEach((d, i) => u[d] = x[i]);
    let C = 0; for (let d = 0; d < NDOF; d++) C += fAll[d] * u[d];
    const U = [], N = [];
    members.forEach((m, e) => {
      if (removed.has(e)) { U.push(0); N.push(0); return; }
      const q = mk[e]; let ext = 0; for (let i = 0; i < 4; i++) ext += q.v[i] * u[q.dofs[i]];
      N.push(q.k * ext);                 // 軸力（＋引っぱり、−押す）
      U.push(0.5 * q.k * ext * ext);     // ひずみエネルギー
    });
    return { ok: true, u, C, U, N };
  }

  // トラックの下のたわみ（m、下向きを＋）
  function sag(r, truckX) {
    const xx = Math.max(0, Math.min(24, truckX)), k = Math.min(5, Math.floor(xx / 4)), t = xx / 4 - k;
    return -(r.u[B(k) * 2 + 1] * (1 - t) + r.u[B(k + 1) * 2 + 1] * t);
  }

  return { nodes, members, solve, sag, SPAN: 24, HEIGHT: 4 };
})();
