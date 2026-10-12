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
  ptr: null, stroke: null, hover: null, key: '',
  view: null,      // 拡大 {z, cx, cy}。null は全体
  ghostSeen: new Map(),   // 抜けていく毛を初めて描いた時刻
};
const HOOKS = { light: (fs, site, e, R, idx) => lightEvent(fs, e, R, idx, S.light) };
const grid = t => Math.floor(t / SIM.dt + 1e-9) * SIM.dt;

function changed() {
  AGING.age = S.age; AGING.mean = FEATURES.gray ? GRAY_TYPES[S.gray].mean : 1e9;   // 白髪を外しているときは白くならない
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
  for (let k = LOG.length - 1; k >= 0; k--) { const n = LOG[k]; if (n.t > S.t + 1e-9) continue; if (S.t - n.t >= 5) break; if (n.i != null && S.t - n.t < 3 && n.kind !== 'safe' && n.kind !== 'cut' && !latest[n.i]) latest[n.i] = n; }
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
    const dur = n.kind === 'pluck' ? 2 : n.kind === 'cut' ? 1 : 5, simP = (S.t - n.t) / dur;
    if (simP >= 1) continue;
    const key = n.t + '|' + n.i + '|' + n.kind;
    if (!S.ghostSeen.has(key)) S.ghostSeen.set(key, now);
    const p = Math.max(simP, (now - S.ghostSeen.get(key)) / 1500);
    if (p < 1) ghosts.push({ i: n.i, kind: n.kind, hairs: n.hairs, p });
  }
  // 道具の見え方（マウスの所の刃・照射口・毛抜き、剃ったときの刃の動き）
  const tool = S.tool === 'look' ? null : { kind: S.tool, ptr: S.ptr, stroke: S.stroke, windowMM: WINDOW_MM, razorMM: RAZOR_MM };
  return { fs, flash: fl, since: fl ? S.t - fl.t : Infinity, notes, hover: S.hover, recover, marks, ghosts, tool };
}

function setTime(t) { S.t = Math.max(0, t); }   // 終わりはない

// --- 手入れ（再生は止めない） ---
function act(type, idx, group) {
  if (!idx.length) return;
  const t = grid(S.t);
  const later = S.events.filter(e => e.t > t + 1e-9);
  if (later.length) S.events = S.events.filter(e => e.t <= t + 1e-9);
  S.events.push({ t, type, idx: idx.slice().sort((a, b) => a - b), g: group });
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
  const e = S.events.pop();
  if (e.g != null) while (S.events.length && S.events[S.events.length - 1].g === e.g) S.events.pop();   // 1回なぞった分はまとめて
  changed();
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
  const last = S.full.log.filter(n => n.t <= S.t + 1e-9 && n.kind !== 'safe' && n.kind !== 'cut').pop();
  $('now').textContent = last && S.t - last.t < 5 ? `${Math.floor(last.t)}日目${last.i == null ? '' : ' 毛穴' + (last.i + 1)}: ${last.text}` : '';
  const dd = Math.floor(S.t), yy = Math.floor(dd / 365);
  $('day').textContent = yy ? yy + '年' + Math.floor((dd % 365) / 30.4) + 'か月' : dd + '日目';
  $('day').title = dd + '日目' + (FEATURES.gray ? '・' + (S.age + S.t / 365).toFixed(1) + '歳' : '');
  $('play').textContent = S.playing ? '❚❚' : '▶';
  const lk = S.key + '|' + Math.floor(S.t * 4);
  if (lk !== _logKey) { _logKey = lk; renderLog(S.full.log, S.t); }
}

// --- 操作 ---
buildControls(S, {
  site: k => { S.site = k; changed(); },
  age: (a, gr2) => { if (a != null) S.age = a; if (gr2) S.gray = gr2; changed(); },
  tool: id => { S.tool = id; S.stroke = null; S.hover = null; showTip(0, 0, null); syncControls(S); },
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

// --- 断面: 道具を肌にあてる ---
//  カミソリ: 刃を肌の表面にあて、横にすべらせた所を剃る（刃が毛穴の出口を通ると、そこで毛が切れる）
//  光: 照射口（幅 2 cm・実物大）がマウスについてくる。クリックで、その下の毛穴に光る
//  毛抜き: いちばん近い毛が光る。クリックでその1本を抜く
function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
const WINDOW_MM = 20;      // 照射口の幅（ケノンのカートリッジ 3.5 × 2.0 cm の短い辺）
const RAZOR_MM = 0.6;      // 刃が毛穴の出口を「通った」とみなす幅（片がわ）
function underWindow(x) { const half = WINDOW_MM / 2 * GEOM.s; return GEOM.xs.map((fx, i) => (Math.abs(fx - x) <= half ? i : -1)).filter(i => i >= 0); }
function underRazor(a, b) { const pad = RAZOR_MM * GEOM.s; return GEOM.xs.map((fx, i) => (fx >= Math.min(a, b) - pad && fx <= Math.max(a, b) + pad ? i : -1)).filter(i => i >= 0); }
function pickHair(x, y) {
  let best = null, bd = 24;
  for (const p of GEOM.pick) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p.i; } }
  if (best == null) GEOM.xs.forEach((fx, i) => { const d = Math.abs(fx - x); if (d < Math.min(bd, SIM.gapMM * GEOM.s * 0.5)) { bd = d; best = i; } });
  return best;
}
// 刃が px → x を通るあいだに毛穴の出口を通ったら、その場で切る（1回なぞった分は同じ group）
let strokeId = 0;
function razorPass(px, x) {
  const st = S.stroke, idx = underRazor(px, x).filter(i => !st.done.has(i));
  if (!idx.length) return;
  idx.forEach(i => st.done.add(i));
  act('shave', idx, st.g);
}
let pan = null;
cv.addEventListener('pointerdown', e => {
  const [x, y] = local(e);
  S.ptr = { x, y };
  if (S.tool === 'look') {
    const hh = findHit(x, y); showTip(x, y, hh && hh.key, $('stage'));
    pan = { x, y, v: Object.assign({}, curView()), moved: false }; cv.setPointerCapture(e.pointerId);   // 全体表示（view が null）からでも動かせる
    return;
  }
  if (S.tool === 'shave') { S.stroke = { a: x, b: x, done: new Set(), g: ++strokeId }; cv.setPointerCapture(e.pointerId); razorPass(x, x); return; }
  if (S.tool === 'light') { const idx = underWindow(x); if (idx.length) act('light', idx); else toast('照射口の下に毛穴がありません'); return; }
  if (S.tool === 'pluck') { const i = pickHair(x, y); if (i != null) act('pluck', [i]); else toast('毛のない所です。抜きたい毛をクリックしてください'); }
});
cv.addEventListener('pointermove', e => {
  const [x, y] = local(e);
  S.ptr = { x, y };
  if (pan) {
    if (!pan.moved && Math.hypot(x - pan.x, y - pan.y) < 4) return;   // クリックだけなら動かさない
    pan.moved = true;
    S.view = clampView({ z: pan.v.z, cx: pan.v.cx - (x - pan.x) / GEOM.s, cy: pan.v.cy - (y - pan.y) / GEOM.s });
    return;
  }
  if (S.stroke) { const px = S.stroke.b; S.stroke.b = x; razorPass(px, x); return; }
  if (S.tool === 'look' && e.pointerType === 'mouse') { const hh = findHit(x, y); showTip(x, y, hh && hh.key, $('stage')); }
  S.hover = S.tool === 'pluck' ? pickHair(x, y) : null;
});
cv.addEventListener('pointerup', () => {
  pan = null;
  S.stroke = null;
});
cv.addEventListener('pointerleave', () => { if (!S.stroke) { S.ptr = null; S.hover = null; if (S.tool === 'look') showTip(0, 0, null); } });

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
