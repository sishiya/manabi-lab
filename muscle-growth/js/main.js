// Panel, time bar, loop, debug handle (window.__mg).

const $ = id => document.getElementById(id);
const UI = { t: 0, playing: false, speed: 24, lastNowKey: '', cond: { ...DEFAULT_COND }, R: null, ghost: null, prevSum: null, err: undefined };
const SPEEDS = [['6時間', 6], ['1日', 24], ['1週', 168]]; // hours per second
const TAG = { sure: '確か', est: '推定', art: '演出' };
const tagHtml = k => `<span class="tag ${k}">${TAG[k]}</span>`;
const DOW = ['月', '火', '水', '木', '金', '土', '日'];

function fmtClock(t) {
  const d = Math.floor(t / 24), h = t % 24;
  return `${Math.floor(d / 7) + 1}週目 ${DOW[d % 7]}曜 ${String(Math.floor(h)).padStart(2, '0')}:00`;
}
function stageText(R, t) {
  const tr = TRAIN_WEEKS * H_WEEK;
  if (t >= tr) return { name: '休み（筋トレをやめた）', sub: `やめて${Math.floor((t - tr) / 24)}日目。12週間で ${R.sessions.length}回 筋トレした` };
  let last = -1, n = 0;
  for (const s of R.sessions) if (s <= t) { last = s; n++; }
  if (last < 0) return { name: '筋トレの前', sub: `${optOf('freq', UI.cond.freq).name}・${optOf('mode', UI.cond.mode).name}・${UI.cond.sets}セット。最初の筋トレは月曜18時` };
  const h = t - last;
  const hs = h < 48 ? `${h}時間` : `${Math.floor(h / 24)}日${h % 24 ? (h % 24) + '時間' : ''}`;
  return { name: h < 2 ? `${n}回目の筋トレ` : `${n}回目の筋トレから ${hs}`, sub: `${optOf('freq', UI.cond.freq).name}・${optOf('mode', UI.cond.mode).name}・${UI.cond.sets}セット` };
}

function setT(t) {
  UI.t = clamp(t, 0, T_END);
  draw();
}

function draw() {
  const R = UI.R, t = Math.floor(UI.t);
  try {
    drawMicro($('view'), R, t, performance.now() / 1000);
    drawChart($('chart'), R, UI.ghost, t);
    updatePanel(t);
  } catch (e) { UI.err = e; window.__mgErr = e; throw e; }
}

function updatePanel(t) {
  const R = UI.R, st = stageText(R, t);
  $('stageName').innerHTML = `<b>${st.name}</b><span>${st.sub}</span>`;
  $('clock').textContent = fmtClock(t);
  $('time').value = t;
  const evs = nowEvents(R, t);
  const key = evs.map(e => e.title + e.text).join('|');
  if (key !== UI.lastNowKey) {
    UI.lastNowKey = key;
    $('now').innerHTML = evs.map(e => `<div class="ev"><b>${e.title}</b>${tagHtml(e.tag)}<br>${e.text}</div>`).join('');
  }
}

// ---- conditions ----
function buildConds() {
  const box = $('conds'); box.innerHTML = '';
  for (const [key, c] of Object.entries(CHOICES)) {
    const div = document.createElement('div'); div.className = 'cond';
    div.innerHTML = `<div class="name">${c.label}</div><div class="seg" role="group" aria-label="${c.label}"></div><div class="sub"></div>`;
    const seg = div.querySelector('.seg');
    for (const o of c.opts) {
      const b = document.createElement('button'); b.textContent = o.name; b.dataset.key = key; b.dataset.v = String(o.v);
      b.addEventListener('click', () => setCond({ [key]: o.v }));
      seg.appendChild(b);
    }
    box.appendChild(div);
  }
  syncConds();
}
function syncConds() {
  document.querySelectorAll('#conds .cond').forEach(div => {
    let key = null;
    div.querySelectorAll('button').forEach(b => { key = b.dataset.key; b.setAttribute('aria-pressed', String(UI.cond[key]) === b.dataset.v ? 'true' : 'false'); });
    const o = optOf(key, UI.cond[key]);
    div.querySelector('.sub').textContent = o.sub || '';
  });
}

function setCond(patch, keepGhost) {
  const next = { ...UI.cond, ...patch };
  if (JSON.stringify(next) === JSON.stringify(UI.cond)) return;
  if (!keepGhost) { UI.ghost = UI.R; UI.prevSum = UI.R ? summarize(UI.R) : null; }
  UI.cond = next;
  UI.R = simulate(UI.cond);
  syncConds(); showResult(); UI.lastNowKey = ''; draw();
}

function showResult() {
  const s = summarize(UI.R), p = UI.prevSum;
  const f = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const row = (name, v, pv, unit) => `<tr><td>${name}</td><td class="v">${unit ? v : f(v)}</td><td class="p">${p ? '前 ' + (unit ? pv : f(pv)) : ''}</td></tr>`;
  $('result').innerHTML = `<table>
    ${row('筋肉の量（断面積）', s.muscle, p && p.muscle)}
    ${row('力（最後の筋トレの3日後）', s.strength, p && p.strength)}
    ${row('筋肉痛（2/10以上）の日', s.soreDays + '日', p && p.soreDays + '日', 1)}
    ${row('いちばん強い筋肉痛', s.soreMax.toFixed(0) + '/10', p && p.soreMax.toFixed(0) + '/10', 1)}
    ${row('6週間休んだあとの筋肉', s.after, p && p.after)}
  </table><p class="note">はじめを0%とした変化。研究のおおよその値に合わせた目安で、人による差はとても大きい ${tagHtml('est')}。「前」は1つ前の条件（グラフの点線）。</p>`;
}

function buildTexts() {
  $('myths').innerHTML = MYTHS.map(m => `<details><summary>${m.q}</summary><p>${m.a}</p></details>`).join('');
  $('unknowns').innerHTML = UNKNOWNS.map(u => `<li>${u}</li>`).join('');
  $('sources').innerHTML = SOURCES.map(u => `<li>${u}</li>`).join('');
  $('tries').innerHTML = '';
  TRIES.forEach(tr => {
    const b = document.createElement('button');
    b.innerHTML = `${tr.label}<small>${tr.sub}</small>`;
    b.addEventListener('click', () => {
      if (tr.before) { UI.cond = { ...DEFAULT_COND, ...tr.before }; UI.R = simulate(UI.cond); }
      setCond({ ...DEFAULT_COND, ...tr.cond, age: 'young', protein: 'ok', sleep: 'ok', ...(tr.cond.exp ? {} : { exp: 'novice' }) }, false);
      if (!tr.before) { UI.ghost = null; UI.prevSum = null; showResult(); }
      setRange(tr.range);
      setT(tr.t);
      setPlaying(!!tr.play);
      if (window.matchMedia('(max-width:700px), (max-aspect-ratio:3/4)').matches) $('viewWrap').scrollIntoView({ behavior: 'smooth' });
    });
    $('tries').appendChild(b);
  });
}

// ---- time bar ----
function setPlaying(p) {
  UI.playing = p; $('play').textContent = p ? '❚❚' : '▶'; $('play').setAttribute('aria-label', p ? '一時停止' : '再生');
  if (p && UI.t >= T_END) UI.t = 0;
}
function setRange(r) {
  CH.range = r;
  document.querySelectorAll('#rangeCtl button').forEach(b => b.setAttribute('aria-pressed', b.dataset.range === r ? 'true' : 'false'));
  draw();
}
function buildTimebar() {
  SPEEDS.forEach(([name, v]) => {
    const b = document.createElement('button'); b.textContent = name; b.title = `1秒で${name}`;
    b.setAttribute('aria-pressed', v === UI.speed ? 'true' : 'false');
    b.addEventListener('click', () => { UI.speed = v; document.querySelectorAll('#speeds button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); });
    $('speeds').appendChild(b);
  });
  $('play').addEventListener('click', () => setPlaying(!UI.playing));
  $('time').max = T_END;
  $('time').addEventListener('input', e => { setPlaying(false); setT(+e.target.value); });
  $('nextSess').addEventListener('click', () => {
    const s = UI.R.sessions.find(s => s > UI.t + 1.5);
    setT(s !== undefined ? s - 1 : T_END);
  });
  document.querySelectorAll('#rangeCtl button').forEach(b => b.addEventListener('click', () => setRange(b.dataset.range)));
  document.querySelectorAll('#viewCtl button').forEach(b => b.addEventListener('click', () => {
    VIEW.ex = +b.dataset.ex;
    document.querySelectorAll('#viewCtl button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    draw();
  }));
  $('labels').addEventListener('change', e => { VIEW.labels = e.target.checked; draw(); });
  // chart: click / drag to move in time
  const cv = $('chart');
  let drag = false;
  const go = e => { const r = cv.getBoundingClientRect(); setPlaying(false); setT(chartXToT(cv, e.clientX - r.left, Math.floor(UI.t))); };
  cv.addEventListener('pointerdown', e => { drag = true; cv.setPointerCapture(e.pointerId); go(e); });
  cv.addEventListener('pointermove', e => { if (drag) go(e); });
  cv.addEventListener('pointerup', () => { drag = false; });
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'range') return;
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); setPlaying(!UI.playing); }
  });
}

// ---- loop ----
let lastFrame = 0;
function frame(now) {
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (UI.playing) {
    UI.t += dt * UI.speed;
    if (UI.t >= T_END) { UI.t = T_END; setPlaying(false); }
  }
  try { draw(); } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}

// ---- start ----
window.addEventListener('error', e => { window.__mgErr = e.error || e.message; });
UI.R = simulate(UI.cond);
buildConds(); buildTexts(); buildTimebar(); showResult();
window.addEventListener('resize', draw);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
draw();
requestAnimationFrame(frame);

window.__mg = {
  UI, VIEW, CH, setT, setCond, setRange, draw, simulate, summarize,
  get R() { return UI.R; }, t: () => UI.t,
  frame(n = 1) { for (let i = 0; i < n; i++) { if (UI.playing) UI.t = Math.min(T_END, UI.t + UI.speed / 30); draw(); } },
  get err() { return UI.err || window.__mgErr; },
};
