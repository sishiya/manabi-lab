// 錯覚の美術館: 入口・展示室・操作パネル・ループ
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
const TAGS = { sure: ['t-sure', '確か'], theory: ['t-theory', '説'], open: ['t-open', '未解明'] };

const UI = { ex: null, st: null, S: 0, cv: null, g: null, t0: 0, dirty: true, raf: 0, noteTimer: 0 };

function freshState(ex) {
  const st = { reveal: false };
  for (const c of ex.controls || []) {
    if (c.type === 'timer') st[c.id] = { t0: null, laps: [] };
    else if (c.type !== 'button') st[c.id] = c.val;
  }
  ex.init && ex.init(st);
  return st;
}
const whoLine = ex => `${esc(ex.who)}　${esc(ex.where)}・${esc(ex.year)}${typeof ex.year === 'number' ? '年' : ''}`;

// ---------- 入口 ----------
function buildHome() {
  const h = [];
  h.push(`<section class="intro">
    <div>
      <h1>目と耳は、<br>こんなにだまされる。</h1>
      <p>同じ長さの線、同じ色のマス、描いていない三角形。世界の研究者が見つけた錯覚を、自分の目で見て、確かめて、しくみを知る美術館です。</p>
      <p>長さや大きさの錯覚は、あなたの目がどれだけだまされたかを測れます。</p>
    </div>
    <div>
      <div class="heroBox"><canvas id="hero" aria-label="カフェウォール錯視。横の線はかたむいて見えるが、すべて平行"></canvas></div>
      <p class="heroCap">横の線は、すべてまっすぐで平行です（カフェウォール錯視）。</p>
    </div>
  </section>`);
  for (const r of ROOMS) {
    const list = EX.filter(e => e.room === r.id);
    h.push(`<section class="roomSec"><h2>${esc(r.name)}<small>${esc(r.en)}</small></h2><p class="roomNote">${esc(r.note)}</p><div class="cards">`);
    for (const e of list) {
      h.push(`<a class="card" href="#${e.id}"><div class="frame"><canvas data-thumb="${e.id}" aria-hidden="true"></canvas></div>
        <div class="lbl"><b>${esc(e.title)}</b><span>${esc(e.where)}・${esc(e.year)}${typeof e.year === 'number' ? '年' : ''}</span></div></a>`);
    }
    if (r.soon) h.push(`<div class="soon">${esc(r.soon)}</div>`);
    h.push(`</div></section>`);
  }
  h.push(`<p class="homeFoot">見え方には個人差があります。学習用に簡単にしていて、目や耳の病気の判断には使えません。くわしくは「このアプリについて」。</p>`);
  $('home').innerHTML = h.join('');
  const dpr = DPR();
  document.querySelectorAll('canvas[data-thumb]').forEach(cv => {
    const ex = exById(cv.dataset.thumb), S = 220;
    cv.width = cv.height = S * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { ex.draw(g, S, 0.4, freshState(ex)); } catch (e) { window.__ilErr = e; console.error(e); }
  });
  drawHero();
}
function drawHero() {
  const cv = $('hero'); if (!cv) return;
  const w = cv.clientWidth || 480, hh = Math.round(w * 9 / 16), dpr = DPR();
  cv.width = w * dpr; cv.height = hh * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ex = exById('cafewall'), st = freshState(ex);
  ex.draw(g, w * 1.0, 0, st);
}

// ---------- 展示室 ----------
function ctrlHTML(c, st) {
  const id = 'c-' + c.id;
  if (c.type === 'range') return `<div class="ctrl"><div class="row"><label for="${id}">${esc(c.label)}</label><span class="val" id="${id}-v">${esc(c.fmt ? c.fmt(st[c.id]) : st[c.id])}</span></div>
    <input type="range" id="${id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${st[c.id]}"></div>`;
  if (c.type === 'toggle') return `<div class="seg"><button type="button" id="${id}" aria-pressed="${!!st[c.id]}">${esc(c.label)}</button></div>`;
  if (c.type === 'choice') return `<div class="ctrl"><div class="row"><span>${esc(c.label)}</span></div><div class="seg" role="group" aria-label="${esc(c.label)}">${
    c.opts.map(([v, l]) => `<button type="button" data-c="${c.id}" data-v="${v}" aria-pressed="${st[c.id] === v}">${esc(l)}</button>`).join('')}</div></div>`;
  if (c.type === 'timer') return `<div class="ctrl"><div class="btns"><button type="button" class="btn main" id="${id}-s">${esc(c.start)}</button><button type="button" class="btn" id="${id}-l" disabled>${esc(c.lap)}</button></div><div class="timer" id="${id}-v">まだ始めていません</div></div>`;
  return '';
}

function buildPanel(ex, st) {
  const i = EX.indexOf(ex), prev = EX[(i - 1 + EX.length) % EX.length], next = EX[(i + 1) % EX.length];
  const room = ROOMS.find(r => r.id === ex.room);
  const h = [];
  h.push(`<div class="plateBig"><div class="eyebrow">${esc(room.name)}</div><h1>${esc(ex.title)}</h1><div class="en">${esc(ex.en)}</div><div class="who">${whoLine(ex)}</div></div>`);
  h.push(`<p class="lead">${esc(ex.lead)}</p>`);
  h.push(`<section><h2>やってみよう</h2><ol class="steps">${ex.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>`);
  if (ex.controls && ex.controls.length) h.push(`<section><h2>条件を変える</h2><div class="ctrls">${ex.controls.map(c => ctrlHTML(c, st)).join('')}</div></section>`);
  if (ex.measure) {
    const m = ex.measure;
    h.push(`<section class="measure"><h2>測ってみる</h2><p>${esc(m.q)}</p>
      <div class="ctrl"><div class="row"><label for="adj">${esc(m.label)}</label></div><input type="range" id="adj" min="${m.min}" max="${m.max}" step="${m.step}" value="${st.adj}"></div>
      <div class="btns"><button type="button" class="btn main" id="mDone">同じに見えた</button><button type="button" class="btn" id="mAgain">もう一回</button></div>
      <div class="result" id="mRes" hidden></div></section>`);
  }
  h.push(`<section class="why"><h2>なぜ？</h2>${ex.why.map(([k, s]) => `<p><b class="tag ${TAGS[k][0]}">${TAGS[k][1]}</b>${esc(s)}</p>`).join('')}</section>`);
  if (ex.facts && ex.facts.length) h.push(`<section class="why"><h2>こぼれ話</h2>${ex.facts.map(s => `<p class="fact">${esc(s)}</p>`).join('')}</section>`);
  h.push(`<nav class="nav2"><a href="#${prev.id}">← 前の展示<b>${esc(prev.title)}</b></a><a href="#${next.id}" style="text-align:right">次の展示 →<b>${esc(next.title)}</b></a></nav>`);
  $('panel').innerHTML = h.join('');
  $('panel').scrollTop = 0;
  wirePanel(ex, st);
}

function wirePanel(ex, st) {
  const dirty = () => { UI.dirty = true; };
  for (const c of ex.controls || []) {
    const id = 'c-' + c.id;
    if (c.type === 'range') {
      $(id).addEventListener('input', e => { st[c.id] = parseFloat(e.target.value); $(id + '-v').textContent = c.fmt ? c.fmt(st[c.id]) : st[c.id]; dirty(); });
    } else if (c.type === 'toggle') {
      $(id).addEventListener('click', e => { st[c.id] = !st[c.id]; e.currentTarget.setAttribute('aria-pressed', st[c.id]); dirty(); });
    } else if (c.type === 'choice') {
      document.querySelectorAll(`[data-c="${c.id}"]`).forEach(b => b.addEventListener('click', () => {
        st[c.id] = b.dataset.v;
        document.querySelectorAll(`[data-c="${c.id}"]`).forEach(o => o.setAttribute('aria-pressed', o === b));
        dirty();
      }));
    } else if (c.type === 'timer') {
      const T = st[c.id];
      $(id + '-s').addEventListener('click', () => { T.t0 = performance.now(); T.laps = []; $(id + '-l').disabled = false; $(id + '-s').textContent = 'やり直す'; });
      $(id + '-l').addEventListener('click', () => { if (T.t0 != null) T.laps.push((performance.now() - T.t0) / 1000); });
    }
  }
  if (ex.measure) {
    const m = ex.measure, adj = $('adj'), res = $('mRes');
    adj.addEventListener('input', () => { st.adj = parseFloat(adj.value); dirty(); });
    $('mDone').addEventListener('click', () => {
      st.reveal = true; dirty();
      const r = m.result(st);
      res.innerHTML = `<div class="big">${esc(r.big)}</div><div>${esc(r.text)}</div><div class="typ">${esc(r.typ)}</div>`;
      res.hidden = false;
    });
    $('mAgain').addEventListener('click', () => {
      m.start(st); st.reveal = false; adj.value = st.adj; res.hidden = true; dirty();
    });
  }
}

function updateTimers() {
  for (const c of UI.ex.controls || []) if (c.type === 'timer') {
    const T = UI.st[c.id], el = $('c-' + c.id + '-v');
    if (!el || T.t0 == null) continue;
    const now = (performance.now() - T.t0) / 1000;
    el.textContent = `見つめて ${now.toFixed(1)} 秒` + (T.laps.length ? `　｜　消えた: ${T.laps.map(v => v.toFixed(1) + '秒').join('、')}` : '');
  }
}

function sizeStage() {
  if (!UI.ex) return;
  const wrap = $('stageWrap'), mobile = window.innerWidth <= 860;
  const pad = mobile ? 32 : 44, frame = 22;
  const top = $('top').offsetHeight;
  const availW = wrap.clientWidth - pad - frame;
  const availH = mobile ? window.innerHeight * 0.62 : window.innerHeight - top - pad - frame;
  const S = Math.max(200, Math.floor(Math.min(availW, availH)));
  const dpr = DPR();
  UI.S = S; UI.cv.style.width = UI.cv.style.height = S + 'px';
  UI.cv.width = UI.cv.height = Math.round(S * dpr);
  UI.g.setTransform(UI.cv.width / S, 0, 0, UI.cv.height / S, 0, 0);
  UI.dirty = true;
}

function openRoom(ex) {
  UI.ex = ex; UI.st = freshState(ex);
  if (ex.measure) ex.measure.start(UI.st);
  UI.t0 = performance.now();
  $('home').hidden = true; $('room').hidden = false;
  document.title = ex.title + ' | 錯覚の美術館';
  $('stageFrame').style.background = ex.bg;
  $('stageNote').hidden = true;
  buildPanel(ex, UI.st);
  sizeStage();
  window.scrollTo(0, 0);
}
function openHome() {
  UI.ex = null;
  $('room').hidden = true; $('home').hidden = false;
  document.title = '錯覚の美術館';
  if (!$('home').innerHTML) buildHome();
}
function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  const ex = id && exById(id);
  ex ? openRoom(ex) : openHome();
}

function frame(now) {
  UI.raf = requestAnimationFrame(frame);
  render(now);
}
function render(now) {
  const ex = UI.ex; if (!ex) return;
  const st = UI.st, t = (now - UI.t0) / 1000;
  const anim = ex.anim ? ex.anim(st) : false;
  if (anim || UI.dirty) {
    UI.dirty = false;
    try { ex.draw(UI.g, UI.S, t, st); } catch (e) { window.__ilErr = e; console.error(e); }
  }
  updateTimers();
}

function init() {
  UI.cv = $('stage'); UI.g = UI.cv.getContext('2d');
  UI.cv.addEventListener('pointerdown', e => {
    if (!UI.ex || !UI.ex.tap) return;
    const r = UI.cv.getBoundingClientRect();
    const msg = UI.ex.tap((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, UI.st, UI.g);
    if (!msg) return;
    const n = $('stageNote'); n.textContent = msg; n.hidden = false;
    clearTimeout(UI.noteTimer); UI.noteTimer = setTimeout(() => { n.hidden = true; }, 4000);
  });
  $('aboutBtn').addEventListener('click', () => $('about').showModal());
  window.addEventListener('hashchange', route);
  // 開いた直後はレイアウトが決まっていないことがあるので、展示室の大きさが変わるたびに測り直す
  if (window.ResizeObserver) new ResizeObserver(() => sizeStage()).observe($('stageWrap'));
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { sizeStage(); if (!UI.ex) drawHero(); }, 80); });
  buildHome();
  route();
  UI.raf = requestAnimationFrame(frame);
  window.__il = {
    EX, UI, route,
    draw() { UI.dirty = true; render(performance.now()); },
    open(id) { location.hash = id; },
  };
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!UI.ex && $('home').innerHTML) buildHome(); });
init();
