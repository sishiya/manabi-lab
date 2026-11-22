// エサ1つから始めるときの確かめ（node で: node slime-maze/tools/verify-one.js）
//  A) 伸びているあいだ: 先端へ流れ、行き止まりで止まった枝がやせる / 伸びきって10時間で: 管が消え、体（Σ L√D）がエサの上のかたまりへ移る
//  B) 体がエサに集まったあと（15時間）、遠くに2つ目のエサを置く → 一瞬では道ができない。物質がとどくか、粘液の跡がうすれて（1日）
//     また探しに出てから本物の速さで伸びてたどりつき、最短の道に落ち着く
//  C) 物質の拡散: 4マス（20 mm）先で 1% になる時間が、拡散の式の見積もり（x² / 13.2Dc）と合うか
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Int32Array, Uint8Array, console, Set, Array, Infinity, isFinite }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'graph.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Maze, Graph, Model } = ctx;
const W = 12, H = 9, CELL = 5, centerCell = Math.floor(H / 2) * W + Math.floor(W / 2);
let ng = 0;
const say = (good, msg) => { if (!good) ng++; console.log(`${good ? 'OK' : 'NG'} ${msg}`); };

for (let seed = 1; seed <= 4; seed++) {
  const m = Maze.makeGood(W, H, seed), g = Graph.fromMazeFine(m, CELL, 3, seed), far = g.cellCenter(W * H - 1), s = Model.create(g, [g.cellCenter(0)], seed); Model.startGrowth(s, g.cellCenter(centerCell));
  let tFull = -1, thinDuring = 0;
  while (s.t < 40) {
    Model.step(s);
    if (s.growing) { for (let e = 0; e < g.nE; e++) if (Model.has(s, e) && s.D[e] < 0.1) { thinDuring++; break; } }
    else if (tFull < 0) tFull = s.t;
    if (tFull >= 0 && s.t > tFull + 10) break;
  }
  let alive = 0; for (let e = 0; e < g.nE; e++) if (Model.has(s, e)) alive++;
  say(tFull > 0 && thinDuring > 0 && alive === 0 && s.lump[g.cellCenter(0)] > 0.3 * s.M0,
    `A seed ${seed}: 埋まるまで ${tFull.toFixed(1)} h、伸びるあいだに細い管 ${thinDuring > 0 ? 'あり' : 'なし'}、10時間後に残った管 ${alive}本、エサの上 ${(100 * s.lump[g.cellCenter(0)] / s.M0).toFixed(0)}%`);
}

for (let seed = 1; seed <= 4; seed++) {
  const m = Maze.makeGood(W, H, seed), g = Graph.fromMazeFine(m, CELL, 3, seed), far = g.cellCenter(W * H - 1), s = Model.create(g, [g.cellCenter(0)], seed); Model.startGrowth(s, g.cellCenter(centerCell));
  while (s.t < 15) Model.step(s);
  let alive = 0; for (let e = 0; e < g.nE; e++) if (Model.has(s, e)) alive++;
  const sp = Graph.shortest(g, g.cellCenter(0), far).len;
  s.foods.push(far);
  const t0 = s.t; let tReach = -1, n = 0;
  while (n++ < 10000) { Model.step(s); if (tReach < 0 && s.reached[far]) tReach = s.t - t0; if (Model.settled(s)) break; }
  const minH = sp / Model.GROW_MM_H / (1.25 * Model.CHEM_UP);   // いちばん速い線の速さでも、最短の道のりにはこれだけかかる
  say(alive === 0 && tReach >= minH * 0.99 && Model.settled(s) && Model.tubeLength(s) < 1.15 * sp,   // 細かい網では、長さの近い道が残ることがある（本物も、ほぼ同じ長さの道は両方残る）
    `B seed ${seed}: 15時間後に残った管 ${alive}本、2つ目のエサ（最短 ${sp} mm）に着くまで ${tReach.toFixed(1)} h（少なくとも ${minH.toFixed(1)} h）、落ち着いた管の長さ ${Model.tubeLength(s).toFixed(1)} mm`);
}

{ // C: 1本の線の列（まっすぐな通路）で、4マス先が 1% になる時間
  const m = Maze.make(W, 1, 1), g = Graph.fromMaze(m, CELL), s = Model.create(g, [0], 1);
  let t = 0; while (s.cs[0][4] < Model.C_TH && t < 200) { Model.diffuse(s, Model.DT); t += Model.DT; }
  const Dc = Model.DIFF_M2_S * 3600 * 1e6 * Model.DIFF_BOOST, x = 4 * CELL, est = x * x / (13.2 * Dc);   // c = erfc(x / 2√(Dt)) = 0.01 → t = x² / (4·1.82² Dc)
  say(t > est * 0.67 && t < est * 1.5, `C 物質が 20 mm 先で 1% になるまで ${t.toFixed(2)} h（${Model.DIFF_BOOST}倍の演出つき）（式の見積もり ${est.toFixed(2)} h。マス目の計算なので 1.5 倍以内なら可）`);
}
process.exit(ng ? 1 : 0);
