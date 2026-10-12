// Panel, time bar, loop, card, debug handle (window.__mm).

const $ = id => document.getElementById(id);
const UI = { u: 0, playing: false, speed: 1, lastNowKey: '', lastListKey: '' };
const SPEEDS = [['½', 0.5], ['1', 1], ['2', 2], ['4', 4]];
const SWEEP_S = 60; // seconds for the whole slider at speed 1
let LAST = null;    // last drawn state (for picking)

const tNow = () => uToT(UI.u);
const TAG = { sure: L('確か', 'confirmed'), est: L('推定', 'estimate'), art: L('演出', 'for show') };
const tagHtml = k => `<span class="tag ${k}">${TAG[k]}</span>`;
const organName = id => id === 'hemo' ? L('血球', 'Blood cells') : ORGAN_BY_ID[id].name;
const organCat = id => id === 'hemo' ? 'hem' : ORGAN_BY_ID[id].cat;

function fmtClock(t) {
  if (LANG === 'en') {
    const dh = (d) => { const days = Math.floor(d + 1e-9), h = Math.floor((d - days) * 24 + 1e-6); return (days ? days + ' d ' : '') + h + ' h'; };
    if (t < 0) return dh(-t) + ' before pupation';
    if (t < T_ECL) return dh(t) + ' into the pupa';
    const m = (t - T_ECL) * 1440;
    if (m < 60) return Math.floor(m) + ' min after emergence';
    if (m < 1440) return Math.floor(m / 60) + ' h' + (Math.floor(m % 60) ? ' ' + Math.floor(m % 60) + ' min' : '') + ' after emergence';
    return dh(t - T_ECL) + ' after emergence';
  }
  const dh = (d) => { const days = Math.floor(d + 1e-9), h = Math.floor((d - days) * 24 + 1e-6); return (days ? days + '日 ' : '') + h + '時間'; };
  if (t < 0) return '蛹になる ' + dh(-t) + '前';
  if (t < T_ECL) return '蛹になって ' + dh(t);
  const m = (t - T_ECL) * 1440;
  if (m < 60) return '羽化から ' + Math.floor(m) + '分';
  if (m < 1440) return '羽化から ' + Math.floor(m / 60) + '時間' + (Math.floor(m % 60) ? ' ' + Math.floor(m % 60) + '分' : '');
  return '羽化から ' + dh(t - T_ECL);
}
function stageSub(t) {
  const s = stageAt(t);
  if (s.id === 'pupa') {
    const d = Math.floor(t), left = Math.max(1, Math.ceil(T_ECL - t));
    return L(`研究での呼び名 P${d}（蛹になった日が P0）。外からはほとんど変わらない。成虫が出るまで あと約${left}日`, `Researchers call this P${d} (the day of pupation is P0). It hardly changes from outside. About ${left} days until the adult emerges`);
  }
  if (s.id === 'eclosion') return t < TL.inflate[0] ? L('蛹の殻から出て、土をかき分けて地上へ', 'Out of the pupal shell and digging up through the soil') : L('体液を送りこんで翅を広げる', 'Pumping body fluid into the wings to spread them');
  if (s.id === 'adult') return L('飛んで、花の蜜を吸い、相手をさがす', 'Flies, sips nectar from flowers and looks for a mate');
  if (s.id === 'prepupa') { const w = Math.floor(t - TL.wander); return L(`${s.sub}（歩きはじめて ${w}日目、W${w}）`, `${s.sub} (day ${w} after it started wandering, W${w})`); }
  return s.sub;
}

function updatePanel(t) {
  const st = stageAt(t);
  $('stageName').innerHTML = `<b>${st.name}</b><span>${stageSub(t)}</span>`;
  $('clock').textContent = fmtClock(t);
  $('time').value = Math.round(UI.u * 1000);
  // what is happening now
  const evs = EVENTS.filter(e => t >= e.t0 && t <= e.t1);
  const key = evs.map(e => e.title).join('|');
  if (key !== UI.lastNowKey) {
    UI.lastNowKey = key;
    $('now').innerHTML = evs.length ? evs.slice().reverse().map((e, i) => `<div class="ev${i ? ' old' : ''}"><b>${e.title}</b>${tagHtml(e.tag)}<br>${e.text}</div>`).join('')
      : `<div class="ev old">${L('時間を動かしてみよう。', 'Try moving the time.')}</div>`;
  }
  // organ list: dim the ones that are gone
  const lk = ORGANS.map(o => o.life(t) < 0.1 ? 1 : 0).join('') + (VIEW.sel || '');
  if (lk !== UI.lastListKey) {
    UI.lastListKey = lk;
    document.querySelectorAll('#organList button').forEach(b => {
      const id = b.dataset.id, o = ORGAN_BY_ID[id];
      b.classList.toggle('gone', !!o && o.life(t) < 0.1);
      b.setAttribute('aria-pressed', VIEW.sel === id ? 'true' : 'false');
    });
  }
}

function openCard(id) {
  if (!id || !(id in ORGAN_TEXT)) { closeCard(); return; }
  VIEW.sel = id;
  const T = ORGAN_TEXT[id], cat = organCat(id);
  const c = $('card');
  c.innerHTML = `<button class="close" aria-label="${L('閉じる', 'Close')}">×</button>
    <h3><i style="background:${CATS[cat].col}"></i>${organName(id)}</h3>
    <div class="cat">${CATS[cat].name} ${tagHtml(T.tag)}</div>
    <div class="when">${L('いつ: ', 'When: ')}${T.when}</div>
    <p>${T.text}</p>${T.src ? `<p class="cat">${T.src}</p>` : ''}`;
  c.hidden = false;
  c.querySelector('.close').onclick = closeCard;
  UI.lastListKey = '';
}
function closeCard() { VIEW.sel = null; $('card').hidden = true; UI.lastListKey = ''; }

function buildPanel() {
  // 言語の切り替え（ページを読み直す）と、言語で変わる属性（I18N.md）
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
  document.title = L('さなぎの中で', 'Inside the Pupa');
  for (const [sel, attr, ja, en] of [
    ['#view', 'aria-label', 'タバコスズメガの体を横から見た図。器官をタップすると説明が出る', 'Side view of a tobacco hornworm. Tap an organ for its description'],
    ['#viewCtl', 'aria-label', '見かた', 'View'], ['[data-mode=in]', 'title', '器官を役割の色で見る', 'Color organs by their role'],
    ['[data-mode=cut]', 'title', '縦に割ったとき、人の目にどう見えるか（形は模式図）', 'What you would see if cut lengthwise (shapes are schematic)'], ['[data-mode=out]', 'title', '外から見た姿', 'How it looks from outside'],
    ['#speeds', 'aria-label', '再生の速さ', 'Playback speed'], ['#time', 'aria-label', '時間', 'Time'],
    ['#chart', 'aria-label', 'ホルモンの量の目安とスイッチの遺伝子のグラフ。押すとその時間へ移る', 'Graph of rough hormone levels and switch genes. Tap to jump to that time'],
  ]) document.querySelector(sel).setAttribute(attr, L(ja, en));
  // speeds
  $('speeds').innerHTML = SPEEDS.map(([l, v]) => `<button data-v="${v}" aria-pressed="${v === UI.speed}" aria-label="${L(`速さ ${l}倍`, `speed ×${l}`)}">×${l}</button>`).join('');
  $('speeds').onclick = e => { const b = e.target.closest('button'); if (!b) return; UI.speed = +b.dataset.v; $('speeds').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
  // categories
  $('cats').innerHTML = CAT_ORDER.map(k => `<button data-k="${k}" aria-pressed="true"><i style="background:${CATS[k].col}"></i><span><b>${CATS[k].name}</b><small>${CATS[k].sub}</small></span></button>`).join('');
  $('cats').onclick = e => { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k; VIEW.cats[k] = !VIEW.cats[k]; b.setAttribute('aria-pressed', VIEW.cats[k]); };
  $('labels').onchange = e => { VIEW.labels = e.target.checked; };
  // organ list grouped by category
  const ids = ORGANS.map(o => o.id).concat(['hemo']);
  ids.sort((a, b) => CAT_ORDER.indexOf(organCat(a)) - CAT_ORDER.indexOf(organCat(b)));
  $('organList').innerHTML = ids.map(id => `<button data-id="${id}" aria-pressed="false"><i style="background:${CATS[organCat(id)].col}"></i>${organName(id)}</button>`).join('');
  $('organList').onclick = e => { const b = e.target.closest('button'); if (!b) return; VIEW.sel === b.dataset.id ? closeCard() : openCard(b.dataset.id); };
  $('myths').innerHTML = MYTHS.map(m => `<details><summary>${m.q}</summary><p>${m.a}</p></details>`).join('');
  $('unknowns').innerHTML = UNKNOWNS.map(u => `<li>${u}</li>`).join('');
  // view mode
  const setMode = m => {
    VIEW.mode = m;
    document.querySelectorAll("#viewCtl button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === m));
    $("cutBox").hidden = m !== "cut";
    if (m === "out") closeCard();
  };
  $("viewCtl").onclick = e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.mode); };
  $("cutNotes").innerHTML = Object.values(REAL_NOTE).map(n => `<li>${tagHtml(n.tag)} ${n.text}</li>`).join("");
  // time
  $('play').onclick = togglePlay;
  $('time').oninput = e => { UI.u = e.target.value / 1000; };
  // canvas pointer
  const cv = $('view'), tip = $('hoverTip');
  cv.addEventListener('pointermove', e => {
    if (VIEW.mode === 'out') { tip.hidden = true; return; }
    const r = cv.getBoundingClientRect(), X = e.clientX - r.left, Y = e.clientY - r.top;
    const id = pickAt(LAST, X, Y);
    VIEW.hover = id;
    cv.style.cursor = id ? 'pointer' : 'default';
    if (id && id !== 'outside' && e.pointerType === 'mouse') {
      tip.hidden = false; tip.textContent = organName(id);
      tip.style.left = Math.min(X + 14, r.width - 140) + 'px'; tip.style.top = (Y + 14) + 'px';
      tip.style.borderColor = CATS[organCat(id)].col;
    } else tip.hidden = true;
  });
  cv.addEventListener('pointerleave', () => { tip.hidden = true; });
  cv.addEventListener('click', e => {
    if (VIEW.mode === 'out') return;
    const r = cv.getBoundingClientRect();
    const id = pickAt(LAST, e.clientX - r.left, e.clientY - r.top);
    if (id && id !== 'outside') openCard(id); else closeCard();
  });
  // chart scrubbing
  const ch = $('chart');
  let drag = false;
  const seek = e => { const r = ch.getBoundingClientRect(); UI.u = tToU(chartXToT(ch, e.clientX - r.left)); };
  ch.addEventListener('pointerdown', e => { drag = true; ch.setPointerCapture(e.pointerId); seek(e); });
  ch.addEventListener('pointermove', e => { if (drag) seek(e); });
  ch.addEventListener('pointerup', () => { drag = false; });
  // keys
  window.addEventListener('keydown', e => {
    if (e.target.closest('input, button, summary')) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowRight') UI.u = clamp(UI.u + 0.01, 0, 1);
    if (e.key === 'ArrowLeft') UI.u = clamp(UI.u - 0.01, 0, 1);
    if (e.key === 'Escape') closeCard();
  });
}
function togglePlay() {
  if (!UI.playing && UI.u >= 1) UI.u = 0;
  UI.playing = !UI.playing;
  $('play').textContent = UI.playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', UI.playing ? L('一時停止', 'Pause') : L('再生', 'Play'));
}

let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  try {
    if (UI.playing) {
      UI.u += dt * UI.speed / SWEEP_S;
      if (UI.u >= 1) { UI.u = 1; togglePlay(); }
    }
    render(ts / 1000);
  } catch (e) { window.__mmErr = e; }
  requestAnimationFrame(frame);
}
function render(clock) {
  const t = tNow();
  VIEW.padB = $('timebar').offsetHeight + 26;
  LAST = drawView($('view'), t, clock);
  drawChart($('chart'), t);
  updatePanel(t);
}

buildPanel();
requestAnimationFrame(frame);

window.__mm = {
  UI, VIEW,
  setT(t) { UI.u = tToU(t); render(performance.now() / 1000); return tNow(); },
  t: tNow,
  frame: (n = 1) => { for (let i = 0; i < n; i++) { if (UI.playing) UI.u = Math.min(1, UI.u + UI.speed / 30 / SWEEP_S); render(performance.now() / 1000); } return tNow(); },
  get err() { return window.__mmErr; },
  get S() { return LAST; },
  open: openCard,
};
