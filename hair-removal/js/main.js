// 脱毛のしくみ — メイン（状態・手入れの記録・計算のよびだし・操作・ループ・デバッグ用の窓口）
'use strict';
window.__hareErr = [];
window.addEventListener('error', e => window.__hareErr.push(String(e.message)));

const cv = $('cv'), g = cv.getContext('2d');
const gr = $('gr'), gg = gr.getContext('2d');
const S = {
  t: 0, site: 'shin', tool: 'shave', playing: false, speed: 7,
  events: [],                                   // 手入れの記録 {t, type, idx}（t の順）
  light: { level: 10, skin: 'light', hair: 'black', cool: true },
  age: 30, gray: 'mid',                          // 年齢（0日目）と白髪の出やすさ
  full: null,      // 2年ぶん計算した結果（周期のグラフ・できごと）。手入れや設定を変えたときだけ計算しなおす
  run: null,       // いまの日の毛穴（日を進めるときは続きから）
  paint: null, hover: null, key: '',
  view: null,      // 拡大 {z, cx, cy}。null は全体
  ghostSeen: new Map(),   // 抜けていく毛を初めて描いた時刻
};
const HOOKS = { light: (fs, site, e, R, idx) => lightEvent(fs, e, R, idx, S.light) };
const grid = t => Math.floor(t / SIM.dt + 1e-9) * SIM.dt;

function changed() {
  AGING.age = S.age; AGING.mean = GRAY_TYPES[S.gray].mean;
  S.full = null; S.run = null; S.key = [S.site, S.age, S.gray, JSON.stringify(S.events), JSON.stringify(S.light)].join('|'); syncControls(S);
}

// 先の計算（周期のグラフ・できごと）。時間に終わりはないので、いまの日の先 1 年を切らさないよう、足りなくなったら続きを計算する
function computeFull(to) {
  if (!S.full) {
    const R = new Runner(S.site, S.events, HOOKS), rows = Array.from({ length: SIM.N }, () => []);
    S.full = { R, rows, log: R.log, flashes: [], hits: [], horizon: -1 };
  }
  const F = S.full, end = Math.max(to || 0, S.t + 400, 730);
  if (F.horizon >= end) return;
  F.R.advanceTo(end, (t, fs) => fs.forEach((f, i) => { const inf = follicleInfo(f); F.rows[i].push({ ph: f.ph, vis: inf.visible, white: inf.pig < 0.5 }); }));
  F.horizon = end; F.flashes = F.R.flashes || []; F.hits = F.log.filter(n => n.kind === 'hit');
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
  const LOG = S.full.log;
  for (let k = LOG.length - 1; k >= 0; k--) { const n = LOG[k]; if (n.t > S.t + 1e-9) continue; if (S.t - n.t >= 5) break; if (n.i != null && S.t - n.t < 3 && n.kind !== 'safe' && !latest[n.i]) latest[n.i] = n; }
  const notes = Object.values(latest).map(n => Object.assign({ age: S.t - n.t }, n)).sort((a, b) => a.age - b.age);
  // 手入れの印（毛穴ごとに、30日以内の最後の手入れ）
  const marks = {};
  for (const e of S.events) if (e.t <= S.t + 1e-9 && S.t - e.t < 30) for (const i of e.idx) marks[i] = { type: e.type, age: S.t - e.t };
  const recover = fs.map((f, i) => recovery(i));
  // 抜けていく毛: 計算の時間（抜け落ち 5日・毛抜き 2日）か、画面の時間（1.5秒）の進んだ方で動かす（止めていても見える）
  const ghosts = [], now = performance.now();
  for (let k = LOG.length - 1; k >= 0; k--) {
    const n = LOG[k];
    if (n.t > S.t + 1e-9) continue;
    if (S.t - n.t >= 5) break;
    if (!n.hairs) continue;
    const dur = n.kind === 'pluck' ? 2 : 5, simP = (S.t - n.t) / dur;
    if (simP >= 1) continue;
    const key = n.t + '|' + n.i + '|' + n.kind;
    if (!S.ghostSeen.has(key)) S.ghostSeen.set(key, now);
    const p = Math.max(simP, (now - S.ghostSeen.get(key)) / 1500);
    if (p < 1) ghosts.push({ i: n.i, kind: n.kind, hairs: n.hairs, p });
  }
  return { fs, flash: fl, since: fl ? S.t - fl.t : Infinity, notes, paint: S.paint, hover: S.hover, recover, marks, ghosts };
}

function setTime(t) { S.t = Math.max(0, t); }   // 終わりはない

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
  computeFull();
  const sc = sceneNow();
  const [w, h] = fit(cv, g);
  drawScene(g, w, h, sc, S.view);
  // 狭い画面: 断面の高さを中身に合わせる
  if (w <= 600) { const want = Math.round((UP_MM + DOWN_MM) * Math.min(40, (w - 8) / ((SIM.N - 1) * SIM.gapMM + 2.4)) + 8); if (Math.abs(h - want) > 2) $('stage').style.height = want + 'px'; }
  else if ($('stage').style.height) $('stage').style.height = '';
  const [gw, gh] = fit(gr, gg);
  const from = Math.max(0, Math.floor(S.t) - 365), to = from + 730;    // いまの前後の2年を見せる（いまが進むとずれていく）
  computeFull(to);
  drawCycles(gg, gw, gh, S.full.rows, S.events, S.t, from, to, S.full.hits);
  S.gWin = [from, to];
  const c = countLane(sc.fs);
  $('counts').textContent = `出ている毛 ${c.vis}/${SIM.N}`;
  const last = S.full.log.filter(n => n.t <= S.t + 1e-9 && n.kind !== 'safe').pop();
  $('now').textContent = last && S.t - last.t < 5 ? `${Math.floor(last.t)}日目${last.i == null ? '' : ' 毛穴' + (last.i + 1)}: ${last.text}` : '';
  const dd = Math.floor(S.t), yy = Math.floor(dd / 365);
  $('day').textContent = yy ? yy + '年' + Math.floor((dd % 365) / 30.4) + 'か月' : dd + '日目';
  $('day').title = dd + '日目・' + (S.age + S.t / 365).toFixed(1) + '歳';
  $('play').textContent = S.playing ? '❚❚' : '▶';
  const lk = S.key + '|' + Math.floor(S.t * 4);
  if (lk !== _logKey) { _logKey = lk; renderLog(S.full.log, S.t); }
}

// --- 操作 ---
buildControls(S, {
  site: k => { S.site = k; changed(); },
  age: (a, gr2) => { if (a != null) S.age = a; if (gr2) S.gray = gr2; changed(); },
  tool: id => { S.tool = id; S.paint = null; S.hover = null; showTip(0, 0, null); syncControls(S); },
  light: o => { Object.assign(S.light, o); changed(); },
});
$('play').onclick = () => { S.playing = !S.playing; };
document.querySelectorAll('.step').forEach(b => { b.onclick = () => setTime(S.t + +b.dataset.d); });
$('undo').onclick = undo;

function graphPointer(e) {
  if (e.type === 'pointermove' && !(e.buttons & 1)) return;
  const r = gr.getBoundingClientRect();
  const [a, b] = S.gWin || [0, 730];
  setTime(Math.round(graphDayAt(e.clientX - r.left, r.width, a, b)));
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
    pan = { x, y, v: Object.assign({}, curView()), moved: false }; cv.setPointerCapture(e.pointerId);   // 全体表示（view が null）からでも動かせる
    return;
  }
  if (y > GEOM.y0 + 0.15 * GEOM.s) { toast('肌の表面より上（毛のあるところ）をなぞってください'); return; }
  S.paint = { tool: S.tool, pts: [[x, y]], r: brushR(), hit: new Set() };
  paintHit(S.paint.hit, x, y);
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  const [x, y] = local(e);
  if (pan) {
    if (!pan.moved && Math.hypot(x - pan.x, y - pan.y) < 4) return;   // クリックだけなら動かさない
    pan.moved = true;
    S.view = clampView({ z: pan.v.z, cx: pan.v.cx - (x - pan.x) / GEOM.s, cy: pan.v.cy - (y - pan.y) / GEOM.s });
    return;
  }
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
  if (S.playing) setTime(S.t + dt * S.speed);
  draw();
  requestAnimationFrame(loop);
}
changed(); S.playing = true;    // 開いたらすぐ時間が流れる（道具ははじめカミソリ）
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__hare = {
  S, draw, act, undo, zoomAt,
  setTime: t => { setTime(t); draw(); },
  simRun(sec) { for (let i = 0; i < sec * 60; i++) if (S.playing) setTime(S.t + S.speed / 60); draw(); },
  set(o) { Object.assign(S, o); changed(); draw(); },
  counts: () => countLane(sceneNow().fs),
};
