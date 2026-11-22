// 粘菌が迷路を解くまで — メイン（状態・時間の進め方・描画ループ・デバッグ用の窓口）
'use strict';
window.__slmaErr = [];
window.addEventListener('error', e => window.__slmaErr.push(String(e.message)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const W = 12, H = 9;              // 迷路のマスの数（スマホの幅 375px で 1マス約 30px）
const RATE = 1;                   // 「速さ ×1」で 1秒に進むモデルの時間
const SWAP_SEC = 1.5;             // 入口と出口を入れかえる間隔（本物の往復流は約2分。見やすくした演出）
const DOT_SPEED = 1.6;            // 粒の速さ（マス/秒、流量 1・D 1 の管で）

const S = {
  s: null, run: true, speed: 1, mode: 'food', seed: 7, done: false,
  ui: { dots: true, ph: null, showShortest: false, sp: null, sel: -1, drag: null },
  acc: 0, swapT: 0, L: null,
};

function newMaze(seed) {
  S.seed = seed;
  const m = Maze.makeGood(W, H, seed);
  S.s = Model.create(m, [0, W * H - 1], seed);
  S.ui.ph = new Float64Array(m.nE);
  restart();
}
function restart() {
  Model.startSpread(S.s);
  S.ui.sp = Model.shortest(S.s); S.ui.sel = -1;
  S.done = false; S.run = true; S.acc = 0;
  kick();
}
// 迷路やエサを変えたとき: いちばん短い道を求め直し、止まっていたら動かす
function changed() {
  S.ui.sp = Model.shortest(S.s);
  S.s.pPrev = null; S.done = false; S.run = true;
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
    S.acc += dtReal * RATE * S.speed;
    let n = 0;
    while (S.acc >= Model.DT && n < 200) { Model.step(s); S.acc -= Model.DT; n++; if (s.blocked) break; }
    if (s.blocked) { S.acc = 0; S.run = false; }
    if (Model.settled(s)) { S.done = true; S.run = false; }
    // 粒を流す（u は ea → eb の向き）
    const m = s.m, ph = S.ui.ph;
    for (let e = 0; e < m.nE; e++) {
      if (s.Qs[e] < 1e-3 || s.D[e] < 1e-2) continue;
      ph[e] += dtReal * DOT_SPEED * Math.sign(s.Q[e]) * Math.min(3, s.Qs[e] / Math.sqrt(s.D[e]));
    }
  }
  UI.status();
}
function draw() { if (S.s) S.L = Draw.frame(g, cv.clientWidth, cv.clientHeight, S.s, S.ui); }

// 動いているあいだだけ描き直す（止まった画面は描き直さない。電池。RULES 9章）
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
  simRun(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) step(dt); draw(); return { t: S.s.t, len: Model.tubeLength(S.s), done: S.done }; },
  newMaze, restart,
};
