// エジソンの蓄音機 — 操作（録音・再生・止める・針、つぎへ、筒を手で回す・寄る・説明）
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id), S = () => window.__ph.S;
  const st = { act: null, needle: false, recEnd: 0, recDur: 0, recKind: '', rpm: 60, src: 'mary', dB: 105, vol: 10, plays: 0, drag: null, Z: 1, Zt: 1, cont: 0, contN: 0, bounced: false };
  const omOf = r => r * 2 * Math.PI / 60;
  const send = m => Audio.send(m);

  // ---------- 筒の回り方 ----------
  // 手で筒をつかんでいるあいだは手の動きどおり（逆回し・押さえて止めるもできる）。離すと、録音・再生の途中なら設定の速さへもどり、
  // そうでなければはずみ車で回りつづける。筒とはずみ車には重さがあるので、手の速さに 0.06 秒でおいつく（推定）
  const TAU_GRAB = 0.06, HAND_MAX = 180;
  function crank() {
    if (st.drag) return send({ t: 'crank', hand: true, om: st.drag.om, tau: TAU_GRAB });
    const motor = !!st.act && st.act.kind !== 'orig';
    send({ t: 'crank', hand: motor, om: omOf(st.act && st.act.rpm || st.rpm) });
  }
  function setMode(m) { send({ t: 'mode', m }); S().mode = m; }
  const rest = () => setMode(st.needle ? 'play' : 'up');   // 録音・再生が終わったあとの針

  // ---------- 録音・再生・止める・針（録音と再生は、押すと決まった動きをして、終わったら止まる） ----------
  const REC_SEC = { mary: 14, vowel: 4, whistle: 4, sweep: 10, mic: 6 };   // 録音の長さ（メリーは1曲、上がる音は1回ぶん）
  const micFail = () => alert(L('マイクが使えませんでした（許可がない・マイクがない）。ほかの「入れる音」を選んでください。', 'The microphone could not be used (no permission or no microphone). Please choose another input sound.'));
  async function record(maxSec = REC_SEC[st.src] || 8) {
    if (!await Audio.start()) return;
    if (st.src === 'mic' && !await Audio.useMic(true)) { micFail(); return; }
    if (st.src === 'mic' && Power.away) return;   // 許可を待つあいだに離れた
    stop(true); st.needle = false;
    send({ t: 'src', kind: st.src, restart: true }); send({ t: 'reset' }); send({ t: 'rewind' }); S().seg = null; st.plays = 0; st.recEnd = 0; st.bounced = false;
    setMode('rec');
    return begin({ kind: 'rec', maxSec });
  }
  async function play(rpm) {
    if (!st.recEnd) { flash(L('まだ何も録っていません。先に「● 録音」を。', 'Nothing is recorded yet. Press "● Record" first.')); return; }
    if (!await Audio.start()) return;
    stop(true); st.needle = true;
    send({ t: 'rewind' }); setMode('play'); st.plays++; st.cont = st.contN = 0;
    return begin({ kind: 'play', rpm, end: st.recEnd });
  }
  async function orig() {   // 入れる音をそのまま聴く（蓄音機を通さない）。録音しなくても聴ける。マイクだけは録った声を
    if (st.src === 'mic' && st.recKind !== 'mic') { flash(L('マイクの声は、録音すると聴けます。', 'Record with the microphone first, then you can listen to your voice.')); return; }
    if (!await Audio.start()) return;
    const sec = st.src === 'mic' ? st.recDur : REC_SEC[st.src] || 8;
    stop(true); send({ t: 'orig', on: true, kind: st.src, sec });
    return begin({ kind: 'orig', sec });
  }
  function origEnd() { if (st.act && st.act.kind === 'orig') stop(); }
  async function needle(on) {   // 再生の針を、いつでもおろす・上げる。おろしたまま筒を手で回すと、その速さで鳴る
    await Audio.start();
    if (st.act && st.act.kind === 'rec') return;
    st.needle = on; if (on && !st.act) send({ t: 'rewind' });   // 針は溝のはじめにおろす（止まっている所が録った所の先だと、回しても鳴らない）
    if (!on && st.act && st.act.kind === 'play') return stop();
    if (!st.act || st.act.kind === 'orig') rest();
    sync();
  }
  function begin(act) {
    act.t0 = performance.now(); act.armed = act.kind === 'rec';
    return new Promise(res => { act.done = res; st.act = act; crank(); sync(); });
  }
  function stop(quiet) {
    const a = st.act; if (!a) { if (!quiet) { st.needle = false; rest(); sync(); } return; }
    if (a.kind === 'rec') { st.recEnd = Math.max(0.05, S().x); st.recDur = (performance.now() - a.t0) / 1000; st.recKind = st.src; }
    if (a.kind === 'play') { st.bounced = st.contN > 10 && st.cont / st.contN < 0.85; st.needle = false; }
    if (a.kind === 'orig') send({ t: 'orig', on: false });   // 元の音を途中で止める（worklet にも知らせる）
    st.act = null; if (a.kind !== 'orig') rest(); crank(); sync(); a.done();
  }
  function tick(now) {   // main.js が毎コマよぶ
    banner(now);
    if (st.drag && now - st.drag.t > 40) dragSample(now, st.drag.a);   // 手が止まっていても、止まった所を足して速さを出しなおす（止まれば筒も止まる）
    const a = st.act; if (!a) return;
    if (a.kind === 'rec' && (now - a.t0 > a.maxSec * 1000 || S().atEnd)) stop();
    if (a.kind === 'orig' && now - a.t0 > (a.sec + 2) * 1000) stop();   // 終わりの知らせが来なかったとき
    if (a.kind === 'play') {
      if (!a.armed) { if (S().x < a.end * 0.5 || now - a.t0 > 1500) a.armed = true; return; }   // もどす知らせが届くまで待つ
      if (S().atEnd) stop();
      else if (S().x >= a.end) { if (!a.tailT) a.tailT = now; else if (now - a.tailT > 300) stop(); }   // 録った所の終わりをこえて 0.3 秒なぞってから止める（最後の音を切らない）
    }
  }
  function onSnap(m) { if (st.act && st.act.kind === 'play' && st.act.armed && m.mode === 'play') { st.contN++; if (m.contact) st.cont++; } }
  async function setSrc(k) {
    st.src = k; $('src').value = k;
    if (k !== 'mic') { Audio.useMic(false); } else if (!await Audio.useMic(true)) { micFail(); return setSrc('mary'); }
    send({ t: 'src', kind: k }); sync();
  }
  function sync() {
    const a = st.act;
    $('bRec').classList.toggle('on', !!a && a.kind === 'rec'); $('bPlay').classList.toggle('on', !!a && a.kind === 'play'); $('bOrig').classList.toggle('on', !!a && a.kind === 'orig');
    $('bOrig').disabled = !a && st.src === 'mic' && st.recKind !== 'mic';
    $('bPlay').disabled = !st.recEnd && !a; $('bStop').disabled = !a && !st.needle;
    $('bNeedleT').textContent = st.needle ? L('✋ 針を上げる', '✋ Lift needle') : L('✋ 針をおろす', '✋ Lower needle');
    Draw.grab = st.needle && !a;   // 針がおりていて止まっているあいだは、図に「つかんで回す」の矢印
    $('bNeedle').classList.toggle('on', st.needle); $('bNeedle').disabled = !!a && a.kind === 'rec';
    $('rpmV').textContent = L('毎分 ' + st.rpm + ' 回転', st.rpm + ' rpm'); $('rpmReset').disabled = st.rpm === 60; $('lvlV').textContent = st.dB + ' dB';
    const gv = Math.pow(10, st.vol / 20); $('volV').textContent = '×' + (gv < 10 ? gv.toFixed(1) : Math.round(gv));
  }
  // 図の上のまん中の帯: いま何をしているか・あと何秒・（録音中は）入ってくる音の大きさ
  const bn = $('banner');
  function banner(now) {
    const a = st.act; $('pin').classList.toggle('acting', !!a); if (!a) { bn.hidden = true; return; }
    let txt, frac, cls;
    if (a.kind === 'rec') {
      const el = (now - a.t0) / 1000, left = Math.max(0, a.maxSec - el).toFixed(1); frac = el / a.maxSec; cls = 'rec';
      txt = st.src === 'mic' ? L('● 録音中　マイクに話してください　あと ' + left + ' 秒', '● Recording  Speak into the mic  ' + left + ' s left')
        : L('● 録音中　あと ' + left + ' 秒', '● Recording  ' + left + ' s left');
    } else if (a.kind === 'play') { frac = a.armed ? S().x / a.end : 0; cls = 'play'; txt = L('▶ 再生中（溝から計算した音）　', '▶ Playing (sound computed from the groove)  ') + Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%'; }
    else { const el = (now - a.t0) / 1000; frac = el / Math.max(0.1, a.sec); cls = 'orig'; txt = L('♪ 元の音（蓄音機を通さない音）', '♪ Original sound (not through the phonograph)'); }
    bn.hidden = false; bn.className = cls;
    $('bnText').textContent = txt; $('bnBar').style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
    const lv = $('bnLv');
    if (a.kind === 'rec') {
      const dB = S().pIn > 0 ? 20 * Math.log10(S().pIn / 20e-6) : 0, d = dB > 0 ? dB.toFixed(0) : '—';
      lv.hidden = false; $('bnLvBar').style.width = Math.max(0, Math.min(100, (dB - 80) / 45 * 100)).toFixed(0) + '%';
      $('bnLvTxt').textContent = L('入ってくる音 ' + d + ' dB', 'Input level ' + d + ' dB') + (dB > 110 ? L('（大きすぎ: 再生で針が跳ねます）', ' (too loud: the needle will jump on playback)') : '');
      lv.classList.toggle('over', dB > 110);
    } else lv.hidden = true;
  }
  let flashT = -1e9, flashMsg = '';
  function flash(m) { flashMsg = m; flashT = performance.now(); }
  function status(now) {   // 図の左上の大きい1行
    const a = st.act;
    if (now - flashT < 3000) return '<span class="rec big">' + flashMsg + '</span>';
    if (a) return '';   // 動いているあいだは、図のまん中の帯に出す
    if (st.needle) return '<span class="play big">' + L('針がおりています。筒をつかんで回すと鳴ります', 'The needle is down. Grab the drum and turn it to play') + '</span>';
    if (st.bounced) return '<span class="rec big">' + L('さっきの再生では、針が溝から跳ねていました', 'In the last playback, the needle kept jumping out of the groove') + '</span>';
    return '<span class="big">' + (st.recEnd ? L('止まっています', 'Stopped') : L('まだ何も録っていません', 'Nothing recorded yet')) + '</span>';
  }

  // ---------- 図の上の手（筒をつかんで回す・寄る・説明） ----------
  const cv = $('cv'), tip = $('tip'), ptrs = new Map(); let tipT = 0;
  const TIPS = {
    crank: L('<b>クランク</b>本物はこの取っ手で回します。このアプリでは、筒のどこをつかんでも回せます（逆回しも）。ねじで、1周ごとに筒が 1.06 mm 横へ進みます（1インチに24山）。',
      '<b>Crank</b>The real machine is turned with this handle. In this app you can grab the drum anywhere and turn it (backward too). A screw moves the drum 1.06 mm sideways each turn (24 threads per inch).'),
    dia: L('<b>振動板（雲母、直径 50 mm）</b>ふちを留めたうすい板。声の圧力でふるえます。形は板の曲げの式の5つのモードの和です。',
      '<b>Diaphragm (mica, 50 mm across)</b>A thin disk held at its rim. It shakes with the pressure of the voice. Its shape is the sum of 5 modes of the plate bending equation.'),
    stylus: L('<b>針</b>振動板のまん中についています。録音では箔を押して凹ませ、再生では溝をなぞります。', '<b>Needle</b>Fixed to the middle of the diaphragm. When recording it presses dents into the foil; when playing it traces the groove.'),
    tip: L('<b>針の先（半径 0.15 mm、推定）</b>丸いので、溝の細かい波の底までは入れません。高い音が弱くなり、ひずみます。',
      '<b>Needle tip (radius 0.15 mm, estimate)</b>It is round, so it cannot reach the bottom of very fine waves in the groove. High sounds get weaker and distorted.'),
    groove: L('<b>溝</b>箔が筒のすきまへ凹んだもの。深い・浅いの形が声です。押す力が「その深さを刻む力」をこえた所だけ凹み、戻りません。',
      '<b>Groove</b>The foil pushed down into the gap on the drum. Its deep and shallow shape is the voice. The foil dents only where the push is bigger than the force needed for that depth, and it does not spring back.'),
    mouth: L('<b>マウスピース</b>口をつけて話します。中の空気の圧力が振動板を押します（このアプリはここに音を入れる）。',
      '<b>Mouthpiece</b>You speak with your mouth right on it. The air pressure inside pushes the diaphragm (this app puts the sound in here).'),
    foil: L('<b>すず箔（厚さ 0.035 mm）</b>筒のらせんのすきまの上に巻いてあります。色のついた所が、いまの周で声が刻まれている所。つかんで回せます。',
      '<b>Tin foil (0.035 mm thick)</b>Wrapped over the spiral gap on the drum. The colored part is where sound is recorded on this turn. You can grab it and turn the drum.'),
    drum: L('<b>筒（直径 141 mm）</b>1878年の展示用の機械の大きさ。つかんで回せます。押さえれば止まり、逆にも回ります。毎分60回転なら、箔は1秒に 44 cm 進みます。',
      '<b>Drum (141 mm across)</b>The size of the 1878 exhibition machine. Grab it to turn it; hold it to stop it; it turns backward too. At 60 rpm the foil moves 44 cm each second.'),
  };
  const GRAB = { crank: 1, drum: 1, foil: 1, groove: 1 };
  function showTip(e) {
    const r = cv.getBoundingClientRect(), k = Draw.hit(e.clientX - r.left, e.clientY - r.top);
    cv.style.cursor = GRAB[k] ? 'grab' : k ? 'help' : 'default';
    if (!k) { tip.hidden = true; return; }
    tip.innerHTML = TIPS[k]; tip.hidden = false;
    const x = Math.min(r.width - 280, e.clientX - r.left + 14), y = Math.min(r.height - 120, e.clientY - r.top + 14);
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  // 筒の軸から見た指の向き。軸のすぐ近くは向きが大きく飛ぶので使わない（null）
  function axisAngle(e) { const r = cv.getBoundingClientRect(), X = Draw.wx(e.clientX - r.left), Y = Draw.wy(e.clientY - r.top); return Math.hypot(X, Y) < Draw.R * 0.3 ? null : Math.atan2(Y, X); }
  // 手の速さ: 最近 0.1 秒の指の角度に直線をあてはめた傾き（1コマごとの差だと、イベントの時刻のばらつきで速さがガタガタになり、雑音になる）
  function dragSample(t, a) {
    const d = st.drag; if (a == null) return; if (d.a == null) { d.a = a; return; }
    let da = a - d.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    d.un += da; d.a = a; d.t = t; d.h.push([t / 1000, d.un]);
    while (d.h.length > 2 && t / 1000 - d.h[0][0] > 0.1) d.h.shift();
    const n = d.h.length; let mt = 0, ma = 0; for (const [ti, ai] of d.h) { mt += ti; ma += ai; } mt /= n; ma /= n;
    let num = 0, den = 0; for (const [ti, ai] of d.h) { num += (ti - mt) * (ai - ma); den += (ti - mt) ** 2; }
    const om = den > 1e-9 ? -num / den : 0;   // 筒の回る向き（図で時計まわり）が正、逆回しは負
    d.om = Math.max(-omOf(HAND_MAX), Math.min(omOf(HAND_MAX), om)); crank();
  }
  cv.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { cv.setPointerCapture(e.pointerId); } catch (_) { }
    const r = cv.getBoundingClientRect(), k = Draw.hit(e.clientX - r.left, e.clientY - r.top);
    if (GRAB[k] && ptrs.size === 1) {   // 筒をつかむ（さわった瞬間に止まる。音の準備は待たない）
      const a0 = axisAngle(e), t0 = performance.now(); st.drag = { a: a0, un: 0, t: t0, om: 0, h: [[t0 / 1000, 0]] }; tip.hidden = true; cv.style.cursor = 'grabbing'; Audio.start(); crank();
    } else if (e.pointerType !== 'mouse') { showTip(e); clearTimeout(tipT); tipT = setTimeout(() => { tip.hidden = true; }, 4000); }   // 指でふれた説明は 4 秒で消す
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.size === 2 && ptrs.has(e.pointerId)) {   // 2本指で寄る・引く
      const [a, b] = [...ptrs.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...ptrs.values()], d1 = Math.hypot(c.x - d.x, c.y - d.y);
      if (st.drag) { st.drag = null; crank(); }
      if (d0 > 0) setZoom(st.Zt * d1 / d0, true); return;
    }
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.drag) {   // まとめて届いた細かい動きも全部使う（時刻はイベントのもの）
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const c of evs.length ? evs : [e]) dragSample(c.timeStamp || performance.now(), axisAngle(c));
      return;
    }
    if (e.pointerType === 'mouse') showTip(e);
  });
  const up = e => { ptrs.delete(e.pointerId); if (st.drag && ptrs.size === 0) { st.drag = null; cv.style.cursor = 'grab'; crank(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!st.drag) tip.hidden = true; });
  cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(st.Zt * Math.pow(1.0015, -e.deltaY)); }, { passive: false });
  function setZoom(z, now) { st.Zt = Math.max(1, Math.min(1500, z)); if (now) st.Z = st.Zt; }
  const ZSTEPS = [1, 3, 40, 400, 1500];
  $('zin').onclick = () => setZoom(ZSTEPS.find(v => v > st.Zt * 1.05) || 1500);
  $('zout').onclick = () => setZoom([...ZSTEPS].reverse().find(v => v < st.Zt / 1.05) || 1);
  $('zin').setAttribute('aria-label', L('寄る', 'Zoom in')); $('zout').setAttribute('aria-label', L('引く', 'Zoom out'));

  // ---------- つぎへ（押すと、書いてあることをして、終わったらつぎへ進む） ----------
  const T = (t, btn, go) => ({ t, btn, go });
  const tourZ = () => (innerWidth < 560 ? 1 : 1.6);   // スマホは引いて、マウスピースの右に音の出どころの絵が入るように
  const TOUR = [
    T(L('1878年のすず箔の蓄音機（筒の軸の向きから見た図）。マウスピースに歌を入れながら筒を回し、針で箔に溝を刻みます。',
      'A tin-foil phonograph from 1878, seen along the axis of the drum. We sing into the mouthpiece while the drum turns, and the needle presses a groove into the foil.'),
      L('● 録音する（14秒）', '● Record (14 s)'), async () => { setZoom(tourZ()); await setSrc('mary'); st.rpm = 60; $('rpm').value = 60; sync(); await record(); }),
    T(L('録れました。筒のふちの明るい所が声の溝です。はじめにもどして、針で溝をなぞります（音は溝の形だけから計算）。',
      'Recorded. The bright part on the rim is the groove with the song in it. Now the needle traces it from the start (the sound is computed only from the groove).'),
      L('▶ 再生する', '▶ Play'), async () => { await play(); }),
    T(L('くらべるために、マウスピースに入れた元の歌を聴きます（大きさはいまの再生にそろえます）。',
      'To compare, listen to the original song we put into the mouthpiece (at the same loudness).'),
      L('♪ 元の歌を聴く', '♪ Hear the original'), async () => { await orig(); }),
    T(L('こもるのは、振動板の共振（700 Hz あたり）と針の先の丸みのため。針の先に寄って、もう一度なぞります。',
      'It sounds muffled because of the diaphragm resonance (around 700 Hz) and the round needle tip. Let\'s zoom in to the tip and trace again.'),
      L('🔍 針の先に寄って再生', '🔍 Zoom in and play'), async () => { setZoom(400); await play(); }),
    T(L('溝の深さは約 0.05 mm、針の先は半径 0.15 mm（本当の大きさ）。つぎは2倍の速さで回します。',
      'The groove is about 0.05 mm deep; the needle tip has a 0.15 mm radius (true size). Next, twice as fast.'),
      L('⏩ 2倍の速さで再生', '⏩ Play at 2× speed'), async () => { setZoom(tourZ()); await play(120); }),
    T(L('1オクターブ高くなりました。こんどは、あなたの手で筒を回してみます。',
      'One octave higher. Now you turn the drum with your own hand.'),
      L('✋ 針をおろす', '✋ Lower the needle'), async () => { setZoom(tourZ()); await needle(true); }),
    T(L('矢印のあたり（筒のどこでも）をつかんで、ぐるっと回してください。速いと高く、遅いと低く、逆にも回せます。',
      'Grab the drum where the arrow is (anywhere on it) and turn it. Faster is higher, slower is lower; it turns backward too.'),
      L('つぎへ（針を上げる）', 'Next (lift the needle)'), async () => { await needle(false); }),
    T(L('マイクで自分の声を録ってみましょう（声はこのページの中だけ。保存も送信もしません）。',
      'Record your own voice with the microphone (it stays on this page only; never saved or sent).'),
      L('🎤 自分の声を録る（6秒）', '🎤 Record your voice (6 s)'), async () => { await setSrc('mic'); if (st.src !== 'mic') return; await record(); }),
    T(L('録れました。聴いてみましょう。', 'Recorded. Let\'s listen.'), L('▶ 再生する', '▶ Play'), async () => { await play(); }),
    T(L('自分の元の声とくらべてみましょう。', 'Compare it with your original voice.'), L('♪ 元の声を聴く', '♪ Hear your original voice'), async () => { await orig(); }),
    T(L('あとは下の「自由に試す」で。声が大きすぎると、再生で針が溝から跳ねてガリガリ鳴ります。',
      'Now try things freely below. If the voice is too loud, the needle jumps out of the groove on playback and scratches.'),
      L('はじめから', 'Start over'), async () => { ti = -1; }),
  ];
  let ti = 0, busy = false;
  function tourShow() {
    $('tourNum').textContent = (ti + 1) + '/' + TOUR.length;
    let t = TOUR[ti].t; if (st.bounced && ti > 0) t = L('（いまの再生は、針が溝から跳ねて雑音がまざりました。「声の大きさ」を下げて録りなおすと、なめらかになります）', '(In that playback the needle jumped out of the groove and added noise. Record again with a lower "Voice level" for a smoother sound.) ') + t;
    $('tourText').textContent = t; $('next').textContent = busy ? L('お待ちください…', 'Please wait…') : TOUR[ti].btn; $('next').disabled = busy;
  }
  $('next').onclick = async () => {
    if (busy) return; busy = true; tourShow();
    try { await TOUR[ti].go(); } finally { busy = false; }
    ti = (ti + 1) % TOUR.length; tourShow();
  };

  // ---------- 下の「自由に試す」 ----------
  $('bRec').onclick = () => { if (st.act && st.act.kind === 'rec') stop(); else record(); };
  $('bPlay').onclick = () => { if (st.act && st.act.kind === 'play') stop(); else play(); };
  $('bStop').onclick = () => stop();
  $('bNeedle').onclick = () => needle(!st.needle);
  $('bOrig').onclick = () => { if (st.act && st.act.kind === 'orig') stop(); else orig(); };
  $('rpm').oninput = e => { st.rpm = +e.target.value; crank(); sync(); };
  $('rpmReset').onclick = () => { st.rpm = 60; $('rpm').value = 60; crank(); sync(); };
  $('src').onchange = e => setSrc(e.target.value);
  $('lvl').oninput = e => { st.dB = +e.target.value; send({ t: 'level', dB: st.dB }); sync(); };
  $('vol').oninput = e => { st.vol = +e.target.value; send({ t: 'gain', g: Math.pow(10, st.vol / 20) }); sync(); };
  if (LANG === 'en') document.querySelectorAll('option[data-en]').forEach(o => { o.textContent = o.dataset.en; });   // iPhone は option を CSS で隠せないので、文字を入れかえる
  document.querySelectorAll('#langsw button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); b.onclick = () => { if (b.dataset.l !== LANG) setLang(b.dataset.l); }; });
  send({ t: 'gain', g: Math.pow(10, st.vol / 20) }); send({ t: 'level', dB: st.dB }); send({ t: 'src', kind: st.src });
  $('vol').value = st.vol;
  tourShow(); sync();

  // ---------- 画面を離れたら止める（RULES 9章） ----------
  // マイクは閉じて、もどったら音源がマイクのままなら開き直す。マイクの録音は録れた所までで終える（続けると、開き直すあいだの声が抜ける）。
  // ほかの録音・再生は音（AudioContext）が止まるだけなので、離れていた時間のぶん時計をずらして続きから
  let awayT = 0;
  Power.on({
    pause() { awayT = performance.now(); if (st.act && st.act.kind === 'rec' && st.src === 'mic') stop(); Audio.useMic(false); },
    resume() { if (st.act) st.act.t0 += performance.now() - awayT; if (st.src === 'mic') setSrc('mic'); },
  });
  return { st, sync, record, play, orig, origEnd, needle, stop, tick, onSnap, status, setSrc, setZoom, tour: TOUR };
})();
window.UI = UI;   // サムネイル（_dev/tools/thumb.html）から使う
