// エジソンの蓄音機 — 操作（録音・再生・止める、つぎへ、クランクのドラッグ・寄る・説明）
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id), S = () => window.__ph.S;
  const st = { act: null, recEnd: 0, recDur: 0, recKind: '', rpm: 60, src: 'mary', dB: 105, vol: 18, plays: 0, drag: null, Z: 1, Zt: 1, cont: 0, contN: 0, bounced: false };
  const omOf = r => r * 2 * Math.PI / 60;
  const send = m => Audio.send(m);

  // ---------- 録音・再生・止める（押すと決まった動きをして、終わったら止まる） ----------
  function crank() { send({ t: 'crank', hand: !!st.act || !!st.drag, om: st.drag ? st.drag.om : omOf(st.act && st.act.rpm || st.rpm) }); }
  function setMode(m) { send({ t: 'mode', m }); S().mode = m; }
  const REC_SEC = { mary: 11, vowel: 4, whistle: 4, sweep: 10, mic: 6 };   // 録音の長さ（メリーは1曲、上がる音は1回ぶん）
  async function record(maxSec = REC_SEC[st.src] || 8) {
    if (!await Audio.start()) return;
    if (st.src === 'mic' && !await Audio.useMic(true)) { alert('マイクが使えませんでした（許可がない・マイクがない）。ほかの「入れる音」を選んでください。'); return; }
    stop(true);
    send({ t: 'src', kind: st.src, restart: true }); send({ t: 'reset' }); send({ t: 'rewind' }); S().seg = null; st.plays = 0; st.recEnd = 0; st.bounced = false;
    setMode('rec');
    return begin({ kind: 'rec', maxSec });
  }
  async function play(rpm) {
    if (!st.recEnd) { flash('まだ何も録っていません。先に「● 録音」を。'); return; }
    if (!await Audio.start()) return;
    stop(true);
    send({ t: 'rewind' }); setMode('play'); st.plays++; st.cont = st.contN = 0;
    return begin({ kind: 'play', rpm, end: st.recEnd });
  }
  async function orig() {   // 入れる音をそのまま聴く（蓄音機を通さない）。録音しなくても聴ける。マイクだけは録った声を
    if (st.src === 'mic' && st.recKind !== 'mic') { flash('マイクの声は、録音すると聴けます。'); return; }
    if (!await Audio.start()) return;
    const sec = st.src === 'mic' ? st.recDur : REC_SEC[st.src] || 8;
    stop(true); send({ t: 'orig', on: true, kind: st.src, sec });
    return begin({ kind: 'orig', sec });
  }
  function origEnd() { if (st.act && st.act.kind === 'orig') stop(); }
  function begin(act) {
    act.t0 = performance.now(); act.armed = act.kind === 'rec';
    return new Promise(res => { act.done = res; st.act = act; crank(); sync(); });
  }
  function stop(quiet) {
    const a = st.act; if (!a) { if (!quiet) { setMode('up'); sync(); } return; }
    if (a.kind === 'rec') { st.recEnd = Math.max(0.05, S().x); st.recDur = (performance.now() - a.t0) / 1000; st.recKind = st.src; }
    if (a.kind === 'play') st.bounced = st.contN > 10 && st.cont / st.contN < 0.85;
    st.act = null; setMode('up'); crank(); sync(); a.done();
  }
  function tick(now) {   // main.js が毎コマよぶ
    banner(now);
    const a = st.act; if (!a) return;
    if (a.kind === 'rec' && (now - a.t0 > a.maxSec * 1000 || S().atEnd)) stop();
    if (a.kind === 'orig' && now - a.t0 > (a.sec + 2) * 1000) stop();   // 終わりの知らせが来なかったとき
    if (a.kind === 'play') {
      if (!a.armed) { if (S().x < a.end * 0.5 || now - a.t0 > 1500) a.armed = true; return; }   // もどす知らせが届くまで待つ
      if (S().x >= a.end || S().atEnd) stop();
    }
  }
  function onSnap(m) { if (st.act && st.act.kind === 'play' && st.act.armed && m.mode === 'play') { st.contN++; if (m.contact) st.cont++; } }
  async function setSrc(k) {
    st.src = k; $('src').value = k;
    if (k !== 'mic') { Audio.useMic(false); } else if (!await Audio.useMic(true)) { alert('マイクが使えませんでした（許可がない・マイクがない）。ほかの音を選んでください。'); return setSrc('mary'); }
    send({ t: 'src', kind: k }); sync();
  }
  function sync() {
    const a = st.act;
    $('bRec').classList.toggle('on', !!a && a.kind === 'rec'); $('bPlay').classList.toggle('on', !!a && a.kind === 'play'); $('bOrig').classList.toggle('on', !!a && a.kind === 'orig');
    $('bOrig').disabled = !a && st.src === 'mic' && st.recKind !== 'mic';
    $('bPlay').disabled = !st.recEnd && !a; $('bStop').disabled = !a;
    $('rpmV').textContent = '毎分 ' + st.rpm + ' 回転'; $('lvlV').textContent = st.dB + ' dB';
    const gv = Math.pow(10, st.vol / 20); $('volV').textContent = '×' + (gv < 10 ? gv.toFixed(1) : Math.round(gv));
  }
  // 図の上のまん中の帯: いま何をしているか・あと何秒・（録音中は）入ってくる音の大きさ
  const bn = $('banner');
  function banner(now) {
    const a = st.act; if (!a) { bn.hidden = true; return; }
    let txt, frac, cls;
    if (a.kind === 'rec') {
      const el = (now - a.t0) / 1000; frac = el / a.maxSec; cls = 'rec';
      txt = '● 録音中' + (st.src === 'mic' ? '　マイクに話してください' : '') + '　あと ' + Math.max(0, a.maxSec - el).toFixed(1) + ' 秒';
    } else if (a.kind === 'play') { frac = a.armed ? S().x / a.end : 0; cls = 'play'; txt = '▶ 再生中（溝から計算した音）　' + Math.round(Math.min(1, frac) * 100) + '%'; }
    else { const el = (now - a.t0) / 1000; frac = el / Math.max(0.1, a.sec); cls = 'orig'; txt = '♪ 入れる音（蓄音機を通さない音）'; }
    bn.hidden = false; bn.className = cls;
    $('bnText').textContent = txt; $('bnBar').style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
    const lv = $('bnLv');
    if (a.kind === 'rec') {
      const dB = S().pIn > 0 ? 20 * Math.log10(S().pIn / 20e-6) : 0;
      lv.hidden = false; $('bnLvBar').style.width = Math.max(0, Math.min(100, (dB - 80) / 45 * 100)).toFixed(0) + '%';
      $('bnLvTxt').textContent = '入ってくる音 ' + (dB > 0 ? dB.toFixed(0) : '—') + ' dB' + (dB > 110 ? '（大きすぎ: 再生で針が跳ねます）' : '');
      lv.classList.toggle('over', dB > 110);
    } else lv.hidden = true;
  }
  let flashT = -1e9, flashMsg = '';
  function flash(m) { flashMsg = m; flashT = performance.now(); }
  function status(now) {   // 図の左上の大きい1行
    const a = st.act;
    if (now - flashT < 3000) return '<span class="rec big">' + flashMsg + '</span>';
    if (a) return '';   // 動いているあいだは、図のまん中の帯に出す
    if (st.bounced) return '<span class="rec big">さっきの再生では、針が溝から跳ねていました</span>';
    return st.recEnd ? '<span class="big">止まっています</span>' : '<span class="big">まだ何も録っていません</span>';
  }

  // ---------- 図の上の手（クランクをつかむ・寄る・説明） ----------
  const cv = $('cv'), tip = $('tip'), ptrs = new Map();
  const TIPS = {
    crank: '<b>クランク</b>つかんで回すと筒が回ります。はずみ車があるので、手を離してもしばらく回りつづけます。ねじで、1周ごとに筒が 1.06 mm 横へ進みます（1インチに24山）。',
    dia: '<b>振動板（雲母、直径 50 mm）</b>ふちを留めたうすい板。声の圧力でふるえます。形は板の曲げの式の5つのモードの和です。',
    stylus: '<b>針</b>振動板のまん中についています。録音では箔を押して凹ませ、再生では溝をなぞります。',
    tip: '<b>針の先（半径 0.15 mm、推定）</b>丸いので、溝の細かい波の底までは入れません。高い音が弱くなり、ひずみます。',
    groove: '<b>溝</b>箔が筒のすきまへ凹んだもの。深い・浅いの形が声です。押す力が「その深さを刻む力」をこえた所だけ凹み、戻りません。',
    mouth: '<b>マウスピース</b>口をつけて話します。中の空気の圧力が振動板を押します（このアプリはここに音を入れる）。',
    foil: '<b>すず箔（厚さ 0.035 mm）</b>筒のらせんのすきまの上に巻いてあります。色のついた所が、いまの周で声が刻まれている所。',
    drum: '<b>筒（直径 141 mm）</b>1878年の展示用の機械の大きさ。毎分60回転なら、箔は1秒に 44 cm 進みます。',
  };
  function showTip(e) {
    const r = cv.getBoundingClientRect(), k = Draw.hit(e.clientX - r.left, e.clientY - r.top);
    if (!k) { tip.hidden = true; cv.style.cursor = 'grab'; return; }
    tip.innerHTML = TIPS[k]; tip.hidden = false; cv.style.cursor = k === 'crank' ? 'pointer' : 'help';
    const x = Math.min(r.width - 280, e.clientX - r.left + 14), y = Math.min(r.height - 120, e.clientY - r.top + 14);
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function knobAngle(e) { const r = cv.getBoundingClientRect(); return Math.atan2(Draw.wy(e.clientY - r.top), Draw.wx(e.clientX - r.left)); }
  cv.addEventListener('pointerdown', async e => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect(), k = Draw.hit(e.clientX - r.left, e.clientY - r.top);
    if (k === 'crank' && ptrs.size === 1) { st.drag = { a: knobAngle(e), t: performance.now(), om: 0 }; Audio.start(); crank(); }   // 音の準備を待たずにつかむ（送る中身は準備ができたら届く）
    else if (e.pointerType !== 'mouse') showTip(e);
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.size === 2 && ptrs.has(e.pointerId)) {   // 2本指で寄る・引く
      const [a, b] = [...ptrs.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...ptrs.values()], d1 = Math.hypot(c.x - d.x, c.y - d.y);
      if (d0 > 0) setZoom(st.Zt * d1 / d0, true); return;
    }
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.drag) {
      const a = knobAngle(e), now = performance.now(); let da = a - st.drag.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const dt = Math.max(1, now - st.drag.t) / 1000, om = Math.max(0, -da / dt);   // 筒の回る向き（図で時計まわり）だけ
      st.drag.om = st.drag.om * 0.7 + Math.min(omOf(150), om) * 0.3; st.drag.a = a; st.drag.t = now; crank(); return;
    }
    if (e.pointerType === 'mouse') showTip(e);
  });
  const up = e => { ptrs.delete(e.pointerId); if (st.drag && ptrs.size === 0) { st.drag = null; crank(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (!st.drag) tip.hidden = true; });
  cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(st.Zt * Math.pow(1.0015, -e.deltaY)); }, { passive: false });
  function setZoom(z, now) { st.Zt = Math.max(1, Math.min(1500, z)); if (now) st.Z = st.Zt; }
  const ZSTEPS = [1, 3, 40, 400, 1500];
  $('zin').onclick = () => setZoom(ZSTEPS.find(v => v > st.Zt * 1.05) || 1500);
  $('zout').onclick = () => setZoom([...ZSTEPS].reverse().find(v => v < st.Zt / 1.05) || 1);

  // ---------- つぎへ（押すと、書いてあることをして、終わったらつぎへ進む） ----------
  const T = (t, btn, go) => ({ t, btn, go });
  const TOUR = [
    T('1878年のすず箔の蓄音機（筒の軸の向きから見た図）。「メリーさんのひつじ」の声（計算で作った声）をマウスピースに入れながら筒を回し、針で箔に溝を刻みます（1曲 11秒。録音中は音は出ません）。', '● 録音する',
      async () => { setZoom(1.6); await setSrc('mary'); st.rpm = 60; $('rpm').value = 60; sync(); await record(); }),
    T('録れました。筒のふちの明るい所が、声の刻まれた溝です。はじめにもどして、針で溝をなぞります。聞こえるのは、溝の形だけから計算した音です。', '▶ 再生する',
      async () => { await play(); }),
    T('いまのが、溝の形から計算した音です。くらべるために、マウスピースに入れた元の音を聴きます（大きさは、いまの再生にそろえます）。', '♪ 元の音を聴く',
      async () => { await orig(); }),
    T('こもって聞こえるのは、振動板の共振（700 Hz あたり）と、針の先の丸みのため。つぎは針の先に寄って、もう一度なぞります。', '🔍 針の先に寄って再生',
      async () => { setZoom(400); await play(); }),
    T('いまのが本当の大きさ: 溝の深さは約 0.05 mm、針の先は半径 0.15 mm。つぎは2倍の速さで回して再生します。', '⏩ 2倍の速さで再生',
      async () => { setZoom(1.6); await play(120); }),
    T('速く回すと、1オクターブ高い声になりました。つぎは、マイクで自分の声を録ってみましょう（マイクの音はこのページの中だけで覚え、保存も送信もしません）。', '🎤 自分の声を録る（6秒）',
      async () => { await setSrc('mic'); if (st.src !== 'mic') return; await record(); }),
    T('録れました。聴いてみましょう。', '▶ 再生する', async () => { await play(); }),
    T('自分の元の声とくらべてみましょう。', '♪ 元の声を聴く', async () => { await orig(); }),
    T('あとは下の「自由に試す」で、入れる音・声の大きさ・回す速さを変えてみてください。声が大きすぎると、再生で針が溝から跳ねて、ガリガリという雑音になります。', 'はじめから',
      async () => { ti = -1; }),
  ];
  let ti = 0, busy = false;
  function tourShow() {
    $('tourNum').textContent = (ti + 1) + '/' + TOUR.length;
    let t = TOUR[ti].t; if (st.bounced && ti > 0) t = '（いまの再生は、針が溝から跳ねて雑音がまざりました。「声の大きさ」を下げて録りなおすと、なめらかになります）' + t;
    $('tourText').textContent = t; $('next').textContent = busy ? 'お待ちください…' : TOUR[ti].btn; $('next').disabled = busy;
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
  $('bOrig').onclick = () => { if (st.act && st.act.kind === 'orig') stop(); else orig(); };
  $('rpm').oninput = e => { st.rpm = +e.target.value; crank(); sync(); };
  $('src').onchange = e => setSrc(e.target.value);
  $('lvl').oninput = e => { st.dB = +e.target.value; send({ t: 'level', dB: st.dB }); sync(); };
  $('vol').oninput = e => { st.vol = +e.target.value; send({ t: 'gain', g: Math.pow(10, st.vol / 20) }); sync(); };
  send({ t: 'gain', g: Math.pow(10, st.vol / 20) }); send({ t: 'level', dB: st.dB }); send({ t: 'src', kind: st.src });
  tourShow(); sync();
  return { st, sync, record, play, orig, origEnd, stop, tick, onSnap, status, setSrc, setZoom, tour: TOUR };
})();
window.UI = UI;   // サムネイル（_dev/tools/thumb.html）から使う
