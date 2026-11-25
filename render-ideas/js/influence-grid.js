// ③-C 影響の光 × 夜の街の電力網 — 電線の明るさ＝その電線を細くしたら、網全体の負担がどれだけ増えるか
// 計算: 直流潮流（送電の計画で使う近似）。節点の位相 θ、電線の流れ f = b (θᵢ − θⱼ)、P = B θ（B は電線の b でつくる行列）。
//   橋と同じ数学: 全体の負担 C = Pᵀθ = Σ f²/b。電線 e を少し細くしたときの C の増え方の割合 = (f²/b)/C（全部で1）。
// 切る: その電線をなくして解き直す。つながりが切れて島に分かれたら島ごとに解く。発電所のない島は停電。
//   発電所のある島は、島の中の発電所が使う量をまかなう（足りなければ全部の家を同じ割合で減らす）。
//   容量（ふだんの流れの 1.6 倍・最低 0.5）をこえた電線は赤（N-1：1本切れてもほかがこえないか、の考え）。
// 街と電線と使う量は架空。
'use strict';
(() => {
  const W = 1000, H = 620, COLS = 8, ROWS = 6;
  let seed = 31;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const nodes = [], lines = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) nodes.push({ x: 80 + i * 120 + (rnd() - 0.5) * 50, y: 70 + j * 96 + (rnd() - 0.5) * 40, load: 0.5 + rnd(), gen: 0 });
  const id = (i, j) => j * COLS + i;
  nodes[id(0, 1)].gen = 30; nodes[id(7, 4)].gen = 25; nodes[id(4, 0)].gen = 12;   // 発電所（まかなえる量）
  for (const n of nodes) if (n.gen) n.load = 0;
  const cand = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { if (i < COLS - 1) cand.push([id(i, j), id(i + 1, j)]); if (j < ROWS - 1) cand.push([id(i, j), id(i, j + 1)]); }
  // 幹線（太い）: 発電所から街の中へ
  const TRUNK = new Set(['8-9', '9-10', '10-11', '11-12', '12-13', '13-14', '14-15', '39-38', '38-37', '37-36', '4-12', '12-20', '20-28', '28-36', '15-23', '23-31', '31-39']);
  // いくつか抜いて、でこぼこの網に（つながったまま）
  function connected(ls) {
    const adj = nodes.map(() => []); ls.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
    const seen = new Set([0]), st = [0]; while (st.length) { const v = st.pop(); for (const u of adj[v]) if (!seen.has(u)) { seen.add(u); st.push(u); } }
    return seen.size === nodes.length;
  }
  let ls = cand.slice();
  for (let k = 0; k < 16; k++) {
    const i = Math.floor(rnd() * ls.length), e = ls[i], key = `${e[0]}-${e[1]}`;
    if (TRUNK.has(key) || TRUNK.has(`${e[1]}-${e[0]}`)) continue;
    const t = ls.filter((_, j) => j !== i); if (connected(t)) ls = t;
  }
  ls.forEach(([a, b]) => lines.push({ a, b, bw: TRUNK.has(`${a}-${b}`) || TRUNK.has(`${b}-${a}`) ? 3 : 1 }));
  // 家の明かり（節点のまわり）
  const houses = [];
  nodes.forEach((n, i) => { if (n.gen) return; const k = Math.round(n.load * 6); for (let h = 0; h < k; h++) houses.push({ n: i, dx: (rnd() - 0.5) * 70, dy: (rnd() - 0.5) * 56, s: 1 + rnd() * 1.5 }); });

  let cut = new Set(), res = null, base = null, normal = false, noteEl = null, downAt = null;
  let fit = { s: 1, ox: 0, oy: 0 };

  function solveSys(M, b) {
    const m = b.length, a = M.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < m; c++) {
      let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
      [a[c], a[p]] = [a[p], a[c]]; if (Math.abs(a[c][c]) < 1e-12) return null;
      for (let r = 0; r < m; r++) { if (r === c) continue; const f = a[r][c] / a[c][c]; for (let k = c; k <= m; k++) a[r][k] -= f * a[c][k]; }
    }
    return a.map((r, i) => r[m] / r[i]);
  }
  // 島ごとに解く
  function solve(cutSet) {
    const act = lines.map((l, e) => cutSet.has(e) ? null : l);
    const adj = nodes.map(() => []); act.forEach((l, e) => { if (l) { adj[l.a].push(l.b); adj[l.b].push(l.a); } });
    const island = new Array(nodes.length).fill(-1); let ni = 0;
    for (let s = 0; s < nodes.length; s++) { if (island[s] >= 0) continue; const st = [s]; island[s] = ni; while (st.length) { const v = st.pop(); for (const u of adj[v]) if (island[u] < 0) { island[u] = ni; st.push(u); } } ni++; }
    const theta = new Array(nodes.length).fill(0), served = new Array(nodes.length).fill(0);
    for (let k = 0; k < ni; k++) {
      const mem = nodes.map((_, i) => i).filter(i => island[i] === k);
      const demand = mem.reduce((a, i) => a + nodes[i].load, 0), cap = mem.reduce((a, i) => a + nodes[i].gen, 0);
      if (cap === 0 || demand === 0) continue;   // 発電所がない＝停電
      const frac = Math.min(1, cap / demand), P = mem.map(i => nodes[i].gen ? nodes[i].gen / cap * demand * frac : -nodes[i].load * frac);
      mem.forEach(i => served[i] = nodes[i].gen ? 0 : frac);
      if (mem.length < 2) continue;
      const ix = new Map(mem.map((v, q) => [v, q])), m = mem.length, B = Array.from({ length: m }, () => new Array(m).fill(0));
      act.forEach(l => { if (!l || !ix.has(l.a)) return; const p = ix.get(l.a), q = ix.get(l.b); B[p][p] += l.bw; B[q][q] += l.bw; B[p][q] -= l.bw; B[q][p] -= l.bw; });
      const ref = mem.findIndex(i => nodes[i].gen > 0);   // 基準の節点（θ = 0）
      const keep = [...Array(m).keys()].filter(q => q !== ref), th = solveSys(keep.map(p => keep.map(q => B[p][q])), keep.map(p => P[p]));
      if (th) keep.forEach((q, kk) => theta[mem[q]] = th[kk]);
    }
    const flow = lines.map((l, e) => act[e] ? l.bw * (theta[l.a] - theta[l.b]) : 0);
    const U = flow.map((f, e) => act[e] ? f * f / lines[e].bw : 0), C = U.reduce((a, b) => a + b, 0);
    return { theta, flow, U, C, served, islands: ni };
  }
  function recompute() {
    res = solve(cut);
    if (!base) { base = res; lines.forEach((l, e) => l.cap = Math.max(0.5, Math.abs(base.flow[e]) * 1.6)); }
  }

  function resize(w, h) { const s = Math.min(w / W, h / H); fit = { s, ox: (w - W * s) / 2, oy: (h - H * s) / 2 }; }
  const P = i => [fit.ox + nodes[i].x * fit.s, fit.oy + nodes[i].y * fit.s];

  function draw(g, w, h) {
    g.fillStyle = '#05080e'; g.fillRect(0, 0, w, h);
    const mx = Math.max(...res.U), share = e => res.C > 0 ? res.U[e] / res.C : 0;
    // 区画（建物のかげ）
    g.fillStyle = '#0b1220';
    for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS - 1; i++) { const a = P(id(i, j)), c = P(id(i + 1, j + 1)); g.fillRect(a[0] + 10 * fit.s, a[1] + 10 * fit.s, c[0] - a[0] - 20 * fit.s, c[1] - a[1] - 20 * fit.s); }
    // 家の明かり（停電なら消える）
    for (const hs of houses) {
      const [cx, cy] = P(hs.n), on = res.served[hs.n], x = cx + hs.dx * fit.s, y = cy + hs.dy * fit.s;
      if (on > 0) { g.fillStyle = `rgba(255,${190 + 30 * on | 0},110,${0.35 + 0.6 * on})`; g.fillRect(x, y, hs.s * 2 * fit.s + 1, hs.s * 2 * fit.s + 1); }
      else { g.fillStyle = 'rgba(70,80,95,0.5)'; g.fillRect(x, y, hs.s * 2 * fit.s + 1, hs.s * 2 * fit.s + 1); }
    }
    // 電線
    g.lineCap = 'round';
    lines.forEach((l, e) => {
      const [x1, y1] = P(l.a), [x2, y2] = P(l.b);
      if (cut.has(e)) { g.setLineDash([4, 6]); g.strokeStyle = 'rgba(163,180,191,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]); return; }
      const over = Math.abs(res.flow[e]) > l.cap;
      if (normal) { g.strokeStyle = over ? '#ff7a6a' : 'rgba(163,180,191,0.7)'; g.lineWidth = l.bw > 1 ? 3 : 1.5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); return; }
      const b = mx > 0 ? Math.pow(res.U[e] / mx, 0.6) : 0, c = over ? [255, 110, 90] : [140, 210, 255];
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [wd, al] of [[22, 0.05], [10, 0.12], [4, 0.35]]) { g.strokeStyle = `rgba(${c},${al * b})`; g.lineWidth = wd * (l.bw > 1 ? 1.3 : 1); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
      g.restore();
      g.strokeStyle = `rgba(${c},${0.25 + 0.75 * b})`; g.lineWidth = l.bw > 1 ? 2.4 : 1.4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    });
    // 発電所
    nodes.forEach((n, i) => {
      if (!n.gen) return; const [x, y] = P(i), s = 12 * Math.max(0.7, fit.s);
      g.fillStyle = '#ffc95a'; g.fillRect(x - s, y - s * 0.7, s * 2, s * 1.4); g.fillRect(x + s * 0.3, y - s * 1.5, s * 0.5, s * 0.9);
      g.fillStyle = '#14202c'; g.font = `700 ${Math.round(s * 0.9)}px 'Zen Kaku Gothic New', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('発', x, y);
    });
    const dark = houses.filter(hs => res.served[hs.n] === 0).length, overN = lines.filter((l, e) => !cut.has(e) && Math.abs(res.flow[e]) > l.cap).length;
    RI.hud(`停電の家 ${dark} / ${houses.length}　容量をこえた電線 ${overN} 本（赤）`);
  }

  function setNote(s) { if (noteEl) noteEl.innerHTML = s; }
  function toggle(e) {
    const before = res, sh = before.C > 0 ? before.U[e] / before.C : 0;
    if (cut.has(e)) { cut.delete(e); recompute(); setNote('つなぎなおしました。'); return; }
    cut.add(e); recompute();
    const dark = houses.filter(hs => res.served[hs.n] === 0).length, overN = lines.filter((l, k) => !cut.has(k) && Math.abs(res.flow[k]) > l.cap).length;
    const act = before.C > 0 ? (res.C - before.C) / before.C * 100 : 0;
    setNote(`電線を切りました。網全体の負担　光の強さ <b>${(sh * 100).toFixed(0)}%</b> → 実際の増え方 <b>${act >= 0 ? '+' : ''}${act.toFixed(0)}%</b>`
      + (dark ? `<br>つながりが切れて <b>${dark} 軒が停電</b>しました${act < 0 ? '（送る電気が減ったので、負担の数字は下がります）' : ''}。` : '') + (overN ? `<br>ほかの電線 <b>${overN} 本</b>が容量をこえました（赤）。` : ''));
  }
  function brightest() { let best = -1; res.U.forEach((u, e) => { if (!cut.has(e) && (best < 0 || u > res.U[best])) best = e; }); if (best >= 0) toggle(best); }
  function pointer(type, px, py, ev) {
    if (type === 'down') downAt = { x: px, y: py };
    if (type !== 'up' || !downAt || Math.hypot(px - downAt.x, py - downAt.y) > 10) return;
    downAt = null;
    const tol = ev && ev.pointerType === 'touch' ? 22 : 12; let best = -1, bd = tol;
    lines.forEach((l, e) => {
      const [x1, y1] = P(l.a), [x2, y2] = P(l.b), dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(px - x1 - t * dx, py - y1 - t * dy); if (d < bd) { bd = d; best = e; }
    });
    if (best >= 0) toggle(best);
  }

  RI.add({
    id: 'influence-grid', group: 'influence', label: '夜の街の電力網',
    lead: '電線の明るさは、<b>その電線を細くしたら、網全体の負担がどれだけ増えるか</b>です。電線を押すと切れます。',
    how: `<p>発電所（黄色の四角）から家へ電気を送る網です。送電の計画で使う「直流潮流」という近似で、どの電線に電気がどれだけ流れるかを計算しています。電線を少し細くしたら網全体の負担（流れの2乗÷太さ の合計）がどれだけ増えるかの割合を、明るさにしました。橋の部材の明るさと、まったく同じ数学です。</p>
      <p>電線を切ると、電気は別の道へ流れなおします。ほかの電線が容量をこえると赤くなります（1本切れてもほかがこえないかを確かめる「N-1」の考え）。つながりが切れて発電所のない島ができると、その家の明かりは消えます（停電）。</p>
      <p>簡単にしているところ: 街・電線・使う量・容量（ふだんの流れの 1.6 倍）は架空です。直流潮流は、電圧の大きさや電気が熱になって失われる分を無視した近似です。</p>`,
    init() { recompute(); }, resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうの描き方（くらべる）', normal, v => { normal = v; });
      const b2 = RI.buttons(root);
      RI.action(b2, 'いちばん明るい電線を切る', brightest);
      RI.action(b2, '全部つなぎなおす', () => { cut.clear(); recompute(); setNote('全部つなぎなおしました。'); });
      noteEl = RI.note(root, '電線を押すと切れます（もう一度押すとつながります）。'); noteEl.style.minHeight = '4.8em';
    },
    step() { return false; }, draw, pointer,
  });
  window.__reidGrid = { nodes, lines, get res() { return res; }, toggle, solve };
})();
