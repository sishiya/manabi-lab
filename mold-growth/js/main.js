// Panel, time bar, loop, debug handle (window.__mo).

const $ = id => document.getElementById(id);
const UI = { t: 0, playing: false, speed: 24, lastNowKey: '', lastNumKey: '', cond: { ...DEFAULT_COND, events: [] }, R: null, ghost: null, prevSum: null, err: undefined };
const SPEEDS = [['1時間', 1], ['6時間', 6], ['1日', 24], ['1週', 168]];  // hours per second
const TAG = { sure: '確か', est: '推定', art: '演出' };
const tagHtml = k => `<span class="tag ${k}">${TAG[k]}</span>`;
const DOW = ['月', '火', '水', '木', '金', '土', '日'];

function fmtClock(t) {
  const d = Math.floor(t / 24), h = t % 24;
  return `${Math.floor(d / 7) + 1}週目 ${DOW[d % 7]}曜 ${String(Math.floor(h)).padStart(2, '0')}:00`;
}

function setT(t) { UI.t = clamp(t, 0, T_END); draw(); }

function draw() {
  const R = UI.R, t = Math.floor(UI.t);
  try {
    drawView($('view'), R, t, performance.now() / 1000);
    drawChart($('chart'), R, UI.ghost, t);
    updatePanel(t);
  } catch (e) { UI.err = e; window.__moErr = e; throw e; }
}

function updatePanel(t) {
  const R = UI.R, P = PLACES[R.cond.place];
  const st = STAGES[stageOf(R.M[t])].name;
  $('stageName').innerHTML = `<b>${st}</b><span>${P.name}・${SEASONS[R.cond.season].name}・${Math.floor(t / 24) + 1}日目</span>`;
  $('clock').textContent = fmtClock(t);
  $('time').value = t;
  const evs = nowEvents(R, t);
  const key = evs.map(e => e.title + e.text).join('|');
  if (key !== UI.lastNowKey) {
    UI.lastNowKey = key;
    $('now').innerHTML = evs.map(e => `<div class="ev"><b>${e.title}</b>${tagHtml(e.tag)}<br>${e.text}</div>`).join('');
  }
  const nk = Math.round(R.Cin[t]) + '|' + Math.round(R.landed[t] * 10);
  if (nk !== UI.lastNumKey) {
    UI.lastNumKey = nk;
    $('numbers').innerHTML = `<table>${numbers(R, t).map(([a, v, tg, sub]) => `<tr><td>${a}<small>${sub}</small></td><td class="v">${v} ${tagHtml(tg)}</td></tr>`).join('')}</table>`;
  }
  $('treatNow').textContent = `いま（${fmtClock(t)}）に使う`;
}

// ---- place and conditions ----
function buildPlaces() {
  const box = $('places'); box.innerHTML = '';
  for (const [k, p] of Object.entries(PLACES)) {
    const b = document.createElement('button'); b.dataset.p = k;
    b.innerHTML = `${p.name}<small>${p.sub}</small>`;
    b.addEventListener('click', () => setPlace(k));
    box.appendChild(b);
  }
}
function setPlace(p) {
  if (p === UI.cond.place) return;
  UI.ghost = null; UI.prevSum = null;
  UI.cond = condFor(p);
  UI.R = simulate(UI.cond);
  buildConds(); syncAll();
}
function buildConds() {
  const box = $('conds'); box.innerHTML = '';
  for (const key of PLACES[UI.cond.place].opts) {
    const c = CHOICES[key], div = document.createElement('div'); div.className = 'cond'; div.dataset.key = key;
    div.innerHTML = `<div class="name">${c.label}</div><div class="seg" role="group" aria-label="${c.label}"></div><div class="sub"></div>`;
    const seg = div.querySelector('.seg');
    for (const o of c.opts) {
      const b = document.createElement('button'); b.textContent = o.name; b.dataset.v = o.v;
      b.addEventListener('click', () => setCond({ [key]: o.v }));
      seg.appendChild(b);
    }
    box.appendChild(div);
  }
}
function syncAll() {
  document.querySelectorAll('#places button').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === UI.cond.place ? 'true' : 'false'));
  document.querySelectorAll('#conds .cond').forEach(div => {
    const key = div.dataset.key;
    div.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', UI.cond[key] === b.dataset.v ? 'true' : 'false'));
    div.querySelector('.sub').textContent = optOf(key, UI.cond[key]).sub || '';
  });
  $('matName').textContent = `材料: ${PLACES[UI.cond.place].mat}`;
  showEvents(); showResult(); UI.lastNowKey = ''; UI.lastNumKey = ''; draw();
}
function setCond(patch, keepGhost) {
  const next = { ...UI.cond, ...patch };
  if (JSON.stringify(next) === JSON.stringify(UI.cond)) return;
  if (!keepGhost) { UI.ghost = UI.R; UI.prevSum = UI.R ? summarize(UI.R) : null; }
  UI.cond = next;
  UI.R = simulate(UI.cond);
  syncAll();
}

// ---- treatments ----
function buildTreats() {
  const box = $('treatBtns'); box.innerHTML = '';
  for (const [k, tk] of Object.entries(TREAT_KINDS)) {
    const b = document.createElement('button'); b.style.setProperty('--tc', tk.col);
    b.innerHTML = `<i></i>${tk.name}`;
    b.addEventListener('click', () => {
      const t = Math.floor(UI.t);
      if (UI.cond.events.some(e => e.t === t && e.k === k)) return;
      setPlaying(false);
      setCond({ events: [...UI.cond.events, { t, k }].sort((a, b) => a.t - b.t) }, true);
    });
    box.appendChild(b);
  }
  $('treatClear').addEventListener('click', () => setCond({ events: [] }, true));
  $('treatInfo').innerHTML = TREATS.map(x => `<details><summary><i style="background:${TREAT_KINDS[x.k].col}"></i>${TREAT_KINDS[x.k].name}は何をしている？</summary>
    <p class="what">中身: ${x.what}</p>${x.does.map(([tg, s]) => `<p>${tagHtml(tg)} ${s}</p>`).join('')}${x.warn ? `<p class="warn">${x.warn}</p>` : ''}</details>`).join('');
}
function showEvents() {
  const ev = UI.cond.events;
  $('treatClear').hidden = !ev.length;
  $('treatList').innerHTML = ev.length ? ev.map((e, i) => `<li><span class="dot" style="background:${TREAT_KINDS[e.k].col}"></span>${fmtClock(e.t)}　${TREAT_KINDS[e.k].name}<button data-i="${i}" aria-label="この対策を消す">×</button></li>`).join('') : '';
  $('treatList').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    const evs = UI.cond.events.filter((_, i) => i !== +b.dataset.i);
    setCond({ events: evs }, true);
  }));
}

function showResult() {
  const s = summarize(UI.R), p = UI.prevSum;
  const vis = x => x.visDay === null ? '12週では見えない' : `${Math.round(x.visDay)}日目`;
  const cov = x => x.V < 3 ? (x.M > 0.05 ? '見えない（菌糸はある）' : 'なし') : `表面の ${x.cov < 0.1 ? (x.cov * 100).toFixed(1) : (x.cov * 100).toFixed(0)}%`;
  const pc = v => (v * 100).toFixed(0) + '%';
  const sp = x => x.top < 0 ? '—' : SPECIES[x.top].name;
  const row = (name, f) => `<tr><td>${name}</td><td class="v">${f(s)}</td><td class="p">${p ? '前 ' + f(p) : ''}</td></tr>`;
  $('result').innerHTML = `<table>
    ${row('目に見えるまで', vis)}
    ${row('12週後の見た目', cov)}
    ${row('生きているカビ（指数 0〜6）', x => x.M.toFixed(1))}
    ${row('カビが育てた時間', x => pc(x.growFrac))}
    ${row('表面がぬれていた時間', x => pc(x.wetFrac))}
    ${row('多いカビ', sp)}
    ${row('空気の胞子（12週目、1m³）', x => fmtN(x.air) + '個')}
  </table><p class="note">カビ指数は VTT モデルの目安（3 = 目に見えはじめる、4 = 表面の1割、5 = 半分、6 = 全面）${tagHtml('sure')}。汚れ・対策・空気の胞子・カビの種類はこのアプリの推定 ${tagHtml('est')}。「前」は1つ前の条件（グラフの点線）。</p>`;
}

function buildTexts() {
  $('myths').innerHTML = MYTHS.map(m => `<details><summary>${m.q}</summary><p>${m.a}</p></details>`).join('');
  $('tips').innerHTML = TIPS.map(([h, s]) => `<li><b>${h}</b>${s}</li>`).join('');
  $('unknowns').innerHTML = UNKNOWNS.map(u => `<li>${u}</li>`).join('');
  $('sources').innerHTML = SOURCES.map(u => `<li>${u}</li>`).join('');
  $('species').innerHTML = SPECIES.map(s => `<li><span class="dot" style="background:${s.spore}"></span><b>${s.name}</b>（${s.sci}）${s.note}。育つ最低の湿度 約${s.RHmin}%、よく育つ温度 約${s.Topt}℃</li>`).join('');
  $('tries').innerHTML = '';
  TRIES.forEach(tr => {
    const b = document.createElement('button');
    b.innerHTML = `${tr.label}<small>${tr.sub}</small>`;
    b.addEventListener('click', () => {
      const base = { ...condFor(tr.place), events: [] };
      if (tr.before) { UI.ghost = simulate({ ...base, ...tr.before }); UI.prevSum = summarize(UI.ghost); }
      else { UI.ghost = null; UI.prevSum = null; }
      UI.cond = { ...base, ...tr.cond, events: tr.events || [] };
      UI.R = simulate(UI.cond);
      buildConds(); syncAll();
      setRange(tr.range); setViewMode(tr.view);
      setT(tr.t);
      setPlaying(false);
      if (window.matchMedia('(max-width:700px), (max-aspect-ratio:3/4)').matches) $('viewWrap').scrollIntoView({ behavior: 'smooth' });
    });
    $('tries').appendChild(b);
  });
}

// ---- view / time bar ----
function setViewMode(m) {
  VIEW.mode = m;
  document.querySelectorAll('#viewCtl button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === m ? 'true' : 'false'));
  draw();
}
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
  document.querySelectorAll('#rangeCtl button').forEach(b => b.addEventListener('click', () => setRange(b.dataset.range)));
  document.querySelectorAll('#viewCtl button').forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.view)));
  $('labels').addEventListener('change', e => { VIEW.labels = e.target.checked; draw(); });
  $('hidden').addEventListener('change', e => { VIEW.hidden = e.target.checked; draw(); });
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
window.addEventListener('error', e => { window.__moErr = e.error || e.message; });
UI.R = simulate(UI.cond);
buildPlaces(); buildConds(); buildTreats(); buildTexts(); buildTimebar(); syncAll();
window.addEventListener('resize', draw);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
requestAnimationFrame(frame);

window.__mo = {
  UI, VIEW, CH, setT, setCond, setPlace, setRange, setViewMode, draw, simulate, summarize,
  get R() { return UI.R; }, t: () => UI.t,
  frame(n = 1) { for (let i = 0; i < n; i++) { if (UI.playing) UI.t = Math.min(T_END, UI.t + UI.speed / 30); draw(); } },
  get err() { return UI.err || window.__moErr; },
};
