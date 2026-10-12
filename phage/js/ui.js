// 画面: タブ、時間のスライダーと再生、見どころ、もしも、いまの説明、細菌の中の数
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);
  const KIND = { sure: L('研究の値', "measured"), est: L('目安', "rough guide"), art: L('模式', "schematic") };
  const state = { u: 0, playing: false, speed: 1, tab: 'view' };
  // ふつう（×1）の速さ。区間の長さ（Story の dur）の2倍の速さで進む（2026-10-12 ユーザーの希望で、前の ×2 をふつうに）
  const BASE = 2;
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
    const b = document.createElement('button'); b.textContent = lab; b.dataset.v = v; b.title = L(`ふつうの${v}倍の速さ`, `${v}× normal speed`);
    b.addEventListener('click', () => { state.speed = v; markSpeed(); });
    $('speeds').appendChild(b);
  }
  function markSpeed() { $('speeds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === state.speed))); }
  // 見どころが変わった直後は少しゆっくり進める（説明を読み、カメラが追いつくまで）
  let sinceEv = 99;
  function advance(dt) {
    if (!state.playing) return;
    sinceEv += dt;
    // はじめの2区間（人のからだから・たくさんの細菌）は、見どころの直後も遅くしない
    const zid = Story.at(state.u).id, zi = zid === 'zoomin' || zid === 'colony';
    const slow = zi ? 1 : 0.3 + 0.7 * Math.min(1, sinceEv / 3.5);
    state.u = Math.min(1, state.u + dt * state.speed * BASE * slow / Story.total);
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
  function evLabel(e) { const st = Story.at(e.u + 0.0005); return st.id === 'inside' || st.id === 'spread' ? L(`${st.min.toFixed(st.id === 'spread' ? 0 : 1)}分`, `${st.min.toFixed(st.id === 'spread' ? 0 : 1)} min`) : st.seg.name; }
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
  document.querySelectorAll('.faq button[data-go]').forEach(b => b.addEventListener('click', () => { const e = events.find(q => q.key === b.dataset.go); if (e) go(e.u + 0.0005, e); }));

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

  // 締めのまとめ（シークバーの最後）。もしもごとに結末がちがう
  const CLOSING = {
    normal: { t: L('こうして、ファージは次々に増えていく', "And so, phages keep multiplying"), p: [
      [L('1つのファージが細菌に入ると、約25分で100〜150個に。出てきたファージがまた近くの細菌にとりつくので、くり返すたびに何十〜百倍になる（ねずみ算）。細菌がたくさんいれば、数回で何万〜何百万にもなりうる。', "When one phage enters a bacterium, it becomes 100-150 in about 25 minutes. The released phages infect nearby bacteria, so each round multiplies them tens to a hundred times. With plenty of bacteria, a few rounds can make tens of thousands to millions."), 'est'],
      [L('とりつかれた細菌は破れて死ぬ。ファージは水の中や腸の中で、細菌がふえすぎないように数をおさえている。', "Infected bacteria burst and die. In water and in the gut, phages keep bacteria from growing too many."), 'sure'],
      [L('でも細菌もやられっぱなしではない。受け手（OmpC など）を変えた細菌は生き残り、ファージの側も変わっていく。このいたちごっこが続くので、腸の中では細菌とファージがずっといっしょにいる。', "But bacteria fight back. Bacteria that change their receptors (such as OmpC) survive, and phages change in turn. Because this arms race goes on, bacteria and phages keep living together in the gut."), 'sure'],
      [L('ファージは人にはうつらない。抗生物質の効かない細菌をファージでやっつける研究（ファージ療法）も進んでいる。T4 などのファージの研究から、遺伝子のしくみがたくさんわかった。', "Phages do not infect people. Research on using phages to kill bacteria that antibiotics cannot (phage therapy) is moving forward. Studies of T4 and other phages taught us a great deal about how genes work."), 'sure'],
    ] },
    lin: null,
    norec: { t: L('受け手がないと、ファージは入れない', "Without receptors, phages cannot get in"), p: [
      [L('ファージがとりつけるのは、脚がつかめる印（受け手）を持つ細菌だけ。OmpC をなくし LPS の糖の鎖も短くなった大腸菌には、T4 はくっつけない。', "Phages can attach only to bacteria with a mark their legs can grab (a receptor). T4 cannot stick to E. coli that lost OmpC and has short LPS sugar chains."), 'sure'],
      [L('こうした変異の細菌は、T4 がいても生き残ってふえる。ファージの側も、別の受け手をつかめるように変わることがある（いたちごっこ）。', "Such mutant bacteria survive and multiply even with T4 around. Phages may change too, so they can grab a different receptor (an arms race)."), 'sure'],
    ] },
    gt: { t: L('目印がないと、設計図が切られる', "Without tags, the blueprint gets cut"), p: [
      [L('大腸菌は、外から入ってきた DNA を切る酵素（制限酵素）で身を守っている。T4 はふつう、DNA にブドウ糖の目印を付けて切られないようにしている。', "E. coli protects itself with enzymes that cut DNA coming from outside (restriction enzymes). T4 normally puts glucose tags on its DNA so it is not cut."), 'sure'],
      [L('目印のない T4 の DNA は入ってすぐに切られ、細菌の中で増えられない。細菌が勝つこともある。', "Untagged T4 DNA is cut right after it enters and cannot multiply in the bacterium. Sometimes the bacterium wins."), 'sure'],
    ] },
  };
  CLOSING.lin = CLOSING.normal;
  function closingHtml() {
    const c = CLOSING[Story.cond]; if (!c) return '';
    return `<h3>${c.t}</h3>` + c.p.map(([t, k]) => `<p>${t} <span class="kind ${k}">${KIND[k]}</span></p>`).join('') +
      L('<div class="cbtn"><button data-act="again">▶ もう一度はじめから</button><button data-act="faq">ぎもんを見る</button></div>', "<div class=\"cbtn\"><button data-act=\"again\">▶ Watch again from the start</button><button data-act=\"faq\">See the questions</button></div>");
  }
  $('closing').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'again') { go(0); state.playing = true; markPlay(); }
    else { const f = document.querySelector(LANG === 'en' ? '.faq[lang=en]' : '.faq[lang=ja]'); if (f) { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); const d = f.querySelector('details'); if (d) d.open = true; } }
  });
  let closingOn = false;
  function updateClosing(st) {
    // 最後の区間の終わり近く（次々にうつるなら END_P から、ほかの結末は最後の3%）
    const last = Story.segs[Story.segs.length - 1];
    const on = st.id === last.id && (st.id === 'spread' ? st.p >= Story.END_P : st.p >= 0.97 || st.u >= 0.999);
    if (on === closingOn) return;
    closingOn = on; const el = $('closing');
    if (on) { el.innerHTML = closingHtml(); el.hidden = false; } else el.hidden = true;
    $('nowCard').style.visibility = on ? 'hidden' : '';
  }

  // 見た目: わかりやすい（色分け・札あり）／本物に近い（色なし・電子顕微鏡の写真のような調子）
  $('lookBtn').addEventListener('click', () => { View.real = !View.real; document.querySelector('.viewWrap').classList.toggle('real', View.real); $('lookBtn').classList.toggle('on', View.real); $('lookBtn').textContent = View.real ? L('見た目: 本物に近い', "Look: realistic") : L('見た目: わかりやすい', "Look: easy to read"); });

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
    View.camK = sliding ? 4 : st.id === 'zoomin' || st.id === 'colony' ? 2.2 : 1.1;
    updateClosing(st);
    const inside = st.id === 'inside' || st.id === 'burst';
    let html = '';
    if (st.id === 'spread') { const cc = Story.colonyCounts(st.min - Story.M.tEnd); html = L(`<dl class="stat"><dt>ファージ</dt><dd>約${cc.phage.toLocaleString()}個 <small>目安</small></dd><dt>破れた細菌</dt><dd>${cc.burst} ／ ${cc.cells}</dd><dt>とりつかれて中で増えている</dt><dd>${cc.inf}</dd></dl>`, `<dl class="stat"><dt>Phages</dt><dd>about ${cc.phage.toLocaleString()} <small>rough guide</small></dd><dt>Burst bacteria</dt><dd>${cc.burst} / ${cc.cells}</dd><dt>Infected, phages multiplying</dt><dd>${cc.inf}</dd></dl>`); }
    else if (!inside) html = L('<p class="small2">細菌の中に入ってから数える。</p>', "<p class=\"small2\">Counting starts once the DNA is inside the bacterium.</p>");
    else {
      const c = Story.counts(st.min), n = v => Math.round(v).toLocaleString();
      html = L(`<dl class="stat"><dt>T4 の DNA</dt><dd>約${n(c.genomes)}本ぶん <small>目安</small></dd><dt>細菌の DNA</dt><dd>${Math.round(Story.hostLeft(st.min) * 100)}% <small>目安</small></dd><dt>頭の殻 gp23</dt><dd>約${n(c.gp23)}個</dd><dt>さや gp18</dt><dd>約${n(c.gp18)}個</dd><dt>組み立て中の頭</dt><dd>${c.building + c.packing}個</dd><dt>完成</dt><dd>${c.done}個</dd></dl>`, `<dl class="stat"><dt>T4 DNA</dt><dd>about ${n(c.genomes)} copies <small>rough guide</small></dd><dt>Bacterial DNA</dt><dd>${Math.round(Story.hostLeft(st.min) * 100)}% <small>rough guide</small></dd><dt>Head shell gp23</dt><dd>about ${n(c.gp23)}</dd><dt>Sheath gp18</dt><dd>about ${n(c.gp18)}</dd><dt>Heads being built</dt><dd>${c.building + c.packing}</dd><dt>Finished</dt><dd>${c.done}</dd></dl>`);
    }
    if (html !== lastCount) { $('counts').innerHTML = html; lastCount = html; }
  }

  // 言語: 切りかえボタンと、HTML の属性（title・aria-label）・ページの題名
  function initLang() {
    $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
    if (LANG !== 'en') return;
    document.title = 'The Virus That Infects Bacteria';
    const at = (id, k, v) => { const e = $(id); if (e) e.setAttribute(k, v); };
    at('cv', 'aria-label', 'The world of one E. coli and a T4 phage. Wheel or pinch to zoom, drag to move, hover for explanations');
    at('zIn', 'title', 'Zoom in'); at('zOut', 'title', 'Zoom out'); at('zFit', 'title', 'Whole bacterium');
    at('lookBtn', 'title', 'Switch between the color-coded picture and a realistic look');
    at('camAuto', 'title', 'The camera follows the story'); at('camFree', 'title', 'Move it yourself with wheel, pinch and drag');
    at('camMode', 'aria-label', 'Camera'); at('play', 'aria-label', 'Play / pause'); at('time', 'aria-label', 'Time'); at('speeds', 'aria-label', 'Playback speed');
    document.querySelector('.zoomBtns').setAttribute('aria-label', 'Zoom');
  }
  function init() {
    initLang(); buildSegs(); buildEvents(); markConds(); markSpeed(); markPlay(); }
  return { state, init, update, advance, setTab, go };
})();
