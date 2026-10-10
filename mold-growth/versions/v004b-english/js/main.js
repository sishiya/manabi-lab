// Panel, tools, time bar, records, loop, debug handle (window.__mk).

const $ = id => document.getElementById(id);
const UI = {
  playing: true, speed: 24, acc: 0, tool: 'hand', page: 'sim', pointer: null, down: false, lastUse: null,
  rec: null,            // running record: { habits, changed }
  records: [], toastUntil: 0, err: undefined,
};
const SPEEDS = [[L('1時間', '1 hour'), 1], [L('6時間', '6 hours'), 6], [L('1日', '1 day'), 24], [L('1週', '1 week'), 168]];   // hours per second
const TAG = { sure: L('確か', 'confirmed'), est: L('推定', 'estimate'), art: L('演出', 'for show') };
const tagHtml = k => `<span class="tag ${k}">${TAG[k]}</span>`;
const DOW = LANG === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['月', '火', '水', '木', '金', '土', '日'];
const fmtDay = t => L(`${Math.floor(t / 24) + 1}日目`, `day ${Math.floor(t / 24) + 1}`);
const fmtClock = t => { const d = Math.floor(t / 24) + 1, w = DOW[Math.floor(t / 24) % 7], hh = String(Math.floor(t) % 24).padStart(2, '0'); return L(`${d}日目（${w}） ${hh}:00`, `Day ${d} (${w}) ${hh}:00`); };
function fmtN(v) {
  if (LANG === 'en' && v >= 1e4) return Math.round(v / 1e3).toLocaleString('en') + ',000';
  if (v >= 1e4) return (v / 1e4).toFixed(v >= 1e5 ? 0 : 1) + '万'; if (v >= 100) return Math.round(v / 10) * 10 + ''; return Math.round(v) + '';
}
const optName = (k, v) => HABITS[k].opts.find(o => o[0] === v)[1];


// ---- tools (grouped) ----
function buildTools() {
  const box = $('tools');
  for (const grp of TOOL_GROUPS) {
    const sec = document.createElement('div'); sec.className = 'tgroup g-' + grp.id;
    sec.innerHTML = `<div class="tgname">${grp.name}</div><div class="tbtns" role="group" aria-label="${grp.name}"></div>`;
    for (const t of TOOLS.filter(t => t.g === grp.id)) {
      const b = document.createElement('button'); b.dataset.tool = t.id;
      if (t.col) b.style.setProperty('--tc', t.col);
      b.innerHTML = `<span class="ic" aria-hidden="true">${t.icon}</span><span>${t.name}${t.sub ? `<small>${t.sub}</small>` : ''}</span>`;
      b.addEventListener('click', () => t.once ? useOnce(t.id, b) : setTool(t.id));
      sec.querySelector('.tbtns').appendChild(b);
    }
    box.appendChild(sec);
  }
  $('brush').addEventListener('input', e => { BRUSH.base = +e.target.value; });
  setTool('hand');
}
function setTool(id) {
  UI.tool = id;
  document.querySelectorAll('#tools button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === id ? 'true' : 'false'));
  $('world').style.cursor = id === 'hand' ? (VIEW.zoom > 1.01 ? 'grab' : 'default') : 'crosshair';
}
// tools that work on the whole bathroom at a click
function useOnce(id, btn) {
  if (id === 'smoke') { actionStart('smoke'); useSmoke(); actionEnd(); fxSmoke(); markRecChanged(); }
  btn.classList.add('used'); setTimeout(() => btn.classList.remove('used'), 900);
}
function markRecChanged() { if (UI.rec) UI.rec.changed = true; }

function canvasXY(e) { const r = $('world').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function pointerMm(e) {
  const b = VIEW.box, F = VIEW.frame;
  if (!b) return null;
  const q = canvasXY(e);
  if (q.x < F.x || q.y < F.y || q.x > F.x + F.w || q.y > F.y + F.h) return null;   // outside the picture
  return { x: (q.x - b.x) / b.k, y: (q.y - b.y) / b.k };
}
function inBox(p) { return p && p.x >= 0 && p.y >= 0 && p.x < BOX_W && p.y < BOX_H; }
// the finger gets smaller (in mm) as you zoom in, so it stays about the same size on the screen
function brushMm() { return Math.max(0.25, BRUSH.base / Math.max(1, VIEW.zoom / 1.5)); }
function applyAt(p, amt, fx) {
  if (!inBox(p) || UI.tool === 'hand') return;
  BRUSH.r = brushMm();
  if (UI.tool === 'chlorine') fxBleach(p.x, p.y, BRUSH.r);
  useTool(UI.tool, p.x, p.y, amt);
  if (['chlorine', 'alcohol', 'scrub'].includes(UI.tool)) trailsTool(UI.tool, p.x, p.y);
  if (fx !== false) fxTool(UI.tool, p.x, p.y, BRUSH.r);
  markRecChanged();
}
function syncZoom() {
  $('zoomReset').hidden = VIEW.zoom < 1.01;
  const zx = VIEW.zoom < 10 ? VIEW.zoom.toFixed(1) : Math.round(VIEW.zoom);
  $('zoomReset').textContent = L(`全体を見る（×${zx}）`, `See all (×${zx})`);
  if (UI.tool === 'hand') $('world').style.cursor = VIEW.zoom > 1.01 ? 'grab' : 'default';
}
function zoomCenter(f) { const F = VIEW.frame; if (F) { zoomAt(F.x + F.w / 2, F.y + F.h / 2, f); syncZoom(); } }
// mouse: left = tool (or move with the hand), wheel = zoom, right / middle drag (or Shift + drag) = move.
// touch: one finger = tool (or move with the hand), two = pinch & move
function buildPointer() {
  const cv = $('world'), touches = new Map();
  let pan = null, pinch = null;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const q = canvasXY(e);
    zoomAt(q.x, q.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)));
    syncZoom();
  }, { passive: false });
  const endStroke = () => { if (UI.down) actionEnd(); UI.down = false; UI.lastUse = null; };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, canvasXY(e));
      if (touches.size === 2) {   // second finger: stop painting, start pinch
        endStroke(); pan = null;
        const [a, b] = [...touches.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        return;
      }
    }
    if (e.button === 1 || e.button === 2 || (e.button === 0 && (e.shiftKey || UI.tool === 'hand'))) { pan = canvasXY(e); if (UI.tool === 'hand') cv.style.cursor = 'grabbing'; return; }
    const p = pointerMm(e); UI.pointer = p;
    if (!inBox(p)) return;
    UI.down = true; actionStart(UI.tool);
    applyAt(p, 1); UI.lastUse = p;
  });
  cv.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, canvasXY(e));
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        panBy(mx - pinch.mx, my - pinch.my); zoomAt(mx, my, d / pinch.d);
        pinch = { d, mx, my }; syncZoom();
        return;
      }
    }
    if (pan) { const q = canvasXY(e); panBy(q.x - pan.x, q.y - pan.y); pan = q; return; }
    const p = pointerMm(e); UI.pointer = p;
    if (UI.down && UI.lastUse && inBox(p)) {   // along the stroke, a step every third of the finger
      const dx = p.x - UI.lastUse.x, dy = p.y - UI.lastUse.y, d = Math.hypot(dx, dy), step = Math.min(1, brushMm() * 0.35);
      if (d > step) { const n = Math.ceil(d / step); for (let k = 1; k <= n; k++) applyAt({ x: UI.lastUse.x + dx * k / n, y: UI.lastUse.y + dy * k / n }, 0.35, k % 2 === 0); UI.lastUse = p; }
    }
  });
  const up = e => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    pan = null; endStroke(); syncZoom();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!UI.down) UI.pointer = null; });
  $('zoomReset').addEventListener('click', () => { VIEW.zoom = 1; clampView(); syncZoom(); });
  $('zoomIn').addEventListener('click', () => zoomCenter(1.8));
  $('zoomOut').addEventListener('click', () => zoomCenter(1 / 1.8));
}

// ---- pages (tabs) ----
function showPage(id) {
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'));
  document.querySelectorAll('.page').forEach(p => { p.hidden = p.dataset.page !== id; });
  UI.page = id;
  if (id === 'zukan') zkRender();
  window.scrollTo(0, 0);
}
function buildTabs() {
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => showPage(b.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.go)));
}

// ---- habits ----
function buildHabits() {
  const box = $('habits'); box.innerHTML = '';
  for (const [k, h] of Object.entries(HABITS)) {
    const div = document.createElement('div'); div.className = 'habit';
    div.innerHTML = `<div class="name">${h.label}</div><div class="seg" role="group" aria-label="${h.label}"></div>`;
    for (const [v, name] of h.opts) {
      const b = document.createElement('button'); b.textContent = name; b.dataset.k = k; b.dataset.v = v;
      b.addEventListener('click', () => { W.habits[k] = v; markRecChanged(); syncHabits(); });
      div.querySelector('.seg').appendChild(b);
    }
    box.appendChild(div);
  }
  syncHabits();
}
function syncHabits() { document.querySelectorAll('#habits button').forEach(b => b.setAttribute('aria-pressed', W.habits[b.dataset.k] === b.dataset.v ? 'true' : 'false')); }

// ---- records ----
function startRecord() {
  restart();
  UI.rec = { habits: { ...W.habits }, changed: false };
  UI.playing = true; UI.speed = 168 * 2;
  $('record').disabled = true; $('record').textContent = L('はやおくり中…', 'Fast-forwarding…');
  syncPlay();
}
function finishRecord() {
  const r = UI.rec; UI.rec = null;
  const s = W.stats;
  UI.records.push({ habits: r.habits, changed: r.changed || W.usedTools, germ: s.germDay, vis: s.visDay, area: s.visArea, maxC: s.maxC });
  UI.playing = false; UI.speed = 24; syncSpeeds(); syncPlay();
  $('record').disabled = false; $('record').textContent = RECORD_LABEL;
  showRecords();
}
const RECORD_LABEL = L('8週間をはやおくりして記録', 'Fast-forward 8 weeks and record');
function showRecords() {
  if (!UI.records.length) return;
  const SHORT = LANG === 'en' ? { season: { rainy: 'rainy', mild: 'spring/fall', winter: 'winter' }, fan: { none: 'no fan', h2: 'fan 2h', h24: '24h fan' },
    after: { none: '', squeegee: 'squeegee', wipe: 'wipe' }, clean: { none: '', week: 'weekly scrub' } }
    : { season: { rainy: '梅雨', mild: '春秋', winter: '冬' }, fan: { none: '換気なし', h2: '換気2時間', h24: '24時間換気' },
    after: { none: '', squeegee: '水切り', wipe: 'ふき取り' }, clean: { none: '', week: '週1こする' } };
  const sep = L('・', ', ');
  const h = r => Object.keys(SHORT).map(k => SHORT[k][r.habits[k]]).filter(Boolean).join(sep) + (r.changed ? sep + L('<b>途中で手を加えた</b>', '<b>changed midway</b>') : '');
  $('records').innerHTML = `<table><tr><th>${L('習慣', 'Habits')}</th><th>${L('目に見えた', 'Visible from')}</th><th>${L('8週後', 'After 8 wk')}</th></tr>${UI.records.map((r, i) => `<tr class="${i === UI.records.length - 1 ? 'now' : ''}"><td>${h(r)}</td><td class="v">${r.vis === null ? L('なし', 'never') : L(Math.ceil(r.vis) + '日目', 'day ' + Math.ceil(r.vis))}</td><td class="v">${r.area < 0.5 ? '0' : r.area.toFixed(0)}mm²</td></tr>`).join('')}</table>
    <p class="note">${L('「8週後」は目に見える色のついた面積（この箱庭 60cm² のうち）。どれも同じ空気・同じ胞子の落ち方（乱数を固定）で比べている', '“After 8 wk” is the visible colored area (out of this 60 cm² mold garden). Every run uses the same air and the same falling spores (fixed random numbers), so they can be compared')} ${tagHtml('est')}。</p>`.replace('</span>。</p>', LANG === 'en' ? '</span>.</p>' : '</span>。</p>');
}

// ---- cards ----
function onCard(card) {
  showToast(card);
  $('cardCount').textContent = `${DECK.list.length}/${Object.keys(CARDS).length}`;
  $('cards').innerHTML = DECK.list.map(c => `<details><summary>${c.t}<span class="d">${fmtDay(c.day * 24)}</span></summary><p>${tagHtml(c.tag)} ${c.x}</p></details>`).join('');
}
function showToast(card) {
  if (UI.rec) return;   // no pop-ups while fast-forwarding
  const el = $('toast');
  el.innerHTML = `<b class="t">${card.t}</b>${card.x}`;
  el.classList.add('on'); UI.toastUntil = performance.now() + 7000;
}

// ---- HUD ----
// fungicide on the walls, as a share of full strength, and how soon it halves (from the last 2 days)
function fungNow() { const h = W.hist; return h.length ? h[h.length - 1].fung : 0; }
function fungText() {
  const h = W.hist, now = fungNow();
  if (now < 0.02) return L('なし', 'none');
  const old = h.length > 48 ? h[h.length - 49].fung : null;
  const half = old && old > now ? Math.log(2) / Math.log(old / now) * 2 : null;
  return `${pad(Math.round(now * 100), 3)}%${half && half < 365 ? L(`（約${Math.round(half)}日で半分）`, ` (half in ~${Math.round(half)} days)`) : ''}`;
}
// numbers keep their width (no jumping): right-aligned, padded with figure spaces
const pad = (v, n) => String(v).padStart(n, ' ');
function updateHud() {
  const st = W.stats;
  $('hud').innerHTML = `<div class="big">${fmtClock(W.t)}</div>
    <div class="row"><span>${L('浴室の空気', 'Bathroom air')}</span><b>${pad(Math.round(W.air.T), 2)}℃ ${pad(Math.round(W.air.RH), 3)}%</b></div>
    <div class="row"><span>${L('空気中の胞子', 'Spores in the air')}</span><b>${L(`1m³に約${fmtN(W.air.C)}個`, `about ${fmtN(W.air.C)} per m³`)}</b></div>
    <div class="row"><span>${L('壁で待っている胞子', 'Spores waiting on the wall')}</span><b>${fmtN(W.spores.length)}${L('個', '')}</b></div>
    <div class="row"><span>${L('菌糸の先', 'Hyphal tips')}</span><b>${L(`${st.moving || 0}本のびる・${st.paused || 0}本休み`, `${st.moving || 0} growing, ${st.paused || 0} resting`)}</b></div>
    <div class="row"><span>${L('目に見えるカビ', 'Visible mold')}</span><b style="color:${st.visArea >= 1 ? '#ffb08a' : 'inherit'}">${st.visArea.toFixed(0)}mm²</b></div>
    <div class="row"><span>${L('防カビの効き', 'Anti-mold effect')}</span><b style="color:${fungNow() > 0.1 ? '#ffc890' : 'inherit'}">${fungText()}</b></div>`;
  $('clock').textContent = fmtClock(W.t);
  updateStatus();
}
let statusKey = '';
function updateStatus() {
  const a = ACT.last, key = W.t + '|' + (a ? a.t + a.id + !!a.after : '') + '|' + W.hist.length;
  if (key === statusKey) return;
  statusKey = key;
  const s = status(), act = actionText();
  $('status').className = 'lv-' + s.level;
  $('status').innerHTML = `<div class="st"><i></i>${s.title}</div><div class="line">${s.line || ''}</div>
    ${s.list.length ? `<ul>${s.list.map(([k, t]) => `<li class="${k}">${t}</li>`).join('')}</ul>` : ''}
    ${act ? `<div class="act">${act}</div>` : ''}`;
}

// ---- time bar ----
function syncPlay() { $('play').textContent = UI.playing ? '❚❚' : '▶'; $('play').setAttribute('aria-label', UI.playing ? L('一時停止', 'Pause') : L('再生', 'Play')); }
function syncSpeeds() { document.querySelectorAll('#speeds button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === UI.speed ? 'true' : 'false')); }
function restart() { resetWorld(W.habits, 1); trailsReset(); UI.acc = 0; ACT.last = null; statusKey = ""; }
function buildTimebar() {
  SPEEDS.forEach(([name, v]) => {
    const b = document.createElement('button'); b.textContent = name; b.dataset.v = v; b.title = L(`1秒で${name}`, `${name} per second`);
    b.addEventListener('click', () => { if (UI.rec) return; UI.speed = v; syncSpeeds(); });
    $('speeds').appendChild(b);
  });
  syncSpeeds(); syncPlay();
  $('play').addEventListener('click', () => { UI.playing = !UI.playing; syncPlay(); });
  $('restart').addEventListener('click', () => { if (UI.rec) { UI.rec = null; $('record').disabled = false; $('record').textContent = RECORD_LABEL; UI.speed = 24; syncSpeeds(); } restart(); });
  $('record').addEventListener('click', startRecord);
  document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.mode; VIEW[m] = !VIEW[m];
    b.setAttribute('aria-pressed', VIEW[m] ? 'true' : 'false');
    $('moistLegend').hidden = !VIEW.moist;
  }));
  window.addEventListener('keydown', e => {
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); UI.playing = !UI.playing; syncPlay(); }
  });
}

function buildTexts() {
  const srcHtml = (LANG === 'en' ? [
    'Grant C et al. (1989) Water activity requirements of moulds isolated from domestic dwellings. International Biodeterioration (the lowest humidity at which molds grow)',
    'Sedlbauer K (2001) Prediction of mould fungus formation on the surface of and inside building components (adding up time toward germination; the lower limit around 80%)',
    'Hukka A, Viitanen H (1999) A mathematical model of mould growth on wooden material (rough time until mold becomes visible)',
    'Trinci APJ (1969) A kinetic study of the growth of Aspergillus nidulans and other fungi. J Gen Microbiol 57 (how fast hyphal tips extend)',
    'Germination of Aspergillus spores (swelling 2–5 h, germ tube 6–10 h): Antonie van Leeuwenhoek (2022) and others',
    'Rosso L et al. (1993) the formula for temperature and growth rate (cardinal temperature model)',
    'How fast spores settle: Stokes’ law (3 µm across, about 0.03 cm/s)',
    'WHO (2009) Guidelines for indoor air quality: dampness and mould',
    'Ingredients of mold removers and anti-mold agents and how long they last: product labels (in Japanese)',
  ] : [
    'Grant C ほか (1989) Water activity requirements of moulds isolated from domestic dwellings. International Biodeterioration（育つ最低の湿り気）',
    'Sedlbauer K (2001) Prediction of mould fungus formation on the surface of and inside building components（発芽までの時間を足し合わせる考え方、80%前後の下限）',
    'Hukka A, Viitanen H (1999) A mathematical model of mould growth on wooden material（目に見えるまでの時間の目安）',
    'Trinci APJ (1969) A kinetic study of the growth of Aspergillus nidulans and other fungi. J Gen Microbiol 57（菌糸の先ののびる速さ）',
    'コウジカビの胞子の発芽（ふくらみ 2〜5時間、発芽管 6〜10時間）: Antonie van Leeuwenhoek (2022) ほか',
    'Rosso L ほか (1993) 温度と育つ速さの式（cardinal temperature model）',
    '胞子の落ちる速さ: ストークスの式（直径3µm、約0.03cm/秒）',
    'WHO (2009) Guidelines for indoor air quality: dampness and mould',
    'カビ取り剤・防カビ剤の成分と効き目の期間: 製品の表示',
  ]).map(s => `<li>${s}</li>`).join('');
  document.querySelectorAll('.sources').forEach(u => { u.innerHTML = srcHtml; });
  // 言語の切り替え（ページを読み直す）と、言語で変わる属性（I18N.md）
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
  document.title = L('カビが育つまで', 'How Mold Grows');
  $('record').textContent = RECORD_LABEL;
  for (const [sel, attr, ja, en] of [
    ['#tabs', 'aria-label', 'ページ', 'Pages'], ['#toolbar', 'aria-label', '道具', 'Tools'], ['#brush', 'aria-label', '指の大きさ（mm）', 'Finger size (mm)'],
    ['#world', 'aria-label', '浴室の壁の一部（横10cm）。タイル・目地・ゴムパッキン・浴そうのふち。カビが育つようす', 'Part of a bathroom wall (10 cm wide): tiles, grout, a rubber seal and the bathtub rim, with mold growing'],
    ['#modes', 'aria-label', '見え方', 'View'], ['[data-mode=hidden]', 'title', '落ちた胞子・菌糸の先・防カビ剤も表示', 'Also show fallen spores, hyphal tips and anti-mold agent'],
    ['[data-mode=moist]', 'title', 'カビが育てる湿り気を色で', 'Color where it is damp enough for mold to grow'], ['.zoom', 'aria-label', '拡大', 'Zoom'],
    ['#zoomOut', 'title', '小さく', 'Zoom out'], ['#zoomOut', 'aria-label', '小さく', 'Zoom out'], ['#zoomIn', 'title', '大きく（ホイール・2本指でも）', 'Zoom in (also wheel or two fingers)'], ['#zoomIn', 'aria-label', '大きく', 'Zoom in'],
    ['#zoomReset', 'title', '拡大をもとにもどす', 'Reset zoom'], ['#speeds', 'aria-label', '1秒あたりに進む時間', 'Time per second'],
    ['#restart', 'title', 'カビも汚れもない状態から', 'Start over with no mold and no grime'], ['#record', 'title', 'いまの習慣で最初から8週間をはやおくりして、記録に残す', 'Fast-forward 8 weeks from the start with the current habits and record the result'],
    ['#zkList', 'aria-label', '種類', 'Kinds'],
  ]) document.querySelector(sel).setAttribute(attr, L(ja, en));
}

// ---- loop ----
let last = 0;
function frame(now) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
  tick(dt, now);
  requestAnimationFrame(frame);
}
function tick(dt, now) {
  try {
    if (UI.playing) {
      UI.acc += dt * UI.speed;
      let n = Math.min(Math.floor(UI.acc), UI.rec ? 400 : 200);
      UI.acc -= Math.floor(UI.acc);
      while (n-- > 0) {
        stepHour();
        if (W.habits.clean === 'week' && Math.floor(W.t / 24) % 7 === 6 && Math.floor(W.t) % 24 === 11) trailsClean();
        if (UI.rec && W.t >= RECORD_WEEKS * H_WEEK) { finishRecord(); break; }
      }
    }
    processEvents(onCard);   // also while paused (a tool used now gets its card now)
    zkNoteFound();
    // keep holding the finger: the tool keeps working
    if (UI.down && UI.pointer && ['water', 'dry', 'dirt', 'fungicide', 'spore'].includes(UI.tool)) applyAt(UI.pointer, dt * 2, Math.random() < 0.25);
    VIEW.fast = UI.playing && UI.speed > 48;
    if (UI.page === 'sim') { drawWorld($('world'), now / 1000, dt); drawBrush(); }

    updateHud();
    if (UI.toastUntil && now > UI.toastUntil) { $('toast').classList.remove('on'); UI.toastUntil = 0; }
  } catch (e) { UI.err = e; window.__mkErr = e; console.error(e); }
}
function drawBrush() {
  const p = UI.pointer, b = VIEW.box;
  if (!inBox(p) || !b) return;
  const cv = $('world'), g = cv.getContext('2d'), dpr = Math.min(2, window.devicePixelRatio || 1);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const x = b.x + p.x * b.k, y = b.y + p.y * b.k;
  const t = TOOLS.find(t => t.id === UI.tool);
  if (UI.tool === 'hand' || !t) return;
  g.strokeStyle = t.col; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, brushMm() * b.k, 0, 7); g.stroke();
}

// ---- start ----
window.addEventListener('error', e => { window.__mkErr = e.error || e.message; });
resetWorld(W.habits, 1);
buildTools(); buildPointer(); buildHabits(); buildTimebar(); buildTexts(); buildZukan(); buildTabs();
requestAnimationFrame(frame);

window.__mk = {
  W, UI, VIEW, DECK, FX, stepHour, resetWorld, useTool, useSmoke, restart, showPage, zoomCenter,
  run(hours) { for (let i = 0; i < hours; i++) stepHour(); processEvents(onCard); drawWorld($('world'), performance.now() / 1000, 0); updateHud(); },
  frame(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) tick(dt, performance.now()); },   // when the pane is hidden, rAF stops
  get err() { return UI.err || window.__mkErr; },
};
