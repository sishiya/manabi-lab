// 画面の操作と、毎フレームの更新。デバッグ用の窓口は window.__ph（例外は window.__phErr）
'use strict';
const $ = id => document.getElementById(id);
const S = { plan: null, checks: null, t: -1, playing: false, speed: 1, lastNow: 0, prevT: -1, extra: [] };
const OPT = { notes: true, keyLabels: true, noteNums: true, fingerNums: false, targets: false, ghost: false, bones: false, xray: false, muscles: false };

// 音（v028〜: 音色を選べる。鍵を押した瞬間に鳴らす）。外の音の素材は読まず、ブラウザの中で合成する
let AC = null, MASTER = null, NOISE = null;
// 音量のつまみ（0〜1。聞こえ方に合わせて2乗）
const VOL = () => { const v = +($("vol") ? $("vol").value : 70) / 100; return v * v * 1.6; };
let VOICE = 'piano';
const VOICES = {
  // ピアノ: 弦の物理をもとにした合成（数値はどれも目安）。倍音は弦の硬さで整数倍から少しずれ（f_k = k·f0·√(1+B·k²)、B は中音で 1e-4 前後・
  // 高音ほど大きい、Fletcher 1964）、高い倍音ほど早く消え、ハンマーが弦の 1/8 ほどの所を打つので 8 倍音あたりが弱く、1 音を 2〜3 本の弦で
  // 鳴らすので少しずれてうなる。強く弾くほど明るい。ハンマーの打つ音（短い雑音）。いちばん高い音域（ファ6 から上）はダンパーがなく、離しても鳴る
  piano(m, f0, now, L, v, amp, out) {
    const B = Math.min(2e-3, Math.max(5e-5, 7e-5 * Math.pow(2, (m - 48) / 18)));
    const tau0 = 0.6 + Math.max(0, 108 - m) / 60 * 2.0; // 低い音ほど長くのびる
    const N = Math.max(3, Math.min(10, Math.floor(9000 / f0))), bright = 2.0 - 0.9 * v;
    const amps = []; for (let k = 1; k <= N; k++) amps.push(Math.abs(Math.sin(Math.PI * k * 0.12)) / Math.pow(k, bright));
    const tot = amps.reduce((a, b) => a + b, 0), undamped = m >= 89;
    // 止める時刻: ダンパーのない高い音は十分に小さくなってから（音量が残ったまま止めると「プツッ」と鳴った）
    const end = undamped ? now + Math.min(8, tau0 * 5) : now + L + 0.6;
    amps.forEach((a, i) => {
      const k = i + 1, fk = f0 * k * Math.sqrt(1 + B * k * k), tau = tau0 / (1 + 0.35 * (k - 1));
      const g = AC.createGain(); g.connect(out);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(Math.max(1e-4, amp * a / tot * 1.4), now + 0.006); // 立ち上がり 6ms（4ms では打つたびにカチッと聞こえた）
      g.gain.setTargetAtTime(0, now + 0.006, tau);
      if (!undamped) g.gain.setTargetAtTime(0, now + L, 0.05 + 0.08 * Math.max(0, (60 - m) / 36)); // ダンパー（低い音ほど少しゆっくり止まる）
      else g.gain.setTargetAtTime(0, end - 0.3, 0.05); // 止める前に消す
      for (const c of k <= 3 ? [-0.7, 0.7] : [0]) { // 2本の弦のずれ（セント）でうなり
        const o = AC.createOscillator(), og = AC.createGain(); o.frequency.value = fk * Math.pow(2, c / 1200); og.gain.value = k <= 3 ? 0.5 : 1;
        o.connect(og); og.connect(g); o.start(now); o.stop(end);
      }
    });
    if (!NOISE) { NOISE = AC.createBuffer(1, Math.round(AC.sampleRate * 0.05), AC.sampleRate); const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    // ハンマーの打つ音: 低い帯域だけを小さく（前は 1.2〜5kHz の雑音が音の 10〜13% の大きさで、毎回カチッと聞こえた）
    const ns = AC.createBufferSource(), bp = AC.createBiquadFilter(), ng = AC.createGain();
    ns.buffer = NOISE; bp.type = 'lowpass'; bp.frequency.value = Math.min(2500, 3 * f0 + 400); bp.Q.value = 0.5;
    ng.gain.setValueAtTime(0.0001, now); ng.gain.exponentialRampToValueAtTime(Math.max(1e-4, amp * 0.12 * v), now + 0.002); ng.gain.setTargetAtTime(0, now + 0.002, 0.008);
    ns.connect(bp); bp.connect(ng); ng.connect(out); ns.start(now); ns.stop(now + 0.05);
  },
  // エレクトリックピアノ: FM 合成（金属の棒をたたいた音。打った瞬間ほど倍音が多く、すぐやわらかくなる）
  epiano(m, f0, now, L, v, amp, out) {
    const tau = 0.8 + Math.max(0, 100 - m) / 50 * 1.6, end = now + L + 0.5;
    const g = AC.createGain(); g.connect(out);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(amp * 0.66, now + 0.005); // 大きさはピアノの mf にそろえる
    g.gain.setTargetAtTime(0, now + 0.01, tau); g.gain.setTargetAtTime(0, now + L, 0.12);
    const car = AC.createOscillator(), mod = AC.createOscillator(), mg = AC.createGain();
    car.frequency.value = f0; mod.frequency.value = f0;
    mg.gain.setValueAtTime(f0 * (0.6 + 2.4 * v), now); mg.gain.setTargetAtTime(f0 * 0.15, now, 0.25);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g);
    const bell = AC.createOscillator(), bg = AC.createGain(); bell.frequency.value = f0 * 7.1; // 打った瞬間の金属の高い音
    bg.gain.setValueAtTime(amp * 0.12 * v, now); bg.gain.setTargetAtTime(0, now, 0.05); bell.connect(bg); bg.connect(out);
    for (const o of [car, mod, bell]) { o.start(now); o.stop(end); }
  },
  // 電子オルガン: ドローバーのように足音（16'・8'・4'・2⅔'・2'）を重ね、押している間は弱まらない。強さで音量は変わらない。ゆっくりしたビブラート
  organ(m, f0, now, L, v, amp, out) {
    const end = now + L + 0.2, g = AC.createGain(); g.connect(out);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.14, now + 0.012);
    g.gain.setValueAtTime(0.14, now + L); g.gain.setTargetAtTime(0, now + L, 0.04);
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 6; lg.gain.value = f0 * 0.003; lfo.connect(lg);
    [[0.5, 0.5], [1, 1], [2, 0.6], [3, 0.35], [4, 0.3]].forEach(([r, a]) => {
      const o = AC.createOscillator(), og = AC.createGain(); o.frequency.value = f0 * r; og.gain.value = a / 2.75;
      lg.connect(o.frequency); o.connect(og); og.connect(g); o.start(now); o.stop(end);
    });
    lfo.start(now); lfo.stop(end);
  },
  // チェンバロ: 弦をはじく音（明るいのこぎり波を、はじいた直後ほど高い音まで通す）。強さで音量はほとんど変わらない。離すとダンパーの布で止まる
  harpsi(m, f0, now, L, v, amp, out) {
    const tau = 0.5 + Math.max(0, 100 - m) / 50 * 1.2, end = now + L + 0.3;
    const g = AC.createGain(); g.connect(out);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now + 0.002);
    g.gain.setTargetAtTime(0, now + 0.004, tau); g.gain.setTargetAtTime(0, now + L, 0.03);
    const o = AC.createOscillator(), lp = AC.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f0;
    lp.type = 'lowpass'; lp.Q.value = 0.7; lp.frequency.setValueAtTime(Math.min(16000, f0 * 18), now); lp.frequency.setTargetAtTime(Math.min(8000, f0 * 5), now, 0.15);
    o.connect(lp); lp.connect(g); o.start(now); o.stop(end);
  },
};
// len は音が止まるまでの秒（鍵を離すか、ペダルを上げるまで）。vel は強さ（MIDI の velocity、なければ mf = 80）
function playTone(m, len, vel) {
  if (!$('chkSound').checked) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const f0 = 440 * Math.pow(2, (m - 69) / 12), now = AC.currentTime;
    const L = Math.max(0.08, Math.min(len || 1, 8)), v = Math.min(1, Math.max(0.05, (vel || VEL_MF) / 127));
    if (!MASTER) { MASTER = AC.createGain(); MASTER.connect(AC.destination); } // 全体の音量（つまみ）
    MASTER.gain.value = VOL();
    const amp = 0.14 * Math.pow((vel || VEL_MF) / VEL_MF, 1.5); // mf のときに前と同じくらいの大きさ
    (VOICES[VOICE] || VOICES.piano)(m, f0, now, L, v, amp, MASTER);
  } catch (e) { /* 音が出せなくても続ける */ }
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
function tStart() { return -0.8; }
function tEnd() { return S.plan.end + 0.8; }

function loadSong(id) {
  const song = SONGS.find(s => s.id === id) || S.extra.find(s => s.id === id) || SONGS[0];
  setSong(song);
}
function setSong(song) {
  S.song = song;
  // 運指を「コンピュータの推定」にすると、楽譜の運指はお手本（ref）にして、推定とくらべる（一般的な運指のときは buildPlan が楽譜の指に固定）
  if (!FG_STD && song.notes) song = Object.assign({}, song, { notes: song.notes.map(n => Object.assign({}, n, { given: 0, ref: n.given || n.ref })) });
  S.plan = buildPlan(song);
  const nx = S.plan.notes.filter(n => n.hand === 'X').length;
  S.checks = runChecks(S.plan);
  // 届かずに押せなかった音。やわらかい手にしていなければ、やわらかい手ならいくつになるかも計算して伝える
  S.miss = S.plan.notes.filter(n => n.miss);
  S.missFlex = null;
  if (S.miss.length && !FLEX) { applyFlex(true); S.missFlex = buildPlan(song).notes.filter(n => n.miss).length; applyFlex(false); }
  renderMiss();
  setViewPlan(S.plan);
  const hs = S.plan.hands.map(h => HAND_NAME(h.side) + ' ' + h.notes.length + L('音', ' notes')).join(L('・', ', '));
  $('songWhy').textContent = (song.why ? L('確かめたいこと: ', 'What it tests: ') + song.why + L('（', ' (') : L('（', '(')) + hs + (song.bpm ? L('・', ', ') + song.bpm + ' bpm' : '') + L('）', ')') + (song.note ? ' ' + song.note : '') + (nx ? L('（手で弾かない音 ' + nx + '・灰色）', ' (' + nx + ' notes not played by hand, in gray)') : '');
  renderFgNow(song);
  $('fgCost').textContent = S.plan.cost.toFixed(1);
  $('fgList').innerHTML = S.plan.hands.map(h => '<p class="fg-hand">' + HAND_NAME(h.side) + '</p>' + h.notes.map(n =>
    `<span data-t="${n.t0}" style="border-color:#${FCOL[n.f].toString(16)}">${noteName(n.m)}<b>${n.f}</b>${n.alt ? L('<i>変</i>', '<i title="changed for this hand size">C</i>') : n.std || !FG_STD ? '' : L('<i>推</i>', '<i title="chosen by the computer">E</i>')}</span>`).join('')).join('');
  const fm = fingeringMatch(S.plan);
  const alt = S.plan.notes.filter(n => n.alt);
  const difList = ns => ns.slice(0, 12).map(n => '<span class="dif" data-t="' + n.t0 + '">' + noteName(n.m) + ' ' + n.f + '→' + n.ref + '</span>').join(' ') + (ns.length > 12 ? L(' ほか ', ' and ') + (ns.length - 12) + L('', ' more') : '');
  $('fgRef').innerHTML = !fm.length ? L('この曲には一般的な運指のデータがないので、コンピュータの推定で弾いています。', "This piece has no standard fingering data, so it is played with the computer's estimate.")
    : FG_STD ? L('一般的な運指で弾いています。', 'Playing with the standard fingering.') + (alt.length
      ? L('<br>この手の大きさでは届かないので、コンピュータが選び直した音（いまの指 → 一般的な運指）: ', '<br>Notes the computer re-chose because this hand cannot reach (now → standard): ') + difList(alt) + L('<br><small>ノーツの上の赤い丸「いま/一般的」が選び直した音です（推定）。</small>', '<br><small>A red circle "now/standard" on a note marks a re-chosen note (an estimate).</small>')
      : '') + L('<br><small>一覧の「推」は運指が書かれていない音（コンピュータが選んだ指）、「変」は選び直した音。</small>', '<br><small>In the list, "E" marks notes with no printed finger (chosen by the computer), "C" re-chosen notes.</small>')
    : L('一般的な運指とくらべると: ', 'Compared with the standard fingering: ') + fm.map(r => HAND_NAME(r.side) + ' <b>' + r.same + '/' + r.total + '</b>' + L(' 一致', ' match') +
      (r.diff.length ? L('<br>ちがう所（推定 → 一般的）: ', '<br>Differences (estimate → standard): ') + difList(r.diff) : '')).join('<br>') +
      L('<br><small>ノーツの上の赤い丸「推定/一般的」がちがう音です。</small>', '<br><small>A red circle "estimate/standard" on a note marks a difference.</small>');
  renderChecks();
  setTime(tStart());
}

// いまの運指の選び方と出どころ（曲の欄の下）
function renderFgNow(song) {
  const has = !!(song.refR || song.refL || (song.notes || []).some(n => n.given || n.ref));
  const src = song.fsrc || (song.notes ? L('楽譜ファイルに書かれた指', 'the fingers written in the score file') : '');
  $('fgNow').innerHTML = !has ? L('運指: <b>コンピュータの推定</b>（この曲には一般的な運指のデータがありません' + (song.notes ? '' : '。このアプリで作った曲') + '）', "Fingering: <b>the computer's estimate</b> (no standard fingering data for this piece" + (song.notes ? '' : '; a piece made for this app') + ')')
    : FG_STD ? L('運指: <b>一般的な運指</b>（出どころ: ' + src + '）', 'Fingering: <b>standard</b> (source: ' + src + ')') +
      (S.plan.notes.some(n => n.hand !== 'X' && !n.std && !n.alt) ? L('。書かれていない音はコンピュータが選んでいます', '. Notes with no printed finger are chosen by the computer') : '')
      : L('運指: <b>コンピュータの推定</b>（くらべる相手: ' + src + '）', "Fingering: <b>the computer's estimate</b> (compared with: " + src + ')');
}

// 答え合わせをまとめて: 一般的な運指のある曲ぜんぶで、コンピュータの推定の運指がどれだけ同じか（いつか 100% に）
function runValidation() {
  let tot = 0, ok = 0;
  const rows = SONGS.filter(s => s.refR || s.refL).map(s => {
    const r = fingeringOnlyMatch(s);
    return '<tr><td>' + s.name + '</td>' + [1, -1].map(side => {
      const m = r.find(x => x.side === side);
      if (!m) return '<td>—</td>';
      tot += m.total; ok += m.same;
      const p = m.same / m.total;
      return '<td class="' + (p === 1 ? 'ok' : p >= 0.7 ? 'warn' : 'ng') + '">' + m.same + '/' + m.total + '</td>';
    }).join('') + '</tr>';
  });
  $('valOut').innerHTML = L('<p class="cap">コンピュータの推定のうち、ぜんぶで <b>' + ok + '/' + tot + '</b>（' + Math.round(100 * ok / tot) + '%）が一般的な運指と同じ（いまの手の大きさで）。</p>', "<p class=\"cap\">Of the computer's estimate, <b>" + ok + '/' + tot + '</b> (' + Math.round(100 * ok / tot) + '%) in total match the standard fingering (for the current hand size).</p>') + '<table class="val"><tr><th>' + L('曲', 'Piece') + '</th><th>' + L('右手', 'Right') + '</th><th>' + L('左手', 'Left') + '</th></tr>' + rows.join('') + '</table>';
}

function showHandInfo() {
  const mid = fingerFK(FINGERS[3], 0, 0, 0)[3];
  const sp = (handSpan() / 10).toFixed(1), ln = ((-mid[2] + PAD) / 10).toFixed(1);
  $('handInfo').innerHTML = L('親指〜小指をいっぱいに開いた幅 <b>約 ' + sp + 'cm</b>・手首〜中指の先 約 ' + ln +
    'cm（ピアニストの平均は男性 22.6cm・女性 20.1cm、Boyle ほか 2015）。運指を選ぶときの指の開きの目安（大人の手の表）は、この手の幅に合わせて ×' + SPAN_K.toFixed(2) + ' にしています（目安）。一般的な運指で届かない所は、コンピュータが選び直します。',
    'Full spread from thumb to little finger <b>about ' + sp + ' cm</b>, wrist to middle fingertip about ' + ln +
    ' cm (pianists average 22.6 cm for men and 20.1 cm for women, Boyle et al. 2015). The finger-spread limits used to choose fingering (a table for adult hands) are scaled ×' + SPAN_K.toFixed(2) + ' to this hand (a rough guide). Where the standard fingering cannot be reached, the computer re-chooses.');
}

// 楽譜ファイル
// 曲の選択の分け方と並び（最初の曲を起動時に開く）
const SONG_GROUPS = [
  ['曲', 'Pieces', ['elise2', 'chords2', 'twinkle', 'ode', 'elise']],
  ['基本の動き（音階・アルペジオ・和音）', 'Basics (scales, arpeggios, chords)', ['scale', 'scale2', 'dmaj', 'arp', 'chords']],
  ['超絶技巧', 'Virtuoso', ['chopin', 'bravura']],
];
const SAMPLES = [
  { file: 'elise-opening.mid', name: L('エリーゼのために 冒頭（MIDI・両手のトラック）', 'Für Elise, opening (MIDI, a track per hand)') },
  { file: 'c-major-scale-fingered.musicxml', name: L('ハ長調の音階（MusicXML・両手・運指つき）', 'C major scale (MusicXML, both hands, with fingering)') },
  { file: 'ode-to-joy-with-chords.mid', name: L('歓喜の歌＋左手の和音（MIDI・トラック1つ）', 'Ode to Joy + left-hand chords (MIDI, one track)') },
];
async function openFile(file) {
  setPlaying(false);
  try { addSong(await songFromFile(file)); }
  catch (e) { alert(L('読めませんでした: ', 'Could not read it: ') + e.message); }
}
async function loadSample(fn) {
  try {
    const r = await fetch('samples/' + fn);
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    addSong(await songFromFile(new File([blob], fn)), 'sample:' + fn);
  } catch (e) { alert(L('サンプルを読めませんでした（ファイルとして開いたときは、サーバー経由で開いてください）: ', 'Could not read the sample (if you opened this page as a file, open it through a server): ') + e.message); }
}
function addSong(song, value) {
  if (!song.notes.some(n => n.hand === 'R' || n.hand === 'L')) throw new Error(L('弾ける音がありません', 'No playable notes'));
  if (!value) {
    S.extra = S.extra.filter(s => s.id !== song.id); S.extra.push(song);
    let og = $('song').querySelector('optgroup[data-files]');
    if (!og) { og = document.createElement('optgroup'); og.label = L('開いたファイル', 'Opened files'); og.dataset.files = '1'; $('song').appendChild(og); }
    if (![...og.children].some(o => o.value === song.id)) { const o = document.createElement('option'); o.value = song.id; o.textContent = song.name; og.appendChild(o); }
    $('song').value = song.id;
  }
  setSong(song);
}

function renderMiss() {
  const M = S.miss || [];
  if (!M.length) { $('missOut').innerHTML = '<p class="miss ok">' + L('ぜんぶの音を押せました（届かない音なし）。', 'Every note could be pressed (none out of reach).') + '</p>'; return; }
  const byHand = S.plan.hands.map(h => [h.side, M.filter(n => h.notes.includes(n)).length]).filter(x => x[1]);
  const chips = M.slice(0, 10).map(n => '<span class="dif" data-t="' + n.t0 + '">' + noteName(n.m) + ' ' + FINGERS[n.f].name + ' ' + n.short.toFixed(1) + 'mm</span>').join(' ') + (M.length > 10 ? L(' ほか ', ' and ') + (M.length - 10) + L('', ' more') : '');
  let advice;
  if (!FLEX) advice = S.missFlex === 0
    ? L('→ 「関節をやわらかく」（ストレッチした手の目安）にすると、ぜんぶ届きます。', '→ With "Flexible joints" (a rough guide for a stretched hand), every note can be reached.')
    : L('→ 「関節をやわらかく」（ストレッチした手の目安）にしても ' + S.missFlex + ' 音は届きません。この手とこの運指では、この曲は弾くのがむずかしい結果です（運指を大きく変えるか、もっと大きい手が必要そうです）。', '→ Even with "Flexible joints" (a rough guide for a stretched hand), ' + S.missFlex + ' notes stay out of reach. With this hand and this fingering, the piece is hard to play (it may need very different fingering or a bigger hand).');
  else advice = L('→ 関節をやわらかくしても届きません。この手とこの運指では、この曲は弾くのがむずかしい結果です（運指を大きく変えるか、もっと大きい手が必要そうです）。', '→ Still out of reach with flexible joints. With this hand and this fingering, the piece is hard to play (it may need very different fingering or a bigger hand).');
  $('missOut').innerHTML = '<p class="miss">' + L('届かずに押せなかった音 <b>' + M.length + '</b>（', '<b>' + M.length + '</b> notes could not be pressed, out of reach (') + byHand.map(([s, c]) => HAND_NAME(s) + ' ' + c).join(L('・', ', ')) + L('）', ')') + '<br>' + chips + '</p><p class="miss adv">' + advice + '</p>';
}

function fmt(c, r) {
  const v = r.v;
  return c.unit === '%' ? v.toFixed(1) : v >= 100 ? Math.round(v) : v.toFixed(1);
}
function renderChecks() {
  const R = S.checks, mark = { ok: '◯', warn: '△', ng: '✕' };
  let worst = 'ok';
  $('chkTable').innerHTML = CHECKS.map(c => {
    const r = R[c.id];
    if (r.grade === 'ng' || (r.grade === 'warn' && worst === 'ok')) worst = r.grade;
    const where = r.at !== null && r.grade !== 'ok' ? `<small>${r.at.toFixed(2)} ${L('秒', 's')}${r.who ? L('・', ', ') + r.who : ''}</small>` : '';
    return `<tr data-id="${c.id}" title="${c.tip}"><td class="g ${r.grade}">${mark[r.grade]}</td><td class="n">${c.name}${where}</td><td class="v">${fmt(c, r)} ${c.unit}</td></tr>`;
  }).join('');
  const sum = { ok: [L('破綻なし', 'No breakdowns'), 'ok'], warn: [L('ぎりぎりの所あり', 'Some close calls'), 'warn'], ng: [L('破綻あり', 'Breakdowns found'), 'ng'] }[worst];
  $('chkSum').textContent = sum[0]; $('chkSum').className = 'ro-tag ' + sum[1];
}

function setTime(t) {
  S.t = Math.min(tEnd(), Math.max(tStart(), t));
  S.prevT = S.t;
}

function frame(now) {
  try {
    const dt = Math.min(0.1, (now - (S.lastNow || now)) / 1000);
    S.lastNow = now;
    if (S.playing) {
      S.t += dt * S.speed;
      if (S.t >= tEnd()) { S.t = tEnd(); setPlaying(false); }
    }
    step();
  } catch (e) { window.__phErr = e; console.error(e); }
  requestAnimationFrame(frame);
}

function step() {
  const plan = S.plan, t = S.t;
  if (S.playing) for (const n of plan.notes) if (n.t0 > S.prevT && n.t0 <= t && !n.miss) playTone(n.m, ((n.ts || n.t1) - n.t0) / S.speed, n.vel);
  const pd = (plan.pedal || []).some(([a, c]) => t >= a && t < c);
  if (pd !== S.pedalOn) { S.pedalOn = pd; $('pedalInd').classList.toggle('on', pd); }
  $('pedalInd').hidden = !(plan.pedal && plan.pedal.length);
  S.prevT = t;
  const poses = plan.hands.map(h => poseAt(h, t));
  resizeView();
  CAM.follow = $('optFollow').checked;
  updateCam(poses);
  renderPose(plan, poses, OPT);
  // 表示
  const span = tEnd() - tStart();
  if (document.activeElement !== $('time')) $('time').value = Math.round(1000 * (t - tStart()) / span);
  $('clock').textContent = t.toFixed(2) + L(' 秒', ' s');
  document.querySelectorAll('#fgList span').forEach(el => { const t0 = +el.dataset.t; el.classList.toggle('now', t0 <= t + 0.001 && t0 > t - 0.25); });
  const lims = [], far = [], msgs = [];
  poses.forEach((pose, hi) => {
    const hn = HAND_OF(plan.hands[hi].side);
    for (let f = 1; f <= 5; f++) {
      const fp = pose.fingers[f];
      if (fp.down && fp.lim) lims.push(hn + FINGERS[f].name);
      if (fp.down && fp.err > 2) far.push(hn + FINGERS[f].name + ' ' + fp.err.toFixed(1) + 'mm');
    }
    const cl = clashOf(pose);
    if (cl.pen > 2) msgs.push(L('めりこみ: ', 'Overlap: ') + '<b>' + hn + cl.who + ' ' + cl.pen.toFixed(1) + 'mm</b>');
  });
  if (far.length) msgs.unshift(L('届かない: ', "Can't reach: ") + '<b>' + far.join(L('、', ', ')) + '</b>');
  if (lims.length) msgs.push(L('関節の限界: ', 'Joint limit: ') + '<b>' + lims.join(L('、', ', ')) + '</b>');
  // 再生中は「この瞬間」の知らせを出さない（一瞬で切りかわって読めず、行数が変わって画面ががたついた）。止めたとき・1コマずつのときに出す
  $('hint').innerHTML = msgs.length && !S.playing ? L('この瞬間 — ', 'Right now — ') + msgs.join(L(' ／ ', ' / ')) : L('ドラッグで向きを変え、ホイールや2本指のピンチで寄れます（一人称では体を前後に）。時刻のつまみ・矢印キーで1コマずつ、[ ] キーで速さを変えられます。', "Drag to turn the view, use the wheel or a two-finger pinch to zoom (in POV, the pianist's view, it leans you forward and back). Step frame by frame with the time slider or arrow keys, and change the speed with the [ and ] keys.");
}

function setPlaying(on) {
  S.playing = on;
  $('btnPlay').textContent = on ? L('⏸ 止める', '⏸ Pause') : L('▶ 再生', '▶ Play');
  if (on && S.t >= tEnd() - 0.01) setTime(tStart());
  if (on && AC && AC.state === 'suspended') AC.resume();
}

function initUI() {
  // 言語・題名・読み上げ用の名前（I18N.md）
  document.title = L('ピアノを弾く手', 'Hands at the Piano');
  $('langsw').querySelectorAll('button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.l === LANG); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
  $('view').setAttribute('aria-label', L('鍵盤と、弾いている両手の3D。ドラッグで向きを変え、ホイールや2本指のピンチで寄れます', 'A 3D keyboard and two hands playing. Drag to turn the view, use the wheel or a two-finger pinch to zoom'));
  $('views').setAttribute('aria-label', L('見る向き', 'View'));
  $('pedalInd').title = L('音をのばすペダル（ダンパーペダル）を踏んでいる間は光る', 'Lights up while the sustain (damper) pedal is down');
  $('speedSel').setAttribute('aria-label', L('速さ', 'Speed')); $('speedSel').title = L('速さ（キーの [ と ] でも変えられます）', 'Speed (you can also use the [ and ] keys)');
  $('time').setAttribute('aria-label', L('時刻', 'Time'));
  $('vol').setAttribute('aria-label', L('音量', 'Volume')); $('vol').title = L('音量', 'Volume');
  [['song', '曲', 'Piece'], ['sceneSel', 'シーン', 'Scene'], ['handModel', '手のモデル', 'Hand model']].forEach(([id, ja, en]) => $(id).setAttribute('aria-label', L(ja, en)));
  setPlaying(false);
  const opt = s => `<option value="${s.id}">${s.name}</option>`;
  // 曲の分け方（v028〜、ユーザーの希望で整理）。ここにない曲は「そのほか」へ
  const seen = new Set(), group = (ja, en, list) => { list.forEach(s => seen.add(s.id)); return list.length ? '<optgroup label="' + L(ja, en) + '">' + list.map(opt).join('') + '</optgroup>' : ''; };
  const pick = ids => ids.map(id => SONGS.find(s => s.id === id)).filter(Boolean);
  $('song').innerHTML = SONG_GROUPS.map(([ja, en, ids]) => group(ja, en, pick(ids))).join('') +
    group('教本の運指との答え合わせ（ハノン）', 'Check against textbook fingering (Hanon)', SONGS.filter(s => s.val && !seen.has(s.id))) +
    group('そのほか', 'Others', SONGS.filter(s => !seen.has(s.id))) +
    '<optgroup label="' + L('サンプルの楽譜ファイル（samples/）', 'Sample score files (samples/)') + '">' + SAMPLES.map(s => `<option value="sample:${s.file}">${s.name}</option>`).join('') + '</optgroup>';
  $('song').addEventListener('change', e => { setPlaying(false); const v = e.target.value; busy(L('運指と手の動きを計算しています…', 'Working out fingering and hand motion…'), () => v.startsWith('sample:') ? loadSample(v.slice(7)) : loadSong(v)); });
  $('sceneSel').innerHTML = Object.entries(SCENES).map(([k, s]) => `<option value="${k}">${s.name}</option>`).join('');
  $('sceneSel').value = V.sceneId;
  $('sceneSel').addEventListener('change', e => applyScene(e.target.value));
  // エフェクト（v034〜、ユーザーの希望: なしとはなやかだけでよいので、選択をやめてチェックボックスに）
  $('optFx').checked = V.fxLevel > 0;
  $('optFx').addEventListener('change', e => applyFx(e.target.checked ? 1 : 0));
  // 音色（v028〜）
  $('voiceSel').innerHTML = [['piano', L('音色: ピアノ', 'Sound: piano')], ['epiano', L('音色: エレクトリックピアノ', 'Sound: electric piano')], ['organ', L('音色: 電子オルガン', 'Sound: electronic organ')], ['harpsi', L('音色: チェンバロ', 'Sound: harpsichord')]].map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('voiceSel').value = VOICE; $('voiceSel').setAttribute('aria-label', L('音色', 'Sound'));
  $('voiceSel').addEventListener('change', e => { VOICE = e.target.value; playTone(60, 0.6); });
  $('handModel').innerHTML = Object.entries(HAND_MODELS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
  $('handModel').value = HAND.id;
  $('handModel').addEventListener('change', e => { setPlaying(false); busy(L('手を作りなおしています…', 'Rebuilding the hands…'), () => { setHandModel(e.target.value); rebuildSkins(); showHandInfo(); if (S.song) setSong(S.song); }); });
  showHandInfo();
  $('fileIn').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) busy(L('楽譜を読んで計算しています…', 'Reading the score and calculating…'), () => openFile(f)); });
  $('vol').addEventListener('input', () => { if (MASTER) MASTER.gain.value = VOL(); });
  $('strokeSel').innerHTML = [['wrist', L('打鍵: 和音・オクターブは手首で', 'Strike: chords and octaves from the wrist')], ['finger', L('打鍵: ぜんぶ指だけで', 'Strike: fingers only')], ['arm', L('打鍵: 腕ごと大きく（肘から上げて落とす）', 'Strike: with the whole arm (lift from the elbow and drop)')]].map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('strokeSel').value = STROKE; $('strokeSel').setAttribute('aria-label', L('打鍵のしかた', 'How keys are struck'));
  // 指の構え（v026〜）
  $('postureSel').innerHTML = [['curved', L('指の構え: 立てる', 'Finger posture: curved')], ['mid', L('指の構え: 中間', 'Finger posture: in between')], ['flat', L('指の構え: 寝かせる', 'Finger posture: flat')]].map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('postureSel').value = POSTURE; $('postureSel').setAttribute('aria-label', L('指の構え', 'Finger posture'));
  $('postureSel').addEventListener('change', e => { setPlaying(false); POSTURE = e.target.value; if (S.song) busy(L('運指と手の動きを計算しています…', 'Working out fingering and hand motion…'), () => setSong(S.song)); });
  $('strokeSel').addEventListener('change', e => { setPlaying(false); STROKE = e.target.value; if (S.song) busy(L('運指と手の動きを計算しています…', 'Working out fingering and hand motion…'), () => setSong(S.song)); });
  $('optFlex').addEventListener('change', e => { applyFlex(e.target.checked); if (S.song) busy(L('運指と手の動きを計算しています…', 'Working out fingering and hand motion…'), () => setSong(S.song)); });
  $('missOut').addEventListener('click', e => { const s = e.target.closest('[data-t]'); if (s) { setPlaying(false); setTime(+s.dataset.t); } });
  // 運指の選び方（v043〜）: 一般的な運指（最初）／コンピュータの推定
  $('fgMode').innerHTML = [['std', L('運指: 一般的な運指', 'Fingering: standard')], ['est', L('運指: コンピュータの推定', "Fingering: computer's estimate")]].map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('fgMode').value = FG_STD ? 'std' : 'est'; $('fgMode').setAttribute('aria-label', L('運指', 'Fingering'));
  $('fgMode').addEventListener('change', e => { setPlaying(false); FG_STD = e.target.value === 'std'; if (S.song) busy(L('運指と手の動きを計算しています…', 'Working out fingering and hand motion…'), () => setSong(S.song)); });
  const fr = $('frame');
  fr.addEventListener('dragover', e => { e.preventDefault(); fr.classList.add('drop'); });
  fr.addEventListener('dragleave', () => fr.classList.remove('drop'));
  fr.addEventListener('drop', e => { e.preventDefault(); fr.classList.remove('drop'); const f = e.dataTransfer.files[0]; if (f) busy(L('楽譜を読んで計算しています…', 'Reading the score and calculating…'), () => openFile(f)); });
  $('btnPlay').addEventListener('click', () => setPlaying(!S.playing));
  $('time').addEventListener('input', e => setTime(tStart() + (tEnd() - tStart()) * e.target.value / 1000));
  // 速さ: 選択欄と、キーの [ ] で1段ずつ
  $('speedSel').innerHTML = SPEEDS.map(v => '<option value="' + v + '"' + (v === 1 ? ' selected' : '') + '>' + L('速さ ×', 'Speed ×') + v + '</option>').join('');
  $('speedSel').addEventListener('change', e => { S.speed = +e.target.value; });
  document.querySelectorAll('#views button').forEach(b => b.addEventListener('click', () => {
    setCam(b.dataset.v);
    document.querySelectorAll('#views button').forEach(x => x.setAttribute('aria-pressed', x === b));
  }));
  // 手の見え方（v024 で7つのチェックボックスを、見え方の選択1つと印の表示3つに整理。ユーザーの希望）
  const LOOKS = [['skin', L('手: 皮ふ', 'Hands: skin'), {}], ['ghost', L('手: 半透明', 'Hands: see-through'), { ghost: true }],
    ['xray', L('手: 皮ふを透かして骨', 'Hands: bones through the skin'), { xray: true }], ['xraymus', L('手: 皮ふを透かして骨と筋肉', 'Hands: bones and muscles through the skin'), { xray: true, muscles: true }],
    ['muscles', L('手: 骨と筋肉・腱・脂肪', 'Hands: bones, muscles, tendons and fat'), { muscles: true }], ['bones', L('手: 骨だけ（骸骨が弾く）', 'Hands: skeleton only (a skeleton plays)'), { bones: true }]];
  $('handLook').innerHTML = LOOKS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('handLook').setAttribute('aria-label', L('手の見え方', 'How the hands look'));
  $('handLook').addEventListener('change', e => {
    const f = LOOKS.find(l => l[0] === e.target.value)[2];
    for (const k of ['ghost', 'xray', 'muscles', 'bones']) OPT[k] = !!f[k];
    $('lookLegend').hidden = !f.muscles;
  });
  const opts = { optNotes: 'notes', optNoteNums: 'noteNums', optKeyLabels: 'keyLabels', optFingerNums: 'fingerNums', optTargets: 'targets' };
  for (const id in opts) { OPT[opts[id]] = $(id).checked; $(id).addEventListener('change', e => { OPT[opts[id]] = e.target.checked; }); }
  // v029〜v033 にあった「見せ方のねらい」（ノーツで確かめる・ゲーム風・リアル）は v034 でやめた（ユーザーの希望）。項目を1つずつ選ぶ
  $('chkTable').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const r = S.checks[tr.dataset.id];
    if (r.at !== null) { setPlaying(false); setTime(r.at); }
  });
  $('fgRef').addEventListener('click', e => { const d = e.target.closest('.dif'); if (d) { setPlaying(false); setTime(+d.dataset.t - 0.05); } });
  $('btnVal').addEventListener('click', runValidation);
  $('fgList').addEventListener('click', e => {
    const sp = e.target.closest('span'); if (!sp) return;
    setPlaying(false); setTime(+sp.dataset.t - 0.05);
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!S.playing); }
    if (e.code === 'ArrowRight') setTime(S.t + 1 / 30);
    if (e.code === 'ArrowLeft') setTime(S.t - 1 / 30);
    if (e.key === '[' || e.key === ']') { const i = SPEEDS.indexOf(S.speed), j = Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === ']' ? 1 : -1))); S.speed = SPEEDS[j]; $('speedSel').value = String(S.speed); }
  });
}

window.__ph = {
  S, OPT, poseAt: (t, hi) => poseAt(S.plan.hands[hi || 0], t), setTime, loadSong, setSong,
  simRun(sec) { setTime(S.t + sec); step(); return S.t; },
  // 見た目の確認用: 決まった時刻のコマを並べた一覧を画面の上に出す（クリックで消える）
  sheet(id, times, cam, cols) {
    if (id) loadSong(id);
    if (cam) setCam(cam);
    const cv = V.r.domElement, cw = cv.width / 2, ch = cv.height / 2;
    cols = cols || 2;
    const out = document.createElement('canvas'); out.width = cw * cols; out.height = ch * Math.ceil(times.length / cols);
    const g = out.getContext('2d');
    times.forEach((t, i) => {
      setTime(t); step();
      const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
      g.drawImage(cv, x, y, cw, ch); g.fillStyle = '#ff0'; g.font = '20px sans-serif'; g.fillText(t.toFixed(2) + 's', x + 8, y + 24);
    });
    let el = document.getElementById('sheet');
    if (!el) { el = document.createElement('img'); el.id = 'sheet'; el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:99'; el.onclick = () => el.remove(); document.body.appendChild(el); }
    el.src = out.toDataURL('image/jpeg', 0.85);
  },
  checksAll() { // すべての曲の検査の結果
    const out = {};
    for (const s of SONGS) { const p = buildPlan(s), r = runChecks(p); out[s.id] = { cost: +p.cost.toFixed(1), fingers: p.hands.map(h => h.notes.map(n => n.f).join('')).join(' / '), match: fingeringMatch(p).map(m => m.same + '/' + m.total).join(' '), ...Object.fromEntries(CHECKS.map(c => [c.id, +r[c.id].v.toFixed(1) + (r[c.id].at !== null ? '@' + r[c.id].at.toFixed(2) : '')])) }; }
    return out;
  },
};

// 読みこみ中の表示: 重い計算の前に文言を変えて、画面に出てから計算する
// （タブが隠れていると requestAnimationFrame が止まるので、0.1 秒で先へ進む）
const paint = () => new Promise(r => { const t = setTimeout(r, 100); requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); r(); }, 0)); });
async function showLoading(msg) { $('loading').hidden = false; $('loadMsg').textContent = msg; await paint(); }
function hideLoading() { $('loading').hidden = true; }
// 画面の操作から重い計算をするとき（曲・手のモデル・楽譜を変える）は、表示を出してから
async function busy(msg, fn) { await showLoading(msg); try { await fn(); } finally { hideLoading(); } }

async function boot() {
  try {
    await showLoading(L('手の皮ふを作っています…', 'Building the skin of the hands…'));
    initView($('view'));
    initUI();
    setCam('tilt');
    await showLoading(L('運指と手の動きを計算しています…', 'Working out fingering and hand motion…'));
    loadSong(SONG_GROUPS[0][2][0]);
    hideLoading();
    requestAnimationFrame(frame);
  } catch (e) { window.__phErr = e; console.error(e); $('loadMsg').textContent = L('読みこめませんでした: ', 'Could not load: ') + e.message; }
}
boot();
