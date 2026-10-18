// エジソンの蓄音機 — 操作（ボタン・クランク・寄る・説明・つぎへ）
'use strict';
const UI = (() => {
  const $ = id => document.getElementById(id), S = () => window.__ph.S;
  const st = { loopEnd: 0, turning: false, rpm: 60, src: 'vowel', dB: 115, vol: 4, plays: 0, drag: null, Z: 1, Zt: 1 };
  const omOf = r => r * 2 * Math.PI / 60;

  // ---------- 針・筒・クランク ----------
  async function mode(m) {
    await Audio.start();
    if (m === 'rec' && st.src === 'mic' && !await Audio.useMic(true)) { alert('マイクが使えませんでした。ほかの「入れる音」を選んでください。'); return; }
    if (m === 'play' && S().mode !== 'play') { st.plays++; }
    Audio.send({ t: 'mode', m }); S().mode = m; sync();
  }
  function crank() { Audio.send({ t: 'crank', hand: st.turning || !!st.drag, om: st.drag ? st.drag.om : omOf(st.rpm) }); }
  async function turn(on) { await Audio.start(); st.turning = on; crank(); sync(); }
  async function rewind() { await Audio.start(); Audio.send({ t: 'rewind' }); }
  async function newFoil() { await Audio.start(); Audio.send({ t: 'reset' }); st.plays = 0; S().seg = null; sync(); }
  async function setSrc(k) {
    st.src = k; $('src').value = k; await Audio.start();
    if (k !== 'mic') await Audio.useMic(false); else if (!await Audio.useMic(true)) { alert('マイクが使えませんでした（許可がない・マイクがない）。ほかの音を選んでください。'); return setSrc('vowel'); }
    Audio.send({ t: 'src', kind: k }); sync();
  }
  function sync() {
    const m = S().mode;
    $('bRec').classList.toggle('on', m === 'rec'); $('bPlay').classList.toggle('on', m === 'play'); $('bTurn').classList.toggle('on', st.turning);
    $('bTurn').textContent = st.turning ? '回すのをやめる' : '回す';
    $('rpmV').textContent = '毎分 ' + st.rpm + ' 回転'; $('lvlV').textContent = st.dB + ' dB'; const gv = Math.pow(10, st.vol / 20); $('volV').textContent = '×' + (gv < 10 ? gv.toFixed(1) : Math.round(gv));
    $('plays').textContent = st.plays ? '再生 ' + st.plays + ' 回目' : '';
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

  // ---------- つぎへ ----------
  const TOUR = [
    { t: '1878年のすず箔の蓄音機を、筒の軸の向きから見た図です。「つぎへ」で、声を刻むところから始めます（音が出ます）。', go: async () => { setZoom(1); } },
    { t: '声「あー」を入れて録音中。声で振動板がふるえ、針が箔に溝を刻んでいます（録音中はスピーカーから出しません）。自分の声は「入れる音」をマイクに。', go: async () => { st.loopEnd = 0; await newFoil(); if (st.src === 'mic') await setSrc('vowel'); await mode('rec'); await turn(true); setZoom(3); } },
    { t: 'はじめにもどして、再生の針で溝をなぞっています。聞こえるのは溝の形から計算した音です（案内中は録った所をくり返します）。', go: async () => { st.loopEnd = S().x; await mode('up'); await rewind(); await mode('play'); await turn(true); setZoom(3); } },
    { t: '針の先に寄りました（本当の大きさ）。溝の深さは約 0.05 mm。針の先の丸みは、細かい波の底に入れません。ときどき溝から跳ねます。', go: async () => { setZoom(400); } },
    { t: 'もう一度なぞります。跳ねて落ちた針の強い力で、溝の山がつぶれていきます。何回か聴きくらべてみてください。', go: async () => { await mode('up'); await rewind(); await mode('play'); setZoom(40); } },
    { t: '毎分120回転（2倍の速さ）で再生。音が1オクターブ高くなります。ゆっくり回すと低くなります。', go: async () => { st.rpm = 120; $('rpm').value = 120; await mode('up'); await rewind(); await mode('play'); await turn(true); setZoom(1); } },
    { t: '下の図で、入れた音と出た音の波と成分をくらべられます。あとは自由に: マイク・速さ・声の大きさを変えて、録って、聴いてみてください。', go: async () => { st.loopEnd = 0; st.rpm = 60; $('rpm').value = 60; crank(); sync(); $('graphs').scrollIntoView({ behavior: 'smooth' }); } },
  ];
  let ti = 0;
  function tourShow() { $('tourNum').textContent = (ti + 1) + '/' + TOUR.length; $('tourText').textContent = TOUR[ti].t; $('next').textContent = ti === TOUR.length - 1 ? 'はじめから' : 'つぎへ'; }
  $('next').onclick = async () => { ti = (ti + 1) % TOUR.length; tourShow(); await TOUR[ti].go(); sync(); };

  // ---------- 下の操作 ----------
  $('bRec').onclick = () => { st.loopEnd = 0; return mode(S().mode === 'rec' ? 'up' : 'rec'); };
  $('bPlay').onclick = () => mode(S().mode === 'play' ? 'up' : 'play');
  $('bUp').onclick = () => mode('up');
  $('bTurn').onclick = () => turn(!st.turning);
  $('bRew').onclick = rewind; $('bFoil').onclick = () => { st.loopEnd = 0; newFoil(); };
  $('rpm').oninput = e => { st.rpm = +e.target.value; crank(); sync(); };
  $('src').onchange = e => setSrc(e.target.value);
  $('lvl').oninput = e => { st.dB = +e.target.value; Audio.send({ t: 'level', dB: st.dB }); sync(); };
  $('vol').oninput = e => { st.vol = +e.target.value; Audio.send({ t: 'gain', g: Math.pow(10, st.vol / 20) }); sync(); };
  document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); turn(!st.turning); } });
  Audio.send({ t: 'gain', g: Math.pow(10, st.vol / 20) }); Audio.send({ t: 'level', dB: st.dB });
  tourShow(); sync();
  return { st, sync, mode, turn, rewind, newFoil, setSrc, setZoom, tour: TOUR };
})();
window.UI = UI;   // サムネイル（_dev/tools/thumb.html）から使う
