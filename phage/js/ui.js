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
  // シークバーを動かしたら、おまかせカメラにもどして、その時刻の見どころの場所・ルーペにする（行ったり来たりしても同じ絵）
  slider.addEventListener('input', () => {
    state.u = slider.value / 1000;
    if (!View.auto) { View.setAuto(true); camTo(currentEvent(state.u)); }
  });
  let sliding = false;
  slider.addEventListener('pointerdown', () => { sliding = true; state.playing = false; markPlay(); });
  window.addEventListener('pointerup', () => { sliding = false; });
  $('play').addEventListener('click', () => { if (state.u >= 1) state.u = 0; state.playing = !state.playing; markPlay(); });
  function markPlay() { $('play').textContent = state.playing ? '⏸' : '▶'; }
  for (const [v, lab] of [[0.25, '×¼'], [0.5, '×½'], [1, '×1'], [2, '×2'], [4, '×4']]) {
    const b = document.createElement('button'); b.textContent = lab; b.dataset.v = v; b.title = `ふつうの${v}倍の速さ`;
    b.addEventListener('click', () => { state.speed = v; markSpeed(); });
    $('speeds').appendChild(b);
  }
  function markSpeed() { $('speeds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === state.speed))); }
  // 見どころが変わった直後は少しゆっくり進める（説明を読み、カメラが追いつくまで）
  let sinceEv = 99;
  function advance(dt) {
    if (!state.playing) return;
    sinceEv += dt;
    const zi = Story.at(state.u).id === 'zoomin';
    const slow = zi ? 1 : 0.3 + 0.7 * Math.min(1, sinceEv / 3.5);
    state.u = Math.min(1, state.u + dt * state.speed * slow / Story.total);
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
  function evLabel(e) { const st = Story.at(e.u + 0.0005); return st.id === 'inside' || st.id === 'spread' ? `${st.min.toFixed(st.id === 'spread' ? 0 : 1)}分` : st.seg.name; }
  function go(u, e) {
    state.u = u; slider.value = Math.round(u * 1000);
    View.setAuto(true);
    const ev = e || currentEvent(u); if (ev) camTo(ev, false);
  }
  function camTo(e, instant) {
    if (!e || !e.cam) return;
    const z = e.zoom ? (typeof e.zoom === 'function' ? e.zoom() : e.zoom) : null;
    let c = typeof e.cam === 'function' ? e.cam() : e.cam;
    if (typeof c === 'number') c = z ? [z[0], z[1], c] : null;
    if (c) View.look(c[0], c[1], c[2], instant);
    View.setLoupe(z, e.title);
  }
  function camOf(e) {
    if (!e || !e.cam) return null;
    const z = e.zoom ? (typeof e.zoom === 'function' ? e.zoom() : e.zoom) : null;
    const c = typeof e.cam === 'function' ? e.cam() : e.cam;
    return typeof c === 'number' ? (z ? [z[0], z[1], c] : null) : c;
  }
  function currentEvent(u) { let cur = null; for (const e of events) if (e.u <= u + 1e-6) cur = e; return cur; }

  // ぎもん: 「その場面へ」
  document.querySelectorAll('.faq button[data-go]').forEach(b => b.addEventListener('click', () => { const e = events.find(q => q.title === b.dataset.go); if (e) go(e.u + 0.0005, e); }));

  // もしも
  for (const [id, lab] of Object.entries(Story.CONDS)) {
    const b = document.createElement('button'); b.textContent = lab; b.dataset.id = id;
    b.addEventListener('click', () => { Story.build(id); buildSegs(); buildEvents(); markConds(); go(0); state.playing = true; markPlay(); });
    $('conds').appendChild(b);
  }
  function markConds() { $('conds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === Story.cond))); }

  // おまかせカメラ・拡大ボタン
  View.onAuto = v => {
    $('camAuto').setAttribute('aria-pressed', String(v)); $('camFree').setAttribute('aria-pressed', String(!v));
    // 自分で動かしたとき、切りかわったことがわかるように光らせる
    if (!v) { const c = $('camMode'); c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); }
  };
  $('camAuto').addEventListener('click', () => { View.setAuto(true); camTo(currentEvent(state.u)); });
  $('camFree').addEventListener('click', () => View.setAuto(false));
  $('zIn').addEventListener('click', () => View.zoomAt(View.W / 2, View.H / 2, 1.8));
  $('zOut').addEventListener('click', () => View.zoomAt(View.W / 2, View.H / 2, 1 / 1.8));
  $('zFit').addEventListener('click', () => { View.setAuto(false); View.fitAll(); });

  // 見た目: わかりやすい（色分け・札あり）／本物に近い（色なし・電子顕微鏡の写真のような調子）
  $('lookBtn').addEventListener('click', () => { View.real = !View.real; document.querySelector('.viewWrap').classList.toggle('real', View.real); $('lookBtn').classList.toggle('on', View.real); $('lookBtn').textContent = View.real ? '見た目: 本物に近い' : '見た目: わかりやすい'; });

  // 毎フレーム: 説明・見どころの印・数
  let lastEv = null, lastCount = '';
  function update(st) {
    $('tlabel').textContent = st.label;
    if (!sliding && Math.abs(slider.value - st.u * 1000) > 0.5) slider.value = Math.round(st.u * 1000);
    const ev = currentEvent(st.u);
    if (ev !== lastEv) {
      lastEv = ev; sinceEv = 0;
      $('nowCard').classList.remove('flash'); void $('nowCard').offsetWidth; $('nowCard').classList.add('flash');
      $('nowCard').innerHTML = ev ? `<b>${ev.title}</b> <span class="kind ${ev.kind}">${KIND[ev.kind]}</span><p>${ev.body}</p>` : '';
      $('events').querySelectorAll('li').forEach((li, i) => li.classList.toggle('cur', events[i] === ev));
      if (View.auto && ev) camTo(ev);
      // 自分で動かせる範囲は、いまの見どころのまわり
      View.setBounds(camOf(ev));
    }
    View.camK = sliding ? 4 : st.id === 'zoomin' ? 2.2 : 1.1;
    const inside = st.id === 'inside' || st.id === 'burst';
    let html = '';
    if (st.id === 'spread') { const cc = Story.colonyCounts(st.min - Story.M.tEnd); html = `<dl class="stat"><dt>ファージ</dt><dd>約${cc.phage.toLocaleString()}個 <small>目安</small></dd><dt>破れた細菌</dt><dd>${cc.burst} ／ ${cc.cells}</dd><dt>とりつかれて中で増えている</dt><dd>${cc.inf}</dd></dl>`; }
    else if (!inside) html = '<p class="small2">細菌の中に入ってから数える。</p>';
    else {
      const c = Story.counts(st.min), n = v => Math.round(v).toLocaleString();
      html = `<dl class="stat"><dt>T4 の DNA</dt><dd>約${n(c.genomes)}本ぶん <small>目安</small></dd><dt>細菌の DNA</dt><dd>${Math.round(Story.hostLeft(st.min) * 100)}% <small>目安</small></dd><dt>頭の殻 gp23</dt><dd>約${n(c.gp23)}個</dd><dt>さや gp18</dt><dd>約${n(c.gp18)}個</dd><dt>組み立て中の頭</dt><dd>${c.building + c.packing}個</dd><dt>完成</dt><dd>${c.done}個</dd></dl>`;
    }
    if (html !== lastCount) { $('counts').innerHTML = html; lastCount = html; }
  }

  function init() { buildSegs(); buildEvents(); markConds(); markSpeed(); markPlay(); }
  return { state, init, update, advance, setTab, go };
})();
