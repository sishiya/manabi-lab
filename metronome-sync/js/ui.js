// メトロノームがそろうまで — 操作（ボタン・つぎへの案内・板をおさえる・つつく・カチの音）
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  // 操作の行: [ラベル, opt のキー, [[表示, 値]...], 変えたらはじめからか, 説明]
  const ROWS = [
    ['速さ', 'speed', [['×1', 1], ['×4', 4], ['×16', 16], ['×64', 64]], false, '×16 より速いと音は鳴りません'],
    ['台数', 'n', [['2台', 2], ['3台', 3], ['5台', 5], ['10台', 10]], true],
    ['はじめ方', 'start', [['逆向き', 'anti'], ['ばらばら', 'rand'], ['そろえて', 'same']], true],
    ['ばらつき', 'spread', [['なし', 0], ['0.1%', 0.001], ['1%', 0.01], ['3%', 0.03]], false, 'いちばん速い台とおそい台の速さのちがい'],
    ['板', 'addMass', [['ふつう 58 g', 0], ['+2 kg', 2]], false],
    ['床', 'damp', [['ふつう', 0], ['ぬれた床', 30]], false, 'ぬれた床: 缶が転がりにくく、板の動きにブレーキ（大きさは推定）'],
    ['押し方', 'esc', [['論文の式', 'vdp'], ['まん中で押す', 'kick']], false, 'ぜんまいが振り子を押す形（くわしくは「このアプリについて」）'],
  ];
  const TOUR = [
    { o: { n: 2, start: 'anti', spread: 0.001, addMass: 0, damp: 0, esc: 'vdp' }, pin: false, speed: 1,
      t: '空き缶2本の上の軽い板に、メトロノームを2台。わざと逆向きに動かし始めます。しばらく見ていてください（30秒ほど）。' },
    { o: { start: 'anti' }, pin: true, speed: 1,
      t: 'こんどは板を手でおさえて、同じように始めます。板が動かないと、2台はおたがいを感じられず、そろいません。' },
    { o: { start: 'anti', addMass: 2 }, pin: false, speed: 4,
      t: '板に 2 kg のおもりをのせました（論文の実験と同じ）。板のゆれが小さくなり、そろうのに時間がかかります（速さ ×4）。' },
    { o: { start: 'anti', addMass: 0, damp: 30, spread: 0 }, pin: false, speed: 16,
      t: 'ぬれた床では缶が転がりにくく、板の動きにブレーキがかかります。1 と同じく逆向きから始めると、こんどは逆向きに近いところにとどまります（速さ ×16。「そろえて」始めると同じ向きのまま。どちらもありえます）。' },
    { o: { n: 5, start: 'rand', spread: 0.01, damp: 0 }, pin: false, speed: 1,
      t: '5台をばらばらに。速さが少しずつちがうメトロノームでも、1つのリズムに集まります。右上の円の点が1か所に集まっていきます。' },
    { o: { n: 10, start: 'rand', spread: 0.01 }, pin: false, speed: 1,
      t: '10台。メトロノームをさわると振り子をつつけます。そろったあとにつついても、またもどってきます。下のボタンで条件を変えてみてください。' },
  ];
  let tourI = 0, holdOn = false, sound = false, ac = null;

  function build() {
    const box = $('controls');
    let html = '<div class="row"><span class="lab">再生</span><button id="play">⏸ 止める</button><button id="restart">はじめから</button><button id="snd">🔇 音</button></div>';
    ROWS.forEach(([lab, key, opts, , note], r) => {
      html += `<div class="row"><span class="lab">${lab}</span>` + opts.map(([s], k) => `<button data-r="${r}" data-k="${k}">${s}</button>`).join('') + (note ? `<span class="note">${note}</span>` : '') + '</div>';
    });
    box.innerHTML = html;
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-r]'); if (!b) return;
      const [, key, opts, restart] = ROWS[+b.dataset.r], v = opts[+b.dataset.k][1];
      set(key, v, restart);
    });
    $('play').onclick = () => { SIM.S.playing = !SIM.S.playing; sync(); };
    $('restart').onclick = () => { SIM.reset(); sync(); };
    $('snd').onclick = () => { sound = !sound; if (sound) audio(); sync(); };
    $('next').onclick = () => { tourI = (tourI + 1) % TOUR.length; tour(); };
    $('hold').onclick = () => { holdOn = !holdOn; SIM.S.sys.pinned = holdOn; if (holdOn) { SIM.S.sys.y[1] = 0; } sync(); };
    SIM.S.onTick = tick;
    tour();
  }
  function set(key, v, restart) {
    if (key === 'speed') SIM.S.speed = v;
    else if (restart) SIM.reset({ [key]: v });
    else SIM.setLive({ [key]: v });
    sync();
  }
  function tour() {
    const st = TOUR[tourI];
    holdOn = st.pin;
    SIM.reset(st.o); SIM.S.sys.pinned = holdOn; SIM.S.speed = st.speed; SIM.S.playing = true;
    $('tourNum').textContent = `${tourI + 1}/${TOUR.length}`;
    $('tourText').textContent = st.t;
    $('next').textContent = tourI === TOUR.length - 1 ? 'はじめから' : 'つぎへ';
    sync();
  }
  // ボタンの見た目をいまの設定に合わせる
  function sync() {
    const p = SIM.S.opt;
    document.querySelectorAll('#controls button[data-r]').forEach(b => {
      const [, key, opts] = ROWS[+b.dataset.r], v = opts[+b.dataset.k][1];
      b.classList.toggle('on', (key === 'speed' ? SIM.S.speed : p[key]) === v);
    });
    $('play').textContent = SIM.S.playing ? '⏸ 止める' : '▶ 動かす';
    $('snd').textContent = sound ? '🔊 音' : '🔇 音';
    $('snd').classList.toggle('on', sound);
    $('hold').classList.toggle('on', holdOn);
    $('hold').textContent = holdOn ? '板をはなす' : '板をおさえる';
  }
  // カチの音（台ごとに少しちがう高さ）
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tick(i) {
    if (!sound || !ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), gn = ac.createGain();
    o.type = 'square'; o.frequency.value = 1800 + 90 * i;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.12 / Math.sqrt(SIM.S.sys.n), t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(gn).connect(ac.destination); o.start(t); o.stop(t + 0.04);
  }
  return { build, sync, tour: () => tourI, TOUR };
})();
