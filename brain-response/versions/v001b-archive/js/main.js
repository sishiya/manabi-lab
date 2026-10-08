/* main.js — state, playback loop, wiring, debug handle window.__br */

window.addEventListener('error', e => { window.__brErr = (window.__brErr || []).concat(String(e.message)); });

const S = {
  sp: 'human', stim: 'light', cond: 'none', msDelay: 30,
  where: { light: { x: -0.45, y: 0.25 }, spot: { touch: { k: 'hand', side: 'L' }, pain: { k: 'hand', side: 'L' }, sound: { k: 'ear', side: 'L' } }, f: 0.5 },
  T: null, base: null, p: 0, playing: false, dur: 7, hover: null,
  done: {}, seen: { lo: false, hi: false, ecc0: false, ecc1: false, hand: false, foot: false }
};
try { S.done = JSON.parse(localStorage.getItem('br.done') || '{}') || {}; } catch (e) { S.done = {}; }

const view = $('view'), vctx = view.getContext('2d');
const tl = $('timeline'), wave = $('wave'), chooser = $('chooser');

/* ---------- building a trial ---------- */
function whereFor(stim) {
  const w = S.where;
  if (stim === 'light') return { x: w.light.x, y: w.light.y };
  if (stim === 'sound') return { side: w.spot.sound.side, f: w.f };
  if (stim === 'touch') return { side: w.spot.touch.side, part: w.spot.touch.k };
  if (stim === 'pain') return { side: w.spot.pain.side };
  return {};
}
function condApplies(cond, stim) { const c = CONDS[cond]; return cond !== 'none' && c.sp.includes(S.sp) && (!c.stim || c.stim.includes(stim)); }

function fire(autoplay = true) {
  const w = whereFor(S.stim), opt = { msDelay: S.msDelay };
  const cond = condApplies(S.cond, S.stim) ? S.cond : 'none';
  S.T = buildTrial(S.sp, S.stim, w, cond, opt);
  S.base = cond !== 'none' ? buildTrial(S.sp, S.stim, w, 'none', opt) : null;
  if (S.base) S.base.tmax = S.T.tmax = Math.max(S.T.tmax, S.base.tmax);
  const t0 = Math.min(...S.T.stations.map(s => s.t), ...S.T.peaks.map(k => k.t), 50);
  TAU = Math.max(1, Math.min(40, t0 * 0.8));
  S.p = 0; S.playing = autoplay && S.T.stations.length > 0;
  sizeTimeline();
  buildList($('stList'), S.T, 0);
  refreshNotes();
  trackQuests(w, cond);
  syncControls();
  render();
}

function refreshNotes() {
  const T = S.T, el = $('notes');
  let h = '';
  if (T.missing) h += `<p class="miss">${T.missing}</p>`;
  for (const n of T.notes) h += `<p>${n}</p>`;
  if (S.cond !== 'none' && !condApplies(S.cond, S.stim)) {
    const c = CONDS[S.cond];
    h += `<p class="miss">「${c.name}」で違いが確かめられているのは、${c.sp.includes(S.sp) ? (c.stim || []).map(k => '「' + STIMS[k].name + '」').join('・') + ' の刺激です' : SPECIES[c.sp[0]].name + 'のデータです'}。いまは典型の反応を出しています。</p>`;
  }
  el.innerHTML = h;
  $('waveNote').innerHTML = T.peaks.length ? `${T.peakNote || ''} <span class="st-src">${srcLinks(T.peakSrc || [])}</span>` : '';
}

/* ---------- quests ---------- */
function done(id) {
  if (S.done[id]) return;
  S.done[id] = true;
  try { localStorage.setItem('br.done', JSON.stringify(S.done)); } catch (e) {}
  buildQuests($('quests'), S.done);
  toast('見つけた: ' + QUESTS.find(q => q.id === id).t);
}
function trackQuests(w, cond) {
  const { sp, stim } = S;
  if (stim === 'light' && w.x < 0 && !S.T.dead) done('cross');
  if (stim === 'light' && !S.T.dead) {
    const e = Math.hypot(w.x, w.y);
    if (e < 0.2) S.seen.ecc0 = true; if (e > 0.6) S.seen.ecc1 = true;
    if (S.seen.ecc0 && S.seen.ecc1) done('ecc');
  }
  if (sp === 'human' && stim === 'touch') { if (w.part === 'hand') S.seen.hand = true; if (w.part === 'foot') S.seen.foot = true; if (S.seen.hand && S.seen.foot) done('handfoot'); }
  if (sp === 'human' && stim === 'sound') done('abr');
  if (stim === 'sound') { if (w.f < 0.3) S.seen.lo = true; if (w.f > 0.7) S.seen.hi = true; if (S.seen.lo && S.seen.hi) done('pitch'); }
  if (sp === 'rat' && stim === 'touch' && w.part === 'whisk') done('whisk');
  if (sp === 'macaque' && stim === 'light') done('monkey');
  if (cond !== 'none') done('cond');
}

let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600); }

/* ---------- controls ---------- */
function syncControls() {
  for (const b of $('segSp').children) b.setAttribute('aria-pressed', b.dataset.v === S.sp);
  for (const b of $('segStim').children) {
    const miss = !!MISSING[S.sp + ':' + b.dataset.v];
    b.setAttribute('aria-pressed', b.dataset.v === S.stim); b.classList.toggle('miss', miss);
    b.title = miss ? MISSING[S.sp + ':' + b.dataset.v] : STIMS[b.dataset.v].desc;
  }
  $('pitchRow').hidden = S.stim !== 'sound';
  $('chooseCap').textContent = {
    light: '円の中をクリック: そこに光が出ます（円の中心を見つめている）。',
    face: '顔をクリックすると、目の前（視野の中心）に顔の写真が出ます。',
    sound: '耳をクリック: その耳に短い音。高さはスライダーで。',
    touch: '点をクリック: そこを刺激します（手首・足首は神経の電気刺激、ほかは軽く触る）。',
    pain: '手の甲をクリック: 熱いレーザーを短く当てます。',
    click: 'クリック: 同じ音を 0.5 秒あけて2回。'
  }[S.stim];
  // conditions available for this species
  const box = $('conds');
  box.innerHTML = Object.entries(CONDS).filter(([k, c]) => c.sp.includes(S.sp)).map(([k, c]) =>
    `<button class="preset" data-v="${k}" aria-pressed="${k === S.cond}">${c.name}<small>${k === 'none' ? '研究の平均的な反応' : (c.stim || []).map(s => STIMS[s].name).join('・') + ' で比べる'}</small></button>`).join('');
  if (S.sp !== 'human') box.insertAdjacentHTML('beforeend', `<p class="cap">${S.sp === 'rat' ? 'ラットは、経験で変わる例（恐怖条件づけ）だけを入れています。' : 'サルでは、病気・特性のデータは入れていません。'}病気の違いのデータは、ヒトで測られたものを使っています（ヒトを選ぶと出ます）。</p>`);
  $('msRow').hidden = !(S.cond === 'ms' && S.sp === 'human');
  $('msVal').textContent = S.msDelay + ' ms';
  $('btnPlay').textContent = S.playing ? '一時停止' : (S.p >= 1 ? 'もう一度' : '再生');
  drawChooser(chooser, S.sp, S.stim, { light: S.stim === 'light' ? S.where.light : null, spot: S.where.spot[S.stim] });
}

function setSp(sp) {
  S.sp = sp;
  if (!CONDS[S.cond].sp.includes(sp)) S.cond = 'none';
  if (sp === 'rat' && S.where.spot.touch.k !== 'whisk' && !['pawF', 'pawH'].includes(S.where.spot.touch.k)) S.where.spot.touch = { k: 'whisk', side: S.where.spot.touch.side };
  if (sp !== 'rat' && ['whisk', 'pawF', 'pawH'].includes(S.where.spot.touch.k)) S.where.spot.touch = { k: 'hand', side: S.where.spot.touch.side };
  if (sp !== 'human' && S.where.spot.touch.k === 'braille') S.where.spot.touch = { k: 'hand', side: S.where.spot.touch.side };
  fire();
}
function setStim(st) { S.stim = st; fire(); }
function setCond(c) {
  S.cond = c;
  const cd = CONDS[c];
  if (c !== 'none' && cd.stim && !cd.stim.includes(S.stim)) S.stim = cd.stim[0];
  if (c === 'blind' && S.stim === 'touch') S.where.spot.touch = { k: 'braille', side: S.where.spot.touch.side };
  fire();
}

/* ---------- render + loop ---------- */
function resize() {
  const r = view.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const shown = Math.max(200, Math.min(r.width, r.height * VW / VH));      // the drawing is letterboxed (object-fit: contain)
  VK = Math.min(2.4, Math.max(1, VW / shown));
  view.width = Math.round(Math.max(VW, shown * dpr)); view.height = Math.round(view.width * VH / VW);
  const cr = chooser.getBoundingClientRect(); chooser.width = Math.round(CW * Math.max(1, cr.width / CW * dpr)); chooser.height = Math.round(chooser.width * CH / CW);
  const wr = wave.getBoundingClientRect(); wave.width = Math.round(wr.width * dpr); wave.height = Math.round(wr.height * dpr);
  sizeTimeline();
  syncControls(); render();
}
function sizeTimeline() {
  if (!S.T) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), h = timelineHeight(S.T);
  tl.style.height = h + 'px';
  tl.width = Math.round((tl.clientWidth || 600) * dpr); tl.height = Math.round(h * dpr);
}
function render() {
  if (!S.T) return;
  drawBrainView(vctx, S.sp, S.T, S.base, S.p);
  drawTimeline(tl, S.T, S.base, S.p, S.hover);
  drawWave(wave, S.T, S.base, S.p);
  syncList($('stList'), S.T, S.p);
  const ms = tInv(S.p, S.T.tmax);
  $('clock').textContent = S.T.stations.length ? (ms < 10 ? ms.toFixed(1) : Math.round(ms)) + ' ms' : '—';
}
let last = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  if (S.playing) step(dt);
  requestAnimationFrame(frame);
}
function step(dt) {
  S.p = Math.min(1, S.p + dt / S.dur);
  if (S.p >= 1) { S.playing = false; if (S.stim === 'pain') done('pain2'); syncControls(); }
  render();
}

/* ---------- wiring ---------- */
function wire() {
  $('segSp').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSp(b.dataset.v); });
  $('segStim').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setStim(b.dataset.v); });
  $('conds').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setCond(b.dataset.v); });
  $('segSpeed').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S.dur = +b.dataset.v; for (const x of $('segSpeed').children) x.setAttribute('aria-pressed', x === b);
  });
  $('btnPlay').addEventListener('click', () => {
    if (S.playing) S.playing = false; else { if (S.p >= 1) S.p = 0; S.playing = S.T.stations.length > 0; }
    syncControls();
  });
  $('msDelay').addEventListener('input', e => { S.msDelay = +e.target.value; $('msVal').textContent = S.msDelay + ' ms'; fire(false); S.p = 1; render(); });
  $('msDelay').addEventListener('change', () => fire());
  $('pitch').addEventListener('change', e => { S.where.f = +e.target.value; fire(); });
  chooser.addEventListener('click', e => {
    const r = chooser.getBoundingClientRect();
    const hit = chooserHit(S.sp, S.stim, (e.clientX - r.left) * CW / r.width, (e.clientY - r.top) * CH / r.height);
    if (!hit) return;
    if (hit.light) S.where.light = hit.light;
    if (hit.spot) S.where.spot[S.stim] = { k: hit.spot.k, side: hit.spot.side };
    fire();
    // on a phone the brain is above the panel: bring it into view to watch
    if (window.matchMedia('(max-width:860px) and (orientation:portrait)').matches) $('frame').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // scrub the timeline
  const scrub = e => {
    const r = tl.getBoundingClientRect(), x = e.clientX - r.left;
    S.p = Math.max(0, Math.min(1, (x - TL.lab) / (TL.right - TL.lab))); S.playing = false; syncControls(); render();
  };
  let drag = false;
  tl.addEventListener('pointerdown', e => { drag = true; tl.setPointerCapture(e.pointerId); scrub(e); });
  tl.addEventListener('pointermove', e => { if (drag) scrub(e); });
  tl.addEventListener('pointerup', () => (drag = false));
  $('stList').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li && !e.target.closest('a')) li.classList.toggle('open'); });
  $('hint').addEventListener('click', () => $('hint').classList.toggle('open'));
  window.addEventListener('resize', resize);
}

function init() {
  buildSources($('srcList'));
  buildQuests($('quests'), S.done);
  wire();
  fire();
  resize();
  requestAnimationFrame(frame);
}

window.__br = {
  S, fire, render, step: sec => { const n = Math.ceil(sec / 0.05); for (let i = 0; i < n; i++) step(0.05); },
  set(o) { Object.assign(S, o); fire(); }, seek(ms) { S.p = tAxis(ms, S.T.tmax); S.playing = false; syncControls(); render(); }
};
init();
