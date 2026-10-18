// ヘビが進むしくみ — 案内（つぎへ）・図の下のひとこと・試す・さわった所の説明
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);

  // 案内。1段 = 見るもの1つ（RULES: 主役1つ・光る枠・図の下に1〜2行）
  const TOUR = {
    ground: [
      { say: '<b>ヘビには足がない。</b>体の曲がりを波にして、頭から尾へ送っている。黄色の輪が波の山。', wave: true, layers: { press: false, force: false, slip: false, trail: false } },
      { say: '<b>おなかのウロコ</b>は、前へはすべりやすく、横へはすべりにくい（横は前の約1.7倍）。右下が拡大。', scale: true, layers: { press: false, force: false, slip: true, trail: false } },
      { say: '黄色い線が<b>地面を押している所</b>。強く曲がった所は少し浮かせ（明るい所・影）、まっすぐな所で押す。', ring: 'press', layers: { press: true, force: false, slip: false, trail: false } },
      { say: '矢印は<b>地面からの力（摩擦）</b>。体を横へ押すと地面が押し返す。その<b>前向きの分（緑）</b>で進む。赤は引きずる分。', ring: 'push', layers: { press: false, force: true, slip: false, trail: false } },
      { say: '青い矢印は<b>その点が地面の上をすべる向き</b>。ほとんど体にそって前へ。どの点も、頭が通った跡（点線）をなぞる。', layers: { press: false, force: false, slip: true, trail: true } },
      { say: '<b>試してみよう</b>: ウロコの向きの差をなくして、摩擦をどの向きも同じにすると…（全部べったりにすると、もっとはっきり）', act: [['どの向きも同じにする', () => UI.set('surf', 'same')], ['全部べったりも', () => { UI.set('surf', 'same'); UI.set('lift', '0'); }], ['もとにもどす', () => { UI.set('surf', 'cloth'); UI.set('lift', '1'); }]], layers: { press: true, force: true, slip: false, trail: true } },
    ],
    tree: [
      { say: '幹に<b>2か所、体を巻きつけて</b>いる。緑の線の所は、幹に<b>止まっている</b>（つかんでいる）。', layers: { stuck: true, tforce: false, move: false } },
      { say: '<b>下でつかんだまま、まん中をのばす</b>と、頭が上へ。青い矢印が動いている所（幹の上をすべる）。', ring: 'mid', layers: { stuck: true, tforce: false, move: true } },
      { say: '<b>上で巻いてつかんでから、下を放す</b>。いつも、どこかが止まっている。', ring: 'front', layers: { stuck: true, tforce: false, move: true } },
      { say: '<b>上でつかんだまま、まん中をちぢめる</b>と、下が引き上がる。これをくり返して登る。', ring: 'rear', layers: { stuck: true, tforce: false, move: true } },
      { say: '赤は重さ、緑は止まっている所が<b>支える摩擦</b>、黄色は<b>締めつけ</b>。落ちないのに要る力の4倍くらい締めつけている（本物のヘビの測定から）。', layers: { stuck: true, tforce: true, move: false } },
      { say: '<b>試してみよう</b>: 下を先に放すと…／幹を太くすると…', act: [['下を先に放す', () => UI.set('order', 'wrong')], ['幹を 7 cm に', () => UI.setDia(7)], ['もとにもどす', () => { UI.set('order', 'right'); UI.setDia(4); }]], layers: { stuck: true, tforce: true, move: true } },
    ],
  };
  const INTRO = {
    ground: '<b>つぎへ ▶</b> で順に見る。体をタップすると、そこにはたらく力の説明。下の「試す」で地面や坂を変えられる。',
    tree: '<b>つぎへ ▶</b> で順に見る。体をタップすると、そこの説明。下の「試す」で幹の太さや順番を変えられる。',
  };
  const PHASE = ['', '① 下でつかんで、まん中をのばす（頭が上へ）', '② 上を巻いてつかむ', '③ 下をゆるめて、ほどく', '④ 上でつかんで、まん中をちぢめる（下が上へ）', '⑤ 下を巻いてつかむ', '⑥ 上をゆるめて、ほどく'];
  const PHASE_W = ['', '① 下でつかんで、まん中をのばす（頭が上へ）', '② 下を先にゆるめて、ほどく', '③ 上を巻いてつかむ', '④ 上でつかんで、まん中をちぢめる（下が上へ）', '⑤ 下を巻いてつかむ', '⑥ 上をゆるめて、ほどく'];

  let A = null;   // main.js の APP

  function init(app) {
    A = app;
    $('next').onclick = () => setStep(A.step[A.mode] + 1);
    document.querySelectorAll('#modes button').forEach(b => b.onclick = () => A.setMode(b.dataset.mode));
    segs('surf', v => { A.gs.p.surf = v === 'cloth' && A.dig ? 'grip' : v; A.surfPick = v; });
    segs('lift', v => { A.gs.p.lift = v === '1'; });
    segs('dig', v => { A.dig = v === '1'; A.gs.p.surf = A.surfPick === 'cloth' && A.dig ? 'grip' : A.surfPick; });
    segs('order', v => { A.ts.p.order = v; });
    segs('scales', v => { A.ts.p.scales = v; });
    segs('tilt', v => { A.ts.p.slope = +v; });
    $('slope').oninput = e => { A.gs.p.slope = +e.target.value; $('slopeV').textContent = e.target.value + '°'; refresh(); };
    $('dia').oninput = e => setDia(+e.target.value);
    $('safety').oninput = e => { A.ts.p.safety = +e.target.value; $('safetyV').textContent = (+e.target.value).toFixed(1) + ' 倍'; refresh(); };
    document.querySelectorAll('#layers input').forEach(c => c.onchange = () => { A.layers[c.dataset.l] = c.checked; });
    setStep(0);
  }
  function segs(id, fn) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => { set(id, b.dataset.v, fn); });
    SEG[id] = fn;
  }
  const SEG = {};
  function set(id, v) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v === v));
    SEG[id](v);
    refresh();
  }
  function setDia(cm) {
    $('dia').value = cm; $('diaV').textContent = cm + ' cm';
    A.ts.p.D = cm / 100; TREE.layout(A.ts);
    refresh();
  }

  // 案内の段（0 = はじめの説明、1〜6）
  function setStep(k) {
    const T = TOUR[A.mode];
    if (k > T.length) k = 0;
    A.step[A.mode] = k;
    $('next').textContent = k === 0 ? 'つぎへ ▶' : k === T.length ? 'おわり ▶' : `つぎへ ▶ ${k}/${T.length}`;
    const st = k ? T[k - 1] : null;
    if (st && st.layers) Object.assign(A.layers, st.layers);
    if (!st) Object.assign(A.layers, A.mode === 'ground' ? { press: true, force: true, slip: false, trail: true } : { stuck: true, tforce: true, move: true });
    document.querySelectorAll('#layers input').forEach(c => c.checked = !!A.layers[c.dataset.l]);
    A.scaleOn = !!(st && st.scale) || (A.scaleOn && !st);
    $('bScale').classList.toggle('on', A.scaleOn);
    A.wave = !!(st && st.wave);
    A.ringKind = st && st.ring || null;
    const say = $('say');
    say.innerHTML = st ? `<span class="n">${k}/${T.length}</span>${st.say}` : INTRO[A.mode];
    if (st && st.act) for (const [label, fn] of st.act) { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; say.appendChild(document.createElement('br')); say.appendChild(b); }
    if (st && st.act) { const br = say.querySelectorAll('br'); br.forEach((x, i) => { if (i) x.remove(); }); }
  }

  // 図の下の数字（身近なたとえで）と、試すの結果の文
  function refresh() {
    const r = $('ruler'), res = $('result');
    if (A.mode === 'ground') {
      const s = A.gs, U = A.speedG;   // m/s（1周期の平均。坂では +x 向き = 上り坂の上り・下り坂の下り。main.js）
      const per = U * s.p.tau / s.p.L;
      if (U == null) { r.textContent = ''; }
      else if (U < -0.002) r.innerHTML = `<span class="bad">${s.p.slope > 0 ? '坂の下へすべっている' : '後ろへすべっている'}</span> 秒速 <span class="big">${f1(-U * 100)}</span> cm`;
      else r.innerHTML = `${s.p.slope > 0 ? '坂を上る' : s.p.slope < 0 ? '坂を下る' : '進む'}速さ 秒速 <span class="big">${f1(Math.abs(U) * 100)}</span> cm（1分で ${f1(Math.abs(U) * 60)} m）・1回うねるごとに体長の ${f0(Math.abs(per) * 100)}%`;
      const sf = s.p.surf, p = s.p;
      let t = '';
      if (sf === 'same') t = p.lift ? 'どの向きも同じ摩擦: 横へ押しても前向きの分が小さく、布のときの半分も進まない（浮かせ方のちがいで少しだけ進む）。「全部べったり」にすると、ほとんど進めない。' : 'どの向きも同じ摩擦・全部べったり: 前へ押す力と引きずる力が打ち消しあって、ほとんど進めない。';
      else if (sf === 'board') t = 'なめらかな板: ウロコが引っかからず、前 0.14・横 0.16 とほとんど同じ。進みにくい。';
      else if (p.slope > 0) t = `坂 ${p.slope}°: 重さが後ろへ引く。${p.surf === 'grip' ? 'ウロコを立てて摩擦を上げている（布の約2.7倍）。' : '布の摩擦だけでは、すぐに後ろへすべる。'}`;
      else if (p.slope < 0) t = `下り坂 ${-p.slope}°: 重さが前へ引く。`;
      else if (!p.lift) t = '全部べったり: 曲がった所も地面を押すので、横へすべる摩擦が増え、少し遅くなる。';
      else t = '布（ざらざら）: 前 0.11・後ろ 0.14・横 0.19。横がいちばんすべりにくい。';
      res.textContent = t; res.classList.toggle('bad', sf === 'same' || (U != null && U < -0.002));
      $('readout').innerHTML = `<span>摩擦 前 <b>${GROUND.SURF[sf].mf}</b> 後ろ <b>${GROUND.SURF[sf].mb}</b> 横 <b>${GROUND.SURF[sf].mt}</b></span><span>体長 <b>${p.L * 100} cm</b>・重さ <b>${p.mass * 1000} g</b></span><span>1回のうねり <b>${p.tau} 秒</b></span>`;
    } else {
      const s = A.ts, p = s.p;
      const W = p.mass * 9.81;
      if (s.fell) r.innerHTML = `<span class="bad">すべり落ちた！</span> ${!s.encircle ? 'ひと回り巻けないので、締めつけられない' : 'どこも止まっていない時間があった'}`;
      else {
        const U = A.speedT;
        const sq = s.sqN * s.lg / W;
        r.innerHTML = `${U == null ? '' : `上へ 秒速 <span class="big">${f1(U * 100)}</span> cm（1分で ${f0(U * 6000)} cm）・`}締めつけ 体重の <span class="big">${f1(sq)}</span> 倍`;
      }
      let t = '';
      const circ = Math.PI * (p.D + p.d) * 100;
      if (!s.encircle) t = `幹のまわり ${f0(circ)} cm: 2か所巻くと体（${p.L * 100} cm）が足りない。1か所もひと回りできず、締めつけられない。`;
      else if (p.order === 'wrong') t = '下を先に放すと、上をつかむまでのあいだ、どこも止まっていない。重さを支えられない。';
      else if (s.lm < 0.08) t = `幹のまわり ${f0(circ)} cm: つかむのに 2×${f0(s.lg * 100)} cm 使うので、のび縮みできるのは ${f0(s.lm * 100)} cm だけ。ゆっくりしか登れない。`;
      else if (p.safety < 1.3) t = `締めつけ ${p.safety.toFixed(1)} 倍: ぎりぎり。動きの途中で、支える摩擦が足りなくなる（4 cm の幹の計算では 約1.1倍 より弱いと落ちる）。`;
      else if (p.scales === 'flat') t = 'ウロコを立てない: 静止摩擦が 0.88 → 0.35。同じ余裕で支えるのに、約2.5倍 強く締めつけている。';
      else t = `幹のまわり ${f0(circ)} cm。つかむ所 ${f0(s.lg * 100)} cm ×2、のび縮みする所 ${f0(s.lm * 100)} cm。`;
      res.textContent = t; res.classList.toggle('bad', s.fell || !s.encircle || p.order === 'wrong');
      const ph = (p.order === 'wrong' ? PHASE_W : PHASE)[s.phase || 1];
      $('readout').innerHTML = `<span>いま <b>${ph}</b></span><span>支える摩擦 上限の <b>${f0(s.use * 100)}%</b></span><span>止まっている所 <b>${f0(s.stuckFrac * 100)}%</b></span><span>体長 <b>${p.L * 100} cm</b>・重さ <b>${p.mass * 1000} g</b></span>`;
      if (A.step.tree === 0 && !s.fell) $('say').innerHTML = `${INTRO.tree}<br><span style="color:var(--acc)">いま: ${ph}</span>`;
    }
  }

  // さわった所の説明
  function tip(i) {
    if (A.mode === 'ground') {
      const s = A.gs, p = s.p, w0 = p.mass * 9.81 / p.L;
      const nu = s.nu[i] / w0, vx = s.vx[i], vy = s.vy[i], sp = Math.hypot(vx, vy);
      const ut = (vx * s.tx[i] + vy * s.ty[i]) / (sp || 1), ang = Math.acos(Math.max(-1, Math.min(1, ut))) * 180 / Math.PI;
      const fwd = s.fx[i] * Math.cos(s.TH) + s.fy[i] * Math.sin(s.TH);
      const where = i < GROUND.N * 0.15 ? '尾のあたり' : i > GROUND.N * 0.85 ? '頭のあたり' : 'まん中のあたり';
      return `<b>${where}</b><br>${nu < 0.3 ? '少し浮かせている' : '地面を押している'}（押す重さ: ならしたときの ${f0(nu * 100)}%）<br>地面に対して 秒速 ${f1(sp * 100)} cm、体の向きから ${f0(ang)}° の向きへすべる<br>地面からの力: ${fwd >= 0 ? '<span style="color:var(--push)">前へ押す</span>' : '<span style="color:var(--drag)">後ろへ引きずる</span>'}`;
    }
    const s = A.ts, z = s.zone[i];
    const name = ['尾', '下のつかみ', 'まん中（のび縮みする所）', '上のつかみ', '頭'][z];
    const v = s.v[i];
    let st = s.stuck[i] ? '<span style="color:var(--acc)">幹に止まっている</span>。ここの静止摩擦が体を支える' :
      Math.abs(v) < 0.001 ? 'ほとんど動いていない' : `幹の上を${v > 0 ? '上' : '下'}へすべっている（秒速 ${f1(Math.abs(v) * 100)} cm）`;
    const sq = (z === 1 ? s.sqR : z === 3 ? s.sqF : 0);
    return `<b>${name}</b><br>${st}${sq > 0.3 && s.sqN ? '<br>巻きつけて締めつけている' : ''}`;
  }

  window.UI = { TOUR, init, setStep, refresh, set, setDia, tip, PHASE };
})();
