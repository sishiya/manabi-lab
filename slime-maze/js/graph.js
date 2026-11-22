// 点と線の地図（グラフ）。粘菌のモデルと絵は、この形だけを見る（迷路のマス目は知らない）
// いまは迷路から作る（fromMaze）。将来、日本の道路の地図などを載せるときは、同じ形の Graph を作ればよい:
//   N        点の数              x[i], y[i]  点の位置（mm。地図なら投影した座標を mm に直す）
//   nE       線の数              ea[e], eb[e] 線の両はしの点、len[e] 長さ（mm）、open[e] 通れるか（1/0）
//   adj[i]   点 i につながる線の番号の配列
//   pts[e]   （なくてよい）線の途中の形 [[x,y], …]（道路のカーブ。両はしの点はふくめない）
//   wobble   true なら、まっすぐな線を粘菌らしく少しうねらせて描く（迷路の通路の中だけ。道路では false）
//   maze     （迷路のときだけ）壁を描く・壁をいじるための迷路そのもの
//   unit     いちばんよくある線の長さ（mm。体の量の目安などに使う）
//   tubeMM   いちばん太い管の太さ（mm。絵のため）
//   widthMM  通路の幅（mm。迷路はマスの大きさ。道路なら、粘菌の実験の寒天の上での道の幅）
//   scale    （地図のとき）地図の上の 1 mm が本物の何 m か。粘菌は実験の大きさ（mm）で動き、地図の縮尺は表示だけに使う
// 点が数千をこえる地図では、step（共役勾配法）と拡散を Worker へ移す（まだ。迷路は軽いのでメインのまま）
'use strict';

const Graph = {
  fromMaze(maze, cellMM) {
    const N = maze.W * maze.H, x = new Float64Array(N), y = new Float64Array(N), len = new Float64Array(maze.nE).fill(cellMM);
    for (let i = 0; i < N; i++) { x[i] = (i % maze.W + 0.5) * cellMM; y[i] = (Math.floor(i / maze.W) + 0.5) * cellMM; }
    return {
      N, nE: maze.nE, x, y, ea: maze.ea, eb: maze.eb, len, open: maze.open, adj: maze.adj, pts: null,
      wobble: true, maze, cellMM, unit: cellMM, widthMM: cellMM, tubeMM: cellMM * 0.42, scale: null,
      bounds: { x0: 0, y0: 0, x1: maze.W * cellMM, y1: maze.H * cellMM },
    };
  },
  // 迷路を細かい網にする: 1マスを k×k の小さな点に分け、たて・よこ・ななめにつなぐ（同じマスの中と、壁のないマスどうし）。
  // 粘菌の管は細かい網の中から選ばれるので、角の内側を近道したり、Y 字に分かれたりできる（本物の管の網に近づける）。
  // g.cross[迷路の通路] = その通路（マスのさかいめ）をまたぐ細かい線の番号。壁をいじるときに使う
  // 点の位置は少しずつずらす（ばらつき ±0.3 h。マスの外には出ない）。線の長さがそろわないので、同じ長さの平行な道が残らず、1本の管にまとまる
  fromMazeFine(maze, cellMM, k = 3, seed = 1) {
    const W = maze.W * k, H = maze.H * k, N = W * H, h = cellMM / k, rng = makeRng(seed * 7919 + 13);
    const x = new Float64Array(N), y = new Float64Array(N);
    for (let i = 0; i < N; i++) { x[i] = (i % W + 0.5 + 0.6 * (rng() - 0.5)) * h; y[i] = (Math.floor(i / W) + 0.5 + 0.6 * (rng() - 0.5)) * h; }
    const dist = (a, b) => Math.hypot(x[a] - x[b], y[a] - y[b]);
    const cellOf = i => Math.floor(Math.floor(i / W) / k) * maze.W + Math.floor((i % W) / k);
    // 2つのマスのあいだの迷路の通路（となりでなければ -1）
    const mazeEdge = (c1, c2) => { for (const e of maze.adj[c1]) if (maze.ea[e] === c2 || maze.eb[e] === c2) return e; return -1; };
    const ea = [], eb = [], len = [], via = [];
    const add = (a, b, L) => {
      const ca = cellOf(a), cb = cellOf(b);
      let v = -1;
      if (ca !== cb) { v = mazeEdge(ca, cb); if (v < 0) return; }   // ななめに2つ先のマスへは、つながない
      ea.push(a); eb.push(b); len.push(L); via.push(v);
    };
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
      const i = yy * W + xx;
      if (xx + 1 < W) add(i, i + 1, dist(i, i + 1));
      if (yy + 1 < H) add(i, i + W, dist(i, i + W));
      if (xx + 1 < W && yy + 1 < H) add(i, i + W + 1, dist(i, i + W + 1));
      if (xx > 0 && yy + 1 < H) add(i, i + W - 1, dist(i, i + W - 1));
    }
    const nE = ea.length, open = new Uint8Array(nE), cross = Array.from({ length: maze.nE }, () => []);
    const adj = Array.from({ length: N }, () => []);
    for (let e = 0; e < nE; e++) {
      adj[ea[e]].push(e); adj[eb[e]].push(e);
      if (via[e] >= 0) cross[via[e]].push(e);
    }
    const g = {
      N, nE, x, y, ea: Int32Array.from(ea), eb: Int32Array.from(eb), len: Float64Array.from(len), open, adj, pts: null,
      wobble: false, maze, cellMM, k, unit: h, widthMM: cellMM, tubeMM: cellMM * 0.3, scale: null, cross,
      bounds: { x0: 0, y0: 0, x1: maze.W * cellMM, y1: maze.H * cellMM },
      cellCenter: c => (Math.floor(c / maze.W) * k + (k >> 1)) * W + (c % maze.W) * k + (k >> 1),
    };
    Graph.syncMaze(g);
    return g;
  },
  // 迷路の壁に合わせて、細かい線の通れる・通れないを決めなおす
  syncMaze(g) {
    for (let e = 0; e < g.nE; e++) g.open[e] = 1;
    for (let me = 0; me < g.maze.nE; me++) if (!g.maze.open[me]) for (const e of g.cross[me]) g.open[e] = 0;
    // ななめの線が、壁の角をかすめて通らないように: ななめの線は、そのまわりの2マスのさかいめも開いているときだけ（同じマスの中は常に可）
    const k = g.k, W = g.maze.W * k, mz = g.maze;
    const cellOf = i => Math.floor(Math.floor(i / W) / k) * mz.W + Math.floor((i % W) / k);
    const me2 = (c1, c2) => { for (const e of mz.adj[c1]) if (mz.ea[e] === c2 || mz.eb[e] === c2) return e; return -1; };
    for (let e = 0; e < g.nE; e++) {
      if (!g.open[e]) continue;
      const a = g.ea[e], b = g.eb[e], dx = (b % W) - (a % W), dy = Math.floor(b / W) - Math.floor(a / W);
      if (dx === 0 || dy === 0) continue;
      const ca = cellOf(a), cb = cellOf(b); if (ca === cb) continue;
      // ななめにとなりのマスへ: 通る2つのマス（a の横・a の縦）を経る道が、どちらか開いていること
      const c1 = cellOf(a + dx), c2 = cellOf(a + dy * W);
      const ok1 = (c1 === ca || me2(ca, c1) >= 0 && mz.open[me2(ca, c1)]) && (c1 === cb || me2(c1, cb) >= 0 && mz.open[me2(c1, cb)]);
      const ok2 = (c2 === ca || me2(ca, c2) >= 0 && mz.open[me2(ca, c2)]) && (c2 === cb || me2(c2, cb) >= 0 && mz.open[me2(c2, cb)]);
      if (!ok1 || !ok2) g.open[e] = 0;
    }
  },
  other(g, e, i) { return g.ea[e] === i ? g.eb[e] : g.ea[e]; },

  // a から b へのいちばん短い道（線の長さで。ダイクストラ法）。{ edges: 線の番号の列, len: 長さ mm }。届かなければ null
  shortest(g, a, b, usable = e => g.open[e]) {
    const dist = new Float64Array(g.N).fill(Infinity), prev = new Int32Array(g.N).fill(-1), done = new Uint8Array(g.N);
    dist[a] = 0;
    // 点の数が数千までなら、単純な二分ヒープで十分
    const heap = [[0, a]];
    const push = it => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, u] = pop(); if (done[u]) continue; done[u] = 1; if (u === b) break;
      for (const e of g.adj[u]) { if (!usable(e)) continue; const v = Graph.other(g, e, u), nd = d + g.len[e]; if (nd < dist[v]) { dist[v] = nd; prev[v] = e; push([nd, v]); } }
    }
    if (!isFinite(dist[b])) return null;
    const edges = []; for (let c = b; c !== a;) { const e = prev[c]; edges.push(e); c = Graph.other(g, e, c); }
    return { edges: edges.reverse(), len: dist[b] };
  },

  // 画面の点（mm）にいちばん近い点。maxMM より遠ければ -1
  nearest(g, x, y, maxMM = Infinity) {
    let best = -1, bd = maxMM * maxMM;
    for (let i = 0; i < g.N; i++) { const dx = g.x[i] - x, dy = g.y[i] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best;
  },
};
window.Graph = Graph;
