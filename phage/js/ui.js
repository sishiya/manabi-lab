// 画面: タブ、時間のスライダーと再生、見どころ、もしも、いまの説明、細菌の中の数
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);
  const KIND = { sure: '研究の値', est: '目安', art: '模式' };
  const state = { u: 0, playing: false, speed: 1, tab: 'view' };
  let events = [];

  // タブ
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  function setTab(t) {
    state.tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    document.querySelectorAll('.page').forEach(p => p.hidden = p.dataset.page !== t);
    if (t === 'view') requestAnimationFrame(() => View.resize());
  }

  // 時間
  const slider = $('time');
  slider.addEventListener('input', () => { state.u = slider.value / 1000; });
  let sliding = false;
  slider.addEventListener('pointerdown', () => { sliding = true; state.playing = false; markPlay(); });
  window.addEventListener('pointerup', () => { sliding = false; });
  $('play').addEventListener('click', () => { if (state.u >= 1) state.u = 0; state.playing = !state.playing; markPlay(); });
  function markPlay() { $('play').textContent = state.playing ? '⏸' : '▶'; }
  for (const [v, lab] of [[0.5, 'ゆっくり'], [1, 'ふつう'], [2, 'はやい']]) {
    const b = document.createElement('button'); b.textContent = lab; b.dataset.v = v;
    b.addEventListener('click', () => { state.speed = v; markSpeed(); });
    $('speeds').appendChild(b);
  }
  function markSpeed() { $('speeds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === state.speed))); }
  function advance(dt) {
    if (!state.playing) return;
    state.u = Math.min(1, state.u + dt * state.speed / Story.total);
    if (state.u >= 1) { state.playing = false; markPlay(); }
    slider.value = Math.round(state.u * 1000);
  }

  // 区間の帯（スライダーの上）
  function buildSegs() {
    const box = $('segs'); box.innerHTML = '';
    for (const s of Story.segs) {
      const d = document.createElement('div'); d.className = 'seg seg-' + s.id; d.style.flex = String(s.u1 - s.u0);
      d.textContent = s.name; d.title = s.name;
      d.addEventListener('click', () => go(s.u0 + 0.0001));
      box.appendChild(d);
    }
  }

  // 見どころ
  function buildEvents() {
    events = Story.events();
    const ol = $('events'); ol.innerHTML = '';
    events.forEach(e => {
      const li = document.createElement('li');
      li.innerHTML = `<button><span class="eu mono">${evLabel(e)}</span><b>${e.title}</b></button>`;
      li.querySelector('button').addEventListener('click', () => { go(e.u + 0.0005, e); });
      ol.appendChild(li);
    });
  }
  function evLabel(e) { const st = Story.at(e.u + 0.0005); return st.id === 'inside' ? `${st.min.toFixed(1)}分` : st.seg.name; }
  function go(u, e) {
    state.u = u; slider.value = Math.round(u * 1000);
    View.setAuto(true);
    const ev = e || currentEvent(u); if (ev) camTo(ev, false);
  }
  function camTo(e, instant) { if (!e || !e.cam) return; const c = typeof e.cam === 'function' ? e.cam() : e.cam; View.look(c[0], c[1], c[2], instant); }
  function currentEvent(u) { let cur = null; for (const e of events) if (e.u <= u + 1e-6) cur = e; return cur; }

  // もしも
  for (const [id, lab] of Object.entries(Story.CONDS)) {
    const b = document.createElement('button'); b.textContent = lab; b.dataset.id = id;
    b.addEventListener('click', () => { Story.build(id); buildSegs(); buildEvents(); markConds(); go(0); state.playing = true; markPlay(); });
    $('conds').appendChild(b);
  }
  function markConds() { $('conds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === Story.cond))); }

  // おまかせカメラ・拡大ボタン
  View.onAuto = v => $('zAuto').classList.toggle('on', v);
  $('zAuto').addEventListener('click', () => { View.setAuto(!View.auto); if (View.auto) camTo(currentEvent(state.u)); });
  $('zIn').addEventListener('click', () => View.zoomAt(View.W / 2, View.H / 2, 1.8));
  $('zOut').addEventListener('click', () => View.zoomAt(View.W / 2, View.H / 2, 1 / 1.8));
  $('zFit').addEventListener('click', () => { View.setAuto(false); View.fitAll(); });

  // 毎フレーム: 説明・見どころの印・数
  let lastEv = null, lastCount = '';
  function update(st) {
    $('tlabel').textContent = st.label;
    if (!sliding && Math.abs(slider.value - st.u * 1000) > 0.5) slider.value = Math.round(st.u * 1000);
    const ev = currentEvent(st.u);
    if (ev !== lastEv) {
      lastEv = ev;
      $('nowCard').innerHTML = ev ? `<b>${ev.title}</b> <span class="kind ${ev.kind}">${KIND[ev.kind]}</span><p>${ev.body}</p>` : '';
      $('events').querySelectorAll('li').forEach((li, i) => li.classList.toggle('cur', events[i] === ev));
      if (View.auto && ev) camTo(ev);
    }
    const inside = st.id === 'inside' || st.id === 'burst';
    let html = '';
    if (!inside) html = '<p class="small2">細菌の中に入ってから数える。</p>';
    else {
      const c = Story.counts(st.min), n = v => Math.round(v).toLocaleString();
      html = `<dl class="stat"><dt>T4 の DNA</dt><dd>約${n(c.genomes)}本ぶん <small>目安</small></dd><dt>細菌の DNA</dt><dd>${Math.round(Story.hostLeft(st.min) * 100)}% <small>目安</small></dd><dt>頭の殻 gp23</dt><dd>約${n(c.gp23)}個</dd><dt>さや gp18</dt><dd>約${n(c.gp18)}個</dd><dt>組み立て中の頭</dt><dd>${c.building + c.packing}個</dd><dt>完成</dt><dd>${c.done}個</dd></dl>`;
    }
    if (html !== lastCount) { $('counts').innerHTML = html; lastCount = html; }
  }

  function init() { buildSegs(); buildEvents(); markConds(); markSpeed(); markPlay(); }
  return { state, init, update, advance, setTab, go };
})();
