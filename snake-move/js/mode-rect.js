// ヘビが進むしくみ — まっすぐ進む（straight。ボアの直進）。計算は js/rect.js。図もここで描く（横から見る）
'use strict';
window.MODES = window.MODES || {};
(function () {
  const $ = id => document.getElementById(id);
  const f2 = x => x.toFixed(2), f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);
  const C = { sky: '#14202c', ground: '#2a3326', line: '#55664c', body: '#3d6b4d', edge: '#a6e07a', bone: '#7fd4ff', skin: '#ffc95a', stuck: '#a6e07a',
    push: '#a6e07a', drag: '#ff8a7a', ink: '#e8f0f4', muted: '#a3b4bf' };
  const BODY_H = 0.05;      // 体の太さ（推定）
  const RP = { surf: 'cloth', duty: 0.42 };   // 止まる時間 42%（Newman & Jayne 2018 の平均）
  const MARK = 60;          // 印をつける区切り（まん中あたり）

  const M = {
    id: 'straight', s: null, hist: [], speed: null,
    layers: { skin: true, rforce: true, plot: true },
    intro: L('<b>つぎへ ▶</b> で順に見る。ボアのように、体をうねらせずにまっすぐ進む。体をタップすると、その所のおなかの皮の説明。', 'Press <b>Next ▶</b> to go step by step. Like a boa, the snake moves straight ahead without bending. Tap the body to learn about the belly skin there.'),
    tour: [
      { say: L('体はうねらない。<b>青い点（背骨）</b>は同じ速さで進む。ボアなど太いヘビの進み方。', 'The body does not bend. The <b>blue dots (backbone)</b> move at a steady speed. This is how thick snakes like boas move.'), layers: { skin: false, rforce: false, plot: false } },
      { say: L('下の黄色い線は<b>おなかの皮</b>（ウロコ）。皮だけが背骨に対して前後にずれ、<b>縮んだ所が地面に止まる</b>（緑）。', 'The yellow lines below are the <b>belly skin</b> (scales). Only the skin slides back and forth against the backbone, and <b>squeezed parts stay still on the ground</b> (green).'), layers: { skin: true, rforce: false, plot: false } },
      { say: L('縮む波は<b>頭から尾へ</b>流れる（体に3つ近く）。止まった皮を足場にして、筋肉が背骨を前へ引く。', 'The squeeze waves flow <b>from head to tail</b> (nearly 3 along the body). Using the still skin as a foothold, the muscles pull the backbone forward.'), ring: 'stuck', layers: { skin: true, rforce: false, plot: false } },
      { say: L('上のグラフ: 背骨の印（青）はなめらかに、皮の印（黄）は<b>止まっては進む</b>（1回 4.5 cm）。', 'Graph at the top: the backbone mark (blue) moves smoothly, while the skin mark (yellow) <b>stops, then moves</b> (4.5 cm each time).'), layers: { skin: true, rforce: false, plot: true } },
      { say: L('緑は止まった皮が受ける<b>前向きの摩擦</b>、赤は前へすべる皮の<b>引きずる摩擦</b>。止まっている所が足りると、すべらずに進める。', 'Green is the <b>forward friction</b> on the still skin; red is the <b>dragging friction</b> on skin sliding forward. With enough still skin, the snake moves without slipping.'), layers: { skin: true, rforce: true, plot: false } },
      { say: L('<b>試してみよう</b>: 皮が止まっている時間を短くすると…（この計算では歩幅と回数を変えないので、速くはならない）', '<b>Try it</b>: shorten the time the skin stays still... (this calculation keeps the step size and rate the same, so it does not get faster)'), act: [[L('止まる時間 35%', 'Still time 35%'), () => UI.setSlider('duty', 0.35)], [L('なめらかな板にも', 'Also a smooth board'), () => { UI.setSlider('duty', 0.4); UI.set('rsurf', 'board'); }], [L('もとにもどす', 'Put it back'), () => { UI.setSlider('duty', 0.42); UI.set('rsurf', 'cloth'); }]], layers: { skin: true, rforce: true, plot: true } },
    ],
    make() { M.s = RECT.make({ surf: RP.surf, duty: RP.duty }); M.hist = []; M.speed = null; M.plot = []; },
    reset() { M.make(); },
    baseScale: c => Math.min(c.w * 0.9 / M.s.p.L, c.h * 4),
    snap(c) { c.x = M.s.X + M.s.p.L / 2; c.y = 0; },
    follow(c, k) {
      const xc = M.s.X + M.s.p.L / 2;
      if (!c.fix) { c.x += (xc - c.x) * k; return; }
      // 地面に固定: ヘビがはしへ近づいたら、前へカメラを動かす（動かないあいだは地面が止まって見える）
      const vw = c.w / c.s;
      if (!c.pan && Math.abs(xc - c.x) > vw * 0.08) c.pan = [xc + vw * 0.06, 0];
      if (c.pan) { c.x += (c.pan[0] - c.x) * k * 0.5; if (Math.abs(c.pan[0] - c.x) < vw * 0.005) c.pan = null; }
    },
    advance(dt, A) {
      const s = M.s;
      let left = dt;
      while (left > 1e-9) {
        const d = Math.min(0.004, left); RECT.step(s, d); left -= d;
        M.hist.push([s.t, s.X]);
      }
      while (M.hist.length && M.hist[0][0] < s.t - s.p.tau) M.hist.shift();
      if (M.hist.length > 10 && s.t > s.p.tau) { const a = M.hist[0], b = M.hist[M.hist.length - 1]; M.speed = (b[1] - a[1]) / (b[0] - a[0]); }
      const ds = s.p.L / RECT.N;
      M.plot.push([s.t, s.X + (MARK + 0.5) * ds, s.X + (MARK + 0.5) * ds + s.u[MARK]]);
      while (M.plot.length && M.plot[0][0] < s.t - 8) M.plot.shift();
      if (s.X > 8) { M.reset(); A.snapCam(); }
    },
    gy: c => c.h * 0.7,
    sx: (c, x) => c.w / 2 + (x - c.x) * c.s,
    draw(g, c, A) {
      const s = M.s, p = s.p, N = RECT.N, ds = p.L / N, gy = M.gy(c), H = Math.max(14, BODY_H * c.s);
      g.fillStyle = C.sky; g.fillRect(0, 0, c.w, c.h);
      g.fillStyle = C.ground; g.fillRect(0, gy, c.w, c.h - gy);
      // 地面の断面（砂つぶ・小石。地面に止まっている目印。並びは場所から決まる）
      const x0 = c.x - c.w / 2 / c.s, x1 = c.x + c.w / 2 / c.s, cell = 0.01;
      const grains = [[], [], []], pebbles = [];
      for (let i = Math.floor(x0 / cell) - 1; i <= x1 / cell; i++)
        for (let j = 0; j * cell * c.s < c.h - gy; j++) {
          const n = 1 + Math.floor(DRAWG.hash(i, j, 31) * 3);
          for (let k = 0; k < n; k++) {
            const X = M.sx(c, (i + DRAWG.hash(i, j, 32 + k)) * cell), Y = gy + 3 + (j + DRAWG.hash(i, j, 36 + k)) * cell * c.s, a = DRAWG.hash(i, j, 40 + k);
            if (k === 0 && DRAWG.hash(i, j, 45) < 0.07) pebbles.push([X, Y, Math.max(2, (0.002 + 0.003 * a) * c.s), a]);
            else grains[Math.min(2, Math.floor(a * 3))].push(X, Y, Math.max(0.8, (0.0004 + 0.0008 * a) * c.s));
          }
        }
      grains.forEach((G, b) => {
        g.fillStyle = `rgba(200,180,140,${(0.18 + 0.1 * b).toFixed(2)})`; g.beginPath();
        for (let k = 0; k < G.length; k += 3) { g.moveTo(G[k] + G[k + 2], G[k + 1]); g.arc(G[k], G[k + 1], G[k + 2], 0, 6.2832); }
        g.fill();
      });
      g.strokeStyle = 'rgba(210,190,150,.4)'; g.lineWidth = 1; g.fillStyle = 'rgba(90,75,55,.6)'; g.beginPath();
      for (const [X, Y, r, a] of pebbles) { g.moveTo(X + r, Y); g.ellipse(X, Y, r, r * (0.55 + 0.3 * a), a * 3, 0, 6.2832); }
      g.fill(); g.stroke();
      // 地面の表面の小さなでこぼこ（砂つぶ。地面に止まっている）
      g.fillStyle = 'rgba(200,180,140,.55)'; g.beginPath();
      for (let i = Math.floor(x0 / 0.004); i * 0.004 <= x1; i++) {
        const a = DRAWG.hash(i, 0, 50); if (a < 0.45) continue;
        const X = M.sx(c, (i + DRAWG.hash(i, 0, 51)) * 0.004), r = Math.max(0.8, (0.0003 + 0.0007 * a) * c.s);
        g.moveTo(X + r, gy); g.arc(X, gy, r, Math.PI, 2 * Math.PI);
      }
      g.fill();
      // 目もり（1 cm ごと、10 cm ごとに数字。地面の下のふち）
      g.strokeStyle = C.line; g.lineWidth = 1; g.fillStyle = C.muted; g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
      const ry = Math.min(c.h - 40, gy + 26), lab = 0.1 * c.s >= 48 ? 10 : 0.2 * c.s >= 48 ? 20 : 50;   // 数字は 48 px 以上あける
      g.fillStyle = 'rgba(11,20,28,.6)'; g.fillRect(0, ry, c.w, 18); g.fillStyle = C.muted;
      for (let x = Math.floor(x0 / 0.01) * 0.01; x <= x1; x += 0.01) {
        const X = M.sx(c, x), cm = Math.round(x * 100), big = cm % 10 === 0;
        g.beginPath(); g.moveTo(X, ry); g.lineTo(X, ry + (big ? 6 : 3)); g.stroke();
        if (big && cm % lab === 0) g.fillText(`${cm} cm`, X, ry + 15);
      }
      // 体（背骨の棒）
      const xa = M.sx(c, s.X), xb = M.sx(c, s.X + p.L);
      g.fillStyle = C.body; g.strokeStyle = C.edge; g.lineWidth = 1.5;
      const xt = xa + (xb - xa) * 0.12;   // 尾は体長の 12% で細くなる
      g.beginPath(); g.moveTo(xa, gy - 2); g.quadraticCurveTo(xa + (xt - xa) * 0.5, gy - H * 0.9, xt, gy - H); g.lineTo(xb - H * 0.6, gy - H); g.quadraticCurveTo(xb + H * 0.4, gy - H * 0.55, xb - H * 0.2, gy - 1); g.lineTo(xa, gy - 1); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#0b141c'; g.beginPath(); g.arc(xb - H * 0.35, gy - H * 0.7, Math.max(1.5, H * 0.09), 0, 7); g.fill();
      // 背骨の点（2 cm ごと。体と同じ速さ）
      g.fillStyle = C.bone;
      for (let k = 1; k < p.L / 0.02; k++) { const X = M.sx(c, s.X + k * 0.02); g.beginPath(); g.arc(X, gy - H * 0.62, 2.2, 0, 7); g.fill(); }
      const X0 = M.sx(c, s.X + (MARK + 0.5) * ds);
      g.fillStyle = C.bone; g.beginPath(); g.moveTo(X0, gy - H - 2); g.lineTo(X0 - 5, gy - H - 10); g.lineTo(X0 + 5, gy - H - 10); g.closePath(); g.fill();
      // おなかの皮（区切りごとの目もり。間かくが詰まった所 = 縮んだ所）
      if (A.layers.skin) {
        for (let i = 0; i < N; i += 2) {
          const X = M.sx(c, s.X + (i + 0.5) * ds + s.u[i]);
          g.strokeStyle = s.stuck[i] ? C.stuck : C.skin; g.lineWidth = s.stuck[i] ? 2.4 : 1.4;
          g.beginPath(); g.moveTo(X, gy - 1); g.lineTo(X, gy - Math.min(8, H * 0.35)); g.stroke();
        }
        const Xm = M.sx(c, s.X + (MARK + 0.5) * ds + s.u[MARK]);
        g.fillStyle = C.skin; g.beginPath(); g.moveTo(Xm, gy + 2); g.lineTo(Xm - 5, gy + 10); g.lineTo(Xm + 5, gy + 10); g.closePath(); g.fill();
      }
      // 摩擦（地面から皮へ）
      if (A.layers.rforce) {
        const w0 = p.mass * 9.81 / p.L, k = 0.12 * c.s / w0;
        for (let i = 3; i < N; i += 8) {
          const X = M.sx(c, s.X + (i + 0.5) * ds + s.u[i]), len = s.f[i] * k;
          if (Math.abs(len) < 3) continue;
          DRAWG.arrow(g, X, gy + 16, X + len, gy + 16, len > 0 ? C.push : C.drag, 2.2);
        }
      }
      // 印の位置と時間のグラフ（Lissmann 1950 の図3と同じ見方）
      if (A.layers.plot && M.plot.length > 2) {
        const py = c.w < 520 ? 96 : 52, pw = Math.min(260, c.w - 120), ph = Math.min(90, gy - H - py + 12), px = c.w - pw - 10;
        if (ph > 30) {
          g.fillStyle = 'rgba(11,20,28,.85)'; g.fillRect(px, py, pw, ph);
          const t1 = s.t, t0 = t1 - 8, xs = M.plot.map(q => q[1]).concat(M.plot.map(q => q[2]));
          const lo = Math.min(...xs), hi = Math.max(...xs, lo + 0.01);
          for (const [col, j] of [[C.bone, 1], [C.skin, 2]]) {
            g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
            M.plot.forEach((q, n) => { const X = px + (q[0] - t0) / 8 * pw, Y = py + ph - 6 - (q[j] - lo) / (hi - lo) * (ph - 12); n ? g.lineTo(X, Y) : g.moveTo(X, Y); });
            g.stroke();
          }
          g.fillStyle = C.muted; g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left';
          g.fillText(L('進んだ距離 ↑　時間 →（8 秒）', 'Distance ↑  Time → (8 s)'), px + 4, py + 12);
        }
      }
      const rg = M.ring(A); if (rg) DRAWG.ring(g, rg, A.time);
    },
    ring(A) {
      if (A.ringKind !== 'stuck') return null;
      const s = M.s, c = A.cam, ds = s.p.L / RECT.N;
      let a = -1, b = -1;
      for (let i = RECT.N - 1; i >= 0; i--) { if (s.stuck[i] && b < 0) b = i; if (b >= 0 && s.stuck[i]) a = i; if (b >= 0 && !s.stuck[i]) break; }
      if (b < 0) return null;
      const x = M.sx(c, s.X + ((a + b) / 2 + 0.5) * ds);
      return { x, y: M.gy(c) - 4, r: Math.max(20, (b - a) * ds * c.s / 2 + 8) };
    },
    hit(px, py, A) {
      const s = M.s, c = A.cam, ds = s.p.L / RECT.N, gy = M.gy(c);
      if (py < gy - 70 || py > gy + 30) return -1;
      const x = c.x + (px - c.w / 2) / c.s - s.X, i = Math.round(x / ds - 0.5);
      return i >= 0 && i < RECT.N ? i : -1;
    },
    tipPos: (i, A) => [M.sx(A.cam, M.s.X + (i + 0.5) * M.s.p.L / RECT.N), M.gy(A.cam)],
    tip(i) {
      const s = M.s;
      return L(`<b>おなかの皮</b>（${i < RECT.N * 0.2 ? '尾' : i > RECT.N * 0.8 ? '頭' : 'まん中'}のあたり）<br>${s.stuck[i] ? '<span style="color:var(--acc)">地面に止まっている</span>（縮んでいる）。ここの摩擦が前へ押す' : `地面の上を${s.v[i] > 0 ? '前' : '後ろ'}へすべっている（秒速 ${f1(Math.abs(s.v[i]) * 100)} cm）`}<br>背骨は 秒速 ${f2(s.V * 100)} cm でいつも同じ`,
        `<b>Belly skin</b> (near the ${i < RECT.N * 0.2 ? 'tail' : i > RECT.N * 0.8 ? 'head' : 'middle'})<br>${s.stuck[i] ? '<span style="color:var(--acc)">Still on the ground</span> (squeezed). Friction here pushes forward' : `Sliding ${s.v[i] > 0 ? 'forward' : 'backward'} over the ground (${f1(Math.abs(s.v[i]) * 100)} cm/s)`}<br>The backbone always moves at ${f2(s.V * 100)} cm/s`);
    },
    legend: () => [[C.bone, L('背骨', 'Backbone')], [C.skin, L('おなかの皮', 'Belly skin')], [C.stuck, L('止まっている皮', 'Still skin')], [C.drag, L('引きずる摩擦', 'Drag friction')]],
    init() {
      UI.seg('rsurf', v => { RP.surf = v; M.s.p.surf = v; });
      UI.slider('duty', v => Math.round(v * 100) + '%', v => { RP.duty = v; M.s.p.duty = v; });
    },
    refresh(A) {
      const r = $('ruler'), res = $('result'), s = M.s, p = s.p, U = M.speed;
      const sf = GROUND.SURF[p.surf], need = sf.mf / (sf.mf + sf.mb);
      const slipping = U != null && U < s.c * 0.995;
      r.innerHTML = U == null ? '' : L(`進む速さ 秒速 <span class="big">${f2(U * 100)}</span> cm（1分で ${f0(U * 6000)} cm）${slipping ? `・<span class="bad">皮がすべって ${f0((1 - U / s.c) * 100)}% 遅い</span>` : '・皮はすべらない'}`,
        `Speed <span class="big">${f2(U * 100)}</span> cm/s (${f0(U * 6000)} cm per minute)${slipping ? ` · <span class="bad">skin slips, ${f0((1 - U / s.c) * 100)}% slower</span>` : ' · skin does not slip'}`);
      res.textContent = slipping
        ? L(`止まる時間 ${f0(p.duty * 100)}%: 前へすべる皮の摩擦（${sf.mf}×${f0((1 - p.duty) * 100)}%）が、止まった皮の摩擦の上限（${sf.mb}×${f0(p.duty * 100)}%）より大きい。止まるはずの皮が後ろへすべる（Lissmann は、とてもなめらかな所で後ろへすべると書いている）。`,
            `Still time ${f0(p.duty * 100)}%: the friction on skin sliding forward (${sf.mf}×${f0((1 - p.duty) * 100)}%) is bigger than the most the still skin can hold (${sf.mb}×${f0(p.duty * 100)}%). Skin that should stay still slides backward (Lissmann wrote that it slides back on very smooth surfaces).`)
        : L(`止まる時間 ${f0(p.duty * 100)}%。この地面では ${f0(need * 100)}% 以上止まっていれば、すべらない。`,
            `Still time ${f0(p.duty * 100)}%. On this ground, it does not slip if the skin is still at least ${f0(need * 100)}% of the time.`);
      res.classList.toggle('bad', slipping);
      $('readout').innerHTML = L(`<span>1回の波で皮が進む <b>${p.step * 100} cm</b></span><span>体に波 <b>${p.waves}</b> つ・1回 <b>${p.tau} 秒</b></span><span>止まっている皮 <b>${f0(s.stuckFrac * 100)}%</b></span><span>体長 <b>${p.L * 100} cm</b></span>`,
        `<span>Skin step per wave <b>${p.step * 100} cm</b></span><span>Waves on body <b>${p.waves}</b> · one wave <b>${p.tau} s</b></span><span>Still skin <b>${f0(s.stuckFrac * 100)}%</b></span><span>Length <b>${p.L * 100} cm</b></span>`);
    },
  };
  MODES.straight = M;
})();
