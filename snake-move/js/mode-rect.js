// ヘビが進むしくみ — まっすぐ進む（straight。ボアの直進）。計算は js/rect.js。図もここで描く（横から見る）
'use strict';
window.MODES = window.MODES || {};
(function () {
  const $ = id => document.getElementById(id);
  const f2 = x => x.toFixed(2), f1 = x => x.toFixed(1), f0 = x => x.toFixed(0);
  const C = { sky: '#14202c', ground: '#2a3326', line: '#55664c', body: '#3d6b4d', edge: '#a6e07a', bone: '#7fd4ff', skin: '#ffc95a', stuck: '#a6e07a',
    push: '#a6e07a', drag: '#ff8a7a', ink: '#e8f0f4', muted: '#a3b4bf' };
  const BODY_H = 0.05;      // 体の太さ（推定）
  const RP = { surf: 'cloth', duty: 0.5 };
  const MARK = 60;          // 印をつける区切り（まん中あたり）

  const M = {
    id: 'straight', s: null, hist: [], speed: null,
    layers: { skin: true, rforce: true, plot: true },
    intro: '<b>つぎへ ▶</b> で順に見る。ボアのように、体をうねらせずにまっすぐ進む。体をタップすると、その所のおなかの皮の説明。',
    tour: [
      { say: '体はうねらない。<b>青い点（背骨）</b>は同じ速さで進む。ボアなど太いヘビの進み方。', layers: { skin: false, rforce: false, plot: false } },
      { say: '下の黄色い線は<b>おなかの皮</b>（ウロコ）。皮だけが背骨に対して前後にずれ、<b>縮んだ所が地面に止まる</b>（緑）。', layers: { skin: true, rforce: false, plot: false } },
      { say: '縮む波は<b>頭から尾へ</b>流れる（体に2つ）。止まった皮を足場にして、筋肉が背骨を前へ引く。', ring: 'stuck', layers: { skin: true, rforce: false, plot: false } },
      { say: '上のグラフ: 背骨の印（青）はなめらかに、皮の印（黄）は<b>止まっては進む</b>（1回 4.5 cm）。', layers: { skin: true, rforce: false, plot: true } },
      { say: '緑は止まった皮が受ける<b>前向きの摩擦</b>、赤は前へすべる皮の<b>引きずる摩擦</b>。止まっている所が足りると、すべらずに進める。', layers: { skin: true, rforce: true, plot: false } },
      { say: '<b>試してみよう</b>: 皮が止まっている時間を短くすると（速く進もうとすると）…', act: [['止まる時間 35%', () => UI.setSlider('duty', 0.35)], ['なめらかな板にも', () => { UI.setSlider('duty', 0.4); UI.set('rsurf', 'board'); }], ['もとにもどす', () => { UI.setSlider('duty', 0.5); UI.set('rsurf', 'cloth'); }]], layers: { skin: true, rforce: true, plot: true } },
    ],
    make() { M.s = RECT.make({ surf: RP.surf, duty: RP.duty }); M.hist = []; M.speed = null; M.plot = []; },
    reset() { M.make(); },
    baseScale: c => Math.min(c.w * 0.9 / M.s.p.L, c.h * 4),
    snap(c) { c.x = M.s.X + M.s.p.L / 2; c.y = 0; },
    follow(c, k) { c.x += (M.s.X + M.s.p.L / 2 - c.x) * k; },
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
      // 地面の目もり（地面に止まっている目印。1 cm ごと）
      g.strokeStyle = C.line; g.lineWidth = 1;
      const x0 = c.x - c.w / 2 / c.s, x1 = c.x + c.w / 2 / c.s;
      for (let x = Math.floor(x0 / 0.01) * 0.01; x <= x1; x += 0.01) { const X = M.sx(c, x), big = Math.abs(Math.round(x * 100) % 10) === 0; g.beginPath(); g.moveTo(X, gy); g.lineTo(X, gy + (big ? 9 : 4)); g.stroke(); }
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
          const X = M.sx(c, s.X + (i + 0.5) * ds + s.u[i]), L = s.f[i] * k;
          if (Math.abs(L) < 3) continue;
          DRAWG.arrow(g, X, gy + 16, X + L, gy + 16, L > 0 ? C.push : C.drag, 2.2);
        }
      }
      // 印の位置と時間のグラフ（Lissmann 1950 の図3と同じ見方）
      if (A.layers.plot && M.plot.length > 2) {
        const pw = Math.min(260, c.w - 120), ph = Math.min(90, gy - H - 40), px = c.w - pw - 10, py = 52;
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
          g.fillText('進んだ距離 ↑　時間 →（8 秒）', px + 4, py + 12);
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
      return `<b>おなかの皮</b>（${i < RECT.N * 0.2 ? '尾' : i > RECT.N * 0.8 ? '頭' : 'まん中'}のあたり）<br>${s.stuck[i] ? '<span style="color:var(--acc)">地面に止まっている</span>（縮んでいる）。ここの摩擦が前へ押す' : `地面の上を${s.v[i] > 0 ? '前' : '後ろ'}へすべっている（秒速 ${f1(Math.abs(s.v[i]) * 100)} cm）`}<br>背骨は 秒速 ${f2(s.V * 100)} cm でいつも同じ`;
    },
    legend: () => [[C.bone, '背骨'], [C.skin, 'おなかの皮'], [C.stuck, '止まっている皮'], [C.drag, '引きずる摩擦']],
    init() {
      UI.seg('rsurf', v => { RP.surf = v; M.s.p.surf = v; });
      UI.slider('duty', v => Math.round(v * 100) + '%', v => { RP.duty = v; M.s.p.duty = v; });
    },
    refresh(A) {
      const r = $('ruler'), res = $('result'), s = M.s, p = s.p, U = M.speed;
      const sf = GROUND.SURF[p.surf], need = sf.mf / (sf.mf + sf.mb);
      const slipping = U != null && U < s.c * 0.995;
      r.innerHTML = U == null ? '' : `進む速さ 秒速 <span class="big">${f2(U * 100)}</span> cm（1分で ${f0(U * 6000)} cm）${slipping ? `・<span class="bad">皮がすべって ${f0((1 - U / s.c) * 100)}% 遅い</span>` : '・皮はすべらない'}`;
      res.textContent = slipping
        ? `止まる時間 ${f0(p.duty * 100)}%: 前へすべる皮の摩擦（${sf.mf}×${f0((1 - p.duty) * 100)}%）が、止まった皮の摩擦の上限（${sf.mb}×${f0(p.duty * 100)}%）より大きい。止まるはずの皮が後ろへすべる（Lissmann は、とてもなめらかな所で後ろへすべると書いている）。`
        : `止まる時間 ${f0(p.duty * 100)}%。この地面では ${f0(need * 100)}% 以上止まっていれば、すべらない。`;
      res.classList.toggle('bad', slipping);
      $('readout').innerHTML = `<span>1回の波で皮が進む <b>${p.step * 100} cm</b></span><span>体に波 <b>${p.waves}</b> つ・1回 <b>${p.tau} 秒</b></span><span>止まっている皮 <b>${f0(s.stuckFrac * 100)}%</b></span><span>体長 <b>${p.L * 100} cm</b></span>`;
    },
  };
  MODES.straight = M;
})();
