// エサ1つのときの確かめ（node で: node slime-maze/tools/verify-one.js）
//  伸びているあいだ: 先端へ流れ、行き止まりで止まった枝がやせる / 伸びきったら: 管がやせ、体（Σ L√D）がエサの上のかたまりへ移る
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Int32Array, Uint8Array, console, Set, Array }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Maze, Model } = ctx;
let ng = 0;
for (let seed = 1; seed <= 10; seed++) {
  const m = Maze.makeGood(12, 9, seed), s = Model.create(m, [0], seed); Model.startGrowth(s);
  let tFull = -1, thinDuring = 0, n = 0;
  while (n++ < 4000) {
    Model.step(s);
    if (s.growing) { for (let e = 0; e < m.nE; e++) if (Model.has(s, e) && s.D[e] < 0.05) { thinDuring++; break; } }
    else if (tFull < 0) tFull = s.t;
    if (tFull >= 0 && s.t > tFull + 8) break;
  }
  const V = Model.volume(s), blob = s.blob[0]; let maxD = 0; for (let e = 0; e < m.nE; e++) if (Model.has(s, e)) maxD = Math.max(maxD, s.D[e]);
  const good = tFull > 0 && thinDuring > 0 && maxD < 0.01 && blob > 20;
  if (!good) ng++;
  console.log(`${good ? 'OK' : 'NG'} seed ${seed}: 埋まるまで ${tFull.toFixed(1)} h、伸びるあいだに細い管 ${thinDuring > 0 ? 'あり' : 'なし'}、8時間後の最も太い管 D=${maxD.toExponential(1)}、管の体 ${V.toFixed(2)}、エサの上 ${blob.toFixed(1)}`);
}
// 体がエサに集まったあと（12時間）、2つ目のエサを置く → 体からまた伸びて、迷路の道のりを本物の速さで進んでからたどりつく（一瞬で道ができない）
for (let seed = 1; seed <= 10; seed++) {
  const m = Maze.makeGood(12, 9, seed), s = Model.create(m, [0], seed); Model.startGrowth(s);
  while (s.t < 12) Model.step(s);
  let alive = 0; for (let e = 0; e < m.nE; e++) if (Model.has(s, e)) alive++;
  const c2 = m.W * m.H - 1, sp = Maze.shortest(m, 0, c2).length;
  s.foods.push(c2); Model.explore(s);
  const t0 = s.t; let tReach = -1, n = 0;
  while (n++ < 3000) { Model.step(s); if (tReach < 0 && s.reached[c2]) tReach = s.t - t0; if (Model.settled(s)) break; }
  const minH = sp / (Model.GROW_MM_H / Model.CELL_MM) / 1.25;   // いちばん速い通路の速さでも、最短の道のりにはこれだけかかる
  const good = alive === 0 && tReach >= minH * 0.99 && Math.abs(Model.tubeLength(s) - sp) < 0.05 * sp;
  if (!good) ng++;
  console.log(`${good ? 'OK' : 'NG'} seed ${seed}: 12時間後に残った管 ${alive}本、2つ目のエサ（最短 ${sp}マス）に着くまで ${tReach.toFixed(1)} h（少なくとも ${minH.toFixed(1)} h）、落ち着いた管の長さ ${Model.tubeLength(s).toFixed(2)}`);
}
process.exit(ng ? 1 : 0);
