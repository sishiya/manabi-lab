// ヘビが進むしくみ — 木を登る（tree）。計算は js/tree.js、図は js/draw-tree.js
'use strict';
window.MODES = window.MODES || {};
(function () {
  const $ = id => document.getElementById(id);
  const f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);
  const PHASE = ['', L('① 下でつかんで、まん中をのばす（頭が上へ）', '① Grip low, stretch the middle (head goes up)'), L('② 上を巻いてつかむ', '② Wrap and grip high'), L('③ 下をゆるめて、ほどく', '③ Loosen and unwrap low'), L('④ 上でつかんで、まん中をちぢめる（下が上へ）', '④ Grip high, pull the middle in (lower part comes up)'), L('⑤ 下を巻いてつかむ', '⑤ Wrap and grip low'), L('⑥ 上をゆるめて、ほどく', '⑥ Loosen and unwrap high')];
  const PHASE_W = ['', L('① 下でつかんで、まん中をのばす（頭が上へ）', '① Grip low, stretch the middle (head goes up)'), L('② 下を先にゆるめて、ほどく', '② Loosen and unwrap low first'), L('③ 上を巻いてつかむ', '③ Wrap and grip high'), L('④ 上でつかんで、まん中をちぢめる（下が上へ）', '④ Grip high, pull the middle in (lower part comes up)'), L('⑤ 下を巻いてつかむ', '⑤ Wrap and grip low'), L('⑥ 上をゆるめて、ほどく', '⑥ Loosen and unwrap high')];
  const TP = { D: 0.02, slope: 90, safety: 4, scales: 'dig', order: 'right' };
  const midZ = s => (s.z[0] + s.z[TREE.N - 1]) / 2;   // 尾の先と頭のまん中

  const M = {
    id: 'tree', s: null, hist: [], speed: null,
    layers: { stuck: true, tforce: true, move: true },
    intro: L('<b>つぎへ ▶</b> で順に見る。体をタップすると、そこの説明。下の「試す」で幹の太さや順番を変えられる。', 'Press <b>Next ▶</b> to go step by step. Tap the body to learn about that part. Use "Try it" below to change the trunk size or the order.'),
    tour: [
      { say: L('細い幹に<b>2か所、らせんに巻きつけて</b>いる（右の窓が拡大。奥を通る所は幹にかくれる）。緑の線の所は、幹に<b>止まっている</b>（つかんでいる）。', 'The snake <b>coils around a thin trunk in 2 places</b> (close-up in the right window; parts behind the trunk are hidden). Green lines show where it is <b>still on the trunk</b> (gripping).'), layers: { stuck: true, tforce: false, move: false } },
      { say: L('<b>下でつかんだまま、まん中をのばす</b>と、頭が上へ。青い矢印が動いている所（幹の上をすべる）。', '<b>Gripping low, it stretches the middle</b>, and the head goes up. Blue arrows show the moving parts (sliding on the trunk).'), ring: 'mid', layers: { stuck: true, tforce: false, move: true } },
      { say: L('<b>上で巻いてつかんでから、下を放す</b>。いつも、どこかが止まっている。', '<b>It wraps and grips high, then lets go low</b>. Some part is always still.'), ring: 'front', layers: { stuck: true, tforce: false, move: true } },
      { say: L('<b>上でつかんだまま、まん中をちぢめる</b>と、下が引き上がる。これをくり返して登る。', '<b>Gripping high, it pulls the middle in</b>, and the lower part comes up. It climbs by doing this again and again.'), ring: 'rear', layers: { stuck: true, tforce: false, move: true } },
      { say: L('赤は重さ、緑は止まっている所が<b>支える摩擦</b>、黄色は<b>締めつけ</b>。落ちないのに要る力の4倍で締めつけている（推定。棒を登る本物のヘビは3倍より大きいことが多い）。', 'Red is weight, green is the <b>holding friction</b> at the still parts, yellow is the <b>squeeze</b>. It squeezes 4 times harder than needed to keep from falling (estimate; real snakes climbing poles often use more than 3 times).'), layers: { stuck: true, tforce: true, move: false } },
      { say: L('<b>試してみよう</b>: 下を先に放すと…／幹を太くすると…', '<b>Try it</b>: let go low first... / make the trunk thicker...'), act: [[L('下を先に放す', 'Let go low first'), () => UI.set('order', 'wrong')], [L('幹を 6 cm に', 'Trunk 6 cm'), () => UI.setSlider('dia', 6)], [L('もとにもどす', 'Put it back'), () => { UI.set('order', 'right'); UI.setSlider('dia', 2); }]], layers: { stuck: true, tforce: true, move: true } },
    ],
    make() { M.s = TREE.make(Object.assign({}, TP)); M.hist = []; M.speed = null; },
    reset() { M.make(); },
    baseScale: c => Math.min(c.h * 0.95 / 1.0, c.w * 0.9 / 0.4),
    snap(c) { c.z = midZ(M.s); },
    follow(c, k) { c.z += (Math.max(0.3, midZ(M.s)) - c.z) * k; },
    advance(dt, A) {
      const s = M.s, h = 0.004;
      let left = dt;
      while (left > 1e-9) { const d = Math.min(h, left); TREE.step(s, d); left -= d; M.hist.push([s.t, s.Z]); }
      while (M.hist.length && M.hist[0][0] < s.t - s.p.tau) M.hist.shift();
      if (M.hist.length > 10 && s.t > s.p.tau * 0.9) { const a = M.hist[0], b = M.hist[M.hist.length - 1]; M.speed = (b[1] - a[1]) / (b[0] - a[0]); }
      if (s.fell && s.fallT > 3) { M.reset(); A.snapCam(); A.note(L('もう一度、幹の下の方から', 'Again, from low on the trunk')); }
      if (s.Z > 2.6) { M.reset(); A.snapCam(); A.note(L('幹の上まで登った。下からもう一度', 'Reached the top! Again from the bottom')); }
    },
    draw(g, c, A) { DRAWT.scene(g, M.s, c, { layers: A.layers, ring: M.ring(A), time: A.time }); },
    ring(A) {
      const kind = A.ringKind;
      if (!kind) return null;
      const s = M.s, zone = kind === 'mid' ? 2 : kind === 'front' ? 3 : 1;
      let z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < TREE.N; i++) if (s.zone[i] === zone) { z0 = Math.min(z0, s.z[i]); z1 = Math.max(z1, s.z[i]); }
      return { z: (z0 + z1) / 2, rz: (z1 - z0) / 2 + 0.03, rx: s.p.D + 0.03 };
    },
    hit: (px, py, A) => DRAWT.hitTest(M.s, A.cam, px, py),
    tipPos: (i, A) => [A.cam.w / 2 + (A.cam.ox || 0), A.cam.h / 2 - (M.s.z[i] - A.cam.z) * A.cam.s],
    tip(i) {
      const s = M.s, z = s.zone[i], v = s.v[i];
      const name = [L('尾', 'Tail'), L('下のつかみ', 'Lower grip'), L('まん中（のび縮みする所）', 'Middle (stretches and shrinks)'), L('上のつかみ', 'Upper grip'), L('頭', 'Head')][z];
      const st = s.stuck[i] ? L('<span style="color:var(--acc)">幹に止まっている</span>。ここの静止摩擦が体を支える', '<span style="color:var(--acc)">Still on the trunk</span>. Static friction here holds the body up') :
        Math.abs(v) < 0.001 ? L('ほとんど動いていない', 'Hardly moving') : L(`幹の上を${v > 0 ? '上' : '下'}へすべっている（秒速 ${f1(Math.abs(v) * 100)} cm）`, `Sliding ${v > 0 ? 'up' : 'down'} the trunk (${f1(Math.abs(v) * 100)} cm/s)`);
      const sq = z === 1 ? s.sqR : z === 3 ? s.sqF : 0;
      return `<b>${name}</b><br>${st}${sq > 0.3 && s.sqN ? L('<br>巻きつけて締めつけている', '<br>Wrapped around and squeezing') : ''}`;
    },
    legend: C => [[C.stuck, L('止まっている', 'Still')], [C.move, L('動く向き', 'Moving direction')], [C.grav, L('重さ', 'Weight')], [C.hold, L('支える摩擦', 'Holding friction')], [C.squeeze, L('締めつけ', 'Squeeze')]],
    init() {
      UI.seg('order', v => { TP.order = v; M.s.p.order = v; });
      UI.seg('scales', v => { TP.scales = v; M.s.p.scales = v; });
      UI.seg('tilt', v => { TP.slope = +v; M.s.p.slope = +v; });
      UI.slider('dia', v => v + ' cm', v => { TP.D = v / 100; M.s.p.D = v / 100; TREE.layout(M.s); });
      UI.slider('safety', v => v.toFixed(1) + L(' 倍', '×'), v => { TP.safety = v; M.s.p.safety = v; });
    },
    refresh(A) {
      const r = $('ruler'), res = $('result'), s = M.s, p = s.p, W = p.mass * 9.81;
      if (s.fell) r.innerHTML = L(`<span class="bad">すべり落ちた！</span> ${!s.encircle ? '180° に届かない（この計算では、180° 以下は締めつけられないと決めている）' : 'どこも止まっていない時間があった'}`,
        `<span class="bad">It slid down!</span> ${!s.encircle ? 'The wrap is under 180° (this calculation assumes it cannot squeeze at 180° or less)' : 'There was a moment when no part was still'}`);
      else {
        const U = M.speed, sq = s.sqN * s.lg / W;
        r.innerHTML = L(`${U == null ? '' : `上へ 秒速 <span class="big">${f1(U * 100)}</span> cm（1分で ${f0(U * 6000)} cm）・`}締めつけ 体重の <span class="big">${f1(sq)}</span> 倍`,
          `${U == null ? '' : `Up at <span class="big">${f1(U * 100)}</span> cm/s (${f0(U * 6000)} cm per minute) · `}Squeeze <span class="big">${f1(sq)}</span> × body weight`);
      }
      const circ = Math.PI * (p.D + p.d) * 100;
      let t;
      if (!s.encircle) t = L(`幹のまわり ${f0(circ)} cm: 1か所で巻けるのは ${f0(s.wrapDeg)}° だけ。この計算では 180° 以下は締めつけられないと決めているので落ちる（推定）。本物のコーンスネークも 5.7 cm の立った柱は登れなかったが、180° より多く巻いていた。`,
        `Trunk girth ${f0(circ)} cm: each grip can wrap only ${f0(s.wrapDeg)}°. This calculation assumes no squeeze at 180° or less, so it falls (estimate). Real corn snakes also could not climb an upright 5.7 cm pole, though they wrapped more than 180°.`);
      else if (p.order === 'wrong') t = L('下を先に放すと、上をつかむまでのあいだ、どこも止まっていない。重さを支えられない。', 'If it lets go low first, no part is still until it grips high. Nothing holds its weight.');
      else if (s.lm < 0.15) t = L(`幹のまわり ${f0(circ)} cm: つかむのに 2×${f0(s.lg * 100)} cm 使うので、のび縮みできるのは ${f0(s.lm * 100)} cm だけ。ゆっくりしか登れない。`,
        `Trunk girth ${f0(circ)} cm: gripping uses 2×${f0(s.lg * 100)} cm, so only ${f0(s.lm * 100)} cm is left to stretch and shrink. It can only climb slowly.`);
      else if (p.safety < 1.3) t = L(`締めつけ ${p.safety.toFixed(1)} 倍: ぎりぎり。動きの途中で、支える摩擦が足りなくなる（この計算では 約1.1倍 より弱いと落ちる）。`,
        `Squeeze ${p.safety.toFixed(1)}×: just barely. Partway through a move, the holding friction runs short (in this calculation it falls below about 1.1×).`);
      else if (p.scales === 'flat') t = L('ウロコを立てない: 静止摩擦が 0.88 → 0.35（発泡スチロールの上の値）。同じ余裕で支えるのに、約2.5倍 強く締めつけている。', 'Scales not raised: static friction drops 0.88 → 0.35 (the value on foam plastic). To hold with the same margin, it squeezes about 2.5 times harder.');
      else t = L(`幹のまわり ${f0(circ)} cm。つかむ所 ${f0(s.lg * 100)} cm（${f0(s.wrapDeg)}° 巻く）×2、のび縮みする所 ${f0(s.lm * 100)} cm。`,
        `Trunk girth ${f0(circ)} cm. Grips ${f0(s.lg * 100)} cm (wrapping ${f0(s.wrapDeg)}°) ×2, stretching part ${f0(s.lm * 100)} cm.`);
      res.textContent = t; res.classList.toggle('bad', s.fell || !s.encircle || p.order === 'wrong');
      const ph = (p.order === 'wrong' ? PHASE_W : PHASE)[s.phase || 1];
      $('readout').innerHTML = L(`<span>いま <b>${ph}</b></span><span>支える摩擦 上限の <b>${f0(s.use * 100)}%</b></span><span>止まっている所 <b>${f0(s.stuckFrac * 100)}%</b></span><span>体長 <b>${p.L * 100} cm</b>・重さ <b>${p.mass * 1000} g</b></span>`,
        `<span>Now <b>${ph}</b></span><span>Holding friction <b>${f0(s.use * 100)}%</b> of its limit</span><span>Still parts <b>${f0(s.stuckFrac * 100)}%</b></span><span>Length <b>${p.L * 100} cm</b> · weight <b>${p.mass * 1000} g</b></span>`);
      if (A.step.tree === 0 && !s.fell) $('say').innerHTML = `${M.intro}<br><span style="color:var(--acc)">${L('いま', 'Now')}: ${ph}</span>`;
    },
  };
  MODES.tree = M;
})();
