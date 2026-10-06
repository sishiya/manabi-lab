// main.js — 世代を進める RUN、見ている1匹 VIEW、ループ、デバッグ用の窓口 window.__ga
'use strict';

const RUN = { queue: 0, auto: false, reeval: false, budget: 24 };   // budget = 1コマで計算に使う時間（ms）
const VIEW = { g: null, sim: null, env: null, trail: [], cam: 0, camY: 0, speed: 1, hold: 0, mode: 'top', idx: 0,
  label: '', dist: null, best: null, color: OTHER_COLOR, acc: 0 };
const HOLD = 1.2;   // 15秒走り終えてから、はじめに戻るまでの間（秒）

// 見る1匹を決める
function watch(g, label, dist) {
  VIEW.g = g; VIEW.env = POP.env; VIEW.label = label; VIEW.dist = dist;
  VIEW.color = spColor(speciesKey(g));
  VIEW.best = POP.history.length ? POP.history[POP.history.length - 1].best : null;
  restartView();
  updatePick();
}
function restartView() {
  if (!VIEW.g) return;
  VIEW.sim = makeSim(VIEW.g, POP.env); VIEW.env = POP.env;
  VIEW.trail = []; VIEW.cam = VIEW.sim.x0; VIEW.camY = 0; VIEW.hold = 0; VIEW.acc = 0;
}
function watchTop() { VIEW.mode = 'top'; watchMember(0, true); }
function watchMember(i, keepMode) {
  const m = POP.members[i];
  if (!m) return;
  if (!keepMode) VIEW.mode = 'pick';
  VIEW.idx = i;
  watch(m.g, `第${POP.gen}世代 ${i + 1}位`, m.dist);
}
function watchHistory(gen) {
  const h = POP.history.find(q => q.gen === gen);
  if (!h) return;
  VIEW.mode = gen === POP.gen ? 'top' : 'hist';
  // 環境が変わっていたら、いまの環境で走らせ直した距離を出す
  watch(h.bestG, `第${gen}世代の1位`, h.env === POP.env.key ? h.bestDist : runTrial(h.bestG, POP.env));
  $('histCap').textContent = `第${gen}世代の1位（${envByKey(h.env).name}で ${h.bestDist.toFixed(2)} m）` + (h.env !== POP.env.key ? `。いまの環境（${POP.env.name}）で走らせています。` : '');
}

function queueGens(n) { RUN.queue += n; updatePanel(); }
function setAuto(on) { RUN.auto = on; if (!on) RUN.queue = 0; updatePanel(); }
function setEnv(key) {
  if (key === POP.env.key) return;
  POP.env = envByKey(key); RUN.reeval = true;    // いまの世代を新しい環境で評価し直す
  updatePanel();
}
function restart(seed) {
  RUN.queue = 0; RUN.auto = false;
  SLOTS.clear();
  resetPop(seed);
  evaluatePending(0); afterGeneration();
}

// 1世代の評価が終わったあと
function afterGeneration() {
  const h = recordGeneration();
  assignSlots(h.species);
  if (VIEW.mode === 'top' || !VIEW.g) watchMember(0, true);
  else if (VIEW.mode === 'pick') {
    const i = POP.members.findIndex(m => m.g === VIEW.g);     // 生き残っていれば順位を更新
    if (i >= 0) { VIEW.idx = i; VIEW.label = `第${POP.gen}世代 ${i + 1}位`; VIEW.dist = POP.members[i].dist; VIEW.best = h.best; VIEW.color = spColor(speciesKey(VIEW.g)); }
    else { VIEW.label = `#${VIEW.g.id}（もういない）`; VIEW.best = h.best; }
    if (VIEW.env !== POP.env) restartView();
  } else if (VIEW.env !== POP.env) restartView();
  updatePanel();
}

// 1コマぶんの計算: 予定の世代を、締め切りまで進める
function workGenerations() {
  const deadline = performance.now() + RUN.budget;
  let changed = false;
  while (performance.now() < deadline) {
    const pending = POP.members.some(m => m.env !== POP.env.key);
    if (pending) {
      if (evaluatePending(deadline)) {
        afterGeneration(); changed = true;
        if (RUN.reeval) RUN.reeval = false;         // 環境・集団の数を変えただけなら、世代は進めていない
        else if (RUN.queue > 0) RUN.queue--;
      }
      continue;
    }
    if (RUN.queue > 0 || RUN.auto) { nextGeneration(); continue; }
    break;
  }
  return changed;
}

// 見ている1匹を実時間で進める
function stepView(dt) {
  const S = VIEW.sim;
  if (!S) return;
  if (S.t >= TRIAL) { VIEW.hold += dt; if (VIEW.hold > HOLD) restartView(); return; }
  VIEW.acc += dt * VIEW.speed;
  while (VIEW.acc >= DT && S.t < TRIAL) {
    VIEW.acc -= DT; stepSim(S);
    if (!S.ok) { S.t = TRIAL; break; }
    if (Math.round(S.t / DT) % 6 === 0) {
      let x = 0, y = 0; for (let i = 0; i < S.n; i++) { x += S.px[i] / S.n; y += S.py[i] / S.n; }
      VIEW.trail.push([x, y]);
    }
  }
  const cx = centerX(S);
  let cy = 0; for (let i = 0; i < S.n; i++) cy += S.py[i] / S.n;
  // 高さも追う（水の中は重心を、陸は高く跳んだときだけ）
  const ty = S.env.water ? Math.max(0, cy - WATER_START) : Math.max(0, cy - 1.6);
  VIEW.cam += (cx - VIEW.cam) * Math.min(1, dt * 4);
  VIEW.camY += (ty - VIEW.camY) * Math.min(1, dt * 3);
}

function render() {
  if (VIEW.sim) {
    const v = fitCanvas($('view'));
    drawScene(v.ctx, v.w, v.h, VIEW);
    const S = VIEW.sim;
    $('wLabel').textContent = VIEW.label + '・' + spName(speciesKey(VIEW.g));
    $('wTime').textContent = `${Math.min(TRIAL, S.t).toFixed(1)} / ${TRIAL} 秒　${fm(centerX(S) - S.x0)}`;
    const gq = fitCanvas($('genome'));
    drawGenome(gq.ctx, gq.w, gq.h, VIEW.g, wrap1(S.t / VIEW.g.period), S.contract, VIEW.color);
  }
  const gr = fitCanvas($('grid'));
  GRID_GEOM = drawGrid(gr.ctx, gr.w, gr.h, POP.members, VIEW.mode === 'hist' ? -1 : POP.members.findIndex(m => m.g === VIEW.g), HOV.grid);
  const pr = fitCanvas($('prog'));
  PROG_GEOM = drawProgress(pr.ctx, pr.w, pr.h, POP.history, HOV.gen);
  const sp = fitCanvas($('spec'));
  drawSpecies(sp.ctx, sp.w, sp.h, POP.history, HOV.gen);
}

let last = performance.now();
function frame(now) {
  try {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (workGenerations()) updatePanel();
    stepView(dt);
    render();
  } catch (e) { window.__gaErr = e; console.error(e); }
  requestAnimationFrame(frame);
}

buildUI(); bindUI();
restart(1);
requestAnimationFrame(frame);

// デバッグ用: __ga.gens(n) で n 世代を一気に、__ga.simRun(秒) で見ている1匹を進める
window.__ga = {
  POP, RUN, VIEW, ENVS, setEnv, restart, watchMember, watchHistory, render,
  gens(n) { for (let k = 0; k < n; k++) { nextGeneration(); evaluatePending(0); afterGeneration(); } render(); return POP.history[POP.history.length - 1]; },
  simRun(sec) { for (let t = 0; t < sec; t += 1 / 60) stepView(1 / 60); render(); return VIEW.sim.t; },
  get err() { return window.__gaErr; },
};
