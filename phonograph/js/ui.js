// エジソンの蓄音機 — 操作（録音・再生・止める・針、つぎへ、筒を手で回す・寄る・説明）
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id), S = () => window.__ph.S;
  const st = { act: null, needle: false, recEnd: 0, recDur: 0, recKind: '', rpm: 60, src: 'mary', dB: 105, vol: 0, plays: 0, drag: null, Z: 1, Zt: 1, cont: 0, contN: 0, bounced: false };
  const omOf = r => r * 2 * Math.PI / 60;
  const send = m => Audio.send(m);

  // ---------- 筒の回り方 ----------
  // 手で筒をつかんでいるあいだは手の動きどおり（逆回し・押さえて止めるもできる）。離すと、録音・再生の途中なら設定の速さへもどり、
  // そうでなければはずみ車で回りつづける
  function crank() {
    if (st.drag) return send({ t: 'crank', hand: true, om: st.drag.om, tau: 0.02 });
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
    st.needle = on;
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
    st.act = null; if (a.kind !== 'orig') rest(); crank(); sync(); a.done();
  }
  function tick(now) {   // main.js が毎コマよぶ
    banner(now);
    if (st.drag && !st.drag.still && now - st.drag.t > 60) { st.drag.om = 0; st.drag.still = true; crank(); }   // 手が止まったら筒も止まる
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
    $('bNeedle').textContent = st.needle ? L('針を上げる', 'Lift needle') : L('針をおろす', 'Lower needle');
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
    else { const el = (now - a.t0) / 1000; frac = el / Math.max(0.1, a.sec); cls = 'orig'; txt = L('♪ 入れる音（蓄音機を通さない音）', '♪ Input sound (not through the phonograph)'); }
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
  function axisAngle(e) { const r = cv.getBoundingClientRect(); return Math.atan2(Draw.wy(e.clientY - r.top), Draw.wx(e.clientX - r.left)); }
  cv.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect(), k = Draw.hit(e.clientX - r.left, e.clientY - r.top);
    if (GRAB[k] && ptrs.size === 1) {   // 筒をつかむ（さわった瞬間に止まる。音の準備は待たない）
      st.drag = { a: axisAngle(e), t: performance.now(), om: 0 }; tip.hidden = true; cv.style.cursor = 'grabbing'; Audio.start(); crank();
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
    if (st.drag) {   // 筒の回る向き（図で時計まわり）が正、逆回しは負
      const a = axisAngle(e), now = performance.now(); let da = a - st.drag.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const dt = Math.max(4, now - st.drag.t) / 1000, om = Math.max(-omOf(240), Math.min(omOf(240), -da / dt));
      st.drag.om = st.drag.om * 0.4 + om * 0.6; st.drag.a = a; st.drag.t = now; st.drag.still = false; crank(); return;
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
    T(L('1878年のすず箔の蓄音機（筒の軸の向きから見た図）。「メリーさんのひつじ」の声（計算で作った声）をマウスピースに入れながら筒を回し、針で箔に溝を刻みます（1曲 14秒。録音中は、入れている声がそのまま聞こえます）。',
      'A tin-foil phonograph from 1878, seen along the axis of the drum. We sing "Mary Had a Little Lamb" (a computer-made voice) into the mouthpiece while the drum turns, and the needle presses a groove into the foil (the whole song, 14 s; you hear the voice while it records).'),
      L('● 録音する', '● Record'), async () => { setZoom(tourZ()); await setSrc('mary'); st.rpm = 60; $('rpm').value = 60; sync(); await record(); }),
    T(L('録れました。筒のふちの明るい所が、声の刻まれた溝です。はじめにもどして、針で溝をなぞります。聞こえるのは、溝の形だけから計算した音です。',
      'Recorded. The bright part on the rim of the drum is the groove with the voice in it. Now we go back to the start and let the needle trace the groove. What you hear is computed only from the shape of the groove.'),
      L('▶ 再生する', '▶ Play'), async () => { await play(); }),
    T(L('いまのが、溝の形から計算した音です。くらべるために、マウスピースに入れた元の音を聴きます（大きさは、いまの再生にそろえます）。',
      'That was the sound computed from the groove. To compare, listen to the original sound we put into the mouthpiece (at the same loudness as the playback).'),
      L('♪ 元の音を聴く', '♪ Hear the original'), async () => { await orig(); }),
    T(L('こもって聞こえるのは、振動板の共振（700 Hz あたり）と、針の先の丸みのため。つぎは針の先に寄って、もう一度なぞります。',
      'The playback sounds muffled because of the diaphragm resonance (around 700 Hz) and the round needle tip. Next, we zoom in to the needle tip and trace the groove again.'),
      L('🔍 針の先に寄って再生', '🔍 Zoom in and play'), async () => { setZoom(400); await play(); }),
    T(L('いまのが本当の大きさ: 溝の深さは約 0.05 mm、針の先は半径 0.15 mm。つぎは2倍の速さで回して再生します。',
      'That was the real size: the groove is about 0.05 mm deep and the needle tip has a radius of 0.15 mm. Next, we play it turning twice as fast.'),
      L('⏩ 2倍の速さで再生', '⏩ Play at 2× speed'), async () => { setZoom(tourZ()); await play(120); }),
    T(L('速く回すと、1オクターブ高い声になりました。再生中でも、筒をつかんで回すと速さが変わります（逆回しも）。つぎは、マイクで自分の声を録ってみましょう（マイクの音はこのページの中だけで覚え、保存も送信もしません）。',
      'Turning faster made the voice one octave higher. Even during playback, you can grab the drum and turn it to change the speed (backward too). Next, record your own voice with the microphone (the sound stays only on this page; it is not saved or sent).'),
      L('🎤 自分の声を録る（6秒）', '🎤 Record your voice (6 s)'), async () => { await setSrc('mic'); if (st.src !== 'mic') return; await record(); }),
    T(L('録れました。聴いてみましょう。', 'Recorded. Let\'s listen.'), L('▶ 再生する', '▶ Play'), async () => { await play(); }),
    T(L('自分の元の声とくらべてみましょう。', 'Compare it with your original voice.'), L('♪ 元の声を聴く', '♪ Hear your original voice'), async () => { await orig(); }),
    T(L('あとは下の「自由に試す」で。「針をおろす」で針をおろしたまま、筒をつかんで好きな速さで回すと鳴ります。声が大きすぎると、再生で針が溝から跳ねて、ガリガリという雑音になります。',
      'Now try things freely below. With "Lower needle", the needle stays down, and you can grab the drum and turn it at any speed to play. If the voice is too loud, the needle jumps out of the groove on playback and makes a scratchy noise.'),
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
  tourShow(); sync();
  return { st, sync, record, play, orig, origEnd, needle, stop, tick, onSnap, status, setSrc, setZoom, tour: TOUR };
})();
window.UI = UI;   // サムネイル（_dev/tools/thumb.html）から使う
