// 迷路: 格子のマス目と、そのあいだの通路（辺）。乱数・迷路づくり・いちばん短い道
'use strict';

// 種から同じ乱数列を出す（mulberry32）。同じ迷路を作り直せるように
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// W×H のマス。辺は「となりあう2マスのあいだ」。open[e] が true なら通路、false なら壁
// 辺の番号: 横の辺（x と x+1）… e = y*(W-1)+x、縦の辺（y と y+1）… e = H*(W-1) + y*W + x
const Maze = {
  make(W, H, seed, loops = 0.12) {
    const rng = makeRng(seed);
    const nE = H * (W - 1) + (H - 1) * W;
    const ea = new Int32Array(nE), eb = new Int32Array(nE);
    for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) { const e = y * (W - 1) + x; ea[e] = y * W + x; eb[e] = y * W + x + 1; }
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) { const e = H * (W - 1) + y * W + x; ea[e] = y * W + x; eb[e] = (y + 1) * W + x; }
    const adj = Array.from({ length: W * H }, () => []);
    for (let e = 0; e < nE; e++) { adj[ea[e]].push(e); adj[eb[e]].push(e); }
    const open = new Uint8Array(nE);
    // 1) 穴を掘る（深さ優先）→ 道が1通りだけの迷路
    const seen = new Uint8Array(W * H), stack = [0]; seen[0] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const cand = adj[c].filter(e => !seen[ea[e] === c ? eb[e] : ea[e]]);
      if (!cand.length) { stack.pop(); continue; }
      const e = cand[Math.floor(rng() * cand.length)], n = ea[e] === c ? eb[e] : ea[e];
      open[e] = 1; seen[n] = 1; stack.push(n);
    }
    // 2) 壁をいくつかぬいて、道が何通りもあるようにする（本物の実験の迷路も、エサのあいだの道は4通り）
    const walls = []; for (let e = 0; e < nE; e++) if (!open[e]) walls.push(e);
    for (let i = walls.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [walls[i], walls[j]] = [walls[j], walls[i]]; }
    const k = Math.round(walls.length * loops);
    for (let i = 0; i < k; i++) open[walls[i]] = 1;
    return { W, H, nE, ea, eb, adj, open, seed };
  },
  other(m, e, c) { return m.ea[e] === c ? m.eb[e] : m.ea[e]; },
  // 開いている通路だけを通る、a から b へのいちばん短い道（辺の長さはどれも1 → 幅優先）。辺の番号の列、届かなければ null
  shortest(m, a, b, usable = e => m.open[e]) {
    const prev = new Int32Array(m.W * m.H).fill(-2); prev[a] = -1;
    const q = [a];
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi]; if (c === b) break;
      for (const e of m.adj[c]) { if (!usable(e)) continue; const n = Maze.other(m, e, c); if (prev[n] !== -2) continue; prev[n] = e; q.push(n); }
    }
    if (prev[b] === -2) return null;
    const path = []; for (let c = b; c !== a;) { const e = prev[c]; path.push(e); c = Maze.other(m, e, c); }
    return path.reverse();
  },
  // a から b へのいちばん短い道が何本あるか（同じ長さの道が2本以上あると、どちらも残りうる）
  countShortest(m, a, b) {
    const N = m.W * m.H, d = new Int32Array(N).fill(-1), c = new Float64Array(N); d[a] = 0; c[a] = 1; const q = [a];
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      for (const e of m.adj[u]) { if (!m.open[e]) continue; const v = Maze.other(m, e, u); if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } if (d[v] === d[u] + 1) c[v] += c[u]; }
    }
    return c[b];
  },
  // 左上と右下のあいだのいちばん短い道が1本だけで、道が何通りもある迷路を、種を進めながら探す
  makeGood(W, H, seed) {
    for (let k = 0; k < 500; k++) {
      const m = Maze.make(W, H, seed + k);
      if (Maze.countShortest(m, 0, W * H - 1) === 1) return m;
    }
    return Maze.make(W, H, seed);
  },
};
window.Maze = Maze; window.makeRng = makeRng;
