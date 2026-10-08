// main.js — 状態・夜の進行・操作・ループ
'use strict';

const S = {
  phase: 'start',          // start | night | result
  gen: 1, pop: null, first: null, world: null,
  hist: [], tool: 'swat', colorBy: 'none', style: 'cute', pointer: null,
  policy: 'swat', lastManual: null, watching: false, quests: new Set(),
  noToolRun: [],           // 道具を使わなかった夜の、殺虫剤・糖ぎらいの割合
  pending: null,
};
const cv = $('view'), ctx = cv.getContext('2d');
let fit = {s: 1, ox: 0, oy: 0};

function loadPrefs() {
  try { const v = localStorage.getItem('resistance.style'); if (['dot', 'cute', 'real'].includes(v)) S.style = v; } catch (e) {}
}
function savePrefs() { try { localStorage.setItem('resistance.style', S.style); } catch (e) {} }

function reset() {
  S.gen = 1; S.pop = firstPopulation(); S.first = S.pop.slice();
  S.hist = [histRow(1, S.pop, null)]; S.lastManual = null; S.noToolRun = [];
  S.world = newWorld(S.pop); S.phase = 'start'; S.watching = false;
  $('resultOv').hidden = true;
  refreshPanel();
}

function startNight(policyKey) {
  const prevBaits = S.world ? S.world.baits : [];
  S.world = newWorld(S.pop, prevBaits);
  S.watching = !!policyKey;
  if (policyKey) {
    const P = policyFor(policyKey);
    S.world.auto = P;
    if (P.baits === 'none') S.world.baits = [];
    if (P.baits === 'three') S.world.baits = DEFAULT_BAITS.map(b => ({...b}));
  }
  S.phase = 'night';
  $('startOv').hidden = true; $('resultOv').hidden = true;
  syncButtons();
}

function policyFor(k) {
  if (k !== 'mine') return POLICIES[k];
  const m = S.lastManual || {swatRate: 0, sprayFrac: 0};
  return {name: POLICIES.mine.name, swatRate: m.swatRate, sprayFrac: m.sprayFrac};
}

// 夜を終えて子の世代を作る
function finishNight(note) {
  const w = S.world, before = w.pop.slice(), rec = w.rec;
  const survivors = endNight(w);
  if (!S.watching && !w.auto) S.lastManual = {swatRate: rec.swings / NIGHT, sprayFrac: rec.sprayUsed / NIGHT};
  const kids = breed(survivors, S.gen + 1);
  S.hist[S.hist.length - 1].rec = {...rec};
  trackQuests(w, kids);
  S.pending = {gen: S.gen, before, survivors, kids, rec, note};
  S.phase = 'result';
  showResult(S, S.pending);
  refreshPanel();
}

function nextGeneration() {
  const p = S.pending;
  if (!p || !p.kids.length) { reset(); $('startOv').hidden = false; return; }
  S.gen++; S.pop = p.kids; S.hist.push(histRow(S.gen, S.pop, null));
  S.pending = null;
  startNight(null);
  refreshPanel();
}

// 早送り: 画面に出さずに n 世代
async function fastForward(n, policyKey) {
  if (S.phase === 'night') return;
  if (S.phase === 'result' && S.pending) {
    if (!S.pending.kids.length) return;
    S.gen++; S.pop = S.pending.kids; S.hist.push(histRow(S.gen, S.pop, null)); S.pending = null;
  }
  $('startOv').hidden = true; $('resultOv').hidden = true;
  let last = null;
  for (let i = 0; i < n; i++) {
    const prevBaits = S.world ? S.world.baits : [];
    const w = newWorld(S.pop, prevBaits), P = policyFor(policyKey);
    w.auto = P;
    if (P.baits === 'none') w.baits = [];
    if (P.baits === 'three') w.baits = DEFAULT_BAITS.map(b => ({...b}));
    S.world = w; S.watching = true;
    const before = w.pop.slice();
    const survivors = runNightHeadless(w);
    const kids = breed(survivors, S.gen + 1);
    S.hist[S.hist.length - 1].rec = {...w.rec};
    trackQuests(w, kids);
    last = {gen: S.gen, before, survivors, kids, rec: w.rec};
    if (!kids.length || i === n - 1) break;
    S.gen++; S.pop = kids; S.hist.push(histRow(S.gen, S.pop, null));
    $('ffLbl') && ($('ffLbl').textContent = `${i + 1}/${n}`);
    refreshPanel();
    await new Promise(r => setTimeout(r, 30));
  }
  last.note = `「${POLICIES[policyKey].name}」で${n}世代を早送りしました（グラフに全部の世代が出ています）。`;
  S.pending = last; S.phase = 'result';
  showResult(S, last);
  refreshPanel();
}

// ---- 見つけてみよう ----
function done(id) {
  if (S.quests.has(id)) return;
  S.quests.add(id); syncQuests(S.quests);
  const q = QUESTS.find(q => q.id === id);
  toast(`見つけた！ ${q.t}`);
}
function trackQuests(w, kids) {
  if (w.rec.swat >= 10) done('swat10');
  S.dodgeTotal += w.rec.dodges;
  if (kids.length && carriers(kids, 'kdr') > 0.5) done('kdrHalf');
  if (kids.length && popStats(kids).sense >= 1.5 * S.hist[0].sense) done('sense15');
  if (!kids.length) done('extinct');
  const used = w.rec.swings + w.rec.sprayUsed + w.baits.length;
  if (used === 0 && kids.length) {
    S.noToolRun.push({kdr: carriers(kids, 'kdr'), gav: carriers(kids, 'gav')});
    const r = S.noToolRun;
    if (r.length >= 4 && (r[0].kdr - r[r.length - 1].kdr > 0.08 || r[0].gav - r[r.length - 1].gav > 0.08)) done('decline');
  } else S.noToolRun = [];
}
function liveQuests(w) {
  if (w.rec.dodges >= 5 || S.dodgeTotal + w.rec.dodges >= 5) done('dodge');
  if (w.rec.rejects > 0) done('reject');
  if (w.pop.some(b => b.alive && b.state !== 'hidden' && b.dose > 1.2 && mistAt(w, b.x, b.y) > 0.3)) done('mist');
}
S.dodgeTotal = 0;

// ---- パネル ----
function refreshPanel() {
  updateGenCard(S);
  updateHists(S.world || {pop: S.pop, killed: []}, S.first);
  drawChart(S.hist);
  buildPolicies(S);
  syncButtons();
}
function syncButtons() {
  const night = S.phase === 'night';
  $('btnWatch').disabled = night; $('btnFast').disabled = night;
  $('btnEnd').disabled = !night;
  for (const b of $('segTool').children) b.setAttribute('aria-pressed', b.dataset.v === S.tool);
  for (const b of $('segColor').children) b.setAttribute('aria-pressed', b.dataset.v === S.colorBy);
  for (const b of $('segStyle').children) b.setAttribute('aria-pressed', b.dataset.v === S.style);
  for (const b of $('styleChoice').children) b.setAttribute('aria-pressed', b.dataset.v === S.style);
  const t = TRAIT[S.colorBy];
  $('colorCap').innerHTML = t ? `<b style="color:${t.color}">${t.name}</b>が強い虫ほど、この色になります（${t.kind === 'poly' ? '弱い虫は灰色' : '遺伝子が2本で濃く、1本で半分、持っていない虫は灰色'}）。` : '色分けすると、どの虫が生き残るかが見えます。';
  $('policyCap').textContent = S.watching && night ? `いま「${POLICIES[S.policy].name}」で退治しています（見ているだけ）。` : '';
  $('hint').classList.toggle('dim', S.watching && night);
}

// ---- 描画 ----
function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.max(1, Math.round(r.width * dpr)), ph = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const s = Math.min(pw / W, ph / H);
  fit = {s, ox: (pw - W * s) / 2, oy: (ph - H * s) / 2, dpr};
}
function render() {
  resize();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120d09'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(fit.s, 0, 0, fit.s, fit.ox, fit.oy);
  drawWorld(ctx, S.world, {style: S.style, colorBy: S.colorBy, tool: S.phase === 'night' && !S.watching ? S.tool : null, pointer: S.pointer});
}

function updateMeters() {
  const w = S.world;
  $('sprayBar').style.width = pct(Math.max(0, w.sprayLeft) / TOOL.sprayBudget);
  const left = S.phase === 'night' ? Math.max(0, NIGHT - w.t) : 0;
  $('nightBar').style.width = pct(left / NIGHT);
  $('nightLbl').textContent = S.phase === 'night' ? `夜 のこり${Math.ceil(left)}秒` : '夜';
}

let lastT = performance.now(), panelT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  try {
    if (S.phase === 'night') {
      const speed = S.watching ? 3 : 1, sub = speed;
      for (let i = 0; i < sub; i++) stepWorld(S.world, dt);
      liveQuests(S.world);
      if (S.world.t >= NIGHT) finishNight();
      panelT += dt;
      if (panelT > 0.25) { panelT = 0; updateGenCard(S); updateHists(S.world, S.first); }
    }
    updateMeters();
    render();
  } catch (e) { window.__rzErr = e; console.error(e); }
  requestAnimationFrame(frame);
}

// ---- 操作 ----
function toWorld(e) {
  const r = cv.getBoundingClientRect(), dpr = fit.dpr || 1;
  return {x: ((e.clientX - r.left) * dpr - fit.ox) / fit.s, y: ((e.clientY - r.top) * dpr - fit.oy) / fit.s};
}
function wirePointer() {
  cv.addEventListener('pointerdown', e => {
    const p = toWorld(e); S.pointer = p;
    if (S.phase !== 'night' || S.watching) return;
    cv.setPointerCapture(e.pointerId);
    const w = S.world;
    if (S.tool === 'swat') swat(w, p.x, p.y);
    else if (S.tool === 'spray') { if (w.sprayLeft > 0) w.spraying = {x: p.x, y: p.y}; else toast('この夜のスプレーは使い切りました'); }
    else if (S.tool === 'bait') {
      const r = placeBait(w, p.x, p.y);
      if (r === 'full') toast(`毒エサは${TOOL.baitMax}つまで。置いたものを押すと片づけられます`);
      if (r === 'placed') toast('毒エサを置きました。次の世代にも残ります', 2200);
    }
  });
  cv.addEventListener('pointermove', e => {
    const p = toWorld(e); S.pointer = p;
    if (S.world && S.world.spraying && !S.world.spraying.auto) { S.world.spraying.x = p.x; S.world.spraying.y = p.y; }
  });
  const up = () => { if (S.world && S.world.spraying && !S.world.spraying.auto) S.world.spraying = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') S.pointer = null; up(); });
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    const k = {'1': 'swat', '2': 'spray', '3': 'bait'}[e.key];
    if (k) { S.tool = k; syncButtons(); }
  });
}

function wireUI() {
  const seg = (id, fn) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { fn(b.dataset.v); syncButtons(); } });
  seg('segTool', v => { S.tool = v; });
  seg('segColor', v => { S.colorBy = v; });
  seg('segStyle', v => { S.style = v; savePrefs(); });
  seg('styleChoice', v => { S.style = v; savePrefs(); });
  $('btnStart').addEventListener('click', () => startNight(null));
  $('btnNext').addEventListener('click', nextGeneration);
  $('btnEnd').addEventListener('click', () => { if (S.phase === 'night') finishNight(); });
  $('btnReset').addEventListener('click', () => { if (confirm('1世代目からやり直しますか？')) { reset(); $('startOv').hidden = false; } });
  $('policies').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.policy = b.dataset.v; buildPolicies(S); });
  $('btnWatch').addEventListener('click', () => {
    if (S.phase === 'result' && S.pending) {
      if (!S.pending.kids.length) return;
      S.gen++; S.pop = S.pending.kids; S.hist.push(histRow(S.gen, S.pop, null)); S.pending = null;
    }
    startNight(S.policy); refreshPanel();
  });
  $('btnFast').addEventListener('click', () => fastForward(10, S.policy));
  $('hint').addEventListener('click', () => $('hint').classList.toggle('open'));
  for (const b of $('styleChoice').children) drawSample(b.querySelector('canvas'), b.dataset.v);
}

function init() {
  loadPrefs();
  buildHists(); buildLegend(); buildQuests();
  reset();
  wireUI(); wirePointer();
  // フォントが来たら台所の絵を描き直す
  if (document.fonts) document.fonts.ready.then(() => { kitchenCache = null; for (const b of $('styleChoice').children) drawSample(b.querySelector('canvas'), b.dataset.v); });
  requestAnimationFrame(frame);
}

// デバッグ用の窓口
window.__rz = {
  S, get world() { return S.world; },
  step(sec = 1, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) stepWorld(S.world, dt); render(); },
  finish: () => finishNight(), next: () => nextGeneration(), start: p => startNight(p || null),
  fast: (n = 10, p = 'swat') => fastForward(n, p), render, swat: (x, y) => swat(S.world, x, y),
};
try { init(); } catch (e) { window.__rzErr = e; console.error(e); }
