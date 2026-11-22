// 粘菌が迷路を解くまで — メイン（状態・時間の進め方・描画ループ・デバッグ用の窓口）
'use strict';
window.__slmaErr = [];
window.addEventListener('error', e => window.__slmaErr.push(String(e.message)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const W = 12, H = 9, CELL_MM = 5; // 迷路のマスの数と1マスの大きさ（5 mm と仮定 → 6 × 4.5 cm。スマホの幅 375px で 1マス約 30px）
const SPEEDS = [{ h: 2 / 3, label: '1秒＝40分' }, { h: 2, label: '1秒＝2時間' }, { h: 1 / 6, label: '1秒＝10分' }];  // 画面の1秒で進む本物の時間（時間 h）
const SWAP_SEC = 1.5;             // 入口と出口を入れかえる間隔（画面の秒。本物の往復流は約2分ごと。見やすくした演出）
const DOT_SPEED = 1.6;            // 粒の速さ（マス/秒、流量 1・D 1 の管で。表示だけ）

const S = {
  s: null, run: true, speedI: 0, mode: 'food', seed: 7,
  ui: { dots: true, ph: null, showShortest: false, showChem: true, sp: null, sel: -1, drag: null },
  acc: 0, swapT: 0, L: null,
};

// 地図（いまは迷路。将来は日本の道路も同じ形の Graph で）。はじめのエサの点 foods0 と、かけらの点 start を持つ
function newMaze(seed) {
  S.seed = seed;
  const m = Maze.makeGood(W, H, seed);
  // 1マスを 3×3 の細かい網に（管が角の内側を近道したり、Y 字に分かれたりできる）
  const gr = Graph.fromMazeFine(m, CELL_MM, 3, seed);
  S.world = { g: gr, foods0: [gr.cellCenter(0), gr.cellCenter(W * H - 1)], start: gr.cellCenter(Math.floor(H / 2) * W + Math.floor(W / 2)) };
  S.s = Model.create(gr, S.world.foods0, seed);   // はじめのエサは2つ（迷路の入口と出口）
  S.ui.ph = new Float64Array(gr.nE);
  restart();
}
function restart() {
  S.s.foods = S.world.foods0.slice();
  Model.resetField(S.s, 0); Model.resetField(S.s, 1);
  Model.startGrowth(S.s, S.world.start);   // かけらは地図のまん中
  S.ui.sp = Model.shortest(S.s); S.ui.sel = -1;
  S.run = true; S.acc = 0;
  kick();
}
// 迷路やエサを変えたとき（粘菌はエサを置いたことを知らない。物質がとどくか、粘液の跡がうすれてまた探しに出たときに見つける）
function changed() {
  S.ui.sp = Model.shortest(S.s);
  S.s.pPrev = null; S.s.tFlow = 0;
  kick();
}

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function step(dtReal) {
  const s = S.s;
  if (S.run) {
    S.swapT += dtReal;
    if (S.swapT > SWAP_SEC) { S.swapT = 0; s.swap = !s.swap; }
    S.acc += dtReal * SPEEDS[S.speedI].h;
    let n = 0;
    while (S.acc >= Model.DT && n < 100) { Model.step(s); S.acc -= Model.DT; n++; }
    // 粒を流す（u は ea → eb の向き）
    const gr = s.g, ph = S.ui.ph;
    for (let e = 0; e < gr.nE; e++) {
      if (s.Qs[e] < 1e-3 || s.D[e] < 1e-2) continue;
      ph[e] += dtReal * DOT_SPEED * Math.sign(s.Q[e]) * Math.min(3, s.Qs[e] / Math.sqrt(s.D[e]));
    }
  }
  UI.status();
}
function draw() { if (S.s) S.L = Draw.frame(g, cv.clientWidth, cv.clientHeight, S.s, S.ui); }

// 再生中はずっと動かす（止めるのは「止める」を押したときだけ）。画面を離れるとブラウザが requestAnimationFrame を止める
let last = 0, looping = false;
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; // 最初のコマは now が last より前のことがある
  step(dt); draw();
  if (S.run || S.ui.drag) requestAnimationFrame(loop); else looping = false;
}
function kick() {
  UI.status(); draw();
  if (!looping) { looping = true; last = performance.now(); requestAnimationFrame(loop); }
}

window.addEventListener('resize', resize);
UI.init();
newMaze(S.seed);
resize();

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__slma = {
  S, Model, Maze,
  simRun(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) step(dt); draw(); return { hours: S.s.t, len: Model.tubeLength(S.s), settled: Model.settled(S.s) }; },
  newMaze, restart,
  addFood(c) { UI.addFood(c); },
};
