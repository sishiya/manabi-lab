// ジオラマに見えるわけ — 道の網の上を、車と人が動く（道の線は js/real/gen.js が式で作る。形は OpenStreetMap の道と同じ { cls, oneway, pts }）
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
      const sc = o.vScale ? o.vScale(rnd) : 0.8 + rnd() * 0.4;   // 速さの好みは1台・1人ごと
      const it = { e, s: rnd() * e.len, lane: lanes[(rnd() * lanes.length) | 0], v: 0, sc, v0: o.v(e) * sc, nx: null, ph: rnd() * 6.28, k: i };
      it.nx = next(G, e, rnd); e.items.push(it); list.push(it);
    }
    const TR = o.turnR || 6, YAWR = o.yawRate || 2.5, locks = new Map();   // 交差点の順番（点 → 入っている車）
    // 点につながる隣の点の数（入る道も出る道も）。3 以上が交差点（一方通行の交差点は、出る道だけ数えると 2 になる）
    const nb = G.P.map(() => new Set()); for (const e of G.edges) { nb[e.a].add(e.b); nb[e.b].add(e.a); }
    const deg = n => nb[n].size;
    // 角を曲線で: 点（交差点・折れ目）の手前 r と先 r を、2次ベジェでつなぐ
    // 角の半径: 横のずれ（車線・歩道）より大きく（内側の点が角で一気に動かない）。辺の長さの半分まで
    function corner(e, nx, it) { return Math.min(Math.max(TR, it ? Math.abs(it.lane) + 1.5 : TR), e.len / 2, nx.len / 2); }
    function pose(it, dt) {
      const e = it.e, [ax, az] = G.P[e.a];
      let x = ax + e.dx * it.s, z = az + e.dz * it.s, tx = e.dx, tz = e.dz;
      let P0, P1, P2, u = -1, d0 = null;
      if (it.nx && it.s > e.len - corner(e, it.nx, it)) { const r = corner(e, it.nx, it), [bx, bz] = G.P[e.b]; P0 = [bx - e.dx * r, bz - e.dz * r]; P1 = [bx, bz]; P2 = [bx + it.nx.dx * r, bz + it.nx.dz * r]; u = (it.s - (e.len - r)) / (2 * r); d0 = [e.dx, e.dz, it.nx.dx, it.nx.dz]; }
      else if (it.pe && it.s < it.cr) { const r = it.cr; P0 = [ax - it.pe.dx * r, az - it.pe.dz * r]; P1 = [ax, az]; P2 = [ax + e.dx * r, az + e.dz * r]; u = 0.5 + it.s / (2 * r); d0 = [it.pe.dx, it.pe.dz, e.dx, e.dz]; }
      if (u >= 0 && d0[0] * d0[2] + d0[1] * d0[3] < -0.9) {
        // Uターン（行き止まり）: 曲線は折り返しの点で向きが決まらないので、点のまわりを半円で回る（向きを右回りに π）
        const [bx, bz] = P1, rr = Math.hypot(P1[0] - P0[0], P1[1] - P0[1]);
        if (u < 0.25 || u > 0.75) {   // 手前と先はまっすぐ（点へ向かう・点から出る）
          const k = u < 0.25 ? 1 - u / 0.25 : (u - 0.75) / 0.25, dx = u < 0.25 ? -d0[0] : d0[2], dz = u < 0.25 ? -d0[1] : d0[3];
          x = bx + dx * rr * k; z = bz + dz * rr * k; tx = u < 0.25 ? d0[0] : d0[2]; tz = u < 0.25 ? d0[1] : d0[3];
          u = -2;
        }
      }
      if (u >= 0 && d0[0] * d0[2] + d0[1] * d0[3] < -0.9) {
        const a = Math.PI * Math.min(1, Math.max(0, (u - 0.25) * 2)), sgn = -1;
        const c = Math.cos(sgn * a), sn = Math.sin(sgn * a);
        tx = d0[0] * c - d0[1] * sn; tz = d0[0] * sn + d0[1] * c;
        // 左の向き（tz, −tx）が、はじめは左、まん中で前を向くほうへ回す
        const mid = Math.cos(sgn * Math.PI / 2), ms = Math.sin(sgn * Math.PI / 2), fx = d0[0] * mid - d0[1] * ms, fz = d0[0] * ms + d0[1] * mid;
        if (fz * d0[0] - fx * d0[1] < 0) { const c2 = Math.cos(-sgn * a), s2 = Math.sin(-sgn * a); tx = d0[0] * c2 - d0[1] * s2; tz = d0[0] * s2 + d0[1] * c2; }
        x = P1[0]; z = P1[1]; u = -2;
      }
      if (u >= 0) {
        const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
        x = w0 * P0[0] + w1 * P1[0] + w2 * P2[0]; z = w0 * P0[1] + w1 * P1[1] + w2 * P2[1];
        tx = (1 - u) * (P1[0] - P0[0]) + u * (P2[0] - P1[0]); tz = (1 - u) * (P1[1] - P0[1]) + u * (P2[1] - P1[1]);
        const l = Math.hypot(tx, tz); if (l > 1e-6) { tx /= l; tz /= l; } else { tx = e.dx; tz = e.dz; }
      }
      // 車線（横のずれ）も、急に変えずにゆっくり
      if (it.laneS === undefined) it.laneS = it.lane;
      it.laneS += Math.max(-dt * 1.2, Math.min(dt * 1.2, it.lane - it.laneS));
      it.x = x + tz * it.laneS; it.z = z - tx * it.laneS;
      // 向きは、進む向きへ一定の速さまでで回す（Uターンのとがりも、くるっと回る）
      const ry = Math.atan2(tx, tz);
      if (it.ry === undefined || !dt) it.ry = ry;
      else { let d = ry - it.ry; d = Math.atan2(Math.sin(d), Math.cos(d)); it.ry += Math.max(-YAWR * dt, Math.min(YAWR * dt, d)); }
    }
    list.forEach(it => pose(it, 0));
    function step(dt) {
      if (o.follow) for (const e of G.edges) if (e.items.length > 1) e.items.sort((a, b) => a.s - b.s);
      // 前方の見張り用の格子（8 m 升）
      const grid = new Map();
      if (o.follow) for (const it of list) { const k = Math.floor(it.x / 8) * 100003 + Math.floor(it.z / 8); (grid.get(k) || grid.set(k, []).get(k)).push(it); }
      for (const it of list) {
        let free = 1e9;
        if (o.follow) {
          const arr = it.e.items, j = arr.indexOf(it);
          const near = b => Math.abs(b.lane - it.lane) < 1 || Math.abs((b.laneS ?? b.lane) - (it.laneS ?? it.lane)) < 1.6;   // 車線を移る途中の車も前の車として見る
          for (let q = j + 1; q < arr.length; q++) if (near(arr[q])) { free = arr[q].s - it.s - o.len - o.gap; break; }
          if (free > 1e8 && it.nx) { const rest = it.e.len - it.s; for (const b of it.nx.items) if (near(b)) free = Math.min(free, rest + b.s - o.len - o.gap); }
          // 交差点（3本以上の道の点）: 入る順番。先に入った車が通りぬけるまで、手前（角の曲線の入り口の 3 m 前）で待つ
          //   同じ道から続く車・向かい合ってまっすぐ進む車どうしは、同時に入ってよい。待ちが 12 秒をこえたら入る（行きづまりをさける）
          if (it.nx && deg(it.e.b) > 2) {
            const node = it.e.b, r = corner(it.e, it.nx, it), dn = it.e.len - it.s - r, H = (locks.get(node) || []).filter(h => h.it.e.b === node || h.it.lockNode === node);   // 出し直した車などの古い順番は捨てる
            locks.set(node, H);
            const ok = h => h.it === it || h.in === it.e || (Math.abs(h.in.dx * it.e.dx + h.in.dz * it.e.dz + 1) < 0.3 && h.in.dx * h.out.dx + h.in.dz * h.out.dz > 0.8 && it.e.dx * it.nx.dx + it.e.dz * it.nx.dz > 0.8);
            if (dn < 12) {
              // 先の道が詰まっているときは入らない（交差点の中で止まって横の流れをふさがない）
              let room = 1e9; for (const b of it.nx.items) if (near(b)) room = Math.min(room, b.s);
              const exitOk = room > corner(it.e, it.nx, it) + o.len + o.gap + 2;
              if (exitOk && (H.every(ok) || (it.wait || 0) > 12) || H.some(h => h.it === it)) { if (!H.some(h => h.it === it)) { H.push({ it, in: it.e, out: it.nx }); locks.set(node, H); } it.wait = 0; }
              else { free = Math.min(free, dn - 3); it.wait = (it.wait || 0) + dt; }
            }
          }
        }
        // 前方の見張り: 進む向きの前 8 m・横 2 m に別の車がいたら、その手前で止まる（道がつながっていない所・折れ目でも重ならない）
        if (o.follow) {
          const hx = Math.sin(it.ry), hz = Math.cos(it.ry), gx = Math.floor(it.x / 8), gz = Math.floor(it.z / 8); let blk = 1e9;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of grid.get((gx + a) * 100003 + gz + b) || []) {
            if (q === it) continue; const dx = q.x - it.x, dz = q.z - it.z, f = dx * hx + dz * hz, lat = Math.abs(dx * hz - dz * hx);
            const qx = Math.sin(q.ry), qz = Math.cos(q.ry);
            if (f > 0 && f < 8 && lat < 2) {   // すぐ前にいる
              const g2 = -dx * qx - dz * qz, lat2 = Math.abs(-dx * qz + dz * qx);
              if (g2 > 0 && g2 < 8 && lat2 < 2 && it.k < q.k) continue;   // おたがいに前に見える（合流）: 番号の小さい車が先
              blk = Math.min(blk, f); continue;
            }
            // ぶつかりの予測: 今の速さのまま進むと、2.5 秒以内に 2.6 m より近づくか（交わる道・合流）。相手のほうが前にいるなら、こちらが待つ
            const wx = qx * q.v - hx * it.v, wz = qz * q.v - hz * it.v, w2 = wx * wx + wz * wz;
            if (w2 < 1e-4) continue;
            const tc = -(dx * wx + dz * wz) / w2, miss = Math.hypot(dx + wx * tc, dz + wz * tc);
            if (tc > 0 && tc < 2.5 && miss < 2.6) {
              const g2 = -dx * qx - dz * qz;   // 相手から見た、こちらの前後
              if (f > g2 || (Math.abs(f - g2) < 0.5 && it.k > q.k)) blk = Math.min(blk, o.len + Math.max(0, Math.min(3, f - 3)));   // こちらが後ろ側 → 今の所で止まって待つ
            }
            continue;
          }
          if (blk < 1e9) { it.sw = (it.sw || 0) + dt; if (it.sw < 5) free = Math.min(free, blk - o.len); } else it.sw = 0;   // 5 秒待っても動けないときは見張りを外す（にらみ合い・行きづまりの輪をほどく）
        }
        let vMax = Math.max(0, Math.min(o.v(it.e) * it.sc, free / 1.3));   // 目標の速さ = 道の目安 × その人・車の好み
        // 曲がる前の減速: 曲がる角度 θ・角の半径 r から、曲がれる速さ √(a·R)（横の加速度 a = 2 m/s²）、R = r / tan(θ/2)。手前から b = 2.5 m/s² で落とす
        if (o.follow && it.nx) {
          const c = Math.max(-1, Math.min(1, it.e.dx * it.nx.dx + it.e.dz * it.nx.dz)), th = Math.acos(c);
          if (th > 0.25) { const R = corner(it.e, it.nx, it) / Math.tan(Math.min(1.5, th) / 2), vT = Math.max(1.5, Math.sqrt(2 * R)), d = Math.max(0, it.e.len - it.s - corner(it.e, it.nx, it));
            vMax = Math.min(vMax, Math.sqrt(vT * vT + 2 * 2.5 * d)); }
        }
        it.v = vMax > it.v ? Math.min(vMax, it.v + 2 * dt) : Math.max(vMax, it.v - 6 * dt);
        // 角を回るあいだは、横にずれた点（歩道・車線）がふつうの速さで動くように、中心の進みを r / (r + |ずれ|) にする
        let cz = 1;
        if (it.nx && it.s > it.e.len - corner(it.e, it.nx, it)) { const r = corner(it.e, it.nx, it); cz = r / (r + Math.abs(it.laneS ?? it.lane)); }
        else if (it.pe && it.s < it.cr) cz = it.cr / (it.cr + Math.abs(it.laneS ?? it.lane));
        it.s += it.v * cz * dt;
        while (it.s > it.e.len) {
          const nx = it.nx || next(G, it.e, rnd);
          if (!nx) {   // 行き止まり（地図の端）: 別の道の、前があいている所へ出し直す（場面の外なので見えない）
            const arr0 = it.e.items; arr0.splice(arr0.indexOf(it), 1);
            let e2 = pickEdge(); for (let t = 0; t < 20 && e2.items.some(b => b.s < 15); t++) e2 = pickEdge();
            it.e = e2; it.s = 0; it.pe = null; it.cr = 0; it.v = 0; e2.items.push(it); it.nx = next(G, e2, rnd); it.ry = undefined;
            const ls = o.lanes(e2); it.lane = it.laneS = ls[(rnd() * ls.length) | 0];
            break;
          }
          it.s -= it.e.len;
          const arr = it.e.items; arr.splice(arr.indexOf(it), 1);
          it.cr = corner(it.e, nx, it); it.pe = it.e; it.lockNode = it.e.b;
          it.e = nx; nx.items.push(it); it.nx = next(G, nx, rnd);
          // 車線は同じ側（左右の符号が同じ）でいちばん近いものへ（道を横切らない）
          const lanes = o.lanes(nx);
          if (!lanes.includes(it.lane)) { const same = lanes.filter(l => Math.sign(l) === Math.sign(it.lane) || l === 0); const L = same.length ? same : lanes; it.lane = L.reduce((a, b) => Math.abs(b - it.lane) < Math.abs(a - it.lane) ? b : a); }
        }
        if (it.lockNode !== undefined && (it.s > it.cr + 2 || it.e.a !== it.lockNode)) { const H = locks.get(it.lockNode); if (H) { const k = H.findIndex(h => h.it === it); if (k >= 0) H.splice(k, 1); } it.lockNode = undefined; }   // 交差点を出たら順番を返す
        if (!o.follow) { const [k, amp] = Kit.gait(it.v); it.ph += it.v * dt * k; it.amp = amp; }   // 脚の運びは本当の速さと歩幅から（滑らない）   // 人の歩きの位相（1歩 ≈ 0.9 m）
        pose(it, dt);
      }
    }
    function at(it) { return [it.x, it.z, it.ry]; }
    return { list, step, at };
  }
  return { graph, movers, W };
})();
