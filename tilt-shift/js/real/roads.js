// ジオラマに見えるわけ — 本物の道（OpenStreetMap）の上を、車と人が動く
//   道の線: OpenFreeMap のベクトルタイル（z14）の transportation 層。出典「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」
//   道の頂点を 1 m 単位でまとめて点にし、点と点を結ぶ「網」を作る。車も人も、網の辺を進み、点に着くと次の辺を選ぶ（まっすぐに近い辺ほど選びやすい）。
//   車: 左側通行（進む向きの左へ、車線の半分ずらす）・一方通行は片向き・トンネルはのぞく・前の車との間をあける（追従のかんたんなモデル）。交差点の信号はない。
//   人: 歩行者の道（footway・pedestrian）と、通りの両側の歩道（道の幅の半分＋1.5 m）。駅（原点）に近いほど多い。
'use strict';
const RealRoads = (() => {
  const W = { motorway: 7, trunk: 16, primary: 16, secondary: 12, tertiary: 9, minor: 6, service: 4 };       // 道の幅（m・推定）
  const V = { motorway: 16, trunk: 13, primary: 12, secondary: 10, tertiary: 8, minor: 6, service: 4 };     // 目標の速さ（m/s）
  const GAP = { motorway: 45, trunk: 30, primary: 30, secondary: 45, tertiary: 70, minor: 180, service: 1e9 };   // 車の間隔（m・1車線あたり、平均）
  const tx = (lon, z) => (lon + 180) / 360 * 2 ** z;
  const ty = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z; };

  // 原点のまわり radius m の道の線を読む → [{ cls, sub, oneway, tunnel, pts: [[x, z], ...] }]
  async function load(lon0, lat0, radius, toXZ) {
    const tj = await (await fetch('https://tiles.openfreemap.org/planet')).json();
    const z = 14, k = 180 / Math.PI / 6378137, dLat = radius * k, dLon = dLat / Math.cos(lat0 * Math.PI / 180);
    const x0 = Math.floor(tx(lon0 - dLon, z)), x1 = Math.floor(tx(lon0 + dLon, z)), y0 = Math.floor(ty(lat0 + dLat, z)), y1 = Math.floor(ty(lat0 - dLat, z));
    const lines = [], jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(fetch(tj.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y)).then(r => r.ok ? r.arrayBuffer() : null).then(buf => {
      if (!buf) return;
      const L = RealMVT.decode(buf, ['transportation']).transportation; if (!L) return;
      const E = L.extent, n = 2 ** z;
      for (const f of L.features) {
        if (f.type !== 2) continue;
        const p = f.props;
        for (const g of f.geom) {
          const pts = [];
          for (let i = 0; i < g.length; i += 2) {
            const lon = (x + g[i] / E) / n * 360 - 180, m = Math.PI - 2 * Math.PI * (y + g[i + 1] / E) / n, lat = 180 / Math.PI * Math.atan(Math.sinh(m));
            pts.push(toXZ(lon, lat));
          }
          lines.push({ cls: p.class, sub: p.subclass, oneway: p.oneway || 0, tunnel: p.brunnel === 'tunnel', pts });
        }
      }
    }).catch(() => {}));
    await Promise.all(jobs);
    return lines;
  }

  // 線 → 向きのある辺の網。keep(line) で使う線を選ぶ。辺: { a, b（点の番号）, len, dx, dz, cls, w }
  function graph(lines, keep, radius) {
    const key = (x, z) => Math.round(x) + ',' + Math.round(z), id = new Map(), P = [], out = [];
    const node = (x, z) => { const k = key(x, z); let i = id.get(k); if (i === undefined) { i = P.length; id.set(k, i); P.push([x, z]); out.push([]); } return i; };
    const edges = [];
    for (const L of lines) {
      if (!keep(L)) continue;
      for (let i = 0; i + 1 < L.pts.length; i++) {
        const [ax, az] = L.pts[i], [bx, bz] = L.pts[i + 1];
        if (Math.hypot(ax, az) > radius && Math.hypot(bx, bz) > radius) continue;
        const a = node(ax, az), b = node(bx, bz); if (a === b) continue;
        const len = Math.hypot(bx - ax, bz - az);
        const add = (u, v) => { const e = { a: u, b: v, len, dx: (P[v][0] - P[u][0]) / len, dz: (P[v][1] - P[u][1]) / len, cls: L.cls, sub: L.sub, w: W[L.cls] || 4, items: [] }; edges.push(e); out[u].push(e); };
        if (L.oneway !== -1) add(a, b);
        if (L.oneway !== 1) add(b, a);
      }
    }
    return { P, out, edges };
  }
  // 点 b に着いた物の次の辺（来た道へもどる辺は、ほかにないときだけ）。まっすぐに近いほど選びやすい
  function next(G, e, rnd) {
    const cand = G.out[e.b].filter(f => f.b !== e.a);
    if (!cand.length) return G.out[e.b].find(f => f.b === e.a) || null;
    let tot = 0; const w = cand.map(f => { const c = e.dx * f.dx + e.dz * f.dz, v = Math.pow(1.6 + c, 3); tot += v; return v; });
    let r = rnd() * tot; for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
    return cand[cand.length - 1];
  }

  // 動く物の群れ。o: { lanes(e) → 道の中心から左へのずらし（の候補）, v(e), n（数）, weight(e) → 置く重み, len（物の長さ）, gap（止まるときの間）, follow（前を見るか） }
  function movers(G, o, rnd) {
    const list = [], edges = G.edges.filter(e => o.weight(e) > 0);
    if (!edges.length) return { list, step() {} };
    const cum = []; let tot = 0; for (const e of edges) { tot += o.weight(e) * e.len; cum.push(tot); }
    const pickEdge = () => { const r = rnd() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; } return edges[lo]; };
    for (let i = 0; i < o.n; i++) {
      const e = pickEdge(), lanes = o.lanes(e);
      const it = { e, s: rnd() * e.len, lane: lanes[(rnd() * lanes.length) | 0], v: 0, v0: o.v(e) * (0.8 + rnd() * 0.4), nx: null, ph: rnd() * 6.28, k: i };
      it.nx = next(G, e, rnd); e.items.push(it); list.push(it);
    }
    function step(dt) {
      if (o.follow) for (const e of G.edges) if (e.items.length > 1) e.items.sort((a, b) => a.s - b.s);
      for (const it of list) {
        let free = 1e9;
        if (o.follow) {
          const arr = it.e.items, j = arr.indexOf(it);
          for (let q = j + 1; q < arr.length; q++) if (Math.abs(arr[q].lane - it.lane) < 1) { free = arr[q].s - it.s - o.len - o.gap; break; }
          if (free > 1e8 && it.nx) { const rest = it.e.len - it.s; for (const b of it.nx.items) if (Math.abs(b.lane - it.lane) < 1) free = Math.min(free, rest + b.s - o.len - o.gap); }
        }
        const vMax = Math.max(0, Math.min(it.v0 * (o.v(it.e) / (o.v(it.e) || 1)), free / 1.3));
        it.v = vMax > it.v ? Math.min(vMax, it.v + 2 * dt) : Math.max(vMax, it.v - 6 * dt);
        it.s += it.v * dt;
        while (it.s > it.e.len) {
          const nx = it.nx || next(G, it.e, rnd); if (!nx) { it.s = it.e.len; break; }
          it.s -= it.e.len;
          const arr = it.e.items; arr.splice(arr.indexOf(it), 1);
          it.e = nx; nx.items.push(it); it.nx = next(G, nx, rnd);
          const lanes = o.lanes(nx); if (!lanes.includes(it.lane)) it.lane = lanes[(rnd() * lanes.length) | 0];
        }
        it.ph += it.v * dt * 3.4;   // 人の歩きの位相（1歩 ≈ 0.9 m）
      }
    }
    // 位置と向き: 辺の上の点から左へ lane m
    function at(it) {
      const e = it.e, [ax, az] = G.P[e.a], x = ax + e.dx * it.s + e.dz * it.lane, z = az + e.dz * it.s - e.dx * it.lane;
      return [x, z, Math.atan2(e.dx, e.dz)];
    }
    return { list, step, at };
  }
  return { load, graph, movers, W };
})();
