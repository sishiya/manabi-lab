// 脱毛のしくみ — メイン（状態・手入れの記録・計算のよびだし・操作・ループ・デバッグ用の窓口）
'use strict';
window.__hareErr = [];
window.addEventListener('error', e => window.__hareErr.push(String(e.message)));

const cv = $('cv'), g = cv.getContext('2d');
const gr = $('gr'), gg = gr.getContext('2d');
const S = {
  t: 0, site: 'shin', tool: 'look', playing: false, speed: 7, hold: 0, guide: 0,
  events: [],                                   // 手入れの記録 {t, type, idx}（t の順）
  light: { level: 10, skin: 'light', hair: 'black', cool: true },
  age: 30, gray: 'mid',                          // 年齢（0日目）と白髪の出やすさ
  full: null,      // 2年ぶん計算した結果（周期のグラフ・できごと）。手入れや設定を変えたときだけ計算しなおす
  run: null,       // いまの日の毛穴（日を進めるときは続きから）
  sel: null, hover: null, key: '',
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
  S.full = { rows, log: R.log, flashes: R.flashes || [] };
}
function sceneNow() {
  if (!S.full) computeFull();
  if (!S.run || S.run.t() > S.t + 1e-9) S.run = new Runner(S.site, S.events, HOOKS);
  const fs = S.run.advanceTo(S.t);
  const fl = (S.run.flashes || []).filter(x => x.t <= S.t + 1e-9).pop();
  // 毛穴の上の字幕: 7日以内のできごと（毛穴ごとに新しいものだけ）
  const latest = {};
  for (const n of S.full.log) { if (n.t > S.t + 1e-9) break; if (n.i != null && S.t - n.t < 7) latest[n.i] = n; }
  const notes = Object.values(latest).map(n => Object.assign({ age: S.t - n.t }, n)).sort((a, b) => a.age - b.age);   // 新しいものから置く
  return { fs, flash: fl, since: fl ? S.t - fl.t : Infinity, notes, sel: S.sel, hover: S.hover };
}

function setTime(t) { S.t = Math.max(0, Math.min(SIM.tMax, t)); }

// --- 手入れ ---
function act(type, idx) {
  if (!idx.length) return;
  S.playing = false;
  S.t = grid(S.t);
  const later = S.events.filter(e => e.t > S.t + 1e-9);
  if (later.length) S.events = S.events.filter(e => e.t <= S.t + 1e-9);
  S.events.push({ t: S.t, type, idx: idx.slice().sort((a, b) => a - b) });
  changed(); computeFull();
  // そのときのできごとを短く知らせる
  let msg;
  if (type === 'pluck') {
    const ns = S.full.log.filter(n => Math.abs(n.t - S.t) < 1e-9 && idx.includes(n.i) && n.kind === 'pluck');
    const root = ns.filter(n => n.short === '抜いた').length, short = ns.filter(n => n.short === 'つまめない').length;
    msg = idx.length === 1 ? `毛穴${idx[0] + 1}: ` + (ns[0] ? ns[0].text : '') : `毛抜き: 根もとごと抜けた ${root} 本` + (short ? `・短くてつまめない ${short} 本` : '');
  } else if (type === 'shave') msg = `毛穴 ${idx[0] + 1}〜${idx[idx.length - 1] + 1} を剃った`;
  else {
    const F = S.full.flashes.filter(f => Math.abs(f.t - S.t) < 1e-9).pop();
    msg = F ? `光: 毛球に色がある毛穴 ${F.nA} 個のうち ${F.hit} 個の毛母がいたんだ` : '光をあてた';
  }
  toast((later.length ? 'この日より後の手入れを消しました。' : '') + msg);
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
  drawScene(g, w, h, sc);
  // 狭い画面: 断面の高さを中身に合わせる（横幅で大きさが決まるので、上下の空きをなくす）
  if (w <= 600 && GEOM.s) { const want = Math.round((UP_MM + DOWN_MM) * GEOM.s + 10); if (Math.abs(h - want) > 2) $('stage').style.height = want + 'px'; }
  else if ($('stage').style.height) $('stage').style.height = '';
  const [gw, gh] = fit(gr, gg);
  drawCycles(gg, gw, gh, S.full.rows, S.events, S.t, SIM.tMax);
  const c = countLane(sc.fs);
  $('counts').textContent = `出ている毛 ${c.vis}/${SIM.N}・のびる ${c.A}・ちぢむ ${c.C}・休む ${c.T + c.R}${c.X ? '・止まった ' + c.X : ''}`;
  const last = S.full.log.filter(n => n.t <= S.t + 1e-9).pop();
  $('now').textContent = last && S.t - last.t < 7 ? `${Math.floor(last.t)}日目${last.i == null ? '' : ' 毛穴' + (last.i + 1)}: ${last.text}` : '';
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
  S.tool = st.tool; S.sel = null; S.hover = null;
  changed();
  setTime(st.t); S.playing = !!st.play; S.hold = 0;
  $('gtext').innerHTML = st.text;
  $('gnum').textContent = (S.guide + 1) + '/' + GUIDE.length;
  $('gprev').disabled = S.guide === 0;
  $('gnext').textContent = S.guide === GUIDE.length - 1 ? 'はじめから' : 'つぎへ ▶';
}

// --- 操作 ---
buildControls(S, {
  site: k => { S.site = k; changed(); },
  age: (a, gr) => { if (a != null) S.age = a; if (gr) S.gray = gr; changed(); },
  tool: id => { S.tool = id; S.sel = null; S.hover = null; showTip(0, 0, null); syncControls(S); },
  light: o => { Object.assign(S.light, o); changed(); },
});
$('play').onclick = () => { if (!S.playing && S.t >= SIM.tMax) setTime(0); S.playing = !S.playing; S.hold = 0; };
document.querySelectorAll('.step').forEach(b => { b.onclick = () => { S.playing = false; setTime(S.t + +b.dataset.d); }; });
$('undo').onclick = undo;
$('gnext').onclick = () => applyGuide(S.guide === GUIDE.length - 1 ? 0 : S.guide + 1);
$('gprev').onclick = () => applyGuide(S.guide - 1);

function graphPointer(e) {
  if (e.type === 'pointermove' && !(e.buttons & 1)) return;
  const r = gr.getBoundingClientRect(); S.playing = false;
  setTime(Math.round(graphDayAt(e.clientX - r.left, r.width, SIM.tMax)));
}
gr.addEventListener('pointerdown', graphPointer);
gr.addEventListener('pointermove', graphPointer);

// 断面: 道具ごとの操作
function nearest(x, maxPx) {
  let best = null, bd = maxPx;
  GEOM.xs.forEach((fx, i) => { const d = Math.abs(fx - x); if (d < bd) { bd = d; best = i; } });
  return best;
}
function local(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
cv.addEventListener('pointerdown', e => {
  const [x, y] = local(e);
  if (S.tool === 'look') { const hh = findHit(x, y); showTip(x, y, hh && hh.key, $('stage')); return; }
  S.sel = { tool: S.tool, a: x, b: x }; cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  const [x, y] = local(e);
  if (S.sel) { S.sel.b = x; return; }
  if (S.tool === 'look' && e.pointerType === 'mouse') { const hh = findHit(x, y); showTip(x, y, hh && hh.key, $('stage')); }
  S.hover = S.tool !== 'look' ? nearest(x, SIM.gapMM * GEOM.s * 0.5) : null;
});
cv.addEventListener('pointerup', () => {
  if (!S.sel) return;
  const a = Math.min(S.sel.a, S.sel.b), b = Math.max(S.sel.a, S.sel.b), pad = SIM.gapMM * GEOM.s * 0.3, tool = S.sel.tool;
  let idx = GEOM.xs.map((fx, i) => (fx >= a - pad && fx <= b + pad ? i : -1)).filter(i => i >= 0);
  if (!idx.length) { const i = nearest((a + b) / 2, SIM.gapMM * GEOM.s); if (i != null) idx = [i]; }
  S.sel = null;
  act(tool, idx);
});
cv.addEventListener('pointerleave', () => { if (!S.sel) { S.hover = null; if (S.tool === 'look') showTip(0, 0, null); } });

// (a, b] のあいだにある、いちばん早い手入れの日
function nextEvent(a, b) {
  let best = null;
  for (const e of S.events) if (e.t > a + 1e-9 && e.t <= b && (best == null || e.t < best)) best = e.t;
  return best;
}
let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // 最初のコマは now が last より前のことがある
  if (S.playing) {
    if (S.hold > 0) S.hold -= dt;                  // 手入れの日は少し止まって見せる
    else {
      let tn = S.t + dt * S.speed;
      const ev = nextEvent(S.t, tn);
      if (ev != null) { tn = ev; S.hold = 1.3; }
      setTime(tn); if (S.t >= SIM.tMax) S.playing = false;
    }
  }
  draw();
  requestAnimationFrame(loop);
}
applyGuide(0);
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__hare = {
  S, draw, applyGuide, act, undo,
  setTime: t => { setTime(t); draw(); },
  simRun(sec) { for (let i = 0; i < sec * 60; i++) if (S.playing) setTime(S.t + S.speed / 60); draw(); },
  set(o) { Object.assign(S, o); changed(); draw(); },
  counts: () => countLane(sceneNow().fs),
};
