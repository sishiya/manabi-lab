// 脱毛のしくみ — メイン（状態・手入れの記録・計算のよびだし・操作・ループ・デバッグ用の窓口）
'use strict';
window.__hareErr = [];
window.addEventListener('error', e => window.__hareErr.push(String(e.message)));

const cv = $('cv'), g = cv.getContext('2d');
const gr = $('gr'), gg = gr.getContext('2d');
const S = {
  t: 0, site: 'shin', tool: 'look', playing: false, speed: 7, guide: 0,
  events: [],                                   // 手入れの記録 {t, type, idx}（t の順）
  light: { level: 10, skin: 'light', hair: 'black', cool: true },
  age: 30, gray: 'mid',                          // 年齢（0日目）と白髪の出やすさ
  full: null,      // 2年ぶん計算した結果（周期のグラフ・できごと）。手入れや設定を変えたときだけ計算しなおす
  run: null,       // いまの日の毛穴（日を進めるときは続きから）
  paint: null, hover: null, key: '',
  view: null,      // 拡大 {z, cx, cy}。null は全体
};
const HOOKS = { light: (fs, site, e, R, idx) => lightEvent(fs, e, R, idx, S.light) };
const grid = t => Math.floor(t / SIM.dt + 1e-9) * SIM.dt;

function changed() {
  AGING.age = S.age; AGING.mean = GRAY_TYPES[S.gray].mean;
  S.full = null; S.run = null; S.key = [S.site, S.age, S.gray, JSON.stringify(S.events), JSON.stringify(S.light)].join('|'); syncControls(S);
}

function computeFull() {
  const R = new Runner(S.site, S.events, HOOKS), rows = Array.from({ length: SIM.N }, () => []);
  R.advanceTo(SIM.tMax, (t, fs) => fs.forEach((f, i) => { const inf = follicleInfo(f); rows[i].push({ ph: f.ph, vis: inf.visible, white: inf.pig < 0.5 }); }));
  S.full = { rows, log: R.log, flashes: R.flashes || [], hits: R.log.filter(n => n.kind === 'hit') };
}
// 光でいたんだ毛穴が、また生えはじめる（成長期に入る）まで何日か。いま回復中でなければ null
function recovery(i) {
  const hitsI = S.full.hits.filter(n => n.i === i && n.t <= S.t + 1e-9);
  if (!hitsI.length) return null;
  const th = hitsI[hitsI.length - 1].t, row = S.full.rows[i];
  for (let d = Math.ceil(th + 1); d <= Math.floor(S.t); d++) if (row[d] && row[d].ph === 'A' && row[d - 1].ph !== 'A') return null;   // もう生えはじめた
  for (let d = Math.max(Math.ceil(S.t), Math.ceil(th + 1)); d < row.length; d++) if (row[d].ph === 'A') return { days: d - Math.floor(S.t) };
  return { days: null };
}
function sceneNow() {
  if (!S.full) computeFull();
  if (!S.run || S.run.t() > S.t + 1e-9) S.run = new Runner(S.site, S.events, HOOKS);
  const fs = S.run.advanceTo(S.t);
  const fl = (S.run.flashes || []).filter(x => x.t <= S.t + 1e-9).pop();
  // 毛穴の上の字幕: 3日以内のできごと（毛穴ごとに新しいものだけ）
  const latest = {};
  for (const n of S.full.log) { if (n.t > S.t + 1e-9) break; if (n.i != null && S.t - n.t < 3 && n.kind !== 'safe') latest[n.i] = n; }
  const notes = Object.values(latest).map(n => Object.assign({ age: S.t - n.t }, n)).sort((a, b) => a.age - b.age);
  // 手入れの印（毛穴ごとに、30日以内の最後の手入れ）
  const marks = {};
  for (const e of S.events) if (e.t <= S.t + 1e-9 && S.t - e.t < 30) for (const i of e.idx) marks[i] = { type: e.type, age: S.t - e.t };
  const recover = fs.map((f, i) => recovery(i));
  return { fs, flash: fl, since: fl ? S.t - fl.t : Infinity, notes, paint: S.paint, hover: S.hover, recover, marks };
}

function setTime(t) { S.t = Math.max(0, Math.min(SIM.tMax, t)); }

// --- 手入れ（再生は止めない） ---
function act(type, idx) {
  if (!idx.length) return;
  const t = grid(S.t);
  const later = S.events.filter(e => e.t > t + 1e-9);
  if (later.length) S.events = S.events.filter(e => e.t <= t + 1e-9);
  S.events.push({ t, type, idx: idx.slice().sort((a, b) => a - b) });
  changed(); computeFull();
  if (later.length) toast('この日より後の手入れを消しました');
  if (type === 'pluck') {
    const ns = S.full.log.filter(n => Math.abs(n.t - t) < 1e-9 && idx.includes(n.i) && n.kind === 'pluck');
    const bad = ns.filter(n => n.short === 'つまめない' || n.short === '毛がない').length;
    if (bad === ns.length) toast('短すぎる（または毛がない）ので、つまめませんでした');
  }
}
function undo() {
  if (!S.events.length) return;
  const e = S.events.pop(); changed();
  toast(`${Math.floor(e.t)}日目の${{ shave: 'カミソリ', pluck: '毛抜き', light: '光' }[e.type]}を取り消しました`);
}

// --- 描画 ---
function fit(c, ctx) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [r.width, r.height];
}
let _logKey = '';
function draw() {
  if (!S.full) computeFull();
  const sc = sceneNow();
  const [w, h] = fit(cv, g);
  drawScene(g, w, h, sc, S.view);
  // 狭い画面: 断面の高さを中身に合わせる
  if (w <= 600) { const want = Math.round((UP_MM + DOWN_MM) * Math.min(40, (w - 8) / ((SIM.N - 1) * SIM.gapMM + 2.4)) + 8); if (Math.abs(h - want) > 2) $('stage').style.height = want + 'px'; }
  else if ($('stage').style.height) $('stage').style.height = '';
  const [gw, gh] = fit(gr, gg);
  drawCycles(gg, gw, gh, S.full.rows, S.events, S.t, SIM.tMax, S.full.hits);
  const c = countLane(sc.fs);
  $('counts').textContent = `出ている毛 ${c.vis}/${SIM.N}`;
  const last = S.full.log.filter(n => n.t <= S.t + 1e-9 && n.kind !== 'safe').pop();
  $('now').textContent = last && S.t - last.t < 5 ? `${Math.floor(last.t)}日目${last.i == null ? '' : ' 毛穴' + (last.i + 1)}: ${last.text}` : '';
  $('day').textContent = Math.floor(S.t) + '日目';
  $('play').textContent = S.playing ? '❚❚' : '▶';
  const lk = S.key + '|' + Math.floor(S.t * 4);
  if (lk !== _logKey) { _logKey = lk; renderLog(S.full.log, S.t); }
}

// --- 案内 ---
function applyGuide(i) {
  S.guide = Math.max(0, Math.min(GUIDE.length - 1, i));
  const st = GUIDE[S.guide];
  if (!st.free) { S.site = 'shin'; S.light = { level: 10, skin: 'light', hair: 'black', cool: true }; S.age = st.age || 30; S.gray = 'mid'; }
  S.events = st.ev.map(e => Object.assign({}, e, { idx: e.idx.slice() }));
  S.tool = st.tool; S.paint = null; S.hover = null;
  changed();
  setTime(st.t); S.playing = !!st.play;
  $('gtext').innerHTML = st.text;
  $('gnum').textContent = (S.guide + 1) + '/' + GUIDE.length;
  $('gprev').disabled = S.guide === 0;
  $('gnext').textContent = S.guide === GUIDE.length - 1 ? 'はじめから' : 'つぎへ ▶';
}

// --- 操作 ---
buildControls(S, {
  site: k => { S.site = k; changed(); },
  age: (a, gr2) => { if (a != null) S.age = a; if (gr2) S.gray = gr2; changed(); },
  tool: id => { S.tool = id; S.paint = null; S.hover = null; showTip(0, 0, null); syncControls(S); },
  light: o => { Object.assign(S.light, o); changed(); },
});
$('play').onclick = () => { if (!S.playing && S.t >= SIM.tMax) setTime(0); S.playing = !S.playing; };
document.querySelectorAll('.step').forEach(b => { b.onclick = () => setTime(S.t + +b.dataset.d); });
$('undo').onclick = undo;
$('gnext').onclick = () => applyGuide(S.guide === GUIDE.length - 1 ? 0 : S.guide + 1);
$('gprev').onclick = () => applyGuide(S.guide - 1);

function graphPointer(e) {
  if (e.type === 'pointermove' && !(e.buttons & 1)) return;
  const r = gr.getBoundingClientRect();
  setTime(Math.round(graphDayAt(e.clientX - r.left, r.width, SIM.tMax)));
}
gr.addEventListener('pointerdown', graphPointer);
gr.addEventListener('pointermove', graphPointer);

// --- 断面: 拡大（ホイール・ボタン）と、しらべる でのドラッグ移動 ---
function curView() { const L = layout(GEOM.w, GEOM.h, SIM.N, null); return S.view || { z: 1, cx: L.stripMM / 2, cy: (DOWN_MM - UP_MM) / 2 }; }
function zoomAt(mx, my, factor) {
  const v = curView(), z = Math.max(0.35, Math.min(10, v.z * factor));
  const wx = (mx - GEOM.ox) / GEOM.s, wy = (my - GEOM.oy) / GEOM.s, s2 = GEOM.s0 * z;
  S.view = Math.abs(z - 1) < 0.001 ? null : clampView({ z, cx: wx - (mx - GEOM.w / 2) / s2, cy: wy - (my - GEOM.h / 2) / s2 });
}
function clampView(v) { const sm = (SIM.N - 1) * SIM.gapMM + 2.4; v.cx = Math.max(-5, Math.min(sm + 20, v.cx)); v.cy = Math.max(-UP_MM - 10, Math.min(DOWN_MM + 0.5, v.cy)); return v; }
cv.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
$('zin').onclick = () => zoomAt(GEOM.w / 2, GEOM.h / 2, 1.5);
$('zout').onclick = () => zoomAt(GEOM.w / 2, GEOM.h / 2, 1 / 1.5);
$('zall').onclick = () => { S.view = null; };

// --- 断面: 道具はペイントのように、肌の表面の上をなぞる ---
function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function brushR() { return Math.max(14, 0.45 * GEOM.s); }
function paintHit(set, x, y) {
  const r = brushR();
  GEOM.xs.forEach((fx, i) => { if (Math.abs(fx - x) < r && y > GEOM.y0 - r * 1.5) set.add(i); });   // 毛穴の出口のあたり
  if (S.paint.tool !== 'light') for (const p of GEOM.pick) if (Math.hypot(p.x - x, p.y - y) < r) set.add(p.i);   // 表面から出た毛の上
}
let pan = null;
cv.addEventListener('pointerdown', e => {
  const [x, y] = local(e);
  if (S.tool === 'look') {
    const hh = findHit(x, y); showTip(x, y, hh && hh.key, $('stage'));
    { pan = { x, y, v: Object.assign({}, S.view) }; cv.setPointerCapture(e.pointerId); }
    return;
  }
  if (y > GEOM.y0 + 0.15 * GEOM.s) { toast('肌の表面より上（毛のあるところ）をなぞってください'); return; }
  S.paint = { tool: S.tool, pts: [[x, y]], r: brushR(), hit: new Set() };
  paintHit(S.paint.hit, x, y);
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  const [x, y] = local(e);
  if (pan) { S.view = clampView({ z: pan.v.z, cx: pan.v.cx - (x - pan.x) / GEOM.s, cy: pan.v.cy - (y - pan.y) / GEOM.s }); return; }
  if (S.paint) { const yy = Math.min(y, GEOM.y0 + 0.1 * GEOM.s); S.paint.pts.push([x, yy]); paintHit(S.paint.hit, x, yy); return; }
  if (S.tool === 'look' && e.pointerType === 'mouse') { const hh = findHit(x, y); showTip(x, y, hh && hh.key, $('stage')); }
  S.hover = null;
  if (S.tool !== 'look' && y < GEOM.y0 + 0.15 * GEOM.s) { const set = new Set(); S.paint = { tool: S.tool, pts: [], r: brushR() }; paintHit(set, x, y); S.paint = null; S.hover = set.size ? [...set][0] : null; }
});
cv.addEventListener('pointerup', () => {
  pan = null;
  if (!S.paint) return;
  const idx = [...S.paint.hit], tool = S.paint.tool;
  S.paint = null;
  if (idx.length) act(tool, idx);
});
cv.addEventListener('pointerleave', () => { if (!S.paint) { S.hover = null; if (S.tool === 'look') showTip(0, 0, null); } });

let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // 最初のコマは now が last より前のことがある
  if (S.playing) { setTime(S.t + dt * S.speed); if (S.t >= SIM.tMax) S.playing = false; }
  draw();
  requestAnimationFrame(loop);
}
applyGuide(0);
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__hare = {
  S, draw, applyGuide, act, undo, zoomAt,
  setTime: t => { setTime(t); draw(); },
  simRun(sec) { for (let i = 0; i < sec * 60; i++) if (S.playing) setTime(S.t + S.speed / 60); draw(); },
  set(o) { Object.assign(S, o); changed(); draw(); },
  counts: () => countLane(sceneNow().fs),
};
