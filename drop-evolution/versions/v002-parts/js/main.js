// ひとしずくの進化 — 画面と操作
import { World, DT, GI, GENES, eSplit, speedOf } from './sim.js';
import { Renderer, drawBodyDiagram } from './render.js';
import { Graph, cladeColor, fmtT } from './graph.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
let seed = +(q.get('seed') || (Date.now() % 100000));
let world = new World({ seed });
const view = $('view'), ren = new Renderer(view), graph = new Graph($('graph'));
let speed = 4, playing = true, sel = null, follow = false, selClade = null;
let realTime = 0;

function resize() {
  ren.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  graph.resize();
  const fz = ren.fitZoom();
  if (ren.cam.z < fz) ren.cam.z = fz;
  clampCam();
}
addEventListener('resize', resize);
resize();
ren.cam.z = Math.max(ren.fitZoom(), Math.min(1.3, Math.min(ren.w, ren.h) / 500));

function clampCam() {
  const c = ren.cam, hw = ren.w / 2 / c.z, hh = ren.h / 2 / c.z;
  const W = 2000, H = 1400, m = 60;
  c.x = hw * 2 > W + m * 2 ? W / 2 : Math.min(Math.max(c.x, hw - m), W + m - hw);
  c.y = hh * 2 > H + m * 2 ? H / 2 : Math.min(Math.max(c.y, hh - m), H + m - hh);
}

// ── 見る操作（ドラッグ・ホイール・指2本） ──
const ptrs = new Map();
let down = null, pinch = null;
view.addEventListener('pointerdown', e => {
  try { view.setPointerCapture(e.pointerId); } catch (_) {}
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, cx: ren.cam.x, cy: ren.cam.y, moved: false };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: ren.cam.z }; down = null; }
});
view.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d / ren.cam.z);
  } else if (down) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 6) { down.moved = true; follow = false; view.classList.add('drag'); }
    if (down.moved) { ren.cam.x = down.cx - dx / ren.cam.z; ren.cam.y = down.cy - dy / ren.cam.z; clampCam(); }
  }
});
const up = e => {
  ptrs.delete(e.pointerId);
  view.classList.remove('drag');
  if (down && !down.moved && e.type === 'pointerup') pick(e.clientX, e.clientY);
  if (ptrs.size < 2) pinch = null;
  down = null;
};
view.addEventListener('pointerup', up);
view.addEventListener('pointercancel', up);
view.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

function zoomAt(sx, sy, k) {
  const before = ren.toWorld(sx, sy);
  ren.cam.z = Math.min(12, Math.max(ren.fitZoom(), ren.cam.z * k));
  const after = ren.toWorld(sx, sy);
  if (!follow) { ren.cam.x += before.x - after.x; ren.cam.y += before.y - after.y; }
  clampCam();
}

function pick(sx, sy) {
  const p = ren.toWorld(sx, sy);
  const o = world.orgAt(p.x, p.y, 14 / ren.cam.z);
  select(o);
}

function select(o) {
  sel = o; follow = !!o; selClade = o ? o.clade : null;
  $('card').hidden = !o;
  document.body.classList.toggle('picked', !!o);
  if (o) { $('toast').hidden = true; toastT = 0; }
  if (o && ren.cam.z < 2.2) ren.cam.z = Math.max(ren.cam.z, Math.min(3, ren.fitZoom() * 4));
  if (o) { hintOnce = true; renderCard(true); }
}

// 系統樹から系統を選ぶ → その系統のいちばん年上を追う
$('graph').addEventListener('click', e => {
  if (graph.mode !== 'tree') return;
  const r = e.currentTarget.getBoundingClientRect();
  const id = graph.hitTree(e.clientX - r.left, e.clientY - r.top);
  if (!id) return;
  const live = world.orgs.filter(o => o.clade === id);
  if (live.length) select(live.reduce((a, b) => a.age > b.age ? a : b));
  else { selClade = id; const c = world.clades.get(id); toast(`「${c.name}」(系統 ${c.id}) は ${fmtT(c.died)} に絶えた`); }
});

// ── 下の操作 ──
$('play').onclick = () => setPlaying(!playing);
function setPlaying(p) { playing = p; $('play').textContent = p ? '❚❚' : '▶'; $('play').setAttribute('aria-label', p ? '止める' : '動かす'); }
document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => setSpeed(+b.dataset.speed));
function setSpeed(s) { speed = s; document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s)); if (!playing) setPlaying(true); }
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  graph.mode = b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
});
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || $('menu').open || $('help').open) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(4); else if (e.key === '3') setSpeed(16);
  else if (e.key === 'Escape') select(null);
  else if (e.key === 'm' || e.key === 'M') openMenu();
});

// ── 環境 ──
const level = (v, lo, hi) => v < lo ? '少ない' : v > hi ? '多い' : 'ふつう';
$('food').oninput = e => { world.foodRate = +e.target.value; $('foodOut').textContent = level(world.foodRate, 0.75, 1.3); };
$('light').oninput = e => { world.light = +e.target.value; $('lightOut').textContent = world.light < 0.05 ? 'まっくら' : level(world.light, 0.4, 0.8).replace('少ない', '弱い').replace('多い', '強い'); };
// ── メニュー（新しい一滴はここからだけ。もう一度たずねる） ──
let playingBeforeMenu = true;
function openMenu() {
  playingBeforeMenu = playing; setPlaying(false);
  $('menuMain').hidden = false; $('menuConfirm').hidden = true;
  $('menuSeed').textContent = `一滴の番号 ${seed}・${fmtT(world.t)}`;
  $('menu').showModal();
}
$('menu').addEventListener('close', () => { if (!$('help').open) setPlaying(playingBeforeMenu); });
$('menuBtn').onclick = openMenu;
$('mResume').onclick = () => $('menu').close();
$('mHelp').onclick = () => { $('menu').close(); setPlaying(false); $('help').showModal(); };
$('help').addEventListener('close', () => setPlaying(playingBeforeMenu));
$('mNew').onclick = () => { $('menuMain').hidden = true; $('menuConfirm').hidden = false; $('mNewNo').focus(); };
$('mNewNo').onclick = () => { $('menuMain').hidden = false; $('menuConfirm').hidden = true; };
$('mNewYes').onclick = () => {
  seed = (seed * 7919 + 13) % 100000;
  world = new World({ seed, foodRate: +$('food').value, light: +$('light').value });
  ren.ghosts = []; ren.prev.clear();
  select(null); lastEvent = 0;
  playingBeforeMenu = true;
  $('menu').close();
  toast('新しい一滴をのぞいています');
};
$('cardClose').onclick = () => select(null);

// ── 選んだ1匹の札 ──
const LABELS = {
  size: ['大きさ', v => `${v.toFixed(0)} µm`],
  green: ['緑', v => `${Math.round(v * 100)}%`],
  range: ['感じる範囲', v => `${v.toFixed(0)} µm`],
  food: ['エサへ', v => v.toFixed(1)],
  small: ['小さい相手へ', v => v.toFixed(1)],
  big: ['大きい相手から', v => v.toFixed(1)],
};
let hintOnce = false;
function renderCard(full) {
  if (!sel) return;
  const o = sel, c = world.clades.get(o.clade);
  $('cSwatch').style.background = `hsl(${o.g[GI.hue]},45%,60%)`;
  $('cName').textContent = c.name;
  $('cMeta').textContent = `系統 ${c.id}・${o.gen + 1} 代目`;
  const pct = Math.round(Math.min(1, o.e / eSplit(o.g, o.b)) * 100);
  $('cStats').innerHTML = `<div><dt>食べた</dt><dd>${o.ate}</dd></div><div><dt>狩った</dt><dd>${o.prey}</dd></div><div><dt>子</dt><dd>${o.kids}</dd></div><div><dt>おなか</dt><dd>${pct}%</dd></div>`;
  if (full) {
    const P = o.bp;
    drawBodyDiagram($('cBody'), o);
    $('cBodyLine').textContent = P.n
      ? `節 ${P.n}・1秒に ${(1 / o.b.T).toFixed(0)} 回打つ・速さ ${speedOf(o.g, o.b).toFixed(0)} µm/s・とどく ${(P.reach * o.g[GI.size]).toFixed(0)} µm`
      : '節がない（泳げない）';
    $('cGenes').innerHTML = Object.entries(LABELS).map(([k, [lab, f]]) => {
      const i = GI[k], [, lo, hi, init] = GENES[i];
      const v = o.g[i], w = (v - lo) / (hi - lo) * 100, s = (init - lo) / (hi - lo) * 100;
      return `<div class="gene"><span>${lab}</span><span class="bar"><i style="width:${w}%;background:${cladeColor(c, 0.9)}"></i><u style="left:${s}%" title="はじまり"></u></span><em>${f(v)}</em></div>`;
    }).join('');
    $('cHint').textContent = '点線は、ひと打ちの間に節の先が通る道。青い線は、はじまりの値。';
  }
}

// ── できごとの知らせ ──
let lastEvent = 0, tickerT = 0;
function showEvents() {
  const ev = world.events;
  if (ev.length > lastEvent) {
    const e = ev[ev.length - 1];
    lastEvent = ev.length;
    $('ticker').textContent = `${fmtT(e.t)}　${e.text}`;
    $('ticker').classList.remove('fade'); tickerT = 6;
  }
  if (world.events.length > 400) { world.events.splice(0, 200); lastEvent = world.events.length; }
}
let toastT = 0;
function toast(s) { $('toast').textContent = s; $('toast').hidden = false; toastT = 3; }

// ── まわす ──
let last = performance.now(), acc = 0, uiT = 0, simRate = 0;
function frame(now) {
  const fdt = Math.min(0.1, (now - last) / 1000); last = now;
  realTime += fdt;
  if (playing) {
    acc += fdt * speed;
    const t0 = performance.now();
    let n = 0;
    while (acc >= DT) {
      world.step(); acc -= DT; n++;
      if (performance.now() - t0 > 12) { acc = 0; break; }   // 重いときは実の速さを落とす
    }
    simRate = simRate * 0.9 + (n * DT / Math.max(fdt, 1e-3)) * 0.1;
  }
  if (sel && sel.dead) {
    const by = sel.eatenBy ? world.orgs.find(o => o.id === sel.eatenBy) : null;
    toast(by ? 'この1匹は食べられた。食べたほうを追いかけます' : 'この1匹はエネルギーが尽きた');
    if (by) select(by); else { const same = world.orgs.find(o => o.clade === sel.clade); same ? select(same) : select(null); }
  }
  if (sel && follow) {
    // 札とグラフにかくれない所（空いている所のまん中）に追う1匹を置く
    const fx = (focus.x - ren.w / 2) / ren.cam.z, fy = (focus.y - ren.h / 2) / ren.cam.z;
    ren.cam.x += (sel.x - fx - ren.cam.x) * 0.12; ren.cam.y += (sel.y - fy - ren.cam.y) * 0.12; clampCam();
  }
  ren.draw(world, sel, realTime);
  uiT -= fdt;
  if (uiT <= 0) {
    uiT = 0.25;
    $('sTime').textContent = fmtT(world.t);
    $('sPop').textContent = world.orgs.length;
    $('sClades').textContent = world.liveClades().length;
    $('sPred').textContent = world.orgs.filter(o => o.prey > 0).length;
    graph.draw(world, selClade);
    renderCard(false);
    showEvents();
    updateScale();
    updateFocus();
  }
  if (tickerT > 0 && (tickerT -= fdt) <= 0) $('ticker').classList.add('fade');
  if (toastT > 0 && (toastT -= fdt) <= 0) $('toast').hidden = true;
  requestAnimationFrame(frame);
}

const focus = { x: 0, y: 0 };
function updateFocus() {
  let l = 0, r = ren.w, t = 0, b = ren.h;
  const card = $('card'), env = $('env');
  if (!card.hidden) { const c = card.getBoundingClientRect(); if (c.width > ren.w * 0.6) t = Math.max(t, c.bottom); else r = Math.min(r, c.left); }
  if (env.offsetParent && innerWidth > 760) l = Math.max(l, env.getBoundingClientRect().right);
  b = Math.min(b, $('bottom').getBoundingClientRect().top + 30);
  focus.x = (l + r) / 2; focus.y = (t + b) / 2;
}
updateFocus();

function updateScale() {
  const opts = [10, 20, 50, 100, 200, 500];
  const um = opts.find(v => v * ren.cam.z >= 60) || 500;
  $('scale').querySelector('i').style.width = `${um * ren.cam.z}px`;
  $('scale').querySelector('span').textContent = `${um} µm`;
}

requestAnimationFrame(frame);
setTimeout(() => { if (!hintOnce) toast('生き物を押すと、追いかけて遺伝子を見られます'); }, 2500);

// 確かめ用（tools から）
window.__drop = { get world() { return world; }, get sel() { return sel; }, ren, select, setSpeed, setPlaying };
