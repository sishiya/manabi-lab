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
  // 地図のデータ（tools/build-japan.mjs が作る data/japan.json）から Graph を作る
  fromData(d) {
    const N = d.N, nE = d.ea.length, adj = Array.from({ length: N }, () => []);
    for (let e = 0; e < nE; e++) { adj[d.ea[e]].push(e); adj[d.eb[e]].push(e); }
    const len = Float64Array.from(d.len), sorted = Array.from(len).sort((a, b) => a - b);
    return {
      N, nE, x: Float64Array.from(d.x), y: Float64Array.from(d.y), ea: Int32Array.from(d.ea), eb: Int32Array.from(d.eb), len,
      open: new Uint8Array(nE).fill(1), adj, pts: d.pts.map(p => p || null),
      wobble: false, maze: null, unit: sorted[sorted.length >> 1], widthMM: 2, tubeMM: 1.6, symbolMM: 14, scale: d.kmPerMM * 1000,
      land: d.land, cities: d.cities, kmPerMM: d.kmPerMM, bounds: d.bounds,
    };
  },
  // 陸の形の細かい網（道の情報なし。Tero ほか 2010 の実験: 陸の形の寒天の上を、粘菌は自由に伸びた）
  //  data/japan.json の陸の形の中に、間隔 h mm の三角の格子（どの向きにも同じように伸びられる）。点は少しずらす（格子の並びが見えないように）
  //  海峡: 陸から BUF mm（1 mm = 5 km）より近い海は陸とみなす（幅 約10 km より狭い海はわたれる）→ 関門・明石・鳴門のようなせまい海峡はつながり、津軽海峡（約 20 km）はつながらない
  //   （陸の形は簡単にしてあるので、せまい海峡は本物より広い。そのため 5 km とした）
  //  都市は、いちばん近い網の点に
  fromLand(d, h = 3, seed = 1, elev = null) {
    const BUF = 1.0, rng = makeRng(seed ^ 0x51ed), polys = d.land.map(p => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { p, x0: x0 - BUF, y0: y0 - BUF, x1: x1 + BUF, y1: y1 + BUF };
    });
    const onLand = (x, y) => {
      for (const P of polys) {
        if (x < P.x0 || x > P.x1 || y < P.y0 || y > P.y1) continue;
        const p = P.p; let inside = false;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
          const [xi, yi] = p[i], [xj, yj] = p[j];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return true;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) {   // 陸の外: 岸から BUF より近いか
          const [xi, yi] = p[i], [xj, yj] = p[j];
          if (Math.abs(x - xi) > BUF + Math.abs(xj - xi) || Math.abs(y - yi) > BUF + Math.abs(yj - yi)) continue;
          const dx = xj - xi, dy = yj - yi, t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / (dx * dx + dy * dy || 1)));
          if (Math.hypot(x - xi - t * dx, y - yi - t * dy) < BUF) return true;
        }
      }
      return false;
    };
    const b = d.bounds, rh = h * Math.sqrt(3) / 2, R = Math.ceil((b.y1 - b.y0) / rh) + 1, C = Math.ceil((b.x1 - b.x0) / h) + 2;
    const id = new Int32Array(R * C).fill(-1), xs = [], ys = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const x0 = b.x0 + c * h + (r & 1 ? h / 2 : 0), y0 = b.y0 + r * rh;
      if (!onLand(x0, y0)) continue;
      id[r * C + c] = xs.length;
      xs.push(x0 + (rng() - 0.5) * 0.4 * h); ys.push(y0 + (rng() - 0.5) * 0.4 * h);
    }
    const ea = [], eb = [], len = [];
    const link = (i, j) => {
      if (i < 0 || j < 0) return;
      for (const t of [0.25, 0.5, 0.75]) if (!onLand(xs[i] + (xs[j] - xs[i]) * t, ys[i] + (ys[j] - ys[i]) * t)) return;   // 海をまたぐ線は作らない
      ea.push(i); eb.push(j); len.push(Math.hypot(xs[j] - xs[i], ys[j] - ys[i]));
    };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = id[r * C + c]; if (i < 0) continue;
      if (c + 1 < C) link(i, id[r * C + c + 1]);
      if (r + 1 < R) { const c0 = r & 1 ? c : c - 1; if (c0 >= 0) link(i, id[(r + 1) * C + c0]); if (c0 + 1 < C) link(i, id[(r + 1) * C + c0 + 1]); }
    }
    const N = xs.length, nE = ea.length, adj = Array.from({ length: N }, () => []);
    for (let e = 0; e < nE; e++) { adj[ea[e]].push(e); adj[eb[e]].push(e); }
    const g = {
      N, nE, x: Float64Array.from(xs), y: Float64Array.from(ys), ea: Int32Array.from(ea), eb: Int32Array.from(eb), len: Float64Array.from(len),
      open: new Uint8Array(nE).fill(1), adj, pts: null,
      wobble: false, maze: null, unit: h, widthMM: h, tubeMM: 2.4, symbolMM: 14, scale: d.kmPerMM * 1000,
      land: d.land, kmPerMM: d.kmPerMM, bounds: d.bounds, showNet: false,
      // くらべる目印の道路（本物の道路の線。粘菌は知らない）
      roads: d.roadLines || d.ea.map((a, e) => [[d.x[a], d.y[a]], ...(d.pts[e] || []), [d.x[d.eb[e]], d.y[d.eb[e]]]]),   // 関東の地図は線のまま持っている
    };
    // 都市 → いちばん近い、ほかの点とつながっている網の点
    const near = (x, y) => { let best = -1, bd = Infinity; for (let i = 0; i < N; i++) { if (!adj[i].length) continue; const dd = (xs[i] - x) ** 2 + (ys[i] - y) ** 2; if (dd < bd) { bd = dd; best = i; } } return best; };
    g.cities = {};
    for (const [k, c] of Object.entries(d.cities || {})) g.cities[k] = near(d.x[c], d.y[c]);
    // 経度・緯度の町（地図データの cityLL。なければ cities.js の県庁所在地）。投影は地図を作った道具と同じ（正距円筒）
    g.places = {};
    const LL = d.cityLL || window.CAPITALS;
    if (d.proj && LL) {
      const P = d.proj, cos0 = Math.cos(P.lat0 * Math.PI / 180);
      for (const [k, [lon, lat]] of Object.entries(LL)) {
        const px = P.R * (lon - P.lon0) * Math.PI / 180 * cos0, py = -P.R * (lat - P.lat0) * Math.PI / 180;
        g.places[k] = near((px - P.x0) / d.kmPerMM, (py - P.y0) / d.kmPerMM);
      }
    }
    // 山（Tero ほか 2010 の実験: 高い所ほど強い光を当てて、粘菌を低い所に通した）。点の標高 → 線の「光」0〜1
    elev = elev || d.elev;   // 関東の地図は標高を中に持っている
    if (elev && d.proj) {
      const P = d.proj, cos0 = Math.cos(P.lat0 * Math.PI / 180), bin = atob(elev.b64), E = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) E[i] = bin.charCodeAt(i);
      const at = (fi, fj) => E[Math.max(0, Math.min(elev.nLat - 1, fi)) * elev.nLon + Math.max(0, Math.min(elev.nLon - 1, fj))];
      g.elev = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const px = xs[i] * d.kmPerMM + P.x0, py = ys[i] * d.kmPerMM + P.y0;
        const lon = P.lon0 + px / (P.R * cos0) * 180 / Math.PI, lat = P.lat0 - py / P.R * 180 / Math.PI;
        const fi = (lat - elev.lat0) / elev.step, fj = (lon - elev.lon0) / elev.step, i0 = Math.floor(fi), j0 = Math.floor(fj), u = fi - i0, v = fj - j0;
        g.elev[i] = elev.unitM * ((1 - u) * ((1 - v) * at(i0, j0) + v * at(i0, j0 + 1)) + u * ((1 - v) * at(i0 + 1, j0) + v * at(i0 + 1, j0 + 1)));   // 4点から補間
      }
      g.light = new Float32Array(nE);
      for (let e = 0; e < nE; e++) g.light[e] = Graph.lightOf(Math.max(g.elev[ea[e]], g.elev[eb[e]]));
    }
    return g;
  },
  // 標高 → 光の強さ（0〜1）。LIGHT_LOW m より低い所は暗く、LIGHT_HIGH m より高い所は いちばん明るい（あいだは直線。値は仮定）
  LIGHT_LOW: 200, LIGHT_HIGH: 1000,
  lightOf(m) { return Math.max(0, Math.min(1, (m - Graph.LIGHT_LOW) / (Graph.LIGHT_HIGH - Graph.LIGHT_LOW))); },
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

  // エサ全部をいちばん短くつなぐ網（エサどうしのいちばん短い道で、最小全域木。プリム法）。{ edges: 線の番号（重なりなし）, len: 線の長さの和 mm }
  mst(g, foods) {
    const n = foods.length, P = [];
    for (let i = 0; i < n; i++) { P.push([]); for (let j = 0; j < n; j++) P[i].push(j > i ? Graph.shortest(g, foods[i], foods[j]) : null); }
    const path = (i, j) => i < j ? P[i][j] : P[j][i];
    const inT = new Uint8Array(n); inT[0] = 1; const set = new Set();
    for (let k = 1; k < n; k++) {
      let best = null, bj = -1;
      for (let i = 0; i < n; i++) if (inT[i]) for (let j = 0; j < n; j++) if (!inT[j]) { const p = path(i, j); if (p && (!best || p.len < best.len)) { best = p; bj = j; } }
      if (!best) return null;   // つながっていないエサがある
      inT[bj] = 1; for (const e of best.edges) set.add(e);
    }
    let len = 0; for (const e of set) len += g.len[e];
    return { edges: [...set], len };
  },

  // 画面の点（mm）にいちばん近い点。maxMM より遠ければ -1
  nearest(g, x, y, maxMM = Infinity) {
    let best = -1, bd = maxMM * maxMM;
    for (let i = 0; i < g.N; i++) { const dx = g.x[i] - x, dy = g.y[i] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best;
  },
};
window.Graph = Graph;
