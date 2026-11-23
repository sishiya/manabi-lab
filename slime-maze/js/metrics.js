// 網の性能を、Tero ほか 2010（Science 327）と同じ物差しで測る（日本の陸の画面の表示と tools/analyze-net.js で使う）
//  長さ TL_MST  = 網の長さ ÷ エサをいちばん短くつなぐ網（最小全域木）の長さ                  … 論文の粘菌 1.75 ± 0.30（鉄道 約1.8）
//  近さ MD_MST  = 網の上のエサどうしの最短距離の平均 ÷ 最小全域木の上での平均               … 論文 0.85 ± 0.04（鉄道 0.85）
//  切れにくさ FT = 1 − （1本の「つなぎ」が切れると網が分かれる割合）                           … 論文 光あり 0.86（14 ± 4% で分かれる）、光なし 0.80、鉄道 0.96
//   「つなぎ」= 分かれ目どうし・エサどうしのあいだの、管のひとつながり
//  論文の最小全域木は地図の上のまっすぐな線。ここは陸の網の上でのいちばん短い道（陸の網はジグザグなので少し長い）
'use strict';
const Metrics = {
  PAPER: { tl: 1.75, md: 0.85, ft: 0.86 },

  // 辺の集合 edges（網）→ 長さ、エサどうしの最短距離の平均、つなぎの数、切れると分かれるつなぎの数
  measure(g, foods, edges) {
    const isFood = new Set(foods), adj = new Map();
    const add = (a, e) => { let l = adj.get(a); if (!l) adj.set(a, l = []); l.push(e); };
    for (const e of edges) { add(g.ea[e], e); add(g.eb[e], e); }
    let sum = 0, pairs = 0, unreach = 0;
    for (let i = 0; i < foods.length; i++) {
      const dist = new Map([[foods[i], 0]]), done = new Set(), heap = [[0, foods[i]]];
      while (heap.length) {
        let m = 0; for (let k = 1; k < heap.length; k++) if (heap[k][0] < heap[m][0]) m = k;
        const [d, u] = heap[m]; heap[m] = heap[heap.length - 1]; heap.pop();
        if (done.has(u)) continue; done.add(u);
        for (const e of adj.get(u) || []) { const v = Graph.other(g, e, u), nd = d + g.len[e]; if (nd < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, nd); heap.push([nd, v]); } }
      }
      for (let j = i + 1; j < foods.length; j++) { if (dist.has(foods[j])) { sum += dist.get(foods[j]); pairs++; } else unreach++; }
    }
    const isJ = v => isFood.has(v) || (adj.get(v) || []).length !== 2;
    const seen = new Set(), links = [];
    for (const e0 of edges) {
      if (seen.has(e0)) continue;
      const chain = [e0]; seen.add(e0);
      for (const start of [g.ea[e0], g.eb[e0]]) {
        let v = start, prev = e0;
        while (!isJ(v)) { const nx = adj.get(v).find(x => x !== prev); if (seen.has(nx)) break; seen.add(nx); chain.push(nx); prev = nx; v = Graph.other(g, nx, v); }
      }
      links.push(chain);
    }
    const conn = skip => { const sk = new Set(skip), q = [foods[0]], vis = new Set(q);
      for (let i = 0; i < q.length; i++) for (const e of adj.get(q[i]) || []) { if (sk.has(e)) continue; const v = Graph.other(g, e, q[i]); if (!vis.has(v)) { vis.add(v); q.push(v); } }
      return foods.every(f => vis.has(f)); };
    let bridges = 0; for (const L of links) if (!conn(L)) bridges++;
    let len = 0; for (const e of edges) len += g.len[e];
    return { len, md: pairs ? sum / pairs : NaN, unreach, links: links.length, bridges };
  },
  // いまの粘菌の網（流れが来ている管）
  net(s) { const out = []; for (let e = 0; e < s.g.nE; e++) if (Model.has(s, e) && s.Qs[e] > 1e-3) out.push(e); return out; },
  // 粘菌の網を、最小全域木 mst（{edges}）とくらべる → { tl, md, ft, ok }（全部のエサがつながっていなければ ok = false）
  compare(s, mst) {
    const M = Metrics._mst && Metrics._mst.key === mst ? Metrics._mst.m : (Metrics._mst = { key: mst, m: Metrics.measure(s.g, s.foods, mst.edges) }).m;
    const R = Metrics.measure(s.g, s.foods, Metrics.net(s));
    return { tl: R.len / M.len, md: R.md / M.md, ft: R.links ? 1 - R.bridges / R.links : 0, ok: !R.unreach };
  },
};
window.Metrics = Metrics;
