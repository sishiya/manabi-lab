// ヘビが進むしくみ — 木を登る（tree）。計算は js/tree.js、図は js/draw-tree.js
'use strict';
window.MODES = window.MODES || {};
(function () {
  const $ = id => document.getElementById(id);
  const f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);
  const PHASE = ['', '① 下でつかんで、まん中をのばす（頭が上へ）', '② 上を巻いてつかむ', '③ 下をゆるめて、ほどく', '④ 上でつかんで、まん中をちぢめる（下が上へ）', '⑤ 下を巻いてつかむ', '⑥ 上をゆるめて、ほどく'];
  const PHASE_W = ['', '① 下でつかんで、まん中をのばす（頭が上へ）', '② 下を先にゆるめて、ほどく', '③ 上を巻いてつかむ', '④ 上でつかんで、まん中をちぢめる（下が上へ）', '⑤ 下を巻いてつかむ', '⑥ 上をゆるめて、ほどく'];
  const TP = { D: 0.04, slope: 90, safety: 4, scales: 'dig', order: 'right' };
  const midZ = s => (s.z[0] + s.z[TREE.N - 1]) / 2;   // 尾の先と頭のまん中

  const M = {
    id: 'tree', s: null, hist: [], speed: null,
    layers: { stuck: true, tforce: true, move: true },
    intro: '<b>つぎへ ▶</b> で順に見る。体をタップすると、そこの説明。下の「試す」で幹の太さや順番を変えられる。',
    tour: [
      { say: '幹に<b>2か所、体を巻きつけて</b>いる。緑の線の所は、幹に<b>止まっている</b>（つかんでいる）。', layers: { stuck: true, tforce: false, move: false } },
      { say: '<b>下でつかんだまま、まん中をのばす</b>と、頭が上へ。青い矢印が動いている所（幹の上をすべる）。', ring: 'mid', layers: { stuck: true, tforce: false, move: true } },
      { say: '<b>上で巻いてつかんでから、下を放す</b>。いつも、どこかが止まっている。', ring: 'front', layers: { stuck: true, tforce: false, move: true } },
      { say: '<b>上でつかんだまま、まん中をちぢめる</b>と、下が引き上がる。これをくり返して登る。', ring: 'rear', layers: { stuck: true, tforce: false, move: true } },
      { say: '赤は重さ、緑は止まっている所が<b>支える摩擦</b>、黄色は<b>締めつけ</b>。落ちないのに要る力の4倍くらい締めつけている（本物のヘビの測定から）。', layers: { stuck: true, tforce: true, move: false } },
      { say: '<b>試してみよう</b>: 下を先に放すと…／幹を太くすると…', act: [['下を先に放す', () => UI.set('order', 'wrong')], ['幹を 6 cm に', () => UI.setSlider('dia', 6)], ['もとにもどす', () => { UI.set('order', 'right'); UI.setSlider('dia', 4); }]], layers: { stuck: true, tforce: true, move: true } },
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
      if (s.fell && s.fallT > 3) { M.reset(); A.snapCam(); A.note('もう一度、幹の下の方から'); }
      if (s.Z > 2.6) { M.reset(); A.snapCam(); A.note('幹の上まで登った。下からもう一度'); }
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
    tipPos: (i, A) => [A.cam.w / 2, A.cam.h / 2 - (M.s.z[i] - A.cam.z) * A.cam.s],
    tip(i) {
      const s = M.s, z = s.zone[i], v = s.v[i];
      const name = ['尾', '下のつかみ', 'まん中（のび縮みする所）', '上のつかみ', '頭'][z];
      const st = s.stuck[i] ? '<span style="color:var(--acc)">幹に止まっている</span>。ここの静止摩擦が体を支える' :
        Math.abs(v) < 0.001 ? 'ほとんど動いていない' : `幹の上を${v > 0 ? '上' : '下'}へすべっている（秒速 ${f1(Math.abs(v) * 100)} cm）`;
      const sq = z === 1 ? s.sqR : z === 3 ? s.sqF : 0;
      return `<b>${name}</b><br>${st}${sq > 0.3 && s.sqN ? '<br>巻きつけて締めつけている' : ''}`;
    },
    legend: C => [[C.stuck, '止まっている'], [C.move, '動く向き'], [C.grav, '重さ'], [C.hold, '支える摩擦'], [C.squeeze, '締めつけ']],
    init() {
      UI.seg('order', v => { TP.order = v; M.s.p.order = v; });
      UI.seg('scales', v => { TP.scales = v; M.s.p.scales = v; });
      UI.seg('tilt', v => { TP.slope = +v; M.s.p.slope = +v; });
      UI.slider('dia', v => v + ' cm', v => { TP.D = v / 100; M.s.p.D = v / 100; TREE.layout(M.s); });
      UI.slider('safety', v => v.toFixed(1) + ' 倍', v => { TP.safety = v; M.s.p.safety = v; });
    },
    refresh(A) {
      const r = $('ruler'), res = $('result'), s = M.s, p = s.p, W = p.mass * 9.81;
      if (s.fell) r.innerHTML = `<span class="bad">すべり落ちた！</span> ${!s.encircle ? '180° より多く巻けないので、締めつけられない' : 'どこも止まっていない時間があった'}`;
      else {
        const U = M.speed, sq = s.sqN * s.lg / W;
        r.innerHTML = `${U == null ? '' : `上へ 秒速 <span class="big">${f1(U * 100)}</span> cm（1分で ${f0(U * 6000)} cm）・`}締めつけ 体重の <span class="big">${f1(sq)}</span> 倍`;
      }
      const circ = Math.PI * (p.D + p.d) * 100;
      let t;
      if (!s.encircle) t = `幹のまわり ${f0(circ)} cm: 1か所で巻けるのは ${f0(s.wrapDeg)}° だけ。180° より多く巻けないと強く締めつけられない（本物のコーンスネークも 5.7 cm 以上の立った柱は登れなかった）。`;
      else if (p.order === 'wrong') t = '下を先に放すと、上をつかむまでのあいだ、どこも止まっていない。重さを支えられない。';
      else if (s.lm < 0.15) t = `幹のまわり ${f0(circ)} cm: つかむのに 2×${f0(s.lg * 100)} cm 使うので、のび縮みできるのは ${f0(s.lm * 100)} cm だけ。ゆっくりしか登れない。`;
      else if (p.safety < 1.3) t = `締めつけ ${p.safety.toFixed(1)} 倍: ぎりぎり。動きの途中で、支える摩擦が足りなくなる（この計算では 約1.1倍 より弱いと落ちる）。`;
      else if (p.scales === 'flat') t = 'ウロコを立てない: 静止摩擦が 0.88 → 0.35。同じ余裕で支えるのに、約2.5倍 強く締めつけている。';
      else t = `幹のまわり ${f0(circ)} cm。つかむ所 ${f0(s.lg * 100)} cm（${f0(s.wrapDeg)}° 巻く）×2、のび縮みする所 ${f0(s.lm * 100)} cm。`;
      res.textContent = t; res.classList.toggle('bad', s.fell || !s.encircle || p.order === 'wrong');
      const ph = (p.order === 'wrong' ? PHASE_W : PHASE)[s.phase || 1];
      $('readout').innerHTML = `<span>いま <b>${ph}</b></span><span>支える摩擦 上限の <b>${f0(s.use * 100)}%</b></span><span>止まっている所 <b>${f0(s.stuckFrac * 100)}%</b></span><span>体長 <b>${p.L * 100} cm</b>・重さ <b>${p.mass * 1000} g</b></span>`;
      if (A.step.tree === 0 && !s.fell) $('say').innerHTML = `${M.intro}<br><span style="color:var(--acc)">いま: ${ph}</span>`;
    },
  };
  MODES.tree = M;
})();
