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
      const push = it => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      while (heap.length) {
        const [d, u] = pop();
        if (done.has(u)) continue; done.add(u);
        for (const e of adj.get(u) || []) { const v = Graph.other(g, e, u), nd = d + g.len[e]; if (nd < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, nd); push([nd, v]); } }
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
    // 切れると分かれるつなぎ（橋）を、1回の深さ優先探索で（タージャンの方法）。橋のうち、両がわにエサがあるものを数える
    //  つなぎを、両はしの分かれ目どうしを結ぶ1本の辺とみる（同じ2点を結ぶつなぎが2本あれば、どちらも橋ではない）
    const ends = links.map(L => { const deg = new Map(); for (const e of L) for (const v of [g.ea[e], g.eb[e]]) deg.set(v, (deg.get(v) || 0) + 1);
      const js = [...deg].filter(([v, c]) => c === 1 || isJ(v)).map(([v]) => v); return js.length >= 2 ? [js[0], js[1]] : [js[0] ?? g.ea[L[0]], js[0] ?? g.ea[L[0]]]; });
    const ladj = new Map(); ends.forEach(([a, b], k) => { if (a === b) return; for (const [u, v] of [[a, b], [b, a]]) { let l = ladj.get(u); if (!l) ladj.set(u, l = []); l.push([v, k]); } });
    const tin = new Map(), low = new Map(), sub = new Map(); let timer = 0, bridges = 0; const nF = foods.length;
    for (const root of ladj.keys()) {
      if (tin.has(root)) continue;
      const st = [[root, -1, 0]]; tin.set(root, timer); low.set(root, timer); timer++; sub.set(root, isFood.has(root) ? 1 : 0);
      while (st.length) {
        const top = st[st.length - 1], [u, pk] = top, nb = ladj.get(u) || [];
        if (top[2] < nb.length) {
          const [v, k] = nb[top[2]++]; if (k === pk) continue;
          if (tin.has(v)) low.set(u, Math.min(low.get(u), tin.get(v)));
          else { tin.set(v, timer); low.set(v, timer); timer++; sub.set(v, isFood.has(v) ? 1 : 0); st.push([v, k, 0]); }
        } else {
          st.pop();
          if (st.length) { const p = st[st.length - 1][0]; low.set(p, Math.min(low.get(p), low.get(u))); sub.set(p, sub.get(p) + sub.get(u));
            if (low.get(u) > tin.get(p)) { const fs = sub.get(u); if (fs > 0 && fs < nF) bridges++; } }
        }
      }
    }
    let len = 0; for (const e of edges) len += g.len[e];
    return { len, md: pairs ? sum / pairs : NaN, unreach, links: links.length, bridges };
  },
  // いまの粘菌の網（流れが来ている管）
  net(s) { const out = []; for (let e = 0; e < s.g.nE; e++) if (Model.has(s, e) && s.Qs[e] > 1e-3) out.push(e); return out; },
  netLen(s) { let L = 0; for (let e = 0; e < s.g.nE; e++) if (Model.has(s, e) && s.Qs[e] > 1e-3) L += s.g.len[e]; return L; },
  // 粘菌の網を、最小全域木 mst（{edges}）とくらべる → { tl, md, ft, ok }（全部のエサがつながっていなければ ok = false）
  compare(s, mst) {
    const M = Metrics._mst && Metrics._mst.key === mst ? Metrics._mst.m : (Metrics._mst = { key: mst, m: Metrics.measure(s.g, s.foods, mst.edges) }).m;
    const R = Metrics.measure(s.g, s.foods, Metrics.net(s));
    return { tl: R.len / M.len, md: R.md / M.md, ft: R.links ? 1 - R.bridges / R.links : 0, ok: !R.unreach };
  },
};
window.Metrics = Metrics;
