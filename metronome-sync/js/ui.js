// メトロノームがそろうまで — 操作（ボタン・つぎへの案内・板をおさえる・つつく・カチの音）
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id);
  // 操作の行: [ラベル, opt のキー, [[表示, 値]...], 変えたらはじめからか, 説明]
  const ROWS = [
    [L('速さ', 'Speed'), 'speed', [['×1', 1], ['×4', 4], ['×16', 16], ['×64', 64]], false, L('×16 より速いと音は鳴りません', 'No sound faster than ×16')],
    [L('台数', 'How many'), 'n', [[L('2台', '2'), 2], [L('3台', '3'), 3], [L('5台', '5'), 5], [L('10台', '10'), 10]], true],
    [L('はじめ方', 'Start'), 'start', [[L('逆向き', 'Opposite'), 'anti'], [L('ばらばら', 'Scattered'), 'rand'], [L('そろえて', 'Together'), 'same']], true],
    [L('ばらつき', 'Spread'), 'spread', [[L('なし', 'None'), 0], ['0.1%', 0.001], ['1%', 0.01], ['3%', 0.03]], false, L('いちばん速い台とおそい台の速さのちがい', 'Speed difference between the fastest and the slowest metronome')],
    [L('板', 'Board'), 'addMass', [[L('ふつう 58 g', 'Normal 58 g'), 0], ['+2 kg', 2]], false],
    [L('床', 'Floor'), 'damp', [[L('ふつう', 'Normal'), 0], [L('ぬれた床', 'Wet floor'), 30]], false, L('ぬれた床: 缶が転がりにくく、板の動きにブレーキ（大きさは推定）', 'Wet floor: the cans roll less easily, which brakes the board (the size is an estimate)')],
    [L('押し方', 'Push'), 'esc', [[L('論文の式', 'Paper’s formula'), 'vdp'], [L('まん中で押す', 'Push in the middle'), 'kick']], false, L('ぜんまいが振り子を押す形（くわしくは「このアプリについて」）', 'How the spring pushes the pendulum (see “About this app”)')],
  ];
  const TOUR = [
    { o: { n: 2, start: 'anti', spread: 0.001, addMass: 0, damp: 0, esc: 'vdp' }, pin: false, speed: 1,
      t: L('空き缶にのせた軽い板に、メトロノームを2台。わざと逆向きから始めます（30秒ほど見ていてください）。',
        'Two metronomes on a light board resting on empty cans. We start them swinging opposite ways on purpose (watch for about 30 seconds).') },
    { o: { start: 'anti' }, pin: true, speed: 1,
      t: L('板を手でおさえると、2台はおたがいを感じられず、そろいません。',
        'Hold the board down, and the two cannot feel each other, so they never fall into step.') },
    { o: { start: 'anti', addMass: 2 }, pin: false, speed: 4,
      t: L('板に 2 kg のおもり。板のゆれが小さくなり、そろうのに時間がかかります（速さ ×4）。',
        'A 2 kg weight on the board. The board moves less, so falling into step takes longer (speed ×4).') },
    { o: { start: 'anti', addMass: 0, damp: 30, spread: 0 }, pin: false, speed: 16,
      t: L('ぬれた床では板にブレーキがかかり、逆向きから始めると逆向きに近いままです（速さ ×16。「そろえて」始めるとそろったまま）。',
        'A wet floor brakes the board: started opposite, they stay nearly opposite (speed ×16; started “Together”, they stay together).') },
    { o: { n: 5, start: 'rand', spread: 0.01, damp: 0 }, pin: false, speed: 1,
      t: L('5台をばらばらに。速さが少しちがっても、右上の円の点が1か所に集まっていきます。',
        'Five metronomes, started scattered. Even with slightly different speeds, the dots on the circle at the top right gather in one place.') },
    { o: { n: 10, start: 'rand', spread: 0.01 }, pin: false, speed: 1,
      t: L('10台。メトロノームをさわると振り子をつつけます。つついても、またそろいます。',
        'Ten metronomes. Touch one to poke its pendulum. Even after a poke, it falls back into step.') },
  ];
  let tourI = 0, holdOn = false, sound = false, ac = null;

  function build() {
    const box = $('controls');
    let html = `<div class="row"><span class="lab">${L('再生', 'Play')}</span><button id="play"></button><button id="restart">${L('はじめから', 'Restart')}</button><button id="snd"></button></div>`;
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
    $('next').textContent = tourI === TOUR.length - 1 ? L('はじめから', 'Start over') : L('つぎへ', 'Next');
    sync();
  }
  // ボタンの見た目をいまの設定に合わせる
  function sync() {
    const p = SIM.S.opt;
    document.querySelectorAll('#controls button[data-r]').forEach(b => {
      const [, key, opts] = ROWS[+b.dataset.r], v = opts[+b.dataset.k][1];
      b.classList.toggle('on', (key === 'speed' ? SIM.S.speed : p[key]) === v);
    });
    $('play').textContent = SIM.S.playing ? L('⏸ 止める', '⏸ Pause') : L('▶ 動かす', '▶ Play');
    $('snd').textContent = (sound ? '🔊 ' : '🔇 ') + L('音', 'Sound');
    $('snd').classList.toggle('on', sound);
    $('hold').classList.toggle('on', holdOn);
    $('hold').textContent = holdOn ? L('板をはなす', 'Let go of board') : L('板をおさえる', 'Hold board down');
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
