// 点と線の地図（グラフ）。粘菌のモデルと絵は、この形だけを見る（迷路のマス目は知らない）
// いまは迷路から作る（fromMaze）。将来、日本の道路の地図などを載せるときは、同じ形の Graph を作ればよい:
//   N        点の数              x[i], y[i]  点の位置（mm。地図なら投影した座標を mm に直す）
//   nE       線の数              ea[e], eb[e] 線の両はしの点、len[e] 長さ（mm）、open[e] 通れるか（1/0）
//   adj[i]   点 i につながる線の番号の配列
//   pts[e]   （なくてよい）線の途中の形 [[x,y], …]（道路のカーブ。両はしの点はふくめない）
//   wobble   true なら、まっすぐな線を粘菌らしく少しうねらせて描く（迷路の通路の中だけ。道路では false）
//   maze     （迷路のときだけ）壁を描く・壁をいじるための迷路そのもの
//   unit     いちばんよくある線の長さ（mm。体の量の目安などに使う）
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
      wobble: true, maze, cellMM, unit: cellMM, widthMM: cellMM, scale: null,
      bounds: { x0: 0, y0: 0, x1: maze.W * cellMM, y1: maze.H * cellMM },
    };
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
